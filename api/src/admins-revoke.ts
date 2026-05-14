import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getCosmosConfig } from './lib/cosmos';
import { createUserRepository, type UserRepository, userIdForGithub } from './lib/users';
import {
	createAdminRosterRepository,
	mutateRoster,
	RosterContendedError,
	type AdminRosterRepository,
} from './lib/admin-roster';
import { isAdminFor, parseAdminLogins, principalHasAdminRole } from './lib/roles';
import type { ClientPrincipal } from './lib/types';

const GITHUB_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

interface RevokeBody {
	githubUsername?: unknown;
}

export interface AdminRepos {
	users: UserRepository;
	roster: AdminRosterRepository;
	bootstrapLogins?: ReadonlySet<string>;
	/** Test seam — bypass the roster lookup. Default: real isAdminFor. */
	verifyAdmin?: (principal: ClientPrincipal) => Promise<boolean>;
}

type RevokeOutcome =
	| { kind: 'notFound' }
	| { kind: 'lastAdmin' }
	| { kind: 'revoked' };

export async function adminsRevokeHandler(
	request: HttpRequest,
	context: InvocationContext,
	overrideRepos?: AdminRepos
): Promise<HttpResponseInit> {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return { status: 401, jsonBody: { error: 'Not authenticated' } };
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
	const targetId = userIdForGithub(username);

	let repos = overrideRepos;
	if (!repos) {
		const cfg = getCosmosConfig();
		if (!cfg) {
			context.error('admins-revoke: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}
		repos = {
			users: createUserRepository(cfg.connectionString, cfg.database),
			roster: createAdminRosterRepository(cfg.connectionString, cfg.database),
			bootstrapLogins: parseAdminLogins(process.env.ADMIN_GITHUB_LOGINS),
		};
	}

	// Fast path: invitation-assigned admin-tier role grants access without
	// a roster lookup. Falls through to the roster path only for legacy /
	// pre-invitation users who don't have any admin role on the principal.
	const isAdmin = repos.verifyAdmin
		? await repos.verifyAdmin(principal)
		: principalHasAdminRole(principal) ||
			(await isAdminFor(
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
			));
	if (!isAdmin) {
		return { status: 403, jsonBody: { error: 'Forbidden' } };
	}

	try {
		// Roster CAS gates the operation. The "is admin?" and "last admin?"
		// checks evaluate against the same roster snapshot we're about to
		// write — a concurrent revoke of a different admin invalidates our
		// etag and forces re-read + re-evaluate. This closes the race that
		// the prior count+upsert design left open.
		const outcome = await mutateRoster<RevokeOutcome>(
			repos.roster,
			repos.users,
			(roster) => {
				if (!roster.admins.includes(targetId)) {
					return { abort: { kind: 'notFound' } };
				}
				if (roster.admins.length <= 1) {
					return { abort: { kind: 'lastAdmin' } };
				}
				return {
					next: { ...roster, admins: roster.admins.filter((id) => id !== targetId) },
					result: { kind: 'revoked' },
				};
			}
		);

		if (outcome.kind === 'notFound') {
			return { status: 404, jsonBody: { error: 'Not an admin' } };
		}
		if (outcome.kind === 'lastAdmin') {
			return { status: 409, jsonBody: { error: 'Cannot revoke the last remaining admin' } };
		}

		// Roster says revoked. Best-effort: keep the user record's roles
		// array consistent (drops 'admin', preserves other roles + metadata).
		// If this fails, the roster is still authoritative — resolveRoles
		// reads from the roster, so the user no longer has admin access.
		// Stale `roles` on the record is cosmetic.
		const existing = await repos.users.findByGithubUsername(username);
		if (existing) {
			const now = new Date().toISOString();
			await repos.users.upsert({
				...existing,
				roles: (existing.roles ?? []).filter((r) => r !== 'admin'),
				grantedBy: undefined,
				grantedAt: undefined,
				updatedAt: now,
			});
		}

		return { status: 200, jsonBody: { ok: true, githubUsername: username } };
	} catch (error) {
		if (error instanceof RosterContendedError) {
			context.error('admins-revoke: roster write contended after retries');
			return { status: 503, jsonBody: { error: 'Admin roster busy, please retry' } };
		}
		context.error('admins-revoke failed:', error);
		return { status: 500, jsonBody: { error: 'Failed to revoke admin' } };
	}
}

app.http('admins-revoke', {
	methods: ['POST'],
	authLevel: 'anonymous',
	handler: adminsRevokeHandler,
});
