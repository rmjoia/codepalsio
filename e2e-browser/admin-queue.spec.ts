import { test, expect } from '@playwright/test';
import { mockAuth, SAMPLE_REPORT } from './fixtures';

/**
 * /admin/reports — the moderation queue (spec 003 US3).
 *
 * The admin-facing half of the moderation chain. Hermetic coverage:
 *   - access control (non-admin → forbidden; anon → login redirect)
 *   - renders rows + brigading badge on reportCount > 1
 *   - Dismiss / Unlist / Suspend each hit /api/report-resolve with the
 *     correct action, and the dismissed/unlisted/suspended row
 *     disappears from the queue on success
 *   - Unlist requires confirm()
 *   - Suspend requires a typed-SUSPEND prompt() — wrong text → no API
 *     call
 *   - inline per-row error on API failure
 */

const queueOf = (reports: unknown[]): { reports: unknown[] } => ({ reports });

const anotherReport = (overrides: Partial<typeof SAMPLE_REPORT> = {}) => ({
	...SAMPLE_REPORT,
	id: 'report-2',
	reporterId: 'user-3',
	reportedProfileId: 'profile-ghost',
	reportedUserId: 'user-ghost',
	reportedUsername: 'ghost',
	reason: 'spam' as const,
	note: '',
	createdAt: '2026-10-02T13:00:00Z',
	...overrides,
});

test.describe('/admin/reports — access control', () => {
	test('non-admin sees the forbidden/admin-required state', async ({ page }) => {
		await mockAuth(page, 'user'); // authenticated but not admin
		await page.goto('/admin/reports');

		// The page's own init() falls into failed('Admin access required',…)
		// — rendered via #error-state.
		await expect(page.locator('#error-state')).toBeVisible();
		await expect(page.locator('#error-title')).toContainText(/admin/i);
		await expect(page.locator('#admin-main')).toBeHidden();
	});

	test('anonymous is bounced to the SWA sign-in', async ({ page }) => {
		await mockAuth(page, 'anonymous');
		await page.goto('/admin/reports');

		// Client script sets window.location.href on anon. The preview
		// server won't follow the GitHub-auth path, but the URL will
		// change away from /admin/reports (either to a login path, or
		// to a 404 for the fake path if following was attempted).
		// Either way: it is NOT /admin/reports anymore.
		await expect
			.poll(() => new URL(page.url()).pathname, { timeout: 5_000 })
			.not.toBe('/admin/reports');
	});
});

test.describe('/admin/reports — queue rendering', () => {
	test.beforeEach(async ({ page }) => {
		await mockAuth(page, 'admin');
	});

	test('renders an open report row and the empty state is hidden', async ({ page }) => {
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: queueOf([SAMPLE_REPORT]) })
		);
		await page.goto('/admin/reports');

		await expect(page.locator('#admin-main')).toBeVisible();
		const list = page.locator('#reports-list');
		await expect(list).toBeVisible();
		await expect(list.locator('li')).toHaveCount(1);
		await expect(list.locator('li').first()).toContainText(SAMPLE_REPORT.reportedProfileId);
		await expect(list.locator('li').first()).toContainText('Harassment');
		await expect(page.locator('#empty-state')).toBeHidden();
	});

	test('shows the empty state when there are no open reports', async ({ page }) => {
		await page.route('**/api/reports-list', (route) => route.fulfill({ json: queueOf([]) }));
		await page.goto('/admin/reports');

		await expect(page.locator('#empty-state')).toBeVisible();
		await expect(page.locator('#reports-list')).toBeHidden();
	});

	test('renders the brigading badge when reportCount > 1', async ({ page }) => {
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: queueOf([{ ...SAMPLE_REPORT, reportCount: 4 }]) })
		);
		await page.goto('/admin/reports');

		await expect(page.locator('#reports-list li').first()).toContainText('× 4 reports');
	});

	test('does NOT render the brigading badge for a single report', async ({ page }) => {
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: queueOf([{ ...SAMPLE_REPORT, reportCount: 1 }]) })
		);
		await page.goto('/admin/reports');

		await expect(page.locator('#reports-list li').first()).not.toContainText('reports');
	});
});

