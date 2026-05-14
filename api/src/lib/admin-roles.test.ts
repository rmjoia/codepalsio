import { describe, it, expect } from 'vitest';
import { ADMIN_ROLE_NAMES, principalHasAdminRole } from './admin-roles';
import type { ClientPrincipal } from './types';

function makePrincipal(userRoles: string[]): ClientPrincipal {
	return {
		identityProvider: 'github',
		userId: 'u1',
		userDetails: 'someone',
		userRoles,
		claims: [],
	};
}

describe('ADMIN_ROLE_NAMES', () => {
	it('covers the legacy roster role and the invitation roles', () => {
		expect([...ADMIN_ROLE_NAMES].sort()).toEqual(['admin', 'manager', 'messenger', 'moderator']);
	});
});

describe('principalHasAdminRole', () => {
	it('returns false for null', () => {
		expect(principalHasAdminRole(null)).toBe(false);
	});

	it('returns false when userRoles only has built-in roles', () => {
		expect(principalHasAdminRole(makePrincipal(['anonymous', 'authenticated']))).toBe(false);
	});

	it.each(ADMIN_ROLE_NAMES)(
		'returns true when userRoles includes %s',
		(role) => {
			expect(principalHasAdminRole(makePrincipal(['authenticated', role]))).toBe(true);
		}
	);

	it('returns true when any admin-tier role is present alongside others', () => {
		expect(
			principalHasAdminRole(makePrincipal(['anonymous', 'authenticated', 'manager']))
		).toBe(true);
	});

	it('returns false for an unrelated custom role (e.g. "member")', () => {
		expect(principalHasAdminRole(makePrincipal(['authenticated', 'member']))).toBe(false);
	});
});
