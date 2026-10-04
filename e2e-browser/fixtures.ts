import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, Route } from '@playwright/test';

/**
 * Shared hermetic-test fixtures for the e2e-browser suite.
 *
 * The whole suite runs against `astro preview` serving dist/ with no
 * real backend. Every `/.auth/me`, `/api/*`, and SWA rewrite path is
 * intercepted via `page.route()`. This file centralises:
 *
 *   - canned client principals (anon / authenticated / admin /
 *     suspended),
 *   - canned profiles / reports / audit rows,
 *   - helpers to install the mocks on a Page in one call,
 *   - SWA rewrite emulation for `/find/<username>` and the admin
 *     subpaths that Astro ships as index.html files behind rewrites,
 *   - the small amount of path-to-dist mapping that the preview
 *     server doesn't do by itself.
 *
 * Adding a new spec: import the helpers you need, call `mockAuth` +
 * `mockApi` in a `beforeEach`, then `page.goto` the route you want to
 * exercise. For a new mock, extend `MockedApiRoutes` (keeping the
 * default-response map authoritative) rather than reaching for
 * `page.route()` directly — that keeps per-test overrides declarative
 * and the shared defaults in one place.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(__dirname, '../dist');

/**
 * Read a built static HTML page from dist/. Throws a readable error if
 * the file is missing — the full suite depends on `npm run build`
 * having run.
 */
export function readDist(relPath: string): string {
	const full = resolve(distRoot, relPath);
	try {
		return readFileSync(full, 'utf8');
	} catch (err) {
		throw new Error(
			`Could not read dist/${relPath}.\n` +
				`The browser E2E suite runs against the production build — ` +
				`run \`npm run build\` first ` +
				`(or use \`npm run test:e2e:browser\`, which builds for you).\n` +
				`Underlying error: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}

/** Canned client principals. */
export const ANON_PRINCIPAL = { clientPrincipal: null };

export const USER_PRINCIPAL = {
	clientPrincipal: {
		identityProvider: 'github',
		userId: 'user-1',
		userDetails: 'alice',
		userRoles: ['authenticated'],
		claims: [],
	},
};

export const ADMIN_PRINCIPAL = {
	clientPrincipal: {
		identityProvider: 'github',
		userId: 'admin-1',
		userDetails: 'rmjoia',
		userRoles: ['authenticated'],
		claims: [],
	},
};

/**
 * Canned profile the admin + user can see. Fields mirror the
 * Profile shape in src/services/api.ts. Different specs pick which
 * ones to project onto their mocked API responses.
 */
export const SAMPLE_PROFILE = {
	id: 'profile-alice',
	userId: 'user-1',
	githubUsername: 'alice',
	displayName: 'Alice Example',
	bio: 'Building open-source tooling. Looking for a mentor to help me grow in Rust and systems programming — happy to pay forward with web + accessibility experience.',
	skills: ['typescript', 'rust', 'accessibility'],
	interests: ['compilers', 'developer-tooling', 'open-source'],
	availability: 'active' as const,
	profileVisibility: 'public' as const,
	location: 'Lisbon, Portugal',
	timezone: 'Europe/Lisbon',
	githubUrl: 'https://github.com/alice',
	linkedinUrl: 'https://linkedin.com/in/alice',
	websiteUrl: 'https://alice.dev',
	preferredLanguages: ['English', 'Português'],
	yearsOfExperience: 8,
	updatedAt: '2026-05-20T00:00:00Z',
};

export const SAMPLE_REPORT = {
	id: 'report-1',
	reporterId: 'user-2',
	reportedProfileId: SAMPLE_PROFILE.id,
	reportedUserId: SAMPLE_PROFILE.userId,
	reportedUsername: SAMPLE_PROFILE.githubUsername,
	reason: 'harassment' as const,
	note: 'Repeatedly messaged me after I asked them to stop.',
	createdAt: '2026-10-02T12:00:00Z',
	status: 'open' as const,
	reportCount: 1,
};

/**
 * What a `/.auth/me` mock looks like for each role. Playwright's
 * `page.route` callbacks hand the response to a `route.fulfill({json})`
 * — these are the exact objects to pass.
 */
export type PrincipalName = 'anonymous' | 'user' | 'admin';

export function mockAuth(page: Page, who: PrincipalName = 'user'): Promise<void> {
	const principal =
		who === 'anonymous' ? ANON_PRINCIPAL : who === 'admin' ? ADMIN_PRINCIPAL : USER_PRINCIPAL;
	const roles =
		who === 'anonymous'
			? ['anonymous']
			: who === 'admin'
				? ['authenticated', 'admin']
				: ['authenticated'];
	return Promise.all([
		page.route('**/.auth/me', (route) => route.fulfill({ json: principal })),
		page.route('**/api/get-roles', (route) => route.fulfill({ json: { roles } })),
	]).then(() => undefined);
}

/**
 * SWA rewrite emulation for `/find/<username>` → the built detail HTML.
 * Only the top-level document is rewritten; asset requests fall through
 * to the preview server. Mirrors the pattern from visibility.spec.ts.
 */
export async function serveFindDetailAtAnyUsername(page: Page): Promise<void> {
	const html = readDist('find/profile/index.html');
	await page.route('**/find/*', (route) => {
		if (route.request().resourceType() === 'document') {
			return route.fulfill({ contentType: 'text/html', body: html });
		}
		return route.continue();
	});
}

/**
 * Fulfill a request with a 403 { reason: 'suspended' } body — the
 * sentinel the frontend fetch wrapper matches on to hard-redirect
 * suspended users to /suspended. Used by suspension.spec.ts.
 */
export function fulfillSuspended(route: Route): Promise<void> {
	return route.fulfill({ status: 403, json: { reason: 'suspended' } });
}

/**
 * Install a last-resort fallthrough that fails the test if any `/api/*`
 * call escapes the per-test mocks. Catches drift between the real API
 * paths and the ones specs route — a page silently 404ing an API call
 * instead of showing its happy path.
 *
 * Call AFTER the per-test routes are set so this handler is the last
 * one in the chain.
 */
export async function failOnUnhandledApi(page: Page): Promise<void> {
	await page.route('**/api/**', (route) => {
		// Only match requests nothing else handled. Playwright evaluates
		// handlers in reverse-registration order, so this one is last.
		return route.fulfill({
			status: 599,
			body: `Unhandled API call: ${route.request().method()} ${route.request().url()}`,
		});
	});
}
