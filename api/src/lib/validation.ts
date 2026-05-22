import {
	AVAILABILITY_VALUES,
	type Availability,
	PROFILE_VISIBILITY_VALUES,
	type ProfileVisibility,
	FIELD_VISIBILITY_VALUES,
	type FieldVisibility,
	HIDEABLE_FIELDS,
	type FieldVisibilityMap,
} from './types';

/**
 * Input bounds for profile-save. The edit form already enforces these,
 * so the goal here isn't UX — it's defense in depth so a hand-crafted
 * POST can't blow up document size, starve indexing, or smuggle garbage
 * into rendering paths downstream.
 */
export const LIMITS = {
	displayName: 100,
	bio: 500,
	location: 100,
	timezone: 64,
	url: 500,
	tagItem: 50, // single skill / interest
	tagCount: 30, // skills or interests array length
} as const;

export function isAvailability(value: unknown): value is Availability {
	return typeof value === 'string' && (AVAILABILITY_VALUES as readonly string[]).includes(value);
}

export function isProfileVisibility(value: unknown): value is ProfileVisibility {
	return typeof value === 'string' && (PROFILE_VISIBILITY_VALUES as readonly string[]).includes(value);
}

export function isFieldVisibility(value: unknown): value is FieldVisibility {
	return typeof value === 'string' && (FIELD_VISIBILITY_VALUES as readonly string[]).includes(value);
}

/**
 * Coerce arbitrary input to a clean FieldVisibilityMap. Only keys from
 * HIDEABLE_FIELDS are kept; unknown keys and non-string values are
 * dropped. `public` entries are NOT stored — they're the default, and
 * keeping them just inflates document size. The empty map and an
 * all-public map are observationally identical.
 *
 * Returning `{}` for missing/invalid input means "use defaults" downstream,
 * not "block the save" — the form may legitimately omit this field.
 */
export function normalizeFieldVisibility(input: unknown): FieldVisibilityMap {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
	const src = input as Record<string, unknown>;
	const out: FieldVisibilityMap = {};
	for (const field of HIDEABLE_FIELDS) {
		const v = src[field];
		if (isFieldVisibility(v) && v !== 'public') {
			out[field] = v;
		}
	}
	return out;
}

/**
 * Coerce input to a clean string[]: drop non-strings, trim, drop empties,
 * cap per-item length, cap array length. The handler then validates the
 * normalized result, so inputs like `["   "]` don't slip past a
 * "has one skill" check and 10k-element arrays don't reach Cosmos.
 */
export function normalizeStringList(input: unknown, itemMax: number, countMax: number): string[] {
	if (!Array.isArray(input)) return [];
	return input
		.filter((item): item is string => typeof item === 'string')
		.map((item) => item.trim().slice(0, itemMax))
		.filter(Boolean)
		.slice(0, countMax);
}

export function trimmedString(value: unknown, max: number): string | undefined {
	if (typeof value !== 'string') return undefined;
	const out = value.trim().slice(0, max);
	return out || undefined;
}

/**
 * Coerce arbitrary input to an integer in [min, max], or undefined.
 *
 * Used for `yearsOfExperience` and similar scalar fields where:
 *   - the wire value might be a string (form input) or a number (JSON API)
 *   - we want to reject NaN, Infinity, fractional, and out-of-bound values
 *   - "empty / invalid" must become `undefined` (not 0) so the stored
 *     document doesn't lie about the user's data
 *
 * Strings are parsed with parseInt(value, 10); pre-existing numbers are
 * floored. The range gate is inclusive on both ends.
 */
export function boundedInteger(value: unknown, min: number, max: number): number | undefined {
	let n: number;
	if (typeof value === 'number') {
		n = value;
	} else if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed === '') return undefined;
		// Use Number() not parseInt — parseInt('5x', 10) returns 5 (it
		// parses leading digits and silently drops the rest), which would
		// let "5x" become a stored 5 years of experience. Number('5x')
		// returns NaN, which the isFinite check below rejects.
		n = Number(trimmed);
	} else {
		return undefined;
	}
	if (!Number.isFinite(n)) return undefined;
	const int = Math.floor(n);
	if (int < min || int > max) return undefined;
	return int;
}

/**
 * Only allow https:// URLs on profile link fields. Blocks `javascript:`,
 * `data:`, `vbscript:` etc. that would turn into stored XSS the moment
 * a directory page renders `<a href={profile.githubUrl}>`.
 */
export function sanitizedUrl(value: unknown, max: number): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (trimmed.length > max) return undefined;
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== 'https:') return undefined;
		return parsed.toString();
	} catch {
		return undefined;
	}
}
