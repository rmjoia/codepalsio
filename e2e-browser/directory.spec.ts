import { test, expect } from '@playwright/test';
import { mockAuth, SAMPLE_PROFILE, serveFindDetailAtAnyUsername } from './fixtures';

/**
 * /find directory — the public listing of CodePals.
 *
 * Hermetic coverage of the states a signed-in user hits when they open
 * the directory: list renders, empty state, error state, click-through
 * into a profile.
 *
 * Visibility-stripped field rendering + 403/404/500 on the detail page
 * are covered in visibility.spec.ts; this suite only covers the
 * list-view surface + the happy navigation path INTO a detail view.
 */

test.describe('/find — directory list states', () => {
	test.beforeEach(async ({ page }) => {
		await mockAuth(page, 'user');
	});

	test('renders a grid of profiles when the API returns some', async ({ page }) => {
		await page.route('**/api/profiles', (route) =>
			route.fulfill({
				json: {
					profiles: [
						{
							id: 'p1',
							githubUsername: 'bob',
							displayName: 'Bob Example',
							availability: 'active',
							location: 'Berlin',
							timezone: 'Europe/Berlin',
							bio: 'Backend engineer, Rust / Go.',
							skills: ['rust', 'go'],
							updatedAt: '2026-05-01T00:00:00Z',
						},
						{
							id: 'p2',
							githubUsername: 'carol',
							displayName: 'Carol Example',
							availability: 'casual',
							location: 'São Paulo',
							timezone: 'America/Sao_Paulo',
							bio: 'Frontend + accessibility advocate.',
							skills: ['typescript', 'accessibility'],
							updatedAt: '2026-04-15T00:00:00Z',
						},
					],
				},
			})
		);
		await page.goto('/find');

		await expect(page.locator('#directory-main')).toBeVisible();
		const grid = page.locator('#directory-grid');
		await expect(grid).toBeVisible();
		// Two profile cards rendered. Match by display name so the
		// assertion survives a change to card markup.
		await expect(grid.getByText('Bob Example')).toBeVisible();
		await expect(grid.getByText('Carol Example')).toBeVisible();

		await expect(page.locator('#loading-state')).toBeHidden();
		await expect(page.locator('#empty-state')).toBeHidden();
		await expect(page.locator('#error-state')).toBeHidden();
	});

	test('shows the empty state when the directory has no profiles', async ({ page }) => {
		await page.route('**/api/profiles', (route) => route.fulfill({ json: { profiles: [] } }));
		await page.goto('/find');

		await expect(page.locator('#empty-state')).toBeVisible();
		await expect(page.locator('#directory-grid')).toBeHidden();
		// Both banners stay hidden on the empty directory — the empty
		// state owns the CTA. Already asserted in visibility.spec.ts; pin
		// it here too since this file is the entry point for new
		// directory assertions.
		await expect(page.locator('#banner-listed')).toBeHidden();
		await expect(page.locator('#banner-not-listed')).toBeHidden();
	});

	test('shows the error state on a 500', async ({ page }) => {
		await page.route('**/api/profiles', (route) =>
			route.fulfill({ status: 500, json: { error: 'oh no' } })
		);
		await page.goto('/find');

		await expect(page.locator('#error-state')).toBeVisible();
		await expect(page.locator('#directory-grid')).toBeHidden();
	});

	test('a profile card links through to /find/<username>', async ({ page }) => {
		await page.route('**/api/profiles', (route) =>
			route.fulfill({
				json: {
					profiles: [
						{
							id: SAMPLE_PROFILE.id,
							githubUsername: SAMPLE_PROFILE.githubUsername,
							displayName: SAMPLE_PROFILE.displayName,
							availability: SAMPLE_PROFILE.availability,
							location: SAMPLE_PROFILE.location,
							timezone: SAMPLE_PROFILE.timezone,
							bio: SAMPLE_PROFILE.bio,
							skills: SAMPLE_PROFILE.skills,
							updatedAt: SAMPLE_PROFILE.updatedAt,
						},
					],
				},
			})
		);
		await serveFindDetailAtAnyUsername(page);
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);

		await page.goto('/find');
		// Each card links to /find/<username>. Click the first one.
		const link = page.locator(`#directory-grid a[href="/find/${SAMPLE_PROFILE.githubUsername}"]`);
		await expect(link).toBeVisible();
		await link.click();

		await expect(page).toHaveURL(new RegExp(`/find/${SAMPLE_PROFILE.githubUsername}$`));
		await expect(page.locator('#profile-display-name')).toHaveText(SAMPLE_PROFILE.displayName);
	});

	test('refreshing the error state re-fires the API call', async ({ page }) => {
		// First call fails, second succeeds — click Refresh and assert the
		// grid rendered. Catches a regression where the refresh button
		// stops firing fetch() (which happened once in #67's lifecycle).
		let callCount = 0;
		await page.route('**/api/profiles', (route) => {
			callCount++;
			if (callCount === 1) {
				return route.fulfill({ status: 500, json: { error: 'first-call' } });
			}
			return route.fulfill({
				json: {
					profiles: [
						{
							id: 'p1',
							githubUsername: 'bob',
							displayName: 'Bob Example',
							availability: 'active',
							location: 'Berlin',
							timezone: 'Europe/Berlin',
							bio: 'Backend engineer.',
							skills: ['rust'],
							updatedAt: '2026-05-01T00:00:00Z',
						},
					],
				},
			});
		});

		await page.goto('/find');
		await expect(page.locator('#error-state')).toBeVisible();
		await page.locator('#directory-refresh-btn').click();
		await expect(page.locator('#directory-grid')).toBeVisible();
		await expect(page.getByText('Bob Example')).toBeVisible();
	});
});

test.describe('/find — role-aware banner behaviour', () => {
	// Case-insensitive + listed/not-listed branches are covered in
	// visibility.spec.ts. This test specifically pins the case where a
	// suspended user's directory call would 403 — the suspended-user
	// redirect is driven by suspension.spec.ts; here we just make sure
	// a successful list for an authenticated viewer still shows the
	// correct banner based on principal.userDetails.

	test('shows the listed banner for a viewer whose username matches a row', async ({ page }) => {
		await mockAuth(page, 'user'); // userDetails = 'alice'
		await page.route('**/api/profiles', (route) =>
			route.fulfill({
				json: {
					profiles: [
						{
							id: 'p1',
							githubUsername: 'alice',
							displayName: 'Alice',
							availability: 'active',
							updatedAt: '2026-05-01T00:00:00Z',
						},
					],
				},
			})
		);

		await page.goto('/find');
		await expect(page.locator('#banner-listed')).toBeVisible();
	});
});
