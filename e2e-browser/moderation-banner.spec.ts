import { test, expect } from '@playwright/test';
import { mockAuth, SAMPLE_PROFILE } from './fixtures';

/**
 * /profile — owner-side "unlisted by a moderator" banner (spec 003 US3
 * FR-125).
 *
 * When a report ends in `unlist`, the server stamps `unlistedBy` on the
 * profile. On the owner's /profile page, this flag:
 *   1. Reveals the #unlisted-banner block (hidden by default)
 *   2. Disables the "public" visibility radio so the owner can't
 *      self-republish — they can appeal via the Terms link / abuse email
 *      in the banner, and only a moderator can clear the flag
 *
 * These invariants are pinned at source level in moderation-queue.test.ts
 * (regex over the .astro). This file pins the browser behaviour: the
 * banner actually renders, the radio actually disables, in a real DOM.
 */

test.describe('/profile — moderator unlist banner', () => {
	test.beforeEach(async ({ page }) => {
		await mockAuth(page, 'user');
	});

	test('shows the banner in view mode when unlistedBy is set', async ({ page }) => {
		// Banner lives inside #view-mode (not #edit-mode) by design — the
		// owner needs to see it the moment they land on their profile,
		// before they decide to edit.
		const unlisted = {
			...SAMPLE_PROFILE,
			profileVisibility: 'private' as const,
			unlistedBy: 'admin-1',
		};
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ json: { profile: unlisted } })
		);

		await page.goto('/profile');

		await expect(page.locator('#unlisted-banner')).toBeVisible();
		// Appeal paths are present in the banner.
		await expect(page.locator('#unlisted-banner a[href="/terms"]')).toBeVisible();
		await expect(page.locator('#unlisted-banner a[href^="mailto:abuse@"]')).toBeVisible();
	});

	test('disables the public-visibility radio in edit mode when unlistedBy is set', async ({
		page,
	}) => {
		// Radio lives inside #edit-mode. The public option is disabled so
		// the owner can't just toggle themselves back; the private option
		// stays enabled.
		const unlisted = {
			...SAMPLE_PROFILE,
			profileVisibility: 'private' as const,
			unlistedBy: 'admin-1',
		};
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ json: { profile: unlisted } })
		);

		await page.goto('/profile?edit=true');

		await expect(page.locator('input[name="profileVisibility"][value="public"]')).toBeDisabled();
		await expect(
			page.locator('input[name="profileVisibility"][value="private"]')
		).not.toBeDisabled();
	});

	test('keeps the banner hidden on a profile without unlistedBy', async ({ page }) => {
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);
		await page.goto('/profile');

		await expect(page.locator('#unlisted-banner')).toBeHidden();
	});

	test('public radio is NOT disabled on a profile without unlistedBy', async ({ page }) => {
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);
		await page.goto('/profile?edit=true');

		await expect(
			page.locator('input[name="profileVisibility"][value="public"]')
		).not.toBeDisabled();
	});
});
