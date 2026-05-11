import { describe, it, expect } from 'vitest';

/**
 * Post-deploy auth-flow E2E.
 *
 * Skipped unless E2E_BASE_URL is set — local `npm test` stays fast and
 * doesn't need network. CI sets E2E_BASE_URL after the SWA deploy step.
 *
 * On the auth-flow test specifically: SWA preview environments do NOT
 * inherit production Application Settings (GITHUB_CLIENT_ID/SECRET).
 * Without those secrets the SWA auth runtime can't initiate the OAuth
 * handshake, and instead loops on /.auth/login/github regenerating
 * staticWebAppsAuthNonce on every hop — never reaching GitHub.
 *
 * To avoid spurious failures on preview envs while still being strict
 * on production:
 *   - Set E2E_AUTH_REQUIRED=1 on prod (full assertion: chain ends at
 *     github.com OAuth authorize).
 *   - Leave it unset on preview (test detects the SWA auth-loop pattern
 *     and skips the strict assertion with a clear diagnostic message).
 *
 * The diagnostic message points the operator at the exact thing to fix
 * (configure preview env app settings) so a "passing" preview run isn't
 * silently masking a real auth misconfiguration.
 */

const baseUrl = process.env.E2E_BASE_URL;
const expectedHost = baseUrl ? new URL(baseUrl).host : '';
const authRequired = process.env.E2E_AUTH_REQUIRED === '1';

const SWA_AUTH_LOOP_PATH = '/.auth/login/github';
const LOOP_HOPS_THRESHOLD = 3;

const describeIfDeployed = baseUrl ? describe : describe.skip;

async function fetchNoFollow(path: string, init?: RequestInit): Promise<Response> {
	return fetch(new URL(path, baseUrl), { ...init, redirect: 'manual' });
}

async function fetchAbsoluteNoFollow(absoluteUrl: string): Promise<Response> {
	return fetch(absoluteUrl, { redirect: 'manual' });
}

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

/**
 * Detects the SWA "OAuth not configured" loop pattern: every hop
 * stays on /.auth/login/github at the SWA's own host, only the
 * staticWebAppsAuthNonce query param differs. This indicates
 * GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are missing from the
 * env's Application Settings.
 */
function isSwaAuthLoop(responses: Response[]): boolean {
	if (responses.length < LOOP_HOPS_THRESHOLD) return false;
	const sameHostAndPath = responses.every((r) => {
		const u = new URL(r.url);
		return u.host === expectedHost && u.pathname === SWA_AUTH_LOOP_PATH;
	});
	return sameHostAndPath;
}

/**
 * Detects the "GitHub rejected the OAuth handshake" pattern: chain
 * reached github.com but landed somewhere other than the authorize
 * endpoint (typically /login, because GitHub bounces a request whose
 * redirect_uri doesn't match the OAuth app's registered callback).
 *
 * In preview envs the SWA hostname is a per-PR ephemeral URL (e.g.
 * <branch>-<hash>.eastus2.azurestaticapps.net) that the custom OAuth
 * app at github.com/settings/applications wasn't registered for, so
 * the handshake always fails here. Same class of "preview env can't
 * complete real OAuth" issue as isSwaAuthLoop, just hitting a
 * different rejection path.
 */
function isGithubOauthRejection(responses: Response[]): boolean {
	if (responses.length === 0) return false;
	const last = responses[responses.length - 1];
	const u = new URL(last.url);
	return u.host === 'github.com' && u.pathname !== '/login/oauth/authorize';
}

describeIfDeployed(`auth-flow E2E (${baseUrl ?? 'skipped'}, auth-required=${authRequired})`, () => {
	it('/.auth/login/github redirect chain completes (or skips on preview env without OAuth secrets)', async () => {
		const chain = await walkRedirects('/.auth/login/github');
		const summary = summarizeChain(chain);

		// First hop must redirect (not 404 — the regression PR #36 fixed).
		expect(chain[0].status, `expected redirect on first hop, got ${chain[0].status}\nChain:\n${summary}`).toBeGreaterThanOrEqual(300);
		expect(chain[0].status, `expected redirect on first hop, got ${chain[0].status}\nChain:\n${summary}`).toBeLessThan(400);

		// Detect SWA auth-loop pattern (preview env without OAuth secrets).
		if (isSwaAuthLoop(chain)) {
			const msg =
				`SWA auth loop detected on ${expectedHost} — chain stays on ${SWA_AUTH_LOOP_PATH} ` +
				`across ${chain.length} hops without reaching GitHub. ` +
				`This means GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are not configured in this env's ` +
				`Application Settings. Configure them in the SWA's preview-env settings to enable ` +
				`full auth-flow E2E here.\nChain:\n${summary}`;

			if (authRequired) {
				expect.fail(msg);
			} else {
				console.warn(`\n⚠️  ${msg}\n   (E2E_AUTH_REQUIRED is not set; treating as soft skip.)`);
				return;
			}
		}

		// Detect GitHub OAuth rejection (preview env hostname not registered
		// as a callback on the custom OAuth app — GitHub bounces to /login).
		if (isGithubOauthRejection(chain)) {
			const last = chain[chain.length - 1];
			const lastUrl = new URL(last.url);
			const msg =
				`GitHub OAuth rejection on ${expectedHost} — chain reached github.com ` +
				`but landed at ${lastUrl.pathname} instead of /login/oauth/authorize. ` +
				`Most likely the preview env's hostname isn't registered as a callback URL on the ` +
				`custom GitHub OAuth app, so GitHub bounces the handshake. This is expected on per-PR ` +
				`preview environments — register the preview hostname only if you need full auth ` +
				`coverage here.\nChain:\n${summary}`;

			if (authRequired) {
				expect.fail(msg);
			} else {
				console.warn(`\n⚠️  ${msg}\n   (E2E_AUTH_REQUIRED is not set; treating as soft skip.)`);
				return;
			}
		}

		// Otherwise we expect to land at GitHub OAuth authorize.
		const last = chain[chain.length - 1];
		const lastUrl = new URL(last.url);
		expect(
			lastUrl.host,
			`expected chain to end at github.com, ended at ${lastUrl.host}\nChain:\n${summary}`,
		).toBe('github.com');
		expect(lastUrl.pathname).toBe('/login/oauth/authorize');
		expect(lastUrl.searchParams.get('client_id'), `client_id missing\nChain:\n${summary}`).toBeTruthy();

		// The redirect_uri GitHub sees MUST match what's registered in the OAuth app.
		// For SWA built-in auth this is <swa-host>/.auth/login/github/callback.
		const redirectUri = lastUrl.searchParams.get('redirect_uri');
		expect(redirectUri, `redirect_uri missing\nChain:\n${summary}`).toBeTruthy();
		const callback = new URL(redirectUri!);
		expect(
			callback.host,
			`redirect_uri host '${callback.host}' must match deployed host '${expectedHost}'. ` +
				`If GitHub rejects with "redirect_uri is not associated", register this exact URL in the OAuth app: ${redirectUri}\nChain:\n${summary}`,
		).toBe(expectedHost);
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
