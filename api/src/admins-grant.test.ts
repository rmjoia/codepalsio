import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

const mocks = vi.hoisted(() => ({
	getClientPrincipalMock: vi.fn(),
}));

vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('./lib/principal', () => ({ getClientPrincipal: mocks.getClientPrincipalMock }));

import { adminsGrantHandler } from './admins-grant';
import { FakeUserRepository } from './lib/users.fake';
import { FakeAdminRosterRepository } from './lib/admin-roster.fake';
import { userIdForGithub } from './lib/users';

const fakeContext = { error: vi.fn() } as unknown as InvocationContext;
const adminPrincipal = {
	identityProvider: 'github',
	userId: 'u-rmjoia',
	userDetails: 'rmjoia',
	userRoles: ['authenticated', 'admin'],
	claims: [],
};

function reqWith(body: unknown): HttpRequest {
	return { json: () => Promise.resolve(body) } as unknown as HttpRequest;
}

describe('POST /api/admins-grant', () => {
	let users: FakeUserRepository;
	let roster: FakeAdminRosterRepository;

	beforeEach(() => {
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(adminPrincipal);
		users = new FakeUserRepository();
		roster = new FakeAdminRosterRepository();
	});

	describe('authorization', () => {
		it('rejects unauthenticated with 401', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce(null);
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(401);
			expect(users.store.size).toBe(0);
			expect(roster.writes).toBe(0);
		});

		it('rejects non-admin with 403', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce({
				...adminPrincipal,
				userRoles: ['authenticated'],
			});
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(403);
			expect(users.store.size).toBe(0);
			expect(roster.writes).toBe(0);
		});
	});

	describe('input validation', () => {
		it('400 on invalid JSON body', async () => {
			const req = { json: () => Promise.reject(new Error('not json')) } as unknown as HttpRequest;
			const res = await adminsGrantHandler(req, fakeContext, { users, roster });
			expect(res.status).toBe(400);
		});

		it('400 when githubUsername is missing', async () => {
			const res = await adminsGrantHandler(reqWith({}), fakeContext, { users, roster });
			expect(res.status).toBe(400);
		});

		it('400 when githubUsername is non-string', async () => {
			const res = await adminsGrantHandler(reqWith({ githubUsername: 42 }), fakeContext, { users, roster });
			expect(res.status).toBe(400);
		});

		it('400 when githubUsername fails the format check', async () => {
			for (const bad of ['-leading', 'trailing-', 'with space', 'a/b', '', 'a'.repeat(40)]) {
				const res = await adminsGrantHandler(reqWith({ githubUsername: bad }), fakeContext, { users, roster });
				expect(res.status, `bad input: ${bad}`).toBe(400);
			}
		});
	});

	describe('granting', () => {
		it('adds the user to the roster and creates a user record', async () => {
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(200);
			const stored = await users.findByGithubUsername('alice');
			expect(stored?.roles).toEqual(['admin']);
			expect(stored?.grantedBy).toBe(userIdForGithub('rmjoia'));
			expect(roster.stored?.admins).toContain(userIdForGithub('alice'));
		});

		it('lowercases the input so user records collapse on case differences', async () => {
			await adminsGrantHandler(reqWith({ githubUsername: 'Alice' }), fakeContext, { users, roster });
			expect(await users.findByGithubUsername('alice')).not.toBeNull();
			expect(users.store.size).toBe(1);
			expect(roster.stored?.admins).toEqual([userIdForGithub('alice')]);
		});

		it('is idempotent — granting an existing admin returns 200 without changing state', async () => {
			roster.seed([userIdForGithub('alice')]);
			await users.upsert({
				id: userIdForGithub('alice'),
				githubUsername: 'alice',
				roles: ['admin'],
				grantedBy: 'previous-granter',
				updatedAt: '2026-01-01T00:00:00Z',
			});
			const writesBefore = roster.writes;
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(200);
			const stored = await users.findByGithubUsername('alice');
			expect(stored?.roles).toEqual(['admin']);
			// grantedBy NOT overwritten on idempotent re-grant
			expect(stored?.grantedBy).toBe('previous-granter');
			// Roster is unchanged — abort path skipped the write
			expect(roster.writes).toBe(writesBefore);
		});

		it('adds admin role to a user who has other roles already', async () => {
			await users.upsert({
				id: userIdForGithub('alice'),
				githubUsername: 'alice',
				roles: ['moderator'],
				updatedAt: '2026-01-01T00:00:00Z',
			});
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(200);
			const stored = await users.findByGithubUsername('alice');
			expect(stored?.roles?.sort()).toEqual(['admin', 'moderator']);
			expect(roster.stored?.admins).toContain(userIdForGithub('alice'));
		});

		it('does not leak swaUserId in the response', async () => {
			roster.seed([userIdForGithub('alice')]);
			await users.upsert({
				id: userIdForGithub('alice'),
				githubUsername: 'alice',
				swaUserId: 'should-not-leak',
				roles: ['admin'],
				updatedAt: '2026-01-01T00:00:00Z',
			});
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.jsonBody).toBeDefined();
			const body = res.jsonBody as { admin: Record<string, unknown> };
			expect(body.admin).not.toHaveProperty('swaUserId');
		});
	});

	describe('roster contention', () => {
		it('retries through transient stale-etag and succeeds', async () => {
			roster.seed([userIdForGithub('seed-admin')]);
			roster.simulateContention(1); // one synthetic etag bump on next write
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(200);
			expect(roster.stored?.admins).toContain(userIdForGithub('alice'));
		});

		it('returns 503 when the roster stays contended past the retry budget', async () => {
			roster.seed([userIdForGithub('seed-admin')]);
			roster.simulateContention(10); // never resolves
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(503);
		});
	});

	describe('idempotency repair (recovers from prior partial failures)', () => {
		// Scenario: a previous grant succeeded at the roster step but
		// failed before / during the user record upsert. State: roster
		// has the user; record either is missing or has stale roles.
		// A retry must converge to a consistent state, not just rubber-
		// stamp the inconsistency.

		it('creates a missing user record when the roster already lists the user as admin', async () => {
			roster.seed([userIdForGithub('alice')]);
			// No user record exists yet (prior upsert failed).
			expect(await users.findByGithubUsername('alice')).toBeNull();

			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(200);
			const stored = await users.findByGithubUsername('alice');
			expect(stored?.roles).toEqual(['admin']);
			expect(stored?.grantedBy).toBe(userIdForGithub('rmjoia'));
		});

		it("repairs a stale user record whose roles[] doesn't include 'admin'", async () => {
			roster.seed([userIdForGithub('alice')]);
			// Existing record has stale roles (prior upsert never landed
			// the admin role, or the record predates roster integration).
			await users.upsert({
				id: userIdForGithub('alice'),
				githubUsername: 'alice',
				roles: ['moderator'],
				updatedAt: '2025-12-01T00:00:00Z',
			});

			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(200);
			const stored = await users.findByGithubUsername('alice');
			expect(stored?.roles?.sort()).toEqual(['admin', 'moderator']);
			expect(stored?.grantedBy).toBe(userIdForGithub('rmjoia'));
		});
	});
});
