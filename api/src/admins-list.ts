import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getCosmosConfig } from './lib/cosmos';
import { createUserRepository, type UserRepository, type UserRecord } from './lib/users';
import {
	createAdminRosterRepository,
	getOrSeedRoster,
	type AdminRosterRepository,
} from './lib/admin-roster';
import { isAdminFor, parseAdminLogins } from './lib/roles';
import type { ClientPrincipal } from './lib/types';

/**
 * Public-facing shape — strips swaUserId (internal) and any future
 * fields that shouldn't leak to the admin UI.
 */
export interface AdminListEntry {
	githubUsername: string;
	roles: string[];
	grantedBy?: string;
	grantedAt?: string;
	updatedAt: string;
}

export interface AdminRepos {
	users: UserRepository;
	roster: AdminRosterRepository;
	bootstrapLogins?: ReadonlySet<string>;
	/** Test seam — bypass the roster lookup. Default: real isAdminFor. */
	verifyAdmin?: (principal: ClientPrincipal) => Promise<boolean>;
}

/**
 * Project a UserRecord onto the public list shape, ensuring `roles`
 * reflects the roster's truth: every entry surfaced by this endpoint
 * is in the roster, so 'admin' must appear in the response regardless
 * of what the user record's roles[] currently says. Without this, a
 * partial failure (roster wrote, record didn't) would let the API
 * contradict its own source of truth.
 */
function toListEntry(r: UserRecord): AdminListEntry {
	const roles = r.roles?.includes('admin')
		? r.roles
		: [...(r.roles ?? []), 'admin'];
	return {
		githubUsername: r.githubUsername,
		roles,
		grantedBy: r.grantedBy,
		grantedAt: r.grantedAt,
		updatedAt: r.updatedAt,
	};
}

/**
 * Skeleton entry for a roster id that has no matching user record yet
 * (would only happen if a record was deleted out-of-band; the roster
 * is the source of truth so we still surface it).
 */
function skeletonEntry(id: string): AdminListEntry {
	return {
		githubUsername: id.startsWith('gh-') ? id.slice(3) : id,
		roles: ['admin'],
		updatedAt: '',
	};
}

export async function adminsListHandler(
	request: HttpRequest,
	context: InvocationContext,
	overrideRepos?: AdminRepos
): Promise<HttpResponseInit> {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return { status: 401, jsonBody: { error: 'Not authenticated' } };
	}

	let repos = overrideRepos;
	if (!repos) {
		const cfg = getCosmosConfig();
		if (!cfg) {
			context.error('admins-list: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}
		repos = {
			users: createUserRepository(cfg.connectionString, cfg.database),
			roster: createAdminRosterRepository(cfg.connectionString, cfg.database),
			bootstrapLogins: parseAdminLogins(process.env.ADMIN_GITHUB_LOGINS),
		};
	}

	// Authoritative admin check via the roster. SWA Free has no rolesSource
	// so principal.userRoles never carries 'admin' — we must verify here.
	const isAdmin = repos.verifyAdmin
		? await repos.verifyAdmin(principal)
		: await isAdminFor(
				{
					swaUserId: principal.userId,
					githubUsername: principal.userDetails,
					identityProvider: principal.identityProvider,
				},
				{
					repo: repos.users,
					roster: repos.roster,
					bootstrapLogins: repos.bootstrapLogins ?? new Set(),
				}
			);
	if (!isAdmin) {
		return { status: 403, jsonBody: { error: 'Forbidden' } };
	}

	try {
		const now = () => new Date().toISOString();
		const roster = await getOrSeedRoster(repos.roster, repos.users, now);

		// Fan out roster ids → user records for metadata. Bounded by the
		// admin count (small in practice; a few dozen at most). Sorted by
		// grantedAt DESC for stable, intuitive UI ordering — same contract
		// the previous listByRole query had.
		const entries = await Promise.all(
			roster.admins.map(async (id): Promise<AdminListEntry> => {
				const username = id.startsWith('gh-') ? id.slice(3) : id;
				const record = await repos!.users.findByGithubUsername(username);
				return record ? toListEntry(record) : skeletonEntry(id);
			})
		);

		entries.sort((a, b) => (b.grantedAt ?? '').localeCompare(a.grantedAt ?? ''));

		return { status: 200, jsonBody: { admins: entries } };
	} catch (error) {
		context.error('admins-list failed:', error);
		return { status: 500, jsonBody: { error: 'Failed to list admins' } };
	}
}

app.http('admins-list', {
	methods: ['GET'],
	authLevel: 'anonymous',
	handler: adminsListHandler,
});
