import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

// vi.mock() factories are hoisted above all top-level statements, so any
// shared mock references they capture must also be hoisted via vi.hoisted().
const mocks = vi.hoisted(() => ({
	fetchAllMock: vi.fn(),
	queryMock: vi.fn(),
	getContainerMock: vi.fn(),
	getCosmosConfigMock: vi.fn(),
	getClientPrincipalMock: vi.fn(),
}));

// `app.http` is registered as a side effect when the SUT loads; stub it so
// loading the SUT is a no-op and we can call the handler function directly.
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

// SUT — must be imported AFTER the mocks above are registered.
import { profilesHandler, PROFILES_QUERY, DIRECTORY_PAGE_SIZE } from './profiles-list';
import type { Profile } from './lib/types';

/** Minimal Profile factory for tests — fills in the required fields. */
function makeProfile(over: Partial<Profile> & Pick<Profile, 'id' | 'userId'>): Profile {
	return {
		displayName: 'Test',
		bio: 'hi',
		skills: ['ts'],
		interests: ['rust'],
		availability: 'active',
		profileVisibility: 'public',
		...over,
	};
}

const fakeRequest = {} as HttpRequest;
const fakeContext = { error: vi.fn() } as unknown as InvocationContext;
const authedPrincipal = {
	identityProvider: 'github',
	userId: 'current-user-id',
	userDetails: 'rmjoia',
	userRoles: ['authenticated'],
	claims: [],
};

