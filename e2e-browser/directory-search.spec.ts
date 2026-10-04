import { test, expect } from '@playwright/test';
import { mockAuth } from './fixtures';

/**
 * /find directory search box (D5). Covers the user-visible contract:
 *   - typing in the search box fires /api/profiles?q=<value> after a
 *     250ms debounce
 *   - results re-render on each new query
 *   - no-results state shows (distinct from empty-state) when the
 *     filter matches nothing
 *   - Clear-search button on the no-results card drops the query and
 *     restores the full list
 *   - banners (You're listed / Want to be listed?) are hidden on
 *     filtered views
 *   - lookingFor renders on each card when present
 *
 * The server-side matching is unit-tested in
 * api/src/profiles-list.test.ts (profileMatchesQuery + handler ?q=
 * tests). This file only asserts the browser-side wiring.
 */

const ALL_PROFILES = [
	{
		id: 'p1',
		githubUsername: 'alice',
		githubUrl: 'https://github.com/alice',
		displayName: 'Alice Example',
		availability: 'active',
		bio: 'Backend engineer.',
		skills: ['rust', 'postgres'],
		lookingFor: 'Looking to pair-program on a WebAssembly interpreter.',
		updatedAt: '2026-05-01T00:00:00Z',
	},
	{
		id: 'p2',
		githubUsername: 'bob',
		displayName: 'Bob Example',
		availability: 'casual',
		bio: 'Mobile dev.',
		skills: ['swift', 'kotlin'],
		lookingFor: undefined,
		updatedAt: '2026-04-15T00:00:00Z',
	},
];

test.describe('/find — search box (D5)', () => {
	test.beforeEach(async ({ page }) => {
		await mockAuth(page, 'user');
	});

	test('typing fires /api/profiles?q=<value> with the entered query', async ({ page }) => {
		const requests: string[] = [];
		await page.route('**/api/profiles**', (route) => {
			requests.push(route.request().url());
			return route.fulfill({ json: { profiles: ALL_PROFILES } });
		});

		await page.goto('/find');
		await expect(page.locator('#directory-grid')).toBeVisible();

		await page.locator('#directory-search').fill('webassembly');

		// Debounce is 250ms — wait for the subsequent request. Polling
		// avoids flaky time-based waits.
		await expect
			.poll(() => requests.some((u) => u.includes('q=webassembly')), { timeout: 5_000 })
			.toBe(true);
	});

	test('typing a shorter prefix overrides a longer one (debounce coalesces keystrokes)', async ({
		page,
	}) => {
		const requests: string[] = [];
		await page.route('**/api/profiles**', (route) => {
			requests.push(new URL(route.request().url()).searchParams.get('q') ?? '');
			return route.fulfill({ json: { profiles: ALL_PROFILES } });
		});

		await page.goto('/find');
		await expect(page.locator('#directory-grid')).toBeVisible();

		// Rapid typing: debounce should swallow intermediate values and
		// fire ONE request with the final value, not seven.
		const input = page.locator('#directory-search');
		await input.fill('r');
		await input.fill('ru');
		await input.fill('rus');
		await input.fill('rust');

		await expect.poll(() => requests.filter((q) => q === 'rust').length).toBeGreaterThanOrEqual(1);
		// Intermediate values (r, ru, rus) should NOT have fired a
		// request — the 250ms debounce coalesces them. Allow at most
		// one historical "" request (the initial unfiltered load).
		const intermediates = requests.filter((q) => q && q !== 'rust');
		expect(
			intermediates,
			`Unexpected debounced-through requests: ${JSON.stringify(intermediates)}`
		).toHaveLength(0);
	});

	test('zero-match query shows the no-results state (not empty-state)', async ({ page }) => {
		// Server receives the query, filters, returns [].
		await page.route('**/api/profiles**', (route) => {
			const q = new URL(route.request().url()).searchParams.get('q') ?? '';
			const profiles = q ? [] : ALL_PROFILES;
			return route.fulfill({ json: { profiles } });
		});

		await page.goto('/find');
		await expect(page.locator('#directory-grid')).toBeVisible();

		await page.locator('#directory-search').fill('cobol-and-fortran');

		await expect(page.locator('#no-results-state')).toBeVisible();
		await expect(page.locator('#empty-state')).toBeHidden();
		await expect(page.locator('#directory-grid')).toBeHidden();
	});

	test('empty-query result shows the empty-state (not no-results)', async ({ page }) => {
		// Different message required: there are no public profiles AT
		// ALL vs the current filter matches none.
		await page.route('**/api/profiles**', (route) => route.fulfill({ json: { profiles: [] } }));
		await page.goto('/find');

		await expect(page.locator('#empty-state')).toBeVisible();
		await expect(page.locator('#no-results-state')).toBeHidden();
	});

	test('Clear-search button restores the unfiltered view', async ({ page }) => {
		await page.route('**/api/profiles**', (route) => {
			const q = new URL(route.request().url()).searchParams.get('q') ?? '';
			const profiles = q ? [] : ALL_PROFILES;
			return route.fulfill({ json: { profiles } });
		});

		await page.goto('/find');
		await page.locator('#directory-search').fill('nonsense');
		await expect(page.locator('#no-results-state')).toBeVisible();

		await page.locator('#no-results-clear-btn').click();

		await expect(page.locator('#directory-grid')).toBeVisible();
		await expect(page.locator('#no-results-state')).toBeHidden();
		// Search input emptied so the user can type a new query.
		await expect(page.locator('#directory-search')).toHaveValue('');
	});

	test('listed-ness banners hide on filtered views (only show on unfiltered)', async ({ page }) => {
		// Viewer userDetails = 'alice'; alice is in the directory so
		// the "You're listed" banner would normally show. On a
		// filtered view it must NOT render — the current filter may
		// exclude the viewer, making "You're listed" confusing.
		await page.route('**/api/profiles**', (route) => {
			const q = new URL(route.request().url()).searchParams.get('q') ?? '';
			const profiles = q
				? ALL_PROFILES.filter((p) => p.displayName.toLowerCase().includes(q))
				: ALL_PROFILES;
			return route.fulfill({ json: { profiles } });
		});

		await page.goto('/find');
		// Unfiltered: listed banner shows.
		await expect(page.locator('#banner-listed')).toBeVisible();

		await page.locator('#directory-search').fill('bob');
		await expect.poll(() => page.locator('#banner-listed').isVisible()).toBe(false);
		await expect(page.locator('#banner-not-listed')).toBeHidden();
	});

	test('card renders the lookingFor callout when present', async ({ page }) => {
		await page.route('**/api/profiles**', (route) =>
			route.fulfill({ json: { profiles: [ALL_PROFILES[0]] } })
		);
		await page.goto('/find');

		// Alice has lookingFor set — the callout should contain her text.
		await expect(
			page.getByText('Looking to pair-program on a WebAssembly interpreter.')
		).toBeVisible();
	});

	test('card does NOT render a lookingFor element when the field is empty', async ({ page }) => {
		// Bob has no lookingFor — the quoted callout element should not
		// render at all (as opposed to rendering empty).
		await page.route('**/api/profiles**', (route) =>
			route.fulfill({ json: { profiles: [ALL_PROFILES[1]] } })
		);
		await page.goto('/find');
		await expect(page.locator('#directory-grid').getByText('Bob Example')).toBeVisible();
		// Negative assertion: no element matches the italic/primary
		// callout styling used ONLY for lookingFor.
		await expect(page.locator('#directory-grid p.italic.bg-primary-50')).toHaveCount(0);
	});
});
