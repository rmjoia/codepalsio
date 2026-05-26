import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		// e2e/** is the vitest post-deploy HTTP suite (its own config).
		// e2e-browser/** is the Playwright browser suite — its .spec.ts
		// files import @playwright/test (not vitest), so they MUST be
		// excluded here or `npm run test:run` tries to run them and fails.
		exclude: ['node_modules', 'dist', '.astro', 'e2e/**', 'e2e-browser/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'dist/',
				'.astro/',
				'**/*.config.*',
				'**/*.d.ts',
				'**/types/**',
			],
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 80,
				statements: 80,
			},
		},
	},
});
