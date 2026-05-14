import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getCosmosConfig } from './lib/cosmos';
import { createUserRepository, type UserRepository, type UserRecord, userIdForGithub } from './lib/users';
import {
	createAdminRosterRepository,
	mutateRoster,
	RosterContendedError,
	type AdminRosterRepository,
} from './lib/admin-roster';
import { isAdminFor, parseAdminLogins } from './lib/roles';
import { principalHasAdminRole } from './lib/admin-roles';
import type { ClientPrincipal } from './lib/types';

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

/** Test seam — production handler builds these from env. */
export interface AdminRepos {
	users: UserRepository;
	roster: AdminRosterRepository;
	bootstrapLogins?: ReadonlySet<string>;
	/** Test seam — bypass the roster lookup. Default: real isAdminFor. */
	verifyAdmin?: (principal: ClientPrincipal) => Promise<boolean>;
}

export async function adminsGrantHandler(
	request: HttpRequest,
	context: InvocationContext,
	overrideRepos?: AdminRepos
): Promise<HttpResponseInit> {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return { status: 401, jsonBody: { error: 'Not authenticated' } };
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

	let repos = overrideRepos;
	if (!repos) {
		const cfg = getCosmosConfig();
		if (!cfg) {
			context.error('admins-grant: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
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
		const now = new Date().toISOString();
		const granterId = userIdForGithub(principal.userDetails || 'unknown');
		const targetId = userIdForGithub(username);

		type GrantOutcome = { alreadyAdmin: boolean };

		// Step 1: roster CAS. Idempotent — if target already in roster,
		// return the existing user record without writing.
		const rosterDecision = await mutateRoster<GrantOutcome>(
			repos.roster,
			repos.users,
			(roster) => {
				if (roster.admins.includes(targetId)) {
					return { abort: { alreadyAdmin: true } };
				}
				return {
					next: { ...roster, admins: [...roster.admins, targetId] },
					result: { alreadyAdmin: false },
				};
			}
		);

		// Step 2: upsert user record with metadata. If roster said
		// "already admin", we only re-fetch to return the canonical doc.
		const existing = await repos.users.findByGithubUsername(username);

		if (rosterDecision.alreadyAdmin) {
			// Roster already lists them as admin. Make sure the user record
			// agrees — without this, a prior partial failure (roster wrote,
			// user record didn't) would never self-heal: the next grant just
			// returns the stale record and the inconsistency persists forever.
			if (!existing) {
				const seeded: UserRecord = {
					id: targetId,
					githubUsername: username,
					roles: ['admin'],
					grantedBy: granterId,
					grantedAt: now,
					updatedAt: now,
				};
				const saved = await repos.users.upsert(seeded);
				return { status: 200, jsonBody: { admin: toPublic(saved) } };
			}
			if (!existing.roles?.includes('admin')) {
				// Stale record (roster says admin, record doesn't). Repair it.
				// Use the current granter for grantedBy since the original
				// intent isn't recoverable.
				const repaired: UserRecord = {
					...existing,
					roles: Array.from(new Set([...(existing.roles ?? []), 'admin'])),
					grantedBy: granterId,
					grantedAt: now,
					updatedAt: now,
				};
				const saved = await repos.users.upsert(repaired);
				return { status: 200, jsonBody: { admin: toPublic(saved) } };
			}
			// Truly idempotent — both roster and record already consistent.
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
					id: targetId,
					githubUsername: username,
					roles: ['admin'],
					grantedBy: granterId,
					grantedAt: now,
					updatedAt: now,
				};

		const saved = await repos.users.upsert(record);
		return { status: 200, jsonBody: { admin: toPublic(saved) } };
	} catch (error) {
		if (error instanceof RosterContendedError) {
			context.error('admins-grant: roster write contended after retries');
			return { status: 503, jsonBody: { error: 'Admin roster busy, please retry' } };
		}
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
