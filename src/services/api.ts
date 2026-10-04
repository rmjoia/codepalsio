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

/**
 * Suspension redirect gate (spec 003 FR-124b). Every authenticated API
 * handler returns `403 { reason: 'suspended' }` for suspended users. This
 * helper detects that signal and hard-navigates to `/suspended` instead
 * of letting the error bubble up as an ApiError the UI would surface as
 * a generic failure.
 *
 * Returns `true` when it has initiated a navigation (caller should bail
 * out silently), `false` otherwise. Calling it is safe on any Response —
 * non-403 responses, or 403s without the sentinel body, are no-ops.
 *
 * The caller's await should NEVER resolve after a successful redirect —
 * use {@link gateSuspendedResponse} which hangs the promise so the UI
 * can't flash a "something went wrong" toast before navigation unloads
 * the page.
 */
export async function redirectIfSuspended(res: Response): Promise<boolean> {
	if (res.status !== 403) return false;
	let body: unknown;
	try {
		// Clone — if the sentinel check fails, the original body is still
		// available for the caller's own error reporting.
		body = await res.clone().json();
	} catch {
		return false;
	}
	if (body && typeof body === 'object' && (body as { reason?: unknown }).reason === 'suspended') {
		if (typeof window !== 'undefined') {
			window.location.href = '/suspended';
		}
		return true;
	}
	return false;
}

/**
 * Helpers call this at the top of their non-OK branch. On a suspension
 * signal, it initiates the redirect and then awaits a never-settling
 * promise so the caller's `.catch` doesn't fire before `window.location`
 * replaces the document. On any other status it's a no-op and the
 * caller continues to its own error handling.
 */
