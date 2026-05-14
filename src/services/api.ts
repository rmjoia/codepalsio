/**
 * Frontend API service.
 *
 * One place that knows how to talk to /.auth/me and the /api/* Azure
 * Functions. Components import these helpers instead of calling fetch()
 * directly so we don't end up with four copies of /.auth/me parsing
 * scattered across Header / Hero / CTA / profile.
 *
 * getPrincipal() is memoized at module scope: across the page lifetime,
 * the request fires at most once, regardless of how many components ask
 * for it. Astro hoists all <script> blocks into a single bundle, so the
 * cache is shared.
 */

/**
 * Structured error thrown by every helper here on non-OK status. Pages can
 * `instanceof` check + switch on `.status` instead of brittle string
 * matching against `.message`.
 */
export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly endpoint: string,
		public readonly body?: unknown
	) {
		super(`${endpoint} ${status}`);
		this.name = 'ApiError';
	}
}

async function safeJson(res: Response): Promise<unknown> {
	try {
		return await res.json();
	} catch {
		return undefined;
	}
}

export interface ClientPrincipal {
	identityProvider: string;
	userId: string;
	userDetails: string;
	userRoles: string[];
	claims?: Array<{ typ: string; val: string }>;
}

export type Availability = 'active' | 'casual' | 'unavailable';
export type ProfileVisibility = 'public' | 'private';

export interface Profile {
	id: string;
	userId: string;
	/** GitHub login, set server-side from the SWA principal at save time. */
	githubUsername?: string;
	displayName: string;
	bio: string;
	skills: string[];
	interests: string[];
	availability: Availability;
	profileVisibility: ProfileVisibility;
	location?: string;
	timezone?: string;
	githubUrl?: string;
	linkedinUrl?: string;
	websiteUrl?: string;
	preferredLanguages?: string[];
	yearsOfExperience?: number;
	updatedAt?: string;
}

export interface ProfileInput {
	displayName: string;
	bio: string;
	skills: string[];
	interests: string[];
	availability?: Availability;
	profileVisibility?: ProfileVisibility;
	location?: string;
	timezone?: string;
	githubUrl?: string;
	linkedinUrl?: string;
	websiteUrl?: string;
}

let principalPromise: Promise<ClientPrincipal | null> | null = null;
let enrichedPrincipalPromise: Promise<ClientPrincipal | null> | null = null;

/**
 * Resolve the current SWA client principal, memoized for the page lifetime.
 * Returns null for anonymous sessions or any network/parse failure — callers
 * decide how to react (redirect to login, show signed-out UI, etc.).
 *
 * Note: on SWA Free `userRoles` only carries the built-in `anonymous` /
 * `authenticated` roles. To know whether the caller is admin, use
 * {@link getPrincipalWithRoles} which enriches via /api/get-roles.
 */
export function getPrincipal(): Promise<ClientPrincipal | null> {
	if (!principalPromise) {
		principalPromise = fetch('/.auth/me')
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`/.auth/me ${r.status}`))))
			.then((d) => d?.clientPrincipal ?? null)
			.catch(() => null);
	}
	return principalPromise;
}

/**
 * Resolve the principal AND enrich it with application-level roles
 * (e.g. 'admin') by calling /api/get-roles. On SWA Free there's no
 * rolesSource feature, so principal.userRoles never carries 'admin' —
 * the frontend asks the API for the real role set.
 *
 * The enriched roles are MERGED with the built-in SWA roles; we keep
 * 'authenticated' / 'anonymous' so call sites that already check those
 * keep working. Memoised per page like getPrincipal.
 */
export function getPrincipalWithRoles(): Promise<ClientPrincipal | null> {
	if (enrichedPrincipalPromise) return enrichedPrincipalPromise;

	enrichedPrincipalPromise = (async () => {
		const principal = await getPrincipal();
		if (!principal) return null;
		try {
			const r = await fetch('/api/get-roles');
			if (!r.ok) return principal;
			const body = (await r.json()) as { roles?: unknown };
			if (!Array.isArray(body.roles)) return principal;
			const extra = body.roles.filter((x): x is string => typeof x === 'string');
			const merged = Array.from(new Set([...(principal.userRoles ?? []), ...extra]));
			return { ...principal, userRoles: merged };
		} catch {
			// Soft-fail: return the un-enriched principal. Admin UI will be
			// hidden (no 'admin' in userRoles), which is the safe default.
			return principal;
		}
	})();
	return enrichedPrincipalPromise;
}

/**
 * Derive the GitHub avatar URL for a principal.
 *
 * SWA's GitHub provider doesn't reliably emit an avatar_url claim, so we
 * fall back to https://github.com/{login}.png — GitHub serves every
 * user's avatar at that URL and 302s to the CDN, no API call needed.
 */
export function getAvatarUrl(principal: ClientPrincipal | null): string {
	if (!principal) return '';
	const claim = principal.claims?.find((c) => c.typ === 'avatar_url');
	if (claim?.val) return claim.val;
	if (principal.userDetails) {
		return `https://github.com/${encodeURIComponent(principal.userDetails)}.png`;
	}
	return '';
}

export function hasRole(principal: ClientPrincipal | null, role: string): boolean {
	return !!principal?.userRoles?.includes(role);
}

