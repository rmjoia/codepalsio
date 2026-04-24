'use strict';
const { CosmosClient } = require('@azure/cosmos');

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
		const client = new CosmosClient(connectionString);
		const container = client.database(database).container('profiles');
		const { resources } = await container.items
			.query({
				query: 'SELECT * FROM c WHERE c.userId = @userId',
				parameters: [{ name: '@userId', value: principal.userId }],
			})
			.fetchAll();

		context.res = {
			status: 200,
			headers,
			body: JSON.stringify({ profile: resources[0] || null }),
		};
	} catch (error) {
		context.res = {
			status: 500,
			headers,
			body: JSON.stringify({ error: 'Failed to load profile' }),
		};
	}
};
