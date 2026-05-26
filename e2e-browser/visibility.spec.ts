import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The repo is `type: "module"`, so __dirname isn't defined and
// Playwright's ESM loader (unlike vitest) provides no shim. Derive it
// from import.meta.url.
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Hermetic browser E2E for the visibility-dependent UI states.
 *
 * Covers the browser-rendering half of the per-field visibility feature:
 * given a canned API response, does the page paint the right state? The
 * server-side filtering math (applyFieldVisibility, the projections, the
 * 403/404 decision) is unit-tested separately — these tests assert the
 * DOM, which the source-regex tests can only approximate.
 *
 * Mocking model:
 *   - `/.auth/me` + `/api/get-roles` → a canned authenticated principal
 *     (every gated page calls these via the Header + page scripts)
 *   - `/api/profile-by-username` + `/api/profiles` → per-test canned
 *     responses for each visibility / status scenario
 *   - The SWA `/find/* → /find/profile/index.html` rewrite doesn't exist
 *     in `astro preview`, so we emulate it: fulfill any /find/<username>
 *     navigation with the built profile-detail HTML. The page's client
 *     script then reads window.location.pathname to extract the
 *     username, exactly as it would behind the real rewrite.
 */

const profileDetailHtml = readFileSync(
	resolve(__dirname, '../dist/find/profile/index.html'),
	'utf8'
);

const VIEWER = {
	clientPrincipal: {
		identityProvider: 'github',
		userId: 'viewer-user-id',
		userDetails: 'viewer',
		userRoles: ['authenticated'],
		claims: [],
	},
};

async function mockAuth(page: Page, principal: unknown = VIEWER): Promise<void> {
	await page.route('**/.auth/me', (route) => route.fulfill({ json: principal as object }));
	await page.route('**/api/get-roles', (route) =>
		route.fulfill({ json: { roles: ['authenticated'] } })
	);
}

/**
 * Emulate the SWA `/find/*` rewrite for the hermetic preview server.
 * Only the top-level navigation (document) is served the profile HTML;
 * asset requests (under /_astro/) fall through to the preview server.
 */
async function serveDetailPageAtAnyUsername(page: Page): Promise<void> {
	await page.route('**/find/*', (route) => {
		if (route.request().resourceType() === 'document') {
			route.fulfill({ contentType: 'text/html', body: profileDetailHtml });
		} else {
			route.continue();
		}
	});
}

const FULL_PROFILE = {
	id: 'p1',
	githubUsername: 'alice',
	displayName: 'Alice Example',
	bio: 'Building open-source tools.',
	skills: ['typescript', 'rust'],
	interests: ['compilers', 'developer-tooling'],
	availability: 'active',
	location: 'Lisbon',
	timezone: 'Europe/Lisbon',
	githubUrl: 'https://github.com/alice',
	linkedinUrl: 'https://linkedin.com/in/alice',
	websiteUrl: 'https://alice.dev',
	preferredLanguages: ['English', 'Português'],
	yearsOfExperience: 8,
	updatedAt: '2026-05-20T00:00:00Z',
};

