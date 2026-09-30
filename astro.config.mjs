import { defineConfig } from 'astro/config';

// Tailwind is wired via `postcss.config.mjs` (v3 as a PostCSS plugin) —
// no integrations entry needed. `@astrojs/tailwind` was retired after
// Astro 5; Astro 6+ recommends the postcss / vite plugin path directly.
export default defineConfig({
	site: 'https://codepals.io',
	output: 'static',
});
