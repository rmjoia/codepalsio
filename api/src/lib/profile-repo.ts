import type { Container } from '@azure/cosmos';
import { randomUUID } from 'crypto';
import type { Profile } from './types';
import type { UserRepository } from './users';

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
 * Find a user's profile, with auto-heal for orphaned pre-migration
 * profile docs (custom-OAuth flow before commit 7410e99, Apr 2026
 * keyed profiles by a different userId than SWA built-in auth uses
 * today).
 *
 * Strategy — single cross-partition query by `githubUsername`,
 * which is stable across auth schemes (set server-side from
 * `principal.userDetails` on every save). From the result set we
 * decide everything in one pass:
 *
 *   - The doc whose `userId` matches the current principal is the
 *     canonical profile. Return it.
 *   - Any other doc with the same `githubUsername` is an orphan
 *     (a leftover from before the auth-scheme change, OR a
 *     leftover from a previous heal where the delete failed
 *     transiently). Best-effort delete each one. 404s are fine
 *     (already gone); non-404 errors are logged but don't fail
 *     the read.
 *   - If there's no canonical doc but at least one orphan, promote
 *     the orphan: upsert a copy at the new `userId` partition
 *     (preserving `id`), then delete every orphan as above.
 *
 * Old-shape rescue (when `userRepo` is provided):
 *   Profiles created before PR #24 don't have a `githubUsername`
 *   field, so the github-username query above can't see them. For
 *   that case we use the `users` Cosmos container as a bridge:
 *   the legacy user record's `id` IS the OLD userId hash. We look
 *   it up via UserRepository.findByGithubUsernameAcrossShapes,
 *   then query the profile by that old userId. If found, treat it
 *   as an orphan and re-key it the same way.
 *
 * Why cleanup runs on every call (not just on the heal path):
 *   Earlier this only ran when no canonical doc existed. That
 *   meant if the heal-path delete failed transiently, the orphan
 *   would stay forever — subsequent reads find the new doc by
 *   userId, return it directly, and never look back at the
 *   orphan. Reviewer Copilot caught that. Cleanup-on-every-call
 *   makes the heal eventually consistent: even a transient delete
 *   failure converges to a clean state on the next call.
 *
 * Cost: one cross-partition query per profile-get/save (plus, for
 * the no-githubUsername-on-orphan case, a user-record point-read
 * with cross-partition fallback). Acceptable for a per-page-load
 * endpoint.
 *
 * Idempotency / concurrency:
 *   - Two concurrent heals upsert the same (id, new userId) doc.
 *     Last write wins with identical data — no conflict.
 *   - Two concurrent cleanups attempt the same delete. One
 *     succeeds, the other 404s — no conflict.
 *
 * Pre-#14 docs that have `id === userId` (issue #27): those use
 * the OLD userId AS the id. After heal, the new doc keeps that
 * string as its `id` but lives in the new partition. That's
 * still consistent — `id` is just a string, not required to
 * equal `userId`. Issue #27's id-shape normalization can run as
 * a separate migration.
 */
export async function findProfileWithAutoHeal(
	container: Container,
	principal: AutoHealPrincipal,
	logger: AutoHealLogger,
	userRepo?: UserRepository
): Promise<AutoHealResult> {
	// Without a github username we can't query by it; fall back to
	// userId-only. Orphan cleanup is a no-op in this branch — but
	// principals without userDetails shouldn't have orphan profiles
	// either (the orphan was created from a previous userDetails-bearing
	// session).
	if (!principal.userDetails) {
		const byUserId = await container.items
			.query<Profile>({
				query: PROFILE_BY_USERID_QUERY,
				parameters: [{ name: '@userId', value: principal.userId }],
			})
			.fetchAll();
		return { profile: byUserId.resources[0] ?? null, healed: false };
	}

	const allByGithub = await container.items
		.query<Profile>({
			query: PROFILE_BY_GITHUB_USERNAME_QUERY,
			parameters: [{ name: '@githubUsername', value: principal.userDetails }],
		})
		.fetchAll();

	let docs = allByGithub.resources;
	let canonical = docs.find((d) => d.userId === principal.userId);
	let orphans = docs.filter((d) => d.userId !== principal.userId);

	// Old-shape rescue. If the github-username query found nothing AND we
	// have a userRepo, the orphan likely pre-dates PR #24 (no
	// githubUsername field). Use the users container as a bridge to
	// discover the old userId hash, then look up the profile by that.
	if (docs.length === 0 && userRepo) {
		const userRecord = await userRepo.findByGithubUsernameAcrossShapes(principal.userDetails);
		if (userRecord) {
			const candidateOldUserId = userRecord.swaUserId ?? userRecord.id;
			if (candidateOldUserId && candidateOldUserId !== principal.userId) {
				const byOldUserId = await container.items
					.query<Profile>({
						query: PROFILE_BY_USERID_QUERY,
						parameters: [{ name: '@userId', value: candidateOldUserId }],
					})
					.fetchAll();
				if (byOldUserId.resources.length > 0) {
					logger.log(
						`profile auto-heal: discovered old-shape orphan via user record (githubUsername=${principal.userDetails}, oldUserId=${candidateOldUserId})`
					);
					docs = byOldUserId.resources;
					canonical = undefined;
					orphans = byOldUserId.resources;
				}
			}
		}
	}

	if (!canonical && orphans.length === 0) {
		// No docs at all for this github username — fresh user, no heal
		// possible.
		return { profile: null, healed: false };
	}

	if (canonical && orphans.length === 0) {
		return { profile: canonical, healed: false };
	}

	let result: Profile;
	let healed = false;

	if (canonical) {
		// Common steady-state-with-leftover-orphan case: canonical doc
		// already exists, just clean up the orphans below.
		result = canonical;
	} else {
		// No canonical doc — promote one of the orphans by re-keying it
		// to the current userId. Generate a fresh `profile-{uuid}` id
		// instead of preserving the orphan's `id` (which on pre-#14 docs
		// IS the legacy SWA principal hash — a soft PII leak in the
		// document key and inconsistent with new docs already using
		// uuid-shaped ids). This closes issue #27's acceptance criteria
		// (`id` matches `^profile-[0-9a-f-]+$`) for the rescue path.
		// Backfill `githubUsername` server-side — old-shape orphans
		// don't have it.
		const orphan = orphans[0];
		const oldUserId = orphan.userId;
		const oldId = orphan.id;
		result = {
			...orphan,
			id: `profile-${randomUUID()}`,
			userId: principal.userId,
			githubUsername: principal.userDetails,
		};
		logger.log(
			`profile auto-heal: re-keying profile from id=${oldId} userId=${oldUserId} to id=${result.id} userId=${principal.userId} (githubUsername=${principal.userDetails})`
		);
		await container.items.upsert<Profile>(result);
		healed = true;
	}

	// Best-effort delete of every orphan, on every call — converges to
	// a clean state even after transient delete failures (the bug
	// Copilot flagged). 404s are fine (already deleted by a concurrent
	// caller). Non-404s are logged but don't fail the read.
	for (const orphan of orphans) {
		try {
			await container.item(orphan.id, orphan.userId).delete();
		} catch (err) {
			if (!isCosmosNotFound(err)) {
				logger.error(
					`profile auto-heal: failed to delete orphan id=${orphan.id} userId=${orphan.userId}; will retry on next call`,
					err
				);
			}
		}
	}

	return { profile: result, healed };
}

function isCosmosNotFound(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code: unknown }).code === 404
	);
}
