import js from '@eslint/js';

export default [
	{
		ignores: [
			'node_modules/',
			'dist/',
			'.astro/',
			'coverage/',
			'*.log',
			'.env*',
			'package-lock.json',
			'src/**/*.astro',
		],
	},
	{
		files: ['src/**/*.{js,jsx,ts,tsx}', '*.config.{js,mjs,cjs}'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
		},
		rules: {
			...js.configs.recommended.rules,
		},
	},
];
