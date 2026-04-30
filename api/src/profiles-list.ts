import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getContainer, getCosmosConfig } from './lib/cosmos';
import type { Profile } from './lib/types';

/**
 * GET /api/profiles → returns the public profiles directory.
 *
 * Filtering is done **server-side** in the Cosmos query — private profiles
 * never leave the database. The current user's own profile is also excluded
 * (it's at /profile; no need to duplicate in /find).
 *
 * Auth: the SWA route gate already requires authenticated; the principal
 * check below is defense in depth.
 */
app.http('profiles', {
	methods: ['GET'],
	authLevel: 'anonymous',
	handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
		const principal = getClientPrincipal(request);
		if (!principal) {
			return { status: 401, jsonBody: { error: 'Not authenticated' } };
		}

		const cfg = getCosmosConfig();
		if (!cfg) {
			context.error('profiles: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}

		try {
			const container = getContainer(cfg.connectionString, cfg.database, 'profiles');
			const { resources } = await container.items
				.query<Profile>({
					query:
						"SELECT c.id, c.userId, c.githubUsername, c.displayName, c.bio, c.skills, c.interests, c.availability, c.location, c.timezone, c.profileVisibility, c.updatedAt FROM c WHERE c.profileVisibility = 'public' AND c.userId != @currentUserId ORDER BY c.updatedAt DESC",
					parameters: [{ name: '@currentUserId', value: principal.userId }],
				})
				.fetchAll();

			return { status: 200, jsonBody: { profiles: resources } };
		} catch (error) {
			context.error('profiles failed:', error);
			return { status: 500, jsonBody: { error: 'Failed to load profiles' } };
		}
	},
});
