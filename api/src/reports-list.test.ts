import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

/**
 * Unit tests for the reports-list handler (spec 003 US3 — the GET half
 * of the moderation queue). Scope: auth gating + aggregation shape.
 */
const mocks = vi.hoisted(() => ({
	listOpenMock: vi.fn(),
	verifyAdminMock: vi.fn(),
	getClientPrincipalMock: vi.fn(),
}));

vi.mock('@azure/functions', () => ({
	app: { http: vi.fn() },
}));

vi.mock('./lib/cosmos', () => ({
	getContainer: vi.fn(),
	getCosmosConfig: vi.fn(() => ({ connectionString: 'cs', database: 'db' })),
	getCosmosClient: vi.fn(),
}));

vi.mock('./lib/principal', () => ({
	getClientPrincipal: mocks.getClientPrincipalMock,
}));

import { reportsListHandler, type ReportsListRepos } from './reports-list';
import type { ReportRecord } from './lib/reports';

const fakeContext = {
	log: vi.fn(),
	error: vi.fn(),
} as unknown as InvocationContext;

const authedPrincipal = {
	identityProvider: 'github',
	userId: 'admin-1',
	userDetails: 'rmjoia',
	userRoles: ['authenticated', 'admin'],
	claims: [],
};

function makeRequest(): HttpRequest {
	return {} as unknown as HttpRequest;
}

function makeRepos(overrides: Partial<ReportsListRepos> = {}): ReportsListRepos {
	return {
		reports: { listOpen: mocks.listOpenMock } as unknown as ReportsListRepos['reports'],
		users: {} as ReportsListRepos['users'],
		roster: {} as ReportsListRepos['roster'],
		verifyAdmin: mocks.verifyAdminMock,
		...overrides,
	};
}

const sampleReport = (over: Partial<ReportRecord> = {}): ReportRecord => ({
	id: 'report-1',
	reporterId: 'reporter-1',
	reportedProfileId: 'profile-abc',
	reportedUserId: 'user-reported',
	reason: 'harassment',
	note: 'They were rude.',
	createdAt: '2026-10-01T10:00:00Z',
	status: 'open',
	...over,
});

describe('GET /api/reports-list — reportsListHandler', () => {
	beforeEach(() => {
		mocks.listOpenMock.mockReset();
		mocks.listOpenMock.mockResolvedValue([]);
		mocks.verifyAdminMock.mockReset();
		mocks.verifyAdminMock.mockResolvedValue(true); // default: admin
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(authedPrincipal);
	});

	describe('auth', () => {
		it('returns 401 when no principal', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce(null);
			const res = await reportsListHandler(makeRequest(), fakeContext, makeRepos());
			expect(res.status).toBe(401);
			expect(mocks.listOpenMock).not.toHaveBeenCalled();
		});

		it('returns 403 when principal is not an admin', async () => {
			mocks.verifyAdminMock.mockResolvedValueOnce(false);
			const res = await reportsListHandler(makeRequest(), fakeContext, makeRepos());
			expect(res.status).toBe(403);
			expect(mocks.listOpenMock).not.toHaveBeenCalled();
		});

		it('calls verifyAdmin with the principal', async () => {
			await reportsListHandler(makeRequest(), fakeContext, makeRepos());
			expect(mocks.verifyAdminMock).toHaveBeenCalledWith(authedPrincipal);
		});
	});

	describe('happy path + aggregation', () => {
		it('returns an empty queue when there are no open reports', async () => {
			const res = await reportsListHandler(makeRequest(), fakeContext, makeRepos());
			expect(res.status).toBe(200);
			expect(res.jsonBody).toEqual({ reports: [] });
		});

		it('returns one entry per report when none target the same profile', async () => {
			mocks.listOpenMock.mockResolvedValueOnce([
				sampleReport({ id: 'r-a', reportedProfileId: 'p-1', createdAt: '2026-10-01T12:00:00Z' }),
				sampleReport({ id: 'r-b', reportedProfileId: 'p-2', createdAt: '2026-10-01T11:00:00Z' }),
			]);
			const res = await reportsListHandler(makeRequest(), fakeContext, makeRepos());
			const body = res.jsonBody as { reports: Array<{ id: string; reportCount: number }> };
			expect(body.reports.length).toBe(2);
			expect(body.reports.every((r) => r.reportCount === 1)).toBe(true);
		});

		it('aggregates multiple reports targeting the same profile into one row with reportCount > 1', async () => {
			// Three reports against p-1 from three different reporters.
			// Spec 003 edge case: surface as a single row with
			// reportCount: N for the admin spike indicator.
			mocks.listOpenMock.mockResolvedValueOnce([
				sampleReport({
					id: 'r-a',
					reporterId: 'rep-1',
					reportedProfileId: 'p-1',
					createdAt: '2026-10-01T12:00:00Z',
				}),
				sampleReport({
					id: 'r-b',
					reporterId: 'rep-2',
					reportedProfileId: 'p-1',
					createdAt: '2026-10-01T11:00:00Z',
				}),
				sampleReport({
					id: 'r-c',
					reporterId: 'rep-3',
					reportedProfileId: 'p-1',
					createdAt: '2026-10-01T10:00:00Z',
				}),
			]);
			const res = await reportsListHandler(makeRequest(), fakeContext, makeRepos());
			const body = res.jsonBody as { reports: Array<{ id: string; reportCount: number }> };
			expect(body.reports).toHaveLength(1);
			expect(body.reports[0].reportCount).toBe(3);
			// Newest-first — the aggregated row surfaces the most recent
			// report in the group.
			expect(body.reports[0].id).toBe('r-a');
		});

		it('orders aggregated rows by newest-report-first across profiles', async () => {
			mocks.listOpenMock.mockResolvedValueOnce([
				sampleReport({
					id: 'r-new',
					reportedProfileId: 'p-newer',
					createdAt: '2026-10-01T12:00:00Z',
				}),
				sampleReport({
					id: 'r-old',
					reportedProfileId: 'p-older',
					createdAt: '2026-10-01T09:00:00Z',
				}),
			]);
			const res = await reportsListHandler(makeRequest(), fakeContext, makeRepos());
			const body = res.jsonBody as { reports: Array<{ reportedProfileId: string }> };
			expect(body.reports[0].reportedProfileId).toBe('p-newer');
			expect(body.reports[1].reportedProfileId).toBe('p-older');
		});
	});

	describe('failures', () => {
		it('returns 500 if listOpen throws', async () => {
			mocks.listOpenMock.mockRejectedValueOnce(new Error('cosmos down'));
			const res = await reportsListHandler(makeRequest(), fakeContext, makeRepos());
			expect(res.status).toBe(500);
		});
	});
});
