'use strict';
const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');
const { randomUUID } = require('crypto');

const VALID_AVAILABILITY = ['active', 'casual', 'unavailable'];

// Bounds. The goal isn't UX — the edit form already has maxlength/arity
// limits — it's defense in depth so a hand-crafted POST can't blow up
// document size, starve indexing, or smuggle garbage into rendering paths
// downstream. Keep these in sync with the UI if the UI changes.
const LIMITS = {
	displayName: 100,
	bio: 500,
	location: 100,
	timezone: 64,
	url: 500,
	tagItem: 50, // single skill / interest
	tagCount: 30, // skills or interests array length
};

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

// Coerce input to a clean string[]: drop non-strings, trim, drop empties,
// cap per-item length, cap array length. The handler then validates the
// normalized result, so inputs like ["   "] don't slip through as a
// "has one skill" check and 10k-element arrays don't reach Cosmos.
function normalizeStringList(input, itemMax, countMax) {
	if (!Array.isArray(input)) return [];
	return input
		.filter((item) => typeof item === 'string')
		.map((item) => item.trim().slice(0, itemMax))
		.filter(Boolean)
		.slice(0, countMax);
}

function trimmedString(value, max) {
	if (typeof value !== 'string') return undefined;
	const out = value.trim().slice(0, max);
	return out || undefined;
}

// Only allow https:// URLs on the three public profile link fields.
// Blocks javascript:, data:, vbscript: etc. that would turn into XSS the
// moment a directory page renders <a href={profile.githubUrl}>.
function sanitizedUrl(value, max) {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (trimmed.length > max) return undefined;
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== 'https:') return undefined;
		return parsed.toString();
	} catch {
		return undefined;
	}
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

		const skills = normalizeStringList(body?.skills, LIMITS.tagItem, LIMITS.tagCount);
		const interests = normalizeStringList(body?.interests, LIMITS.tagItem, LIMITS.tagCount);
		const displayName = trimmedString(body?.displayName, LIMITS.displayName);
		const bio = trimmedString(body?.bio, LIMITS.bio + 1); // keep one over so we can 400 on >500 explicitly

		if (!displayName) return { status: 400, jsonBody: { error: 'Display name is required' } };
		if (!bio) return { status: 400, jsonBody: { error: 'Bio is required' } };
		if (bio.length > LIMITS.bio) return { status: 400, jsonBody: { error: `Bio must not exceed ${LIMITS.bio} characters` } };
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
				location: trimmedString(body?.location, LIMITS.location),
				timezone: trimmedString(body?.timezone, LIMITS.timezone),
				githubUrl: sanitizedUrl(body?.githubUrl, LIMITS.url),
				linkedinUrl: sanitizedUrl(body?.linkedinUrl, LIMITS.url),
				websiteUrl: sanitizedUrl(body?.websiteUrl, LIMITS.url),
			};

			await container.items.upsert(profile);

			return { status: 200, jsonBody: { success: true, profile } };
		} catch (error) {
			context.error('profile-save failed:', error);
			return { status: 500, jsonBody: { error: 'Failed to save profile' } };
		}
	},
});
