import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * /find directory banner — listed-vs-not-listed copy invariants.
 *
 * Source-level assertions (Astro components can't be imported under
 * vitest without the compiler, and CI runs unit tests before the
 * build). Same pattern as src/profile-edit.test.ts and
 * src/components/Header.test.ts.
 *
 * The bug being prevented: the page used to show "Want to be listed?
 * Make your profile public" as a single banner for everyone — awkward
 * for users who are already listed. Now there are two banners and JS
 * picks the right one based on whether the caller's githubUsername
 * appears in the directory rows. The directory query (PR #51) includes
 * the caller's own row when their profileVisibility is public, so
 * deciding listed-ness is a simple row match — no second API call.
 */
const sourcePath = resolve(__dirname, 'pages/find.astro');
const source = readFileSync(sourcePath, 'utf8');

describe('/find — listed-aware banner', () => {
	describe('two banners in the initial markup', () => {
		it('declares #banner-not-listed', () => {
			expect(source).toMatch(/id=["']banner-not-listed["']/);
		});

		it('declares #banner-listed', () => {
			expect(source).toMatch(/id=["']banner-listed["']/);
		});

		it('starts BOTH banners hidden by default (avoid flash-of-wrong-state)', () => {
			// Same lesson as Header.astro's auth skeleton: if either banner
			// is visible in the initial paint, listed users briefly see the
			// "want to be listed?" prompt before JS swaps it. Both must
			// start hidden; the init script reveals the right one.
			const notListed = source.match(
				/<p\s+id=["']banner-not-listed["'][^>]*class=["']([^"']+)["']/
			);
			expect(notListed, '#banner-not-listed must have a class attribute').not.toBeNull();
			expect(notListed![1]).toMatch(/\bhidden\b/);

			const listed = source.match(/<p\s+id=["']banner-listed["'][^>]*class=["']([^"']+)["']/);
			expect(listed, '#banner-listed must have a class attribute').not.toBeNull();
			expect(listed![1]).toMatch(/\bhidden\b/);
		});

		it('keeps the "edit your profile" link in both banners', () => {
			// Both banners need a path back to the profile edit page —
			// listed users to update their fields, not-listed users to
			// flip profileVisibility to public.
			const profileEditLinkCount = (source.match(/href=["']\/profile\?edit=true["']/g) ?? [])
				.length;
			expect(profileEditLinkCount).toBeGreaterThanOrEqual(2);
		});
	});

	describe('listed-ness detection helper', () => {
		it('matches githubUsername case-insensitively', () => {
			// GitHub canonicalises the username for SWA principals, but
			// defensive lowercase is cheap insurance against future drift
			// (e.g. if the stored githubUsername case ever diverges from
			// the principal's). Pin both sides of the comparison go
			// through toLowerCase().
			expect(source).toMatch(/githubLogin\.toLowerCase\(\)/);
			expect(source).toMatch(/\.githubUsername\s*\?\?\s*['"]['"]\)\.toLowerCase\(\)/);
		});

		it('treats a null/missing principal as not-listed (defensive)', () => {
			// The route gate enforces `authenticated` but the principal
			// type is nullable; a future regression that lets a null
			// through must not throw or pick the wrong banner.
			expect(source).toMatch(/if\s*\(\s*!githubLogin\s*\)\s*return\s+false/);
		});
	});

	describe('init script wiring', () => {
		it('imports getPrincipal alongside getPublicProfiles', () => {
			// Module-scope memoisation in getPrincipal means this doesn't
			// add a /.auth/me round trip when the Header has already
			// asked. If a future refactor reaches for a fresh fetch
			// instead, this test pins the helper-import pattern.
			expect(source).toMatch(
				/import\s+\{[\s\S]*?\bgetPrincipal\b[\s\S]*?\}\s+from\s+['"]\.\.\/services\/api['"]/
			);
		});

		it('fetches the principal AND the directory in parallel', () => {
			// Both calls are independent and we need both answers before
			// deciding which banner to reveal. Sequential await would
			// add the network latency twice.
			expect(source).toMatch(/Promise\.all\(\s*\[\s*getPublicProfiles\(\),\s*getPrincipal\(\)/);
		});

		it('reveals exactly one banner based on isSelfListed', () => {
			// The ternary picks the matching banner and removes its
			// `hidden` class; the other banner stays hidden. This is
			// the heart of the fix.
			expect(source).toMatch(/listed\s*\?\s*bannerListed\s*:\s*bannerNotListed/);
			expect(source).toMatch(/classList\.remove\(\s*['"]hidden['"]\s*\)/);
		});

		it('keeps both banners hidden on the empty-state branch', () => {
			// When the directory has zero profiles, the existing empty-
			// state card already owns the "be the first!" CTA. Showing
			// either banner would duplicate the message. The empty-state
			// branch must return early WITHOUT touching the banner ids.
			// Heuristic: the empty-state branch ends with a `return`
			// statement and doesn't touch bannerListed/bannerNotListed
			// before it.
			const emptyBranch = source.match(
				/if\s*\(\s*profiles\.length\s*===\s*0\s*\)\s*\{([\s\S]*?)return;?\s*\}/
			);
			expect(emptyBranch, 'empty-state branch must exist').not.toBeNull();
			expect(emptyBranch![1]).not.toMatch(/bannerListed/);
			expect(emptyBranch![1]).not.toMatch(/bannerNotListed/);
		});
	});
});
