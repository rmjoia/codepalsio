'use strict';
const { CosmosClient } = require('@azure/cosmos');
const { randomUUID } = require('crypto');

const VALID_AVAILABILITY = ['active', 'casual', 'unavailable'];

// Cached at module scope (see profile-get.js).
let cachedClient = null;
let cachedConnectionString = null;
function getContainer(connectionString, database, containerName) {
	if (!cachedClient || cachedConnectionString !== connectionString) {
		cachedClient = new CosmosClient(connectionString);
		cachedConnectionString = connectionString;
	}
	return cachedClient.database(database).container(containerName);
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

// Coerce input to a clean string[] — drop non-strings, trim whitespace,
// drop empties. The caller then validates the normalized result, so
// inputs like ["   "] don't slip through as a "has one skill" check.
function normalizeStringList(input) {
	if (!Array.isArray(input)) return [];
	return input
		.filter((item) => typeof item === 'string')
		.map((item) => item.trim())
		.filter(Boolean);
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

	let body;
	try {
		body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
	} catch {
		context.res = { status: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
		return;
	}

	// Normalize first, then validate — see normalizeStringList above.
	const skills = normalizeStringList(body?.skills);
	const interests = normalizeStringList(body?.interests);
	const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
	const bio = typeof body?.bio === 'string' ? body.bio.trim() : '';

	if (!displayName) {
		context.res = { status: 400, headers, body: JSON.stringify({ error: 'Display name is required' }) };
		return;
	}
	if (!bio) {
		context.res = { status: 400, headers, body: JSON.stringify({ error: 'Bio is required' }) };
		return;
	}
	if (bio.length > 500) {
		context.res = { status: 400, headers, body: JSON.stringify({ error: 'Bio must not exceed 500 characters' }) };
		return;
	}
	if (skills.length === 0) {
		context.res = { status: 400, headers, body: JSON.stringify({ error: 'At least one skill is required' }) };
		return;
	}
	if (interests.length === 0) {
		context.res = { status: 400, headers, body: JSON.stringify({ error: 'At least one interest is required' }) };
		return;
	}

	const availability = VALID_AVAILABILITY.includes(body?.availability) ? body.availability : 'active';

	try {
		const container = getContainer(connectionString, database, 'profiles');

		// Preserve the existing profile id on update (upsert keyed by id).
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

		context.res = {
			status: 200,
			headers,
			body: JSON.stringify({ success: true, profile }),
		};
	} catch (error) {
		context.res = {
			status: 500,
			headers,
			body: JSON.stringify({ error: 'Failed to save profile' }),
		};
	}
};
