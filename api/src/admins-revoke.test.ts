import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

const mocks = vi.hoisted(() => ({
	getClientPrincipalMock: vi.fn(),
}));

vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('./lib/principal', () => ({ getClientPrincipal: mocks.getClientPrincipalMock }));

import { adminsRevokeHandler } from './admins-revoke';
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

async function seedAdmin(
	users: FakeUserRepository,
	roster: FakeAdminRosterRepository,
	username: string
): Promise<void> {
	await users.upsert({
		id: userIdForGithub(username),
		githubUsername: username,
		roles: ['admin'],
		updatedAt: '2026-01-01T00:00:00Z',
	});
	const current = roster.stored?.admins ?? [];
	roster.seed([...current, userIdForGithub(username)]);
}

describe('POST /api/admins-revoke', () => {
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
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(401);
		});

		it('rejects non-admin with 403', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce({
				...adminPrincipal,
				userRoles: ['authenticated'],
			});
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(403);
		});
	});

	describe('input validation', () => {
		it('400 on invalid JSON body', async () => {
			const req = { json: () => Promise.reject(new Error('not json')) } as unknown as HttpRequest;
			const res = await adminsRevokeHandler(req, fakeContext, { users, roster });
			expect(res.status).toBe(400);
		});

		it('400 when githubUsername fails the format check', async () => {
			const res = await adminsRevokeHandler(
				reqWith({ githubUsername: 'with space' }),
				fakeContext,
				{ users, roster }
			);
			expect(res.status).toBe(400);
		});
	});

	describe('revoking', () => {
		it('404 when target is not in the roster', async () => {
			await seedAdmin(users, roster, 'rmjoia');
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'ghost' }), fakeContext, { users, roster });
			expect(res.status).toBe(404);
		});

		it("404 when target user record exists but isn't in the roster", async () => {
			await seedAdmin(users, roster, 'rmjoia');
			await users.upsert({
				id: userIdForGithub('alice'),
				githubUsername: 'alice',
				roles: [],
				updatedAt: '2026-01-01T00:00:00Z',
			});
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(404);
		});

		it('409 when revoking the only admin in the roster', async () => {
			await seedAdmin(users, roster, 'rmjoia');
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'rmjoia' }), fakeContext, { users, roster });
			expect(res.status).toBe(409);
			// Roster unchanged
			expect(roster.stored?.admins).toEqual([userIdForGithub('rmjoia')]);
			// User record unchanged
			const after = await users.findByGithubUsername('rmjoia');
			expect(after?.roles).toEqual(['admin']);
		});

		it('removes admin from a user when there are multiple admins', async () => {
			await seedAdmin(users, roster, 'rmjoia');
			await seedAdmin(users, roster, 'alice');
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(200);
			expect(roster.stored?.admins).toEqual([userIdForGithub('rmjoia')]);
			const after = await users.findByGithubUsername('alice');
			expect(after?.roles).toEqual([]);
		});

		it('preserves other roles when revoking only admin', async () => {
			await seedAdmin(users, roster, 'rmjoia');
			await users.upsert({
				id: userIdForGithub('alice'),
				githubUsername: 'alice',
				roles: ['admin', 'moderator'],
				updatedAt: '2026-01-01T00:00:00Z',
			});
			roster.seed([userIdForGithub('rmjoia'), userIdForGithub('alice')]);
			await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			const after = await users.findByGithubUsername('alice');
			expect(after?.roles).toEqual(['moderator']);
		});

		it('lowercases input', async () => {
			await seedAdmin(users, roster, 'rmjoia');
			await seedAdmin(users, roster, 'alice');
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'ALICE' }), fakeContext, { users, roster });
			expect(res.status).toBe(200);
		});
	});

	describe('race-safe last-admin guard', () => {
		// The bug we set out to close: with the old per-record design,
		// two concurrent revokes of different "second-to-last" admins
		// could both see count > 1 and both succeed, leaving zero admins.
		// With CAS on the roster doc, only the first revoke wins; the
		// second re-reads the (now smaller) roster and trips the guard.
		it('retries through a synthetic etag bump and still succeeds when safe', async () => {
			await seedAdmin(users, roster, 'rmjoia');
			await seedAdmin(users, roster, 'alice');
			await seedAdmin(users, roster, 'bob');
			roster.simulateContention(1);
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(200);
			expect(roster.stored?.admins.sort()).toEqual([
				userIdForGithub('bob'),
				userIdForGithub('rmjoia'),
			]);
		});

		it('two concurrent revokes of different second-to-last admins cannot both succeed', async () => {
			// Two admins exist; two simultaneous revokes target different
			// admins. Without CAS, both would see count=2, both pass guard,
			// both write — leaving zero admins. With CAS, the second write
			// fails 412, retries, sees count=1, and trips the guard.
			await seedAdmin(users, roster, 'rmjoia');
			await seedAdmin(users, roster, 'alice');

			// Sequential here is fine — JS is single-threaded; we're proving
			// the RE-EVALUATION on retry trips the guard, not relying on
			// "coincidental" interleaving. The first revoke succeeds; the
			// second observes the post-write roster (1 admin) and 409s.
			const res1 = await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res1.status).toBe(200);
			expect(roster.stored?.admins).toEqual([userIdForGithub('rmjoia')]);

			const res2 = await adminsRevokeHandler(reqWith({ githubUsername: 'rmjoia' }), fakeContext, { users, roster });
			expect(res2.status).toBe(409);
			expect(roster.stored?.admins).toEqual([userIdForGithub('rmjoia')]);
		});

		it('returns 503 when contention exhausts the retry budget', async () => {
			await seedAdmin(users, roster, 'rmjoia');
			await seedAdmin(users, roster, 'alice');
			roster.simulateContention(10); // never resolves
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, { users, roster });
			expect(res.status).toBe(503);
		});
	});
});
