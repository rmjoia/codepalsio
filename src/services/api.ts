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

/**
 * Resolve the current SWA client principal, memoized for the page lifetime.
 * Returns null for anonymous sessions or any network/parse failure — callers
 * decide how to react (redirect to login, show signed-out UI, etc.).
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
 * GET /api/profile-get → returns the current user's profile, or null if none.
 * Throws on non-OK status (caller decides whether to retry / show error).
 */
export async function getProfile(): Promise<Profile | null> {
	const res = await fetch('/api/profile-get');
	if (!res.ok) {
		if (res.status === 404) return null;
		throw new Error(`profile-get ${res.status}`);
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
		const err = await res.json().catch(() => ({}));
		throw new Error(err?.error || `profile-save ${res.status}`);
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
		throw new Error(`account-delete ${res.status}`);
	}
}
