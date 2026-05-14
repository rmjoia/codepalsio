import { describe, it, expect, beforeEach } from 'vitest';
import {
	resolveRoles,
	isAdminFor,
	parseAdminLogins,
	ADMIN_ROLE_NAMES,
	principalHasAdminRole,
} from './roles';
import { FakeUserRepository } from './users.fake';
import { FakeAdminRosterRepository } from './admin-roster.fake';
import { userIdForGithub } from './users';
import type { ClientPrincipal } from './types';

function makePrincipal(userRoles: string[]): ClientPrincipal {
	return {
		identityProvider: 'github',
		userId: 'u1',
		userDetails: 'someone',
		userRoles,
		claims: [],
	};
}

const FROZEN_NOW = '2026-01-01T00:00:00.000Z';

describe('resolveRoles', () => {
	let repo: FakeUserRepository;
	let roster: FakeAdminRosterRepository;
	const now = () => FROZEN_NOW;

	beforeEach(() => {
		repo = new FakeUserRepository();
		roster = new FakeAdminRosterRepository();
	});

	describe('non-GitHub providers', () => {
		it('returns [] for any non-github identity provider', async () => {
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'aad' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			expect(roles).toEqual([]);
			expect(await repo.countByRole('admin')).toBe(0); // didn't seed
		});
	});

	describe('DB record exists', () => {
		it('returns roles from the DB record', async () => {
			await repo.upsert({
				id: userIdForGithub('rmjoia'),
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: ['admin'],
				updatedAt: FROZEN_NOW,
			});
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['someone-else']), now }
			);
			expect(roles).toEqual(['admin']);
		});

		it('returns [] when DB record has no roles (e.g., revoked via UI)', async () => {
			await repo.upsert({
				id: userIdForGithub('rmjoia'),
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: [],
				updatedAt: FROZEN_NOW,
			});
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				// Even if env var lists them, DB record (with empty roles) wins.
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			expect(roles).toEqual([]);
		});

		it('backfills swaUserId on first login when grant pre-dated user signup', async () => {
			await repo.upsert({
				id: userIdForGithub('newadmin'),
				githubUsername: 'newadmin',
				// swaUserId intentionally absent — granted before they ever logged in
				roles: ['admin'],
				updatedAt: FROZEN_NOW,
			});
			await resolveRoles(
				{ swaUserId: 'u-new', githubUsername: 'newadmin', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);
			const after = await repo.findByGithubUsername('newadmin');
			expect(after?.swaUserId).toBe('u-new');
		});

		it('updates swaUserId if it has changed (e.g. account reset)', async () => {
			await repo.upsert({
				id: userIdForGithub('rmjoia'),
				githubUsername: 'rmjoia',
				swaUserId: 'old-id',
				roles: ['admin'],
				updatedAt: FROZEN_NOW,
			});
			await resolveRoles(
				{ swaUserId: 'new-id', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);
			const after = await repo.findByGithubUsername('rmjoia');
			expect(after?.swaUserId).toBe('new-id');
		});

		it('lookup is case-insensitive', async () => {
			await repo.upsert({
				id: userIdForGithub('RMJoia'),
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: ['admin'],
				updatedAt: FROZEN_NOW,
			});
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'RMJOIA', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);
			expect(roles).toEqual(['admin']);
		});
	});

	describe('bootstrap path (no DB record)', () => {
		it('grants admin when user is in ADMIN_GITHUB_LOGINS and creates the seed record', async () => {
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			expect(roles).toEqual(['admin']);
			const created = await repo.findByGithubUsername('rmjoia');
			expect(created).toMatchObject({
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: ['admin'],
				grantedBy: 'bootstrap',
				grantedAt: FROZEN_NOW,
				updatedAt: FROZEN_NOW,
			});
			expect(created?.id).toBe(userIdForGithub('rmjoia'));
		});

		it('returns [] when user is not in ADMIN_GITHUB_LOGINS', async () => {
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'mallory', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			expect(roles).toEqual([]);
			expect(await repo.countByRole('admin')).toBe(0);
		});

		it('subsequent logins of the same bootstrap user use the DB path, not bootstrap', async () => {
			// First login → bootstrap creates record
			await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			// Second login → with env var EMPTIED. Should still be admin (DB record wins).
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);
			expect(roles).toEqual(['admin']);
		});

		it('removing a user from env var does NOT auto-revoke them', async () => {
			// User was bootstrapped earlier
			await repo.upsert({
				id: userIdForGithub('rmjoia'),
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: ['admin'],
				grantedBy: 'bootstrap',
				updatedAt: FROZEN_NOW,
			});
			// Operator removed env var entry, but DB still says admin
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);
			expect(roles).toEqual(['admin']);
		});

		it('bootstrap path is case-insensitive against env var', async () => {
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'RmJoIa', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			expect(roles).toEqual(['admin']);
		});
	});

	describe('edge cases', () => {
		it('returns [] when githubUsername is empty', async () => {
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: '', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			expect(roles).toEqual([]);
		});
	});

	describe('legacy-shape user record migration', () => {
		// The maintainer's pre-#32 user record looks like this in prod:
		//   { id: '59298c75…', userId: '59298c75…', githubUsername: 'rmjoia',
		//     registrationDate: ..., lastLogin: ... }
		// — NO `roles` field, NO `gh-` id prefix. findByGithubUsername (point-
		// read on `gh-rmjoia`) misses it; findByGithubUsernameAcrossShapes
		// catches it via cross-partition query on the githubUsername field.
		// resolveRoles must (a) migrate it to `gh-rmjoia` shape on discovery,
		// (b) delete the legacy doc, and (c) graduate the user via the
		// bootstrap path if env-var-eligible — this is the one-time path
		// that takes pre-#32 records into the new role system.

		const LEGACY_ID = '59298c758a6f409c83d05d9f0bce90c9';

		// Seed a legacy doc. By default `roles` is set to [] for ergonomics —
		// most production code paths read `existing.roles ?? []` so an empty
		// array and an undefined value behave identically. The truly-missing-
		// field shape (matching prod's actual data) is exercised by the
		// dedicated test below ("handles a legacy doc with truly missing
		// roles field").
		function seedLegacy(overrides: Partial<{ roles: string[]; updatedAt: string }> = {}) {
			repo.store.set(LEGACY_ID, {
				id: LEGACY_ID,
				githubUsername: 'rmjoia',
				roles: overrides.roles ?? [],
				updatedAt: overrides.updatedAt ?? '2025-11-24T17:25:15Z',
				// pre-#32 records don't carry swaUserId / grantedBy / grantedAt
			});
		}

		it('migrates a legacy record (no roles, no env var) to gh-<username> with no admin', async () => {
			seedLegacy();
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);

			expect(roles).toEqual([]);
			// Legacy doc deleted, gh-rmjoia created with backfilled fields.
			expect(repo.store.has(LEGACY_ID)).toBe(false);
			const migrated = repo.store.get(userIdForGithub('rmjoia'));
			expect(migrated).toMatchObject({
				id: 'gh-rmjoia',
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: [],
			});
			// Roster untouched (no admin granted).
			expect(roster.stored?.admins ?? []).toEqual([]);
		});

		it("migrates a legacy record AND grants admin when env var matches (the maintainer's scenario)", async () => {
			// This is the exact scenario blocking the maintainer's admin nav:
			// legacy record exists, no roles, but ADMIN_GITHUB_LOGINS=rmjoia.
			// Without legacy migration + bootstrap-on-migration, env var was
			// silently ignored because findByGithubUsername returned null →
			// bootstrap fired → wrote gh-rmjoia → BUT the legacy lingered as
			// orphan. Worse, in some flows the legacy was re-discovered on
			// next login and the bootstrap path was skipped, locking admin
			// out permanently.
			seedLegacy();

			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);

			expect(roles).toEqual(['admin']);
			// Legacy doc deleted, gh-rmjoia carries admin role + bootstrap
			// provenance.
			expect(repo.store.has(LEGACY_ID)).toBe(false);
			const migrated = repo.store.get(userIdForGithub('rmjoia'));
			expect(migrated).toMatchObject({
				id: 'gh-rmjoia',
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: ['admin'],
				grantedBy: 'bootstrap',
				grantedAt: FROZEN_NOW,
			});
			// Roster contains the new gh-<username> id, not the legacy one.
			expect(roster.stored?.admins).toEqual(['gh-rmjoia']);
		});

		it('preserves pre-existing non-admin roles through migration', async () => {
			seedLegacy({ roles: ['moderator'] });

			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);

			expect(roles).toEqual(['moderator']);
			const migrated = repo.store.get(userIdForGithub('rmjoia'));
			expect(migrated?.roles).toEqual(['moderator']);
		});

		it('lower-cases the github username on migration (canonicalizes)', async () => {
			repo.store.set('LegAcyMixed', {
				id: 'LegAcyMixed',
				githubUsername: 'RmJoia',
				roles: [],
				updatedAt: FROZEN_NOW,
			});

			await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);

			const migrated = repo.store.get('gh-rmjoia');
			expect(migrated?.githubUsername).toBe('rmjoia');
			expect(repo.store.has('LegAcyMixed')).toBe(false);
		});

		it('does NOT re-migrate when a gh-<username> record already exists (point-read wins)', async () => {
			// Existing canonical record at gh-rmjoia. findByGithubUsernameAcross
			// Shapes returns this via point-read first, never reaches the
			// fallback query that would expose the legacy doc. Nothing to
			// migrate this call.
			await repo.upsert({
				id: userIdForGithub('rmjoia'),
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: ['admin'],
				updatedAt: FROZEN_NOW,
			});

			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);

			expect(roles).toEqual(['admin']);
			// gh-rmjoia still there, no migration churn.
			expect(repo.store.size).toBeGreaterThanOrEqual(1);
			expect(repo.store.has('gh-rmjoia')).toBe(true);
		});

		it('handles a legacy doc with truly missing roles field (matches prod data shape)', async () => {
			// The maintainer's actual prod doc literally has no `roles` key —
			// pre-#32 records pre-date the field. The cast lets us model that
			// without TypeScript complaining; production resolveRoles must
			// handle it via `existing.roles ?? []` — exercised here.
			repo.store.set(LEGACY_ID, {
				id: LEGACY_ID,
				githubUsername: 'rmjoia',
				updatedAt: '2025-11-24T17:25:15Z',
				// roles, swaUserId, grantedBy, grantedAt all absent
			} as unknown as Parameters<typeof repo.upsert>[0]);

			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);

			expect(roles).toEqual(['admin']);
			const migrated = repo.store.get(userIdForGithub('rmjoia'));
			// roles field correctly defaulted to [] before admin was appended
			// by the bootstrap path.
			expect(migrated?.roles).toEqual(['admin']);
			expect(repo.store.has(LEGACY_ID)).toBe(false);
		});

		it('repairs the roster when it carries the legacy id (Copilot review fix)', async () => {
			// Scenario: a previous deploy had the user as admin in their
			// legacy-shape user record. getOrSeedRoster seeded the roster
			// with `r.id` directly — so the roster admins[] contains the
			// legacy hash, not gh-rmjoia. After this PR's migration writes
			// gh-rmjoia, isAdminPerRoster against gh-rmjoia would be false
			// without the repair, silently revoking admin. The repair swaps
			// legacy → canonical inside the roster on the same call.
			seedLegacy({ roles: ['admin'] });
			roster.seed([LEGACY_ID]);

			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);

			expect(roles).toContain('admin');
			expect(roster.stored?.admins).toEqual(['gh-rmjoia']);
			expect(roster.stored?.admins).not.toContain(LEGACY_ID);
		});

		it('roster repair dedupes if both legacy and canonical ids were already in the roster', async () => {
			// Defensive: if a previous migration partially completed (canonical
			// added, legacy not removed), the roster could carry both. Repair
			// must not produce duplicates.
			seedLegacy({ roles: ['admin'] });
			roster.seed([LEGACY_ID, userIdForGithub('rmjoia')]);

			await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);

			expect(roster.stored?.admins).toEqual(['gh-rmjoia']);
			expect(roster.stored?.admins.length).toBe(1);
		});

		it('does NOT touch the roster when no legacy id is present (no-op repair)', async () => {
			// Sanity: the repair writes the roster only when legacy id is in
			// it. Otherwise the roster stays untouched (no spurious writes,
			// no contention with concurrent operators).
			seedLegacy();
			roster.seed(['gh-someoneelse']);
			const writesBefore = roster.writes;

			await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);

			expect(roster.stored?.admins).toEqual(['gh-someoneelse']);
			// Repair didn't fire; only writes from the bootstrap path (none
			// in this test — env var empty) would bump this counter.
			expect(roster.writes).toBe(writesBefore);
		});

		it('roster repair survives concurrent etag contention (mutateRoster retry loop)', async () => {
			// Copilot review (round 2): the original repair did a single
			// read-modify-write that would throw RosterStaleError on
			// contention and fail the login closed. The fix: route the
			// repair through mutateRoster's CAS retry loop. This test
			// simulates one round of contention via the fake's
			// simulateContention() hook.
			seedLegacy({ roles: ['admin'] });
			roster.seed([LEGACY_ID]);
			roster.simulateContention(1); // First write attempt sees a stale etag.

			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);

			// Despite the contention bump, the user keeps admin and the
			// roster is fully repaired on the retry.
			expect(roles).toContain('admin');
			expect(roster.stored?.admins).toEqual(['gh-rmjoia']);
		});

		it('bootstrap path also survives concurrent etag contention', async () => {
			// Same fix applied prophylactically to the existing bootstrap
			// roster write — it had the same staleness risk pre-PR. With
			// mutateRoster, contention resolves transparently and the user
			// gets admin without operator intervention.
			roster.simulateContention(1);

			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);

			expect(roles).toEqual(['admin']);
			expect(roster.stored?.admins).toContain('gh-rmjoia');
		});
	});

	describe('bootstrap atomicity', () => {
		// If the user record were written before the roster, a failed
		// roster write would leave a UserRecord with `roles: ['admin']`
		// but no roster entry. On the next login, `existing` becomes
		// truthy → bootstrap branch is skipped → the user is NEVER added
		// to the roster → resolveRoles returns []. The intended first
		// admin is permanently locked out.
		//
		// Roster-first ensures: roster-write failure → no record created
		// → next login retries bootstrap cleanly. Record-write failure
		// after roster-write → next login takes the rebuild branch
		// ('isAdminPerRoster && !existing') → record gets recreated.
		it('does not create a user record when the roster write fails', async () => {
			const failingRoster = {
				read: async () => ({
					id: 'roster' as const,
					admins: [],
					updatedAt: FROZEN_NOW,
					_etag: 'e1',
				}),
				write: async () => {
					throw new Error('cosmos down');
				},
			};

			await expect(
				resolveRoles(
					{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
					{ repo, roster: failingRoster, bootstrapLogins: new Set(['rmjoia']), now }
				)
			).rejects.toThrow();

			// Critical assertion: the user record was NOT created. Without
			// roster-first, this would have written the record and locked
			// the user out forever.
			expect(await repo.findByGithubUsername('rmjoia')).toBeNull();
		});

		it('rebuilds a missing user record on next login when roster says admin (record-write failure recovery)', async () => {
			// Simulates: prior bootstrap attempt wrote roster, then crashed
			// before writing the user record. Roster has [rmjoia], no record.
			roster.seed([userIdForGithub('rmjoia')]);

			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);
			expect(roles).toEqual(['admin']);
			// Record was rebuilt
			const rebuilt = await repo.findByGithubUsername('rmjoia');
			expect(rebuilt).toMatchObject({
				githubUsername: 'rmjoia',
				roles: ['admin'],
				swaUserId: 'u1',
			});
		});
	});
});

