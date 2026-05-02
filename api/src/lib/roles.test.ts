import { describe, it, expect, beforeEach } from 'vitest';
import { resolveRoles, parseAdminLogins } from './roles';
import { FakeUserRepository } from './users.fake';
import { FakeAdminRosterRepository } from './admin-roster.fake';
import { userIdForGithub } from './users';

const FROZEN_NOW = '2026-01-01T00:00:00.000Z';

describe('resolveRoles', () => {
	let repo: FakeUserRepository;
	let roster: FakeAdminRosterRepository;
	const now = () => FROZEN_NOW;

	beforeEach(() => {
		repo = new FakeUserRepository();
		roster = new FakeAdminRosterRepository();
	});

	describe('non-GitHub providers', () => {
		it('returns [] for any non-github identity provider', async () => {
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'aad' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			expect(roles).toEqual([]);
			expect(await repo.countByRole('admin')).toBe(0); // didn't seed
		});
	});

	describe('DB record exists', () => {
		it('returns roles from the DB record', async () => {
			await repo.upsert({
				id: userIdForGithub('rmjoia'),
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: ['admin'],
				updatedAt: FROZEN_NOW,
			});
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['someone-else']), now }
			);
			expect(roles).toEqual(['admin']);
		});

		it('returns [] when DB record has no roles (e.g., revoked via UI)', async () => {
			await repo.upsert({
				id: userIdForGithub('rmjoia'),
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: [],
				updatedAt: FROZEN_NOW,
			});
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				// Even if env var lists them, DB record (with empty roles) wins.
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			expect(roles).toEqual([]);
		});

		it('backfills swaUserId on first login when grant pre-dated user signup', async () => {
			await repo.upsert({
				id: userIdForGithub('newadmin'),
				githubUsername: 'newadmin',
				// swaUserId intentionally absent — granted before they ever logged in
				roles: ['admin'],
				updatedAt: FROZEN_NOW,
			});
			await resolveRoles(
				{ swaUserId: 'u-new', githubUsername: 'newadmin', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);
			const after = await repo.findByGithubUsername('newadmin');
			expect(after?.swaUserId).toBe('u-new');
		});

		it('updates swaUserId if it has changed (e.g. account reset)', async () => {
			await repo.upsert({
				id: userIdForGithub('rmjoia'),
				githubUsername: 'rmjoia',
				swaUserId: 'old-id',
				roles: ['admin'],
				updatedAt: FROZEN_NOW,
			});
			await resolveRoles(
				{ swaUserId: 'new-id', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);
			const after = await repo.findByGithubUsername('rmjoia');
			expect(after?.swaUserId).toBe('new-id');
		});

		it('lookup is case-insensitive', async () => {
			await repo.upsert({
				id: userIdForGithub('RMJoia'),
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: ['admin'],
				updatedAt: FROZEN_NOW,
			});
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'RMJOIA', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);
			expect(roles).toEqual(['admin']);
		});
	});

	describe('bootstrap path (no DB record)', () => {
		it('grants admin when user is in ADMIN_GITHUB_LOGINS and creates the seed record', async () => {
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			expect(roles).toEqual(['admin']);
			const created = await repo.findByGithubUsername('rmjoia');
			expect(created).toMatchObject({
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: ['admin'],
				grantedBy: 'bootstrap',
				grantedAt: FROZEN_NOW,
				updatedAt: FROZEN_NOW,
			});
			expect(created?.id).toBe(userIdForGithub('rmjoia'));
		});

		it('returns [] when user is not in ADMIN_GITHUB_LOGINS', async () => {
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'mallory', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			expect(roles).toEqual([]);
			expect(await repo.countByRole('admin')).toBe(0);
		});

		it('subsequent logins of the same bootstrap user use the DB path, not bootstrap', async () => {
			// First login → bootstrap creates record
			await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			// Second login → with env var EMPTIED. Should still be admin (DB record wins).
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);
			expect(roles).toEqual(['admin']);
		});

		it('removing a user from env var does NOT auto-revoke them', async () => {
			// User was bootstrapped earlier
			await repo.upsert({
				id: userIdForGithub('rmjoia'),
				githubUsername: 'rmjoia',
				swaUserId: 'u1',
				roles: ['admin'],
				grantedBy: 'bootstrap',
				updatedAt: FROZEN_NOW,
			});
			// Operator removed env var entry, but DB still says admin
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'rmjoia', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(), now }
			);
			expect(roles).toEqual(['admin']);
		});

		it('bootstrap path is case-insensitive against env var', async () => {
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: 'RmJoIa', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			expect(roles).toEqual(['admin']);
		});
	});

	describe('edge cases', () => {
		it('returns [] when githubUsername is empty', async () => {
			const roles = await resolveRoles(
				{ swaUserId: 'u1', githubUsername: '', identityProvider: 'github' },
				{ repo, roster, bootstrapLogins: new Set(['rmjoia']), now }
			);
			expect(roles).toEqual([]);
		});
	});
});

describe('parseAdminLogins', () => {
	it('returns empty Set for unset/empty input', () => {
		expect(parseAdminLogins(undefined).size).toBe(0);
		expect(parseAdminLogins('').size).toBe(0);
		expect(parseAdminLogins('   ').size).toBe(0);
	});

	it('parses a comma-separated list, trims whitespace, lowercases', () => {
		const set = parseAdminLogins(' Alice ,  BOB,  rmjoia ');
		expect([...set].sort()).toEqual(['alice', 'bob', 'rmjoia']);
	});

	it('drops empty entries from extra commas', () => {
		const set = parseAdminLogins(',alice,,bob,');
		expect([...set].sort()).toEqual(['alice', 'bob']);
	});
});
