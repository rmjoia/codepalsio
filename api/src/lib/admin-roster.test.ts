import { describe, it, expect, beforeEach } from 'vitest';
import {
	getOrSeedRoster,
	mutateRoster,
	RosterContendedError,
	RosterStaleError,
	ROSTER_ID,
} from './admin-roster';
import { FakeAdminRosterRepository } from './admin-roster.fake';
import { FakeUserRepository } from './users.fake';
import { userIdForGithub } from './users';

const FROZEN_NOW = '2026-01-01T00:00:00.000Z';
const now = () => FROZEN_NOW;

describe('FakeAdminRosterRepository (etag semantics)', () => {
	let roster: FakeAdminRosterRepository;
	beforeEach(() => {
		roster = new FakeAdminRosterRepository();
	});

	it('starts empty (read returns null)', async () => {
		expect(await roster.read()).toBeNull();
	});

	it('initial write (no _etag) succeeds and bumps the etag', async () => {
		const written = await roster.write({ id: ROSTER_ID, admins: ['gh-a'], updatedAt: FROZEN_NOW });
		expect(written._etag).toBeDefined();
		expect((await roster.read())?._etag).toBe(written._etag);
	});

	it('write with matching _etag succeeds and rotates the etag', async () => {
		const seed = await roster.write({ id: ROSTER_ID, admins: ['gh-a'], updatedAt: FROZEN_NOW });
		const next = await roster.write({ ...seed, admins: ['gh-a', 'gh-b'] });
		expect(next._etag).not.toBe(seed._etag);
	});

	it('write with stale _etag throws RosterStaleError', async () => {
		const seed = await roster.write({ id: ROSTER_ID, admins: ['gh-a'], updatedAt: FROZEN_NOW });
		// Concurrent writer rotates the etag
		await roster.write({ ...seed, admins: ['gh-a', 'gh-x'] });
		await expect(
			roster.write({ ...seed, admins: ['gh-a', 'gh-b'] })
		).rejects.toBeInstanceOf(RosterStaleError);
	});
});

describe('getOrSeedRoster', () => {
	let roster: FakeAdminRosterRepository;
	let users: FakeUserRepository;
	beforeEach(() => {
		roster = new FakeAdminRosterRepository();
		users = new FakeUserRepository();
	});

	it('returns the existing roster unchanged when present', async () => {
		roster.seed(['gh-rmjoia']);
		const result = await getOrSeedRoster(roster, users, now);
		expect(result.admins).toEqual(['gh-rmjoia']);
	});

	it('seeds an empty roster when no admin user records exist', async () => {
		const result = await getOrSeedRoster(roster, users, now);
		expect(result.admins).toEqual([]);
		expect(result._etag).toBeDefined();
	});

	it('seeds from existing admin user records (legacy migration)', async () => {
		await users.upsert({
			id: userIdForGithub('rmjoia'),
			githubUsername: 'rmjoia',
			roles: ['admin'],
			updatedAt: FROZEN_NOW,
		});
		await users.upsert({
			id: userIdForGithub('alice'),
			githubUsername: 'alice',
			roles: ['admin', 'moderator'],
			updatedAt: FROZEN_NOW,
		});
		await users.upsert({
			id: userIdForGithub('bob'),
			githubUsername: 'bob',
			roles: [],
			updatedAt: FROZEN_NOW,
		});
		const result = await getOrSeedRoster(roster, users, now);
		expect(result.admins.sort()).toEqual([userIdForGithub('alice'), userIdForGithub('rmjoia')]);
	});
});

describe('mutateRoster', () => {
	let roster: FakeAdminRosterRepository;
	let users: FakeUserRepository;
	beforeEach(() => {
		roster = new FakeAdminRosterRepository();
		users = new FakeUserRepository();
	});

	it('commits next state and returns result on the happy path', async () => {
		roster.seed(['gh-a']);
		const result = await mutateRoster<string>(roster, users, (r) => ({
			next: { ...r, admins: [...r.admins, 'gh-b'] },
			result: 'committed',
		}));
		expect(result).toBe('committed');
		expect(roster.stored?.admins).toEqual(['gh-a', 'gh-b']);
	});

	it('aborts without writing when mutator returns abort', async () => {
		roster.seed(['gh-a']);
		const writesBefore = roster.writes;
		const result = await mutateRoster<string>(roster, users, () => ({ abort: 'no-op' }));
		expect(result).toBe('no-op');
		expect(roster.writes).toBe(writesBefore);
	});

	it('retries on stale-etag and eventually succeeds', async () => {
		roster.seed(['gh-a']);
		roster.simulateContention(1); // one synthetic etag bump
		const result = await mutateRoster<string>(roster, users, (r) => ({
			next: { ...r, admins: [...r.admins, 'gh-b'] },
			result: 'ok',
		}));
		expect(result).toBe('ok');
		expect(roster.stored?.admins).toEqual(['gh-a', 'gh-b']);
	});

	it('throws RosterContendedError after the retry budget is exhausted', async () => {
		roster.seed(['gh-a']);
		roster.simulateContention(10);
		await expect(
			mutateRoster<string>(roster, users, (r) => ({
				next: { ...r, admins: [...r.admins, 'gh-b'] },
				result: 'ok',
			}))
		).rejects.toBeInstanceOf(RosterContendedError);
	});

	it('respects a custom maxAttempts', async () => {
		roster.seed(['gh-a']);
		roster.simulateContention(2); // two etag bumps
		await expect(
			mutateRoster<string>(
				roster,
				users,
				(r) => ({ next: { ...r, admins: [...r.admins, 'gh-b'] }, result: 'ok' }),
				{ maxAttempts: 1 }
			)
		).rejects.toBeInstanceOf(RosterContendedError);
	});

	it('seeds the roster lazily when it does not exist', async () => {
		// No seed and no admin records → mutator sees empty admins[]
		const result = await mutateRoster<{ count: number }>(roster, users, (r) => ({
			next: { ...r, admins: [...r.admins, 'gh-first'] },
			result: { count: r.admins.length },
		}));
		expect(result.count).toBe(0);
		expect(roster.stored?.admins).toEqual(['gh-first']);
	});
});
