import type { HttpResponseInit } from '@azure/functions';
import type { UserRepository } from './users';
import type { ClientPrincipal } from './types';

/**
 * Suspension enforcement helper (spec 003 US3 / FR-124b).
 *
 * The design intent (and why this helper exists at all) is in
 * `.specify/spec/003-community-safety-and-anti-abuse.md` under FR-124.
 * The short version: on SWA Free tier there's no `rolesSource` to flip
 * a user's roles server-side at auth time, so suspension can't be
 * enforced at the route gate. The enforcement layer is instead
 * **server-side defence-in-depth in every authenticated handler**:
 * before any Cosmos read/write, each handler calls `assertNotSuspended`
 * on the caller's principal and returns the 403 response if the user is
 * suspended.
 *
 * Contract:
 *   - returns `null` → handler proceeds as normal
 *   - returns `HttpResponseInit` (403) → handler returns that response
 *     immediately, skipping its own work
 *
 * The response body is deliberately `{ reason: 'suspended' }` — a stable
 * machine-readable signal the frontend fetch wrapper matches on to
 * redirect the user to `/suspended`. The frontend MUST NOT leak the
 * suspended user's identity in that redirect; the `/suspended` page is
 * generic ("your account is suspended") and tells the user to email
 * abuse@codepals.io for appeals.
 *
 * Cost: one point-read of the user record per authenticated request.
 * Cosmos point-reads are ~1 RU; cheap enough that we don't cache. If
 * suspension volume ever becomes measurable, a short-TTL in-memory
 * cache per Function-host instance is an obvious next step — but the
 * cache must respect the fact that an admin's suspension action should
 * take effect on the NEXT request from that user, not after a cache
 * TTL. Defer.
 */

export const SUSPENDED_RESPONSE: HttpResponseInit = {
	status: 403,
	jsonBody: { reason: 'suspended' },
};

/**
 * Returns `null` when the caller is not suspended (or doesn't yet have
 * a user record — a brand-new sign-in has no `suspended` field, which
 * is correctly treated as not-suspended). Returns the standard 403
 * response when the user is suspended.
 *
 * A missing user record is NEVER treated as suspended — it's the normal
 * state for a first-time sign-in before `profile-save` creates the
 * record. Treating missing as suspended would lock out every new user.
 *
 * A thrown error from the user-repo (Cosmos down, network blip) is
 * **fail-open**: returns null, lets the handler proceed. The handler's
 * own Cosmos operations will then fail, which the handler already
 * handles with a 500. Fail-closed (treating a cosmos-down lookup as
 * "suspend-everyone") would be a self-DoS during a transient outage,
 * which is worse than briefly allowing a suspended user through.
 * Logging on error is the handler's responsibility; this helper stays
 * side-effect-free.
 */
export async function assertNotSuspended(
	principal: ClientPrincipal,
	userRepo: UserRepository
): Promise<HttpResponseInit | null> {
	let record;
	try {
		record = await userRepo.findByGithubUsername(principal.userDetails ?? '');
	} catch {
		// Cosmos down / network — fail open. Handler's own calls will
		// surface the real error.
		return null;
	}
	if (record?.suspended === true) {
		return SUSPENDED_RESPONSE;
	}
	return null;
}
