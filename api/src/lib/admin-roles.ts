import type { ClientPrincipal } from './types';

/**
 * Admin-tier role names recognised by the API. Any of these in
 * `principal.userRoles` short-circuits the roster lookup and grants
 * admin access immediately.
 *
 *   - 'admin'     — legacy roster-based grant (pre-invitation system)
 *   - 'manager'   — full platform admin (invitation system)
 *   - 'moderator' — handles reports + user bans (invitation system, future)
 *   - 'messenger' — admin → user messaging / tickets (invitation system, future)
 *
 * Spec 004 will refine per-role permissions. Until then, all four are
 * treated as admin-equivalent for the existing admin endpoints. The
 * frontend mirrors this list in src/services/api.ts — keep them in sync
 * until we have a shared types package.
 */
export const ADMIN_ROLE_NAMES: readonly string[] = ['admin', 'manager', 'moderator', 'messenger'];

/**
 * True when the principal carries any admin-tier role. Used as the
 * fast-path check in admin handlers — invitation-assigned roles arrive
 * here via the SWA's `x-ms-client-principal` header, no Cosmos lookup
 * required. Returns false for unauthenticated principals.
 */
export function principalHasAdminRole(principal: ClientPrincipal | null): boolean {
	if (!principal?.userRoles) return false;
	return ADMIN_ROLE_NAMES.some((r) => principal.userRoles.includes(r));
}
