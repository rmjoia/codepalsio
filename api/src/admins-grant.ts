import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getCosmosConfig } from './lib/cosmos';
import { createUserRepository, type UserRepository, type UserRecord, userIdForGithub } from './lib/users';

/**
 * GitHub username constraints (per their docs):
 *   - alphanumerics + hyphens
 *   - hyphens not at start/end, not double
 *   - 1-39 characters
 * We're lenient (just a basic shape check) — Cosmos can handle anything,
 * and the get-roles flow only matches lowercase alphanumeric anyway.
 */
const GITHUB_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

interface GrantBody {
	githubUsername?: unknown;
}

export async function adminsGrantHandler(
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

	let body: GrantBody = {};
	try {
		const parsed = await request.json();
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			body = parsed as GrantBody;
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
			context.error('admins-grant: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}
		repo = createUserRepository(cfg.connectionString, cfg.database);
	}

	try {
		const now = new Date().toISOString();
		const granterId = userIdForGithub(principal.userDetails || 'unknown');
		const existing = await repo.findByGithubUsername(username);

		// Idempotent: granting an existing admin returns 200 with the same record.
		if (existing?.roles?.includes('admin')) {
			return { status: 200, jsonBody: { admin: toPublic(existing) } };
		}

		const record: UserRecord = existing
			? {
					...existing,
					roles: Array.from(new Set([...(existing.roles ?? []), 'admin'])),
					grantedBy: granterId,
					grantedAt: now,
					updatedAt: now,
				}
			: {
					id: userIdForGithub(username),
					githubUsername: username,
					roles: ['admin'],
					grantedBy: granterId,
					grantedAt: now,
					updatedAt: now,
				};

		const saved = await repo.upsert(record);
		return { status: 200, jsonBody: { admin: toPublic(saved) } };
	} catch (error) {
		context.error('admins-grant failed:', error);
		return { status: 500, jsonBody: { error: 'Failed to grant admin' } };
	}
}

function toPublic(r: UserRecord) {
	return {
		githubUsername: r.githubUsername,
		roles: r.roles,
		grantedBy: r.grantedBy,
		grantedAt: r.grantedAt,
		updatedAt: r.updatedAt,
	};
}

app.http('admins-grant', {
	methods: ['POST'],
	authLevel: 'anonymous',
	handler: adminsGrantHandler,
});
