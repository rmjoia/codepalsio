import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..');
const configPath = resolve(repoRoot, 'staticwebapp.config.json');
const setupGuidePath = resolve(repoRoot, 'AZURE_SETUP_GUIDE.md');

const rawConfig = readFileSync(configPath, 'utf8');
const setupGuide = readFileSync(setupGuidePath, 'utf8');

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

describe('staticwebapp.config.json — auth identity providers', () => {
	const referencedProviders = collectAuthLoginPaths(config);

	it('references at least one /.auth/login/{provider} path (sanity check)', () => {
		expect(referencedProviders.length).toBeGreaterThan(0);
	});

	it('declares an auth block whenever /.auth/login/{provider} is referenced', () => {
		// Regression guard: PR #32 added admin role bootstrap and removed the
		// implicit GitHub provider auto-discovery by introducing an `auth` block
		// without re-declaring `identityProviders`. This test fails if anyone
		// references /.auth/login/X without an auth block backing it.
		expect(config.auth, 'auth block is required when /.auth/login/{provider} is referenced').toBeDefined();
	});

	it.each(collectAuthLoginPaths(config))(
		'declares identityProviders.%s.registration with client id and secret setting names',
		(provider) => {
			// Root cause of PR #36: SWA stops auto-discovering GITHUB_CLIENT_ID/SECRET
			// from app settings the moment any `auth` block exists. Every provider
			// referenced via /.auth/login/{provider} must be explicitly registered.
			const idp = config.auth?.identityProviders?.[provider];
			expect(idp, `identityProviders.${provider} must exist`).toBeDefined();
			expect(idp?.registration?.clientIdSettingName, `clientIdSettingName must be set for ${provider}`).toBeTruthy();
			expect(idp?.registration?.clientSecretSettingName, `clientSecretSettingName must be set for ${provider}`).toBeTruthy();
		},
	);

	it('documents every clientIdSettingName / clientSecretSettingName in AZURE_SETUP_GUIDE.md', () => {
		// Catches docs/config drift: if the config points at GITHUB_CLIENT_ID
		// but the setup guide tells operators to set FOO_CLIENT_ID, deploys
		// will silently 404 on auth — exactly the bug PR #36 fixes.
		const idps = config.auth?.identityProviders ?? {};
		const settingNames: string[] = [];
		for (const idp of Object.values(idps)) {
			if (idp.registration?.clientIdSettingName) settingNames.push(idp.registration.clientIdSettingName);
			if (idp.registration?.clientSecretSettingName) settingNames.push(idp.registration.clientSecretSettingName);
		}
		expect(settingNames.length).toBeGreaterThan(0);
		for (const name of settingNames) {
			expect(setupGuide, `${name} should be documented in AZURE_SETUP_GUIDE.md`).toContain(name);
		}
	});
});

describe('staticwebapp.config.json — route role gates', () => {
	const routes = config.routes ?? [];
	const findRoute = (path: string): SwaRoute | undefined => routes.find((r) => r.route === path);

	it.each([
		['/profile/*', 'authenticated'],
		['/welcome', 'authenticated'],
		['/find', 'authenticated'],
		['/admin/*', 'admin'],
		['/api/profile-save', 'authenticated'],
		['/api/profile-get', 'authenticated'],
		['/api/profiles', 'authenticated'],
		['/api/account-delete', 'authenticated'],
		['/api/admin-users', 'admin'],
		['/api/admins-list', 'admin'],
		['/api/admins-grant', 'admin'],
		['/api/admins-revoke', 'admin'],
	])('gates %s on role %s', (path, role) => {
		const route = findRoute(path);
		expect(route, `route ${path} must exist`).toBeDefined();
		expect(route?.allowedRoles, `route ${path} must have allowedRoles`).toContain(role);
	});

	it('places /api/* catch-all after all specific /api/ routes', () => {
		const catchAllIndex = routes.findIndex((r) => r.route === '/api/*');
		expect(catchAllIndex, '/api/* catch-all must exist').toBeGreaterThanOrEqual(0);

		const specificApiRoutes = routes
			.map((r, i) => ({ route: r.route, index: i }))
			.filter((x) => x.route.startsWith('/api/') && x.route !== '/api/*');

		for (const r of specificApiRoutes) {
			expect(r.index, `${r.route} (index ${r.index}) must come before /api/* (index ${catchAllIndex})`).toBeLessThan(catchAllIndex);
		}
	});

	it('redirects 401 responses to the login flow', () => {
		const override = config.responseOverrides?.['401'];
		expect(override, '401 response override must exist').toBeDefined();
		expect(override?.statusCode).toBe(302);
		expect(override?.redirect).toMatch(/\/\.auth\/login\//);
	});
});
