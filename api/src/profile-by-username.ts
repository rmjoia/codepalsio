import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getContainer, getCosmosConfig } from './lib/cosmos';
import { PROFILE_FIELDS } from './lib/profile-repo';
import { applyFieldVisibility } from './lib/visibility';
import { checkRateLimit } from './lib/rate-limit';
import type { Profile } from './lib/types';

/**
 * Case-insensitive lookup by github username. GitHub treats logins as
 * case-insensitive (github.com/RmJoia 301-redirects to /rmjoia), so the
 * profile detail URL must too — a visitor typing `/find/RmJoia` should
 * not 404 just because the stored canonical case is `rmjoia`.
 *
 * Distinct from profile-repo's PROFILE_BY_GITHUB_USERNAME_QUERY (which
 * is case-sensitive, fine for auto-heal where the principal supplies
 * the exact stored case). Shares the projection via PROFILE_FIELDS so
 * a future Profile-field addition propagates to both reads.
 */
export const PROFILE_BY_USERNAME_CI_QUERY = `SELECT ${PROFILE_FIELDS} FROM c WHERE LOWER(c.githubUsername) = LOWER(@githubUsername)`;

/**
 * Public projection returned to the detail page. Mirrors DirectoryProfile
 * in profiles-list but includes the richer fields the per-user page
 * renders (interests, social links, languages, experience). The fields
 * NOT in this type — `userId`, `profileVisibility` — are deliberate
 * omissions: the shared PROFILE_FIELDS projection selects them
 * (auto-heal in profile-get needs userId; we need profileVisibility for
 * the 403 vs 200 decision), but they never leave the handler.
 */
/**
 * `bio`, `skills`, `interests` are required on the source `Profile` type
 * but per-field visibility can strip them, so this projection marks them
 * optional. The detail page (find/profile.astro) handles the absent case
 * defensively (`profile.skills?.length` etc.).
 */
export type PublicProfile = Pick<
	Profile,
	| 'id'
	| 'githubUsername'
	| 'displayName'
	| 'availability'
	| 'location'
	| 'timezone'
	| 'githubUrl'
	| 'linkedinUrl'
	| 'websiteUrl'
	| 'preferredLanguages'
	| 'yearsOfExperience'
	| 'updatedAt'
> &
	Partial<Pick<Profile, 'bio' | 'skills' | 'interests'>>;

/**
 * Reduce a stored Profile to the public-facing projection. Single point
 * of change for "what leaves the server when this endpoint returns 200" —
 * the test asserts the result has no `userId` and no `profileVisibility`
 * so a future field addition to Profile doesn't silently leak.
 */
export function toPublicProfile(profile: Profile): PublicProfile {
	return {
		id: profile.id,
		githubUsername: profile.githubUsername,
		displayName: profile.displayName,
		bio: profile.bio,
		skills: profile.skills,
		interests: profile.interests,
		availability: profile.availability,
		location: profile.location,
		timezone: profile.timezone,
		githubUrl: profile.githubUrl,
		linkedinUrl: profile.linkedinUrl,
		websiteUrl: profile.websiteUrl,
		preferredLanguages: profile.preferredLanguages,
		yearsOfExperience: profile.yearsOfExperience,
		updatedAt: profile.updatedAt,
	};
}

/**
 * GitHub username rules per github.com signup: 1-39 chars, alphanumeric
 * and single hyphens, can't start or end with a hyphen, no consecutive
 * hyphens. Rejecting at the edge prevents wasteful Cosmos roundtrips for
 * shapes that could never match a stored githubUsername.
 */
const GITHUB_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

/**
 * GET /api/profile-by-username?username=<login> → public profile for that
 * GitHub username.
 *
 * Status codes are deliberately distinct so the detail page can render
 * the right error UX (dev-community framing: visitors understand HTTP
 * semantics):
 *   - 200: profile exists and is public — projection returned
 *   - 400: missing or malformed username
 *   - 401: defense in depth (the SWA route gate already enforces this)
 *   - 403: profile exists but is private — caller learns user exists
 *   - 404: no profile matches that username
 *   - 500: cosmos config missing or query threw
 *
 * The 403/404 distinction trades a small enumeration leak (callers can
 * learn which usernames have private profiles) for transparent UX in
 * a dev community where users expect honest status codes.
 *
 * Implementation note: uses PROFILE_BY_USERNAME_CI_QUERY (case-insensitive)
 * with the projection shared from profile-repo so a Profile-field addition
 * stays in lockstep with profile-get. The query returns ALL docs for a
 * github username (cross-partition; orphans haven't been cleaned yet) —
 * we take the first. In steady state there's exactly one; transient
 * orphans converge to one once the owner next loads their profile.
 */
export async function profileByUsernameHandler(
	request: HttpRequest,
	context: InvocationContext
): Promise<HttpResponseInit> {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return { status: 401, jsonBody: { error: 'Not authenticated' } };
	}

	// Per-principal rate limit, applied AFTER auth so the bucket key is
	// a real `principal.userId`, and BEFORE input parsing / Cosmos so a
	// 429 response stays cheap to produce. This endpoint is the primary
	// enumeration vector on the platform — capping the rate at which a
	// signed-in attacker can sample it is the OWASP A04/A01 mitigation.
	// See api/src/lib/rate-limit.ts for the threat model + scope notes.
	const rl = checkRateLimit(principal.userId);
	if (!rl.allowed) {
		return {
			status: 429,
			headers: { 'Retry-After': String(rl.retryAfterSeconds) },
			jsonBody: {
				error: 'Too many requests',
				retryAfterSeconds: rl.retryAfterSeconds,
			},
		};
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
				query: PROFILE_BY_USERNAME_CI_QUERY,
				parameters: [{ name: '@githubUsername', value: username }],
			})
			.fetchAll();

		const profile = resources[0];
		if (!profile) {
			return { status: 404, jsonBody: { error: 'Not found' } };
		}

		if (profile.profileVisibility !== 'public') {
			return { status: 403, jsonBody: { error: 'Profile is private' } };
		}

		// Apply per-field visibility BEFORE projecting to the public shape.
		// The owner viewing their own detail page (e.g. previewing how the
		// world sees them, or hitting their own /find/<self> by accident)
		// bypasses filtering — there's no audience to hide from on your
		// own profile.
		const filtered = applyFieldVisibility(profile, {
			isOwner: profile.userId === principal.userId,
			isAuthenticated: true,
		});
		return { status: 200, jsonBody: { profile: toPublicProfile(filtered) } };
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
