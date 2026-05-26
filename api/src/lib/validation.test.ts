import { describe, it, expect } from 'vitest';
import {
	isFieldVisibility,
	normalizeFieldVisibility,
	isAvailability,
	isProfileVisibility,
	boundedInteger,
} from './validation';

describe('isFieldVisibility', () => {
	it.each(['public', 'authenticated', 'private'])('accepts %j', (v) => {
		expect(isFieldVisibility(v)).toBe(true);
	});

	it.each([
		undefined,
		null,
		'',
		'PUBLIC',
		'Anyone',
		'protected',
		0,
		false,
		true,
		{},
		['public'],
	])('rejects %j', (v) => {
		expect(isFieldVisibility(v)).toBe(false);
	});
});

describe('normalizeFieldVisibility', () => {
	it('returns empty map for non-object input', () => {
		expect(normalizeFieldVisibility(undefined)).toEqual({});
		expect(normalizeFieldVisibility(null)).toEqual({});
		expect(normalizeFieldVisibility('hello')).toEqual({});
		expect(normalizeFieldVisibility(42)).toEqual({});
		expect(normalizeFieldVisibility(true)).toEqual({});
	});

	it('returns empty map for an array (defensive — arrays are objects)', () => {
		expect(normalizeFieldVisibility([])).toEqual({});
		expect(normalizeFieldVisibility(['bio', 'private'])).toEqual({});
	});

	it('keeps valid non-public entries from HIDEABLE_FIELDS', () => {
		const out = normalizeFieldVisibility({
			bio: 'private',
			location: 'authenticated',
		});
		expect(out).toEqual({ bio: 'private', location: 'authenticated' });
	});

	it('drops `public` entries (the default — stored docs stay lean)', () => {
		// Storing all-`public` would inflate every doc with redundant
		// metadata. Empty map and all-public map are observationally
		// identical; we pick the cheaper representation.
		const out = normalizeFieldVisibility({
			bio: 'public',
			location: 'public',
			yearsOfExperience: 'public',
		});
		expect(out).toEqual({});
	});

	it('drops keys not in HIDEABLE_FIELDS (defense against junk input)', () => {
		// A hand-crafted POST could try to hide `displayName` or `userId`
		// to be clever; normalize must drop those silently. The whitelist
		// is the security boundary.
		const out = normalizeFieldVisibility({
			displayName: 'private',
			userId: 'private',
			availability: 'private',
			password: 'private',
			bio: 'private', // this one survives
		});
		expect(out).toEqual({ bio: 'private' });
	});

	it('drops `__proto__` and other prototype-pollution keys', () => {
		// Defensive: even though the HIDEABLE_FIELDS whitelist already
		// rejects __proto__, pin the attack-string explicitly so a future
		// refactor that loosens the whitelist or moves to an allow-by-
		// exclusion model can't accidentally let prototype-pollution
		// bytes through. JSON.parse creates a regular own-property
		// `__proto__` on the parsed object (it does NOT mutate
		// Object.prototype), so the threat here is mostly about
		// downstream consumers that copy keys naively — but the safest
		// answer is to drop them at the boundary.
		const out = normalizeFieldVisibility({
			__proto__: 'private',
			constructor: 'private',
			prototype: 'private',
			bio: 'private',
		});
		expect(out).toEqual({ bio: 'private' });
		// And: the returned object's prototype is untouched
		expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
	});

	it('drops entries with invalid visibility values', () => {
		const out = normalizeFieldVisibility({
			bio: 'private', // valid
			skills: 'PUBLIC', // wrong case, invalid
			location: 42, // not a string
			interests: null,
			githubUrl: 'protected',
		});
		expect(out).toEqual({ bio: 'private' });
	});

	it('drops entries whose value is "public" even amongst valid sibling entries', () => {
		const out = normalizeFieldVisibility({
			bio: 'public',
			skills: 'private',
			location: 'authenticated',
		});
		expect(out).toEqual({ skills: 'private', location: 'authenticated' });
	});

	it('handles the empty object', () => {
		expect(normalizeFieldVisibility({})).toEqual({});
	});

	it('does not mutate the input', () => {
		const input = { bio: 'private' as const, displayName: 'private' };
		const snapshot = JSON.parse(JSON.stringify(input));
		normalizeFieldVisibility(input);
		expect(input).toEqual(snapshot);
	});
});

describe('boundedInteger', () => {
	// Used for yearsOfExperience and similar scalar fields. Returns
	// undefined for anything outside the expected shape — the stored
	// doc must not lie about the user's data (e.g. coercing "abc" to
	// 0 would tell the world the user has zero years of experience).

	it.each([
		[0, 0],
		[1, 1],
		[5, 5],
		[60, 60],
	])('accepts in-range integer %j', (input, expected) => {
		expect(boundedInteger(input, 0, 60)).toBe(expected);
	});

	it('floors fractional numbers (5.7 → 5)', () => {
		expect(boundedInteger(5.7, 0, 60)).toBe(5);
	});

	it.each([
		[-1, 'below min'],
		[61, 'above max'],
		[100, 'way above max'],
		[Number.MAX_SAFE_INTEGER, 'overflow attempt'],
	])('rejects %j (%s) with undefined', (input) => {
		expect(boundedInteger(input, 0, 60)).toBeUndefined();
	});

	it.each([
		[NaN, 'NaN'],
		[Infinity, 'Infinity'],
		[-Infinity, '-Infinity'],
	])('rejects %s with undefined', (input) => {
		expect(boundedInteger(input, 0, 60)).toBeUndefined();
	});

	it('parses numeric strings (form input ships strings, not numbers)', () => {
		expect(boundedInteger('5', 0, 60)).toBe(5);
		expect(boundedInteger('  42  ', 0, 60)).toBe(42); // trims
	});

	it('returns undefined for empty / whitespace-only strings', () => {
		expect(boundedInteger('', 0, 60)).toBeUndefined();
		expect(boundedInteger('   ', 0, 60)).toBeUndefined();
	});

	it.each(['five', 'abc', '5x', 'NaN', 'Infinity'])(
		'returns undefined for non-numeric string %j',
		(input) => {
			expect(boundedInteger(input, 0, 60)).toBeUndefined();
		}
	);

	it.each([
		[null, 'null'],
		[undefined, 'undefined'],
		[true, 'boolean'],
		[{}, 'object'],
		[[], 'array'],
	])('rejects non-number/non-string input (%s) with undefined', (input) => {
		expect(boundedInteger(input, 0, 60)).toBeUndefined();
	});

	it('respects custom min/max bounds', () => {
		expect(boundedInteger(5, 10, 20)).toBeUndefined(); // below
		expect(boundedInteger(15, 10, 20)).toBe(15); // in
		expect(boundedInteger(25, 10, 20)).toBeUndefined(); // above
	});
});

describe('isAvailability / isProfileVisibility (regression guards)', () => {
	// Cheap pin so adding FIELD_VISIBILITY_VALUES alongside the others
	// doesn't accidentally break the existing predicates.
	it('isAvailability accepts the three known values', () => {
		expect(isAvailability('active')).toBe(true);
		expect(isAvailability('casual')).toBe(true);
		expect(isAvailability('unavailable')).toBe(true);
	});

	it('isProfileVisibility accepts public and private only', () => {
		expect(isProfileVisibility('public')).toBe(true);
		expect(isProfileVisibility('private')).toBe(true);
		expect(isProfileVisibility('authenticated')).toBe(false);
	});
});
