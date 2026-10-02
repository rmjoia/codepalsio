import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Source-level invariants for the /find/<username> profile detail page.
 *
 * Scope: the Contact affordance introduced for the MVP-launch bridge
 * (issue #73). In-app messaging (spec 005) isn't implemented yet, so
 * this page's primary CTA is "reach out via one of the owner's
 * declared URLs". The invariants below pin the pieces that must be
 * present in source so a future refactor can't silently drop them.
 *
 * Browser behaviour (does the right thing actually paint?) is covered
 * by `e2e-browser/visibility.spec.ts` under the "Contact affordance"
 * describe — these tests are the cheap-and-fast complement.
 */
const sourcePath = resolve(__dirname, 'pages/find/profile.astro');
const source = readFileSync(sourcePath, 'utf8');

describe('find/<username> — Contact affordance (issue #73)', () => {
	describe('markup', () => {
		it('declares #profile-contact-section with a visible-when-populated hidden class', () => {
			// The section starts `hidden` and the script removes the class
			// when any route is available. The old `profile-links-section`
			// shape is gone — a leftover "Links" heading would mean the
			// renames weren't completed.
			expect(source).toMatch(/id=["']profile-contact-section["'][^>]*class=["'][^"']*\bhidden\b/);
			expect(source).not.toMatch(/id=["']profile-links-section["']/);
			expect(source).not.toMatch(/id=["']profile-links["']/);
		});

		it('includes the honest "messaging coming soon" set-expectations copy', () => {
			// Reviewers may tweak the exact wording; pin the semantic
			// anchor (the word "messaging" + the general "coming" cue +
			// a mention of reach-out-elsewhere) rather than the literal
			// sentence. If someone drops the whole note, this fails.
			expect(source).toMatch(/id=["']profile-contact-note["']/);
			expect(source).toMatch(/messaging[\s\S]{0,80}coming/i);
		});

		it('declares a #profile-contact-buttons container (not a plain <ul>)', () => {
			// The affordance is a button grid, not an inline list of text
			// links — different UX intent. Pin the container id so the
			// render script has somewhere to append to.
			expect(source).toMatch(/id=["']profile-contact-buttons["']/);
		});
	});

	describe('render script', () => {
		it('fills #profile-contact-buttons via a renderContact function', () => {
			// A rename from renderLinks → renderContact; pin the new name
			// so a future refactor doesn't accidentally revive the old
			// text-link rendering.
			expect(source).toMatch(/function\s+renderContact\s*\(/);
			expect(source).not.toMatch(/function\s+renderLinks\s*\(/);
		});

		it('falls back to github.com/<githubUsername> when githubUrl is absent', () => {
			// The whole point of the fallback: every CodePal has a GitHub
			// login, so every profile is reachable via GitHub even without
			// an explicit URL. Pin the exact template string pattern.
			expect(source).toMatch(/`https:\/\/github\.com\/\$\{profile\.githubUsername\}`/);
		});

		it('surfaces LinkedIn and Website only when explicitly set (no fake fallback)', () => {
			// Positive guard: these must appear in the route-building
			// block. There's no fallback for them — unlike GitHub, we
			// don't know the user's LinkedIn handle, so we can't make
			// one up. Pin the presence of the explicit guards in the
			// renderContact section (the first `function renderContact`
			// occurrence through the next bare `function ` or </script>).
			const start = source.indexOf('function renderContact');
			expect(start, 'renderContact must exist in source').toBeGreaterThan(-1);
			const after = source.slice(start);
			const endMarker = after.search(/\n\t*function\s+\w+\s*\(|<\/script>/);
			const body = endMarker > -1 ? after.slice(0, endMarker) : after;
			expect(body).toMatch(/profile\.linkedinUrl/);
			expect(body).toMatch(/profile\.websiteUrl/);
		});

		it('opens cross-origin links with target=_blank + rel=noopener,noreferrer', () => {
			// Security invariant: an opened cross-origin page can control
			// window.opener via window.opener.location = ... unless we
			// opt out with rel="noopener". Pin BOTH attributes — one
			// without the other is a half-measure.
			expect(source).toMatch(/a\.target\s*=\s*['"]_blank['"]/);
			expect(source).toMatch(/a\.rel\s*=\s*['"]noopener\s+noreferrer['"]/);
		});

		it('builds <a> text with textContent (not innerHTML)', () => {
			// Defence in depth: label strings are hardcoded today, but
			// treating any string that lands in the DOM as potentially
			// untrusted is a cheap habit. If a future change pipes a
			// user-supplied label through here, textContent keeps it
			// safe; innerHTML would be an XSS vector.
			expect(source).toMatch(/a\.textContent\s*=\s*label/);
			expect(source).not.toMatch(/\.innerHTML\s*=/);
		});
	});
});

// Issue #84 / spec 003 US2 — Report affordance. The companion piece to
// the Contact affordance above: Contact says "reach out", Report says
// "something's off". These invariants pin the markup + script wiring so
// a future refactor can't silently break the moderation submission path.
describe('find/<username> — Report affordance (spec 003 US2, issue #84)', () => {
	describe('markup', () => {
		it('declares the Report button wrap + button, both initially hidden', () => {
			// Wrap starts hidden; the client script reveals it only after
			// confirming a non-self-view signed-in viewer. If the hidden
			// class drops, anonymous / self viewers would see a button that
			// 400s on submit.
			expect(source).toMatch(/id=["']profile-report-wrap["'][^>]*class=["'][^"']*\bhidden\b/);
			expect(source).toMatch(/id=["']profile-report-btn["']/);
			expect(source).toMatch(/>\s*Report this profile/);
		});

		it('declares a <dialog id="report-dialog"> native modal (not a custom overlay)', () => {
			// Browser-native <dialog> gets escape-key handling, focus trap,
			// and ::backdrop styling for free. Picking a bespoke overlay
			// would skip those a11y wins — pin the <dialog>.
			expect(source).toMatch(/<dialog[^>]*id=["']report-dialog["']/);
		});

		it('offers all five reason categories as radio inputs', () => {
			// REPORT_REASONS in api/src/lib/reports.ts must match 1:1.
			// Positive — each value present as a radio option.
			const reasons = ['off_topic', 'harassment', 'impersonation', 'spam', 'other'];
			for (const reason of reasons) {
				expect(source).toMatch(new RegExp(`type=["']radio["'][^>]*value=["']${reason}["']`, 's'));
			}
		});

		it('caps the note at 500 characters via maxlength', () => {
			// Spec FR-111 schema: note ≤ 500 chars. Pin the client-side
			// hint so the UX doesn't let users type something the server
			// will truncate.
			expect(source).toMatch(/id=["']report-note["'][^>]*maxlength=["']500["']/);
		});

		it('links to the Terms page in the modal copy', () => {
			// Reporters should see what policy the report maps to. Pin
			// the /terms link in the dialog so a copy-edit can't drop it.
			expect(source).toMatch(/href=["']\/terms["']/);
		});

		it('declares a toast element for the submission confirmation', () => {
			// The response is deliberately opaque (FR-113) — the only
			// signal to the reporter is this toast. If the element drops,
			// a successful submit would feel like nothing happened.
			expect(source).toMatch(/id=["']report-toast["'][^>]*role=["']status["']/);
			expect(source).toMatch(/Thanks,\s*we['']ll review/i);
		});
	});

	describe('script wiring', () => {
		it('imports submitReport, getPrincipal and ReportReason from the api service', () => {
			// Any one of these dropping breaks a core piece — getPrincipal
			// drives the self-view hide, submitReport drives the POST, and
			// ReportReason types the radio value. Pin the import.
			expect(source).toMatch(/\bgetPrincipal\b/);
			expect(source).toMatch(/\bsubmitReport\b/);
			expect(source).toMatch(/\bReportReason\b/);
		});

		it('has a wireReportAffordance function and calls it from the resolved-profile branch', () => {
			expect(source).toMatch(/function\s+wireReportAffordance\s*\(/);
			// Called with `void` to make the fire-and-forget intent
			// explicit (ESLint no-floating-promises rule compliance).
			expect(source).toMatch(/void\s+wireReportAffordance\s*\(\s*profile\s*\)/);
		});

		it('hides the button on self-view (viewerLogin === ownerLogin, case-insensitive)', () => {
			// Pin the two toLowerCase() calls so a future refactor that
			// drops case-insensitivity doesn't let a 'Rmjoia' viewer see
			// a Report button on 'rmjoia' profile. The server also
			// rejects self-reports — this is UX hygiene.
			expect(source).toMatch(
				/viewerLogin\s*=\s*\(principal\.userDetails[\s\S]{0,80}\.toLowerCase\(\)/
			);
			expect(source).toMatch(
				/ownerLogin\s*=\s*\(profile\.githubUsername[\s\S]{0,80}\.toLowerCase\(\)/
			);
			expect(source).toMatch(/viewerLogin\s*===\s*ownerLogin/);
		});

		it('prevents the <form method="dialog"> default and drives the POST itself', () => {
			// If a future refactor forgets `e.preventDefault()`, the
			// form's method="dialog" closes the modal WITHOUT firing a
			// POST — report never reaches the server, no feedback. Pin
			// the preventDefault() AND the submitReport() call that
			// replaces it.
			expect(source).toMatch(/e\.preventDefault\(\)/);
			expect(source).toMatch(/await\s+submitReport\s*\(/);
		});

		it('surfaces an error message in-dialog on submission failure (no silent fail)', () => {
			// A 500 from the server must stay visible so the reporter
			// knows to retry. Pin the error-element reveal path.
			expect(source).toMatch(/id=["']report-error["']/);
			expect(source).toMatch(/errorEl.*classList\.remove\(['"]hidden['"]\)/);
		});
	});
});
