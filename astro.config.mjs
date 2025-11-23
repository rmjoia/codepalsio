import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

// Server mode for Azure Static Web Apps
// dist/client -> static assets
// dist/server -> Node.js server for SSR
export default defineConfig({
	integrations: [tailwind()],
	site: 'https://codepals.io',
	output: 'server',
	adapter: node({
		mode: 'standalone',
	}),
});