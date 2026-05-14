import { type UserRepository, type UserRecord, userIdForGithub } from './users';
import { type AdminRosterRepository, getOrSeedRoster, mutateRoster } from './admin-roster';

/**
 * What we need from the principal to resolve roles. Decoupled from the
 * full SWA HttpRequest so we can test resolveRoles with plain values.
 */
export interface ResolvedPrincipal {
	swaUserId: string;
	githubUsername: string;
	identityProvider: string;
}

/**
 * Inputs to resolveRoles. Repositories are injected (DIP); bootstrapLogins
 * is the parsed env-var set computed once per request by the caller.
 */
export interface RolesResolverDeps {
	repo: UserRepository;
	roster: AdminRosterRepository;
	bootstrapLogins: ReadonlySet<string>;
	/** Allows tests to freeze "now"; production passes Date.now/toISOString. */
	now?: () => string;
}

/**
 * The single place that decides "what roles does this principal have?".
 * Used by:
 *   - get-roles (rolesSource): SWA calls per-login; result attached to session
 *   - admin handlers: defense-in-depth check on top of the SWA route gate
 *
 * Source of truth:
 *   - Admin role → AdminRoster (single doc with optimistic concurrency)
 *   - Other roles → UserRecord.roles[] (no atomicity needs)
 *
 * Discovery:
 *   - findByGithubUsernameAcrossShapes covers both `gh-<username>` (post-#32)
 *     and legacy non-`gh-` ids (pre-#32 records like the maintainer's own
 *     pre-PR-#14 doc, where id === SWA-principal-hash).
 *
 * Legacy migration:
 *   - When discovery returns a legacy-shape record (id !== `gh-<username>`),
 *     migrate it to the new shape: upsert under `gh-<username>` preserving
 *     fields, best-effort delete the legacy doc. After migration the
 *     bootstrap path can fire — see "Bootstrap" below.
 *
 * Bootstrap:
 *   - Fires when the user has NO new-shape record yet AND is in
 *     ADMIN_GITHUB_LOGINS. Two flavours:
 *       (a) Truly fresh user → create record + add to roster.
 *       (b) Just-migrated legacy user → append admin role to migrated
 *           record + add to roster. This is the one-time graduation of
 *           pre-#32 records into the role system; without it, legacy
 *           users in ADMIN_GITHUB_LOGINS would never get admin because
 *           their pre-existing legacy record disqualified them from the
 *           bootstrap branch.
 *
 * Once a user has a `gh-<username>` record, the env var has no effect on
 * them — UI grants/revokes via /admin become the only way to change
 * roles. Intent: env var seeds first admin(s) on a fresh deploy AND
 * graduates legacy records on first login post-migration; after that the
 * running system is managed via /admin.
 */
