import { describe, it, expect } from 'vitest';
import { derivePresence, PRESENCE_WINDOW_MS, type PresenceInput } from './presence';

/**
 * Spec 006 task T-610. Pins the presence-derivation truth table,
 * including the inclusive 5-minute boundary and the opt-out override.
 * `now` is injected so these are deterministic and don't touch the
 * real clock.
 */

// Fixed reference "now" so every case is computed against a stable point.
const NOW = Date.parse('2026-05-26T12:00:00.000Z');

/** Build a lastSeenAt ISO string `agoMs` milliseconds before NOW. */
function seenAgo(agoMs: number): string {
	return new Date(NOW - agoMs).toISOString();
}

describe('derivePresence', () => {
	it('1 minute ago → online', () => {
		const user: PresenceInput = { lastSeenAt: seenAgo(60_000) };
		expect(derivePresence(user, NOW)).toBe(true);
	});

	it('exactly 5 minutes ago → online (inclusive boundary)', () => {
		const user: PresenceInput = { lastSeenAt: seenAgo(PRESENCE_WINDOW_MS) };
		expect(derivePresence(user, NOW)).toBe(true);
	});

	it('one millisecond past 5 minutes → offline', () => {
		const user: PresenceInput = { lastSeenAt: seenAgo(PRESENCE_WINDOW_MS + 1) };
		expect(derivePresence(user, NOW)).toBe(false);
	});

	it('6 minutes ago → offline', () => {
		const user: PresenceInput = { lastSeenAt: seenAgo(6 * 60_000) };
		expect(derivePresence(user, NOW)).toBe(false);
	});

	it('missing lastSeenAt → offline', () => {
		expect(derivePresence({}, NOW)).toBe(false);
		expect(derivePresence({ lastSeenAt: undefined }, NOW)).toBe(false);
	});

	it('garbage / unparseable lastSeenAt → offline (defensive)', () => {
		expect(derivePresence({ lastSeenAt: 'not-a-date' }, NOW)).toBe(false);
		expect(derivePresence({ lastSeenAt: '' }, NOW)).toBe(false);
	});

	describe('presenceVisible opt-out (US3)', () => {
		it('presenceVisible:false → offline even when freshly seen', () => {
			const user: PresenceInput = { lastSeenAt: seenAgo(1000), presenceVisible: false };
			expect(derivePresence(user, NOW)).toBe(false);
		});

		it('presenceVisible:true + fresh → online', () => {
			const user: PresenceInput = { lastSeenAt: seenAgo(1000), presenceVisible: true };
			expect(derivePresence(user, NOW)).toBe(true);
		});

		it('presenceVisible undefined (default) + fresh → online', () => {
			const user: PresenceInput = { lastSeenAt: seenAgo(1000) };
			expect(derivePresence(user, NOW)).toBe(true);
		});

		it('opt-out wins even at the inclusive boundary', () => {
			const user: PresenceInput = {
				lastSeenAt: seenAgo(PRESENCE_WINDOW_MS),
				presenceVisible: false,
			};
			expect(derivePresence(user, NOW)).toBe(false);
		});
	});

	describe('clock-skew defensiveness', () => {
		it('a future lastSeenAt reads online (negative delta <= window)', () => {
			// Cosmos/client clock skew shouldn't flip a just-seen user to
			// offline. A timestamp slightly in the future is still "recent".
			const user: PresenceInput = { lastSeenAt: new Date(NOW + 30_000).toISOString() };
			expect(derivePresence(user, NOW)).toBe(true);
		});
	});

	it('defaults `now` to Date.now() when omitted', () => {
		// A timestamp ~1s before real now should read online without an
		// explicit `now` argument.
		const user: PresenceInput = { lastSeenAt: new Date(Date.now() - 1000).toISOString() };
		expect(derivePresence(user)).toBe(true);
	});

	it('exposes a 5-minute window constant (pins the threshold)', () => {
		expect(PRESENCE_WINDOW_MS).toBe(5 * 60 * 1000);
	});
});
