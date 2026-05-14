import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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
		['/api/profile-save', 'authenticated'],
		['/api/profile-get', 'authenticated'],
		['/api/profiles', 'authenticated'],
		['/api/account-delete', 'authenticated'],
	])('gates user-facing route %s on role %s', (path, role) => {
		const route = findRoute(path);
		expect(route, `route ${path} must exist`).toBeDefined();
		expect(route?.allowedRoles, `route ${path} must have allowedRoles`).toContain(role);
	});

	const ADMIN_TIER_ROLES = ['admin', 'manager', 'moderator', 'messenger'];

	it.each([
		'/admin/*',
		'/api/manage-users',
		'/api/roster-list',
		'/api/roster-grant',
		'/api/roster-revoke',
	])('gates admin route %s on the admin-tier role set', (path) => {
		// Invitation roles (manager / moderator / messenger) are deliverable
		// on SWA Free via the Portal Role management blade — confirmed
		// working as of 2026-05-14. SWA route gate denies non-admin signed-in
		// users at the perimeter; handler enforces specifically (defense in
		// depth). 'admin' kept in the set for legacy roster-granted users.
		const route = findRoute(path);
		expect(route, `route ${path} must exist`).toBeDefined();
		expect(route?.allowedRoles, `route ${path} must allow the admin-tier role set`).toEqual(
			expect.arrayContaining(ADMIN_TIER_ROLES)
		);
	});

	it.each([
		'/admin/*',
		'/api/manage-users',
		'/api/roster-list',
		'/api/roster-grant',
		'/api/roster-revoke',
	])('does NOT degrade admin route %s to a permissive authenticated gate', (path) => {
		// Regression guard: PR #48 widened these routes to 'authenticated'
		// because we (wrongly) assumed Free tier couldn't deliver custom
		// roles. Invitation roles DO work on Free — re-narrowed in the CSP+
		// route-gate hardening PR. This invariant prevents a future change
		// from accidentally weakening the route back to 'authenticated'.
		const route = findRoute(path);
		expect(
			route?.allowedRoles,
			`route ${path} must not gate solely on 'authenticated' — restrict to admin-tier roles`
		).not.toContain('authenticated');
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

	it('places /admin/* AFTER all /api/ routes (avoids route-pattern bleed)', () => {
		// SWA matches routes in declaration order; the first match wins. If
		// /admin/* is declared BEFORE the /api/admin-users (etc.) routes,
		// SWA can incorrectly match /api/admin-users against /admin/* and
		// route it to the static handler — which then 404s because no
		// static file matches /api/admin-users. We observed this in
		// production after PR #48: every /api/admin-* endpoint returned
		// 404 even though the functions were registered (verified in the
		// SWA Portal's APIs → Managed Functions list).
		//
		// Fix: /admin/* must come AFTER all /api/* routes so the specific
		// /api/admin-* rules match first. This invariant is the regression
		// guard.
		const adminPageRouteIndex = routes.findIndex((r) => r.route === '/admin/*');
		if (adminPageRouteIndex === -1) return; // optional rule; skip if absent

		const apiRouteIndices = routes
			.map((r, i) => ({ route: r.route, index: i }))
			.filter((x) => x.route.startsWith('/api/'));

		for (const r of apiRouteIndices) {
			expect(
				r.index,
				`${r.route} (index ${r.index}) must come before /admin/* (index ${adminPageRouteIndex}) — otherwise SWA's pattern matcher bleeds /admin/* into /api/admin-* paths`
			).toBeLessThan(adminPageRouteIndex);
		}
	});

	it('redirects 401 responses to the login flow', () => {
		const override = config.responseOverrides?.['401'];
		expect(override, '401 response override must exist').toBeDefined();
		expect(override?.statusCode).toBe(302);
		expect(override?.redirect).toMatch(/\/\.auth\/login\//);
	});
});

/**
 * Cross-reference invariant: every `/api/X` route declared in
 * staticwebapp.config.json MUST have a matching `app.http('X', ...)`
 * registration in api/src/*.ts. And vice versa.
 *
 * Catches the class of silent regression where a function gets renamed
 * but the route stays stale (or a route is added but no function
 * exists), each of which yields a 404 in prod. See
 * .specify/platform-constraints.md.
 */
describe('staticwebapp.config.json ↔ api/src/*.ts route/function consistency', () => {
	const apiSrcDir = resolve(repoRoot, 'api/src');
	const declaredApiRoutes = (config.routes ?? [])
		.map((r) => r.route)
		.filter((p) => p.startsWith('/api/') && p !== '/api/*');

	/**
	 * Discover every file under api/src/ that contains an `app.http()`
	 * registration AND extract the registered function name(s).
	 * Crucially, we ALSO collect the basename of the file so we can
	 * cross-check that index.ts imports it — without that import, the
	 * file is never executed at runtime and the function registration
	 * is invisible to the SWA function host (404 in prod despite the
	 * test passing). (Copilot review)
	 */
	function collectFunctionFiles(): Array<{ file: string; name: string }> {
		const re = /\bapp\.http\(\s*(['"])([^'"]+)\1\s*,/g;
		const results: Array<{ file: string; name: string }> = [];
		for (const entry of readdirSync(apiSrcDir, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			if (!entry.name.endsWith('.ts')) continue;
			if (entry.name.endsWith('.test.ts')) continue;
			if (entry.name.endsWith('.fake.ts')) continue;
			if (entry.name === 'index.ts') continue;
			const content = readFileSync(resolve(apiSrcDir, entry.name), 'utf8');
			for (const match of content.matchAll(re)) {
				results.push({ file: entry.name, name: match[2] });
			}
		}
		return results;
	}

	const functionFiles = collectFunctionFiles();
	const registered = new Set(functionFiles.map((f) => f.name));

	// Distinct list of file basenames (without .ts) that contain a
	// registration — used to verify they're all imported by index.ts.
	const filesWithRegistrations = new Set(functionFiles.map((f) => f.file.replace(/\.ts$/, '')));

	it.each(declaredApiRoutes)('route %s has a matching app.http() registration', (route) => {
		const functionName = route.replace(/^\/api\//, '');
		expect(
			registered.has(functionName),
			`route ${route} declared but no app.http('${functionName}', …) found in api/src/*.ts.\n` +
				`Either remove the route or add the function.\n` +
				`Registered functions: ${[...registered].sort().join(', ')}`
		).toBe(true);
	});

	it('every app.http() registration has a matching /api/X route declaration', () => {
		const routePaths = new Set(declaredApiRoutes.map((r) => r.replace(/^\/api\//, '')));
		const orphans = [...registered].filter((name) => !routePaths.has(name));
		expect(
			orphans,
			`Functions registered but missing route declaration in staticwebapp.config.json:\n` +
				orphans.map((n) => `  - app.http('${n}', …) — expected '/api/${n}' in routes`).join('\n') +
				`\n\nAdd a route entry so SWA applies role gates correctly.`
		).toEqual([]);
	});

	it('every file with app.http() is imported by api/src/index.ts (runtime reachability)', () => {
		// The Functions v4 entrypoint only executes files that index.ts
		// imports (each import has the side effect of running app.http()).
		// A registration in a file that no one imports is dead code — the
		// route 404s at runtime even though the test would otherwise pass.
		// This invariant closes that gap. (Copilot review on PR #53)
		const indexPath = resolve(apiSrcDir, 'index.ts');
		const indexContent = readFileSync(indexPath, 'utf8');

		// Match `import './X';` or `import "./X";` — the side-effect import
		// pattern. Captures X (the file basename without .ts).
		const importRe = /^\s*import\s+(['"])\.\/([\w-]+)\1\s*;?\s*$/gm;
		const importedFiles = new Set<string>();
		for (const match of indexContent.matchAll(importRe)) {
			importedFiles.add(match[2]);
		}

		const missing = [...filesWithRegistrations].filter((f) => !importedFiles.has(f));
		expect(
			missing,
			`Files containing app.http() but NOT imported by api/src/index.ts:\n` +
				missing.map((f) => `  - api/src/${f}.ts`).join('\n') +
				`\n\nAdd \`import './${missing[0] ?? '<file>'}';\` to api/src/index.ts so the\n` +
				`Functions v4 host actually loads the module and registers the function.\n` +
				`Without this, the route 404s in prod even though the file looks correct.`
		).toEqual([]);
	});
});