export async function resolveRoles(
	principal: ResolvedPrincipal,
	deps: RolesResolverDeps
): Promise<string[]> {
	if (principal.identityProvider !== 'github') return [];
	if (!principal.githubUsername) return [];

	const username = principal.githubUsername.toLowerCase();
	const targetId = userIdForGithub(username);
	const now = deps.now ?? (() => new Date().toISOString());

	// Discover record across both shapes.
	let existing = await deps.repo.findByGithubUsernameAcrossShapes(username);

	// Legacy-shape migration. Mirrors the profile auto-heal pattern from
	// PR #40: write the new shape first, then best-effort delete the old.
	// `migrationApplied` flags this run as a one-time graduation so the
	// bootstrap branch below can fire even though `existing` is now
	// truthy (it points at the migrated record). `legacyIdMigrated`
	// captures the OLD id so we can normalize the roster too — see
	// "Roster repair" below.
	let migrationApplied = false;
	let legacyIdMigrated: string | null = null;
	if (existing && existing.id !== targetId) {
		const legacyId = existing.id;
		const migrated: UserRecord = {
			...existing,
			id: targetId,
			githubUsername: username,
			swaUserId: principal.swaUserId,
			roles: existing.roles ?? [],
			updatedAt: now(),
		};
		await deps.repo.upsert(migrated);
		// Don't fail role resolution if the legacy delete fails — the
		// migrated doc is canonical from this point on. Subsequent logins
		// will discover the gh-<username> record via point-read first and
		// won't re-enter this branch.
		try {
			await deps.repo.deleteById(legacyId);
		} catch {
			// Swallow — migration already succeeded with the upsert above.
		}
		existing = migrated;
		migrationApplied = true;
		legacyIdMigrated = legacyId;
	}

	// Roster is authoritative for the admin role. We compute
	// isAdminPerRoster from a fresh read AND, if the just-migrated user
	// had their legacy id sitting in the roster (because a previous
	// admin grant happened while the record was legacy-shape, or
	// getOrSeedRoster seeded from such a record), we repair the roster
	// in the same call: swap legacy → canonical, dedupe.
	//
	// The repair uses mutateRoster (CAS retry loop) — a previous version
	// did a single read-then-write which could throw RosterStaleError on
	// contention and fail the login closed (Copilot review). With
	// mutateRoster, concurrent writers don't cost the user their roles.
	let isAdminPerRoster: boolean;
	if (legacyIdMigrated) {
		const legacyId = legacyIdMigrated; // Capture for closure typing.
		isAdminPerRoster = await mutateRoster<boolean>(
			deps.roster,
			deps.repo,
			(current) => {
				if (!current.admins.includes(legacyId)) {
					// Roster doesn't carry the legacy id — nothing to repair.
					// Could be: (a) user was never admin under legacy shape, or
					// (b) a concurrent caller already repaired it. Either way,
					// abort the write and report the current admin status.
					return { abort: current.admins.includes(targetId) };
				}
				const repairedAdmins = Array.from(
					new Set(current.admins.map((id) => (id === legacyId ? targetId : id)))
				);
				return {
					next: { ...current, admins: repairedAdmins },
					result: repairedAdmins.includes(targetId),
				};
			},
			{ now: deps.now }
		);
	} else {
		// Fresh read; no repair needed. getOrSeedRoster tolerates the
		// seed-from-userRepo path so a fresh deploy with admins recorded
		// only in user docs gets reconciled on first login.
		const initialRoster = await getOrSeedRoster(deps.roster, deps.repo, now);
		isAdminPerRoster = initialRoster.admins.includes(targetId);
	}

	// Bootstrap-eligibility: env var matches AND user not already admin AND
	// (no record yet OR just migrated from legacy shape — pre-#32 records
	// effectively didn't exist from the new role system's perspective).
	const eligibleForBootstrap =
		deps.bootstrapLogins.has(username) && !isAdminPerRoster && (!existing || migrationApplied);

	if (eligibleForBootstrap) {
		const stamp = now();
		// Roster FIRST, then user record. If the roster write fails, no
		// user record is created — the next login retries cleanly.
		// Writing the user record first would risk leaving `existing`
		// truthy for next time while the user is still missing from the
		// roster, locking them out permanently.
		//
		// Uses mutateRoster (CAS retry loop) so concurrent roster writes
		// don't cause this login to fail closed. If a concurrent caller
		// already added us, abort the write and proceed — we're admin
		// either way. (Copilot review on the legacy-id repair surfaced
		// the same staleness risk on this older write; fixing both.)
		await mutateRoster<void>(
			deps.roster,
			deps.repo,
			(current) => {
				if (current.admins.includes(targetId)) {
					return { abort: undefined };
				}
				return {
					next: {
						...current,
						admins: Array.from(new Set([...current.admins, targetId])),
					},
					result: undefined,
				};
			},
			{ now: deps.now }
		);

		if (existing) {
			// Migrated-legacy case: append admin role to the migrated
			// record (preserve any pre-existing roles).
			const newRoles = Array.from(new Set([...(existing.roles ?? []), 'admin']));
			await deps.repo.upsert({
				...existing,
				roles: newRoles,
				grantedBy: existing.grantedBy ?? 'bootstrap',
				grantedAt: existing.grantedAt ?? stamp,
				updatedAt: stamp,
			});
			return ['admin', ...newRoles.filter((r) => r !== 'admin')];
		}

		// Truly-fresh case: create the record from scratch.
		const record: UserRecord = {
			id: targetId,
			githubUsername: username,
			swaUserId: principal.swaUserId,
			roles: ['admin'],
			grantedBy: 'bootstrap',
			grantedAt: stamp,
			updatedAt: stamp,
		};
		await deps.repo.upsert(record);
		return ['admin'];
	}

	if (existing) {
		// Backfill swaUserId on first login if the record was created via
		// admins-grant before this user ever signed in.
		if (!existing.swaUserId || existing.swaUserId !== principal.swaUserId) {
			await deps.repo.upsert({
				...existing,
				swaUserId: principal.swaUserId,
				updatedAt: now(),
			});
		}

		// Compose: admin from roster, other roles from the record.
		const otherRoles = (existing.roles ?? []).filter((r) => r !== 'admin');
		return isAdminPerRoster ? ['admin', ...otherRoles] : otherRoles;
	}

	// No record AND not bootstrap-eligible. One last branch: if the user
	// is already in the roster (e.g. previously granted, record cleaned
	// up out-of-band) → rebuild the user record from roster state.
	if (isAdminPerRoster) {
		const stamp = now();
		const rebuilt: UserRecord = {
			id: targetId,
			githubUsername: username,
			swaUserId: principal.swaUserId,
			roles: ['admin'],
			grantedBy: 'unknown',
			grantedAt: stamp,
			updatedAt: stamp,
		};
		await deps.repo.upsert(rebuilt);
		return ['admin'];
	}

	return [];
}

