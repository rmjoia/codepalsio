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
import { profileByUsernameHandler, PROFILE_BY_USERNAME_QUERY } from './profile-by-username';

function makeRequest(query: Record<string, string>): HttpRequest {
	const params = new URLSearchParams(query);
	return {
		query: {
			get: (key: string) => params.get(key),
		},
	} as unknown as HttpRequest;
}

const fakeContext = { error: vi.fn() } as unknown as InvocationContext;
const authedPrincipal = {
	identityProvider: 'github',
	userId: 'current-user-id',
	userDetails: 'rmjoia',
	userRoles: ['authenticated'],
	claims: [],
};

describe('GET /api/profile-by-username', () => {
	beforeEach(() => {
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
		// Static assertions against the exported query string. If a future
		// refactor weakens privacy or breaks the username lookup, these
		// fail before any handler runs.

		it('filters by githubUsername via parameter binding', () => {
			expect(PROFILE_BY_USERNAME_QUERY).toMatch(/c\.githubUsername\s*=\s*@username/);
		});

		it('caps the result set with SELECT TOP 1 (lookup, not enumeration)', () => {
			expect(PROFILE_BY_USERNAME_QUERY).toMatch(/SELECT\s+TOP\s+1\b/);
		});

		it('selects profileVisibility so the handler can distinguish 403 vs 200', () => {
			// Without this column the handler can't tell private from public —
			// it would have to return 404 for everything or 200 for everything.
			const selectClause = PROFILE_BY_USERNAME_QUERY.split(/\bFROM\b/)[0];
			expect(selectClause).toMatch(/\bc\.profileVisibility\b/);
		});

		it('does NOT project c.userId (internal id must not leak in the response)', () => {
			// profileVisibility IS in the projection but the handler strips it
			// before returning — userId we want gone at the query level.
			const selectClause = PROFILE_BY_USERNAME_QUERY.split(/\bFROM\b/)[0];
			expect(selectClause).not.toMatch(/\bc\.userId\b/);
		});
	});

	describe('username validation', () => {
		const invalidUsernames: Array<[string, string]> = [
			['', 'empty string'],
			['-startswithdash', 'leading hyphen'],
			['endswithdash-', 'trailing hyphen'],
			['has--double-dash', 'consecutive hyphens'],
			['has spaces', 'whitespace'],
			['has/slash', 'path traversal char'],
			['has@symbol', 'invalid char'],
			['a'.repeat(40), 'too long (40 chars)'],
		];

		it.each(invalidUsernames)('rejects %j (%s) with 400', async (username) => {
			const res = await profileByUsernameHandler(makeRequest({ username }), fakeContext);
			expect(res.status).toBe(400);
			expect(mocks.queryMock).not.toHaveBeenCalled();
		});

		it('returns 400 when username param is missing entirely', async () => {
			const res = await profileByUsernameHandler(makeRequest({}), fakeContext);
			expect(res.status).toBe(400);
			expect(mocks.queryMock).not.toHaveBeenCalled();
		});

		it('accepts a valid GitHub username (single char)', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			const res = await profileByUsernameHandler(makeRequest({ username: 'a' }), fakeContext);
			expect(res.status).toBe(404);
			expect(mocks.queryMock).toHaveBeenCalled();
		});

		it('accepts a valid GitHub username with internal hyphens', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			const res = await profileByUsernameHandler(makeRequest({ username: 'rm-joia' }), fakeContext);
			expect(res.status).toBe(404);
		});

		it('accepts a 39-char username (the GitHub max)', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			const res = await profileByUsernameHandler(makeRequest({ username: 'a'.repeat(39) }), fakeContext);
			expect(res.status).toBe(404);
		});
	});

	describe('handler behavior', () => {
		it('rejects unauthenticated requests with 401 and never queries Cosmos', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce(null);
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(401);
			expect(res.jsonBody).toEqual({ error: 'Not authenticated' });
			expect(mocks.queryMock).not.toHaveBeenCalled();
		});

		it('passes the canonical query unchanged and binds the username param', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);

			expect(mocks.queryMock).toHaveBeenCalledTimes(1);
			expect(mocks.queryMock).toHaveBeenCalledWith(
				expect.objectContaining({
					query: PROFILE_BY_USERNAME_QUERY,
					parameters: [{ name: '@username', value: 'alice' }],
				}),
			);
		});

		it('returns 404 when no profile matches the username', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			const res = await profileByUsernameHandler(makeRequest({ username: 'ghost' }), fakeContext);
			expect(res.status).toBe(404);
			expect(res.jsonBody).toEqual({ error: 'Not found' });
		});

		it('returns 403 when the profile exists but is private', async () => {
			mocks.fetchAllMock.mockResolvedValue({
				resources: [
					{
						id: 'p1',
						githubUsername: 'alice',
						displayName: 'Alice',
						bio: 'hi',
						skills: ['ts'],
						interests: [],
						availability: 'active',
						profileVisibility: 'private',
					},
				],
			});
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(403);
			expect(res.jsonBody).toEqual({ error: 'Profile is private' });
		});

		it('returns 200 with the public projection when the profile is public', async () => {
			const profileDoc = {
				id: 'p1',
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
				updatedAt: '2026-05-14T00:00:00Z',
			};
			mocks.fetchAllMock.mockResolvedValue({ resources: [profileDoc] });
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(200);
			const body = res.jsonBody as { profile: Record<string, unknown> };
			expect(body.profile.id).toBe('p1');
			expect(body.profile.displayName).toBe('Alice');
			expect(body.profile.githubUsername).toBe('alice');
		});

		it('strips profileVisibility from the 200 response (filter-only metadata)', async () => {
			mocks.fetchAllMock.mockResolvedValue({
				resources: [
					{
						id: 'p1',
						githubUsername: 'alice',
						displayName: 'Alice',
						bio: 'hi',
						skills: [],
						interests: [],
						availability: 'active',
						profileVisibility: 'public',
					},
				],
			});
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(200);
			const body = res.jsonBody as { profile: Record<string, unknown> };
			expect(body.profile).not.toHaveProperty('profileVisibility');
		});

		it('returns 500 when Cosmos config is missing', async () => {
			mocks.getCosmosConfigMock.mockReturnValueOnce(null);
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(500);
			expect(mocks.queryMock).not.toHaveBeenCalled();
		});

		it('returns 500 with a generic message when the Cosmos query throws', async () => {
			mocks.fetchAllMock.mockRejectedValue(new Error('network down'));
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(500);
			expect(res.jsonBody).toEqual({ error: 'Failed to load profile' });
		});

		it('targets the profiles container specifically', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(mocks.getContainerMock).toHaveBeenCalledWith('cs', 'db', 'profiles');
		});

		it('treats missing profileVisibility (legacy doc) as not-public (403)', async () => {
			// Legacy docs that predate #23 lack profileVisibility entirely.
			// profile-get backfills 'private' on read; this handler must
			// reach the same conclusion (anything-but-public = private).
			mocks.fetchAllMock.mockResolvedValue({
				resources: [
					{
						id: 'p1',
						githubUsername: 'alice',
						displayName: 'Alice',
						bio: 'hi',
						skills: [],
						interests: [],
						availability: 'active',
						// no profileVisibility field
					},
				],
			});
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(403);
		});
	});
});
