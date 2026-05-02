import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

const mocks = vi.hoisted(() => ({
	getCosmosConfigMock: vi.fn(),
	createUserRepositoryMock: vi.fn(),
	createAdminRosterRepositoryMock: vi.fn(),
}));

vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('./lib/cosmos', () => ({
	getCosmosConfig: mocks.getCosmosConfigMock,
	getContainer: vi.fn(),
	getCosmosClient: vi.fn(),
}));
vi.mock('./lib/users', async () => {
	const actual = await vi.importActual<typeof import('./lib/users')>('./lib/users');
	return {
		...actual,
		createUserRepository: mocks.createUserRepositoryMock,
	};
});
vi.mock('./lib/admin-roster', async () => {
	const actual = await vi.importActual<typeof import('./lib/admin-roster')>('./lib/admin-roster');
	return {
		...actual,
		createAdminRosterRepository: mocks.createAdminRosterRepositoryMock,
	};
});

import { getRolesHandler } from './get-roles';
import { FakeUserRepository } from './lib/users.fake';
import { FakeAdminRosterRepository } from './lib/admin-roster.fake';
import { userIdForGithub } from './lib/users';

const fakeContext = { error: vi.fn(), log: vi.fn() } as unknown as InvocationContext;

function reqWith(body: unknown): HttpRequest {
	return { json: () => Promise.resolve(body) } as unknown as HttpRequest;
}

/** Realistic SWA rolesSource payload — only varying userDetails per test. */
function swaPayload(userDetails: string, identityProvider = 'github'): Record<string, unknown> {
	return {
		identityProvider,
		userId: 'hashed-id-123',
		userDetails,
		claims: [{ typ: 'urn:github:login', val: userDetails }],
		accessToken: 'gho_fakeToken',
	};
}

describe('POST /api/get-roles', () => {
	const originalEnv = process.env.ADMIN_GITHUB_LOGINS;
	let repo: FakeUserRepository;
	let roster: FakeAdminRosterRepository;

	beforeEach(() => {
		repo = new FakeUserRepository();
		roster = new FakeAdminRosterRepository();
		mocks.getCosmosConfigMock.mockReset();
		mocks.getCosmosConfigMock.mockReturnValue({ connectionString: 'cs', database: 'db' });
		mocks.createUserRepositoryMock.mockReset();
		mocks.createUserRepositoryMock.mockReturnValue(repo);
		mocks.createAdminRosterRepositoryMock.mockReset();
		mocks.createAdminRosterRepositoryMock.mockReturnValue(roster);
		delete process.env.ADMIN_GITHUB_LOGINS;
	});

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env.ADMIN_GITHUB_LOGINS;
		} else {
			process.env.ADMIN_GITHUB_LOGINS = originalEnv;
		}
	});

	describe('anti-probing — empty roles regardless of env / DB state', () => {
		beforeEach(() => {
			// Even with rmjoia listed and a DB record granting admin, partial
			// payloads should never see those roles.
			process.env.ADMIN_GITHUB_LOGINS = 'rmjoia';
		});

		it('returns [] when body is null', async () => {
			const res = await getRolesHandler(reqWith(null), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] when body is an array', async () => {
			const res = await getRolesHandler(reqWith(['rmjoia']), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] for an empty object', async () => {
			const res = await getRolesHandler(reqWith({}), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] when only userDetails is present', async () => {
			const res = await getRolesHandler(reqWith({ userDetails: 'rmjoia' }), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] when claims is not an array', async () => {
			const res = await getRolesHandler(
				reqWith({ ...swaPayload('rmjoia'), claims: 'not-an-array' }),
				fakeContext
			);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] when accessToken is missing or empty', async () => {
			for (const accessToken of [undefined, '']) {
				const payload = { ...swaPayload('rmjoia'), accessToken } as Record<string, unknown>;
				if (accessToken === undefined) delete payload.accessToken;
				const res = await getRolesHandler(reqWith(payload), fakeContext);
				expect(res.jsonBody).toEqual({ roles: [] });
			}
		});

		it('returns [] when JSON parsing throws', async () => {
			const req = { json: () => Promise.reject(new Error('not json')) } as unknown as HttpRequest;
			const res = await getRolesHandler(req, fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});
	});

	describe('fail-closed paths', () => {
		it('returns 200 + [] when Cosmos config is missing', async () => {
			mocks.getCosmosConfigMock.mockReturnValueOnce(null);
			process.env.ADMIN_GITHUB_LOGINS = 'rmjoia';
			const res = await getRolesHandler(reqWith(swaPayload('rmjoia')), fakeContext);
			expect(res.status).toBe(200);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns 200 + [] when the repository throws', async () => {
			mocks.createUserRepositoryMock.mockImplementationOnce(() => ({
				findByGithubUsername: () => Promise.reject(new Error('cosmos down')),
				upsert: vi.fn(),
				listByRole: vi.fn(),
				countByRole: vi.fn(),
			}));
			process.env.ADMIN_GITHUB_LOGINS = 'rmjoia';
			const res = await getRolesHandler(reqWith(swaPayload('rmjoia')), fakeContext);
			expect(res.status).toBe(200);
			expect(res.jsonBody).toEqual({ roles: [] });
		});
	});

	describe('delegation to resolveRoles (smoke)', () => {
		// roles.test.ts owns the matrix of bootstrap / DB / case-insensitive
		// behavior. These are just integration smokes proving the wiring works.

		it("returns ['admin'] for a bootstrap-listed login on first sign-in", async () => {
			process.env.ADMIN_GITHUB_LOGINS = 'rmjoia';
			const res = await getRolesHandler(reqWith(swaPayload('rmjoia')), fakeContext);
			expect(res.jsonBody).toEqual({ roles: ['admin'] });
			// Side effect: bootstrap record persisted
			expect(await repo.findByGithubUsername('rmjoia')).not.toBeNull();
		});

		it("returns ['admin'] when the user has a DB record with admin role", async () => {
			await repo.upsert({
				id: userIdForGithub('alice'),
				githubUsername: 'alice',
				roles: ['admin'],
				updatedAt: '2026-01-01T00:00:00Z',
			});
			const res = await getRolesHandler(reqWith(swaPayload('alice')), fakeContext);
			expect(res.jsonBody).toEqual({ roles: ['admin'] });
		});

		it('returns [] for an unlisted, unrecorded user', async () => {
			const res = await getRolesHandler(reqWith(swaPayload('mallory')), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] for non-github identity providers', async () => {
			process.env.ADMIN_GITHUB_LOGINS = 'rmjoia';
			const res = await getRolesHandler(reqWith(swaPayload('rmjoia', 'aad')), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});
	});
});
