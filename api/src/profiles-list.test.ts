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

		it('does NOT project c.userId in the returned columns (no internal id leak)', () => {
			const selectClause = PROFILES_QUERY.split(/\bFROM\b/)[0];
			expect(selectClause).not.toMatch(/\bc\.userId\b/);
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

		it('returns the resources array verbatim under {profiles: ...}', async () => {
			const mockProfiles = [
				{ id: 'p1', displayName: 'Alice', bio: 'hi', skills: ['ts'], availability: 'active' },
				{ id: 'p2', displayName: 'Bob', bio: 'hello', skills: ['rust'], availability: 'casual' },
			];
			mocks.fetchAllMock.mockResolvedValue({ resources: mockProfiles });

			const response = await profilesHandler(fakeRequest, fakeContext);

			expect(response.status).toBe(200);
			expect(response.jsonBody).toEqual({ profiles: mockProfiles });
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
