import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getCosmosConfig } from './lib/cosmos';
import { createUserRepository, type UserRepository, type UserRecord } from './lib/users';
import {
	createAdminRosterRepository,
	getOrSeedRoster,
	type AdminRosterRepository,
} from './lib/admin-roster';

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
}

function toListEntry(r: UserRecord): AdminListEntry {
	return {
		githubUsername: r.githubUsername,
		roles: r.roles,
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
	if (!principal.userRoles?.includes('admin')) {
		return { status: 403, jsonBody: { error: 'Forbidden' } };
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
		};
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