describe('GET /api/profiles privacy guard', () => {
	beforeEach(() => {
		// Reset every call/return value, then wire up the default chain:
		// getContainer() → { items: { query() → { fetchAll() } } }
		mocks.fetchAllMock.mockReset();
		mocks.queryMock.mockReset();
		mocks.queryMock.mockReturnValue({ fetchAll: mocks.fetchAllMock });
		mocks.getContainerMock.mockReset();
		mocks.getContainerMock.mockReturnValue({ items: { query: mocks.queryMock } });
		mocks.getCosmosConfigMock.mockReset();
		mocks.getCosmosConfigMock.mockReturnValue({ connectionString: 'cs', database: 'db' });
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(authedPrincipal);
	});

	describe('Cosmos query structural invariants', () => {
		// These tests catch refactors that would silently weaken the privacy
		// guarantees — they don't run the handler, they just inspect the query
		// string itself. Cheap, fast, and they fail loudly if anyone removes
		// or rewrites the WHERE clause.

		it("filters profileVisibility = 'public' in the WHERE clause", () => {
			expect(PROFILES_QUERY).toMatch(/c\.profileVisibility\s*=\s*'public'/);
		});

		it('does NOT use inequality (!=) against public — that would invert the filter', () => {
			expect(PROFILES_QUERY).not.toMatch(/c\.profileVisibility\s*!=\s*'public'/);
		});

		it('does NOT exclude the current user — own profile is visible in /find as a self-preview', () => {
			expect(PROFILES_QUERY).not.toContain('c.userId != @currentUserId');
			expect(PROFILES_QUERY).not.toContain('@currentUserId');
		});

		it('caps the result set with SELECT TOP', () => {
			expect(PROFILES_QUERY).toMatch(new RegExp(`SELECT\\s+TOP\\s+${DIRECTORY_PAGE_SIZE}\\b`));
		});

		it('DOES project c.userId — handler needs it for owner detection (response strips it)', () => {
			// Per-field visibility (PR adding fieldVisibility) requires the
			// handler to compare each row's userId against the caller's. The
			// query must select it; the response must NOT include it. The
			// privacy invariant moved from the query layer to the response
			// layer — see the corresponding "response does not contain userId"
			// test in the handler-behavior block.
			const selectClause = PROFILES_QUERY.split(/\bFROM\b/)[0];
			expect(selectClause).toMatch(/\bc\.userId\b/);
		});

		it('DOES project c.fieldVisibility — needed to apply the per-field filter', () => {
			// Without this column the handler can't tell which fields are
			// `private`/`authenticated` and strip them. The response strips
			// the column itself before responding.
			const selectClause = PROFILES_QUERY.split(/\bFROM\b/)[0];
			expect(selectClause).toMatch(/\bc\.fieldVisibility\b/);
		});

		it('does NOT project c.profileVisibility in the returned columns (filter-only metadata)', () => {
			const selectClause = PROFILES_QUERY.split(/\bFROM\b/)[0];
			expect(selectClause).not.toMatch(/\bc\.profileVisibility\b/);
		});
	});

	describe('handler behavior', () => {
		it('rejects unauthenticated requests with 401 and never queries Cosmos', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce(null);
			const response = await profilesHandler(fakeRequest, fakeContext);
			expect(response.status).toBe(401);
			expect(response.jsonBody).toEqual({ error: 'Not authenticated' });
			expect(mocks.queryMock).not.toHaveBeenCalled();
			expect(mocks.fetchAllMock).not.toHaveBeenCalled();
		});

		it('passes the canonical query unchanged to Cosmos with no parameters', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			await profilesHandler(fakeRequest, fakeContext);

			expect(mocks.queryMock).toHaveBeenCalledTimes(1);
			// Query has no @currentUserId binding after dropping self-exclusion.
			expect(mocks.queryMock).toHaveBeenCalledWith(
				expect.objectContaining({ query: PROFILES_QUERY })
			);
			const callArg = mocks.queryMock.mock.calls[0][0];
			expect(callArg.parameters ?? []).toEqual([]);
		});

		it('projects every row through DirectoryProfile (no userId or fieldVisibility in response)', async () => {
			// Privacy is enforced at the response layer now: the query may
			// select userId + fieldVisibility (the handler needs them for
			// owner detection + per-field filtering), but toDirectoryProfile
			// strips both before returning. If this fails, an internal user
			// hash starts leaking on every directory load.
			mocks.fetchAllMock.mockResolvedValue({
				resources: [
					makeProfile({ id: 'p1', userId: 'other-1', displayName: 'Alice' }),
					makeProfile({ id: 'p2', userId: 'other-2', displayName: 'Bob' }),
				],
			});

			const response = await profilesHandler(fakeRequest, fakeContext);

			expect(response.status).toBe(200);
			const body = response.jsonBody as { profiles: Array<Record<string, unknown>> };
			expect(body.profiles).toHaveLength(2);
			for (const row of body.profiles) {
				expect(row).not.toHaveProperty('userId');
				expect(row).not.toHaveProperty('fieldVisibility');
				expect(row).not.toHaveProperty('profileVisibility');
			}
			expect(body.profiles[0].displayName).toBe('Alice');
			expect(body.profiles[1].displayName).toBe('Bob');
		});

		it('strips a private field from non-owner rows', async () => {
			// A row marked bio=private must not return bio when the viewer
			// is not its owner. We check for `undefined` rather than absent
			// because toDirectoryProfile builds a fixed-shape object and a
			// stripped field shows as `bio: undefined` in memory; JSON
			// serialization on the wire drops undefined keys (so the
			// browser sees no `bio` at all), which is what users observe.
			mocks.fetchAllMock.mockResolvedValue({
				resources: [
					makeProfile({
						id: 'p1',
						userId: 'someone-else',
						bio: 'secret bio',
						fieldVisibility: { bio: 'private' },
					}),
				],
			});

			const response = await profilesHandler(fakeRequest, fakeContext);
			expect(response.status).toBe(200);
			const body = response.jsonBody as { profiles: Array<Record<string, unknown>> };
			expect(body.profiles[0].bio).toBeUndefined();
			// And: the stripped value is gone on the wire (JSON drops undefined)
			expect(JSON.parse(JSON.stringify(body.profiles[0]))).not.toHaveProperty('bio');
		});

		it('keeps an authenticated field on non-owner rows for authenticated viewers', async () => {
			// /api/profiles is gated authenticated; every viewer is by
			// definition signed in, so `authenticated`-level fields pass
			// through for everyone except (hypothetically) anonymous
			// viewers — none reach this handler today.
			mocks.fetchAllMock.mockResolvedValue({
				resources: [
					makeProfile({
						id: 'p1',
						userId: 'someone-else',
						location: 'NYC',
						fieldVisibility: { location: 'authenticated' },
					}),
				],
			});

			const response = await profilesHandler(fakeRequest, fakeContext);
			expect(response.status).toBe(200);
			const body = response.jsonBody as { profiles: Array<Record<string, unknown>> };
			expect(body.profiles[0].location).toBe('NYC');
		});

		it('shows the owner all their own private fields (self-preview)', async () => {
			// The caller's own row in the directory is a "how do I appear
			// to others" preview — but viewing-yourself bypass exists so
			// fields you've marked private are still visible to you
			// without round-tripping through the edit page.
			mocks.fetchAllMock.mockResolvedValue({
				resources: [
					makeProfile({
						id: 'p1',
						userId: authedPrincipal.userId,
						bio: 'my private bio',
						fieldVisibility: { bio: 'private' },
					}),
				],
			});

			const response = await profilesHandler(fakeRequest, fakeContext);
			expect(response.status).toBe(200);
			const body = response.jsonBody as { profiles: Array<Record<string, unknown>> };
			expect(body.profiles[0].bio).toBe('my private bio');
		});

		it('returns 500 when Cosmos config is missing', async () => {
			mocks.getCosmosConfigMock.mockReturnValueOnce(null);

			const response = await profilesHandler(fakeRequest, fakeContext);

			expect(response.status).toBe(500);
			expect(response.jsonBody).toEqual({ error: 'Server configuration error' });
			expect(mocks.queryMock).not.toHaveBeenCalled();
		});

		it('returns 500 with a generic message when the Cosmos query throws', async () => {
			mocks.fetchAllMock.mockRejectedValue(new Error('network down'));

			const response = await profilesHandler(fakeRequest, fakeContext);

			expect(response.status).toBe(500);
			expect(response.jsonBody).toEqual({ error: 'Failed to load profiles' });
		});

		it('targets the profiles container specifically', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			await profilesHandler(fakeRequest, fakeContext);

			expect(mocks.getContainerMock).toHaveBeenCalledWith('cs', 'db', 'profiles');
		});
	});
});
