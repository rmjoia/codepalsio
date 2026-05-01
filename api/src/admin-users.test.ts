import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

// vi.hoisted so the mock factories below can capture these references.
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

import { adminUsersHandler, ADMIN_USERS_QUERY, ADMIN_PAGE_SIZE } from './admin-users';

const fakeRequest = {} as HttpRequest;
const fakeContext = { error: vi.fn() } as unknown as InvocationContext;

const adminPrincipal = {
	identityProvider: 'github',
	userId: 'admin-user-id',
	userDetails: 'rmjoia',
	userRoles: ['authenticated', 'admin'],
	claims: [],
};

const nonAdminPrincipal = {
	...adminPrincipal,
	userRoles: ['authenticated'],
};

describe('GET /api/admin-users', () => {
	beforeEach(() => {
		mocks.fetchAllMock.mockReset();
		mocks.queryMock.mockReset();
		mocks.queryMock.mockReturnValue({ fetchAll: mocks.fetchAllMock });
		mocks.getContainerMock.mockReset();
		mocks.getContainerMock.mockReturnValue({ items: { query: mocks.queryMock } });
		mocks.getCosmosConfigMock.mockReset();
		mocks.getCosmosConfigMock.mockReturnValue({ connectionString: 'cs', database: 'db' });
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(adminPrincipal);
	});

	describe('Cosmos query structural invariants', () => {
		it('caps with SELECT TOP', () => {
			expect(ADMIN_USERS_QUERY).toMatch(new RegExp(`SELECT\\s+TOP\\s+${ADMIN_PAGE_SIZE}\\b`));
		});

		it('aggregates lengths/counts in-DB rather than fetching arrays/text', () => {
			expect(ADMIN_USERS_QUERY).toContain('LENGTH(c.bio) AS bioLength');
			expect(ADMIN_USERS_QUERY).toContain('ARRAY_LENGTH(c.skills) AS skillsCount');
			expect(ADMIN_USERS_QUERY).toContain('ARRAY_LENGTH(c.interests) AS interestsCount');
		});

		it('does NOT project raw c.bio / c.skills / c.interests', () => {
			const selectClause = ADMIN_USERS_QUERY.split(/\bFROM\b/)[0];
			// Allow LENGTH(c.bio) but not bare c.bio in the SELECT.
			expect(selectClause).not.toMatch(/(?<!LENGTH\()\bc\.bio\b/);
			expect(selectClause).not.toMatch(/(?<!ARRAY_LENGTH\()\bc\.skills\b/);
			expect(selectClause).not.toMatch(/(?<!ARRAY_LENGTH\()\bc\.interests\b/);
		});

		it('orders by updatedAt DESC', () => {
			expect(ADMIN_USERS_QUERY).toMatch(/ORDER\s+BY\s+c\.updatedAt\s+DESC/i);
		});
	});

	describe('authorization', () => {
		it('rejects unauthenticated with 401', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce(null);
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			expect(res.status).toBe(401);
			expect(res.jsonBody).toEqual({ error: 'Not authenticated' });
			expect(mocks.queryMock).not.toHaveBeenCalled();
		});

		it('rejects authenticated non-admin with 403', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce(nonAdminPrincipal);
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			expect(res.status).toBe(403);
			expect(res.jsonBody).toEqual({ error: 'Forbidden' });
			expect(mocks.queryMock).not.toHaveBeenCalled();
		});

		it('accepts admin role', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [] });
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			expect(res.status).toBe(200);
			expect(mocks.queryMock).toHaveBeenCalledTimes(1);
		});
	});

	describe('error handling', () => {
		it('returns 500 when Cosmos config is missing', async () => {
			mocks.getCosmosConfigMock.mockReturnValueOnce(null);
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			expect(res.status).toBe(500);
			expect(res.jsonBody).toEqual({ error: 'Server configuration error' });
		});

		it('returns 500 with generic message when the Cosmos query throws', async () => {
			mocks.fetchAllMock.mockRejectedValue(new Error('network down'));
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			expect(res.status).toBe(500);
			expect(res.jsonBody).toEqual({ error: 'Failed to load admin users' });
		});
	});

	describe('completeness rules', () => {
		const completeRow = {
			id: 'p1',
			userId: 'u1',
			displayName: 'Alice',
			profileVisibility: 'public',
			availability: 'active',
			bioLength: 80,
			skillsCount: 3,
			interestsCount: 2,
			location: 'Cork',
			timezone: 'Europe/Dublin',
			updatedAt: '2026-04-01T00:00:00Z',
		};

		it('marks complete when bio≥50, skills≥2, interests≥2, has location + timezone', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [completeRow] });
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			const body = res.jsonBody as { profiles: { complete: boolean }[] };
			expect(body.profiles[0].complete).toBe(true);
		});

		it('marks incomplete when bio < 50', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [{ ...completeRow, bioLength: 49 }] });
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			const body = res.jsonBody as { profiles: { complete: boolean }[] };
			expect(body.profiles[0].complete).toBe(false);
		});

		it('marks incomplete when skills < 2', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [{ ...completeRow, skillsCount: 1 }] });
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			const body = res.jsonBody as { profiles: { complete: boolean }[] };
			expect(body.profiles[0].complete).toBe(false);
		});

		it('marks incomplete when interests < 2', async () => {
			mocks.fetchAllMock.mockResolvedValue({
				resources: [{ ...completeRow, interestsCount: 1 }],
			});
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			const body = res.jsonBody as { profiles: { complete: boolean }[] };
			expect(body.profiles[0].complete).toBe(false);
		});

		it('marks incomplete when location is missing', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [{ ...completeRow, location: undefined }] });
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			const body = res.jsonBody as { profiles: { complete: boolean }[] };
			expect(body.profiles[0].complete).toBe(false);
		});

		it('marks incomplete when timezone is missing', async () => {
			mocks.fetchAllMock.mockResolvedValue({ resources: [{ ...completeRow, timezone: undefined }] });
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			const body = res.jsonBody as { profiles: { complete: boolean }[] };
			expect(body.profiles[0].complete).toBe(false);
		});
	});

	describe('KPI aggregation', () => {
		it('counts public, private, and complete correctly across a mixed set', async () => {
			mocks.fetchAllMock.mockResolvedValue({
				resources: [
					// 2 public, 1 complete
					{ id: '1', userId: 'u1', displayName: 'A', profileVisibility: 'public', availability: 'active', bioLength: 80, skillsCount: 3, interestsCount: 3, location: 'X', timezone: 'Y', updatedAt: '' },
					{ id: '2', userId: 'u2', displayName: 'B', profileVisibility: 'public', availability: 'active', bioLength: 10, skillsCount: 1, interestsCount: 1, location: undefined, timezone: undefined, updatedAt: '' },
					// 2 private, 1 complete
					{ id: '3', userId: 'u3', displayName: 'C', profileVisibility: 'private', availability: 'casual', bioLength: 200, skillsCount: 5, interestsCount: 4, location: 'X', timezone: 'Y', updatedAt: '' },
					{ id: '4', userId: 'u4', displayName: 'D', profileVisibility: 'private', availability: 'unavailable', bioLength: 0, skillsCount: 0, interestsCount: 0, location: undefined, timezone: undefined, updatedAt: '' },
				],
			});
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			const body = res.jsonBody as { kpis: { totalProfiles: number; publicProfiles: number; privateProfiles: number; completeProfiles: number } };
			expect(body.kpis).toEqual({
				totalProfiles: 4,
				publicProfiles: 2,
				privateProfiles: 2,
				completeProfiles: 2,
			});
		});

		it('treats legacy docs without profileVisibility as private', async () => {
			mocks.fetchAllMock.mockResolvedValue({
				resources: [
					{ id: '1', userId: 'u1', displayName: 'Legacy', profileVisibility: undefined, availability: 'active', bioLength: 0, skillsCount: 0, interestsCount: 0, updatedAt: '' },
				],
			});
			const res = await adminUsersHandler(fakeRequest, fakeContext);
			const body = res.jsonBody as { profiles: { profileVisibility: string }[]; kpis: { publicProfiles: number; privateProfiles: number } };
			expect(body.profiles[0].profileVisibility).toBe('private');
			expect(body.kpis.privateProfiles).toBe(1);
			expect(body.kpis.publicProfiles).toBe(0);
		});
	});
});
