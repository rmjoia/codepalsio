import { HIDEABLE_FIELDS, type FieldVisibility, type Profile } from './types';

/**
 * Per-field visibility filter applied to a stored Profile before it leaves
 * the server. The single point of truth for "what does viewer V see in
 * profile P", consumed by both:
 *   - /api/profile-by-username (detail page; viewer may be the owner)
 *   - /api/profiles            (directory; viewer MAY be the owner — the
 *     query no longer excludes the caller, so the directory functions as
 *     a self-preview when the row is the caller's own)
 *
 * Semantics:
 *   - The owner ALWAYS sees every field (no point hiding fields from
 *     yourself on your own detail page; the edit form is where you set
 *     the audience, the detail page is where you preview the public
 *     view if you want).
 *   - Anyone else gets fields filtered by their visibility entry:
 *       'public'        → always included
 *       'authenticated' → included for signed-in viewers
 *       'private'       → owner-only; stripped
 *   - Missing entries default to 'public'. So legacy docs and brand-new
 *     profiles behave identically to the pre-feature state.
 *
 * This function does NOT touch identity/status fields (id, userId,
 * githubUsername, displayName, availability) — those are not in
 * HIDEABLE_FIELDS. It also does NOT remove `profileVisibility` or
 * `userId` from the returned object — those are still handled by the
 * endpoint's own response projection (e.g. toPublicProfile).
 */
export interface ViewerContext {
	/** True when the viewer is the profile's owner (their userId matches). */
	isOwner: boolean;
	/** True when the viewer has any authenticated principal. */
	isAuthenticated: boolean;
}

export function applyFieldVisibility<P extends Profile>(profile: P, viewer: ViewerContext): P {
	if (viewer.isOwner) return profile;

	const vis = profile.fieldVisibility ?? {};
	// Shallow clone — we mutate the result, never the input. Tests pin
	// that the input isn't modified (important because the same row may
	// be processed once per row in the directory path).
	const out: P = { ...profile };
	// Some hideable fields are typed as REQUIRED on Profile (bio, skills,
	// interests) so a direct `delete out[field]` would be a TS error.
	// Cast through Record so the runtime delete is allowed; the return
	// is honestly partial-shaped (consumers downstream already treat
	// these fields defensively — toPublicProfile, the directory
	// projection — so an absent `bio` is a non-event).
	const slot = out as unknown as Record<string, unknown>;
	for (const field of HIDEABLE_FIELDS) {
		const level: FieldVisibility = vis[field] ?? 'public';
		if (!isVisibleToViewer(level, viewer)) {
			delete slot[field];
		}
	}
	return out;
}

function isVisibleToViewer(level: FieldVisibility, viewer: ViewerContext): boolean {
	switch (level) {
		case 'public':
			return true;
		case 'authenticated':
			return viewer.isAuthenticated;
		case 'private':
			// `isOwner` is short-circuited by the caller; if we reach here
			// the viewer is not the owner, so private = hidden.
			return false;
	}
}
