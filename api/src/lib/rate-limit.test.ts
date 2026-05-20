import { describe, it, expect, beforeEach } from 'vitest';
import {
	checkRateLimit,
	__resetRateLimitForTests,
	DEFAULT_RATE_LIMIT,
	type RateLimitConfig,
} from './rate-limit';

/**
 * Unit tests for the token-bucket rate limiter.
 *
 * The clock is injected (the third arg to `checkRateLimit`) so we
 * test refill behaviour without monkey-patching the global Date.now
 * via vi.useFakeTimers — keeps the suite focused, isolated, and
 * doesn't risk leaking fake timers into adjacent test files.
 */

const TINY: RateLimitConfig = { capacity: 3, refillPerSecond: 1 };

function fakeClock(initialMs: number): () => number {
	let ms = initialMs;
	const fn = () => ms;
	(fn as unknown as { advance: (deltaMs: number) => void }).advance = (delta) => {
		ms += delta;
	};
	return fn;
}

describe('checkRateLimit', () => {
	beforeEach(() => {
		__resetRateLimitForTests();
	});

	describe('first-time callers', () => {
		it('starts a new principal with a full bucket', () => {
			// We aren't adversarial against unknown principals — a fresh
			// caller should have the full capacity available immediately.
			const now = fakeClock(0);
			const result = checkRateLimit('alice', TINY, now);
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(TINY.capacity - 1);
		});

		it('isolates buckets per principal key', () => {
			// alice's hammering must not exhaust bob's bucket.
			const now = fakeClock(0);
			for (let i = 0; i < TINY.capacity; i++) {
				checkRateLimit('alice', TINY, now);
			}
			// alice now empty
			expect(checkRateLimit('alice', TINY, now).allowed).toBe(false);
			// bob still fresh
			expect(checkRateLimit('bob', TINY, now).allowed).toBe(true);
		});
	});

	describe('burst consumption', () => {
		it('allows exactly `capacity` consecutive requests at the same instant', () => {
			const now = fakeClock(0);
			for (let i = 0; i < TINY.capacity; i++) {
				const r = checkRateLimit('alice', TINY, now);
				expect(r.allowed, `request #${i + 1} of ${TINY.capacity}`).toBe(true);
			}
		});

		it('denies the (capacity + 1)th request at the same instant', () => {
			const now = fakeClock(0);
			for (let i = 0; i < TINY.capacity; i++) {
				checkRateLimit('alice', TINY, now);
			}
			const overflow = checkRateLimit('alice', TINY, now);
			expect(overflow.allowed).toBe(false);
			expect(overflow.remaining).toBe(0);
		});
	});

	describe('Retry-After computation', () => {
		it('sets retryAfterSeconds to the time until the next token at refillPerSecond=1', () => {
			const now = fakeClock(0);
			// drain the bucket
			for (let i = 0; i < TINY.capacity; i++) {
				checkRateLimit('alice', TINY, now);
			}
			const denied = checkRateLimit('alice', TINY, now);
			expect(denied.allowed).toBe(false);
			// At 1 token/s, we need 1 full token → wait 1 second.
			expect(denied.retryAfterSeconds).toBe(1);
		});

		it('returns >=1 second even when arithmetic would round to 0 (Retry-After is whole seconds)', () => {
			// HTTP Retry-After must be a whole-second integer; returning 0
			// would tell the client "you can retry immediately" — but at that
			// moment the bucket is still empty. Floor of >=1 prevents the
			// hot-spin from a well-behaved client.
			const fast: RateLimitConfig = { capacity: 1, refillPerSecond: 100 };
			const now = fakeClock(0);
			checkRateLimit('alice', fast, now); // drains the single token
			const denied = checkRateLimit('alice', fast, now);
			expect(denied.allowed).toBe(false);
			expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
		});

		it('scales retryAfterSeconds inversely with refillPerSecond', () => {
			const slow: RateLimitConfig = { capacity: 1, refillPerSecond: 0.2 }; // 1 token / 5s
			const now = fakeClock(0);
			checkRateLimit('alice', slow, now); // drain
			const denied = checkRateLimit('alice', slow, now);
			expect(denied.retryAfterSeconds).toBe(5);
		});
	});

	describe('refill over time', () => {
		it('refills tokens as the clock advances', () => {
			const clock = fakeClock(0);
			for (let i = 0; i < TINY.capacity; i++) {
				checkRateLimit('alice', TINY, clock);
			}
			expect(checkRateLimit('alice', TINY, clock).allowed).toBe(false);

			// Advance 2 seconds → 2 tokens should refill.
			(clock as unknown as { advance: (n: number) => void }).advance(2000);
			expect(checkRateLimit('alice', TINY, clock).allowed).toBe(true); // uses token #1
			expect(checkRateLimit('alice', TINY, clock).allowed).toBe(true); // uses token #2
			expect(checkRateLimit('alice', TINY, clock).allowed).toBe(false); // gone again
		});

		it('caps the refill at capacity (no infinite accumulation while idle)', () => {
			// If a principal is silent for an hour, the bucket should NOT
			// fill to 3600 tokens — it caps at capacity. This is the
			// "anti-savings-account" property of token buckets.
			const clock = fakeClock(0);
			// Drain to baseline
			for (let i = 0; i < TINY.capacity; i++) checkRateLimit('alice', TINY, clock);
			// Idle for an hour — refill should max out at capacity.
			(clock as unknown as { advance: (n: number) => void }).advance(60 * 60 * 1000);
			// Now alice should have exactly `capacity` tokens, not more.
			let allowedCount = 0;
			while (checkRateLimit('alice', TINY, clock).allowed) {
				allowedCount++;
				if (allowedCount > TINY.capacity + 5) break; // safety stop
			}
			expect(allowedCount).toBe(TINY.capacity);
		});
	});

	describe('default config', () => {
		it('exposes a sensible default (60 burst, 1/sec refill)', () => {
			// Pinning the default so a future tuning is a visible change.
			expect(DEFAULT_RATE_LIMIT).toEqual({ capacity: 60, refillPerSecond: 1 });
		});
	});

	describe('clock injection', () => {
		it('respects the provided clock function (not the real Date.now)', () => {
			// Sanity-check: the test seam works as documented. A non-default
			// clock supplied here must drive bucket refills.
			const clock = fakeClock(1_000_000); // arbitrary epoch
			checkRateLimit('alice', TINY, clock);
			(clock as unknown as { advance: (n: number) => void }).advance(1000);
			const result = checkRateLimit('alice', TINY, clock);
			expect(result.allowed).toBe(true);
		});

		it('tolerates a backwards clock without negative refill (defensive)', () => {
			// Clock skew or test-time shenanigans shouldn't subtract tokens.
			// Math.max(0, elapsed) guard pinned here.
			const clock = fakeClock(10_000);
			for (let i = 0; i < TINY.capacity; i++) checkRateLimit('alice', TINY, clock);
			(clock as unknown as { advance: (n: number) => void }).advance(-5000); // go back
			const result = checkRateLimit('alice', TINY, clock);
			expect(result.allowed).toBe(false); // not refilled
			expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
		});
	});
});
