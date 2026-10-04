import { app, type HttpRequest, type InvocationContext, type HttpResponseInit } from '@azure/functions';
import { getClientPrincipal } from './lib/principal';
import { getCosmosClient, getCosmosConfig } from './lib/cosmos';
import { createUserRepository } from './lib/users';
import { assertNotSuspended } from './lib/suspension';

app.http('account-delete', {
	methods: ['POST'],
	authLevel: 'anonymous',
	handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
		const principal = getClientPrincipal(request);
		if (!principal) {
			return { status: 401, jsonBody: { error: 'Not authenticated' } };
		}

		const cfg = getCosmosConfig();
		if (!cfg) {
			context.error('account-delete: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}

		// Suspension gate (spec 003 FR-124b). A suspended user cannot
		// self-delete via this endpoint; appeals + deletion requests go
		// through abuse@codepals.io so a moderator can review context
		// before granting (e.g. preserving evidence of abuse against
		// other users). GDPR deletion rights are honoured via the email
		// channel, not blocked outright.
		const userRepo = createUserRepository(cfg.connectionString, cfg.database);
		const suspended = await assertNotSuspended(principal, userRepo);
		if (suspended) return suspended;

		try {
			const client = getCosmosClient(cfg.connectionString);

			const profilesContainer = client.database(cfg.database).container('profiles');
			const { resources: profiles } = await profilesContainer.items
				.query<{ id: string }>({
					query: 'SELECT c.id FROM c WHERE c.userId = @userId',
					parameters: [{ name: '@userId', value: principal.userId }],
				})
				.fetchAll();

			for (const p of profiles) {
				try {
					await profilesContainer.item(p.id, principal.userId).delete();
				} catch (e: unknown) {
					if (!isCosmosNotFound(e)) throw e;
				}
			}

			// Users container may not exist in every environment — swallow + move on.
			try {
				const usersContainer = client.database(cfg.database).container('users');
				const { resources: users } = await usersContainer.items
					.query<{ id: string }>({
						query: 'SELECT c.id FROM c WHERE c.id = @userId',
						parameters: [{ name: '@userId', value: principal.userId }],
					})
					.fetchAll();

				for (const u of users) {
					try {
						await usersContainer.item(u.id, u.id).delete();
					} catch (e: unknown) {
						if (!isCosmosNotFound(e)) throw e;
					}
				}
			} catch {
				// no users container, nothing to do
			}

			return { status: 200, jsonBody: { success: true } };
		} catch (error) {
			context.error('account-delete failed:', error);
			return { status: 500, jsonBody: { error: 'Failed to delete account' } };
		}
	},
});

function isCosmosNotFound(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code: unknown }).code === 404
	);
}
