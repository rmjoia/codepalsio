import { describe, it, expect } from 'vitest';

/**
 * Post-deploy auth-flow E2E. Asserts the deployed SWA actually resolves
 * /.auth/login/github (no 404) and that the login chain ultimately leads
 * to GitHub's OAuth authorize endpoint.
 *
 * Modern SWA built-in auth uses a centralized identity proxy
 * (identity.<N>.azurestaticapps.net) as the first hop. The OAuth
 * callback URL registered in the GitHub OAuth app must match the
 * proxy's callback (identity.<N>.azurestaticapps.net/.auth/login/
 * github/callback), NOT the SWA's custom domain. AZURE_SETUP_GUIDE.md
 * §8.2 documents this.
 *
 * Skipped unless E2E_BASE_URL is set — local `npm test` stays fast and
 * doesn't need network. CI sets E2E_BASE_URL after the SWA deploy step.
 */

const baseUrl = process.env.E2E_BASE_URL;
const expectedHost = baseUrl ? new URL(baseUrl).host : '';

const SWA_IDENTITY_PROXY_HOST = /^identity\.\d+\.azurestaticapps\.net$/;

const describeIfDeployed = baseUrl ? describe : describe.skip;

async function fetchNoFollow(path: string, init?: RequestInit): Promise<Response> {
	return fetch(new URL(path, baseUrl), { ...init, redirect: 'manual' });
}

async function fetchAbsoluteNoFollow(absoluteUrl: string): Promise<Response> {
	return fetch(absoluteUrl, { redirect: 'manual' });
}

/**
 * Walk the redirect chain (manually, capping hops) and return every
 * response we saw. Useful both for assertions and for diagnostics —
 * a failing test prints the full chain so we know where SWA hands off.
 */
async function walkRedirects(startPath: string, maxHops = 5): Promise<Response[]> {
	const responses: Response[] = [];
	let current: string | null = new URL(startPath, baseUrl).toString();
	let hops = 0;
	while (current && hops < maxHops) {
		const res = await fetchAbsoluteNoFollow(current);
		responses.push(res);
		if (res.status < 300 || res.status >= 400) break;
		const next = res.headers.get('location');
		if (!next) break;
		current = new URL(next, current).toString();
		hops++;
	}
	return responses;
}

function summarizeChain(responses: Response[]): string {
	return responses
		.map((r, i) => `  [${i}] ${r.status} ${r.url} → ${r.headers.get('location') ?? '(no Location)'}`)
		.join('\n');
}

describeIfDeployed(`auth-flow E2E (${baseUrl ?? 'skipped'})`, () => {
	it('/.auth/login/github redirects through SWA identity proxy to GitHub OAuth authorize', async () => {
		const chain = await walkRedirects('/.auth/login/github');
		const summary = summarizeChain(chain);

		// First hop must redirect (not 404 — the regression PR #36 fixed).
		expect(chain[0].status, `expected redirect on first hop, got ${chain[0].status}\nChain:\n${summary}`).toBeGreaterThanOrEqual(300);
		expect(chain[0].status, `expected redirect on first hop, got ${chain[0].status}\nChain:\n${summary}`).toBeLessThan(400);

		// Last hop in the chain should be GitHub's OAuth authorize endpoint.
		const last = chain[chain.length - 1];
		const lastUrl = new URL(last.url);
		expect(
			lastUrl.host,
			`expected chain to end at github.com, ended at ${lastUrl.host}\nChain:\n${summary}`,
		).toBe('github.com');
		expect(lastUrl.pathname).toBe('/login/oauth/authorize');
		expect(lastUrl.searchParams.get('client_id'), `client_id missing\nChain:\n${summary}`).toBeTruthy();

		// The redirect_uri GitHub sees MUST match what's registered in the OAuth app.
		// Modern SWA hands off via identity.<N>.azurestaticapps.net, so the OAuth
		// app's callback URL must be that proxy host — NOT the custom domain.
		const redirectUri = lastUrl.searchParams.get('redirect_uri');
		expect(redirectUri, `redirect_uri missing\nChain:\n${summary}`).toBeTruthy();
		const callback = new URL(redirectUri!);
		const callbackHostOk =
			callback.host === expectedHost || SWA_IDENTITY_PROXY_HOST.test(callback.host);
		expect(
			callbackHostOk,
			`redirect_uri host '${callback.host}' must match deployed host '${expectedHost}' or SWA identity proxy (identity.<N>.azurestaticapps.net). If GitHub rejects with "redirect_uri is not associated", register this exact URL in the OAuth app: ${redirectUri}\nChain:\n${summary}`,
		).toBe(true);
		expect(callback.pathname).toBe('/.auth/login/github/callback');
	});

	it('/login alias triggers the same login chain (or 404 surfaces a SWA route regression)', async () => {
		const res = await fetchNoFollow('/login');
		const location = res.headers.get('location');
		expect(
			res.status,
			`expected /login to redirect; got ${res.status}. Location=${location}. ` +
				`If 404, the staticwebapp.config.json "redirect" route isn't being applied — check deploy includes the latest config.`,
		).toBeGreaterThanOrEqual(300);
		expect(res.status).toBeLessThan(400);
		expect(location).toBeTruthy();
		expect(location!).toMatch(/(\/\.auth\/login\/github|github\.com\/login\/oauth\/authorize|identity\.\d+\.azurestaticapps\.net)/);
	});

	it('gated route /profile redirects unauthenticated callers to login', async () => {
		const res = await fetchNoFollow('/profile');
		const location = res.headers.get('location');
		expect(
			res.status,
			`expected 302 on /profile; got ${res.status}. Location=${location}. ` +
				`If 404, either the /profile/* route guard isn't matching /profile (no trailing slash) ` +
				`or the responseOverrides.401 redirect isn't firing.`,
		).toBe(302);
		expect(location).toBeTruthy();
		expect(location!).toMatch(/\/\.auth\/login\/github/);
	});

	it('public homepage returns 200', async () => {
		const res = await fetch(new URL('/', baseUrl));
		expect(res.status).toBe(200);
	});
});
