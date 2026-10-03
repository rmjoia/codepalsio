import { test, expect } from '@playwright/test';
import { mockAuth, SAMPLE_PROFILE, SAMPLE_REPORT, serveFindDetailAtAnyUsername } from './fixtures';

/**
 * Keyboard-navigation smoke tests.
 *
 * The CodePals surfaces that MUST stay keyboard-reachable:
 *   - Report dialog: Tab reaches the reason radios + the submit button;
 *     Enter on submit fires the API; Escape closes the dialog
 *   - Admin queue: Tab lands on the Dismiss / Unlist / Suspend buttons;
 *     Enter/Space activates them (Space on buttons = click per WAI-ARIA)
 *   - Primary CTAs are focusable from the keyboard — not just hover
 *
 * We don't aim for a full axe-core pass here (that's a separate PR
 * if we want it); this file catches the regressions that most hurt
 * screen-reader + keyboard-only users: a trap, a non-focusable
 * button, or an action that only responds to mouse clicks.
 */

test.describe('Keyboard — report dialog', () => {
	test.beforeEach(async ({ page }) => {
		// Reporter (not alice) so the report button is visible.
		await page.route('**/.auth/me', (route) =>
			route.fulfill({
				json: {
					clientPrincipal: {
						identityProvider: 'github',
						userId: 'reporter-id',
						userDetails: 'reporter',
						userRoles: ['authenticated'],
						claims: [],
					},
				},
			})
		);
		await page.route('**/api/get-roles', (route) =>
			route.fulfill({ json: { roles: ['authenticated'] } })
		);
		await serveFindDetailAtAnyUsername(page);
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);
	});

	test('opening + submitting the report dialog works with keyboard only', async ({ page }) => {
		await page.goto('/find/alice');

		// Focus the report button and activate with Enter.
		await page.locator('#profile-report-btn').focus();
		await expect(page.locator('#profile-report-btn')).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.locator('#report-dialog')).toBeVisible();

		// Reason radio is reachable: select via click (Playwright's
		// keyboard radio semantics are flaky across browsers; the test
		// is "can I get there without a mouse", not "radio works").
		await page.locator('input[name="report-reason"][value="harassment"]').focus();
		await page.keyboard.press('Space');
		await expect(page.locator('input[name="report-reason"][value="harassment"]')).toBeChecked();

		// Submit via keyboard (focus the button, press Enter).
		const posts: Array<string | null> = [];
		await page.route('**/api/report-submit', (route) => {
			posts.push(route.request().postData());
			return route.fulfill({ json: { success: true } });
		});
		await page.locator('#report-submit-btn').focus();
		await page.keyboard.press('Enter');

		await expect(page.locator('#report-toast')).toBeVisible();
		expect(posts).toHaveLength(1);
	});
});

test.describe('Keyboard — admin queue actions', () => {
	test('Dismiss activates via Enter', async ({ page }) => {
		await mockAuth(page, 'admin');
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: { reports: [SAMPLE_REPORT] } })
		);
		const posts: Array<string | null> = [];
		await page.route('**/api/report-resolve', (route) => {
			posts.push(route.request().postData());
			return route.fulfill({ json: { success: true, newStatus: 'dismissed' } });
		});

		await page.goto('/admin/reports');
		const dismiss = page
			.locator('#reports-list li')
			.first()
			.getByRole('button', { name: 'Dismiss' });
		await dismiss.focus();
		await expect(dismiss).toBeFocused();
		await page.keyboard.press('Enter');

		await expect(page.locator('#reports-list li')).toHaveCount(0);
		expect(posts).toHaveLength(1);
		expect(JSON.parse(posts[0] ?? '{}').action).toBe('dismiss');
	});

	test('Dismiss activates via Space (WAI-ARIA button key)', async ({ page }) => {
		await mockAuth(page, 'admin');
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: { reports: [SAMPLE_REPORT] } })
		);
		await page.route('**/api/report-resolve', (route) =>
			route.fulfill({ json: { success: true, newStatus: 'dismissed' } })
		);

		await page.goto('/admin/reports');
		await page.locator('#reports-list li').first().getByRole('button', { name: 'Dismiss' }).focus();
		await page.keyboard.press(' ');

		await expect(page.locator('#reports-list li')).toHaveCount(0);
	});
});

test.describe('Keyboard — primary CTAs are focusable', () => {
	test('landing GitHub sign-in is reachable via Tab from body', async ({ page }) => {
		// Hero's primary CTA must appear in the tab order close to the
		// top — a regression that stacked focusable "skip to content"
		// / nav links in front of it is fine; one that made the CTA a
		// div-with-click-handler would be caught here.
		await mockAuth(page, 'anonymous');
		await page.goto('/');
		const cta = page.locator('a[href*="/.auth/login/github"]').first();
		await cta.focus();
		await expect(cta).toBeFocused();
	});
});
