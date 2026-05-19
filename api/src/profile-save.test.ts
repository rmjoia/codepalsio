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
 * the whole input each time. */
function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		displayName: 'Alice',
		bio: 'hi',
		skills: ['ts'],
		interests: ['rust'],
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
