import { describe, it, expect, beforeEach } from 'vitest';
import { FakeUserRepository } from './users.fake';
import { userIdForGithub, type UserRecord } from './users';

/**
 * Tests for the dual lookup APIs on UserRepository:
 *   - findByGithubUsername — point-read on `gh-<username>`. Misses
 *     legacy/old-shape records whose id is the SWA principal hash.
 *   - findByGithubUsernameAcrossShapes — point-read first, then
 *     cross-partition query as fallback. Used by the profile
 *     auto-heal to discover the OLD userId hash hidden in legacy
 *     user records.
 *
 * The fake (`FakeUserRepository`) mirrors production semantics: a
 * doc whose `githubUsername` field matches but whose id is NOT
 * `gh-<username>` is invisible to the point-read, just like in
 * Cosmos.
 */

const newShape = (over: Partial<UserRecord> = {}): UserRecord => ({
	id: userIdForGithub('rmjoia'),
	githubUsername: 'rmjoia',
	roles: ['admin'],
	updatedAt: '2026-05-03T00:00:00Z',
	...over,
});

const oldShape = (over: Partial<UserRecord> = {}): UserRecord => ({
	// Pre-#32 records used the SWA principal hash directly as the id
	// (and as the partition key, which is `/id` on the users container).
	id: '59298c758a6f409c83d05d9f0bce90c9',
	githubUsername: 'rmjoia',
	roles: [],
	updatedAt: '2025-11-24T17:25:15Z',
	...over,
});

describe('findByGithubUsername (point-read by gh-<username>)', () => {
	let repo: FakeUserRepository;

	beforeEach(() => {
		repo = new FakeUserRepository();
	});

	it('returns the new-shape record when present', async () => {
		repo.store.set(userIdForGithub('rmjoia'), newShape());
		const r = await repo.findByGithubUsername('rmjoia');
		expect(r).not.toBeNull();
		expect(r?.id).toBe('gh-rmjoia');
	});

	it('returns null when no record exists', async () => {
		const r = await repo.findByGithubUsername('rmjoia');
		expect(r).toBeNull();
	});

	it('returns null for a legacy record (id is NOT gh-<username>)', async () => {
		// This is the bug: the old-shape record exists, has the matching
		// githubUsername field, but the point-read on `gh-rmjoia` misses
		// it entirely. Documented behaviour — that's what
		// findByGithubUsernameAcrossShapes is for.
		repo.store.set('59298c758a6f409c83d05d9f0bce90c9', oldShape());
		const r = await repo.findByGithubUsername('rmjoia');
		expect(r).toBeNull();
	});

	it('lowercases the input username for lookup', async () => {
		repo.store.set(userIdForGithub('rmjoia'), newShape());
		const r = await repo.findByGithubUsername('RmJoia');
		expect(r?.id).toBe('gh-rmjoia');
	});
});

describe('findByGithubUsernameAcrossShapes (point-read + cross-partition fallback)', () => {
	let repo: FakeUserRepository;

	beforeEach(() => {
		repo = new FakeUserRepository();
	});

	it('returns the new-shape record via the fast path when present', async () => {
		repo.store.set(userIdForGithub('rmjoia'), newShape());
		const r = await repo.findByGithubUsernameAcrossShapes('rmjoia');
		expect(r?.id).toBe('gh-rmjoia');
	});

	it('returns the legacy record via the fallback when no new-shape exists', async () => {
		repo.store.set('59298c758a6f409c83d05d9f0bce90c9', oldShape());
		const r = await repo.findByGithubUsernameAcrossShapes('rmjoia');
		expect(r).not.toBeNull();
		expect(r?.id).toBe('59298c758a6f409c83d05d9f0bce90c9');
		expect(r?.githubUsername).toBe('rmjoia');
	});

	it('prefers the new-shape record when both new- and old-shape exist for the same user', async () => {
		// During a gradual migration both can coexist. The point-read
		// short-circuits before the fallback runs, so the new-shape doc
		// wins.
		repo.store.set(userIdForGithub('rmjoia'), newShape());
		repo.store.set('59298c758a6f409c83d05d9f0bce90c9', oldShape());
		const r = await repo.findByGithubUsernameAcrossShapes('rmjoia');
		expect(r?.id).toBe('gh-rmjoia');
	});

	it('matches the legacy record case-insensitively on githubUsername', async () => {
		repo.store.set('59298c758a6f409c83d05d9f0bce90c9', oldShape({ githubUsername: 'RmJoia' }));
		const r = await repo.findByGithubUsernameAcrossShapes('rmjoia');
		expect(r?.id).toBe('59298c758a6f409c83d05d9f0bce90c9');
	});

	it('returns null when no doc matches at all', async () => {
		repo.store.set(userIdForGithub('someoneelse'), newShape({ githubUsername: 'someoneelse' }));
		const r = await repo.findByGithubUsernameAcrossShapes('rmjoia');
		expect(r).toBeNull();
	});

	it('picks the most-recently-updated legacy record when multiple exist (defensive)', async () => {
		// Shouldn't happen in practice but test the deterministic tie-break.
		repo.store.set('legacy-1', oldShape({ id: 'legacy-1', updatedAt: '2025-01-01T00:00:00Z' }));
		repo.store.set('legacy-2', oldShape({ id: 'legacy-2', updatedAt: '2025-06-01T00:00:00Z' }));
		const r = await repo.findByGithubUsernameAcrossShapes('rmjoia');
		expect(r?.id).toBe('legacy-2');
	});

	it('does not migrate the legacy doc (read-only by contract)', async () => {
		repo.store.set('59298c758a6f409c83d05d9f0bce90c9', oldShape());
		await repo.findByGithubUsernameAcrossShapes('rmjoia');
		// Legacy doc still at its original id; no new-shape doc created.
		expect(repo.store.has('59298c758a6f409c83d05d9f0bce90c9')).toBe(true);
		expect(repo.store.has(userIdForGithub('rmjoia'))).toBe(false);
	});
});

describe('deleteById', () => {
	let repo: FakeUserRepository;

	beforeEach(() => {
		repo = new FakeUserRepository();
	});

	it('removes the doc with the given id', async () => {
		repo.store.set('gh-rmjoia', newShape());
		await repo.deleteById('gh-rmjoia');
		expect(repo.store.has('gh-rmjoia')).toBe(false);
	});

	it('is idempotent — deleting a missing id is a no-op (no throw)', async () => {
		// Mirrors the production contract: 404 from Cosmos is swallowed.
		// The legacy-migration path in resolveRoles relies on this to keep
		// role resolution resilient against transient delete failures.
		await expect(repo.deleteById('does-not-exist')).resolves.toBeUndefined();
	});

	it('only deletes the targeted id, leaves siblings untouched', async () => {
		repo.store.set('gh-alice', newShape({ id: 'gh-alice', githubUsername: 'alice' }));
		repo.store.set('gh-bob', newShape({ id: 'gh-bob', githubUsername: 'bob' }));
		await repo.deleteById('gh-alice');
		expect(repo.store.has('gh-alice')).toBe(false);
		expect(repo.store.has('gh-bob')).toBe(true);
	});
});
