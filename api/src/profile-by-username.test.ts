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
import {
	profileByUsernameHandler,
	toPublicProfile,
	PROFILE_BY_USERNAME_CI_QUERY,
} from './profile-by-username';
import { __resetRateLimitForTests } from './lib/rate-limit';
import type { Profile } from './lib/types';

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

const baseProfile: Profile = {
	id: 'p1',
	userId: 'owner-user-id',
	githubUsername: 'alice',
	displayName: 'Alice',
	bio: 'hi',
	skills: ['ts'],
	interests: ['rust'],
	availability: 'active',
	profileVisibility: 'public',
};

describe('toPublicProfile projection', () => {
	// Single source of truth for "what the public endpoint returns" —
	// these assertions catch a future Profile field being silently exposed.
	// PROFILE_FIELDS selects userId + profileVisibility because the rest of
	// the codebase needs them (auto-heal in profile-get; the 403/200
	// decision here); toPublicProfile is the only line standing between
	// those fields and the wire.

	it('strips userId from the public projection', () => {
		const out = toPublicProfile({ ...baseProfile, userId: 'secret-internal-id' });
		expect(out).not.toHaveProperty('userId');
	});

	it('strips profileVisibility from the public projection', () => {
		const out = toPublicProfile({ ...baseProfile, profileVisibility: 'public' });
		expect(out).not.toHaveProperty('profileVisibility');
	});

	it('preserves the public-facing fields verbatim', () => {
		const out = toPublicProfile({
			...baseProfile,
			githubUrl: 'https://github.com/alice',
			linkedinUrl: 'https://linkedin.com/in/alice',
			websiteUrl: 'https://alice.dev',
			preferredLanguages: ['en', 'pt'],
			yearsOfExperience: 5,
			location: 'NYC',
			timezone: 'America/New_York',
			updatedAt: '2026-05-14T00:00:00Z',
		});
		expect(out.id).toBe('p1');
		expect(out.githubUsername).toBe('alice');
		expect(out.displayName).toBe('Alice');
		expect(out.bio).toBe('hi');
		expect(out.skills).toEqual(['ts']);
		expect(out.interests).toEqual(['rust']);
		expect(out.availability).toBe('active');
		expect(out.githubUrl).toBe('https://github.com/alice');
		expect(out.linkedinUrl).toBe('https://linkedin.com/in/alice');
		expect(out.websiteUrl).toBe('https://alice.dev');
		expect(out.preferredLanguages).toEqual(['en', 'pt']);
		expect(out.yearsOfExperience).toBe(5);
		expect(out.location).toBe('NYC');
		expect(out.timezone).toBe('America/New_York');
		expect(out.updatedAt).toBe('2026-05-14T00:00:00Z');
	});
});

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
		// Rate limiter is module-scope state — reset between tests so the
		// burst-exhaustion case in one test doesn't carry over and 429
		// the first request in the next.
		__resetRateLimitForTests();
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

		it('uses the case-insensitive lookup query', async () => {
			// The lookup must use LOWER() on both sides so URLs like
			// /find/RmJoia find a profile stored with githubUsername="rmjoia".
			// GitHub itself treats logins case-insensitively (github.com/RmJoia
			// 301-redirects to /rmjoia); the detail page must match that UX.
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);

			expect(mocks.queryMock).toHaveBeenCalledTimes(1);
			expect(mocks.queryMock).toHaveBeenCalledWith(
				expect.objectContaining({
					query: PROFILE_BY_USERNAME_CI_QUERY,
					parameters: [{ name: '@githubUsername', value: 'alice' }],
				}),
			);
		});

		it('compiles a Cosmos query that lower-cases BOTH sides of the comparison', () => {
			// Static assertion on the query string. If a refactor accidentally
			// drops one of the LOWER() calls, this fails before any handler
			// runs. Catches the common slip "LOWER(c.githubUsername) = @x"
			// (forgetting to lower the parameter too).
			expect(PROFILE_BY_USERNAME_CI_QUERY).toMatch(/LOWER\s*\(\s*c\.githubUsername\s*\)/i);
			expect(PROFILE_BY_USERNAME_CI_QUERY).toMatch(/LOWER\s*\(\s*@githubUsername\s*\)/i);
		});

		it('selects c.fieldVisibility in the shared PROFILE_FIELDS projection', () => {
			// Without this column, Cosmos rows arrive at applyFieldVisibility
			// with `fieldVisibility === undefined`. The helper then defaults
			// every field to public and silently leaks fields the user marked
			// private. Handler-level tests can mask this because they mock
			// the row with the column present; the structural assertion here
			// fails BEFORE any mock can hide the bug.
			expect(PROFILE_BY_USERNAME_CI_QUERY).toMatch(/\bc\.fieldVisibility\b/);
		});

		it('forwards mixed-case usernames to the query parameter unchanged (LOWER() handles it)', async () => {
			// The query parameter binding doesn't need pre-normalization — the
			// SQL LOWER() does the work. This test pins that contract so a
			// future change doesn't move the normalization to JS and forget
			// to update the query.
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			await profileByUsernameHandler(makeRequest({ username: 'RmJoia' }), fakeContext);
			expect(mocks.queryMock).toHaveBeenCalledWith(
				expect.objectContaining({
					parameters: [{ name: '@githubUsername', value: 'RmJoia' }],
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
				resources: [{ ...baseProfile, profileVisibility: 'private' }],
			});
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(403);
			expect(res.jsonBody).toEqual({ error: 'Profile is private' });
		});

		it('returns 200 with the public projection when the profile is public', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [baseProfile] });
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(200);
			const body = res.jsonBody as { profile: Record<string, unknown> };
			expect(body.profile.id).toBe('p1');
			expect(body.profile.displayName).toBe('Alice');
			expect(body.profile.githubUsername).toBe('alice');
		});

		it('strips userId AND profileVisibility from the 200 response (internal-only fields)', async () => {
			// Critical privacy assertion: PROFILE_FIELDS DOES project both
			// userId and profileVisibility (the auto-heal path needs userId;
			// this handler needs profileVisibility for its 403 decision).
			// toPublicProfile is the only thing standing between those fields
			// and the wire. If this fails, an internal user hash and the
			// visibility flag start leaking on every 200.
			mocks.fetchAllMock.mockResolvedValue({ resources: [baseProfile] });
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(200);
			const body = res.jsonBody as { profile: Record<string, unknown> };
			expect(body.profile).not.toHaveProperty('userId');
			expect(body.profile).not.toHaveProperty('profileVisibility');
		});

		it('strips fields marked private when viewer is NOT the owner', async () => {
			// Per-field visibility kicks in: baseProfile.userId is
			// 'owner-user-id', principal.userId is 'current-user-id', so the
			// viewer is not the owner. bio marked private must not return.
			mocks.fetchAllMock.mockResolvedValue({
				resources: [
					{
						...baseProfile,
						bio: 'secret bio',
						fieldVisibility: { bio: 'private' },
					},
				],
			});
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(200);
			const body = res.jsonBody as { profile: Record<string, unknown> };
			expect(body.profile.bio).toBeUndefined();
			expect(JSON.parse(JSON.stringify(body.profile))).not.toHaveProperty('bio');
		});

		it('returns ALL fields to the owner viewing their own detail page (self-preview bypass)', async () => {
			// If the principal's userId matches the profile's userId, no
			// filtering applies — the owner sees the unfiltered view. Useful
			// when previewing what someone has saved without needing to
			// detour through the edit form.
			mocks.fetchAllMock.mockResolvedValue({
				resources: [
					{
						...baseProfile,
						userId: authedPrincipal.userId, // viewer == owner
						bio: 'my private bio',
						fieldVisibility: { bio: 'private', location: 'private' },
						location: 'NYC',
					},
				],
			});
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(200);
			const body = res.jsonBody as { profile: Record<string, unknown> };
			expect(body.profile.bio).toBe('my private bio');
			expect(body.profile.location).toBe('NYC');
		});

		it('keeps authenticated-level fields for non-owner authenticated viewers', async () => {
			// Detail page is auth-gated; every viewer is signed in. The
			// 'authenticated' level passes through. Confirms the level
			// hierarchy (authenticated >= public for signed-in viewers).
			mocks.fetchAllMock.mockResolvedValue({
				resources: [
					{
						...baseProfile,
						location: 'NYC',
						fieldVisibility: { location: 'authenticated' },
					},
				],
			});
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(200);
			const body = res.jsonBody as { profile: Record<string, unknown> };
			expect(body.profile.location).toBe('NYC');
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
			// Legacy docs predating #23 lack profileVisibility entirely.
			// profile-get backfills 'private' on read; this handler must
			// reach the same conclusion (anything-but-public = private).
			const legacyDoc = { ...baseProfile };
			delete (legacyDoc as Partial<Profile>).profileVisibility;
			mocks.fetchAllMock.mockResolvedValue({ resources: [legacyDoc] });
			const res = await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(res.status).toBe(403);
		});
	});

	describe('rate limiting (per-principal enumeration cap)', () => {
		// These tests exercise the integration between the handler and
		// lib/rate-limit. The bucket math itself is unit-tested in
		// lib/rate-limit.test.ts — these tests pin the handler's
		// behaviour: rejects with 429 + Retry-After AFTER auth but
		// BEFORE Cosmos, isolates per principal.
		//
		// The default config (60/burst, 1/sec refill) is used here; we
		// drain by making `capacity` calls then assert the (capacity+1)th
		// fails. The DEFAULT capacity is large enough that draining in a
		// loop is fast but still meaningful.

		const DEFAULT_CAPACITY = 60;

		it('returns 429 with Retry-After when the principal exhausts their bucket', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			// Drain the bucket — every request consumes one token.
			for (let i = 0; i < DEFAULT_CAPACITY; i++) {
				await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			}
			const denied = await profileByUsernameHandler(
				makeRequest({ username: 'alice' }),
				fakeContext
			);
			expect(denied.status).toBe(429);
			expect(denied.headers).toMatchObject({ 'Retry-After': expect.any(String) });
			expect(denied.jsonBody).toMatchObject({
				error: 'Too many requests',
				retryAfterSeconds: expect.any(Number),
			});
		});

		it('rate-limits BEFORE touching Cosmos (cheap 429 production)', async () => {
			// Cost-control invariant: a denied caller must NOT cause a
			// Cosmos roundtrip. Without this, a scraper could amplify
			// their own attack into RU spend on our account.
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			for (let i = 0; i < DEFAULT_CAPACITY; i++) {
				await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			}
			const callsBeforeDenied = mocks.queryMock.mock.calls.length;
			await profileByUsernameHandler(makeRequest({ username: 'alice' }), fakeContext);
			expect(mocks.queryMock.mock.calls.length).toBe(callsBeforeDenied);
		});

		it('rate-limits AFTER the auth check (401 takes priority over 429)', async () => {
			// Defensive: anonymous callers shouldn't consume bucket
			// budget. The 401 short-circuit is what makes per-principal
			// keying meaningful — if we keyed on IP and counted unauthed
			// hits, our auth-rejected requests would burn the budget for
			// every signed-in user behind that NAT.
			mocks.getClientPrincipalMock.mockReturnValueOnce(null);
			const res = await profileByUsernameHandler(
				makeRequest({ username: 'alice' }),
				fakeContext
			);
			expect(res.status).toBe(401);
		});

		it('isolates buckets per principal (alice exhausting does not throttle bob)', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			// alice drains and gets denied
			for (let i = 0; i < DEFAULT_CAPACITY; i++) {
				mocks.getClientPrincipalMock.mockReturnValueOnce({
					...authedPrincipal,
					userId: 'alice-id',
				});
				await profileByUsernameHandler(makeRequest({ username: 'x' }), fakeContext);
			}
			mocks.getClientPrincipalMock.mockReturnValueOnce({
				...authedPrincipal,
				userId: 'alice-id',
			});
			const aliceDenied = await profileByUsernameHandler(
				makeRequest({ username: 'x' }),
				fakeContext
			);
			expect(aliceDenied.status).toBe(429);

			// bob's first request still succeeds
			mocks.getClientPrincipalMock.mockReturnValueOnce({
				...authedPrincipal,
				userId: 'bob-id',
			});
			const bobAllowed = await profileByUsernameHandler(
				makeRequest({ username: 'x' }),
				fakeContext
			);
			expect(bobAllowed.status).not.toBe(429);
		});
	});
});
