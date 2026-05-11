import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..');
const configPath = resolve(repoRoot, 'staticwebapp.config.json');

const rawConfig = readFileSync(configPath, 'utf8');

interface Registration {
	clientIdSettingName?: string;
	clientSecretSettingName?: string;
}

interface IdentityProvider {
	registration?: Registration;
}

interface SwaRoute {
	route: string;
	rewrite?: string;
	redirect?: string;
	allowedRoles?: string[];
}

interface SwaResponseOverride {
	rewrite?: string;
	redirect?: string;
	statusCode?: number;
}

interface SwaConfig {
	platform?: { apiRuntime?: string };
	auth?: {
		rolesSource?: string;
		identityProviders?: Record<string, IdentityProvider>;
	};
	routes?: SwaRoute[];
	responseOverrides?: Record<string, SwaResponseOverride>;
	globalHeaders?: Record<string, string>;
}

const config: SwaConfig = JSON.parse(rawConfig);

function collectAuthLoginPaths(cfg: SwaConfig): string[] {
	const paths: string[] = [];
	const re = /\/\.auth\/login\/([a-z0-9]+)/gi;

	const scan = (s: string | undefined): void => {
		if (!s) return;
		for (const match of s.matchAll(re)) paths.push(match[1].toLowerCase());
	};

	for (const route of cfg.routes ?? []) {
		scan(route.route);
		scan(route.rewrite);
		scan(route.redirect);
	}
	for (const override of Object.values(cfg.responseOverrides ?? {})) {
		scan(override.rewrite);
		scan(override.redirect);
	}
	return Array.from(new Set(paths));
}

describe('staticwebapp.config.json — structural invariants', () => {
	it('is syntactically valid JSON', () => {
		expect(() => JSON.parse(rawConfig)).not.toThrow();
	});

	it('declares the node:20 API runtime', () => {
		expect(config.platform?.apiRuntime).toBe('node:20');
	});
});

describe('staticwebapp.config.json — auth identity providers (SWA Free)', () => {
	const referencedProviders = collectAuthLoginPaths(config);
	const FREE_TIER_PRECONFIGURED = new Set(['github', 'aad']);

	it('references at least one /.auth/login/{provider} path (sanity check)', () => {
		expect(referencedProviders.length).toBeGreaterThan(0);
	});

	it('only references pre-configured providers (github, aad) — required for Free tier', () => {
		// On Free tier only GitHub and Microsoft Entra ID are pre-configured
		// by Azure with no setup. Other providers (Google, Apple, Facebook,
		// Twitter) require Standard tier + custom registration. Referencing
		// any of those without that registration would 404 on login.
		for (const provider of referencedProviders) {
			expect(
				FREE_TIER_PRECONFIGURED.has(provider),
				`provider '${provider}' is not pre-configured on SWA Free — it would require Standard tier`
			).toBe(true);
		}
	});

	it('does NOT declare auth.rolesSource — Standard-tier feature', () => {
		// Function-based role assignment (rolesSource) requires Standard
		// plan. On Free we resolve roles in the frontend by calling
		// GET /api/get-roles after /.auth/me — see src/services/api.ts
		// `getPrincipalWithRoles`. Declaring rolesSource here would either
		// be silently ignored (worst: confuse readers) or break login.
		expect(
			config.auth?.rolesSource,
			'rolesSource is a SWA Standard feature; remove to stay on Free'
		).toBeUndefined();
	});

	it('does NOT declare auth.identityProviders — Standard-tier feature for custom registration', () => {
		// Custom identity provider registration (your own OAuth app with
		// clientIdSettingName / clientSecretSettingName) requires Standard
		// plan. On Free we use Microsoft's shared pre-configured OAuth app,
		// which works zero-config — no `auth.identityProviders` block needed.
		expect(
			config.auth?.identityProviders,
			'identityProviders custom registration is Standard-only; pre-configured providers work without it'
		).toBeUndefined();
	});
});

describe('staticwebapp.config.json — route role gates', () => {
	const routes = config.routes ?? [];
	const findRoute = (path: string): SwaRoute | undefined => routes.find((r) => r.route === path);

	it.each([
		['/profile/*', 'authenticated'],
		['/welcome', 'authenticated'],
		['/find', 'authenticated'],
		// On SWA Free the custom 'admin' role can't be assigned (rolesSource
		// is Standard-only). Admin routes are gated on 'authenticated' at the
		// SWA layer; the actual admin check runs server-side in each handler
		// via isAdminFor() (see api/src/lib/roles.ts).
		['/admin/*', 'authenticated'],
		['/api/profile-save', 'authenticated'],
		['/api/profile-get', 'authenticated'],
		['/api/profiles', 'authenticated'],
		['/api/account-delete', 'authenticated'],
		['/api/admin-users', 'authenticated'],
		['/api/admins-list', 'authenticated'],
		['/api/admins-grant', 'authenticated'],
		['/api/admins-revoke', 'authenticated'],
	])('gates %s on role %s', (path, role) => {
		const route = findRoute(path);
		expect(route, `route ${path} must exist`).toBeDefined();
		expect(route?.allowedRoles, `route ${path} must have allowedRoles`).toContain(role);
	});

	it.each([
		'/admin/*',
		'/api/admin-users',
		'/api/admins-list',
		'/api/admins-grant',
		'/api/admins-revoke',
	])('does NOT declare a SWA-level admin role on %s (handler enforces)', (path) => {
		// On SWA Free the custom 'admin' role is unreachable from rolesSource.
		// If any of these routes carry allowedRoles: ['admin'] the SWA gate
		// would 401 every signed-in user including the actual admin. Handler
		// enforcement is the source of truth — verifying no leftover gate.
		const route = findRoute(path);
		expect(
			route?.allowedRoles,
			`route ${path} must not gate on 'admin' (Free tier can't grant it)`
		).not.toContain('admin');
	});

	it('places /api/* catch-all after all specific /api/ routes', () => {
		const catchAllIndex = routes.findIndex((r) => r.route === '/api/*');
		expect(catchAllIndex, '/api/* catch-all must exist').toBeGreaterThanOrEqual(0);

		const specificApiRoutes = routes
			.map((r, i) => ({ route: r.route, index: i }))
			.filter((x) => x.route.startsWith('/api/') && x.route !== '/api/*');

		for (const r of specificApiRoutes) {
			expect(
				r.index,
				`${r.route} (index ${r.index}) must come before /api/* (index ${catchAllIndex})`
			).toBeLessThan(catchAllIndex);
		}
	});

	it('redirects 401 responses to the login flow', () => {
		const override = config.responseOverrides?.['401'];
		expect(override, '401 response override must exist').toBeDefined();
		expect(override?.statusCode).toBe(302);
		expect(override?.redirect).toMatch(/\/\.auth\/login\//);
	});
});
