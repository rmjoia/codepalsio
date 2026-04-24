'use strict';
const { CosmosClient } = require('@azure/cosmos');

// Cached at module scope (see profile-get.js).
let cachedClient = null;
let cachedConnectionString = null;
function getClient(connectionString) {
	if (!cachedClient || cachedConnectionString !== connectionString) {
		cachedClient = new CosmosClient(connectionString);
		cachedConnectionString = connectionString;
	}
	return cachedClient;
}

function getClientPrincipal(req) {
	const header = req.headers['x-ms-client-principal'];
	if (!header) return null;
	try {
		return JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
	} catch {
		return null;
	}
}

module.exports = async function (context, req) {
	const headers = { 'Content-Type': 'application/json' };

	if (req.method !== 'POST') {
		context.res = { status: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
		return;
	}

	const principal = getClientPrincipal(req);
	if (!principal) {
		context.res = { status: 401, headers, body: JSON.stringify({ error: 'Not authenticated' }) };
		return;
	}

	const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
	const database = process.env.COSMOS_DB_DATABASE_NAME;
	if (!connectionString || !database) {
		context.res = { status: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
		return;
	}

	try {
		const client = getClient(connectionString);

		// Delete profile
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

		// Delete user record if users container exists
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
			// users container may not exist — ignore
		}

		context.res = {
			status: 200,
			headers,
			body: JSON.stringify({ success: true }),
		};
	} catch (error) {
		context.res = {
			status: 500,
			headers,
			body: JSON.stringify({ error: 'Failed to delete account' }),
		};
	}
};