async function gateSuspendedResponse(res: Response): Promise<void> {
	if (await redirectIfSuspended(res)) {
		await new Promise<never>(() => {});
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

/**
 * Per-field audience levels. Mirrors the backend type in api/src/lib/types.ts —
 * see the note in that file about why types are duplicated rather than shared.
 *
 *   - 'public'        → anyone who can see the profile
 *   - 'authenticated' → signed-in viewers only
 *   - 'private'       → owner only
 */
export type FieldVisibility = 'public' | 'authenticated' | 'private';

/**
 * Fields a user can hide independently. Identity/status fields (displayName,
 * githubUsername, availability) are intentionally NOT hideable — the profile
 * card needs them to identify itself.
 */
export const HIDEABLE_FIELDS = [
	'bio',
	'skills',
	'interests',
	'location',
	'timezone',
	'githubUrl',
	'linkedinUrl',
	'websiteUrl',
	'preferredLanguages',
	'yearsOfExperience',
] as const;
export type HideableField = (typeof HIDEABLE_FIELDS)[number];

/** Partial map of field → audience. Missing entries default to 'public'. */
export type FieldVisibilityMap = Partial<Record<HideableField, FieldVisibility>>;

export interface Profile {
	id: string;
	userId: string;
	/** GitHub login, set server-side from the SWA principal at save time. */
	githubUsername?: string;
	displayName: string;
	/**
	 * Bio text. Optional at the type level because a private profile can
	 * be saved with an empty bio (users draft incrementally). Public
	 * profiles are gated server-side to require a bio ≥ 50 characters.
	 */
	bio?: string;
	skills: string[];
	interests: string[];
	availability: Availability;
	profileVisibility: ProfileVisibility;
	/** Per-field audience filter; missing/empty means all fields are public. */
	fieldVisibility?: FieldVisibilityMap;
	location?: string;
	timezone?: string;
	githubUrl?: string;
	linkedinUrl?: string;
	websiteUrl?: string;
	preferredLanguages?: string[];
	yearsOfExperience?: number;
	/**
	 * Moderator action marker (spec 003 US3): when set, this profile was
	 * removed from public discovery by a named admin, not by the owner.
	 * Mirrors the server-side field in api/src/lib/types.ts. The owner's
	 * profile edit page detects this and shows a "unlisted by a moderator"
	 * banner distinct from their own private toggle.
	 */
	unlistedBy?: string;
	updatedAt?: string;
}

export interface ProfileInput {
	displayName: string;
	/**
	 * Bio text. Optional because private profiles can be saved without
	 * one. Client-side + server-side both enforce ≥ 50 characters ONLY
	 * when profileVisibility === 'public'.
	 */
	bio?: string;
	skills: string[];
	interests: string[];
	availability?: Availability;
	profileVisibility?: ProfileVisibility;
	fieldVisibility?: FieldVisibilityMap;
	location?: string;
	timezone?: string;
	githubUrl?: string;
	linkedinUrl?: string;
	websiteUrl?: string;
	/** Spoken languages, free-form (e.g. "English", "Português"). */
	preferredLanguages?: string[];
	/** Integer years of professional experience. Server enforces 0–60 bounds. */
	yearsOfExperience?: number;
}

let principalPromise: Promise<ClientPrincipal | null> | null = null;
let enrichedPrincipalPromise: Promise<ClientPrincipal | null> | null = null;

/**
 * Reset the memoized principal fetches so the NEXT call to
 * `getPrincipal` / `getPrincipalWithRoles` re-fetches from the server.
 *
 * Needed on BFCache restore (`window.pageshow` with `event.persisted ===
 * true`): bfcache preserves the module-scope `principalPromise` from
 * the original page load, so a user who signed in or out in another
 * tab since the back-forward snapshot would see stale auth state.
 * Also useful after `account-delete` or an explicit logout flow if we
 * want the next page interaction to re-resolve immediately.
 *
 * No-op if no fetch has been issued yet.
 */
export function resetPrincipalCache(): void {
	principalPromise = null;
	enrichedPrincipalPromise = null;
}

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
			if (!r.ok) {
				// A 403 { reason: 'suspended' } from get-roles redirects the
				// user to /suspended; otherwise soft-fail with the un-enriched
				// principal so the admin UI stays hidden (safe default).
				await gateSuspendedResponse(r);
				return principal;
			}
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
 * In this PR all four are treated as admin-equivalent — both for menu
 * visibility here and for API endpoint authorisation. Per-role gating
 * (moderator-only moderation endpoints, messenger-only CMS endpoints,
 * etc.) lands with the spec 004 implementation; until then any one of
 * these roles unlocks the full admin surface.
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
/**
 * `bio` and `skills` are required on the source Profile type but per-field
 * visibility can strip them from the wire response — consumers must guard
 * with `profile.skills?.length` etc. find.astro / find/profile.astro do
 * this defensively.
 */
export type DirectoryProfile = Pick<
	Profile,
	'id' | 'githubUsername' | 'displayName' | 'availability' | 'location' | 'timezone' | 'updatedAt'
> &
	Partial<Pick<Profile, 'bio' | 'skills' | 'preferredLanguages' | 'githubUrl'>>;

/**
 * GET /api/profiles → returns the public profiles directory (excludes the
 * current user). Throws on non-OK status.
 */
export async function getPublicProfiles(): Promise<DirectoryProfile[]> {
	const res = await fetch('/api/profiles');
	if (!res.ok) {
		await gateSuspendedResponse(res);
		throw new ApiError(res.status, 'profiles', await safeJson(res));
	}
	const data = await res.json();
	return data?.profiles ?? [];
}

/**
 * Public profile returned by GET /api/profile-by-username. Backend
 * projects to this shape — internal identifiers (userId) and visibility
 * metadata are intentionally absent. Matches PublicProfile in
 * api/src/profile-by-username.ts; duplicated by convention (see comment
 * at the top of api/src/lib/types.ts about cross-project sharing).
 */
export type PublicProfile = Pick<
	Profile,
	| 'id'
	| 'githubUsername'
	| 'displayName'
	| 'availability'
	| 'location'
	| 'timezone'
	| 'githubUrl'
	| 'linkedinUrl'
	| 'websiteUrl'
	| 'preferredLanguages'
	| 'yearsOfExperience'
	| 'updatedAt'
> &
	Partial<Pick<Profile, 'bio' | 'skills' | 'interests'>>;

/**
 * GET /api/profile-by-username?username=<login> → the public profile.
 *
 * The page renders different UI per HTTP status, so the helper returns
 * a discriminated result instead of throwing on 403/404 — those are
 * expected, on-the-happy-path outcomes for this endpoint, not errors.
 * Genuine errors (500, 400, network) still throw via ApiError.
 */
export type PublicProfileResult =
	| { kind: 'found'; profile: PublicProfile }
	| { kind: 'not-found' }
	| { kind: 'private' };

export async function getPublicProfileByUsername(username: string): Promise<PublicProfileResult> {
	const res = await fetch(`/api/profile-by-username?username=${encodeURIComponent(username)}`);
	if (res.status === 404) return { kind: 'not-found' };
	// The suspension redirect fires BEFORE the 403=private branch so a
	// suspended viewer gets navigated to /suspended rather than seeing a
	// "profile is private" shell with nothing to click.
	if (res.status === 403) {
		await gateSuspendedResponse(res);
		return { kind: 'private' };
	}
	if (!res.ok) {
		throw new ApiError(res.status, 'profile-by-username', await safeJson(res));
	}
	const data = await res.json();
	return { kind: 'found', profile: data.profile };
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
		await gateSuspendedResponse(res);
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
		await gateSuspendedResponse(res);
		const body = await safeJson(res);
		const err: { error?: string } | undefined =
			body && typeof body === 'object' ? (body as { error?: string }) : undefined;
		throw new ApiError(res.status, err?.error ?? 'profile-save', body);
	}
	const data = await res.json();
	return data.profile;
}

/**
 * Report-submission types (spec 003 US2).
 *
 * The literal union MUST stay in sync with REPORT_REASONS in
 * api/src/lib/reports.ts — the handler rejects any string outside the
 * server-side allow-list, so a drift here means users would file reports
 * that silently 400. Changes must land in both files + the modal UI in
 * src/pages/find/profile.astro + the admin queue in /admin/reports (S4).
 */
export type ReportReason = 'off_topic' | 'harassment' | 'impersonation' | 'spam' | 'other';

export interface ReportSubmission {
	reportedProfileId: string;
	reason: ReportReason;
	note?: string;
}

/**
 * POST /api/report → files a moderation report against another profile.
 * See spec 003 FR-110..FR-113. The response is deliberately opaque
 * (`{ success: true }`) — the server never leaks outcome specifics to
 * the reporter (privacy of the reported user).
 */
export async function submitReport(input: ReportSubmission): Promise<void> {
	const res = await fetch('/api/report-submit', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
	if (!res.ok) {
		await gateSuspendedResponse(res);
		const body = await safeJson(res);
		const err: { error?: string } | undefined =
			body && typeof body === 'object' ? (body as { error?: string }) : undefined;
		throw new ApiError(res.status, err?.error ?? 'report-submit', body);
	}
}

/**
 * Moderation-queue types (spec 003 US3). ReportQueueEntry mirrors the
 * server-side shape in api/src/reports-list.ts — reportCount aggregates
 * open reports targeting the same profile; a value > 1 indicates a
 * brigading / spike pattern the UI should visually flag.
 */
export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export interface ReportQueueEntry {
	id: string;
	reporterId: string;
	reportedProfileId: string;
	reportedUserId: string;
	reason: ReportReason;
	note?: string;
	createdAt: string;
	updatedAt?: string;
	status: ReportStatus;
	reportCount: number;
}

/**
 * Resolution actions for a moderation report. Must stay in sync with
 * `RESOLVE_ACTIONS` in api/src/report-resolve.ts — the handler rejects
 * any string outside the server-side allow-list.
 *   - 'dismiss' — no violation, close the report (no profile change)
 *   - 'unlist'  — flip profileVisibility to private + stamp unlistedBy
 *   - 'suspend' — ban the reported user via UserRecord.suspended=true
 */
export type ResolveAction = 'dismiss' | 'unlist' | 'suspend';

/** GET /api/reports-list — admin-only. 401/403 throw ApiError. */
export async function listReports(): Promise<ReportQueueEntry[]> {
	const res = await fetch('/api/reports-list');
	if (!res.ok) {
		await gateSuspendedResponse(res);
		const body = await safeJson(res);
		const err: { error?: string } | undefined =
			body && typeof body === 'object' ? (body as { error?: string }) : undefined;
		throw new ApiError(res.status, err?.error ?? 'reports-list', body);
	}
	const data = (await res.json()) as { reports?: ReportQueueEntry[] };
	return data.reports ?? [];
}

/** POST /api/report-resolve — admin-only. 401/403/404/409 throw ApiError. */
export async function resolveReport(input: {
	reportId: string;
	reportedProfileId: string;
	action: ResolveAction;
	reason?: string;
}): Promise<{ newStatus: ReportStatus }> {
	const res = await fetch('/api/report-resolve', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
	if (!res.ok) {
		await gateSuspendedResponse(res);
		const body = await safeJson(res);
		const err: { error?: string } | undefined =
			body && typeof body === 'object' ? (body as { error?: string }) : undefined;
		throw new ApiError(res.status, err?.error ?? 'report-resolve', body);
	}
	const data = (await res.json()) as { newStatus?: ReportStatus };
	return { newStatus: data.newStatus ?? 'resolved' };
}

/**
 * POST /api/account-delete → removes the user's profile + user record.
 */
export async function deleteAccount(): Promise<void> {
	const res = await fetch('/api/account-delete', { method: 'POST' });
	if (!res.ok) {
		await gateSuspendedResponse(res);
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
 * GET /api/manage-users → admin-only KPIs + per-user moderation table.
 * SWA route gate enforces the `admin` role; the backend handler also
 * checks the principal's roles for defense in depth.
 */
export async function getAdminUsers(): Promise<AdminUsersResponse> {
	// Route renamed from /api/admin-users → /api/manage-users to avoid an
	// observed conflict where SWA's frontend proxy returned 404 for every
	// /api/admin-* path despite the function being registered in the SWA
	// Function host (verified in Portal → APIs → Managed Functions list).
	// Possible collision with Azure Functions reserved /admin/* host
	// management namespace. Same rename applied across the admin endpoints.
	const res = await fetch('/api/manage-users');
	if (!res.ok) {
		await gateSuspendedResponse(res);
		throw new ApiError(res.status, 'manage-users', await safeJson(res));
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
	const res = await fetch('/api/roster-list');
	if (!res.ok) {
		await gateSuspendedResponse(res);
		throw new ApiError(res.status, 'roster-list', await safeJson(res));
	}
	const data = await res.json();
	return data?.admins ?? [];
}

export async function grantAdmin(githubUsername: string): Promise<AdminListEntry> {
	const res = await fetch('/api/roster-grant', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ githubUsername }),
	});
	if (!res.ok) {
		await gateSuspendedResponse(res);
		throw new ApiError(res.status, 'roster-grant', await safeJson(res));
	}
	const data = await res.json();
	return data.admin;
}

export async function revokeAdmin(githubUsername: string): Promise<void> {
	const res = await fetch('/api/roster-revoke', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ githubUsername }),
	});
	if (!res.ok) {
		await gateSuspendedResponse(res);
		throw new ApiError(res.status, 'roster-revoke', await safeJson(res));
	}
}