test.describe('/admin/reports — action buttons', () => {
	test.beforeEach(async ({ page }) => {
		await mockAuth(page, 'admin');
	});

	test('Dismiss hits /api/report-resolve with action=dismiss and removes the row', async ({
		page,
	}) => {
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: queueOf([SAMPLE_REPORT]) })
		);

		const posts: Array<{ postData: string | null }> = [];
		await page.route('**/api/report-resolve', (route) => {
			posts.push({ postData: route.request().postData() });
			return route.fulfill({ json: { success: true, newStatus: 'dismissed' } });
		});

		await page.goto('/admin/reports');
		await page.locator('#reports-list li').first().getByRole('button', { name: 'Dismiss' }).click();

		await expect(page.locator('#reports-list li')).toHaveCount(0);
		await expect(page.locator('#empty-state')).toBeVisible();

		expect(posts).toHaveLength(1);
		expect(JSON.parse(posts[0].postData ?? '{}')).toMatchObject({
			reportId: SAMPLE_REPORT.id,
			reportedProfileId: SAMPLE_REPORT.reportedProfileId,
			action: 'dismiss',
		});
	});

	test('Unlist shows a confirm dialog — accepting fires the API with action=unlist', async ({
		page,
	}) => {
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: queueOf([SAMPLE_REPORT]) })
		);
		const posts: Array<string | null> = [];
		await page.route('**/api/report-resolve', (route) => {
			posts.push(route.request().postData());
			return route.fulfill({ json: { success: true, newStatus: 'resolved' } });
		});

		page.on('dialog', (dialog) => {
			expect(dialog.type()).toBe('confirm');
			expect(dialog.message()).toMatch(/unlist/i);
			return dialog.accept();
		});

		await page.goto('/admin/reports');
		await page.locator('#reports-list li').first().getByRole('button', { name: 'Unlist' }).click();

		await expect(page.locator('#reports-list li')).toHaveCount(0);
		expect(posts).toHaveLength(1);
		expect(JSON.parse(posts[0] ?? '{}').action).toBe('unlist');
	});

	test('Unlist confirm — rejecting does NOT fire the API', async ({ page }) => {
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: queueOf([SAMPLE_REPORT]) })
		);
		let apiCalled = false;
		await page.route('**/api/report-resolve', (route) => {
			apiCalled = true;
			return route.fulfill({ json: {} });
		});

		page.on('dialog', (dialog) => dialog.dismiss());

		await page.goto('/admin/reports');
		await page.locator('#reports-list li').first().getByRole('button', { name: 'Unlist' }).click();

		// Row remains, API never called.
		await expect(page.locator('#reports-list li')).toHaveCount(1);
		// Flush the microtask queue in case dialog.dismiss resolved async.
		await page.waitForTimeout(50);
		expect(apiCalled).toBe(false);
	});

	test('Suspend requires typed SUSPEND — correct text fires /api/report-resolve with action=suspend', async ({
		page,
	}) => {
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: queueOf([SAMPLE_REPORT]) })
		);
		const posts: Array<string | null> = [];
		await page.route('**/api/report-resolve', (route) => {
			posts.push(route.request().postData());
			return route.fulfill({ json: { success: true, newStatus: 'resolved' } });
		});

		page.on('dialog', (dialog) => {
			expect(dialog.type()).toBe('prompt');
			expect(dialog.message()).toMatch(/suspend/i);
			return dialog.accept('SUSPEND');
		});

		await page.goto('/admin/reports');
		await page.locator('#reports-list li').first().getByRole('button', { name: 'Suspend' }).click();

		await expect(page.locator('#reports-list li')).toHaveCount(0);
		expect(posts).toHaveLength(1);
		expect(JSON.parse(posts[0] ?? '{}').action).toBe('suspend');
	});

	test('Suspend with wrong typed text does NOT fire the API', async ({ page }) => {
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: queueOf([SAMPLE_REPORT]) })
		);
		let apiCalled = false;
		await page.route('**/api/report-resolve', (route) => {
			apiCalled = true;
			return route.fulfill({ json: {} });
		});

		page.on('dialog', (dialog) => dialog.accept('suspend'));
		// lowercase — the handler compares against literal 'SUSPEND'.

		await page.goto('/admin/reports');
		await page.locator('#reports-list li').first().getByRole('button', { name: 'Suspend' }).click();

		await expect(page.locator('#reports-list li')).toHaveCount(1);
		await page.waitForTimeout(50);
		expect(apiCalled).toBe(false);
	});

	test('API error leaves the row + shows an inline error line', async ({ page }) => {
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: queueOf([SAMPLE_REPORT]) })
		);
		await page.route('**/api/report-resolve', (route) =>
			route.fulfill({ status: 500, json: { error: 'cosmos down' } })
		);

		await page.goto('/admin/reports');
		await page.locator('#reports-list li').first().getByRole('button', { name: 'Dismiss' }).click();

		// Row still there; the per-row error paragraph is now visible.
		await expect(page.locator('#reports-list li')).toHaveCount(1);
		const errorLine = page.locator('#reports-list li').first().locator('p[data-role="row-error"]');
		await expect(errorLine).toBeVisible();
	});

	test('resolving the last row flips the queue to the empty state', async ({ page }) => {
		await page.route('**/api/reports-list', (route) =>
			route.fulfill({ json: queueOf([SAMPLE_REPORT, anotherReport()]) })
		);
		await page.route('**/api/report-resolve', (route) =>
			route.fulfill({ json: { success: true, newStatus: 'dismissed' } })
		);

		await page.goto('/admin/reports');
		await expect(page.locator('#reports-list li')).toHaveCount(2);
		await page.locator('#reports-list li').nth(0).getByRole('button', { name: 'Dismiss' }).click();
		await expect(page.locator('#reports-list li')).toHaveCount(1);
		await expect(page.locator('#empty-state')).toBeHidden();
		await page.locator('#reports-list li').nth(0).getByRole('button', { name: 'Dismiss' }).click();
		await expect(page.locator('#reports-list li')).toHaveCount(0);
		await expect(page.locator('#empty-state')).toBeVisible();
	});
});
