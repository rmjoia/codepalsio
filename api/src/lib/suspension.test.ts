import { describe, it, expect } from 'vitest';
import { assertNotSuspended, SUSPENDED_RESPONSE } from './suspension';
import { FakeUserRepository } from './users.fake';
import type { ClientPrincipal } from './types';

/**
 * Suspension-gate unit tests (spec 003 FR-124b).
 *
 * The helper is the single enforcement point for suspension across all
 * authenticated handlers — it has to behave the same way everywhere, so
 * every edge case here is a defence against the handler-touching PRs
 * (profile-save, admin-users, etc.) accidentally diverging.
 */

const principal = (overrides?: Partial<ClientPrincipal>): ClientPrincipal => ({
	identityProvider: 'github',
	userId: 'swa-user-123',
	userDetails: 'alice',
	userRoles: ['authenticated'],
	...overrides,
});

describe('assertNotSuspended', () => {
	it('returns null when the user record has no suspended field (fresh account)', async () => {
		const repo = new FakeUserRepository();
		await repo.upsert({
			id: 'gh-alice',
			githubUsername: 'alice',
			roles: [],
			updatedAt: new Date().toISOString(),
		});
		expect(await assertNotSuspended(principal(), repo)).toBeNull();
	});

	it('returns null when the user record has suspended: false explicitly', async () => {
		const repo = new FakeUserRepository();
		await repo.upsert({
			id: 'gh-alice',
			githubUsername: 'alice',
			roles: [],
			suspended: false,
			updatedAt: new Date().toISOString(),
		});
		expect(await assertNotSuspended(principal(), repo)).toBeNull();
	});

	it('returns the 403 suspended response when the user record has suspended: true', async () => {
		const repo = new FakeUserRepository();
		await repo.upsert({
			id: 'gh-alice',
			githubUsername: 'alice',
			roles: [],
			suspended: true,
			updatedAt: new Date().toISOString(),
		});
		const result = await assertNotSuspended(principal(), repo);
		expect(result).not.toBeNull();
		expect(result?.status).toBe(403);
		expect(result?.jsonBody).toEqual({ reason: 'suspended' });
	});

	it('returns null when no user record exists yet (first-time sign-in)', async () => {
		// A brand-new sign-in hasn't written a user record yet. Treating a
		// missing record as suspended would lock out every new user — the
		// helper MUST return null in this case.
		const repo = new FakeUserRepository();
		expect(await assertNotSuspended(principal(), repo)).toBeNull();
	});

	it('fails open when the user-repo throws (Cosmos down / network blip)', async () => {
		// Fail-closed would turn a transient Cosmos outage into a
		// self-DoS where every authenticated request 403s. The helper
		// deliberately fails open; downstream handlers' own Cosmos calls
		// will surface the real 500 to the caller.
		const throwingRepo = {
			findByGithubUsername: async () => {
				throw new Error('cosmos is unreachable');
			},
		} as unknown as FakeUserRepository;
		expect(await assertNotSuspended(principal(), throwingRepo)).toBeNull();
	});

	it('uses principal.userDetails (githubUsername) for the lookup', async () => {
		// Users container is keyed by gh-<githubUsername>, not by SWA
		// principal id. The helper must look up by userDetails.
		const repo = new FakeUserRepository();
		await repo.upsert({
			id: 'gh-bob',
			githubUsername: 'bob',
			roles: [],
			suspended: true,
			updatedAt: new Date().toISOString(),
		});
		// Alice's principal — should NOT match bob's suspended record.
		expect(await assertNotSuspended(principal({ userDetails: 'alice' }), repo)).toBeNull();
		// Bob's principal — matches.
		expect(await assertNotSuspended(principal({ userDetails: 'bob' }), repo)).not.toBeNull();
	});

	it('handles principal.userDetails being undefined without throwing', async () => {
		// Edge case: a malformed principal (shouldn't happen on SWA, but
		// defence in depth). The helper falls back to an empty-string
		// lookup; no suspended record under '' means null.
		const repo = new FakeUserRepository();
		expect(await assertNotSuspended(principal({ userDetails: undefined as unknown as string }), repo)).toBeNull();
	});

	it('exposes the SUSPENDED_RESPONSE constant with the correct shape', () => {
		// The frontend fetch wrapper matches on `reason: 'suspended'`. Any
		// drift here breaks the redirect-to-/suspended flow silently.
		expect(SUSPENDED_RESPONSE.status).toBe(403);
		expect(SUSPENDED_RESPONSE.jsonBody).toEqual({ reason: 'suspended' });
	});
});
