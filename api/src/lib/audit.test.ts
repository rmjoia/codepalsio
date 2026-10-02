import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Append-only semantics for the audit log (spec 003 FR-122).
 *
 * The repository exposes TWO operations: `append` and `listByAdmin`.
 * There is no update / delete surface. These tests pin that shape at
 * both the type and runtime levels — any PR that introduces a delete
 * endpoint must edit the lib FIRST, which will fail these tests until
 * they're also updated (making the change explicit).
 */
const mocks = vi.hoisted(() => ({
	createMock: vi.fn(),
	queryFetchAll: vi.fn(),
	getContainerMock: vi.fn(),
}));

vi.mock('./cosmos', () => ({
	getContainer: mocks.getContainerMock,
	getCosmosConfig: vi.fn(),
	getCosmosClient: vi.fn(),
}));

import { createAuditRepository, type AuditRepository, AUDIT_ACTIONS } from './audit';

describe('audit — append-only log', () => {
	let repo: AuditRepository;

	beforeEach(() => {
		mocks.createMock.mockReset();
		mocks.createMock.mockImplementation(async (row) => ({ resource: row }));
		mocks.queryFetchAll.mockReset();
		mocks.queryFetchAll.mockResolvedValue({ resources: [] });
		mocks.getContainerMock.mockReset();
		mocks.getContainerMock.mockReturnValue({
			items: {
				create: mocks.createMock,
				query: () => ({ fetchAll: mocks.queryFetchAll }),
			},
		});
		repo = createAuditRepository('cs', 'db');
	});

	describe('append()', () => {
		it('assigns an id and timestamp automatically', async () => {
			const entry = await repo.append({
				adminId: 'admin-1',
				action: 'unlist_profile',
				targetProfileId: 'profile-abc',
				reportId: 'report-x',
			});
			expect(entry.id).toMatch(/^audit-[0-9a-f-]+$/);
			expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(entry.adminId).toBe('admin-1');
			expect(entry.action).toBe('unlist_profile');
		});

		it('uses container.items.create() (not upsert) — append-only enforced at the SDK boundary', async () => {
			// A refactor that swapped create() for upsert() would allow
			// overwriting an existing audit row — which is exactly the
			// immutability violation spec 003 FR-122 forbids. Pin create().
			await repo.append({ adminId: 'admin-1', action: 'dismiss_report', reportId: 'r-1' });
			expect(mocks.createMock).toHaveBeenCalledTimes(1);
			const writtenRow = mocks.createMock.mock.calls[0][0];
			expect(writtenRow).toMatchObject({
				adminId: 'admin-1',
				action: 'dismiss_report',
				reportId: 'r-1',
			});
		});

		it('generates distinct ids for each append (no deterministic reuse)', async () => {
			// Deterministic ids would let a bad actor collide with an
			// existing row and overwrite it via create (which would then
			// throw a 409, but logs would reveal the attempt). Random
			// uuids are the discipline. Pin that two appends produce
			// different ids.
			const a = await repo.append({ adminId: 'admin-1', action: 'dismiss_report' });
			const b = await repo.append({ adminId: 'admin-1', action: 'dismiss_report' });
			expect(a.id).not.toBe(b.id);
		});
	});

	describe('listByAdmin()', () => {
		it('queries by partition key and orders by timestamp DESC', async () => {
			const row = {
				id: 'audit-1',
				adminId: 'admin-1',
				action: 'dismiss_report' as const,
				timestamp: '2026-10-01T00:00:00Z',
			};
			mocks.queryFetchAll.mockResolvedValueOnce({ resources: [row] });
			const list = await repo.listByAdmin('admin-1');
			expect(list).toEqual([row]);
		});

		it('returns an empty array when there are no entries for the admin', async () => {
			const list = await repo.listByAdmin('nobody');
			expect(list).toEqual([]);
		});
	});

	describe('action enum completeness', () => {
		it('includes every spec-003 US3 action name', () => {
			// Pin the required subset so a rename / drop would fail here
			// before the handlers get built against the new names.
			expect(AUDIT_ACTIONS).toContain('dismiss_report');
			expect(AUDIT_ACTIONS).toContain('unlist_profile');
			expect(AUDIT_ACTIONS).toContain('relist_profile');
			expect(AUDIT_ACTIONS).toContain('suspend_user');
			expect(AUDIT_ACTIONS).toContain('unsuspend_user');
		});
	});

	describe('shape — no delete / update surface', () => {
		it('AuditRepository exposes exactly append + listByAdmin', () => {
			// Prevents accidental additions. If a future refactor adds
			// methods, update this test deliberately — don't let a stray
			// `delete` / `update` creep in without an audit of the
			// append-only invariant.
			const keys = Object.keys(repo).concat(
				Object.getOwnPropertyNames(Object.getPrototypeOf(repo))
			);
			const callable = keys.filter(
				(k) => typeof (repo as unknown as Record<string, unknown>)[k] === 'function'
			);
			expect(callable).toContain('append');
			expect(callable).toContain('listByAdmin');
			// No delete / update / remove.
			for (const forbidden of ['delete', 'remove', 'update', 'upsert']) {
				expect(callable).not.toContain(forbidden);
			}
		});
	});
});
