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

export interface Profile {
	id: string;
	userId: string;
	displayName: string;
	bio: string;
	skills: string[];
	interests: string[];
	availability: Availability;
	location?: string;
	timezone?: string;
	githubUrl?: string;
	linkedinUrl?: string;
	websiteUrl?: string;
	preferredLanguages?: string[];
	yearsOfExperience?: number;
	profileVisibility?: 'public' | 'private';
	updatedAt?: string;
}
