import { defineConfig, devices } from '@playwright/test';

/**
 * Hermetic browser E2E for visibility-dependent UI states.
 *
 * "Hermetic" = no deployed environment, no real OAuth, no Cosmos. The
 * suite serves the production build via `astro preview` and intercepts
 * every `/api/*` and `/.auth/me` call with `page.route()` canned
 * responses. We're testing that the BROWSER renders each
 * visibility/auth state correctly — the server-side filtering math is
 * already covered by the API unit tests (visibility.test.ts,
 * profiles-list.test.ts, profile-by-username.test.ts).
 *
 * Runs as a step in the CI `validate` job (pre-deploy gate), NOT
 * post-deploy — there's nothing environment-specific to wait for.
 *
 * Lives in e2e-browser/ (NOT e2e/, which is the vitest post-deploy
 * HTTP suite). The main vitest config excludes e2e-browser/** so these
 * .spec.ts files aren't grabbed by `npm run test:run`.
 */
export default defineConfig({
	testDir: './e2e-browser',
	testMatch: '**/*.spec.ts',
	// One retry locally smooths over the occasional preview-server cold
	// start; CI gets two because shared runners are noisier.
	retries: process.env.CI ? 2 : 1,
	// Fail the build if someone leaves a test.only in.
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: {
		baseURL: 'http://localhost:4321',
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	// Serve the built static site. astro preview serves dist/ for
	// output:'static'. The mocked-API approach means the API never needs
	// to exist — page.route() intercepts those calls in the browser
	// before they reach this server.
	webServer: {
		command: 'npm run preview -- --port 4321 --host',
		url: 'http://localhost:4321/',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
