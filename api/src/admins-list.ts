import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getCosmosConfig } from './lib/cosmos';
import { createUserRepository, type UserRepository, type UserRecord } from './lib/users';

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

function toListEntry(r: UserRecord): AdminListEntry {
	return {
		githubUsername: r.githubUsername,
		roles: r.roles,
		grantedBy: r.grantedBy,
		grantedAt: r.grantedAt,
		updatedAt: r.updatedAt,
	};
}

export async function adminsListHandler(
	request: HttpRequest,
	context: InvocationContext,
	overrideRepo?: UserRepository
): Promise<HttpResponseInit> {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return { status: 401, jsonBody: { error: 'Not authenticated' } };
	}
	if (!principal.userRoles?.includes('admin')) {
		return { status: 403, jsonBody: { error: 'Forbidden' } };
	}

	let repo = overrideRepo;
	if (!repo) {
		const cfg = getCosmosConfig();
		if (!cfg) {
			context.error('admins-list: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}
		repo = createUserRepository(cfg.connectionString, cfg.database);
	}

	try {
		const admins = await repo.listByRole('admin');
		return { status: 200, jsonBody: { admins: admins.map(toListEntry) } };
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
