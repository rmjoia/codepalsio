import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Static mode for Azure Static Web Apps
// API routes handled by Azure Functions in /api directory
export default defineConfig({
	integrations: [tailwind()],
	site: 'https://codepals.io',
	output: 'static',
});