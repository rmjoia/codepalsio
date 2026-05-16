/**
 * Backend type contracts for the Azure Functions API.
 *
 * Duplicated from src/services/api.ts (frontend) deliberately — the api/
 * project deploys as its own tsc unit, so a shared module would require
 * project references or path aliases that don't survive SWA's deploy.
 * Profile shape is small and stable; revisit if drift starts biting.
 */

export interface ClientPrincipal {
	identityProvider: string;
	userId: string;
	userDetails: string;
	userRoles: string[];
	claims?: Array<{ typ: string; val: string }>;
}

/**
 * Single source of truth for the Availability vocabulary. The runtime
 * array and the type are derived together so they can't drift —
 * validation.ts imports both.
 */
export const AVAILABILITY_VALUES = ['active', 'casual', 'unavailable'] as const;
export type Availability = (typeof AVAILABILITY_VALUES)[number];

/**
 * Profile visibility — controls whether the profile appears in the public
 * directory at /find. Defaults to 'private' on save (opt-in to discovery).
 */
export const PROFILE_VISIBILITY_VALUES = ['public', 'private'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITY_VALUES)[number];

/**
 * Per-field audience levels for finer-grained "show what to whom" control.
 * Operates as a second filter on top of `profileVisibility`:
 *
 *   - `profileVisibility = 'private'` → profile never appears anywhere
 *     (per-field settings are moot)
 *   - `profileVisibility = 'public'` → profile is listable in /find, AND
 *     each hideable field is filtered by its `fieldVisibility[<field>]`:
 *       - `public`        → anyone who can see the profile
 *       - `authenticated` → signed-in viewers only (today the directory
 *         + detail page are already authenticated-gated, so this collapses
 *         with `public` in practice — kept for future routes that may
 *         expose profiles anonymously)
 *       - `private`       → owner only
 *
 * Defaults to `public` for every field (missing entries treated as public)
 * so legacy docs and brand-new profiles behave like they always have.
 */
export const FIELD_VISIBILITY_VALUES = ['public', 'authenticated', 'private'] as const;
export type FieldVisibility = (typeof FIELD_VISIBILITY_VALUES)[number];

/**
 * Fields a user can hide independently. Identity + status fields
 * (`id`, `userId`, `githubUsername`, `displayName`, `availability`) are
 * intentionally NOT hideable — they're the minimum needed for the profile
 * to identify itself when it appears (display name on a card, github
 * handle for the avatar URL, availability as the badge). Hiding them
 * would either break the card entirely or invite confusing "ghost"
 * profiles in the directory.
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

/** Partial map: missing entries default to `public`. Values that ARE
 * `public` are dropped on save (see normalizeFieldVisibility) to keep
 * stored docs lean — the empty map and an all-public map are equivalent. */
export type FieldVisibilityMap = Partial<Record<HideableField, FieldVisibility>>;

export interface Profile {
	id: string;
	userId: string;
	/**
	 * GitHub login (the SWA principal's `userDetails`), set server-side at
	 * save time. Used to render avatars in the directory: github.com/{login}.png.
	 * Optional only because pre-#24 docs don't have it; new saves always set it.
	 */
	githubUsername?: string;
	displayName: string;
	bio: string;
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
	updatedAt?: string;
}
