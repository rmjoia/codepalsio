import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

// Server mode for Azure Static Web Apps (Standard tier)
// dist/client -> static assets served by SWA
// dist/server -> Node.js SSR handler wrapped as an Azure Function (see api/server.mjs)
export default defineConfig({
	integrations: [tailwind()],
	site: 'https://codepals.io',
	output: 'server',
	adapter: node({
		mode: 'standalone',
	}),
});
