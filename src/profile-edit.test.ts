import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Per-field visibility UI invariants on the profile edit form.
 *
 * Source-level assertions (same pattern as Header.test.ts) — Astro
 * components can't be imported directly under vitest without the
 * compiler, and the CI runs unit tests before the build so dist/
 * isn't available. Asserting against the source catches the
 * regressions we care about (a selector disappears, an option goes
 * missing, the save payload drops fieldVisibility) without bringing
 * up Astro at test time.
 *
 * What this PR delivers: visibility controls for the 5 hideable
 * fields that have input controls today (bio, skills, interests,
 * location, timezone). The backend (PR #59) supports the full
 * HIDEABLE_FIELDS set — when the remaining input controls (social
 * URLs, languages, experience) are added to the form, their
 * visibility selectors will be added alongside in the same
 * section.
 */
// Lives at src/, not next to the .astro page itself, because Astro
// treats every file under src/pages/ as a route — a .test.ts there
// gets bundled as a page and breaks the build. Mirrors the precedent
// set by src/staticwebapp.config.test.ts.
const sourcePath = resolve(__dirname, 'pages/profile/index.astro');
const source = readFileSync(sourcePath, 'utf8');

const HIDEABLE_FIELDS_WITH_UI = ['bio', 'skills', 'interests', 'location', 'timezone'] as const;
const EXPECTED_LEVELS = ['public', 'authenticated', 'private'] as const;

describe('profile/index.astro — per-field visibility UI', () => {
	describe('section structure', () => {
		it('declares the per-field visibility section', () => {
			expect(source).toMatch(/id=["']field-visibility-section["']/);
		});

		it('uses the .field-visibility-select class to mark each selector (CSS hook for JS)', () => {
			// The script queries `.field-visibility-select` to gather values
			// on submit and pre-populate on load. If the class drops or
			// gets renamed without updating the script, every selector
			// silently submits as 'public'.
			expect(source).toMatch(/class=["'][^"']*\bfield-visibility-select\b/);
		});
	});

	describe('selectors for each hideable field with current UI', () => {
		it.each(HIDEABLE_FIELDS_WITH_UI)('declares a #field-vis-%s selector', (field) => {
			expect(source).toMatch(new RegExp(`id=["']field-vis-${field}["']`));
		});

		it.each(HIDEABLE_FIELDS_WITH_UI)(
			'binds data-field="%s" so the script knows the wire key',
			(field) => {
				// The script reads `sel.dataset.field` to build the
				// fieldVisibility map keyed by the backend HIDEABLE_FIELDS
				// name. If data-field is wrong, the wire payload sends
				// fieldVisibility under the wrong key, and the backend's
				// whitelist drops it silently. Pin the canonical name per
				// field.
				expect(source).toMatch(new RegExp(`data-field=["']${field}["']`));
			}
		);

		it.each(EXPECTED_LEVELS)('offers a %s option in every selector', (level) => {
			// All three audience levels must be selectable. Use a global
			// match + count to ensure every selector has the option
			// (5 selectors → expect ≥5 occurrences).
			const re = new RegExp(`<option\\s+value=["']${level}["']`, 'g');
			const occurrences = source.match(re) ?? [];
			expect(occurrences.length).toBeGreaterThanOrEqual(HIDEABLE_FIELDS_WITH_UI.length);
		});
	});

	describe('script wire-up', () => {
		it('pre-populates each selector from profile.fieldVisibility on load', () => {
			// Without this, returning users would always see 'public' as
			// the default even when their stored map says otherwise — a
			// privacy regression (they THOUGHT bio was private, but the
			// next save sends back public).
			expect(source).toMatch(/profile\?\.fieldVisibility/);
			expect(source).toMatch(/field-visibility-select/);
			expect(source).toMatch(/sel\.value\s*=\s*level/);
		});

		it('includes fieldVisibility in the saveProfile payload', () => {
			// If this drops, the save side silently goes back to all-public.
			expect(source).toMatch(/saveProfile\s*\(\s*\{[\s\S]*?fieldVisibility[\s\S]*?\}\s*\)/);
		});

		it("drops 'public' entries from the wire payload (mirrors server normalisation)", () => {
			// The server is the security boundary; the client trims as a
			// payload-size optimisation. Pin that only 'authenticated'
			// and 'private' get included — a future change that always
			// sends every entry would inflate request bodies unnecessarily.
			expect(source).toMatch(
				/value\s*===\s*['"]authenticated['"]\s*\|\|\s*value\s*===\s*['"]private['"]/
			);
		});
	});

	describe('identity fields are NOT exposed as hideable in the UI', () => {
		// Defense in depth: the backend whitelist already rejects these,
		// but the UI shouldn't even suggest they're hideable. A regression
		// that adds them here would either visually mislead users or
		// — worse — let a future loosened backend silently honour them.
		it.each(['displayName', 'githubUsername', 'availability', 'userId', 'id'])(
			'does not declare a field-vis-%s selector',
			(field) => {
				expect(source).not.toMatch(new RegExp(`id=["']field-vis-${field}["']`));
				expect(source).not.toMatch(new RegExp(`data-field=["']${field}["']`));
			}
		);
	});
});
