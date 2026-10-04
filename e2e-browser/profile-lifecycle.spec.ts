import { test, expect } from '@playwright/test';
import { mockAuth, SAMPLE_PROFILE } from './fixtures';

/**
 * /profile — the owner's profile page. One of the most-exercised
 * surfaces on the site: a user lands here after sign-in, builds their
 * profile, toggles visibility, and (hopefully never) deletes.
 *
 * Hermetic coverage:
 *   - View mode renders with API-returned fields
 *   - Edit button swaps to edit mode
 *   - Save hits /api/profile-save with the correct payload shape
 *   - Save failure surfaces an error, keeps the form editable
 *   - Setup flow (no existing profile) auto-enters edit mode
 *
 * Per-field visibility rendering + the save gate on public bio ≥ 50
 * live in dedicated tests. This file is the owner-lifecycle smoke test.
 */

test.describe('/profile — view mode', () => {
	test.beforeEach(async ({ page }) => {
		await mockAuth(page, 'user');
	});

	test('renders view mode with the API-returned fields', async ({ page }) => {
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);
		await page.goto('/profile');

		await expect(page.locator('#profile-main')).toBeVisible();
		await expect(page.locator('#view-mode')).toBeVisible();
		await expect(page.locator('#edit-mode')).toBeHidden();
		await expect(page.locator('#profile-bio')).toContainText(SAMPLE_PROFILE.bio.slice(0, 20));
		await expect(page.locator('#detail-location')).toContainText(SAMPLE_PROFILE.location);
	});

	test('Edit button swaps view → edit mode', async ({ page }) => {
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);
		await page.goto('/profile');

		await page.locator('#edit-btn').click();
		await expect(page.locator('#edit-mode')).toBeVisible();
		await expect(page.locator('#view-mode')).toBeHidden();
		// Form fields pre-populated from the loaded profile.
		await expect(page.locator('#bio')).toHaveValue(SAMPLE_PROFILE.bio);
		await expect(page.locator('#location')).toHaveValue(SAMPLE_PROFILE.location);
	});

	test('Cancel from edit mode returns to view without saving', async ({ page }) => {
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);
		let apiCalled = false;
		await page.route('**/api/profile-save', (route) => {
			apiCalled = true;
			return route.fulfill({ json: { profile: SAMPLE_PROFILE } });
		});
		await page.goto('/profile');

		await page.locator('#edit-btn').click();
		await page.locator('#bio').fill('A different bio I will NOT save.');
		await page.locator('#form-cancel-btn').click();

		await expect(page.locator('#view-mode')).toBeVisible();
		expect(apiCalled).toBe(false);
	});
});

test.describe('/profile — save flow', () => {
	test.beforeEach(async ({ page }) => {
		await mockAuth(page, 'user');
	});

	test('Save POSTs to /api/profile-save with the form values', async ({ page }) => {
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);
		const posts: Array<string | null> = [];
		await page.route('**/api/profile-save', (route) => {
			posts.push(route.request().postData());
			return route.fulfill({
				json: { profile: { ...SAMPLE_PROFILE, bio: 'Updated bio text here.' } },
			});
		});

		await page.goto('/profile');
		await page.locator('#edit-btn').click();
		await page
			.locator('#bio')
			.fill(
				'This is the new bio, long enough to clear the public save gate requirement of fifty characters at minimum.'
			);
		await page.locator('#submit-btn').click();

		await expect.poll(() => posts.length, { timeout: 5_000 }).toBe(1);
		const body = JSON.parse(posts[0] ?? '{}');
		expect(body.bio).toContain('new bio');
		expect(body).toHaveProperty('skills');
		expect(body).toHaveProperty('interests');
	});

	test('Save failure keeps edit mode open', async ({ page }) => {
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);
		await page.route('**/api/profile-save', (route) =>
			route.fulfill({ status: 500, json: { error: 'cosmos down' } })
		);

		await page.goto('/profile');
		await page.locator('#edit-btn').click();
		await page.locator('#submit-btn').click();

		// Still in edit mode — we didn't swap to view because the save failed.
		await expect(page.locator('#edit-mode')).toBeVisible();
	});
});

test.describe('/profile — setup flow (no existing profile)', () => {
	test('404 from profile-get still loads the page cleanly (no error state)', async ({ page }) => {
		// First-time visitor flow: no profile row yet. The page MUST land
		// without going to #error-state — a 404 is the normal pre-save
		// state, not an error. Then the user either clicks Edit from the
		// header, or follows the ?edit=true deep link from /welcome.
		await mockAuth(page, 'user');
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ status: 404, json: { error: 'Not found' } })
		);
		await page.goto('/profile');

		await expect(page.locator('#profile-main')).toBeVisible();
		await expect(page.locator('#error-state')).toBeHidden();
	});

	test('?edit=true direct link drops into edit mode even without a profile', async ({ page }) => {
		// Deep link that bypasses view mode — the primary onboarding
		// entry point from /welcome.
		await mockAuth(page, 'user');
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ status: 404, json: { error: 'Not found' } })
		);
		await page.goto('/profile?edit=true');

		await expect(page.locator('#edit-mode')).toBeVisible();
		await expect(page.locator('#bio')).toHaveValue('');
	});
});
