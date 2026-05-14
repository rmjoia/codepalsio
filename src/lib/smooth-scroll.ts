/**
 * Smooth-scroll for anchor links. Attaches a single document-level
 * pattern so adding a new `<a href="#x">` anywhere in the app doesn't
 * need extra wiring. No-op on pages that have no matching anchors.
 *
 * Lives in src/lib/ so it can be imported by Header.astro's bundled
 * script — keeping it out of any per-page inline `<script>` block that
 * CSP `script-src 'self'` would block.
 */

let installed = false;

export function setupSmoothScroll(): void {
	if (installed) return;
	installed = true;

	const attach = (anchor: HTMLAnchorElement): void => {
		anchor.addEventListener('click', (e) => {
			const href = anchor.getAttribute('href');
			if (!href) return;
			const hash = href.startsWith('/#') ? href.substring(1) : href;
			const target = document.querySelector(hash);
			if (target) {
				e.preventDefault();
				target.scrollIntoView({ behavior: 'smooth' });
				history.pushState(null, '', hash);
			}
		});
	};

	document.querySelectorAll<HTMLAnchorElement>('a[href^="#"], a[href^="/#"]').forEach(attach);

	// Scroll to hash on page load.
	window.addEventListener('load', () => {
		if (!window.location.hash) return;
		const target = document.querySelector(window.location.hash);
		if (!target) return;
		setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 100);
	});

	// Header shadow enhancement on scroll — sticky header gets a stronger
	// shadow once the page is scrolled past the first 10px.
	window.addEventListener('scroll', () => {
		const header = document.querySelector('header');
		if (!header) return;
		if (window.scrollY > 10) {
			header.classList.add('shadow-lg');
			header.classList.remove('shadow-sm');
		} else {
			header.classList.remove('shadow-lg');
			header.classList.add('shadow-sm');
		}
	});
}
