import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

/**
 * Focused tests on the field-visibility plumbing through profile-save.
 *
 * The companion tests for profile-by-username and profiles-list use
 * mocked Cosmos rows where `fieldVisibility` is pre-populated, which
 * means a typo on the WRITE side (e.g. `fieldVisibilty` mis-spelling
 * the property name on the upserted doc) would not be caught by any
 * existing test. These tests close that gap by spying on the upsert
 * argument and asserting it carries the normalised map.
 *
 * Scope is intentionally narrow: the existing validation-level tests
 * cover the full input-shape matrix; this file only exercises the
 * save handler's wire-up — input → normalize → upsert.
 */

const mocks = vi.hoisted(() => ({
	upsertMock: vi.fn(),
	getContainerMock: vi.fn(),
	getCosmosConfigMock: vi.fn(),
	getClientPrincipalMock: vi.fn(),
	findProfileWithAutoHealMock: vi.fn(),
	createUserRepositoryMock: vi.fn(),
}));

vi.mock('@azure/functions', () => ({
	app: { http: vi.fn() },
}));

vi.mock('./lib/cosmos', () => ({
	getContainer: mocks.getContainerMock,
	getCosmosConfig: mocks.getCosmosConfigMock,
	getCosmosClient: vi.fn(),
}));

vi.mock('./lib/principal', () => ({
	getClientPrincipal: mocks.getClientPrincipalMock,
}));

vi.mock('./lib/profile-repo', () => ({
	findProfileWithAutoHeal: mocks.findProfileWithAutoHealMock,
}));

vi.mock('./lib/users', () => ({
	createUserRepository: mocks.createUserRepositoryMock,
}));

// SUT — must be imported AFTER the mocks above are registered.
import { profileSaveHandler } from './profile-save';
import type { Profile } from './lib/types';

const fakeContext = {
	log: vi.fn(),
	error: vi.fn(),
} as unknown as InvocationContext;

const authedPrincipal = {
	identityProvider: 'github',
	userId: 'current-user-id',
	userDetails: 'rmjoia',
	userRoles: ['authenticated'],
	claims: [],
};

/** Minimal valid save body — meets every required-field check so we can
 * vary only the slice under test (fieldVisibility) without re-stating
 * the whole input each time. Values below the public-directory quality
 * bar (bio < 50 chars, < 2 skills, < 2 interests) would fail the save
 * because the default here is `profileVisibility: 'public'` (issue #68);
 * override with `profileVisibility: 'private'` to exercise the looser
 * private-save path. */
function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		displayName: 'Alice',
		bio: 'Building open-source tools and looking for peers to pair with on weekends.',
		skills: ['ts', 'rust'],
		interests: ['compilers', 'developer-tooling'],
		availability: 'active',
		profileVisibility: 'public',
		...over,
	};
}

function makeRequest(body: unknown): HttpRequest {
	return { json: async () => body } as unknown as HttpRequest;
}

