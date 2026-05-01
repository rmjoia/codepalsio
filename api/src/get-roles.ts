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
 * Security note: this endpoint is reachable publicly, but POSTing to it
 * directly does NOT grant admin to the caller — it just returns JSON.
 * SWA is the only consumer that turns the response into actual roles, and
 * it only does so for the in-progress login it initiated.
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

export async function getRolesHandler(
	request: HttpRequest,
	context: InvocationContext
): Promise<HttpResponseInit> {
	let body: { identityProvider?: string; userDetails?: string } = {};
	try {
		const parsed = await request.json();
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			body = parsed as typeof body;
		}
	} catch {
		// Body wasn't JSON or was empty — fall through with empty body.
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

	context.log(`get-roles: ${body.userDetails ?? '<unknown>'} -> [${roles.join(', ')}]`);
	return { status: 200, jsonBody: { roles } };
}

app.http('get-roles', {
	methods: ['POST'],
	authLevel: 'anonymous',
	handler: getRolesHandler,
});
