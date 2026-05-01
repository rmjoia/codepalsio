import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

const mocks = vi.hoisted(() => ({
	getClientPrincipalMock: vi.fn(),
}));

vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('./lib/principal', () => ({ getClientPrincipal: mocks.getClientPrincipalMock }));

import { adminsRevokeHandler } from './admins-revoke';
import { FakeUserRepository } from './lib/users.fake';
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

async function seedAdmin(repo: FakeUserRepository, username: string): Promise<void> {
	await repo.upsert({
		id: userIdForGithub(username),
		githubUsername: username,
		roles: ['admin'],
		updatedAt: '2026-01-01T00:00:00Z',
	});
}

describe('POST /api/admins-revoke', () => {
	let repo: FakeUserRepository;

	beforeEach(() => {
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(adminPrincipal);
		repo = new FakeUserRepository();
	});

	describe('authorization', () => {
		it('rejects unauthenticated with 401', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce(null);
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, repo);
			expect(res.status).toBe(401);
		});

		it('rejects non-admin with 403', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce({
				...adminPrincipal,
				userRoles: ['authenticated'],
			});
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, repo);
			expect(res.status).toBe(403);
		});
	});

	describe('input validation', () => {
		it('400 on invalid JSON body', async () => {
			const req = { json: () => Promise.reject(new Error('not json')) } as unknown as HttpRequest;
			const res = await adminsRevokeHandler(req, fakeContext, repo);
			expect(res.status).toBe(400);
		});

		it('400 when githubUsername fails the format check', async () => {
			const res = await adminsRevokeHandler(
				reqWith({ githubUsername: 'with space' }),
				fakeContext,
				repo
			);
			expect(res.status).toBe(400);
		});
	});

	describe('revoking', () => {
		it('404 when target has no record', async () => {
			await seedAdmin(repo, 'rmjoia');
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'ghost' }), fakeContext, repo);
			expect(res.status).toBe(404);
		});

		it("404 when target exists but isn't an admin", async () => {
			await seedAdmin(repo, 'rmjoia');
			await repo.upsert({
				id: userIdForGithub('alice'),
				githubUsername: 'alice',
				roles: [],
				updatedAt: '2026-01-01T00:00:00Z',
			});
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, repo);
			expect(res.status).toBe(404);
		});

		it('409 when revoking the last admin (locks nobody out)', async () => {
			await seedAdmin(repo, 'rmjoia');
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'rmjoia' }), fakeContext, repo);
			expect(res.status).toBe(409);
			// Record unchanged
			const after = await repo.findByGithubUsername('rmjoia');
			expect(after?.roles).toEqual(['admin']);
		});

		it('removes admin from a user with multiple admins around', async () => {
			await seedAdmin(repo, 'rmjoia');
			await seedAdmin(repo, 'alice');
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, repo);
			expect(res.status).toBe(200);
			const after = await repo.findByGithubUsername('alice');
			expect(after?.roles).toEqual([]);
		});

		it('preserves other roles when revoking only admin', async () => {
			await seedAdmin(repo, 'rmjoia');
			await repo.upsert({
				id: userIdForGithub('alice'),
				githubUsername: 'alice',
				roles: ['admin', 'moderator'],
				updatedAt: '2026-01-01T00:00:00Z',
			});
			await adminsRevokeHandler(reqWith({ githubUsername: 'alice' }), fakeContext, repo);
			const after = await repo.findByGithubUsername('alice');
			expect(after?.roles).toEqual(['moderator']);
		});

		it('lowercases input', async () => {
			await seedAdmin(repo, 'rmjoia');
			await seedAdmin(repo, 'alice');
			const res = await adminsRevokeHandler(reqWith({ githubUsername: 'ALICE' }), fakeContext, repo);
			expect(res.status).toBe(200);
		});
	});
});