describe('POST /api/profile-save — fieldVisibility plumbing', () => {
	beforeEach(() => {
		mocks.upsertMock.mockReset();
		mocks.upsertMock.mockResolvedValue({});
		mocks.getContainerMock.mockReset();
		mocks.getContainerMock.mockReturnValue({ items: { upsert: mocks.upsertMock } });
		mocks.getCosmosConfigMock.mockReset();
		mocks.getCosmosConfigMock.mockReturnValue({ connectionString: 'cs', database: 'db' });
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(authedPrincipal);
		mocks.findProfileWithAutoHealMock.mockReset();
		mocks.findProfileWithAutoHealMock.mockResolvedValue({ profile: null, healed: false });
		mocks.createUserRepositoryMock.mockReset();
		mocks.createUserRepositoryMock.mockReturnValue({});
	});

	function getUpsertedProfile(): Profile {
		expect(mocks.upsertMock).toHaveBeenCalledTimes(1);
		return mocks.upsertMock.mock.calls[0][0] as Profile;
	}

	it('persists the normalised fieldVisibility map under the canonical property name', async () => {
		// Catches the symmetric-to-Copilot-comment-1 typo class: if the
		// property name on the upserted doc drifts from `fieldVisibility`,
		// nothing else in the suite would fail (the read-side tests
		// pre-populate the field on the mocked Cosmos row).
		const res = await profileSaveHandler(
			makeRequest(validBody({ fieldVisibility: { bio: 'private', location: 'authenticated' } })),
			fakeContext
		);

		expect(res.status).toBe(200);
		const saved = getUpsertedProfile();
		expect(saved).toHaveProperty('fieldVisibility');
		expect(saved.fieldVisibility).toEqual({ bio: 'private', location: 'authenticated' });
	});

	it('drops invalid keys at the boundary (whitelist enforced at save time)', async () => {
		// `displayName` is identity, not hideable. Even if the wire
		// includes it, the upserted doc must not contain it in the map.
		// Tests the integration between the save handler and
		// normalizeFieldVisibility — guards against future refactors that
		// might forget to wire normalize in.
		await profileSaveHandler(
			makeRequest(
				validBody({
					fieldVisibility: {
						displayName: 'private',
						bio: 'private',
						userId: 'private',
					},
				})
			),
			fakeContext
		);

		const saved = getUpsertedProfile();
		expect(saved.fieldVisibility).toEqual({ bio: 'private' });
		expect(saved.fieldVisibility).not.toHaveProperty('displayName');
		expect(saved.fieldVisibility).not.toHaveProperty('userId');
	});

	it('stores empty map when fieldVisibility is absent from the input (legacy / default-public)', async () => {
		// Existing saves (and brand-new profiles from the un-updated UI)
		// don't send fieldVisibility. The stored doc must still satisfy
		// the Profile contract — fieldVisibility present as empty.
		await profileSaveHandler(makeRequest(validBody()), fakeContext);

		const saved = getUpsertedProfile();
		expect(saved.fieldVisibility).toEqual({});
	});

	it('stores empty map when fieldVisibility is garbage (number / string / array)', async () => {
		// Hand-crafted hostile POST sends junk. normalizeFieldVisibility
		// must coerce to {} so the upsert never carries a malformed value
		// into Cosmos (or worse, into the next read).
		for (const garbage of [42, 'private', ['bio'], null, true]) {
			mocks.upsertMock.mockClear();
			await profileSaveHandler(makeRequest(validBody({ fieldVisibility: garbage })), fakeContext);
			const saved = mocks.upsertMock.mock.calls[0][0] as Profile;
			expect(saved.fieldVisibility, `garbage input ${JSON.stringify(garbage)}`).toEqual({});
		}
	});

	it('drops `public` entries from storage (storage stays lean)', async () => {
		// Stored doc size matters for RU/cosmos budget. An all-public
		// map is observationally identical to an empty map; pick the
		// cheaper one. Pinned by normalize tests too, but this asserts
		// the property holds end-to-end through the save handler.
		await profileSaveHandler(
			makeRequest(
				validBody({
					fieldVisibility: { bio: 'public', skills: 'public', location: 'private' },
				})
			),
			fakeContext
		);

		const saved = getUpsertedProfile();
		expect(saved.fieldVisibility).toEqual({ location: 'private' });
	});

	it('still saves successfully when the user has no existing profile (fresh signup)', async () => {
		// Sanity-check that the auto-heal "no existing profile" branch
		// doesn't drop fieldVisibility on the floor.
		mocks.findProfileWithAutoHealMock.mockResolvedValueOnce({ profile: null, healed: false });

		const res = await profileSaveHandler(
			makeRequest(validBody({ fieldVisibility: { bio: 'private' } })),
			fakeContext
		);

		expect(res.status).toBe(200);
		const saved = getUpsertedProfile();
		expect(saved.fieldVisibility).toEqual({ bio: 'private' });
	});

	it('preserves the id when updating an existing profile (no duplicate creation)', async () => {
		// Regression guard adjacent to the visibility plumbing — make sure
		// merging fieldVisibility into the upsert payload doesn't
		// accidentally change how existing profiles are addressed.
		mocks.findProfileWithAutoHealMock.mockResolvedValueOnce({
			profile: { id: 'profile-existing-id', userId: 'current-user-id' } as Profile,
			healed: false,
		});

		await profileSaveHandler(
			makeRequest(validBody({ fieldVisibility: { bio: 'private' } })),
			fakeContext
		);

		const saved = getUpsertedProfile();
		expect(saved.id).toBe('profile-existing-id');
		expect(saved.fieldVisibility).toEqual({ bio: 'private' });
	});

	it('rejects unauthenticated requests with 401 before touching Cosmos', async () => {
		mocks.getClientPrincipalMock.mockReturnValueOnce(null);
		const res = await profileSaveHandler(
			makeRequest(validBody({ fieldVisibility: { bio: 'private' } })),
			fakeContext
		);
		expect(res.status).toBe(401);
		expect(mocks.upsertMock).not.toHaveBeenCalled();
		expect(mocks.findProfileWithAutoHealMock).not.toHaveBeenCalled();
	});
});

