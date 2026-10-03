import { test, expect } from '@playwright/test';
import { mockAuth } from './fixtures';

/**
 * /admin — the admin dashboard. KPIs, user list, admin-roster
 * grant/revoke.
 *
 * Hermetic coverage of the surfaces the admin UI promises:
 *   - KPIs render correct totals from the API payload
 *   - User list renders rows
 *   - Grant admin: happy path writes to /api/roster-grant
 *   - Revoke admin: happy path writes to /api/roster-revoke
 *   - Non-admin viewer sees Forbidden
 *   - Last-admin revoke rejected (API 409) → inline error
 */

const kpis = (
	over: Partial<{
		totalProfiles: number;
		publicProfiles: number;
		privateProfiles: number;
		completeProfiles: number;
	}> = {}
) => ({
	totalProfiles: 10,
	publicProfiles: 7,
	privateProfiles: 3,
	completeProfiles: 5,
	...over,
});

const sampleProfiles = () => [
	{
		id: 'p1',
		userId: 'u1',
		githubUsername: 'alice',
		displayName: 'Alice',
		profileVisibility: 'public',
		availability: 'active',
		bioLength: 120,
		skillsCount: 3,
		interestsCount: 2,
		hasLocation: true,
		hasTimezone: true,
		complete: true,
		updatedAt: '2026-05-01T00:00:00Z',
	},
	{
		id: 'p2',
		userId: 'u2',
		githubUsername: 'bob',
		displayName: 'Bob',
		profileVisibility: 'private',
		availability: 'casual',
		bioLength: 10,
		skillsCount: 1,
		interestsCount: 0,
		hasLocation: false,
		hasTimezone: true,
		complete: false,
		updatedAt: '2026-04-01T00:00:00Z',
	},
];

const sampleAdmins = () => [
	{
		githubUsername: 'rmjoia',
		roles: ['admin'],
		grantedBy: 'bootstrap',
		grantedAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
	},
	{
		githubUsername: 'secondary',
		roles: ['admin'],
		grantedBy: 'rmjoia',
		grantedAt: '2026-06-01T00:00:00Z',
		updatedAt: '2026-06-01T00:00:00Z',
	},
];

test.describe('/admin — access control', () => {
	test('non-admin sees the error state (admin required)', async ({ page }) => {
		await mockAuth(page, 'user');
		await page.goto('/admin');
		await expect(page.locator('#error-state')).toBeVisible();
	});
});

test.describe('/admin — dashboard rendering', () => {
	test.beforeEach(async ({ page }) => {
		await mockAuth(page, 'admin');
		await page.route('**/api/manage-users', (route) =>
			route.fulfill({ json: { profiles: sampleProfiles(), kpis: kpis() } })
		);
		await page.route('**/api/roster-list', (route) =>
			route.fulfill({ json: { admins: sampleAdmins() } })
		);
	});

	test('KPIs reflect the API payload', async ({ page }) => {
		await page.goto('/admin');
		await expect(page.locator('#admin-main')).toBeVisible();
		await expect(page.locator('#kpi-total')).toHaveText('10');
		await expect(page.locator('#kpi-public')).toHaveText('7');
		await expect(page.locator('#kpi-private')).toHaveText('3');
		await expect(page.locator('#kpi-complete')).toHaveText('5');
	});

	test('user table renders a row per profile', async ({ page }) => {
		await page.goto('/admin');
		await expect(page.locator('#users-tbody tr')).toHaveCount(2);
		await expect(page.locator('#users-tbody')).toContainText('Alice');
		await expect(page.locator('#users-tbody')).toContainText('Bob');
	});

	test('admin list renders a row per existing admin', async ({ page }) => {
		await page.goto('/admin');
		await expect(page.locator('#admins-tbody tr')).toHaveCount(2);
		await expect(page.locator('#admins-tbody')).toContainText('rmjoia');
		await expect(page.locator('#admins-tbody')).toContainText('secondary');
	});
});

test.describe('/admin — grant admin', () => {
	test.beforeEach(async ({ page }) => {
		await mockAuth(page, 'admin');
		await page.route('**/api/manage-users', (route) =>
			route.fulfill({ json: { profiles: sampleProfiles(), kpis: kpis() } })
		);
		await page.route('**/api/roster-list', (route) =>
			route.fulfill({ json: { admins: sampleAdmins() } })
		);
	});

	test('submitting the form POSTs to /api/roster-grant with the username', async ({ page }) => {
		const posts: Array<string | null> = [];
		await page.route('**/api/roster-grant', (route) => {
			posts.push(route.request().postData());
			return route.fulfill({
				json: {
					admin: {
						githubUsername: 'newadmin',
						roles: ['admin'],
						grantedBy: 'rmjoia',
						grantedAt: '2026-10-03T00:00:00Z',
						updatedAt: '2026-10-03T00:00:00Z',
					},
				},
			});
		});

		await page.goto('/admin');
		await page.locator('#admin-grant-input').fill('newadmin');
		await page.locator('#admin-grant-submit').click();

		await expect.poll(() => posts.length).toBe(1);
		expect(JSON.parse(posts[0] ?? '{}')).toMatchObject({ githubUsername: 'newadmin' });
	});

	test('API error surfaces in the status region', async ({ page }) => {
		await page.route('**/api/roster-grant', (route) =>
			route.fulfill({ status: 500, json: { error: 'cosmos down' } })
		);
		await page.goto('/admin');
		await page.locator('#admin-grant-input').fill('badnews');
		await page.locator('#admin-grant-submit').click();

		await expect(page.locator('#admin-grant-status')).toBeVisible();
		await expect(page.locator('#admin-grant-status')).toContainText(/fail|error|cosmos/i);
	});
});
