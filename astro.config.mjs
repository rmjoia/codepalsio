import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

// For Azure Static Web Apps - keep server mode for now
// Will work on Standard tier ($9/month) or we can convert to static + Azure Functions
export default defineConfig({
	integrations: [tailwind()],
	site: 'https://codepals.io',
	output: 'server',
	adapter: node({
		mode: 'standalone',
	}),
});