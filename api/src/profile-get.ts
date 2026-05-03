import {
	app,
	type HttpRequest,
	type InvocationContext,
	type HttpResponseInit,
} from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getContainer, getCosmosConfig } from './lib/cosmos';
import { findProfileWithAutoHeal } from './lib/profile-repo';
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
			const { profile } = await findProfileWithAutoHeal(
				container,
				{ userId: principal.userId, userDetails: principal.userDetails },
				{ log: (m) => context.log(m), error: (m, e) => context.error(m, e) }
			);

			return { status: 200, jsonBody: { profile: normalizeLegacy(profile) } };
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
function normalizeLegacy(profile: Profile | null): Profile | null {
	if (!profile) return null;
	if (!isProfileVisibility(profile.profileVisibility)) {
		profile.profileVisibility = 'private';
	}
	return profile;
}
