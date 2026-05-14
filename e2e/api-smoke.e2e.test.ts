import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Post-deploy smoke for every declared `/api/*` route.
 *
 * Sends an HTTP request to each route and asserts the response is NOT
 * 404. A 404 from a declared API route means the SWA frontend proxy
 * couldn't reach the function — which is the exact symptom we chased
 * for hours in PR #52 (Azure Functions reserved-name collision left
 * `/api/admin-users` returning 404 despite the function being properly
 * registered in the SWA Function host).
 *
 * Acceptable responses (proves the route is reachable and SWA forwarded
 * it correctly):
 *   - 200 / 201 / 204 — anonymous-accessible endpoint returned OK
 *   - 302 — SWA route gate redirected to login (anonymous user, gated)
 *   - 401 — endpoint requires auth (anonymous caller, function reachable)
 *   - 403 — auth/role check rejected (function reachable)
 *   - 405 — method not allowed (function reachable; we sent wrong verb)
 *   - 400 — bad request (function reachable; rejected our empty body)
 *
 * NOT acceptable:
 *   - 404 — the SWA static handler returned this because no function
 *     matched the route. THIS is the failure signature.
 *   - 5xx — server-side crash; route is reachable but function failed.
 *     Surfaced as a separate assertion for clearer diagnostics.
 *
 * Skipped unless E2E_BASE_URL is set — local `npm test` stays fast.
 * Runs in CI after the post-deploy step.
 */

const baseUrl = process.env.E2E_BASE_URL;
const describeIfDeployed = baseUrl ? describe : describe.skip;

interface SwaRoute {
	route: string;
	allowedRoles?: string[];
	redirect?: string;
	rewrite?: string;
}

function loadDeclaredApiRoutes(): SwaRoute[] {
	const repoRoot = resolve(__dirname, '..');
	const configPath = resolve(repoRoot, 'staticwebapp.config.json');
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	return (config.routes ?? []).filter(
		(r: SwaRoute) => r.route.startsWith('/api/') && r.route !== '/api/*'
	);
}

describeIfDeployed(`api smoke E2E (${baseUrl ?? 'skipped'})`, () => {
	const apiRoutes = loadDeclaredApiRoutes();

	// Sanity — if this fails the test file is dead weight.
	it('discovers declared API routes from staticwebapp.config.json', () => {
		expect(apiRoutes.length, 'expected >0 /api/ routes to smoke').toBeGreaterThan(0);
	});

	// One test per route — readable failure when one specific endpoint
	// 404s rather than a generic "smoke failed".
	it.each(apiRoutes.map((r) => r.route))(
		'%s is reachable (not 404 — SWA forwarded to the function)',
		async (route) => {
			// Use GET — most idempotent and simplest. POST-only functions
			// will respond 405 (acceptable). The point is reachability:
			// 404 means the route doesn't resolve to a function at all.
			const res = await fetch(new URL(route, baseUrl), { redirect: 'manual' });

			expect(
				res.status,
				`${route} returned 404. This means SWA could not route to a function for that path.\n` +
					`Likely cause: function registration name doesn't match the route, OR the function\n` +
					`name uses a reserved Azure Functions prefix (admin/admins/host/functions/keys/...).\n` +
					`See .specify/platform-constraints.md and api/src/lib/function-registrations.test.ts.`
			).not.toBe(404);

			// 5xx means the function IS reachable but crashed at runtime —
			// still a real bug, just a different class. Surface clearly.
			expect(
				res.status,
				`${route} returned ${res.status} — function reachable but threw at runtime.\n` +
					`Check Azure Application Insights / SWA Function logs for the stack trace.`
			).toBeLessThan(500);
		}
	);
});
