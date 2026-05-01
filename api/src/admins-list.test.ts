import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

const mocks = vi.hoisted(() => ({
	getClientPrincipalMock: vi.fn(),
}));

vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('./lib/principal', () => ({ getClientPrincipal: mocks.getClientPrincipalMock }));

import { adminsListHandler } from './admins-list';
import { FakeUserRepository } from './lib/users.fake';
import { userIdForGithub } from './lib/users';

const fakeRequest = {} as HttpRequest;
const fakeContext = { error: vi.fn() } as unknown as InvocationContext;
const adminPrincipal = {
	identityProvider: 'github',
	userId: 'u-rmjoia',
	userDetails: 'rmjoia',
	userRoles: ['authenticated', 'admin'],
	claims: [],
};

describe('GET /api/admins-list', () => {
	let repo: FakeUserRepository;

	beforeEach(() => {
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(adminPrincipal);
		repo = new FakeUserRepository();
	});

	it('rejects unauthenticated with 401', async () => {
		mocks.getClientPrincipalMock.mockReturnValueOnce(null);
		const res = await adminsListHandler(fakeRequest, fakeContext, repo);
		expect(res.status).toBe(401);
	});

	it('rejects non-admin with 403', async () => {
		mocks.getClientPrincipalMock.mockReturnValueOnce({ ...adminPrincipal, userRoles: ['authenticated'] });
		const res = await adminsListHandler(fakeRequest, fakeContext, repo);
		expect(res.status).toBe(403);
	});

	it('returns admins from the repo, stripping internal fields', async () => {
		await repo.upsert({
			id: userIdForGithub('rmjoia'),
			githubUsername: 'rmjoia',
			swaUserId: 'u-secret',
			roles: ['admin'],
			grantedBy: 'bootstrap',
			grantedAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
		});
		await repo.upsert({
			id: userIdForGithub('alice'),
			githubUsername: 'alice',
			roles: ['admin'],
			updatedAt: '2026-01-02T00:00:00Z',
		});
		// Non-admin user should be excluded
		await repo.upsert({
			id: userIdForGithub('bob'),
			githubUsername: 'bob',
			roles: [],
			updatedAt: '2026-01-03T00:00:00Z',
		});

		const res = await adminsListHandler(fakeRequest, fakeContext, repo);
		expect(res.status).toBe(200);
		const body = res.jsonBody as { admins: Array<Record<string, unknown>> };
		expect(body.admins).toHaveLength(2);
		const usernames = body.admins.map((a) => a.githubUsername).sort();
		expect(usernames).toEqual(['alice', 'rmjoia']);
		// swaUserId must not leak to the client
		body.admins.forEach((a) => {
			expect(a).not.toHaveProperty('swaUserId');
			expect(a).not.toHaveProperty('id');
		});
	});

	it('returns empty array when no admins exist', async () => {
		const res = await adminsListHandler(fakeRequest, fakeContext, repo);
		expect(res.status).toBe(200);
		expect((res.jsonBody as { admins: unknown[] }).admins).toEqual([]);
	});
});
