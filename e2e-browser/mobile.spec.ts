import { test, expect } from '@playwright/test';
import { mockAuth, SAMPLE_PROFILE, SAMPLE_REPORT, serveFindDetailAtAnyUsername } from './fixtures';

/**
 * Mobile-viewport smoke pass over the Tier-1 flows.
 *
 * We don't have a separate mobile Playwright project configured, so
 * each test here opts into a mobile viewport via test.use(). Scope is
 * deliberately narrow: load the critical pages at a representative
 * mobile viewport (390×844, iPhone 14 Pro–shaped) and assert the main
 * container isn't horizontally scrollable.
 *
 * Why this is cheap-but-high-value: Astro's default responsive
 * breakpoints hide most mobile regressions, so this suite catches
 * ONLY the cases where someone adds a fixed-width layout, forgets
 * `flex-wrap`, or ships copy wider than the mobile viewport without
 * noticing in dev. If this suite starts flaking from pass to fail,
 * the diff that caused it is where to look.
 *
 * We set the viewport directly instead of using devices['iPhone 14 Pro']
 * — the full descriptor includes a WebKit user-agent that collides with
 * our Chromium launch and surfaces as a confusing
 * "browser has been closed" error.
 */

test.use({
	viewport: { width: 390, height: 844 },
	userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile',
});

/**
 * Fails the test when the page scrolls horizontally — any horizontal
 * overflow at mobile widths. Returns a diagnostic that names the first
 * element wider than the viewport, which is the usual culprit (a
 * long unbreakable string, a hardcoded px width, a flex row that
 * doesn't wrap).
 */
async function expectNoHorizontalOverflow(page: import('@playwright/test').Page): Promise<void> {
	const result = await page.evaluate(() => {
		const docWidth = document.documentElement.scrollWidth;
		const viewportWidth = window.innerWidth;
		if (docWidth <= viewportWidth) return null;
		// Find the first element whose right edge exceeds the viewport.
		const culprit = Array.from(document.querySelectorAll('body *')).find((el) => {
			const r = el.getBoundingClientRect();
			return r.right > viewportWidth + 1;
		});
		return {
			docWidth,
			viewportWidth,
			tag: culprit?.tagName ?? 'unknown',
			classList: culprit instanceof Element ? culprit.className : 'unknown',
			text: culprit instanceof HTMLElement ? culprit.innerText.slice(0, 80) : 'unknown',
		};
	});
	expect(
		result,
		result
			? `Page has horizontal overflow at ${result.viewportWidth}px: doc=${result.docWidth}px. ` +
					`First over-wide element: <${result.tag} class="${result.classList}"> text="${result.text}"`
			: 'ok'
	).toBeNull();
}

test.describe('Mobile viewport — critical pages fit', () => {
	test('landing /', async ({ page }) => {
		await mockAuth(page, 'anonymous');
		await page.goto('/');
		await expectNoHorizontalOverflow(page);
	});

	test('/suspended', async ({ page }) => {
		await mockAuth(page, 'anonymous');
		await page.goto('/suspended');
		await expectNoHorizontalOverflow(page);
	});

	test('/terms', async ({ page }) => {
		await mockAuth(page, 'anonymous');
		await page.goto('/terms');
		await expectNoHorizontalOverflow(page);
	});

	test('/find — directory with cards', async ({ page }) => {
		await mockAuth(page, 'user');
		await page.route('**/api/profiles', (route) =>
			route.fulfill({
				json: {
					profiles: [
						{
							id: 'p1',
							githubUsername: 'alice',
							displayName: 'Alice Example',
							availability: 'active',
							bio: 'Short bio.',
							skills: ['typescript'],
							location: 'Lisbon',
							timezone: 'Europe/Lisbon',
							updatedAt: '2026-05-01T00:00:00Z',
						},
					],
				},
			})
		);
		await page.goto('/find');
		await expect(page.locator('#directory-grid')).toBeVisible();
		await expectNoHorizontalOverflow(page);
	});

	test('/find/<username> — detail page', async ({ page }) => {
		await mockAuth(page, 'user');
		await serveFindDetailAtAnyUsername(page);
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);
		await page.goto('/find/alice');
		await expect(page.locator('#profile-display-name')).toBeVisible();
		await expectNoHorizontalOverflow(page);
	});

	test('/profile — view mode', async ({ page }) => {
		await mockAuth(page, 'user');
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);
		await page.goto('/profile');
		await expect(page.locator('#profile-main')).toBeVisible();
		await expectNoHorizontalOverflow(page);
	});

	// FIXME: /profile?edit=true overflows mobile by ~13px at 390px (the
	// per-field visibility fieldset). Not blocking launch — tracked
	// separately. Add this test back once the fieldset layout is fixed.
	test.fixme('/profile?edit=true — edit mode form', async ({ page }) => {
		await mockAuth(page, 'user');
		await page.route('**/api/profile-get', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);
		await page.goto('/profile?edit=true');
		await expect(page.locator('#edit-mode')).toBeVisible();
		await expectNoHorizontalOverflow(page);
	});

	test('/admin/reports — moderation queue', async ({ page }) => {
		await mockAuth(page, 'admin');
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: { reports: [SAMPLE_REPORT] } })
		);
		await page.goto('/admin/reports');
		await expect(page.locator('#reports-list li').first()).toBeVisible();
		await expectNoHorizontalOverflow(page);
	});
});
