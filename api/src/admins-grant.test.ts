import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

const mocks = vi.hoisted(() => ({
	getClientPrincipalMock: vi.fn(),
}));

vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('./lib/principal', () => ({ getClientPrincipal: mocks.getClientPrincipalMock }));

import { adminsGrantHandler } from './admins-grant';
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

describe('POST /api/admins-grant', () => {
	let repo: FakeUserRepository;

	beforeEach(() => {
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(adminPrincipal);
		repo = new FakeUserRepository();
	});

	describe('authorization', () => {
		it('rejects unauthenticated with 401', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce(null);
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, repo);
			expect(res.status).toBe(401);
			expect(repo.store.size).toBe(0);
		});

		it('rejects non-admin with 403', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce({
				...adminPrincipal,
				userRoles: ['authenticated'],
			});
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, repo);
			expect(res.status).toBe(403);
			expect(repo.store.size).toBe(0);
		});
	});

	describe('input validation', () => {
		it('400 on invalid JSON body', async () => {
			const req = { json: () => Promise.reject(new Error('not json')) } as unknown as HttpRequest;
			const res = await adminsGrantHandler(req, fakeContext, repo);
			expect(res.status).toBe(400);
		});

		it('400 when githubUsername is missing', async () => {
			const res = await adminsGrantHandler(reqWith({}), fakeContext, repo);
			expect(res.status).toBe(400);
		});

		it('400 when githubUsername is non-string', async () => {
			const res = await adminsGrantHandler(reqWith({ githubUsername: 42 }), fakeContext, repo);
			expect(res.status).toBe(400);
		});

		it('400 when githubUsername fails the format check', async () => {
			for (const bad of ['-leading', 'trailing-', 'with space', 'a/b', '', 'a'.repeat(40)]) {
				const res = await adminsGrantHandler(reqWith({ githubUsername: bad }), fakeContext, repo);
				expect(res.status, `bad input: ${bad}`).toBe(400);
			}
		});
	});

	describe('granting', () => {
		it('creates a new record when the user has none', async () => {
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, repo);
			expect(res.status).toBe(200);
			const stored = await repo.findByGithubUsername('alice');
			expect(stored?.roles).toEqual(['admin']);
			expect(stored?.grantedBy).toBe(userIdForGithub('rmjoia'));
			expect(stored?.id).toBe(userIdForGithub('alice'));
		});

		it('lowercases the input so user records collapse on case differences', async () => {
			await adminsGrantHandler(reqWith({ githubUsername: 'Alice' }), fakeContext, repo);
			expect(await repo.findByGithubUsername('alice')).not.toBeNull();
			expect(repo.store.size).toBe(1);
		});

		it('is idempotent — granting an existing admin returns 200 without changing roles', async () => {
			await repo.upsert({
				id: userIdForGithub('alice'),
				githubUsername: 'alice',
				roles: ['admin'],
				grantedBy: 'previous-granter',
				updatedAt: '2026-01-01T00:00:00Z',
			});
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, repo);
			expect(res.status).toBe(200);
			const stored = await repo.findByGithubUsername('alice');
			expect(stored?.roles).toEqual(['admin']);
			// grantedBy NOT overwritten on idempotent re-grant
			expect(stored?.grantedBy).toBe('previous-granter');
		});

		it('adds admin role to a user who has other roles already', async () => {
			await repo.upsert({
				id: userIdForGithub('alice'),
				githubUsername: 'alice',
				roles: ['moderator'],
				updatedAt: '2026-01-01T00:00:00Z',
			});
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, repo);
			expect(res.status).toBe(200);
			const stored = await repo.findByGithubUsername('alice');
			expect(stored?.roles?.sort()).toEqual(['admin', 'moderator']);
		});

		it('does not leak swaUserId in the response', async () => {
			await repo.upsert({
				id: userIdForGithub('alice'),
				githubUsername: 'alice',
				swaUserId: 'should-not-leak',
				roles: ['admin'],
				updatedAt: '2026-01-01T00:00:00Z',
			});
			const res = await adminsGrantHandler(reqWith({ githubUsername: 'alice' }), fakeContext, repo);
			expect(res.jsonBody).toBeDefined();
			const body = res.jsonBody as { admin: Record<string, unknown> };
			expect(body.admin).not.toHaveProperty('swaUserId');
		});
	});
});
