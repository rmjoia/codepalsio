import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Static mode - pages prerendered, API routes in /api folder
// Auth pages use only client-side scripts to load auth data
export default defineConfig({
	integrations: [tailwind()],
	site: 'https://codepals.io',
	output: 'static',
	vite: {
		build: {
			rollupOptions: {
				onwarn(warning, warn) {
					// Suppress hydration mismatch warnings for auth pages
					if (warning.code === 'HYDRATION_MISMATCH') {
						return;
					}
					warn(warning);
				},
			},
		},
	},
});