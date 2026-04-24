'use strict';
const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

// Azure Functions reuses the worker process across invocations, so keeping
// the client at module scope avoids the TLS/auth handshake on every request.
let cachedClient = null;
let cachedConnectionString = null;
function getContainer(connectionString, database, containerName) {
	if (!cachedClient || cachedConnectionString !== connectionString) {
		cachedClient = new CosmosClient(connectionString);
		cachedConnectionString = connectionString;
	}
	return cachedClient.database(database).container(containerName);
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

app.http('profile-get', {
	methods: ['GET'],
	authLevel: 'anonymous',
	handler: async (request, context) => {
		const principal = getClientPrincipal(request);
		if (!principal) {
			return { status: 401, jsonBody: { error: 'Not authenticated' } };
		}

		const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
		const database = process.env.COSMOS_DB_DATABASE_NAME;
		if (!connectionString || !database) {
			context.error('profile-get: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}

		try {
			const container = getContainer(connectionString, database, 'profiles');
			const { resources } = await container.items
				.query({
					query: 'SELECT c.id, c.userId, c.displayName, c.bio, c.skills, c.interests, c.availability, c.location, c.timezone, c.githubUrl, c.linkedinUrl, c.websiteUrl, c.preferredLanguages, c.yearsOfExperience, c.profileVisibility, c.updatedAt FROM c WHERE c.userId = @userId',
					parameters: [{ name: '@userId', value: principal.userId }],
				})
				.fetchAll();

			return { status: 200, jsonBody: { profile: resources[0] || null } };
		} catch (error) {
			context.error('profile-get failed:', error);
			return { status: 500, jsonBody: { error: 'Failed to load profile' } };
		}
	},
});
