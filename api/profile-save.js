'use strict';
const { CosmosClient } = require('@azure/cosmos');
const { randomUUID } = require('crypto');

const VALID_AVAILABILITY = ['active', 'casual', 'unavailable'];

function getClientPrincipal(req) {
	const header = req.headers['x-ms-client-principal'];
	if (!header) return null;
	try {
		return JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
	} catch {
		return null;
	}
}

function validate(body) {
	if (!body.displayName || !body.displayName.trim()) return 'Display name is required';
	if (!body.bio || !body.bio.trim()) return 'Bio is required';
	if (body.bio.length > 500) return 'Bio must not exceed 500 characters';
	if (!Array.isArray(body.skills) || body.skills.length === 0) return 'At least one skill is required';
	if (!Array.isArray(body.interests) || body.interests.length === 0) return 'At least one interest is required';
	return null;
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

	const validationError = validate(body);
	if (validationError) {
		context.res = { status: 400, headers, body: JSON.stringify({ error: validationError }) };
		return;
	}

	const availability = VALID_AVAILABILITY.includes(body.availability) ? body.availability : 'active';

	try {
		const client = new CosmosClient(connectionString);
		const container = client.database(database).container('profiles');

		// Check if profile already exists to preserve id
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
			displayName: body.displayName.trim(),
			bio: body.bio.trim(),
			skills: body.skills.map((s) => s.trim()).filter(Boolean),
			interests: body.interests.map((i) => i.trim()).filter(Boolean),
			availability,
			location: body.location?.trim() || undefined,
			timezone: body.timezone || undefined,
			githubUrl: body.githubUrl?.trim() || undefined,
			linkedinUrl: body.linkedinUrl?.trim() || undefined,
			websiteUrl: body.websiteUrl?.trim() || undefined,
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
