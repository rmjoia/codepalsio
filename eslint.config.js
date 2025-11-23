import js from '@eslint/js';
import tseslint from 'typescript-eslint';

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
			'src/env.d.ts',
		],
	},
	{
		files: ['src/**/*.{js,jsx}', '*.config.{js,mjs,cjs}'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
		},
		rules: {
			...js.configs.recommended.rules,
		},
	},
	...tseslint.configs.recommended.map(config => ({
		...config,
		files: ['src/**/*.{ts,tsx}'],
	})),
];
