import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getContainer, getCosmosConfig } from './lib/cosmos';
import type { Profile, ProfileVisibility } from './lib/types';

/** Hard cap on rows returned in one shot. Same rationale as
 * profiles-list — bound RU/response/timeout. Pagination can come later. */
export const ADMIN_PAGE_SIZE = 200;

/** What completeness means for a profile: bio ≥ 50 chars + ≥ 2 skills +
 * ≥ 2 interests + location + timezone. Mirrors the domain rule in
 * src/domain/Profile.ts so backend and domain agree on "complete". */
function isComplete(p: Pick<Profile, 'bio' | 'skills' | 'interests' | 'location' | 'timezone'>): boolean {
	return (
		(p.bio?.length ?? 0) >= 50 &&
		(p.skills?.length ?? 0) >= 2 &&
		(p.interests?.length ?? 0) >= 2 &&
		!!p.location &&
		!!p.timezone
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

/** Cosmos query for admin: returns enough to compute completeness +
 * render the table, but no PII beyond what's already in the profile. */
export const ADMIN_USERS_QUERY = `SELECT TOP ${ADMIN_PAGE_SIZE} c.id, c.userId, c.githubUsername, c.displayName, c.profileVisibility, c.availability, c.bio, c.skills, c.interests, c.location, c.timezone, c.updatedAt FROM c ORDER BY c.updatedAt DESC`;

export async function adminUsersHandler(
	request: HttpRequest,
	context: InvocationContext
): Promise<HttpResponseInit> {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return { status: 401, jsonBody: { error: 'Not authenticated' } };
	}
	// Server-side admin check — defense in depth on top of the SWA route gate.
	// If someone bypasses the route gate (misconfig, bug, future refactor),
	// we still reject non-admin requests here.
	if (!principal.userRoles?.includes('admin')) {
		return { status: 403, jsonBody: { error: 'Forbidden' } };
	}

	const cfg = getCosmosConfig();
	if (!cfg) {
		context.error('admin-users: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
		return { status: 500, jsonBody: { error: 'Server configuration error' } };
	}

	try {
		const container = getContainer(cfg.connectionString, cfg.database, 'profiles');
		const { resources } = await container.items
			.query<Profile>({ query: ADMIN_USERS_QUERY })
			.fetchAll();

		const profiles: AdminProfileRow[] = resources.map((p) => {
			const complete = isComplete(p);
			return {
				id: p.id,
				userId: p.userId,
				githubUsername: p.githubUsername,
				displayName: p.displayName,
				profileVisibility: (p.profileVisibility ?? 'private') as ProfileVisibility,
				availability: p.availability,
				bioLength: p.bio?.length ?? 0,
				skillsCount: p.skills?.length ?? 0,
				interestsCount: p.interests?.length ?? 0,
				hasLocation: !!p.location,
				hasTimezone: !!p.timezone,
				complete,
				updatedAt: p.updatedAt,
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

app.http('admin-users', {
	methods: ['GET'],
	authLevel: 'anonymous',
	handler: adminUsersHandler,
});
