import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

/**
 * Unit tests for the report-submit handler (spec 003 US2).
 *
 * Scope: the HTTP → validation → Cosmos handoff. Covers the full set of
 * acceptance scenarios from spec 003 US2 plus the edge cases called out
 * explicitly in the spec (self-report, nonexistent target).
 *
 * Mocking model mirrors profile-save.test.ts — hoisted mocks for the
 * SDK boundaries (principal, cosmos config, container, repository), SUT
 * imported after the mocks are registered.
 */
const mocks = vi.hoisted(() => ({
	upsertMock: vi.fn(),
	findByIdMock: vi.fn(),
	profilesQueryFetchAll: vi.fn(),
	getContainerMock: vi.fn(),
	getCosmosConfigMock: vi.fn(),
	getClientPrincipalMock: vi.fn(),
	createReportRepositoryMock: vi.fn(),
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

vi.mock('./lib/reports', async (importOriginal) => {
	// Keep the real `reportIdFor` + types + REPORT_REASONS exports; stub
	// only the repository factory. The deterministic id is part of the
	// contract being tested — mocking it out would defeat the dedup test.
	const actual = (await importOriginal()) as object;
	return {
		...actual,
		createReportRepository: mocks.createReportRepositoryMock,
	};
});

import { reportSubmitHandler } from './report-submit';
import { reportIdFor, DAY_MS } from './lib/reports';

const fakeContext = {
	log: vi.fn(),
	error: vi.fn(),
} as unknown as InvocationContext;

const authedPrincipal = {
	identityProvider: 'github',
	userId: 'reporter-swa-id',
	userDetails: 'reporter',
	userRoles: ['authenticated'],
	claims: [],
};

const reportedProfile = {
	id: 'profile-abc',
	userId: 'reported-swa-id',
	githubUsername: 'alice',
	displayName: 'Alice',
	skills: [],
	interests: [],
	availability: 'active' as const,
	profileVisibility: 'public' as const,
	updatedAt: '2026-10-01T00:00:00Z',
};

function makeRequest(body: unknown): HttpRequest {
	return { json: async () => body } as unknown as HttpRequest;
}

function validBody(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		reportedProfileId: 'profile-abc',
		reason: 'harassment',
		...over,
	};
}

describe('POST /api/report — reportSubmitHandler', () => {
	beforeEach(() => {
		mocks.upsertMock.mockReset();
		mocks.upsertMock.mockImplementation(async (record) => record);
		mocks.findByIdMock.mockReset();
		mocks.findByIdMock.mockResolvedValue(null); // default: no existing report
		mocks.profilesQueryFetchAll.mockReset();
		mocks.profilesQueryFetchAll.mockResolvedValue({ resources: [reportedProfile] });
		mocks.getContainerMock.mockReset();
		mocks.getContainerMock.mockReturnValue({
			// profilesContainer stub — returns the fixture profile by id.
			items: {
				query: () => ({ fetchAll: mocks.profilesQueryFetchAll }),
			},
		});
		mocks.getCosmosConfigMock.mockReset();
		mocks.getCosmosConfigMock.mockReturnValue({ connectionString: 'cs', database: 'db' });
		mocks.getClientPrincipalMock.mockReset();
		mocks.getClientPrincipalMock.mockReturnValue(authedPrincipal);
		mocks.createReportRepositoryMock.mockReset();
		mocks.createReportRepositoryMock.mockReturnValue({
			upsert: mocks.upsertMock,
			findById: mocks.findByIdMock,
			listOpen: vi.fn(),
		});
	});

	describe('auth + wiring', () => {
		it('returns 401 when no principal', async () => {
			mocks.getClientPrincipalMock.mockReturnValueOnce(null);
			const res = await reportSubmitHandler(makeRequest(validBody()), fakeContext);
			expect(res.status).toBe(401);
			expect(mocks.upsertMock).not.toHaveBeenCalled();
		});

		it('returns 500 when Cosmos config missing', async () => {
			mocks.getCosmosConfigMock.mockReturnValueOnce(null);
			const res = await reportSubmitHandler(makeRequest(validBody()), fakeContext);
			expect(res.status).toBe(500);
			expect(mocks.upsertMock).not.toHaveBeenCalled();
		});

		it('returns 400 on null body', async () => {
			const res = await reportSubmitHandler(makeRequest(null), fakeContext);
			expect(res.status).toBe(400);
		});

		it('returns 400 on array body', async () => {
			const res = await reportSubmitHandler(makeRequest(['x']), fakeContext);
			expect(res.status).toBe(400);
		});

		it('returns 400 on invalid JSON', async () => {
			const req = {
				json: async () => {
					throw new Error('bad json');
				},
			} as unknown as HttpRequest;
			const res = await reportSubmitHandler(req, fakeContext);
			expect(res.status).toBe(400);
		});
	});

	describe('body validation', () => {
		it('rejects a reason outside the allow-list', async () => {
			const res = await reportSubmitHandler(
				makeRequest(validBody({ reason: 'DOXXING' })),
				fakeContext
			);
			expect(res.status).toBe(400);
			expect((res.jsonBody as { error: string }).error).toMatch(/reason/i);
			expect(mocks.upsertMock).not.toHaveBeenCalled();
		});

		it('rejects missing reason', async () => {
			const res = await reportSubmitHandler(
				makeRequest({ reportedProfileId: 'profile-abc' }),
				fakeContext
			);
			expect(res.status).toBe(400);
		});

		it('rejects missing reportedProfileId', async () => {
			const res = await reportSubmitHandler(makeRequest({ reason: 'spam' }), fakeContext);
			expect(res.status).toBe(400);
		});

		it('rejects empty-string reportedProfileId', async () => {
			const res = await reportSubmitHandler(
				makeRequest(validBody({ reportedProfileId: '' })),
				fakeContext
			);
			expect(res.status).toBe(400);
		});

		it('silently truncates / normalises an overlong note', async () => {
			const longNote = 'x'.repeat(1000);
			const res = await reportSubmitHandler(
				makeRequest(validBody({ note: longNote })),
				fakeContext
			);
			// `trimmedString` caps at the max, so the note is stored
			// truncated rather than rejected. A reporter can't accidentally
			// make the server 400 by typing too much.
			expect(res.status).toBe(200);
			const upserted = mocks.upsertMock.mock.calls[0][0];
			expect(upserted.note?.length).toBeLessThanOrEqual(500);
		});

		it('elides an empty / whitespace-only note to undefined', async () => {
			const res = await reportSubmitHandler(makeRequest(validBody({ note: '   ' })), fakeContext);
			expect(res.status).toBe(200);
			const upserted = mocks.upsertMock.mock.calls[0][0];
			expect(upserted.note).toBeUndefined();
		});
	});

	describe('target-profile checks', () => {
		it('returns 404 when the reported profile does not exist', async () => {
			mocks.profilesQueryFetchAll.mockResolvedValueOnce({ resources: [] });
			const res = await reportSubmitHandler(makeRequest(validBody()), fakeContext);
			expect(res.status).toBe(404);
			expect(mocks.upsertMock).not.toHaveBeenCalled();
		});

		it('rejects self-report with 400 (spec 003 edge case)', async () => {
			// profile.userId === principal.userId → the reporter is the owner.
			mocks.profilesQueryFetchAll.mockResolvedValueOnce({
				resources: [{ ...reportedProfile, userId: authedPrincipal.userId }],
			});
			const res = await reportSubmitHandler(makeRequest(validBody()), fakeContext);
			expect(res.status).toBe(400);
			expect((res.jsonBody as { error: string }).error).toMatch(/own profile/i);
			expect(mocks.upsertMock).not.toHaveBeenCalled();
		});

		it('returns 500 if the profiles query throws', async () => {
			mocks.profilesQueryFetchAll.mockRejectedValueOnce(new Error('cosmos down'));
			const res = await reportSubmitHandler(makeRequest(validBody()), fakeContext);
			expect(res.status).toBe(500);
			expect(mocks.upsertMock).not.toHaveBeenCalled();
		});
	});

	describe('happy path + persistence shape', () => {
		it('creates a report with the right shape on first submission', async () => {
			const res = await reportSubmitHandler(
				makeRequest(validBody({ note: 'He asked me out.' })),
				fakeContext
			);
			expect(res.status).toBe(200);
			expect(res.jsonBody).toEqual({ success: true });

			expect(mocks.upsertMock).toHaveBeenCalledTimes(1);
			const upserted = mocks.upsertMock.mock.calls[0][0];
			expect(upserted).toMatchObject({
				reporterId: authedPrincipal.userId,
				reportedProfileId: reportedProfile.id,
				reportedUserId: reportedProfile.userId,
				reason: 'harassment',
				note: 'He asked me out.',
				status: 'open',
			});
			expect(upserted.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(upserted.updatedAt).toBeUndefined();
			expect(upserted.id).toMatch(/^report-/);
		});

		it('response is opaque — never leaks dedup / outcome signal (FR-113)', async () => {
			// First call — new row.
			const first = await reportSubmitHandler(makeRequest(validBody()), fakeContext);
			expect(first.jsonBody).toEqual({ success: true });

			// Second call — dedup upsert. Response is still identical.
			mocks.findByIdMock.mockResolvedValueOnce({
				id: 'report-x',
				reporterId: authedPrincipal.userId,
				reportedProfileId: reportedProfile.id,
				reportedUserId: reportedProfile.userId,
				reason: 'harassment',
				createdAt: '2026-10-01T00:00:00Z',
				status: 'open' as const,
			});
			const second = await reportSubmitHandler(makeRequest(validBody()), fakeContext);
			expect(second.jsonBody).toEqual({ success: true });
		});
	});

	describe('dedup / upsert semantics (FR-112)', () => {
		it('uses a deterministic id tied to (reporter, reported, UTC-day)', async () => {
			const now = Date.now();
			const expected = reportIdFor(authedPrincipal.userId, reportedProfile.id, now);
			await reportSubmitHandler(makeRequest(validBody()), fakeContext);
			const upserted = mocks.upsertMock.mock.calls[0][0];
			// Allow a few ms of drift between the test's Date.now() and the
			// handler's; both should land in the same day bucket in practice.
			const altExpected = reportIdFor(authedPrincipal.userId, reportedProfile.id, now + 100);
			expect([expected, altExpected]).toContain(upserted.id);
		});

		it('preserves createdAt and sets updatedAt on resubmission within the window', async () => {
			const existing = {
				id: 'report-x',
				reporterId: authedPrincipal.userId,
				reportedProfileId: reportedProfile.id,
				reportedUserId: reportedProfile.userId,
				reason: 'harassment' as const,
				createdAt: '2026-09-30T10:00:00Z',
				status: 'open' as const,
			};
			mocks.findByIdMock.mockResolvedValueOnce(existing);

			await reportSubmitHandler(
				makeRequest(validBody({ note: 'now with more context' })),
				fakeContext
			);
			const upserted = mocks.upsertMock.mock.calls[0][0];
			expect(upserted.createdAt).toBe('2026-09-30T10:00:00Z'); // preserved
			expect(upserted.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // fresh
			expect(upserted.note).toBe('now with more context'); // last-note-wins
		});

		it('does NOT reopen a resolved report on resubmission (admin decision stands)', async () => {
			// A moderator already dismissed this report. Reporter tries again.
			mocks.findByIdMock.mockResolvedValueOnce({
				id: 'report-x',
				reporterId: authedPrincipal.userId,
				reportedProfileId: reportedProfile.id,
				reportedUserId: reportedProfile.userId,
				reason: 'harassment' as const,
				createdAt: '2026-09-30T10:00:00Z',
				status: 'dismissed' as const,
				resolution: {
					adminId: 'admin-1',
					action: 'dismiss' as const,
					timestamp: '2026-09-30T11:00:00Z',
				},
			});
			await reportSubmitHandler(makeRequest(validBody()), fakeContext);
			const upserted = mocks.upsertMock.mock.calls[0][0];
			expect(upserted.status).toBe('dismissed');
			expect(upserted.resolution).toBeDefined();
		});

		it('different UTC-day buckets produce different ids (new row after 24h)', () => {
			const today = Date.UTC(2026, 9, 1, 12, 0, 0);
			const tomorrow = today + DAY_MS;
			const idToday = reportIdFor(authedPrincipal.userId, reportedProfile.id, today);
			const idTomorrow = reportIdFor(authedPrincipal.userId, reportedProfile.id, tomorrow);
			expect(idToday).not.toBe(idTomorrow);
		});
	});

	describe('upsert failures', () => {
		it('returns 500 if the upsert throws', async () => {
			mocks.upsertMock.mockRejectedValueOnce(new Error('conflict'));
			const res = await reportSubmitHandler(makeRequest(validBody()), fakeContext);
			expect(res.status).toBe(500);
		});

		it('returns 500 if the findById read throws', async () => {
			mocks.findByIdMock.mockRejectedValueOnce(new Error('cosmos down'));
			const res = await reportSubmitHandler(makeRequest(validBody()), fakeContext);
			expect(res.status).toBe(500);
			expect(mocks.upsertMock).not.toHaveBeenCalled();
		});
	});
});