test.describe('/find/<username> detail page — visibility/status states', () => {
	test('renders a public profile with all fields present', async ({ page }) => {
		await mockAuth(page);
		await serveDetailPageAtAnyUsername(page);
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({ json: { profile: FULL_PROFILE } })
		);

		await page.goto('/find/alice');

		await expect(page.locator('#profile-state')).toBeVisible();
		await expect(page.locator('#profile-display-name')).toHaveText('Alice Example');
		await expect(page.locator('#profile-bio')).toHaveText('Building open-source tools.');
		// Skills / interests / languages / links sections reveal when present.
		await expect(page.locator('#profile-skills-section')).toBeVisible();
		await expect(page.locator('#profile-interests-section')).toBeVisible();
		await expect(page.locator('#profile-languages-section')).toBeVisible();
		await expect(page.locator('#profile-links-section')).toBeVisible();
		// The error / not-found / private states stay hidden.
		await expect(page.locator('#not-found-state')).toBeHidden();
		await expect(page.locator('#private-state')).toBeHidden();
		await expect(page.locator('#error-state')).toBeHidden();
	});

	test('hides the bio element when the field was stripped (private to this viewer)', async ({
		page,
	}) => {
		// Server applied per-field visibility and omitted `bio`. The page
		// must not render a blank-but-styled bio paragraph — it hides it.
		await mockAuth(page);
		await serveDetailPageAtAnyUsername(page);
		const noBio = { ...FULL_PROFILE };
		delete (noBio as { bio?: string }).bio;
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({ json: { profile: noBio } })
		);

		await page.goto('/find/alice');

		await expect(page.locator('#profile-state')).toBeVisible();
		await expect(page.locator('#profile-bio')).toBeHidden();
		// Other fields still render.
		await expect(page.locator('#profile-skills-section')).toBeVisible();
	});

	test('hides the skills section when skills were stripped', async ({ page }) => {
		await mockAuth(page);
		await serveDetailPageAtAnyUsername(page);
		const noSkills = { ...FULL_PROFILE };
		delete (noSkills as { skills?: string[] }).skills;
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({ json: { profile: noSkills } })
		);

		await page.goto('/find/alice');

		await expect(page.locator('#profile-state')).toBeVisible();
		await expect(page.locator('#profile-skills-section')).toBeHidden();
	});

	test('shows the 403 private state when the API returns 403', async ({ page }) => {
		await mockAuth(page);
		await serveDetailPageAtAnyUsername(page);
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({ status: 403, json: { error: 'Profile is private' } })
		);

		await page.goto('/find/alice');

		await expect(page.locator('#private-state')).toBeVisible();
		await expect(page.locator('#private-username')).toHaveText('@alice');
		await expect(page.locator('#profile-state')).toBeHidden();
		await expect(page.locator('#not-found-state')).toBeHidden();
	});

	test('shows the 404 not-found state when the API returns 404', async ({ page }) => {
		await mockAuth(page);
		await serveDetailPageAtAnyUsername(page);
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({ status: 404, json: { error: 'Not found' } })
		);

		await page.goto('/find/ghost');

		await expect(page.locator('#not-found-state')).toBeVisible();
		await expect(page.locator('#not-found-username')).toHaveText('@ghost');
		await expect(page.locator('#profile-state')).toBeHidden();
		await expect(page.locator('#private-state')).toBeHidden();
	});

	test('shows the generic error state on a 500', async ({ page }) => {
		await mockAuth(page);
		await serveDetailPageAtAnyUsername(page);
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({ status: 500, json: { error: 'Failed to load profile' } })
		);

		await page.goto('/find/alice');

		await expect(page.locator('#error-state')).toBeVisible();
		await expect(page.locator('#profile-state')).toBeHidden();
	});
});

test.describe('/find directory — listed-aware banner', () => {
	test('shows the "you\'re listed" banner when the viewer is in the directory', async ({
		page,
	}) => {
		// Principal's userDetails === a directory row's githubUsername →
		// the page concludes the viewer is listed.
		await mockAuth(page);
		await page.route('**/api/profiles', (route) =>
			route.fulfill({
				json: {
					profiles: [
						{ ...FULL_PROFILE, githubUsername: 'viewer', displayName: 'The Viewer' },
						{ ...FULL_PROFILE, githubUsername: 'someone-else', displayName: 'Someone' },
					],
				},
			})
		);

		await page.goto('/find');

		await expect(page.locator('#banner-listed')).toBeVisible();
		await expect(page.locator('#banner-not-listed')).toBeHidden();
	});

	test('shows the "want to be listed?" banner when the viewer is NOT in the directory', async ({
		page,
	}) => {
		await mockAuth(page);
		await page.route('**/api/profiles', (route) =>
			route.fulfill({
				json: {
					profiles: [{ ...FULL_PROFILE, githubUsername: 'someone-else', displayName: 'Someone' }],
				},
			})
		);

		await page.goto('/find');

		await expect(page.locator('#banner-not-listed')).toBeVisible();
		await expect(page.locator('#banner-listed')).toBeHidden();
	});

	test('matches listed-ness case-insensitively', async ({ page }) => {
		// Principal userDetails 'viewer' vs stored githubUsername 'Viewer'
		// (different case) must still resolve to listed.
		await mockAuth(page);
		await page.route('**/api/profiles', (route) =>
			route.fulfill({
				json: {
					profiles: [{ ...FULL_PROFILE, githubUsername: 'Viewer', displayName: 'The Viewer' }],
				},
			})
		);

		await page.goto('/find');

		await expect(page.locator('#banner-listed')).toBeVisible();
		await expect(page.locator('#banner-not-listed')).toBeHidden();
	});

	test('keeps both banners hidden on the empty directory (empty-state owns the CTA)', async ({
		page,
	}) => {
		await mockAuth(page);
		await page.route('**/api/profiles', (route) => route.fulfill({ json: { profiles: [] } }));

		await page.goto('/find');

		await expect(page.locator('#empty-state')).toBeVisible();
		await expect(page.locator('#banner-listed')).toBeHidden();
		await expect(page.locator('#banner-not-listed')).toBeHidden();
	});
});
