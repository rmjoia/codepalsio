import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getCosmosConfig } from './lib/cosmos';
import { createUserRepository } from './lib/users';
import { createAdminRosterRepository } from './lib/admin-roster';
import { parseAdminLogins, resolveRoles } from './lib/roles';

/**
 * SWA `rolesSource` endpoint.
 *
 * Configured via staticwebapp.config.json `auth.rolesSource = '/api/get-roles'`.
 * SWA POSTs here once per sign-in with the in-progress principal in the
 * body; whatever roles[] we return get attached to the user's session
 * principal for the rest of the auth lifetime.
 *
 * This handler is intentionally thin: parse → guard against probing →
 * delegate to resolveRoles. All policy lives in lib/roles.ts.
 *
 * Anti-probing: anonymous callers POSTing partial payloads always get
 * `{roles: []}` regardless of ADMIN_GITHUB_LOGINS contents, so this
 * endpoint can't be used to enumerate which logins are admins.
 */

interface RolesSourcePayload {
	identityProvider?: string;
	userId?: string;
	userDetails?: string;
	claims?: unknown;
	accessToken?: string;
}

/**
 * Heuristic: is this body shaped like a real SWA rolesSource POST?
 * SWA always sends all of these — identityProvider, userId, userDetails,
 * a claims array, and a non-empty accessToken. Anonymous probing
 * requests typically miss one or more.
 */
function looksLikeRolesSourceCall(body: RolesSourcePayload): boolean {
	return (
		typeof body.identityProvider === 'string' &&
		typeof body.userId === 'string' &&
		body.userId.length > 0 &&
		typeof body.userDetails === 'string' &&
		body.userDetails.length > 0 &&
		Array.isArray(body.claims) &&
		typeof body.accessToken === 'string' &&
		body.accessToken.length > 0
	);
}

export async function getRolesHandler(
	request: HttpRequest,
	context: InvocationContext
): Promise<HttpResponseInit> {
	let body: RolesSourcePayload = {};
	try {
		const parsed = await request.json();
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			body = parsed as RolesSourcePayload;
		}
	} catch {
		// Body wasn't JSON or was empty — fall through with empty body.
	}

	if (!looksLikeRolesSourceCall(body)) {
		return { status: 200, jsonBody: { roles: [] } };
	}

	const cfg = getCosmosConfig();
	if (!cfg) {
		// Fail closed: if Cosmos isn't configured, no one is admin. Better
		// than crashing the auth flow with a 500.
		context.error('get-roles: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
		return { status: 200, jsonBody: { roles: [] } };
	}

	try {
		const repo = createUserRepository(cfg.connectionString, cfg.database);
		const roster = createAdminRosterRepository(cfg.connectionString, cfg.database);
		const roles = await resolveRoles(
			{
				swaUserId: body.userId!,
				githubUsername: body.userDetails!,
				identityProvider: body.identityProvider!,
			},
			{ repo, roster, bootstrapLogins: parseAdminLogins(process.env.ADMIN_GITHUB_LOGINS) }
		);
		return { status: 200, jsonBody: { roles } };
	} catch (error) {
		// Fail closed on Cosmos errors too — never grant a role we can't verify.
		context.error('get-roles failed:', error);
		return { status: 200, jsonBody: { roles: [] } };
	}
}

app.http('get-roles', {
	methods: ['POST'],
	authLevel: 'anonymous',
	handler: getRolesHandler,
});
