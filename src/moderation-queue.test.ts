import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Source-level invariants for the moderation surface (spec 003 US3).
 *
 * Two files are pinned here:
 *   - src/pages/admin/reports.astro — the queue page
 *   - src/pages/profile/index.astro — adds the owner-side unlisted banner
 *
 * Scope: markup + script wiring. Behaviour is covered by the API-side
 * unit tests on report-resolve + reports-list.
 */
const queuePath = resolve(__dirname, 'pages/admin/reports.astro');
const queue = readFileSync(queuePath, 'utf8');

const profilePath = resolve(__dirname, 'pages/profile/index.astro');
const profile = readFileSync(profilePath, 'utf8');

describe('admin/reports.astro — moderation queue (spec 003 US3)', () => {
	describe('page skeleton', () => {
		it('declares loading / error / main / empty / list states by id', () => {
			// Mirrors the existing /admin pattern so a drive-by refactor
			// of state ids on one page would also flag here.
			expect(queue).toMatch(/id=["']loading-state["']/);
			expect(queue).toMatch(/id=["']error-state["']/);
			expect(queue).toMatch(/id=["']admin-main["']/);
			expect(queue).toMatch(/id=["']empty-state["']/);
			expect(queue).toMatch(/id=["']reports-list["']/);
		});

		it('links back to /admin', () => {
			// Discoverability: the queue is a sub-page of /admin; the back
			// link keeps a moderator from being stuck on a leaf page.
			expect(queue).toMatch(/href=["']\/admin["']/);
		});
	});

	describe('data wiring', () => {
		it('imports listReports and resolveReport from the api service', () => {
			expect(queue).toMatch(/\blistReports\b/);
			expect(queue).toMatch(/\bresolveReport\b/);
		});

		it('imports the admin-check helpers', () => {
			// Non-admins must be shown the Forbidden state; `isAdminPrincipal`
			// is the client-side gate. The server-side gate is the real
			// security boundary (reports-list.ts), but the UI shouldn't
			// render a loading state to a non-admin and then flip to
			// Forbidden — it should decide early.
			expect(queue).toMatch(/\bgetPrincipalWithRoles\b/);
			expect(queue).toMatch(/\bisAdminPrincipal\b/);
		});

		it('wires all three moderation actions (dismiss / unlist / suspend)', () => {
			// S5 ships suspend. Pin each dataset.action — a drive-by refactor
			// that renames one of them without updating the API would
			// silently break the queue.
			expect(queue).toMatch(/dataset\.action\s*=\s*['"]dismiss['"]/);
			expect(queue).toMatch(/dataset\.action\s*=\s*['"]unlist['"]/);
			expect(queue).toMatch(/dataset\.action\s*=\s*['"]suspend['"]/);
		});

		it('surfaces a spike indicator when reportCount > 1 (brigading signal)', () => {
			// Pin the compare — a refactor that always renders the badge
			// or always hides it both break the brigading signal.
			expect(queue).toMatch(/entry\.reportCount\s*>\s*1/);
		});

		it('asks for confirmation before unlisting (reversible but consequential)', () => {
			expect(queue).toMatch(/window\.confirm\(/);
		});

		it('requires a typed SUSPEND confirmation before suspending (irreversible, harshest action)', () => {
			// Suspend is the harshest action — one-click OK is too easy to
			// slip. The queue uses window.prompt and checks for the literal
			// string 'SUSPEND'. If this test fails, verify the typed-
			// confirmation UX is still in place.
			expect(queue).toMatch(/window\.prompt\(/);
			expect(queue).toMatch(/typed\s*!==\s*['"]SUSPEND['"]/);
		});
	});
});

describe('profile/index.astro — owner-side unlisted banner (spec 003 US3 FR-125)', () => {
	describe('markup', () => {
		it('declares an #unlisted-banner element, initially hidden', () => {
			expect(profile).toMatch(/id=["']unlisted-banner["'][^>]*class=["'][^"']*\bhidden\b/);
		});

		it('surfaces the Terms link + abuse email in the banner', () => {
			// The two outbound paths the user needs when they land on this
			// banner: (1) read the policy they allegedly violated,
			// (2) appeal via email. Pin both so a copy-edit can't drop
			// either without noticing.
			const bannerMatch = profile.match(
				/id=["']unlisted-banner["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/
			);
			expect(bannerMatch, 'unlisted-banner block must exist').not.toBeNull();
			const bannerHtml = bannerMatch![0];
			expect(bannerHtml).toMatch(/href=["']\/terms["']/);
			expect(bannerHtml).toMatch(/mailto:abuse@codepals\.io/);
		});
	});

	describe('script wiring', () => {
		it('reveals the banner when profile.unlistedBy is truthy', () => {
			// A profile with `unlistedBy` set MUST show the banner. The
			// toggle is `!unlistedByModerator`, so if the condition
			// inverts the banner shows for everyone — pin the branch.
			expect(profile).toMatch(/const\s+unlistedByModerator\s*=\s*Boolean\(profile\?\.unlistedBy\)/);
			expect(profile).toMatch(
				/unlistedBanner\.classList\.toggle\(['"]hidden['"],\s*!unlistedByModerator\)/
			);
		});

		it('disables the "public" visibility radio when unlisted by a moderator', () => {
			// If the user can just toggle themselves back to public, the
			// unlist action is purely cosmetic. The server-side guard
			// against this ships in S5; this is the client-side mirror.
			expect(profile).toMatch(
				/publicVisRadio.*=.*querySelector[\s\S]{0,200}input\[name=["']profileVisibility["']\]\[value=["']public["']\]/
			);
			expect(profile).toMatch(/publicVisRadio\.disabled\s*=\s*unlistedByModerator/);
		});
	});
});
