import { test, expect } from '@playwright/test';
import {
	mockAuth,
	fulfillSuspended,
	SAMPLE_PROFILE,
	serveFindDetailAtAnyUsername,
} from './fixtures';

/**
 * Suspension — the user-visible half of spec 003 FR-124b.
 *
 * Server behaviour: every authenticated handler returns
 *   403 { reason: 'suspended' }
 * for a suspended caller. Frontend contract: the fetch wrapper in
 * src/services/api.ts intercepts that sentinel and HARD-NAVIGATES to
 * /suspended (and awaits a never-resolving promise so the caller's
 * `.catch` doesn't fire a toast before the navigation unloads).
 *
 * Coverage below:
 *   - any /api/* returning the suspended sentinel while on a page that
 *     calls one → navigation lands on /suspended
 *   - /suspended page itself renders for authenticated AND anonymous
 *     users (so a suspended user who clicks a link to /suspended from
 *     an email signoff isn't bounced into sign-in)
 *   - /suspended does NOT redirect itself (no loop) — the page is
 *     pure static markup with no authenticated calls
 *   - a non-403 error on an API call does NOT trigger the suspension
 *     redirect
 */

test.describe('/suspended — static landing page', () => {
	test('renders for an authenticated viewer without triggering a loop', async ({ page }) => {
		await mockAuth(page, 'user');
		await page.goto('/suspended');

		await expect(page).toHaveURL(/\/suspended$/);
		await expect(page.getByRole('heading', { name: /account is suspended/i })).toBeVisible();
		await expect(page.locator('a[href^="mailto:abuse@"]')).toBeVisible();
	});

	test('renders for an anonymous viewer (route rule allows anonymous)', async ({ page }) => {
		await mockAuth(page, 'anonymous');
		await page.goto('/suspended');

		await expect(page).toHaveURL(/\/suspended$/);
		await expect(page.getByRole('heading', { name: /account is suspended/i })).toBeVisible();
	});

	test('offers a sign-out link so suspended users can leave cleanly', async ({ page }) => {
		await mockAuth(page, 'user');
		await page.goto('/suspended');
		// Logout link routes to /logout (which SWA redirects to /.auth/logout).
		await expect(page.locator('a[href="/logout"]')).toBeVisible();
	});
});

test.describe('Suspension redirect — authenticated API 403 { reason:"suspended" }', () => {
	test('/find directory: suspended-sentinel 403 hard-navigates to /suspended', async ({ page }) => {
		await mockAuth(page, 'user');
		await page.route('**/api/profiles', fulfillSuspended);

		await page.goto('/find');
		await expect.poll(() => new URL(page.url()).pathname, { timeout: 5_000 }).toBe('/suspended');
	});

	test('/find/<username>: suspended-sentinel 403 hard-navigates to /suspended', async ({
		page,
	}) => {
		await mockAuth(page, 'user');
		await serveFindDetailAtAnyUsername(page);
		await page.route('**/api/profile-by-username**', fulfillSuspended);

		await page.goto('/find/alice');
		await expect.poll(() => new URL(page.url()).pathname, { timeout: 5_000 }).toBe('/suspended');
	});

	test('report-submit returning suspended-sentinel redirects to /suspended', async ({ page }) => {
		// Reporter sits on a profile page (not suspended at page load),
		// clicks Report, hits the API, which returns the sentinel. The
		// dialog is open at submit time, so the redirect has to come
		// from inside the submit handler.
		await mockAuth(page, 'user'); // viewer = alice; profile = alice would self-report
		await serveFindDetailAtAnyUsername(page);
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({
				json: { profile: { ...SAMPLE_PROFILE, githubUsername: 'other', id: 'other-id' } },
			})
		);
		await page.route('**/api/report-submit', fulfillSuspended);

		await page.goto('/find/other');
		await page.locator('#profile-report-btn').click();
		await page.locator('input[name="report-reason"][value="spam"]').check();
		await page.locator('#report-submit-btn').click();

		await expect.poll(() => new URL(page.url()).pathname, { timeout: 5_000 }).toBe('/suspended');
	});

	test('a non-sentinel 403 does NOT redirect to /suspended', async ({ page }) => {
		// E.g., profile-is-private 403. Must NOT trigger the suspension
		// redirect — those are two different auth outcomes.
		await mockAuth(page, 'user');
		await serveFindDetailAtAnyUsername(page);
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({ status: 403, json: { error: 'Profile is private' } })
		);

		await page.goto('/find/alice');
		await expect(page.locator('#private-state')).toBeVisible();
		expect(new URL(page.url()).pathname).toBe('/find/alice');
	});

	test('a 500 does NOT redirect to /suspended', async ({ page }) => {
		await mockAuth(page, 'user');
		await page.route('**/api/profiles', (route) =>
			route.fulfill({ status: 500, json: { error: 'cosmos down' } })
		);

		await page.goto('/find');
		await expect(page.locator('#error-state')).toBeVisible();
		expect(new URL(page.url()).pathname).toBe('/find');
	});
});
