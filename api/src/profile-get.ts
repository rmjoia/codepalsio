import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getContainer, getCosmosConfig } from './lib/cosmos';
import { isProfileVisibility } from './lib/validation';
import type { Profile } from './lib/types';

app.http('profile-get', {
	methods: ['GET'],
	authLevel: 'anonymous',
	handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
		const principal = getClientPrincipal(request);
		if (!principal) {
			return { status: 401, jsonBody: { error: 'Not authenticated' } };
		}

		const cfg = getCosmosConfig();
		if (!cfg) {
			context.error('profile-get: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}

		try {
			const container = getContainer(cfg.connectionString, cfg.database, 'profiles');
			const { resources } = await container.items
				.query<Profile>({
					query:
						'SELECT c.id, c.userId, c.githubUsername, c.displayName, c.bio, c.skills, c.interests, c.availability, c.location, c.timezone, c.githubUrl, c.linkedinUrl, c.websiteUrl, c.preferredLanguages, c.yearsOfExperience, c.profileVisibility, c.updatedAt FROM c WHERE c.userId = @userId',
					parameters: [{ name: '@userId', value: principal.userId }],
				})
				.fetchAll();

			return { status: 200, jsonBody: { profile: normalizeLegacy(resources[0]) } };
		} catch (error) {
			context.error('profile-get failed:', error);
			return { status: 500, jsonBody: { error: 'Failed to load profile' } };
		}
	},
});

/**
 * Backfill defaults for fields that pre-date their feature flag. Today this
 * is just `profileVisibility` (added in #23) — older docs return undefined
 * for the field. Default to 'private' so the Profile type contract holds
 * for every consumer (frontend service, future directory endpoint, admin
 * view) and we fail safely toward not-listed.
 */
function normalizeLegacy(profile: Profile | undefined): Profile | null {
	if (!profile) return null;
	if (!isProfileVisibility(profile.profileVisibility)) {
		profile.profileVisibility = 'private';
	}
	return profile;
}
