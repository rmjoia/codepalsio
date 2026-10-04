import { test, expect } from '@playwright/test';
import { mockAuth } from './fixtures';

/**
 * Help & feedback menu item (D6). A signed-in user has a user-menu
 * entry that opens the GitHub Issues template in a new tab. The
 * template URL is pinned here so a rename / typo breaks the test
 * before it ships.
 *
 * Scope: markup presence + href shape. We don't actually open the
 * link in Playwright (that would hit GitHub); the href is enough to
 * prove the wiring.
 */

const EXPECTED_HREF = 'https://github.com/rmjoia/codepalsio/issues/new?template=user-help.yml';

test.describe('Header — Help & feedback (D6)', () => {
	test('desktop user menu has a Help & feedback link to the GitHub Issues template', async ({
		page,
	}) => {
		await mockAuth(page, 'user');
		await page.goto('/');
		// The user menu is hidden until auth resolves. Reveal the
		// container by waiting for the auth skeleton to disappear.
		await expect(page.locator('#desktop-auth-skeleton')).toBeHidden();

		const link = page.locator(`#user-menu-container a[href="${EXPECTED_HREF}"]`);
		await expect(link).toBeAttached();
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', /noopener/);
		await expect(link).toHaveAttribute('rel', /noreferrer/);
		await expect(link).toContainText(/help/i);
	});

	test('mobile menu has the same Help & feedback link', async ({ page }) => {
		await mockAuth(page, 'user');
		await page.goto('/');
		// Mobile menu is markup-present even on desktop viewports — the
		// query doesn't require it to be visible, only attached.
		const link = page.locator(`#mobile-signed-in-actions a[href="${EXPECTED_HREF}"]`);
		await expect(link).toBeAttached();
		await expect(link).toHaveAttribute('target', '_blank');
	});

	test('anonymous viewers do not see a Help menu entry (menu itself is hidden)', async ({
		page,
	}) => {
		// The whole user-menu-container is hidden for anonymous viewers;
		// the Help & feedback link lives inside it, so it's effectively
		// hidden too. Pin that invariant.
		await mockAuth(page, 'anonymous');
		await page.goto('/');
		await expect(page.locator('#desktop-auth-skeleton')).toBeHidden();
		await expect(page.locator('#user-menu-container')).toBeHidden();
	});
});
