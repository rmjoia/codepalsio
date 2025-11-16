/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	theme: {
		extend: {
			colors: {
				primary: {
					50: '#ecf9fc',
					100: '#cef3f8',
					200: '#9de7f1',
					300: '#6bdbe9',
					400: '#3acfe1',
					500: '#00bcd4',
					600: '#00a8c8',
					700: '#0088a5',
					800: '#006882',
					900: '#004860',
				},
				accent: {
					50: '#fff9f0',
					100: '#fff3e0',
					200: '#ffe0b2',
					300: '#ffcc80',
					400: '#ffb74d',
					500: '#ffa500',
					600: '#ff9800',
					700: '#f57c00',
					800: '#e65100',
					900: '#bf360c',
				},
			},
			fontFamily: {
				sans: ['Inter', 'system-ui', 'sans-serif'],
				display: ['Clash Display', 'system-ui', 'sans-serif'],
			},
			animation: {
				'float': 'float 6s ease-in-out infinite',
				'glow': 'glow 2s ease-in-out infinite',
			},
			keyframes: {
				float: {
					'0%, 100%': { transform: 'translateY(0px)' },
					'50%': { transform: 'translateY(-20px)' },
				},
				glow: {
					'0%, 100%': { boxShadow: '0 0 5px rgba(0, 188, 212, 0.5)' },
					'50%': { boxShadow: '0 0 20px rgba(0, 188, 212, 0.8)' },
				},
			},
		},
	},
	plugins: [],
};