describe('POST /api/profile-save — yearsOfExperience plumbing', () => {
	beforeEach(() => {
		mocks.upsertMock.mockReset();
		mocks.upsertMock.mockResolvedValue({});
		mocks.getContainerMock.mockReset();
		mocks.getContainerMock.mockReturnValue({ items: { upsert: mocks.upsertMock } });
		mocks.getCosmosConfigMock.mockReset();
		mocks.getCosmosConfigMock.mockReturnValue({ connectionString: 'cs', database: 'db' });
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(authedPrincipal);
		mocks.findProfileWithAutoHealMock.mockReset();
		mocks.findProfileWithAutoHealMock.mockResolvedValue({ profile: null, healed: false });
		mocks.createUserRepositoryMock.mockReset();
		mocks.createUserRepositoryMock.mockReturnValue({});
	});

	function getUpsertedProfile(): Profile {
		expect(mocks.upsertMock).toHaveBeenCalledTimes(1);
		return mocks.upsertMock.mock.calls[0][0] as Profile;
	}

	it('persists a valid integer years value', async () => {
		await profileSaveHandler(makeRequest(validBody({ yearsOfExperience: 5 })), fakeContext);
		expect(getUpsertedProfile().yearsOfExperience).toBe(5);
	});

	it('parses numeric strings (the edit form ships a string from <input type="number">)', async () => {
		await profileSaveHandler(makeRequest(validBody({ yearsOfExperience: '12' })), fakeContext);
		expect(getUpsertedProfile().yearsOfExperience).toBe(12);
	});

	it('stores undefined for an empty string (legitimate "I prefer not to say")', async () => {
		await profileSaveHandler(makeRequest(validBody({ yearsOfExperience: '' })), fakeContext);
		expect(getUpsertedProfile().yearsOfExperience).toBeUndefined();
	});

	it.each([-1, 61, 1000, 'abc', null, true, NaN])(
		'drops out-of-range / non-numeric input %j to undefined (no false zero)',
		async (input) => {
			mocks.upsertMock.mockClear();
			await profileSaveHandler(
				makeRequest(validBody({ yearsOfExperience: input })),
				fakeContext
			);
			const saved = mocks.upsertMock.mock.calls[0][0] as Profile;
			expect(saved.yearsOfExperience, `input ${JSON.stringify(input)}`).toBeUndefined();
		}
	);
});

