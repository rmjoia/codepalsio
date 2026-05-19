import { describe, it, expect } from 'vitest';
import { applyFieldVisibility, type ViewerContext } from './visibility';
import type { Profile } from './types';

/**
 * Tests for the per-field visibility filter. This is the single point of
 * truth for "what does viewer V see in profile P" — every endpoint that
 * exposes a profile MUST go through here. The tests cover:
 *   - owner short-circuit (sees everything regardless of map)
 *   - per-level filtering (public / authenticated / private) for non-owners
 *   - missing entries default to public
 *   - input is not mutated (shared callers can re-use the row)
 *   - identity fields are never stripped (they're not in HIDEABLE_FIELDS)
 */

function baseProfile(): Profile {
	return {
		id: 'p1',
		userId: 'owner-id',
		githubUsername: 'alice',
		displayName: 'Alice',
		bio: 'hi',
		skills: ['ts'],
		interests: ['rust'],
		availability: 'active',
		profileVisibility: 'public',
		location: 'NYC',
		timezone: 'America/New_York',
		githubUrl: 'https://github.com/alice',
		linkedinUrl: 'https://linkedin.com/in/alice',
		websiteUrl: 'https://alice.dev',
		preferredLanguages: ['en'],
		yearsOfExperience: 5,
	};
}

const ownerViewer: ViewerContext = { isOwner: true, isAuthenticated: true };
const otherSignedInViewer: ViewerContext = { isOwner: false, isAuthenticated: true };
const anonymousViewer: ViewerContext = { isOwner: false, isAuthenticated: false };

