// Tailwind v3 wired via PostCSS. Replaces `@astrojs/tailwind`, which was
// deprecated after Astro 5 (its latest release only declares peer support
// for Astro 3/4/5). Astro 6+ picks up postcss.config.mjs at the project
// root automatically via Vite — no astro.config entry needed.
export default {
	plugins: {
		tailwindcss: {},
		autoprefixer: {},
	},
};
