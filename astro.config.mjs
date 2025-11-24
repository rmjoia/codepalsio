import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Static mode - pages prerendered, API routes in /api folder
export default defineConfig({
	integrations: [tailwind()],
	site: 'https://codepals.io',
	output: 'static',
});