import type { Container } from '@azure/cosmos';
import { createHash } from 'crypto';
import type { Profile } from './types';
import type { UserRepository } from './users';

/**
 * Profile fields we read in the user-facing handlers. Mirrors the SELECT
 * list in profile-get to make the projection a single point of change.
 *
 * Exported so adjacent endpoints (profile-by-username) that need a
 * different WHERE clause — e.g. case-insensitive github username
 * lookup — share the projection. Without sharing, adding a Profile
 * field would require updating both queries and they could silently
 * drift.
 *
 * Kept in sync with src/services/api.ts (frontend type) — see the note
 * in lib/types.ts about why duplication is preferred over a shared
 * module here.
 */
export const PROFILE_FIELDS =
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
 *   - When promoting an orphan, the new `id` is computed
 *     deterministically from the orphan's old id (SHA-256
 *     formatted as a uuid — see profileIdFromLegacy). Two
 *     concurrent rescues observing the same orphan therefore
 *     compute the SAME id, so their upserts target the same
 *     (id, new userId) document. Last-write-wins overwrites
 *     with identical data — no duplicates, no conflict.
 *   - Two concurrent cleanups attempt the same delete. One
 *     succeeds, the other 404s — no conflict.
 *
 * Pre-#14 docs that have `id === userId` (issue #27): those use
 * the OLD userId AS the id (a soft PII leak — the doc key
 * reveals the principal hash). The promotion path rotates the
 * id to a uuid-shaped string deterministically derived from the
 * orphan's old id. The rescued doc therefore satisfies issue
 * #27's acceptance (`id` matches `^profile-[0-9a-f-]+$`) AND
 * preserves concurrency safety (two racing rescues produce the
 * same id, not different uuids).
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
		// to the current userId. Rotate `id` to a uuid-shaped string
		// (closes issue #27 — orphans on pre-#14 docs use the legacy
		// SWA principal hash AS their id, a soft PII leak). The new id
		// is derived DETERMINISTICALLY from the orphan's old id so two
		// concurrent rescues compute the same id — preserves the
		// "same (id, new userId) → idempotent upsert" concurrency
		// guarantee that a fresh randomUUID would have broken.
		// Backfill `githubUsername` server-side — old-shape orphans
		// don't have it.
		const orphan = orphans[0];
		const oldUserId = orphan.userId;
		const oldId = orphan.id;
		result = {
			...orphan,
			id: profileIdFromLegacy(oldId),
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

/**
 * Deterministic uuid-shaped id derived from a legacy orphan's id.
 *
 * Concurrency: two callers rescuing the same orphan compute the same
 * id and so produce identical (id, userId) docs on upsert — last
 * write wins with identical data, no duplicates. A non-deterministic
 * id (e.g. `randomUUID()`) would let two racing rescues create two
 * different canonical docs in the same userId partition, neither of
 * which would be treated as an orphan on the next call.
 *
 * Shape: `profile-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX` where the
 * X's are hex from SHA-256(namespace + oldId), formatted to look
 * like a uuid. Satisfies the regex `^profile-[0-9a-f-]+$` from
 * issue #27 without using a true random uuid.
 *
 * PII: SHA-256 of the old id is one-way; the rotated id doesn't
 * leak the underlying principal hash. (The old id was the legacy
 * SWA principal hash — using it directly was the soft PII leak
 * #27 flagged.)
 */
export function profileIdFromLegacy(oldId: string): string {
	const hex = createHash('sha256')
		.update(`profile-id-rotation:${oldId}`)
		.digest('hex')
		.slice(0, 32);
	return `profile-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
		16,
		20
	)}-${hex.slice(20, 32)}`;
}
