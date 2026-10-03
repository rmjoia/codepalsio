import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

/**
 * Unit tests for the report-resolve handler (spec 003 US3 — the POST
 * half of the moderation queue). Covers:
 *   - Auth + admin gating
 *   - Body validation (action allow-list, required fields)
 *   - Report-not-found + already-resolved paths
 *   - Self-protection (admin can't resolve a report against themselves)
 *   - Dismiss: status flips, audit written, profile untouched
 *   - Unlist: profile mutated with unlistedBy, status flips to resolved,
 *     audit written
 *   - Audit-failure soft-handling (log but don't roll back)
 */
const mocks = vi.hoisted(() => ({
	findByIdMock: vi.fn(),
	upsertReportMock: vi.fn(),
	appendAuditMock: vi.fn(),
	fetchProfileMock: vi.fn(),
	upsertProfileMock: vi.fn(),
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

import { reportResolveHandler, type ReportResolveRepos } from './report-resolve';
import type { ReportRecord } from './lib/reports';
import type { Profile } from './lib/types';

const fakeContext = {
	log: vi.fn(),
	error: vi.fn(),
} as unknown as InvocationContext;

const adminPrincipal = {
	identityProvider: 'github',
	userId: 'admin-1',
	userDetails: 'rmjoia',
	userRoles: ['authenticated', 'admin'],
	claims: [],
};

const sampleReport = (over: Partial<ReportRecord> = {}): ReportRecord => ({
	id: 'report-x',
	reporterId: 'reporter-1',
	reportedProfileId: 'profile-abc',
	reportedUserId: 'user-reported',
	reason: 'harassment',
	note: 'They were off-topic.',
	createdAt: '2026-10-01T10:00:00Z',
	status: 'open',
	...over,
});

const sampleProfile = (over: Partial<Profile> = {}): Profile => ({
	id: 'profile-abc',
	userId: 'user-reported',
	githubUsername: 'alice',
	displayName: 'Alice',
	bio: 'bio',
	skills: ['ts'],
	interests: ['rust'],
	availability: 'active',
	profileVisibility: 'public',
	...over,
});

function makeRepos(overrides: Partial<ReportResolveRepos> = {}): ReportResolveRepos {
	return {
		reports: {
			findById: mocks.findByIdMock,
			upsert: mocks.upsertReportMock,
		} as unknown as ReportResolveRepos['reports'],
		audit: { append: mocks.appendAuditMock } as unknown as ReportResolveRepos['audit'],
		users: {} as ReportResolveRepos['users'],
		roster: {} as ReportResolveRepos['roster'],
		verifyAdmin: mocks.verifyAdminMock,
		fetchProfile: mocks.fetchProfileMock,
		upsertProfile: mocks.upsertProfileMock,
		...overrides,
	};
}

function makeRequest(body: unknown): HttpRequest {
	return { json: async () => body } as unknown as HttpRequest;
}

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		reportId: 'report-x',
		reportedProfileId: 'profile-abc',
		action: 'dismiss',
		...over,
	};
}

describe('POST /api/report-resolve — reportResolveHandler', () => {
	beforeEach(() => {
		mocks.findByIdMock.mockReset();
		mocks.findByIdMock.mockResolvedValue(sampleReport());
		mocks.upsertReportMock.mockReset();
		mocks.upsertReportMock.mockImplementation(async (r) => r);
		mocks.appendAuditMock.mockReset();
		mocks.appendAuditMock.mockResolvedValue({});
		mocks.fetchProfileMock.mockReset();
		mocks.fetchProfileMock.mockResolvedValue(sampleProfile());
		mocks.upsertProfileMock.mockReset();
		mocks.upsertProfileMock.mockImplementation(async (p) => p);
		mocks.verifyAdminMock.mockReset();
		mocks.verifyAdminMock.mockResolvedValue(true);
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(adminPrincipal);
	});

	describe('auth', () => {
		it('returns 401 when no principal', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce(null);
			const res = await reportResolveHandler(makeRequest(validBody()), fakeContext, makeRepos());
			expect(res.status).toBe(401);
			expect(mocks.upsertReportMock).not.toHaveBeenCalled();
			expect(mocks.appendAuditMock).not.toHaveBeenCalled();
		});

		it('returns 403 when principal is not an admin', async () => {
			mocks.verifyAdminMock.mockResolvedValueOnce(false);
			const res = await reportResolveHandler(makeRequest(validBody()), fakeContext, makeRepos());
			expect(res.status).toBe(403);
			expect(mocks.upsertReportMock).not.toHaveBeenCalled();
		});
	});

	describe('body validation', () => {
		it.each([
			['missing reportId', { reportedProfileId: 'profile-abc', action: 'dismiss' }],
			['missing reportedProfileId', { reportId: 'report-x', action: 'dismiss' }],
			['missing action', { reportId: 'report-x', reportedProfileId: 'profile-abc' }],
			[
				'invalid action',
				{ reportId: 'report-x', reportedProfileId: 'profile-abc', action: 'nuke' },
			],
		])('rejects %s with 400', async (_label, body) => {
			const res = await reportResolveHandler(makeRequest(body), fakeContext, makeRepos());
			expect(res.status).toBe(400);
		});

		it('rejects suspend here (deferred to S5)', async () => {
			// S4 only implements dismiss + unlist. Suspend lands in S5 as
			// a separate reviewable slice. Pin the restriction here so a
			// future refactor doesn't accidentally activate suspend before
			// its enforcement layer (assertNotSuspended) is in place.
			const res = await reportResolveHandler(
				makeRequest(validBody({ action: 'suspend' })),
				fakeContext,
				makeRepos()
			);
			expect(res.status).toBe(400);
		});
	});

	describe('report lookup', () => {
		it('returns 404 when the report does not exist', async () => {
			mocks.findByIdMock.mockResolvedValueOnce(null);
			const res = await reportResolveHandler(makeRequest(validBody()), fakeContext, makeRepos());
			expect(res.status).toBe(404);
		});

		it('returns 409 when the report is already resolved', async () => {
			mocks.findByIdMock.mockResolvedValueOnce(sampleReport({ status: 'resolved' }));
			const res = await reportResolveHandler(makeRequest(validBody()), fakeContext, makeRepos());
			expect(res.status).toBe(409);
		});

		it('returns 409 when the report is already dismissed', async () => {
			mocks.findByIdMock.mockResolvedValueOnce(sampleReport({ status: 'dismissed' }));
			const res = await reportResolveHandler(makeRequest(validBody()), fakeContext, makeRepos());
			expect(res.status).toBe(409);
		});
	});

	describe('self-protection', () => {
		it('rejects when the admin is also the target (even to dismiss)', async () => {
			mocks.findByIdMock.mockResolvedValueOnce(
				sampleReport({ reportedUserId: adminPrincipal.userId })
			);
			const res = await reportResolveHandler(makeRequest(validBody()), fakeContext, makeRepos());
			expect(res.status).toBe(403);
			expect(mocks.upsertReportMock).not.toHaveBeenCalled();
			expect(mocks.appendAuditMock).not.toHaveBeenCalled();
		});
	});

	describe('dismiss', () => {
		it('flips status to dismissed, writes resolution + updatedAt, writes audit, does not touch profile', async () => {
			const res = await reportResolveHandler(makeRequest(validBody()), fakeContext, makeRepos());
			expect(res.status).toBe(200);
			expect(res.jsonBody).toMatchObject({ success: true, newStatus: 'dismissed' });

			const upserted = mocks.upsertReportMock.mock.calls[0][0];
			expect(upserted.status).toBe('dismissed');
			expect(upserted.resolution).toMatchObject({
				adminId: adminPrincipal.userId,
				action: 'dismiss',
			});
			expect(upserted.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

			// Audit row shape.
			expect(mocks.appendAuditMock).toHaveBeenCalledTimes(1);
			const auditEntry = mocks.appendAuditMock.mock.calls[0][0];
			expect(auditEntry).toMatchObject({
				adminId: adminPrincipal.userId,
				action: 'dismiss_report',
				reportId: 'report-x',
				targetProfileId: 'profile-abc',
				targetUserId: 'user-reported',
			});

			// Profile untouched on dismiss.
			expect(mocks.upsertProfileMock).not.toHaveBeenCalled();
		});
	});

	describe('unlist', () => {
		it('sets profileVisibility=private + unlistedBy=admin.userId, flips report to resolved, writes audit', async () => {
			const res = await reportResolveHandler(
				makeRequest(validBody({ action: 'unlist' })),
				fakeContext,
				makeRepos()
			);
			expect(res.status).toBe(200);
			expect(res.jsonBody).toMatchObject({ success: true, newStatus: 'resolved' });

			// Profile mutated.
			expect(mocks.upsertProfileMock).toHaveBeenCalledTimes(1);
			const mutated = mocks.upsertProfileMock.mock.calls[0][0];
			expect(mutated.profileVisibility).toBe('private');
			expect(mutated.unlistedBy).toBe(adminPrincipal.userId);
			expect(mutated.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

			// Report row flipped.
			const upserted = mocks.upsertReportMock.mock.calls[0][0];
			expect(upserted.status).toBe('resolved');
			expect(upserted.resolution.action).toBe('unlist');

			// Audit.
			const auditEntry = mocks.appendAuditMock.mock.calls[0][0];
			expect(auditEntry.action).toBe('unlist_profile');
		});

		it('returns 404 if the reported profile no longer exists', async () => {
			mocks.fetchProfileMock.mockResolvedValueOnce(null);
			const res = await reportResolveHandler(
				makeRequest(validBody({ action: 'unlist' })),
				fakeContext,
				makeRepos()
			);
			expect(res.status).toBe(404);
			expect(mocks.upsertReportMock).not.toHaveBeenCalled();
		});

		it('does not write audit or flip report when profile upsert fails', async () => {
			mocks.upsertProfileMock.mockRejectedValueOnce(new Error('cosmos down'));
			const res = await reportResolveHandler(
				makeRequest(validBody({ action: 'unlist' })),
				fakeContext,
				makeRepos()
			);
			expect(res.status).toBe(500);
			expect(mocks.upsertReportMock).not.toHaveBeenCalled();
			expect(mocks.appendAuditMock).not.toHaveBeenCalled();
		});
	});

	describe('audit failure soft-handling', () => {
		it('still returns 200 when audit append fails (action already committed)', async () => {
			// Rolling back the report-status flip after an audit failure
			// would require two-phase commit across containers (not
			// supported by Cosmos). The handler logs and returns success;
			// operators can reconstruct from the handler log.
			mocks.appendAuditMock.mockRejectedValueOnce(new Error('audit container down'));
			const res = await reportResolveHandler(makeRequest(validBody()), fakeContext, makeRepos());
			expect(res.status).toBe(200);
			expect(mocks.upsertReportMock).toHaveBeenCalledTimes(1);
			expect(fakeContext.error).toHaveBeenCalled();
		});
	});
});
