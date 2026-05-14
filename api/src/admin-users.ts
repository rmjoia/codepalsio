import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getContainer, getCosmosConfig } from './lib/cosmos';
import { isProfileVisibility } from './lib/validation';
import type { ClientPrincipal, Profile, ProfileVisibility } from './lib/types';
import { createUserRepository, type UserRepository } from './lib/users';
import {
	createAdminRosterRepository,
	type AdminRosterRepository,
} from './lib/admin-roster';
import { isAdminFor, parseAdminLogins, principalHasAdminRole } from './lib/roles';

/**
 * Test seam — production handler builds these from env. The optional
 * `verifyAdmin` lets unit tests mock the admin check without exercising
 * the roster auto-heal side effects of `isAdminFor` (which is itself
 * covered in roles.test.ts).
 */
export interface AdminAuthDeps {
	users: UserRepository;
	roster: AdminRosterRepository;
	bootstrapLogins?: ReadonlySet<string>;
	verifyAdmin?: (principal: ClientPrincipal) => Promise<boolean>;
}

/** Hard cap on rows returned in one shot. Same rationale as
 * profiles-list — bound RU/response/timeout. Pagination can come later. */
export const ADMIN_PAGE_SIZE = 200;

/** Completeness rule mirrors the domain (Profile.isComplete): bio ≥ 50
 * chars + ≥ 2 skills + ≥ 2 interests + location + timezone. */
function computeComplete(row: {
	bioLength: number;
	skillsCount: number;
	interestsCount: number;
	hasLocation: boolean;
	hasTimezone: boolean;
}): boolean {
	return (
		row.bioLength >= 50 &&
		row.skillsCount >= 2 &&
		row.interestsCount >= 2 &&
		row.hasLocation &&
		row.hasTimezone
	);
}

export interface AdminProfileRow {
	id: string;
	userId: string;
	githubUsername?: string;
	displayName: string;
	profileVisibility: ProfileVisibility;
	availability: Profile['availability'];
	bioLength: number;
	skillsCount: number;
	interestsCount: number;
	hasLocation: boolean;
	hasTimezone: boolean;
	complete: boolean;
	updatedAt?: string;
}

export interface AdminKpis {
	totalProfiles: number;
	publicProfiles: number;
	privateProfiles: number;
	completeProfiles: number;
}

export interface AdminUsersResponse {
	profiles: AdminProfileRow[];
	kpis: AdminKpis;
}

/** Raw shape returned by Cosmos. We aggregate counts/lengths server-side
 * via LENGTH() / ARRAY_LENGTH() so the function never pulls full bio
 * text or skills/interests arrays just to count them. Saves RU + payload
 * + serialization time, especially as bios grow. */
interface AdminQueryRow {
	id: string;
	userId: string;
	githubUsername?: string;
	displayName: string;
	profileVisibility?: string; // raw — coerced via isProfileVisibility
	availability: Profile['availability'];
	bioLength: number;
	skillsCount: number;
	interestsCount: number;
	location?: string;
	timezone?: string;
	updatedAt?: string;
}

/** Cosmos query for admin. Counts/lengths computed in-DB; full bio /
 * skills / interests never leave the database. */
export const ADMIN_USERS_QUERY = `SELECT TOP ${ADMIN_PAGE_SIZE} c.id, c.userId, c.githubUsername, c.displayName, c.profileVisibility, c.availability, LENGTH(c.bio) AS bioLength, ARRAY_LENGTH(c.skills) AS skillsCount, ARRAY_LENGTH(c.interests) AS interestsCount, c.location, c.timezone, c.updatedAt FROM c ORDER BY c.updatedAt DESC`;

export async function adminUsersHandler(
	request: HttpRequest,
	context: InvocationContext,
	overrideAuthDeps?: AdminAuthDeps
): Promise<HttpResponseInit> {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return { status: 401, jsonBody: { error: 'Not authenticated' } };
	}

	const cfg = getCosmosConfig();
	if (!cfg) {
		context.error('admin-users: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
		return { status: 500, jsonBody: { error: 'Server configuration error' } };
	}

	// Fast path: invitation-assigned admin-tier roles flow through
	// principal.userRoles on every authenticated request — no Cosmos
	// lookup needed. Falls through to the roster path only when no
	// admin-tier role is present (legacy / pre-invitation users).
	const authDeps: AdminAuthDeps = overrideAuthDeps ?? {
		users: createUserRepository(cfg.connectionString, cfg.database),
		roster: createAdminRosterRepository(cfg.connectionString, cfg.database),
		bootstrapLogins: parseAdminLogins(process.env.ADMIN_GITHUB_LOGINS),
	};
	const isAdmin = authDeps.verifyAdmin
		? await authDeps.verifyAdmin(principal)
		: principalHasAdminRole(principal) ||
			(await isAdminFor(
				{
					swaUserId: principal.userId,
					githubUsername: principal.userDetails,
					identityProvider: principal.identityProvider,
				},
				{
					repo: authDeps.users,
					roster: authDeps.roster,
					bootstrapLogins: authDeps.bootstrapLogins ?? new Set(),
				}
			));
	if (!isAdmin) {
		return { status: 403, jsonBody: { error: 'Forbidden' } };
	}

	try {
		const container = getContainer(cfg.connectionString, cfg.database, 'profiles');
		const { resources } = await container.items
			.query<AdminQueryRow>({ query: ADMIN_USERS_QUERY })
			.fetchAll();

		const profiles: AdminProfileRow[] = resources.map((r) => {
			const hasLocation = typeof r.location === 'string' && r.location.length > 0;
			const hasTimezone = typeof r.timezone === 'string' && r.timezone.length > 0;
			const bioLength = r.bioLength ?? 0;
			const skillsCount = r.skillsCount ?? 0;
			const interestsCount = r.interestsCount ?? 0;
			// Validate at runtime — Cosmos may return undefined for legacy
			// docs that predate profileVisibility. Default to 'private' to
			// fail safely toward not-listed. Same posture as profile-get.
			const profileVisibility: ProfileVisibility = isProfileVisibility(r.profileVisibility)
				? r.profileVisibility
				: 'private';
			const complete = computeComplete({
				bioLength,
				skillsCount,
				interestsCount,
				hasLocation,
				hasTimezone,
			});
			return {
				id: r.id,
				userId: r.userId,
				githubUsername: r.githubUsername,
				displayName: r.displayName,
				profileVisibility,
				availability: r.availability,
				bioLength,
				skillsCount,
				interestsCount,
				hasLocation,
				hasTimezone,
				complete,
				updatedAt: r.updatedAt,
			};
		});

		const kpis: AdminKpis = {
			totalProfiles: profiles.length,
			publicProfiles: profiles.filter((p) => p.profileVisibility === 'public').length,
			privateProfiles: profiles.filter((p) => p.profileVisibility !== 'public').length,
			completeProfiles: profiles.filter((p) => p.complete).length,
		};

		return { status: 200, jsonBody: { profiles, kpis } satisfies AdminUsersResponse };
	} catch (error) {
		context.error('admin-users failed:', error);
		return { status: 500, jsonBody: { error: 'Failed to load admin users' } };
	}
}

app.http('manage-users', {
	methods: ['GET'],
	authLevel: 'anonymous',
	handler: adminUsersHandler,
});
