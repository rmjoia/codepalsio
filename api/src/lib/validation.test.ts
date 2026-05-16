import { describe, it, expect } from 'vitest';
import {
	isFieldVisibility,
	normalizeFieldVisibility,
	isAvailability,
	isProfileVisibility,
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
			'..__proto__': 'private',
			bio: 'private', // this one survives
		});
		expect(out).toEqual({ bio: 'private' });
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
