import { test, expect } from '@playwright/test';
import { mockAuth, SAMPLE_PROFILE, serveFindDetailAtAnyUsername } from './fixtures';

/**
 * Report flow on /find/<username> — the user-side half of the spec-003
 * moderation chain. S3 shipped the dialog + /api/report-submit; this
 * suite exercises the browser interaction end-to-end:
 *   - button → dialog opens
 *   - reason + note submit → correct payload sent
 *   - success toast shows
 *   - API error → inline error in the dialog, no toast
 *   - self-protection: button hidden when viewing your own profile
 */

const REPORTER_PRINCIPAL = {
	// Someone OTHER than the profile owner — matches a viewer who's
	// looking at Alice's page and reporting her. Alice is user-1
	// (SAMPLE_PROFILE.userId); this principal must not collide.
	clientPrincipal: {
		identityProvider: 'github',
		userId: 'reporter-user-id',
		userDetails: 'reporter',
		userRoles: ['authenticated'],
		claims: [],
	},
};

test.describe('/find/<username> — report flow', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/.auth/me', (route) => route.fulfill({ json: REPORTER_PRINCIPAL }));
		await page.route('**/api/get-roles', (route) =>
			route.fulfill({ json: { roles: ['authenticated'] } })
		);
		await serveFindDetailAtAnyUsername(page);
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);
	});

	test('report button opens the dialog with the reason options', async ({ page }) => {
		await page.goto('/find/alice');

		// Button is visible on a profile that isn't the viewer's own.
		await expect(page.locator('#profile-report-wrap')).toBeVisible();
		const reportBtn = page.locator('#profile-report-btn');
		await expect(reportBtn).toBeVisible();

		await reportBtn.click();
		const dialog = page.locator('#report-dialog');
		await expect(dialog).toBeVisible();

		// All five reason values must be selectable. Checked via the
		// value attribute of the radio inputs because labels can rename.
		for (const value of ['off_topic', 'harassment', 'impersonation', 'spam', 'other']) {
			await expect(dialog.locator(`input[name="report-reason"][value="${value}"]`)).toBeAttached();
		}
	});

	test('submits the correct payload to /api/report-submit on happy path', async ({ page }) => {
		await page.goto('/find/alice');

		const requests: Array<{ method: string; postData: string | null }> = [];
		await page.route('**/api/report-submit', (route) => {
			requests.push({
				method: route.request().method(),
				postData: route.request().postData(),
			});
			return route.fulfill({ json: { success: true } });
		});

		await page.locator('#profile-report-btn').click();
		await page.locator('input[name="report-reason"][value="harassment"]').check();
		await page
			.locator('#report-note')
			.fill('Pattern of unwanted messages after I asked them to stop.');
		await page.locator('#report-submit-btn').click();

		// Success toast is the user-visible confirmation.
		await expect(page.locator('#report-toast')).toBeVisible();

		// Request landed exactly once with the right shape.
		expect(requests).toHaveLength(1);
		expect(requests[0].method).toBe('POST');
		const body = JSON.parse(requests[0].postData ?? '{}');
		expect(body).toMatchObject({
			reportedProfileId: SAMPLE_PROFILE.id,
			reason: 'harassment',
			note: 'Pattern of unwanted messages after I asked them to stop.',
		});
	});

	test('shows an inline error (not a toast) when the API rejects the submission', async ({
		page,
	}) => {
		await page.goto('/find/alice');
		await page.route('**/api/report-submit', (route) =>
			route.fulfill({ status: 500, json: { error: 'storage error' } })
		);

		await page.locator('#profile-report-btn').click();
		await page.locator('input[name="report-reason"][value="spam"]').check();
		await page.locator('#report-submit-btn').click();

		// Inline error in the dialog. Toast never shows for failures —
		// otherwise the user thinks the report landed when it didn't.
		await expect(page.locator('#report-error')).toBeVisible();
		await expect(page.locator('#report-toast')).toBeHidden();
	});

	test('cancel closes the dialog and does not call the API', async ({ page }) => {
		await page.goto('/find/alice');

		let apiCalled = false;
		await page.route('**/api/report-submit', (route) => {
			apiCalled = true;
			return route.fulfill({ json: { success: true } });
		});

		await page.locator('#profile-report-btn').click();
		await expect(page.locator('#report-dialog')).toBeVisible();
		await page.locator('#report-cancel-btn').click();
		await expect(page.locator('#report-dialog')).toBeHidden();

		// Small wait is unnecessary — the handler is synchronous on click;
		// if cancel accidentally submitted, the mock would've captured it.
		expect(apiCalled).toBe(false);
	});

	test('note counter updates as the user types', async ({ page }) => {
		await page.goto('/find/alice');
		await page.locator('#profile-report-btn').click();

		await page.locator('#report-note').fill('A short note.');
		// The counter is "N / 500" format; we just assert the N moves off 0.
		await expect(page.locator('#report-note-count')).toContainText(/\b13\b/);
	});
});

test.describe('/find/<username> — self-protection', () => {
	test('report button is hidden when viewing your own profile', async ({ page }) => {
		// Viewer's SWA userDetails === the profile's githubUsername →
		// client-side guard hides the button. (Server also rejects
		// self-reports, but we never want the UI to tempt the user into
		// clicking something that will 400.)
		await mockAuth(page, 'user'); // userDetails = 'alice', profile.githubUsername = 'alice'
		await serveFindDetailAtAnyUsername(page);
		await page.route('**/api/profile-by-username**', (route) =>
			route.fulfill({ json: { profile: SAMPLE_PROFILE } })
		);

		await page.goto('/find/alice');
		await expect(page.locator('#profile-state')).toBeVisible();
		await expect(page.locator('#profile-report-wrap')).toBeHidden();
	});
});
