'use strict';
const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');
const { randomUUID } = require('crypto');

const VALID_AVAILABILITY = ['active', 'casual', 'unavailable'];

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

// Coerce input to a clean string[] — drop non-strings, trim, drop empties.
function normalizeStringList(input) {
	if (!Array.isArray(input)) return [];
	return input
		.filter((item) => typeof item === 'string')
		.map((item) => item.trim())
		.filter(Boolean);
}

app.http('profile-save', {
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
			context.error('profile-save: missing COSMOS_DB_CONNECTION_STRING or COSMOS_DB_DATABASE_NAME');
			return { status: 500, jsonBody: { error: 'Server configuration error' } };
		}

		let body;
		try {
			body = await request.json();
		} catch {
			return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
		}

		const skills = normalizeStringList(body?.skills);
		const interests = normalizeStringList(body?.interests);
		const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
		const bio = typeof body?.bio === 'string' ? body.bio.trim() : '';

		if (!displayName) return { status: 400, jsonBody: { error: 'Display name is required' } };
		if (!bio) return { status: 400, jsonBody: { error: 'Bio is required' } };
		if (bio.length > 500) return { status: 400, jsonBody: { error: 'Bio must not exceed 500 characters' } };
		if (skills.length === 0) return { status: 400, jsonBody: { error: 'At least one skill is required' } };
		if (interests.length === 0) return { status: 400, jsonBody: { error: 'At least one interest is required' } };

		const availability = VALID_AVAILABILITY.includes(body?.availability) ? body.availability : 'active';

		try {
			const container = getContainer(connectionString, database, 'profiles');

			// Preserve the existing profile id on update.
			const { resources } = await container.items
				.query({
					query: 'SELECT c.id FROM c WHERE c.userId = @userId',
					parameters: [{ name: '@userId', value: principal.userId }],
				})
				.fetchAll();

			const profileId = resources[0]?.id || `profile-${randomUUID()}`;

			const profile = {
				id: profileId,
				userId: principal.userId,
				displayName,
				bio,
				skills,
				interests,
				availability,
				location: typeof body?.location === 'string' ? body.location.trim() || undefined : undefined,
				timezone: typeof body?.timezone === 'string' ? body.timezone || undefined : undefined,
				githubUrl: typeof body?.githubUrl === 'string' ? body.githubUrl.trim() || undefined : undefined,
				linkedinUrl: typeof body?.linkedinUrl === 'string' ? body.linkedinUrl.trim() || undefined : undefined,
				websiteUrl: typeof body?.websiteUrl === 'string' ? body.websiteUrl.trim() || undefined : undefined,
			};

			await container.items.upsert(profile);

			return { status: 200, jsonBody: { success: true, profile } };
		} catch (error) {
			context.error('profile-save failed:', error);
			return { status: 500, jsonBody: { error: 'Failed to save profile' } };
		}
	},
});
