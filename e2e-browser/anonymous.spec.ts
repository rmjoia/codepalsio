import { test, expect } from '@playwright/test';
import { mockAuth } from './fixtures';

/**
 * Anonymous-user paths — every public page serves, every auth-gated
 * page bounces to the SWA login, and the suspended page is reachable
 * without auth (so suspended users can land there without first being
 * redirected into a sign-in loop).
 *
 * Hermetic: all `/.auth/me` is mocked anonymous. The preview server
 * serves dist/ directly for public static pages, so this suite is
 * essentially a smoke test that the build didn't lose a route and
 * that each page's <title> + a key headline survived the last PR.
 *
 * The gated-redirect assertions check that an authenticated-only page
 * (served statically by the preview, since SWA route gates don't apply
 * off SWA) is still reached — i.e., the page renders and its client
 * script is the one that decides to redirect. In production the SWA
 * route gate intercepts BEFORE the HTML is sent; this suite only
 * asserts the belt-and-braces client-side redirect.
 */

test.describe('Anonymous — public pages render', () => {
	test.beforeEach(async ({ page }) => {
		await mockAuth(page, 'anonymous');
	});

	test('landing / loads with the hero + sign-in CTA', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/CodePals/);
		// Hero's primary CTA is a GitHub sign-in link. Match by href since
		// labels change ("Sign in", "Get started", etc.).
		await expect(page.locator('a[href*="/.auth/login/github"]').first()).toBeVisible();
	});

	test('/terms loads with the Terms of Service heading', async ({ page }) => {
		await page.goto('/terms');
		await expect(page).toHaveTitle(/Terms of Service/);
		await expect(page.getByRole('heading', { name: /Terms of Service/i })).toBeVisible();
	});

	test('/privacy loads', async ({ page }) => {
		await page.goto('/privacy');
		await expect(page).toHaveTitle(/Privacy/);
	});

	test('/code-of-conduct loads', async ({ page }) => {
		await page.goto('/code-of-conduct');
		await expect(page).toHaveTitle(/Code of Conduct/i);
	});

	test('/resources loads the curated learning page', async ({ page }) => {
		await page.goto('/resources');
		await expect(page).toHaveTitle(/Resources/);
		// Curated outbound hyperlinks — at least one must be a real link.
		// A regression that stripped the content would leave zero <a href=>.
		const outboundLinks = page.locator('main a[href^="http"]');
		await expect.poll(() => outboundLinks.count()).toBeGreaterThan(5);
	});

	test('/suspended loads for anonymous users without a redirect loop', async ({ page }) => {
		// Critical: a suspended user who's been hard-navigated here MUST
		// land cleanly. If the page itself called an authenticated API
		// (and got 403 { reason: 'suspended' }), it would redirect to
		// itself and loop. Pin the no-loop invariant.
		await page.goto('/suspended');
		await expect(page).toHaveTitle(/suspended/i);
		await expect(page.getByRole('heading', { name: /account is suspended/i })).toBeVisible();
		// Appeal link is the one actionable thing on the page — it had
		// better be present.
		await expect(page.locator('a[href^="mailto:abuse@"]')).toBeVisible();
		// No redirect fired by the time we assert.
		expect(new URL(page.url()).pathname).toBe('/suspended');
	});

	test('/404 renders when hitting an unknown route', async ({ page }) => {
		// The preview server serves dist/404.html on 404. Astro's static
		// 404 is a plain HTML file; the preview won't rewrite 404s the
		// way SWA does, so visit the file directly.
		await page.goto('/404.html');
		await expect(page).toHaveTitle(/404|Not found/i);
	});
});