/**
 * API-side admin check. On SWA Free, `principal.userRoles` from the SWA
 * client principal only carries the built-in `anonymous` / `authenticated`
 * roles — function-based role assignment (rolesSource) is Standard-only.
 * Admin handlers therefore can't rely on `userRoles.includes('admin')`
 * and must verify against the roster directly. This wraps resolveRoles
 * so the single source-of-truth logic lives in one place — same code
 * path the frontend hits via GET /api/get-roles.
 */
export async function isAdminFor(
	principal: ResolvedPrincipal,
	deps: RolesResolverDeps
): Promise<boolean> {
	const roles = await resolveRoles(principal, deps);
	return roles.includes('admin');
}

/**
 * Admin-tier role names recognised by the API. Any of these in
 * `principal.userRoles` short-circuits the roster lookup and grants
 * admin access immediately.
 *
 *   - 'admin'     — legacy roster-based grant (pre-invitation system)
 *   - 'manager'   — full platform admin (invitation system)
 *   - 'moderator' — handles reports + user bans (invitation system, future)
 *   - 'messenger' — admin → user messaging / tickets (invitation system, future)
 *
 * Spec 004 will refine per-role permissions. Until then, all four are
 * treated as admin-equivalent for the existing admin endpoints. The
 * frontend mirrors this list in src/services/api.ts — keep them in sync
 * until we have a shared types package.
 *
 * Originally lived in its own ./lib/admin-roles.ts file but moved here
 * after SWA's Oryx packaging consistently failed to ship the new file
 * to the deployed Function host (every endpoint that imported it
 * returned 404 due to "Cannot find module" at registration time).
 * Co-locating with the rest of the role logic in roles.ts — known
 * deployed — works around the packaging issue.
 */
export const ADMIN_ROLE_NAMES: readonly string[] = ['admin', 'manager', 'moderator', 'messenger'];

/**
 * True when the principal carries any admin-tier role. Used as the
 * fast-path check in admin handlers — invitation-assigned roles arrive
 * here via the SWA's `x-ms-client-principal` header, no Cosmos lookup
 * required. Returns false for unauthenticated principals.
 */
export function principalHasAdminRole(
	principal: { userRoles?: string[] } | null | undefined
): boolean {
	if (!principal?.userRoles) return false;
	return ADMIN_ROLE_NAMES.some((r) => principal.userRoles!.includes(r));
}

/**
 * Parse the comma-separated ADMIN_GITHUB_LOGINS env var into a
 * lowercased Set. Empty / unset returns an empty Set.
 */
export function parseAdminLogins(raw: string | undefined): ReadonlySet<string> {
	if (!raw) return new Set();
	return new Set(
		raw
			.split(',')
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean)
	);
}