describe('POST /api/profile-save — preferredLanguages plumbing', () => {
	beforeEach(() => {
		mocks.upsertMock.mockReset();
		mocks.upsertMock.mockResolvedValue({});
		mocks.getContainerMock.mockReset();
		mocks.getContainerMock.mockReturnValue({ items: { upsert: mocks.upsertMock } });
		mocks.getCosmosConfigMock.mockReset();
		mocks.getCosmosConfigMock.mockReturnValue({ connectionString: 'cs', database: 'db' });
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(authedPrincipal);
		mocks.findProfileWithAutoHealMock.mockReset();
		mocks.findProfileWithAutoHealMock.mockResolvedValue({ profile: null, healed: false });
		mocks.createUserRepositoryMock.mockReset();
		mocks.createUserRepositoryMock.mockReturnValue({});
	});

	function getUpsertedProfile(): Profile {
		expect(mocks.upsertMock).toHaveBeenCalledTimes(1);
		return mocks.upsertMock.mock.calls[0][0] as Profile;
	}

	it('persists a valid string array', async () => {
		await profileSaveHandler(
			makeRequest(validBody({ preferredLanguages: ['English', 'Português'] })),
			fakeContext
		);
		expect(getUpsertedProfile().preferredLanguages).toEqual(['English', 'Português']);
	});

	it('trims per-item whitespace and drops empties', async () => {
		await profileSaveHandler(
			makeRequest(validBody({ preferredLanguages: ['  English  ', '', '  ', 'Spanish'] })),
			fakeContext
		);
		expect(getUpsertedProfile().preferredLanguages).toEqual(['English', 'Spanish']);
	});

	it('stores undefined (not []) when input is missing or yields zero entries', async () => {
		// Missing field
		mocks.upsertMock.mockClear();
		await profileSaveHandler(makeRequest(validBody()), fakeContext);
		expect(getUpsertedProfile().preferredLanguages).toBeUndefined();

		// Empty array
		mocks.upsertMock.mockClear();
		await profileSaveHandler(
			makeRequest(validBody({ preferredLanguages: [] })),
			fakeContext
		);
		expect(getUpsertedProfile().preferredLanguages).toBeUndefined();

		// All-whitespace entries that normalise away
		mocks.upsertMock.mockClear();
		await profileSaveHandler(
			makeRequest(validBody({ preferredLanguages: ['', '   '] })),
			fakeContext
		);
		expect(getUpsertedProfile().preferredLanguages).toBeUndefined();
	});

	it('treats non-array input as zero entries (defensive)', async () => {
		// Hand-crafted POST sending a string instead of an array — normaliser
		// returns [], which we then elide to undefined.
		await profileSaveHandler(
			makeRequest(validBody({ preferredLanguages: 'English' })),
			fakeContext
		);
		expect(getUpsertedProfile().preferredLanguages).toBeUndefined();
	});
});

/**
 * Save-gate strictness gated on profileVisibility (issue #68).
 *
 * The "≥50-char bio, ≥2 skills, ≥2 interests" bar exists for /find
 * directory quality — a listed profile with a one-line bio is useless.
 * But conflating "save my progress" with "publish to the directory" made
 * the edit form hostile: new users hit a 400 on their first save and
 * had to fill every field before they could save anything at all.
 *
 * The fix ties the strict bar to `profileVisibility === 'public'`:
 * private profiles save with any content (still capped by abuse limits
 * like bio ≤ 500, tagCount ≤ 30), public profiles keep the quality bar.
 */
