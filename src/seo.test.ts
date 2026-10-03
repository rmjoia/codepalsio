import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * SEO foundation invariants (issue #91).
 *
 * Two surfaces are pinned:
 *   - Source-level: every page imports + uses the SEO component with the
 *     right props. A new page that forgets to add SEO fails these tests.
 *   - Built-artefact-level: robots.txt + sitemap.xml exist on disk at
 *     `public/` (so Astro copies them to dist/).
 *
 * Not pinned here: the content of the dist/*.html files themselves —
 * that would require running the build in test, which doubles CI time.
 * Instead, source-level + the Playwright hermetic smoke (future
 * extension) cover the compiled behaviour.
 */
const PUBLIC_DIR = resolve(__dirname, '../public');

const SEO_COMPONENT_PATH = resolve(__dirname, 'components/SEO.astro');

function read(path: string): string {
	return readFileSync(path, 'utf8');
}

describe('SEO foundation (issue #91)', () => {
	describe('public assets', () => {
		it('ships robots.txt at the project root', () => {
			const robotsPath = resolve(PUBLIC_DIR, 'robots.txt');
			expect(existsSync(robotsPath), 'public/robots.txt must exist').toBe(true);
			const content = read(robotsPath);
			// Must allow crawling AND point to the sitemap. Crawlers like
			// Google / Bing use the sitemap directive to find the
			// authoritative URL list; without it they infer from random
			// internal links, which skips any page not linked from the
			// home page.
			expect(content).toMatch(/User-agent:\s*\*/);
			expect(content).toMatch(/Sitemap:\s*https:\/\/codepals\.io\/sitemap\.xml/);
			// Defensive disallows for internal surfaces (nothing of SEO
			// value, auth-gated or otherwise).
			expect(content).toMatch(/Disallow:\s*\/admin\//);
			expect(content).toMatch(/Disallow:\s*\/api\//);
		});

		it('ships sitemap.xml at the project root', () => {
			const sitemapPath = resolve(PUBLIC_DIR, 'sitemap.xml');
			expect(existsSync(sitemapPath), 'public/sitemap.xml must exist').toBe(true);
			const content = read(sitemapPath);
			expect(content).toMatch(
				/<urlset[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/
			);
			// The four publicly-crawlable routes. Changes to this list
			// require a deliberate test update (which is the point — a
			// drive-by edit to the sitemap shouldn't drop a page from
			// the index silently).
			expect(content).toContain('<loc>https://codepals.io/</loc>');
			expect(content).toContain('<loc>https://codepals.io/terms</loc>');
			expect(content).toContain('<loc>https://codepals.io/privacy</loc>');
			expect(content).toContain('<loc>https://codepals.io/code-of-conduct</loc>');
			// Auth-gated routes MUST NOT appear in the sitemap — a
			// crawler that follows them gets 401 and treats the URLs as
			// soft-404s, which lowers the site's quality score.
			expect(content).not.toContain('<loc>https://codepals.io/find');
			expect(content).not.toContain('<loc>https://codepals.io/welcome');
			expect(content).not.toContain('<loc>https://codepals.io/admin');
			expect(content).not.toContain('<loc>https://codepals.io/profile');
		});
	});

	describe('SEO component shape', () => {
		const seo = read(SEO_COMPONENT_PATH);

		it('declares all required props in the TypeScript interface', () => {
			// Pin the required props so a future refactor can't quietly
			// drop one. `canonical` and `description` are REQUIRED (no `?`
			// optional modifier) because missing them silently breaks
			// indexing.
			expect(seo).toMatch(/title:\s*string;/);
			expect(seo).toMatch(/description:\s*string;/);
			expect(seo).toMatch(/canonical:\s*string;/);
			// Optional props carry the `?` marker.
			expect(seo).toMatch(/image\?:\s*string;/);
			expect(seo).toMatch(/noindex\?:\s*boolean;/);
		});

		it('emits every critical meta tag (title, description, canonical, OG, Twitter, robots)', () => {
			// Pin the component's output surface — if any of these drop,
			// the whole SEO stance regresses on every page at once.
			expect(seo).toMatch(/<title>\{title\}<\/title>/);
			expect(seo).toMatch(/<meta name="description" content=\{description\}/);
			expect(seo).toMatch(/<link rel="canonical" href=\{canonicalUrl\}/);
			expect(seo).toMatch(
				/<meta name="robots" content=\{noindex \?.*'noindex,follow'.*:.*'index,follow'\}/
			);
			// Open Graph set.
			expect(seo).toMatch(/<meta property="og:site_name"/);
			expect(seo).toMatch(/<meta property="og:type"/);
			expect(seo).toMatch(/<meta property="og:title"/);
			expect(seo).toMatch(/<meta property="og:description"/);
			expect(seo).toMatch(/<meta property="og:url"/);
			expect(seo).toMatch(/<meta property="og:image"/);
			// Twitter Cards.
			expect(seo).toMatch(/<meta name="twitter:card" content="summary_large_image"/);
			expect(seo).toMatch(/<meta name="twitter:title"/);
			expect(seo).toMatch(/<meta name="twitter:description"/);
			expect(seo).toMatch(/<meta name="twitter:image"/);
		});

		it('normalises relative canonical paths against https://codepals.io', () => {
			// Pin the origin so a drive-by refactor of the base URL can
			// never ship canonical URLs pointing at a wrong host.
			expect(seo).toMatch(/const SITE_ORIGIN = 'https:\/\/codepals\.io'/);
			// And the normalisation logic — passes absolute URLs through,
			// prefixes relative paths.
			expect(seo).toMatch(/canonical\.startsWith\('http'\)/);
		});
	});

	describe('every public page imports and uses the SEO component', () => {
		const pages: Array<{ path: string; label: string; expectNoindex: boolean }> = [
			{ path: 'pages/index.astro', label: 'home', expectNoindex: false },
			{ path: 'pages/terms.astro', label: 'terms', expectNoindex: false },
			{ path: 'pages/privacy.astro', label: 'privacy', expectNoindex: false },
			{ path: 'pages/code-of-conduct.astro', label: 'code-of-conduct', expectNoindex: false },
			// Auth-gated / internal — MUST be noindex so crawlers don't
			// cache a dead-ended URL.
			{ path: 'pages/welcome.astro', label: 'welcome', expectNoindex: true },
			{ path: 'pages/find.astro', label: 'find', expectNoindex: true },
			{ path: 'pages/404.astro', label: '404', expectNoindex: true },
			{ path: 'pages/403.astro', label: '403', expectNoindex: true },
			{ path: 'pages/profile/index.astro', label: 'profile', expectNoindex: true },
			{ path: 'pages/admin/index.astro', label: 'admin', expectNoindex: true },
			{ path: 'pages/find/profile.astro', label: 'find/profile', expectNoindex: true },
		];

		it.each(pages)('$label imports the SEO component', ({ path }) => {
			const source = read(resolve(__dirname, path));
			expect(source).toMatch(/import SEO from ['"]\.\.\/(?:\.\.\/)?components\/SEO\.astro['"]/);
		});

		it.each(pages)('$label renders <SEO .../> with title + description + canonical', ({ path }) => {
			const source = read(resolve(__dirname, path));
			// The SEO component call must carry the three required props.
			// Pin that each is present by name rather than a specific
			// value (values can vary per page / be wordsmithed).
			const seoCall = source.match(/<SEO[\s\S]*?\/>/);
			expect(seoCall, `${path} must render <SEO .../>`).not.toBeNull();
			expect(seoCall![0]).toMatch(/title=/);
			expect(seoCall![0]).toMatch(/description=/);
			expect(seoCall![0]).toMatch(/canonical=/);
		});

		it.each(pages.filter((p) => p.expectNoindex))(
			'$label passes noindex={true} (auth-gated / error page)',
			({ path }) => {
				const source = read(resolve(__dirname, path));
				const seoCall = source.match(/<SEO[\s\S]*?\/>/);
				expect(seoCall![0]).toMatch(/noindex=\{true\}/);
			}
		);

		it.each(pages.filter((p) => !p.expectNoindex))(
			'$label does NOT set noindex (public, indexable)',
			({ path }) => {
				const source = read(resolve(__dirname, path));
				const seoCall = source.match(/<SEO[\s\S]*?\/>/);
				expect(seoCall![0]).not.toMatch(/noindex=\{true\}/);
			}
		);
	});

	describe('home page JSON-LD structured data', () => {
		const home = read(resolve(__dirname, 'pages/index.astro'));

		it('ships Organization + WebSite schema.org types', () => {
			// Google's SERP knowledge panel reads Organization + WebSite
			// before anything else; pin that both are present. The
			// `@graph` wrapper is the schema.org pattern for multiple
			// entities in one block. Key + value both allow either quote
			// style (the source uses single-quoted JS object literal keys).
			expect(home).toMatch(/application\/ld\+json/);
			expect(home).toMatch(/['"]@type['"]:\s*['"]Organization['"]/);
			expect(home).toMatch(/['"]@type['"]:\s*['"]WebSite['"]/);
			expect(home).toMatch(/['"]@graph['"]/);
		});

		it('declares the brand name and canonical URL in the structured data', () => {
			expect(home).toMatch(/name:\s*'CodePals'/);
			expect(home).toMatch(/url:\s*'https:\/\/codepals\.io\/'/);
		});
	});

	describe('verify-no-inline-scripts allows JSON-LD', () => {
		// Regression guard: the CSP guard script MUST exclude
		// `application/ld+json` from the inline-script violation list.
		// Without this, every page shipping structured data fails the
		// post-build check — which is what blocked the first green run
		// of this slice and should fail loudly if the exception is
		// dropped in a future refactor.
		const script = read(resolve(__dirname, '../scripts/verify-no-inline-scripts.mjs'));

		it('explicitly skips <script type="application/ld+json">', () => {
			expect(script).toMatch(/type=\["']application\\\/ld\\\+json\["']/);
		});
	});
});
