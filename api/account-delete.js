'use strict';
const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

let cachedClient = null;
let cachedConnectionString = null;
function getClient(connectionString) {
	if (!cachedClient || cachedConnectionString !== connectionString) {
		cachedClient = new CosmosClient(connectionString);
		cachedConnectionString = connectionString;
	}
	return cachedClient;
}

function getClientPrincipal(request) {
	const header = request.headers.get('x-ms-client-principal');
	if (!header) return null;
	try {
		return JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
	} catch {
		return null;
	}
}

app.http('account-delete', {
	methods: ['POST'],
	authLevel: 'anonymous',
	handler: async (request, context) => {
		const principal = getClientPrincipal(request);
		if (!principal) {
			return { status: 401, jsonBody: { error: 'Not authenticated' } };
		}

		const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
		const database = process.env.COSMOS_DB_DATABASE_NAME;
		if (!connectionString || !database) {
			context.error('account-delete: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}

		try {
			const client = getClient(connectionString);

			const profilesContainer = client.database(database).container('profiles');
			const { resources: profiles } = await profilesContainer.items
				.query({
					query: 'SELECT c.id FROM c WHERE c.userId = @userId',
					parameters: [{ name: '@userId', value: principal.userId }],
				})
				.fetchAll();

			for (const p of profiles) {
				try {
					await profilesContainer.item(p.id, principal.userId).delete();
				} catch (e) {
					if (!e || e.code !== 404) throw e;
				}
			}

			// Users container may not exist in every env — swallow and move on.
			try {
				const usersContainer = client.database(database).container('users');
				const { resources: users } = await usersContainer.items
					.query({
						query: 'SELECT c.id FROM c WHERE c.id = @userId',
						parameters: [{ name: '@userId', value: principal.userId }],
					})
					.fetchAll();

				for (const u of users) {
					try {
						await usersContainer.item(u.id, u.id).delete();
					} catch (e) {
						if (!e || e.code !== 404) throw e;
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
