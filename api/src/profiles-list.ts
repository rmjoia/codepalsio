import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getContainer, getCosmosConfig } from './lib/cosmos';
import type { Profile } from './lib/types';

/**
 * Subset of Profile returned to the directory client. Internal identifiers
 * (userId) and metadata used only for filtering (profileVisibility) stay
 * server-side — the cards don't need them and we don't want to leak them.
 */
export type DirectoryProfile = Pick<
	Profile,
	'id' | 'githubUsername' | 'displayName' | 'bio' | 'skills' | 'availability' | 'location' | 'timezone' | 'updatedAt'
>;

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
 *   - adding `c.userId` or `c.profileVisibility` to the projection (PII / metadata leak)
 *
 * Note: self-exclusion (`c.userId != @currentUserId`) was removed —
 * users should see their own profile in the directory as a "how do I
 * appear to others" preview. Visibility (public-only) is still strictly
 * enforced.
 */
export const PROFILES_QUERY = `SELECT TOP ${DIRECTORY_PAGE_SIZE} c.id, c.githubUsername, c.displayName, c.bio, c.skills, c.availability, c.location, c.timezone, c.updatedAt FROM c WHERE c.profileVisibility = 'public' ORDER BY c.updatedAt DESC`;

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
			.query<DirectoryProfile>({ query: PROFILES_QUERY })
			.fetchAll();

		return { status: 200, jsonBody: { profiles: resources } };
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