describe('POST /api/profile-save — save-gate strictness (issue #68)', () => {
	beforeEach(() => {
		mocks.upsertMock.mockReset();
		mocks.upsertMock.mockResolvedValue({});
		mocks.getContainerMock.mockReset();
		mocks.getContainerMock.mockReturnValue({ items: { upsert: mocks.upsertMock } });
		mocks.getCosmosConfigMock.mockReset();
		mocks.getCosmosConfigMock.mockReturnValue({ connectionString: 'cs', database: 'db' });
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(authedPrincipal);
		mocks.findProfileWithAutoHealMock.mockReset();
		mocks.findProfileWithAutoHealMock.mockResolvedValue({ profile: null, healed: false });
		mocks.createUserRepositoryMock.mockReset();
		mocks.createUserRepositoryMock.mockReturnValue({});
	});

	function minimalPrivateBody(over: Record<string, unknown> = {}): Record<string, unknown> {
		return {
			displayName: 'Alice',
			profileVisibility: 'private',
			...over,
		};
	}

	it('accepts a private save with an empty bio, no skills, and no interests', async () => {
		const res = await profileSaveHandler(makeRequest(minimalPrivateBody()), fakeContext);
		expect(res.status).toBe(200);
		expect(mocks.upsertMock).toHaveBeenCalledTimes(1);
		const saved = mocks.upsertMock.mock.calls[0][0] as Profile;
		// Bio elides to undefined (no trimmedString match) — server
		// tolerates the missing field on a private save.
		expect(saved.bio).toBeUndefined();
		expect(saved.skills).toEqual([]);
		expect(saved.interests).toEqual([]);
		expect(saved.profileVisibility).toBe('private');
	});

	it('accepts a private save with a short bio (< 50 chars)', async () => {
		const res = await profileSaveHandler(
			makeRequest(minimalPrivateBody({ bio: 'hi', skills: ['ts'], interests: ['rust'] })),
			fakeContext
		);
		expect(res.status).toBe(200);
		const saved = mocks.upsertMock.mock.calls[0][0] as Profile;
		expect(saved.bio).toBe('hi');
	});

	it('still rejects a private save without a displayName (identity is mandatory)', async () => {
		const res = await profileSaveHandler(
			makeRequest({ profileVisibility: 'private' }),
			fakeContext
		);
		expect(res.status).toBe(400);
		expect(mocks.upsertMock).not.toHaveBeenCalled();
	});

	it('still enforces the bio MAX limit on private saves (abuse cap)', async () => {
		const oversized = 'x'.repeat(501);
		const res = await profileSaveHandler(
			makeRequest(minimalPrivateBody({ bio: oversized })),
			fakeContext
		);
		expect(res.status).toBe(400);
		expect(mocks.upsertMock).not.toHaveBeenCalled();
	});

	it('rejects a public save with a short bio (< 50 chars)', async () => {
		const res = await profileSaveHandler(
			makeRequest(
				validBody({
					bio: 'too short',
					profileVisibility: 'public',
				})
			),
			fakeContext
		);
		expect(res.status).toBe(400);
		const body = res.jsonBody as { error: string };
		expect(body.error).toMatch(/50/);
		expect(mocks.upsertMock).not.toHaveBeenCalled();
	});

	it('rejects a public save with fewer than 2 skills', async () => {
		const res = await profileSaveHandler(
			makeRequest(validBody({ skills: ['ts'] })),
			fakeContext
		);
		expect(res.status).toBe(400);
		const body = res.jsonBody as { error: string };
		expect(body.error).toMatch(/skills/);
		expect(mocks.upsertMock).not.toHaveBeenCalled();
	});

	it('rejects a public save with fewer than 2 interests', async () => {
		const res = await profileSaveHandler(
			makeRequest(validBody({ interests: ['rust'] })),
			fakeContext
		);
		expect(res.status).toBe(400);
		const body = res.jsonBody as { error: string };
		expect(body.error).toMatch(/interests/);
		expect(mocks.upsertMock).not.toHaveBeenCalled();
	});

	it('rejects a public save with a missing bio', async () => {
		// `bio` absent — the private path lets this through, the public
		// path must not (otherwise a curl POST bypasses the client gate).
		const res = await profileSaveHandler(
			makeRequest({
				displayName: 'Alice',
				skills: ['ts', 'rust'],
				interests: ['a', 'b'],
				profileVisibility: 'public',
			}),
			fakeContext
		);
		expect(res.status).toBe(400);
		expect(mocks.upsertMock).not.toHaveBeenCalled();
	});

	it('accepts a public save that meets every quality bar', async () => {
		const res = await profileSaveHandler(makeRequest(validBody()), fakeContext);
		expect(res.status).toBe(200);
		expect(mocks.upsertMock).toHaveBeenCalledTimes(1);
	});

	it('defaults absent profileVisibility to private (looser gate applies)', async () => {
		// Omit `profileVisibility` entirely — the handler coerces to
		// 'private', so the strict public bar doesn't fire even with a
		// short bio and one skill.
		const res = await profileSaveHandler(
			makeRequest({
				displayName: 'Alice',
				bio: 'hi',
				skills: ['ts'],
				interests: ['rust'],
			}),
			fakeContext
		);
		expect(res.status).toBe(200);
		const saved = mocks.upsertMock.mock.calls[0][0] as Profile;
		expect(saved.profileVisibility).toBe('private');
	});
});
