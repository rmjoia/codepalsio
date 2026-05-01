import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';

/**
 * SWA `rolesSource` endpoint.
 *
 * Configured in staticwebapp.config.json `auth.rolesSource = '/api/get-roles'`.
 * SWA POSTs here once per login with the in-progress principal in the body;
 * whatever roles[] we return get attached to the user's session principal
 * for the rest of the auth lifetime.
 *
 * This is how `admin` is granted: the user's GitHub login is checked
 * against the comma-separated `ADMIN_GITHUB_LOGINS` env var. To make
 * yourself admin: Azure Portal → Static Web App → Configuration → add
 * `ADMIN_GITHUB_LOGINS=rmjoia` (or whatever your login is), Save, log out
 * and back in. The role appears in `principal.userRoles` on next sign-in
 * and the Admin link in the header lights up.
 *
 * Anti-probing: we only return non-empty roles when the request body
 * looks like a real SWA rolesSource invocation (identityProvider,
 * non-empty userId, claims array, accessToken). Anonymous callers who
 * curl this with just `{userDetails: 'someone'}` always get `[]` back,
 * so the endpoint can't be used to enumerate which logins are admins.
 */

function parseAdminLogins(): Set<string> {
	const raw = process.env.ADMIN_GITHUB_LOGINS ?? '';
	return new Set(
		raw
			.split(',')
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean)
	);
}

interface RolesSourcePayload {
	identityProvider?: string;
	userId?: string;
	userDetails?: string;
	claims?: unknown;
	accessToken?: string;
}

/**
 * Heuristic: is this body shaped like a real SWA rolesSource POST?
 * SWA always sends all four — identityProvider, userId, userDetails,
 * claims (array), accessToken (non-empty string). Probing requests from
 * an anonymous curl typically miss one or more.
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
	_context: InvocationContext
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

	// Always 200 with `{ roles: [...] }`. Empty roles for anything that
	// doesn't look like a legitimate SWA rolesSource invocation.
	if (!looksLikeRolesSourceCall(body)) {
		return { status: 200, jsonBody: { roles: [] } };
	}

	const roles: string[] = [];
	const admins = parseAdminLogins();

	if (
		body.identityProvider === 'github' &&
		typeof body.userDetails === 'string' &&
		admins.has(body.userDetails.toLowerCase())
	) {
		roles.push('admin');
	}

	return { status: 200, jsonBody: { roles } };
}

app.http('get-roles', {
	methods: ['POST'],
	authLevel: 'anonymous',
	handler: getRolesHandler,
});