/**
 * Admin-tier role names recognised across the platform. Any of these in
 * `principal.userRoles` grants access to admin UI surfaces.
 *
 *   - 'admin'     — legacy roster-based grant (pre-invitation system)
 *   - 'manager'   — full platform admin (invitation system)
 *   - 'moderator' — handles reports + user bans (invitation system, future)
 *   - 'messenger' — admin → user messaging / tickets (invitation system, future)
 *
 * Spec 004 will refine per-role permissions. Until then, treat all four
 * as "admin-equivalent" for menu visibility — the API enforces specific
 * role gates per endpoint where it matters.
 */
export const ADMIN_ROLE_NAMES: readonly string[] = ['admin', 'manager', 'moderator', 'messenger'];

export function isAdminPrincipal(principal: ClientPrincipal | null): boolean {
	if (!principal?.userRoles) return false;
	return ADMIN_ROLE_NAMES.some((r) => principal.userRoles.includes(r));
}

/**
 * Subset of Profile returned by GET /api/profiles. The directory endpoint
 * intentionally projects only the fields the cards render — no userId,
 * no profileVisibility — to minimise data exposure.
 */
export type DirectoryProfile = Pick<
	Profile,
	| 'id'
	| 'githubUsername'
	| 'displayName'
	| 'bio'
	| 'skills'
	| 'availability'
	| 'location'
	| 'timezone'
	| 'updatedAt'
>;

/**
 * GET /api/profiles → returns the public profiles directory (excludes the
 * current user). Throws on non-OK status.
 */
export async function getPublicProfiles(): Promise<DirectoryProfile[]> {
	const res = await fetch('/api/profiles');
	if (!res.ok) {
		throw new ApiError(res.status, 'profiles', await safeJson(res));
	}
	const data = await res.json();
	return data?.profiles ?? [];
}

/**
 * Avatar URL for a directory profile. Returns the GitHub profile picture
 * for users with a stored `githubUsername`, or an empty string for legacy
 * docs that predate the field — callers should fall back to their own
 * placeholder (e.g., the user's initial in a coloured circle).
 */
export function getProfileAvatarUrl(profile: Pick<Profile, 'githubUsername' | 'id'>): string {
	if (profile.githubUsername) {
		return `https://github.com/${encodeURIComponent(profile.githubUsername)}.png`;
	}
	return '';
}

/**
 * GET /api/profile-get → returns the current user's profile, or null if none.
 * Throws on non-OK status (caller decides whether to retry / show error).
 */
export async function getProfile(): Promise<Profile | null> {
	const res = await fetch('/api/profile-get');
	if (!res.ok) {
		if (res.status === 404) return null;
		throw new ApiError(res.status, 'profile-get', await safeJson(res));
	}
	const data = await res.json();
	return data?.profile ?? null;
}

/**
 * POST /api/profile-save → upsert the current user's profile. Returns the
 * persisted profile (includes the server-assigned id on create).
 */
export async function saveProfile(input: ProfileInput): Promise<Profile> {
	const res = await fetch('/api/profile-save', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
	if (!res.ok) {
		const body = await safeJson(res);
		const err: { error?: string } | undefined =
			body && typeof body === 'object' ? (body as { error?: string }) : undefined;
		throw new ApiError(res.status, err?.error ?? 'profile-save', body);
	}
	const data = await res.json();
	return data.profile;
}

/**
 * POST /api/account-delete → removes the user's profile + user record.
 */
export async function deleteAccount(): Promise<void> {
	const res = await fetch('/api/account-delete', { method: 'POST' });
	if (!res.ok) {
		throw new ApiError(res.status, 'account-delete', await safeJson(res));
	}
}

// ─────────────────────────── Admin ────────────────────────────────

export interface AdminProfileRow {
	id: string;
	userId: string;
	githubUsername?: string;
	displayName: string;
	profileVisibility: ProfileVisibility;
	availability: Availability;
	bioLength: number;
	skillsCount: number;
	interestsCount: number;
	hasLocation: boolean;
	hasTimezone: boolean;
	complete: boolean;
	updatedAt?: string;
}

export interface AdminKpis {
	totalProfiles: number;
	publicProfiles: number;
	privateProfiles: number;
	completeProfiles: number;
}

export interface AdminUsersResponse {
	profiles: AdminProfileRow[];
	kpis: AdminKpis;
}

/**
 * GET /api/admin-users → admin-only KPIs + per-user moderation table.
 * SWA route gate enforces the `admin` role; the backend handler also
 * checks the principal's roles for defense in depth.
 */
export async function getAdminUsers(): Promise<AdminUsersResponse> {
	const res = await fetch('/api/admin-users');
	if (!res.ok) {
		throw new ApiError(res.status, 'admin-users', await safeJson(res));
	}
	return await res.json();
}

// ─── Admin role management ──────────────────────────────────────────

export interface AdminListEntry {
	githubUsername: string;
	roles: string[];
	grantedBy?: string;
	grantedAt?: string;
	updatedAt: string;
}

export async function listAdmins(): Promise<AdminListEntry[]> {
	const res = await fetch('/api/admins-list');
	if (!res.ok) throw new ApiError(res.status, 'admins-list', await safeJson(res));
	const data = await res.json();
	return data?.admins ?? [];
}

export async function grantAdmin(githubUsername: string): Promise<AdminListEntry> {
	const res = await fetch('/api/admins-grant', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ githubUsername }),
	});
	if (!res.ok) throw new ApiError(res.status, 'admins-grant', await safeJson(res));
	const data = await res.json();
	return data.admin;
}

export async function revokeAdmin(githubUsername: string): Promise<void> {
	const res = await fetch('/api/admins-revoke', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ githubUsername }),
	});
	if (!res.ok) throw new ApiError(res.status, 'admins-revoke', await safeJson(res));
}
