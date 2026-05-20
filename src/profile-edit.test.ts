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

		it('uses a semantic <fieldset>/<legend> grouping (a11y: related controls)', () => {
			// PR #60 Copilot review: an unbound <label> is wrong for a group
			// of related controls — screen readers can't associate it with
			// a single field. <fieldset> + <legend> is the semantically
			// correct grouping. Pinning this so a future "simplify the
			// markup" refactor doesn't drop back to the broken pattern.
			expect(source).toMatch(/<fieldset[^>]*id=["']field-visibility-section["']/);
			expect(source).toMatch(/<legend[^>]*>\s*Per-field audience/);
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

		it('uses the FieldVisibilityMap / HideableField types from services/api (lockstep with backend)', () => {
			// PR #60 Copilot review: the script was using `Record<string, ...>`
			// and a cast through `Record<string, string | undefined>`. The
			// shared types in src/services/api.ts mirror the backend's
			// FIELD_VISIBILITY_VALUES + HIDEABLE_FIELDS — using them keeps
			// the client in lockstep so a backend-only widening (e.g. a new
			// audience level) surfaces as a TS error here, not a silent
			// "client sends old levels" drift.
			expect(source).toMatch(
				/import\s+\{[\s\S]*?\bFieldVisibility\b[\s\S]*?from\s+['"]\.\.\/\.\.\/services\/api['"]/
			);
			expect(source).toMatch(/\bFieldVisibilityMap\b/);
			expect(source).toMatch(/\bHideableField\b/);
			expect(source).toMatch(/\bHIDEABLE_FIELDS\b/);
		});

		it('validates data-field against HIDEABLE_FIELDS at runtime (defends against orphan selectors)', () => {
			// Defensive guard: if a future <select> ships with a typo in
			// `data-field` (e.g. `data-field="bio "` with a trailing space),
			// the script should skip it rather than send garbage to the
			// server. Pins the runtime whitelist check.
			expect(source).toMatch(/new Set<string>\(HIDEABLE_FIELDS\)/);
			expect(source).toMatch(/!hideable(Fields|Set)\.has\(field\)/);
		});
	});

	describe('a11y sweep — every grouped section uses <fieldset>/<legend>', () => {
		// PR #60 fixed the field-visibility section; this sweep pins the
		// rest of the form's grouped sections to the same semantic so a
		// future "simplify the markup" refactor can't regress any of
		// them back to unbound <label>. The pattern matters most for
		// radio groups (Availability, Profile Visibility) where assistive
		// tech needs to announce the group's purpose alongside each
		// option; Skills/Interests also benefit because the chip area is
		// part of the same conceptual control.
		//
		// Pre-bound labels (e.g. `<label for="bio">Bio</label>`) are
		// fine as-is — they don't enter this sweep.
		const groupedSections: Array<{ legend: string; description: string }> = [
			{
				legend: 'Skills \\* \\(at least 2\\)',
				description: 'Skills — text input + chip group',
			},
			{
				legend: 'Interests \\* \\(at least 2\\)',
				description: 'Interests — text input + chip group',
			},
			{ legend: 'Availability', description: 'Availability — radio group' },
			{ legend: 'Profile Visibility', description: 'Profile Visibility — radio group' },
			{ legend: 'Per-field audience', description: 'Per-field audience — selector group' },
		];

		it.each(groupedSections)('$description uses <fieldset> + <legend>', ({ legend }) => {
			// The legend's literal text proves the right section was
			// converted (not just any fieldset). Allows trailing
			// whitespace + closing tag patterns; tolerant to minor
			// markup changes.
			const re = new RegExp(`<legend[^>]*>\\s*${legend}\\s*</legend>`, 'i');
			expect(source).toMatch(re);
		});

		it('does NOT use unbound <label> for any section header', () => {
			// Catches the original anti-pattern: <label> without `for=`
			// AND not wrapping a control. The form has plenty of *bound*
			// labels (<label for="bio">…</label>) which are fine; this
			// test must distinguish.
			//
			// Strategy: find every <label …> opening tag, capture its
			// attributes, and assert each either has a `for=` attribute
			// OR wraps an inline <input>/<select>/<textarea> (the
			// "wrap a control" pattern is also valid). Section-header
			// labels do neither.
			const labelOpenRe = /<label([^>]*)>([\s\S]*?)<\/label>/g;
			const offenders: string[] = [];
			for (const match of source.matchAll(labelOpenRe)) {
				const attrs = match[1];
				const body = match[2];
				if (/\bfor=["'][^"']+["']/.test(attrs)) continue; // bound by `for=`
				if (/<(input|select|textarea)\b/.test(body)) continue; // wraps a control
				offenders.push(match[0].replace(/\s+/g, ' ').slice(0, 100));
			}
			expect(offenders, 'unbound <label> elements act as broken section headers').toEqual([]);
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
