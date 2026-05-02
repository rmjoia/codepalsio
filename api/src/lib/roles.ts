import { type UserRepository, type UserRecord, userIdForGithub } from './users';
import { type AdminRosterRepository, getOrSeedRoster } from './admin-roster';

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
 * Bootstrap:
 *   - If user has no DB record AND is in ADMIN_GITHUB_LOGINS, create the
 *     user record AND add them to the roster. Returns ['admin'].
 *
 * Once a user has a DB record, the env var has no effect on them — UI
 * grants/revokes are the only way to change roles. This is the intent:
 * env var seeds the FIRST admin on a fresh deploy; the running system is
 * managed via the /admin UI.
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

	const existing = await deps.repo.findByGithubUsername(username);

	// Roster is authoritative for the admin role. Read once and reuse.
	// We tolerate the seed-from-userRepo path here too: a fresh deploy
	// with admins recorded only in user docs gets reconciled on first
	// login.
	const roster = await getOrSeedRoster(deps.roster, deps.repo, now);
	const isAdminPerRoster = roster.admins.includes(targetId);

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

	// No DB record. Three sub-cases:
	//   1. Already in roster (e.g. previously granted, record cleaned up
	//      out-of-band) → keep them admin and rebuild the user record.
	//   2. In bootstrap env → create user record AND add to roster.
	//   3. Otherwise → no roles.
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

	if (deps.bootstrapLogins.has(username)) {
		const stamp = now();
		// Roster FIRST, then user record. If the roster write fails, no
		// user record is created — the next login retries the bootstrap
		// path cleanly. Writing the user record first would risk leaving
		// `existing` truthy for next time while the user is still missing
		// from the roster, locking them out permanently. If the roster
		// write succeeds and the user-record write fails, the rebuild
		// branch above ("isAdminPerRoster && !existing") handles it on
		// the next login.
		await deps.roster.write({
			...roster,
			admins: Array.from(new Set([...roster.admins, targetId])),
			updatedAt: stamp,
		});
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

	return [];
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
