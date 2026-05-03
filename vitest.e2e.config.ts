import { defineConfig } from 'vitest/config';

/**
 * Post-deploy E2E suite. Hits the deployed SWA over HTTP to assert
 * runtime behaviour (auth redirects, route gates) that config-only
 * tests can't verify. Driven by E2E_BASE_URL — tests skip when unset.
 */
export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['e2e/**/*.e2e.test.ts'],
		testTimeout: 30_000,
		// No coverage thresholds for E2E — coverage is a unit-test concern.
		coverage: { enabled: false },
	},
});
