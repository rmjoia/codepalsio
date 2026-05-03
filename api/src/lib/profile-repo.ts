import type { Container } from '@azure/cosmos';
import type { Profile } from './types';

/**
 * Profile fields we read in the user-facing handlers. Mirrors the SELECT
 * list in profile-get to make the projection a single point of change.
 *
 * Kept in sync with src/services/api.ts (frontend type) — see the note
 * in lib/types.ts about why duplication is preferred over a shared
 * module here.
 */
const PROFILE_FIELDS =
	'c.id, c.userId, c.githubUsername, c.displayName, c.bio, c.skills, c.interests, c.availability, c.location, c.timezone, c.githubUrl, c.linkedinUrl, c.websiteUrl, c.preferredLanguages, c.yearsOfExperience, c.profileVisibility, c.updatedAt';

export const PROFILE_BY_USERID_QUERY = `SELECT ${PROFILE_FIELDS} FROM c WHERE c.userId = @userId`;
export const PROFILE_BY_GITHUB_USERNAME_QUERY = `SELECT ${PROFILE_FIELDS} FROM c WHERE c.githubUsername = @githubUsername`;

export interface AutoHealLogger {
	log: (msg: string) => void;
	error: (msg: string, err?: unknown) => void;
}

export interface AutoHealPrincipal {
	userId: string;
	userDetails: string;
}

export interface AutoHealResult {
	profile: Profile | null;
	healed: boolean;
}

/**
 * Find a user's profile, with one-time auto-heal for the auth-migration
 * orphan case (PR #14, Apr 2026).
 *
 * Background:
 *   The custom-OAuth flow that ran before PR #14 keyed profile docs by
 *   a different `userId` value than SWA built-in auth produces today.
 *   A user who had a profile pre-migration logs in today, gets a new
 *   SWA principal hash, and the lookup-by-userId returns nothing — the
 *   frontend prompts them to "set up profile" while their old data
 *   sits orphaned in Cosmos (visible to others on /find via its public
 *   visibility, disconnected from their session).
 *
 * Heal procedure:
 *   1. Lookup by current `userId`. If found, done — no heal needed.
 *   2. Else lookup by `githubUsername` (stable across auth schemes,
 *      set server-side on every save from `principal.userDetails`).
 *   3. If found, re-key the doc:
 *        a. Insert a new doc with `userId = principal.userId`,
 *           preserving the existing `id` (so consumers caching the
 *           id keep their references).
 *        b. Best-effort delete the old doc at its old partition.
 *           A 404 here is fine (concurrent heal won the race) and
 *           a non-404 error is logged but doesn't fail the heal —
 *           the new doc is canonical from this point on, and the
 *           old orphan will be retried on next call.
 *
 * Idempotency:
 *   Two concurrent heals from the same user upsert the same
 *   (id, new userId) document — the second one overwrites with
 *   identical data. Both delete the same (id, old userId); one
 *   succeeds, the other 404s, no duplicates.
 *
 * Pre-#14 docs that have `id === userId` (issue #27): those use the
 * OLD userId AS the id. After heal, the new doc keeps that string as
 * its `id` but lives in the new partition. That's still consistent —
 * `id` is just a string, not required to equal `userId`. Issue #27's
 * cleanup (uuid-shape ids) can be done in a separate migration.
 */
export async function findProfileWithAutoHeal(
	container: Container,
	principal: AutoHealPrincipal,
	logger: AutoHealLogger
): Promise<AutoHealResult> {
	const byUserId = await container.items
		.query<Profile>({
			query: PROFILE_BY_USERID_QUERY,
			parameters: [{ name: '@userId', value: principal.userId }],
		})
		.fetchAll();

	if (byUserId.resources[0]) {
		return { profile: byUserId.resources[0], healed: false };
	}

	if (!principal.userDetails) {
		return { profile: null, healed: false };
	}

	const byGithub = await container.items
		.query<Profile>({
			query: PROFILE_BY_GITHUB_USERNAME_QUERY,
			parameters: [{ name: '@githubUsername', value: principal.userDetails }],
		})
		.fetchAll();

	const orphan = byGithub.resources[0];
	if (!orphan) {
		return { profile: null, healed: false };
	}

	if (orphan.userId === principal.userId) {
		// Should be unreachable (would have hit the userId lookup), but
		// defensive guard against duplicate-doc surprises.
		return { profile: orphan, healed: false };
	}

	const oldUserId = orphan.userId;
	const healed: Profile = {
		...orphan,
		userId: principal.userId,
		githubUsername: principal.userDetails,
	};

	logger.log(
		`profile auto-heal: re-keying profile id=${orphan.id} from userId=${oldUserId} to userId=${principal.userId} (githubUsername=${principal.userDetails})`
	);

	await container.items.upsert<Profile>(healed);

	try {
		await container.item(orphan.id, oldUserId).delete();
	} catch (err) {
		if (!isCosmosNotFound(err)) {
			// Non-404 means the new doc is in place but the orphan still
			// exists. Next call will heal again (idempotent), so log and
			// return success rather than fail the read.
			logger.error(
				`profile auto-heal: failed to delete orphan id=${orphan.id} userId=${oldUserId}; will retry on next call`,
				err
			);
		}
	}

	return { profile: healed, healed: true };
}

function isCosmosNotFound(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code: unknown }).code === 404
	);
}
