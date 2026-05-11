import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getCosmosConfig } from './lib/cosmos';
import { getClientPrincipal } from './lib/principal';
import { createUserRepository } from './lib/users';
import { createAdminRosterRepository } from './lib/admin-roster';
import { parseAdminLogins, resolveRoles } from './lib/roles';

/**
 * Role-resolution endpoint, served two ways:
 *
 *   1) POST — historically the SWA `rolesSource` callback (rolesSource
 *      requires Standard tier, which we're moving away from). Kept for
 *      backwards-compat in case a future deploy briefly runs on
 *      Standard. SWA POSTs the in-progress principal in the body once
 *      per sign-in; whatever roles[] we return get attached to the
 *      session principal.
 *
 *   2) GET — frontend-driven enrichment. On SWA Free we don't have
 *      rolesSource, so principal.userRoles can't carry 'admin'. The
 *      frontend calls GET /api/get-roles to look up the caller's roles
 *      from the same source of truth (the AdminRoster) and shows/hides
 *      admin UI accordingly. Read from `x-ms-client-principal` — same
 *      shape SWA passes to every authenticated function call.
 *
 * Both paths flow through resolveRoles; the only difference is how the
 * principal is extracted. Anti-probing: anonymous / unauthenticated
 * callers always get `{roles: []}` regardless of ADMIN_GITHUB_LOGINS
 * contents, so this endpoint can't enumerate admins.
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
	// Extract a ResolvedPrincipal either from the SWA rolesSource POST
	// body (Standard tier path) or from the x-ms-client-principal header
	// (GET path used by the frontend on Free tier).
	let resolved: { identityProvider: string; swaUserId: string; githubUsername: string } | null = null;

	if (request.method === 'POST') {
		let body: RolesSourcePayload = {};
		try {
			const parsed = await request.json();
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				body = parsed as RolesSourcePayload;
			}
		} catch {
			// Body wasn't JSON or was empty — fall through with empty body.
		}
		if (looksLikeRolesSourceCall(body)) {
			resolved = {
				identityProvider: body.identityProvider!,
				swaUserId: body.userId!,
				githubUsername: body.userDetails!,
			};
		}
	} else {
		const principal = getClientPrincipal(request);
		if (principal && principal.userId && principal.userDetails && principal.identityProvider) {
			resolved = {
				identityProvider: principal.identityProvider,
				swaUserId: principal.userId,
				githubUsername: principal.userDetails,
			};
		}
	}

	if (!resolved) {
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
		const roles = await resolveRoles(resolved, {
			repo,
			roster,
			bootstrapLogins: parseAdminLogins(process.env.ADMIN_GITHUB_LOGINS),
		});
		return { status: 200, jsonBody: { roles } };
	} catch (error) {
		// Fail closed on Cosmos errors too — never grant a role we can't verify.
		context.error('get-roles failed:', error);
		return { status: 200, jsonBody: { roles: [] } };
	}
}

app.http('get-roles', {
	methods: ['GET', 'POST'],
	authLevel: 'anonymous',
	handler: getRolesHandler,
});
