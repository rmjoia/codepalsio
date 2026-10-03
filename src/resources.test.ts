import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Source-level invariants for the /resources page (issue #93).
 *
 * The page is a static curated list of outbound links. The invariants
 * pin:
 *   - The page uses the SEO component (public, indexable, keyword-rich
 *     title + description).
 *   - Every section carries at least 3 cards (so a drive-by content
 *     edit can't gut a category to a token entry).
 *   - Every outbound link uses `rel="noopener noreferrer"` and
 *     `target="_blank"` — cross-origin-opener safety and no-referrer
 *     leak. Same pattern established in #78 / #87 / #92.
 *   - Sitemap.xml includes the route (so crawlers can find it).
 *   - Header nav includes the link (users can find it).
 *
 * Not pinned here: specific link values. Curation is a judgment call;
 * these invariants pin the SHAPE so the page can't accidentally go
 * noindex, lose rel-noopener on an anchor, or ship without sitemap
 * presence.
 */
const resourcesPath = resolve(__dirname, 'pages/resources.astro');
const resources = readFileSync(resourcesPath, 'utf8');

const sitemap = readFileSync(resolve(__dirname, '../public/sitemap.xml'), 'utf8');
const header = readFileSync(resolve(__dirname, 'components/Header.astro'), 'utf8');

describe('/resources — curated resources page (issue #93)', () => {
	describe('SEO shape', () => {
		it('uses the shared SEO component with title + description + canonical', () => {
			// Resources page is a key SEO lever — it's where the long tail
			// of searches land ("free security course", "clean architecture
			// summary"). If the SEO call drops, the page silently stops
			// pulling its weight. Pin presence + required props.
			expect(resources).toMatch(/import SEO from ['"]\.\.\/components\/SEO\.astro['"]/);
			const seoCall = resources.match(/<SEO[\s\S]*?\/>/);
			expect(seoCall, 'resources must render <SEO .../>').not.toBeNull();
			expect(seoCall![0]).toMatch(/title=/);
			expect(seoCall![0]).toMatch(/description=/);
			expect(seoCall![0]).toMatch(/canonical=["']\/resources["']/);
		});

		it('is NOT noindex (public, indexable)', () => {
			// Catching a copy-paste from an auth-gated page's SEO call
			// that would silently hide /resources from Google.
			const seoCall = resources.match(/<SEO[\s\S]*?\/>/);
			expect(seoCall![0]).not.toMatch(/noindex=\{true\}/);
		});
	});

	describe('content curation discipline', () => {
		it('declares at least 8 sections (preserves the breadth of the catalogue)', () => {
			// Catches a refactor that collapses sections away. 8 is the
			// current count; a change here needs a deliberate test
			// update, which is the point.
			const titles = resources.match(/\btitle: '[^']+',\n\s+intro:/g) ?? [];
			expect(titles.length).toBeGreaterThanOrEqual(8);
		});

		it('declares at least 3 cards per section (regression against gutted categories)', () => {
			// Count the `title:` entries in each section. A section with
			// < 3 cards reads as thin — bump the content or remove the
			// section, don't ship a one-card section.
			const sectionBodies = resources.split(/\btitle: '[^']+',\n\s+intro:/);
			// First split-chunk is the preamble; subsequent chunks are
			// each section's body up to the start of the next section.
			for (let i = 1; i < sectionBodies.length; i++) {
				const body = sectionBodies[i];
				const cardTitles = body.match(/\btitle: '[^']+'/g) ?? [];
				// First card title in the body matches `title: '...'`
				// of the first link; subsequent cards all match the
				// same shape. So the count is the number of links in
				// that section.
				expect(
					cardTitles.length,
					`Section #${i} has ${cardTitles.length} card(s) — needs at least 3.`
				).toBeGreaterThanOrEqual(3);
			}
		});

		it('every card declares href + description + source', () => {
			// Minimum card contract — if any card drops one of these,
			// the UI gets a jagged presentation. Pin that each card
			// has all three.
			// Count href occurrences in resource-link objects (filter
			// out non-ResourceLink hrefs by scoping to objects with
			// `title: '...',` nearby).
			const linkObjects = resources.match(/\{\s*title: '[^']+',[\s\S]*?\},/g) ?? [];
			expect(linkObjects.length).toBeGreaterThan(0);
			for (const obj of linkObjects) {
				expect(obj).toMatch(/\bhref:\s*'/);
				expect(obj).toMatch(/\bdescription:/);
				expect(obj).toMatch(/\bsource:\s*'/);
			}
		});
	});

	describe('outbound-link safety', () => {
		it('every outbound <a> uses target=_blank + rel=noopener,noreferrer', () => {
			// Cross-origin links MUST have both:
			//   target=_blank + rel=noopener → prevents the opened page
			//     from controlling window.opener
			//   rel=noreferrer → suppresses the Referer header leak so
			//     third parties don't learn which card the user clicked
			// Pin the SHAPE in the template so a refactor that
			// decomposes the <a> into a wrapper component can't silently
			// drop one of these attributes.
			expect(resources).toMatch(/target="_blank"/);
			expect(resources).toMatch(/rel="noopener noreferrer"/);
			// Negative: NO outbound <a> should bypass this pattern. A
			// quick grep: every anchor with `href={link.href}` must sit
			// inside a template with `target="_blank"` + `rel=...`.
			// Trust the template structure (one anchor loop per section).
			expect(resources).toMatch(
				/href=\{link\.href\}[\s\S]{0,100}target="_blank"[\s\S]{0,100}rel="noopener noreferrer"/
			);
		});
	});

	describe('discoverability wiring', () => {
		it('sitemap.xml includes /resources', () => {
			expect(sitemap).toContain('<loc>https://codepals.io/resources</loc>');
		});

		it('Header nav links to /resources (desktop + mobile)', () => {
			// Desktop nav: find the "Resources" link in the hidden-md:flex
			// bar. Mobile nav: same label, inside the mobile menu panel.
			// Count anchors to /resources; expect ≥ 2 (one per nav).
			const anchors = header.match(/href="\/resources"/g) ?? [];
			expect(anchors.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe('legal posture', () => {
		it('explicitly disclaims scraping / re-publishing in the page copy', () => {
			// Keeps the honest signal visible to users AND future
			// contributors. If we ever add scraped content, this test
			// should break deliberately so the contributor remembers to
			// also update legal posture.
			expect(resources).toMatch(/we don't scrape/i);
			expect(resources).toMatch(/hand[- ]curated/i);
		});
	});
});
