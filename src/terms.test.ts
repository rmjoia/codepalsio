import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Source-level invariants for the Terms of Service anti-abuse clause.
 *
 * Spec 003 US1 / FR-101 requires an explicit Terms clause naming the
 * prohibited uses (romantic/dating/non-coding outreach) and the
 * enforcement surface. Without this clause, every subsequent defense
 * in spec 003 is opinion-based — moderators have nothing to point to
 * when dismissing / unlisting / suspending a report.
 *
 * The clause lives in THREE surfaces, all of which must stay aligned:
 *   1. `TERMS.md`                  — authoritative markdown, served on
 *                                     github.com and linked from the app
 *   2. `src/pages/terms.astro`     — the rendered /terms page the public
 *                                     footer link points at
 *   3. `src/components/TermsModal.astro` — the onboarding modal in
 *                                           welcome.astro's consent flow
 *
 * These tests are keyed on stable phrases ("romantic", "social", "code-
 * related" etc.) rather than exact wording, so a copy-edit refactor
 * doesn't break them but a wholesale removal does. If a future refactor
 * reshapes the clause heavily, update the regexes in one place here.
 */
const termsMd = readFileSync(resolve(__dirname, '../TERMS.md'), 'utf8');
const termsPage = readFileSync(resolve(__dirname, 'pages/terms.astro'), 'utf8');
const termsModal = readFileSync(resolve(__dirname, 'components/TermsModal.astro'), 'utf8');

describe('ToS anti-abuse clause (spec 003 US1 / FR-101)', () => {
	describe('TERMS.md (authoritative source)', () => {
		it('names romantic/dating/social outreach as prohibited', () => {
			// Pin the three category hits — any single-word rename shouldn't
			// break the test, but dropping all of them would.
			expect(termsMd).toMatch(/romantic/i);
			expect(termsMd).toMatch(/dating/i);
			expect(termsMd).toMatch(/social/i);
		});

		it('frames the platform purpose as code-related collaboration', () => {
			// The spec's "clause names the prohibited uses AND the scope"
			// requirement — if the platform-scope framing drops, the clause
			// becomes a bare list of don'ts without context.
			expect(termsMd).toMatch(/code[- ]related/i);
		});

		it('names unsolicited commercial outreach as prohibited', () => {
			// Second explicit prohibition beyond romantic: recruiter spam
			// / sales cold-outreach, per the spec's threat T4 (scraping for
			// outreach lists).
			expect(termsMd).toMatch(/unsolicited\s+commercial/i);
		});

		it('names the enforcement actions (unlist / suspend / termination)', () => {
			// The clause must name what happens, not just forbid things.
			// Pin all three severity tiers.
			expect(termsMd).toMatch(/unlist/i);
			expect(termsMd).toMatch(/suspen[ds]/i);
			expect(termsMd).toMatch(/termination|terminate/i);
		});

		it('surfaces the abuse@codepals.io email channel', () => {
			// The in-platform reporting flow (S3) doesn't cover every case
			// (appeals, urgent safety, reported account deleted). Email is
			// the stopgap and MUST be visible in the Terms.
			expect(termsMd).toMatch(/abuse@codepals\.io/);
		});
	});

	describe('src/pages/terms.astro (rendered public page)', () => {
		it('contains a Community Standards / Enforcement section', () => {
			// The section heading can wordsmith; pin the semantic anchor.
			expect(termsPage).toMatch(/Community Standards|Enforcement/);
		});

		it('names the same prohibited uses as TERMS.md', () => {
			expect(termsPage).toMatch(/romantic/i);
			expect(termsPage).toMatch(/dating/i);
			expect(termsPage).toMatch(/unsolicited\s+commercial/i);
		});

		it('surfaces abuse@codepals.io as a mailto', () => {
			expect(termsPage).toMatch(/mailto:abuse@codepals\.io/);
		});

		it('links out to the full TERMS.md on GitHub', () => {
			// The /terms page is a summary; the authoritative source is
			// TERMS.md. If the Terms link drops, users have no way to see
			// the full policy.
			expect(termsPage).toMatch(/TERMS\.md|blob\/main\/TERMS\.md/);
		});
	});

	describe('src/components/TermsModal.astro (onboarding consent modal)', () => {
		it('surfaces the romantic/dating prohibition in the Prohibited Behavior list', () => {
			// This is the first ToS surface a new user sees — the welcome
			// flow's accept-terms checkbox opens this modal. If the clause
			// is missing here, users consent to a Terms version that
			// doesn't match TERMS.md.
			expect(termsModal).toMatch(/romantic/i);
			expect(termsModal).toMatch(/dating|social relationship/i);
		});

		it('surfaces unsolicited commercial outreach as prohibited', () => {
			expect(termsModal).toMatch(/unsolicited\s+commercial/i);
		});

		it('frames CodePals as code-related collaboration', () => {
			expect(termsModal).toMatch(/code[- ]related/i);
		});
	});

	describe('onboarding flow (welcome.astro) still links to the Terms modal', () => {
		it('opens the terms-modal via the data-modal-open attribute on accept-terms', () => {
			// Regression guard: if the modal id or the data-attribute
			// drops, users still see the checkbox but clicking "Terms of
			// Service" does nothing. Keep both pinned.
			const welcome = readFileSync(resolve(__dirname, 'pages/welcome.astro'), 'utf8');
			expect(welcome).toMatch(/id=["']accept-terms["']/);
			expect(welcome).toMatch(/data-modal-open=["']terms-modal["']/);
		});
	});
});
