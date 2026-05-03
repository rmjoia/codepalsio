import { describe, it, expect } from 'vitest';

/**
 * Post-deploy auth-flow E2E. Asserts the deployed SWA actually resolves
 * /.auth/login/github (no 404) and forwards to GitHub's OAuth authorize
 * endpoint with the expected client_id / redirect_uri shape.
 *
 * Skipped unless E2E_BASE_URL is set — local `npm test` stays fast and
 * doesn't need network. CI sets E2E_BASE_URL after the SWA deploy step.
 */

const baseUrl = process.env.E2E_BASE_URL;
const expectedCallbackHost = process.env.E2E_BASE_URL ? new URL(process.env.E2E_BASE_URL).host : '';

const describeIfDeployed = baseUrl ? describe : describe.skip;

async function fetchNoFollow(path: string): Promise<Response> {
	return fetch(new URL(path, baseUrl), { redirect: 'manual' });
}

describeIfDeployed(`auth-flow E2E (${baseUrl ?? 'skipped'})`, () => {
	it('/.auth/login/github redirects to GitHub OAuth authorize (not 404)', async () => {
		const res = await fetchNoFollow('/.auth/login/github');
		expect(res.status, `expected redirect, got ${res.status} — likely missing identityProviders.github in staticwebapp.config.json or missing GITHUB_CLIENT_ID app setting`).toBeGreaterThanOrEqual(300);
		expect(res.status).toBeLessThan(400);

		const location = res.headers.get('location');
		expect(location, 'expected Location header on redirect').toBeTruthy();
		const target = new URL(location!);
		expect(target.host).toBe('github.com');
		expect(target.pathname).toBe('/login/oauth/authorize');
		expect(target.searchParams.get('client_id'), 'client_id must be present (GITHUB_CLIENT_ID app setting wired)').toBeTruthy();

		const redirectUri = target.searchParams.get('redirect_uri');
		expect(redirectUri, 'redirect_uri must be present').toBeTruthy();
		const callback = new URL(redirectUri!);
		expect(callback.host).toBe(expectedCallbackHost);
		expect(callback.pathname).toBe('/.auth/login/github/callback');
	});

	it('/login (alias) redirects through to the login flow', async () => {
		const res = await fetchNoFollow('/login');
		expect(res.status).toBeGreaterThanOrEqual(300);
		expect(res.status).toBeLessThan(400);
		const location = res.headers.get('location');
		expect(location).toBeTruthy();
		// Either redirects directly to GitHub or hops through /.auth/login/github first.
		expect(location!).toMatch(/(\/\.auth\/login\/github|github\.com\/login\/oauth\/authorize)/);
	});

	it('gated route /profile redirects unauthenticated callers to login', async () => {
		const res = await fetchNoFollow('/profile');
		expect(res.status).toBe(302);
		const location = res.headers.get('location');
		expect(location).toBeTruthy();
		expect(location!).toMatch(/\/\.auth\/login\/github/);
	});

	it('public homepage returns 200', async () => {
		const res = await fetch(new URL('/', baseUrl));
		expect(res.status).toBe(200);
	});
});
