import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getContainer, getCosmosConfig } from './lib/cosmos';
import type { Profile } from './lib/types';

/**
 * Public projection returned by GET /api/profile-by-username when the
 * target profile is public. Internal identifiers (userId) and the
 * visibility metadata stay server-side — the detail page doesn't need
 * them and we don't want to leak them. Mirrors profiles-list.ts's
 * DirectoryProfile pattern but includes the richer fields the detail
 * page renders (social links, languages, experience, interests).
 */
export type PublicProfile = Pick<
	Profile,
	| 'id'
	| 'githubUsername'
	| 'displayName'
	| 'bio'
	| 'skills'
	| 'interests'
	| 'availability'
	| 'location'
	| 'timezone'
	| 'githubUrl'
	| 'linkedinUrl'
	| 'websiteUrl'
	| 'preferredLanguages'
	| 'yearsOfExperience'
	| 'updatedAt'
>;

/**
 * Cosmos query that backs /api/profile-by-username. Exported so the
 * privacy guard test can assert structural invariants — preventing a
 * future refactor from accidentally:
 *   - dropping the `c.githubUsername = @username` filter (would scan all docs)
 *   - removing `c.profileVisibility` from the projection (handler needs it
 *     to distinguish 403 private from 200 public)
 *   - adding `c.userId` to the projection (internal id leak)
 *
 * Note: profileVisibility IS selected here (unlike profiles-list) because
 * the handler needs it to choose between 200/403 — but it's stripped
 * before the response goes out.
 */
export const PROFILE_BY_USERNAME_QUERY = `SELECT TOP 1 c.id, c.githubUsername, c.displayName, c.bio, c.skills, c.interests, c.availability, c.profileVisibility, c.location, c.timezone, c.githubUrl, c.linkedinUrl, c.websiteUrl, c.preferredLanguages, c.yearsOfExperience, c.updatedAt FROM c WHERE c.githubUsername = @username`;

/**
 * GitHub username rules per github.com signup: 1-39 chars, alphanumeric
 * and single hyphens, can't start or end with a hyphen, no consecutive
 * hyphens. Rejecting at the edge prevents query-shape pollution (Cosmos
 * is parameterised so SQL injection isn't the concern — the concern is
 * "garbage in → 404 with a Cosmos roundtrip we could have skipped").
 */
const GITHUB_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

/**
 * GET /api/profile-by-username?username=<login> → returns the public
 * profile for that GitHub username.
 *
 * Status codes are deliberately distinct so the detail page can render
 * the right error UX (this is the dev-community framing: we treat
 * visitors as people who understand HTTP codes):
 *   - 200: profile exists and is public — projection returned
 *   - 400: missing or malformed username
 *   - 401: defense in depth (the SWA route gate already enforces this)
 *   - 403: profile exists but is private — caller learns user exists
 *   - 404: no profile matches that username
 *   - 500: cosmos config missing or query threw
 *
 * The 403/404 distinction trades a small information leak (caller can
 * enumerate which usernames have private profiles) for a better UX in
 * a dev community where users expect transparent status semantics.
 */
export async function profileByUsernameHandler(
	request: HttpRequest,
	context: InvocationContext
): Promise<HttpResponseInit> {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return { status: 401, jsonBody: { error: 'Not authenticated' } };
	}

	const username = request.query.get('username')?.trim();
	if (!username || !GITHUB_USERNAME_RE.test(username)) {
		return { status: 400, jsonBody: { error: 'Invalid username' } };
	}

	const cfg = getCosmosConfig();
	if (!cfg) {
		context.error('profile-by-username: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
		return { status: 500, jsonBody: { error: 'Server configuration error' } };
	}

	try {
		const container = getContainer(cfg.connectionString, cfg.database, 'profiles');
		const { resources } = await container.items
			.query<Profile>({
				query: PROFILE_BY_USERNAME_QUERY,
				parameters: [{ name: '@username', value: username }],
			})
			.fetchAll();

		const profile = resources[0];
		if (!profile) {
			return { status: 404, jsonBody: { error: 'Not found' } };
		}

		if (profile.profileVisibility !== 'public') {
			return { status: 403, jsonBody: { error: 'Profile is private' } };
		}

		// Strip profileVisibility from the response — it's filter-only
		// metadata, callers shouldn't see it. (No-op for userId since the
		// SELECT already omits it; explicit destructure for the visibility.)
		const { profileVisibility: _stripped, ...publicProfile } = profile;
		void _stripped;
		return { status: 200, jsonBody: { profile: publicProfile as PublicProfile } };
	} catch (error) {
		context.error('profile-by-username failed:', error);
		return { status: 500, jsonBody: { error: 'Failed to load profile' } };
	}
}

app.http('profile-by-username', {
	methods: ['GET'],
	authLevel: 'anonymous',
	handler: profileByUsernameHandler,
});
