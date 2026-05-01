import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getCosmosConfig } from './lib/cosmos';
import { createUserRepository, type UserRepository } from './lib/users';

const GITHUB_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

interface RevokeBody {
	githubUsername?: unknown;
}

export async function adminsRevokeHandler(
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

	let body: RevokeBody = {};
	try {
		const parsed = await request.json();
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			body = parsed as RevokeBody;
		}
	} catch {
		return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
	}

	if (typeof body.githubUsername !== 'string' || !GITHUB_USERNAME_RE.test(body.githubUsername)) {
		return { status: 400, jsonBody: { error: 'Invalid githubUsername' } };
	}
	const username = body.githubUsername.toLowerCase();

	let repo = overrideRepo;
	if (!repo) {
		const cfg = getCosmosConfig();
		if (!cfg) {
			context.error('admins-revoke: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}
		repo = createUserRepository(cfg.connectionString, cfg.database);
	}

	try {
		const existing = await repo.findByGithubUsername(username);
		if (!existing || !existing.roles?.includes('admin')) {
			// Treat "not an admin" the same as "not found" — idempotent revoke.
			return { status: 404, jsonBody: { error: 'Not an admin' } };
		}

		// Last-admin guard: refuse to remove the only remaining admin. Locks
		// nobody out of /admin and out of further role management.
		const adminCount = await repo.countByRole('admin');
		if (adminCount <= 1) {
			return { status: 409, jsonBody: { error: 'Cannot revoke the last remaining admin' } };
		}

		const now = new Date().toISOString();
		const updated = {
			...existing,
			roles: existing.roles.filter((r) => r !== 'admin'),
			grantedBy: undefined,
			grantedAt: undefined,
			updatedAt: now,
		};
		await repo.upsert(updated);
		return { status: 200, jsonBody: { ok: true, githubUsername: username } };
	} catch (error) {
		context.error('admins-revoke failed:', error);
		return { status: 500, jsonBody: { error: 'Failed to revoke admin' } };
	}
}

app.http('admins-revoke', {
	methods: ['POST'],
	authLevel: 'anonymous',
	handler: adminsRevokeHandler,
});
