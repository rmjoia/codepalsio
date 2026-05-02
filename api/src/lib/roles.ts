import { type UserRepository, type UserRecord, userIdForGithub } from './users';

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
 * Inputs to resolveRoles. Repository is injected (DIP); bootstrapLogins
 * is the parsed env-var set computed once per request by the caller.
 */
export interface RolesResolverDeps {
	repo: UserRepository;
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
 * Semantics:
 *   - DB record exists → roles come from the record (DB is source of truth)
 *   - No DB record AND user is in ADMIN_GITHUB_LOGINS → bootstrap: create
 *     record with admin role, return ['admin']
 *   - Otherwise → []
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
	const now = deps.now ?? (() => new Date().toISOString());

	const existing = await deps.repo.findByGithubUsername(username);

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
		return [...existing.roles];
	}

	// Bootstrap path — only fires when the DB has no record for this user.
	if (deps.bootstrapLogins.has(username)) {
		const stamp = now();
		const record: UserRecord = {
			id: userIdForGithub(username),
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
