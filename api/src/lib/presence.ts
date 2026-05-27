import type { UserRecord } from './users';

/**
 * Online-presence derivation (spec 006).
 *
 * The signal is coarse and server-derived: "this user has made an
 * authenticated request within the window", NOT "this user has the tab
 * open right now". No client heartbeat, no real-time — cheap and
 * privacy-respecting (FR-602 coalesces writes; the raw timestamp never
 * leaves the server, only the boolean this module derives).
 */

/**
 * A user counts as online if their last interaction was within this
 * window. 5 minutes per spec 006 (matches Slack's "active" cutoff and
 * sits comfortably above Cosmos serverless write-then-read latency).
 * The boundary is INCLUSIVE — exactly 5 minutes ago still reads online
 * (see derivePresence + its boundary test).
 */
export const PRESENCE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Minimal shape derivePresence needs. Accepts a full UserRecord or a
 * lightweight projection (e.g. the point-read result in the /find join),
 * so callers don't have to materialise a whole record just to derive
 * the boolean.
 */
export type PresenceInput = Pick<UserRecord, 'lastSeenAt' | 'presenceVisible'>;

/**
 * Derive the coarse "online" boolean for a user.
 *
 *   online  ⟺  presenceVisible !== false                  (opt-out wins)
 *             AND lastSeenAt is a parseable timestamp
 *             AND (now - lastSeenAt) <= PRESENCE_WINDOW_MS  (inclusive)
 *
 * Fails safe to `false` for every ambiguous input (missing/garbage
 * timestamp, explicit opt-out). `now` is injectable for deterministic
 * tests; defaults to Date.now().
 *
 * This function NEVER returns or exposes the raw `lastSeenAt` — callers
 * map the boolean onto their response and drop the timestamp, satisfying
 * SC-604 ("no lastSeenAt leaves the server").
 */
export function derivePresence(user: PresenceInput, now: number = Date.now()): boolean {
	// Opt-out is absolute: an explicit `false` hides presence no matter
	// how recently the user interacted. `undefined` means "not set" =
	// default-visible.
	if (user.presenceVisible === false) return false;
	if (!user.lastSeenAt) return false;

	const last = Date.parse(user.lastSeenAt);
	if (Number.isNaN(last)) return false; // garbage timestamp → offline

	// Inclusive boundary. A future timestamp (clock skew) yields a
	// negative delta, which is <= window → online; acceptable + defensive.
	return now - last <= PRESENCE_WINDOW_MS;
}
