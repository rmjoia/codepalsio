import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getContainer, getCosmosConfig } from './lib/cosmos';
import { applyFieldVisibility } from './lib/visibility';
import type { Profile } from './lib/types';

/**
 * Subset of Profile returned to the directory client. Internal identifiers
 * (userId) and metadata used only for filtering (profileVisibility,
 * fieldVisibility) stay server-side — the cards don't need them and we
 * don't want to leak them.
 *
 * `bio`, `skills`, `interests` were required on the source `Profile`
 * type but per-field visibility can strip them, so this projection
 * marks them optional. Consumers must handle the absent case
 * (`profile.skills?.length` etc.) — find.astro and find/profile.astro
 * do this defensively.
 */
export type DirectoryProfile = Pick<
	Profile,
	'id' | 'githubUsername' | 'displayName' | 'availability' | 'location' | 'timezone' | 'updatedAt'
> &
	Partial<Pick<Profile, 'bio' | 'skills'>>;

/** Hard cap on how many public profiles the directory returns in one shot.
 * Prevents unbounded RU/response-size growth as the community grows. The UI
 * doesn't paginate yet; when it does, we'll add a continuation token here. */
export const DIRECTORY_PAGE_SIZE = 100;

/**
 * Cosmos query that backs /api/profiles. Exported so the privacy guard
 * test (profiles-list.test.ts) can assert the structural invariants
 * directly — preventing a future refactor from accidentally:
 *   - removing or weakening `WHERE c.profileVisibility = 'public'`
 *   - removing `SELECT TOP` (would let response size grow unbounded)
 *   - removing `c.userId` or `c.fieldVisibility` from the projection
 *     (the handler needs both for per-row visibility filtering; the
 *     STRIP happens in the handler before responding)
 *
 * Note: self-exclusion (`c.userId != @currentUserId`) was removed —
 * users should see their own profile in the directory as a "how do I
 * appear to others" preview. Visibility (public-only) is still strictly
 * enforced.
 *
 * Why select c.userId here when previous versions of this file
 * deliberately omitted it: per-field visibility (see lib/visibility.ts)
 * needs to compare each row's userId against the caller's userId so
 * the owner viewing their own row in the directory previews the
 * unfiltered fields. The userId is stripped from the response in the
 * handler — the privacy invariant "userId doesn't leave the server"
 * still holds, just enforced at a different layer.
 */
export const PROFILES_QUERY = `SELECT TOP ${DIRECTORY_PAGE_SIZE} c.id, c.userId, c.githubUsername, c.displayName, c.bio, c.skills, c.availability, c.location, c.timezone, c.fieldVisibility, c.updatedAt FROM c WHERE c.profileVisibility = 'public' ORDER BY c.updatedAt DESC`;

/**
 * Reduce a (possibly visibility-filtered) Profile row to the DirectoryProfile
 * projection. Strips `userId` (needed during the visibility filter only)
 * and `fieldVisibility` (filter-only metadata) — these never leave the
 * server. Mirrors the toPublicProfile pattern in profile-by-username.
 */
export function toDirectoryProfile(profile: Profile): DirectoryProfile {
	return {
		id: profile.id,
		githubUsername: profile.githubUsername,
		displayName: profile.displayName,
		bio: profile.bio,
		skills: profile.skills,
		availability: profile.availability,
		location: profile.location,
		timezone: profile.timezone,
		updatedAt: profile.updatedAt,
	};
}

/**
 * GET /api/profiles → returns the public profiles directory.
 *
 * Filtering is done **server-side** in the Cosmos query — private profiles
 * never leave the database. The caller's own profile IS included (useful as
 * a self-preview); only the visibility flag gates inclusion.
 *
 * Auth: the SWA route gate already requires authenticated; the principal
 * check below is defense in depth.
 */
export async function profilesHandler(
	request: HttpRequest,
	context: InvocationContext
): Promise<HttpResponseInit> {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return { status: 401, jsonBody: { error: 'Not authenticated' } };
	}

	const cfg = getCosmosConfig();
	if (!cfg) {
		context.error('profiles: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
		return { status: 500, jsonBody: { error: 'Server configuration error' } };
	}

	try {
		const container = getContainer(cfg.connectionString, cfg.database, 'profiles');
		const { resources } = await container.items
			.query<Profile>({ query: PROFILES_QUERY })
			.fetchAll();

		// Apply per-field visibility per row. For the caller's own row
		// (isOwner=true), nothing is stripped — they get the unfiltered
		// preview. For everyone else's rows, fields marked `private` are
		// removed and `authenticated` fields pass through (every directory
		// viewer is by definition authenticated).
		const projected = resources.map((row) => {
			const filtered = applyFieldVisibility(row, {
				isOwner: row.userId === principal.userId,
				isAuthenticated: true,
			});
			return toDirectoryProfile(filtered);
		});

		return { status: 200, jsonBody: { profiles: projected } };
	} catch (error) {
		context.error('profiles failed:', error);
		return { status: 500, jsonBody: { error: 'Failed to load profiles' } };
	}
}

app.http('profiles', {
	methods: ['GET'],
	authLevel: 'anonymous',
	handler: profilesHandler,
});