describe('applyFieldVisibility', () => {
	describe('owner short-circuit', () => {
		it('returns the profile unchanged when viewer is the owner', () => {
			const profile = baseProfile();
			profile.fieldVisibility = { bio: 'private', skills: 'private', location: 'private' };

			const out = applyFieldVisibility(profile, ownerViewer);

			// Owner sees the full set even though everything is marked private.
			expect(out.bio).toBe('hi');
			expect(out.skills).toEqual(['ts']);
			expect(out.location).toBe('NYC');
		});

		it('returns the SAME object reference for the owner path (no clone)', () => {
			// Micro-optimisation invariant: the owner branch is the most-common
			// path (every user viewing their own profile), so it avoids a
			// pointless shallow clone. Pin this so a future refactor doesn't
			// accidentally re-clone on the hot path.
			const profile = baseProfile();
			const out = applyFieldVisibility(profile, ownerViewer);
			expect(out).toBe(profile);
		});
	});

	describe('non-owner, authenticated viewer', () => {
		it('keeps public fields (the default)', () => {
			const profile = baseProfile();
			// No fieldVisibility set → all fields default to public.
			const out = applyFieldVisibility(profile, otherSignedInViewer);
			expect(out.bio).toBe('hi');
			expect(out.location).toBe('NYC');
			expect(out.skills).toEqual(['ts']);
		});

		it('keeps authenticated-level fields when viewer is signed in', () => {
			const profile = baseProfile();
			profile.fieldVisibility = { location: 'authenticated', timezone: 'authenticated' };
			const out = applyFieldVisibility(profile, otherSignedInViewer);
			expect(out.location).toBe('NYC');
			expect(out.timezone).toBe('America/New_York');
		});

		it('strips private fields', () => {
			const profile = baseProfile();
			profile.fieldVisibility = {
				bio: 'private',
				location: 'private',
				yearsOfExperience: 'private',
			};
			const out = applyFieldVisibility(profile, otherSignedInViewer);
			expect(out.bio).toBeUndefined();
			expect(out.location).toBeUndefined();
			expect(out.yearsOfExperience).toBeUndefined();
		});

		it('mixes levels correctly across fields', () => {
			const profile = baseProfile();
			profile.fieldVisibility = {
				bio: 'public',
				location: 'authenticated',
				yearsOfExperience: 'private',
			};
			const out = applyFieldVisibility(profile, otherSignedInViewer);
			expect(out.bio).toBe('hi'); // public → kept
			expect(out.location).toBe('NYC'); // authenticated + signed in → kept
			expect(out.yearsOfExperience).toBeUndefined(); // private → stripped
		});
	});

	describe('anonymous viewer (defensive — current routes are auth-gated)', () => {
		it('keeps public fields', () => {
			const profile = baseProfile();
			profile.fieldVisibility = { bio: 'public' };
			const out = applyFieldVisibility(profile, anonymousViewer);
			expect(out.bio).toBe('hi');
		});

		it('strips authenticated-level fields', () => {
			const profile = baseProfile();
			profile.fieldVisibility = { location: 'authenticated' };
			const out = applyFieldVisibility(profile, anonymousViewer);
			expect(out.location).toBeUndefined();
		});

		it('strips private fields', () => {
			const profile = baseProfile();
			profile.fieldVisibility = { bio: 'private' };
			const out = applyFieldVisibility(profile, anonymousViewer);
			expect(out.bio).toBeUndefined();
		});
	});

	describe('default behaviour for missing entries', () => {
		it('treats absent fieldVisibility map as all-public', () => {
			const profile = baseProfile();
			// Note: no fieldVisibility property at all.
			expect(profile.fieldVisibility).toBeUndefined();
			const out = applyFieldVisibility(profile, otherSignedInViewer);
			expect(out.bio).toBe('hi');
			expect(out.location).toBe('NYC');
		});

		it('treats empty fieldVisibility map as all-public', () => {
			const profile = baseProfile();
			profile.fieldVisibility = {};
			const out = applyFieldVisibility(profile, otherSignedInViewer);
			expect(out.bio).toBe('hi');
			expect(out.location).toBe('NYC');
		});

		it('treats explicit missing entries as public (per-field default)', () => {
			const profile = baseProfile();
			// Only `bio` is set; everything else should still be public.
			profile.fieldVisibility = { bio: 'private' };
			const out = applyFieldVisibility(profile, otherSignedInViewer);
			expect(out.bio).toBeUndefined();
			expect(out.location).toBe('NYC');
			expect(out.skills).toEqual(['ts']);
		});
	});

	describe('input immutability', () => {
		it('does not mutate the input profile', () => {
			// Same row may be processed once per viewer in batched paths
			// (think a future feed). Mutation would corrupt subsequent
			// calls. The shallow clone in the implementation prevents this;
			// pin it so a future "optimization" doesn't break it.
			const profile = baseProfile();
			profile.fieldVisibility = { bio: 'private', location: 'private' };
			const snapshot = JSON.parse(JSON.stringify(profile));

			applyFieldVisibility(profile, otherSignedInViewer);

			expect(profile).toEqual(snapshot);
		});
	});

	describe('identity/status fields are NEVER touched', () => {
		// HIDEABLE_FIELDS deliberately excludes id, userId, githubUsername,
		// displayName, availability, profileVisibility. Even if a malformed
		// fieldVisibility map sneaks one of those in (via a hand-crafted
		// POST), the filter must not strip it — the card needs them to
		// identify itself.
		it('keeps displayName, githubUsername, availability, id, userId regardless', () => {
			const profile = baseProfile();
			// Try to abuse the map (TS would reject, but runtime input might
			// not be type-checked when it arrives from the wire).
			(profile.fieldVisibility as Record<string, unknown>) = {
				displayName: 'private',
				githubUsername: 'private',
				availability: 'private',
				id: 'private',
				userId: 'private',
			};
			const out = applyFieldVisibility(profile, otherSignedInViewer);
			expect(out.displayName).toBe('Alice');
			expect(out.githubUsername).toBe('alice');
			expect(out.availability).toBe('active');
			expect(out.id).toBe('p1');
			expect(out.userId).toBe('owner-id');
		});
	});
});
