/**
 * Floating-ToC scrollspy. Observes every `<section>` that a ToC link
 * points at and toggles the matching link's active state as the user
 * scrolls. Uses IntersectionObserver so there's no scroll listener on
 * the hot path — cheaper + smoother.
 *
 * Trigger band: the top 40% of the viewport. A section becomes
 * "active" as its top crosses the 60%-from-bottom line and stays
 * active until the next section's top crosses the same line.
 *
 * Scoped to `a[data-toc-target]` link elements. The caller passes the
 * container to search within (defaults to `document`) so the same
 * helper could serve multiple ToCs on one page.
 */
export function initTocScrollspy(root: Document | HTMLElement = document): () => void {
	const tocLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[data-toc-target]'));
	const sections = tocLinks
		.map((link) => {
			const id = link.dataset.tocTarget;
			if (!id) return null;
			const el = document.getElementById(id);
			return el ? { id, el, link } : null;
		})
		.filter((x): x is { id: string; el: HTMLElement; link: HTMLAnchorElement } => x !== null);

	if (sections.length === 0 || typeof IntersectionObserver === 'undefined') {
		return () => undefined;
	}

	const setActive = (id: string | null): void => {
		for (const { link, id: linkId } of sections) {
			const active = linkId === id;
			link.classList.toggle('text-primary-700', active);
			link.classList.toggle('font-semibold', active);
			link.classList.toggle('border-primary-500', active);
			link.classList.toggle('bg-primary-50', active);
			link.classList.toggle('text-slate-600', !active);
			link.classList.toggle('border-transparent', !active);
		}
	};

	// Store the latest intersection ratio per section so we can pick the
	// "most visible in the trigger band" each tick.
	const ratios = new Map<string, number>();
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const id = (entry.target as HTMLElement).id;
				ratios.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
			}
			// Pick the first section (in document order) that's intersecting
			// the trigger band at all. The top-most visible section is the
			// one the reader is currently on.
			let active: string | null = null;
			for (const { id } of sections) {
				if ((ratios.get(id) ?? 0) > 0) {
					active = id;
					break;
				}
			}
			// Fallback: at the very top of the page nothing may be
			// intersecting yet; highlight the first anyway.
			if (!active && window.scrollY < 100) active = sections[0]?.id ?? null;
			setActive(active);
		},
		{
			rootMargin: '0px 0px -60% 0px',
			threshold: [0, 0.1, 0.5, 1],
		}
	);
	for (const { el } of sections) observer.observe(el);

	// Initial paint so the first link is highlighted before any scroll
	// event fires.
	setActive(sections[0]?.id ?? null);

	// Returned teardown — useful if the caller re-mounts the ToC (not
	// needed on static pages but keeps the API honest).
	return () => observer.disconnect();
}
