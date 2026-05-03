import {
	app,
	type HttpRequest,
	type InvocationContext,
	type HttpResponseInit,
} from '@azure/functions';
import { randomUUID } from 'crypto';
import { getClientPrincipal } from './lib/principal';
import { getContainer, getCosmosConfig } from './lib/cosmos';
import { findProfileWithAutoHeal } from './lib/profile-repo';
import {
	LIMITS,
	isAvailability,
	isProfileVisibility,
	normalizeStringList,
	sanitizedUrl,
	trimmedString,
} from './lib/validation';
import type { Profile } from './lib/types';

app.http('profile-save', {
	methods: ['POST'],
	authLevel: 'anonymous',
	handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
		const principal = getClientPrincipal(request);
		if (!principal) {
			return { status: 401, jsonBody: { error: 'Not authenticated' } };
		}

		const cfg = getCosmosConfig();
		if (!cfg) {
			context.error('profile-save: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}

		let body: Record<string, unknown>;
		try {
			const parsed = await request.json();
			// request.json() can return null (literal `null` body) or an array;
			// guard before the cast so body.skills etc. don't blow up at runtime.
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
				return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
			}
			body = parsed as Record<string, unknown>;
		} catch {
			return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
		}

		const skills = normalizeStringList(body.skills, LIMITS.tagItem, LIMITS.tagCount);
		const interests = normalizeStringList(body.interests, LIMITS.tagItem, LIMITS.tagCount);
		const displayName = trimmedString(body.displayName, LIMITS.displayName);
		const bio = trimmedString(body.bio, LIMITS.bio + 1); // keep one over so we can 400 on >500 explicitly

		if (!displayName) return { status: 400, jsonBody: { error: 'Display name is required' } };
		if (!bio) return { status: 400, jsonBody: { error: 'Bio is required' } };
		if (bio.length > LIMITS.bio)
			return { status: 400, jsonBody: { error: `Bio must not exceed ${LIMITS.bio} characters` } };
		if (skills.length === 0)
			return { status: 400, jsonBody: { error: 'At least one skill is required' } };
		if (interests.length === 0)
			return { status: 400, jsonBody: { error: 'At least one interest is required' } };

		const availability = isAvailability(body.availability) ? body.availability : 'active';
		// Visibility defaults to 'private' — users opt in to /find discovery,
		// not out. Anything other than literal 'public' or 'private' coerces
		// to 'private'.
		const profileVisibility = isProfileVisibility(body.profileVisibility)
			? body.profileVisibility
			: 'private';

		try {
			const container = getContainer(cfg.connectionString, cfg.database, 'profiles');

			// Lookup existing profile WITH auto-heal: if the user has an
			// orphaned pre-#14 doc keyed by an old userId, this re-keys it
			// to the current userId before we save, so we update in place
			// instead of creating a duplicate.
			const { profile: existing } = await findProfileWithAutoHeal(
				container,
				{ userId: principal.userId, userDetails: principal.userDetails },
				{ log: (m) => context.log(m), error: (m, e) => context.error(m, e) }
			);

			const profileId = existing?.id ?? `profile-${randomUUID()}`;

			const profile: Profile = {
				id: profileId,
				userId: principal.userId,
				// Set server-side from the principal — never from request body —
				// so users can't impersonate someone else's GitHub login in the
				// directory.
				githubUsername: principal.userDetails || undefined,
				displayName,
				bio,
				skills,
				interests,
				availability,
				profileVisibility,
				location: trimmedString(body.location, LIMITS.location),
				timezone: trimmedString(body.timezone, LIMITS.timezone),
				githubUrl: sanitizedUrl(body.githubUrl, LIMITS.url),
				linkedinUrl: sanitizedUrl(body.linkedinUrl, LIMITS.url),
				websiteUrl: sanitizedUrl(body.websiteUrl, LIMITS.url),
				updatedAt: new Date().toISOString(),
			};

			await container.items.upsert(profile);

			return { status: 200, jsonBody: { success: true, profile } };
		} catch (error) {
			context.error('profile-save failed:', error);
			return { status: 500, jsonBody: { error: 'Failed to save profile' } };
		}
	},
});
