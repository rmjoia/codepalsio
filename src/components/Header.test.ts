import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Header.astro source-level invariants for the auth-loading skeleton.
 *
 * Why source instead of rendered output: Header.astro can't be imported
 * directly in vitest (needs the Astro compiler), and the CI runs unit
 * tests BEFORE the build, so dist/ doesn't exist yet. Asserting against
 * the source catches the regression we care about — someone deletes the
 * skeleton or flips the initial-hidden state — without needing a build
 * step. A future iteration could add a built-HTML snapshot if the source
 * regex starts feeling brittle.
 *
 * The flash being prevented: PR #55 left both sign-in buttons visible
 * by default. For a logged-in user navigating between pages, the
 * sign-in CTA paints first, then a few hundred ms later the auth
 * script swaps it for the user menu. That visible swap is the bug
 * these invariants prevent recurring.
 */
const headerPath = resolve(__dirname, 'Header.astro');
const source = readFileSync(headerPath, 'utf8');

/**
 * Pull the class attribute from the first opening tag with the given id.
 * Order-agnostic: works whether `id` precedes or follows `class` on the
 * element (the existing Header markup mixes both). Returns null if no
 * such element exists.
 */
function classOfElementById(html: string, id: string): string | null {
	// Match an opening tag containing id="X". The opening tag is "<...>",
	// non-greedy across newlines.
	const tagRe = new RegExp(`<[^>]*?\\bid=["']${id}["'][^>]*?>`, 's');
	const tag = html.match(tagRe)?.[0];
	if (!tag) return null;
	const classRe = /\bclass=["']([^"']+)["']/;
	return tag.match(classRe)?.[1] ?? null;
}

describe('Header.astro — auth-loading skeleton invariants', () => {
	describe('desktop auth area', () => {
		it('declares a #desktop-auth-skeleton element', () => {
			expect(source).toMatch(/id=["']desktop-auth-skeleton["']/);
		});

		it('marks the desktop skeleton with the animate-pulse class', () => {
			// Loading-state telegraph. Without the pulse, the skeleton reads
			// as "this is the final state" instead of "loading" — a static
			// gray pill is more confusing than the original flash.
			const cls = classOfElementById(source, 'desktop-auth-skeleton');
			expect(cls, 'desktop-auth-skeleton must have a class attribute').not.toBeNull();
			expect(cls).toMatch(/\banimate-pulse\b/);
		});

		it('hides #sign-in-btn in the initial markup (no flash for signed-in users)', () => {
			// The sign-in button must NOT be visible by default — the
			// skeleton stands in for it. Without this, logged-in users
			// see the sign-in CTA briefly paint before JS swaps it out.
			const cls = classOfElementById(source, 'sign-in-btn');
			expect(cls, 'sign-in-btn must have a class attribute').not.toBeNull();
			expect(cls).toMatch(/\bhidden\b/);
		});

		it('keeps #user-menu-container hidden in the initial markup', () => {
			// Defensive: this was already hidden by default in pre-skeleton
			// code; pin it so a future refactor doesn't flip it and re-
			// introduce a different flash (user-menu painting for anonymous
			// viewers).
			const cls = classOfElementById(source, 'user-menu-container');
			expect(cls, 'user-menu-container must have a class attribute').not.toBeNull();
			expect(cls).toMatch(/\bhidden\b/);
		});
	});

	describe('mobile auth area', () => {
		it('declares a #mobile-auth-skeleton element', () => {
			expect(source).toMatch(/id=["']mobile-auth-skeleton["']/);
		});

		it('marks the mobile skeleton with animate-pulse', () => {
			const cls = classOfElementById(source, 'mobile-auth-skeleton');
			expect(cls, 'mobile-auth-skeleton must have a class attribute').not.toBeNull();
			expect(cls).toMatch(/\banimate-pulse\b/);
		});

		it('hides #mobile-sign-in-btn in the initial markup', () => {
			const cls = classOfElementById(source, 'mobile-sign-in-btn');
			expect(cls, 'mobile-sign-in-btn must have a class attribute').not.toBeNull();
			expect(cls).toMatch(/\bhidden\b/);
		});
	});

	describe('auth resolution script', () => {
		it('hides both skeletons once auth resolution completes', () => {
			// The skeleton must come down whether the principal is null
			// (anonymous) OR populated (signed-in). If the script only
			// hides it on one branch, the other state pulses forever.
			expect(source).toMatch(/getElementById\(['"]desktop-auth-skeleton['"]\)/);
			expect(source).toMatch(/getElementById\(['"]mobile-auth-skeleton['"]\)/);
		});

		it('reveals the sign-in buttons on the null-principal (anonymous) path', () => {
			// Without this, anonymous viewers see the auth area render
			// empty after the skeleton goes away — worse UX than the
			// original flash. Pin the recovery path.
			expect(source).toMatch(
				/getElementById\(['"]sign-in-btn['"]\)\s*\?\.\s*classList\s*\.\s*remove\(\s*['"]hidden['"]\s*\)/
			);
			expect(source).toMatch(
				/getElementById\(['"]mobile-sign-in-btn['"]\)\s*\?\.\s*classList\s*\.\s*remove\(\s*['"]hidden['"]\s*\)/
			);
		});

		it('re-runs auth init on bfcache restore (fixes login-disappears-on-back-nav)', () => {
			// Browsers restore the DOM + module scope on back/forward
			// navigation when the page is served from the back-forward
			// cache. The memoized principal fetch sticks, so without a
			// pageshow listener the UI reflects stale auth state from the
			// snapshot moment. Pin BOTH: the listener registration AND the
			// cache reset + repaint it does.
			expect(source).toMatch(/addEventListener\(['"]pageshow['"]/);
			expect(source).toMatch(/\.persisted/);
			expect(source).toMatch(/resetPrincipalCache\(\)/);
			// The auth-init function must exist AND be re-called inside
			// the pageshow handler. Pin the shape: an async function
			// named runAuthInit + an invocation of it inside the handler.
			expect(source).toMatch(/async\s+function\s+runAuthInit\s*\(/);
			// Count: runAuthInit should be called at least twice —
			// once for initial paint, once from the pageshow handler.
			const invocations = source.match(/\brunAuthInit\(\)/g) ?? [];
			expect(
				invocations.length,
				'runAuthInit must be invoked at init AND on pageshow'
			).toBeGreaterThanOrEqual(2);
		});

		it('resets DOM to the pre-auth state at the start of each runAuthInit', () => {
			// Idempotence invariant: when runAuthInit runs a second time
			// (bfcache restore), the previous paint may have left the
			// user-menu visible / nav-find revealed / sign-in hidden. If
			// the current principal is null, we need to UN-reveal those.
			// Pin the reset block by looking for the user-menu-container
			// being hidden INSIDE the function body (before the await).
			const fnStart = source.indexOf('async function runAuthInit');
			expect(fnStart, 'runAuthInit must exist').toBeGreaterThan(-1);
			const awaitIdx = source.indexOf('await getPrincipalWithRoles', fnStart);
			expect(awaitIdx, 'runAuthInit must call getPrincipalWithRoles').toBeGreaterThan(fnStart);
			const resetBlock = source.slice(fnStart, awaitIdx);
			// Before the await, user-menu-container must be hidden-reset
			// so the previous paint's state doesn't leak into this one.
			expect(resetBlock).toMatch(
				/getElementById\(['"]user-menu-container['"]\)[\s\S]*?classList[\s\S]*?add\(['"]hidden['"]\)/
			);
		});
	});
});
