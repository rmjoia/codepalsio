import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

const mocks = vi.hoisted(() => ({
	getClientPrincipalMock: vi.fn(),
}));

vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('./lib/principal', () => ({ getClientPrincipal: mocks.getClientPrincipalMock }));

import { adminsListHandler } from './admins-list';
import { FakeUserRepository } from './lib/users.fake';
import { FakeAdminRosterRepository } from './lib/admin-roster.fake';
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
	let users: FakeUserRepository;
	let roster: FakeAdminRosterRepository;

	beforeEach(() => {
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(adminPrincipal);
		users = new FakeUserRepository();
		roster = new FakeAdminRosterRepository();
	});

	it('rejects unauthenticated with 401', async () => {
		mocks.getClientPrincipalMock.mockReturnValueOnce(null);
		const res = await adminsListHandler(fakeRequest, fakeContext, { users, roster });
		expect(res.status).toBe(401);
	});

	it('rejects non-admin with 403', async () => {
		mocks.getClientPrincipalMock.mockReturnValueOnce({ ...adminPrincipal, userRoles: ['authenticated'] });
		const res = await adminsListHandler(fakeRequest, fakeContext, { users, roster });
		expect(res.status).toBe(403);
	});

	it('returns admins from the roster, fanned out via user records, stripping internal fields', async () => {
		await users.upsert({
			id: userIdForGithub('rmjoia'),
			githubUsername: 'rmjoia',
			swaUserId: 'u-secret',
			roles: ['admin'],
			grantedBy: 'bootstrap',
			grantedAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
		});
		await users.upsert({
			id: userIdForGithub('alice'),
			githubUsername: 'alice',
			roles: ['admin'],
			grantedAt: '2026-01-02T00:00:00Z',
			updatedAt: '2026-01-02T00:00:00Z',
		});
		// Non-admin user — not in roster, must not appear.
		await users.upsert({
			id: userIdForGithub('bob'),
			githubUsername: 'bob',
			roles: [],
			updatedAt: '2026-01-03T00:00:00Z',
		});
		roster.seed([userIdForGithub('rmjoia'), userIdForGithub('alice')]);

		const res = await adminsListHandler(fakeRequest, fakeContext, { users, roster });
		expect(res.status).toBe(200);
		const body = res.jsonBody as { admins: Array<Record<string, unknown>> };
		expect(body.admins).toHaveLength(2);
		// Sorted by grantedAt DESC: alice (2026-01-02) before rmjoia (2026-01-01)
		expect(body.admins.map((a) => a.githubUsername)).toEqual(['alice', 'rmjoia']);
		body.admins.forEach((a) => {
			expect(a).not.toHaveProperty('swaUserId');
			expect(a).not.toHaveProperty('id');
		});
	});

	it('returns empty array when no admins exist (seeds empty roster on first read)', async () => {
		const res = await adminsListHandler(fakeRequest, fakeContext, { users, roster });
		expect(res.status).toBe(200);
		expect((res.jsonBody as { admins: unknown[] }).admins).toEqual([]);
	});

	it('seeds the roster from existing admin user records on first read', async () => {
		// Roster has never been written; legacy admin lives only in user records.
		await users.upsert({
			id: userIdForGithub('legacy'),
			githubUsername: 'legacy',
			roles: ['admin'],
			updatedAt: '2026-01-01T00:00:00Z',
		});
		const res = await adminsListHandler(fakeRequest, fakeContext, { users, roster });
		expect(res.status).toBe(200);
		expect((res.jsonBody as { admins: Array<{ githubUsername: string }> }).admins.map((a) => a.githubUsername)).toEqual(['legacy']);
		// Roster should now contain the seeded entry
		expect(roster.stored?.admins).toEqual([userIdForGithub('legacy')]);
	});

	it('surfaces a roster id even if its user record is missing (skeleton entry)', async () => {
		// Roster says alice is admin, but no user record exists (deleted out-of-band).
		roster.seed([userIdForGithub('alice')]);
		const res = await adminsListHandler(fakeRequest, fakeContext, { users, roster });
		expect(res.status).toBe(200);
		const body = res.jsonBody as { admins: Array<{ githubUsername: string }> };
		expect(body.admins).toEqual([{ githubUsername: 'alice', roles: ['admin'], updatedAt: '' }]);
	});

	it("ensures 'admin' is in the response roles even when the user record's roles is stale", async () => {
		// Roster says alice is admin (source of truth) but the user
		// record's roles array is stale — e.g. a prior revoke wrote the
		// roster, then the user-record cleanup failed, leaving a record
		// with no admin role. Without the fix, admins-list would return
		// alice in the admins array but with `roles: []`, contradicting
		// its own source of truth and confusing any client that inspects
		// the field.
		roster.seed([userIdForGithub('alice')]);
		await users.upsert({
			id: userIdForGithub('alice'),
			githubUsername: 'alice',
			roles: ['moderator'], // 'admin' missing — stale
			grantedAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
		});
		const res = await adminsListHandler(fakeRequest, fakeContext, { users, roster });
		expect(res.status).toBe(200);
		const body = res.jsonBody as { admins: Array<{ githubUsername: string; roles: string[] }> };
		expect(body.admins).toHaveLength(1);
		expect(body.admins[0].githubUsername).toBe('alice');
		expect(body.admins[0].roles.sort()).toEqual(['admin', 'moderator']);
	});
});
