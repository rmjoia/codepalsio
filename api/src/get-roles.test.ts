import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

vi.mock('@azure/functions', () => ({
	app: { http: vi.fn() },
}));

import { getRolesHandler } from './get-roles';

const fakeContext = { error: vi.fn(), log: vi.fn() } as unknown as InvocationContext;

/** Build a request whose `.json()` resolves to the given payload. */
function reqWith(body: unknown): HttpRequest {
	return {
		json: () => Promise.resolve(body),
	} as unknown as HttpRequest;
}

/** Realistic SWA rolesSource payload — only varying userDetails per test. */
function swaPayload(userDetails: string, identityProvider = 'github'): Record<string, unknown> {
	return {
		identityProvider,
		userId: 'hashed-id-123',
		userDetails,
		claims: [{ typ: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier', val: 'rmjoia' }],
		accessToken: 'gho_fakeToken',
	};
}

describe('POST /api/get-roles', () => {
	const originalEnv = process.env.ADMIN_GITHUB_LOGINS;

	beforeEach(() => {
		delete process.env.ADMIN_GITHUB_LOGINS;
	});

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env.ADMIN_GITHUB_LOGINS;
		} else {
			process.env.ADMIN_GITHUB_LOGINS = originalEnv;
		}
	});

	describe('admin matching', () => {
		it("returns ['admin'] when GitHub login matches ADMIN_GITHUB_LOGINS", async () => {
			process.env.ADMIN_GITHUB_LOGINS = 'rmjoia';
			const res = await getRolesHandler(reqWith(swaPayload('rmjoia')), fakeContext);
			expect(res.status).toBe(200);
			expect(res.jsonBody).toEqual({ roles: ['admin'] });
		});

		it('match is case-insensitive', async () => {
			process.env.ADMIN_GITHUB_LOGINS = 'RmJoIa';
			const res = await getRolesHandler(reqWith(swaPayload('rmjoia')), fakeContext);
			expect(res.jsonBody).toEqual({ roles: ['admin'] });
		});

		it('handles comma-separated lists with whitespace', async () => {
			process.env.ADMIN_GITHUB_LOGINS = '  alice ,  bob , rmjoia  ';
			const res = await getRolesHandler(reqWith(swaPayload('bob')), fakeContext);
			expect(res.jsonBody).toEqual({ roles: ['admin'] });
		});

		it('returns [] for an unlisted login', async () => {
			process.env.ADMIN_GITHUB_LOGINS = 'alice';
			const res = await getRolesHandler(reqWith(swaPayload('mallory')), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] when ADMIN_GITHUB_LOGINS is unset', async () => {
			const res = await getRolesHandler(reqWith(swaPayload('rmjoia')), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] when ADMIN_GITHUB_LOGINS is an empty string', async () => {
			process.env.ADMIN_GITHUB_LOGINS = '';
			const res = await getRolesHandler(reqWith(swaPayload('rmjoia')), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] for a non-GitHub identity provider even if login matches', async () => {
			process.env.ADMIN_GITHUB_LOGINS = 'rmjoia';
			const res = await getRolesHandler(reqWith(swaPayload('rmjoia', 'aad')), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});
	});

	describe('anti-probing', () => {
		// All of these should return [] regardless of ADMIN_GITHUB_LOGINS.
		// Anonymous callers can't enumerate which logins are admins by
		// POSTing partial payloads.

		beforeEach(() => {
			process.env.ADMIN_GITHUB_LOGINS = 'rmjoia';
		});

		it("returns [] when body is `null`", async () => {
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

		it('returns [] when only userDetails is present (no userId, claims, accessToken)', async () => {
			const res = await getRolesHandler(reqWith({ userDetails: 'rmjoia' }), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] when userId is missing', async () => {
			const payload = swaPayload('rmjoia');
			delete payload.userId;
			const res = await getRolesHandler(reqWith(payload), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] when claims is not an array', async () => {
			const res = await getRolesHandler(
				reqWith({ ...swaPayload('rmjoia'), claims: 'not-an-array' }),
				fakeContext
			);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] when accessToken is missing', async () => {
			const payload = swaPayload('rmjoia');
			delete payload.accessToken;
			const res = await getRolesHandler(reqWith(payload), fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] when accessToken is empty', async () => {
			const res = await getRolesHandler(
				reqWith({ ...swaPayload('rmjoia'), accessToken: '' }),
				fakeContext
			);
			expect(res.jsonBody).toEqual({ roles: [] });
		});

		it('returns [] when JSON parsing throws', async () => {
			const req = {
				json: () => Promise.reject(new Error('not json')),
			} as unknown as HttpRequest;
			const res = await getRolesHandler(req, fakeContext);
			expect(res.jsonBody).toEqual({ roles: [] });
		});
	});
});