describe('parseAdminLogins', () => {
	it('returns empty Set for unset/empty input', () => {
		expect(parseAdminLogins(undefined).size).toBe(0);
		expect(parseAdminLogins('').size).toBe(0);
		expect(parseAdminLogins('   ').size).toBe(0);
	});

	it('parses a comma-separated list, trims whitespace, lowercases', () => {
		const set = parseAdminLogins(' Alice ,  BOB,  rmjoia ');
		expect([...set].sort()).toEqual(['alice', 'bob', 'rmjoia']);
	});

	it('drops empty entries from extra commas', () => {
		const set = parseAdminLogins(',alice,,bob,');
		expect([...set].sort()).toEqual(['alice', 'bob']);
	});
});

describe('isAdminFor', () => {
	let repo: FakeUserRepository;
	let roster: FakeAdminRosterRepository;
	const now = () => '2026-01-01T00:00:00.000Z';

	beforeEach(() => {
		repo = new FakeUserRepository();
		roster = new FakeAdminRosterRepository();
	});

	it('returns true when the user is in the roster', async () => {
		roster.seed([userIdForGithub('rmjoia')]);
		const ok = await isAdminFor(
			{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
			{ repo, roster, bootstrapLogins: new Set(), now }
		);
		expect(ok).toBe(true);
	});

	it('returns false when the user is not in the roster and has no record', async () => {
		const ok = await isAdminFor(
			{ swaUserId: 'u1', githubUsername: 'stranger', identityProvider: 'github' },
			{ repo, roster, bootstrapLogins: new Set(), now }
		);
		expect(ok).toBe(false);
	});

	it('returns false for non-GitHub identity providers even if the username is in the roster', async () => {
		roster.seed([userIdForGithub('rmjoia')]);
		const ok = await isAdminFor(
			{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'aad' },
			{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
		);
		expect(ok).toBe(false);
	});

	it('returns true via bootstrap when env var lists the user on a fresh deploy', async () => {
		const ok = await isAdminFor(
			{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
			{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
		);
		expect(ok).toBe(true);
	});
});

describe("ADMIN_ROLE_NAMES", () => {
	it("covers the legacy roster role and the invitation roles", () => {
		expect([...ADMIN_ROLE_NAMES].sort()).toEqual(["admin", "manager", "messenger", "moderator"]);
	});
});

describe("principalHasAdminRole", () => {
	it("returns false for null", () => {
		expect(principalHasAdminRole(null)).toBe(false);
	});

	it("returns false when userRoles only has built-in roles", () => {
		expect(principalHasAdminRole(makePrincipal(["anonymous", "authenticated"]))).toBe(false);
	});

	it.each(ADMIN_ROLE_NAMES)("returns true when userRoles includes %s", (role) => {
		expect(principalHasAdminRole(makePrincipal(["authenticated", role]))).toBe(true);
	});

	it("returns true when any admin-tier role is present alongside others", () => {
		expect(principalHasAdminRole(makePrincipal(["anonymous", "authenticated", "manager"]))).toBe(true);
	});

	it("returns false for an unrelated custom role (e.g. \"member\")", () => {
		expect(principalHasAdminRole(makePrincipal(["authenticated", "member"]))).toBe(false);
	});
});
