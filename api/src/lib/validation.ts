import { AVAILABILITY_VALUES, type Availability } from './types';

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
