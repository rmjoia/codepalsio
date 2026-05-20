/**
 * In-memory token-bucket rate limiter, scoped per-principal.
 *
 * Threat model:
 *   The endpoint we put behind this — `/api/profile-by-username` — is
 *   an enumeration vector. An authenticated attacker could hammer it
 *   with thousands of `?username=…` permutations to discover which
 *   logins have profiles, which are public vs private. The 403 vs 404
 *   distinction is by design (see PR #55), but the rate at which an
 *   attacker can sample it is what we cap here.
 *
 * Scope:
 *   State lives at module scope in the Functions worker process. SWA
 *   Free spins up multiple worker instances under load, so the budget
 *   is per-(principal, instance), not strictly per-principal globally.
 *   This is good enough to catch obvious scrapers (thousands of req/min
 *   per principal land mostly on one warm instance because Functions
 *   tend to route the same caller to the same worker within a short
 *   window). A globally-strict budget would require a Cosmos-backed
 *   counter; queued as a follow-up if usage patterns demand it.
 *
 * Algorithm:
 *   Token bucket. Each principal has a bucket of size `capacity`. Every
 *   request consumes one token. Tokens refill at `refillPerSecond`. A
 *   request is allowed if at least one token is available; otherwise
 *   denied with `Retry-After` set to the time until the next token.
 *   Bursts up to `capacity` requests are permitted; sustained rate is
 *   `refillPerSecond * 60` requests/min.
 *
 * Defaults (60 burst, 1/sec refill = 60/min sustained):
 *   - A legitimate user opening /find a few times and clicking through
 *     5-10 profile cards is well under this.
 *   - An automated scraper running >1 req/sec for a sustained period
 *     hits 429 inside one minute.
 *   - Numbers are conservative starting values; tunable via the config
 *     argument when wiring this into a new endpoint.
 *
 * Why NOT Cloudflare Turnstile here:
 *   Turnstile defends against unauthenticated abuse (sign-up bots,
 *   comment spam). Our enumeration vector is post-OAuth — the attacker
 *   already cleared GitHub's anti-abuse to get a principal. Per-
 *   principal rate limiting is the correct primitive at that layer.
 *   Turnstile becomes relevant only if we add anonymous interactive
 *   surfaces (none today).
 */

export interface RateLimitConfig {
	/** Max requests in a burst (token-bucket capacity). */
	capacity: number;
	/** Tokens added per second (refill rate). */
	refillPerSecond: number;
}

export interface RateLimitResult {
	/** True when the request may proceed. */
	allowed: boolean;
	/**
	 * Seconds until the next token will be available. 0 when allowed.
	 * Set on the `Retry-After` response header when not allowed.
	 */
	retryAfterSeconds: number;
	/** Tokens remaining in the bucket after this check (for observability/tests). */
	remaining: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
	capacity: 60,
	refillPerSecond: 1,
};

interface BucketState {
	tokens: number;
	lastRefillMs: number;
}

// Module-scope state. Reset only by __resetRateLimitForTests() — production
// callers must never reset, doing so would clear protection for every
// principal currently being throttled.
let buckets = new Map<string, BucketState>();

/**
 * Consume one token from the bucket identified by `key` (typically the
 * SWA principal's `userId`).
 *
 * The `now` parameter is a test seam — injects deterministic time so
 * the refill behaviour can be exercised without `vi.useFakeTimers()`
 * monkeypatching the global clock for the whole suite.
 */
export function checkRateLimit(
	key: string,
	config: RateLimitConfig = DEFAULT_RATE_LIMIT,
	now: () => number = Date.now
): RateLimitResult {
	const nowMs = now();
	const existing = buckets.get(key);

	// Refill: compute how many tokens would have been added since the
	// last check, capped at capacity. A first-time caller starts with
	// a full bucket (we're not adversarial against unknown principals,
	// only against high-volume ones).
	let tokens: number;
	if (!existing) {
		tokens = config.capacity;
	} else {
		const elapsedSeconds = Math.max(0, (nowMs - existing.lastRefillMs) / 1000);
		tokens = Math.min(config.capacity, existing.tokens + elapsedSeconds * config.refillPerSecond);
	}

	if (tokens >= 1) {
		tokens -= 1;
		buckets.set(key, { tokens, lastRefillMs: nowMs });
		return { allowed: true, retryAfterSeconds: 0, remaining: Math.floor(tokens) };
	}

	// Bucket exhausted. Compute how long until at least one full token
	// is available. Ceil because Retry-After is whole seconds.
	const tokensNeeded = 1 - tokens;
	const retryAfterSeconds = Math.max(1, Math.ceil(tokensNeeded / config.refillPerSecond));
	buckets.set(key, { tokens, lastRefillMs: nowMs });
	return { allowed: false, retryAfterSeconds, remaining: 0 };
}

/**
 * Test-only: clear all bucket state. NEVER call from production —
 * doing so would erase active throttling for every principal mid-flight.
 * Exposed only so unit tests can isolate their fixtures.
 */
export function __resetRateLimitForTests(): void {
	buckets = new Map();
}
