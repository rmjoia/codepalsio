import { CosmosClient } from '@azure/cosmos';

/**
 * Azure Function: POST /api/profile-save
 * Save user profile
 * Uses Azure Static Web Apps built-in authentication
 */
export default async function (context, req) {
	const headers = {
		'Content-Type': 'application/json',
	};

	try {
		// Get authenticated user from Azure Static Web Apps
		// The x-ms-client-principal header contains the user info (base64 encoded JSON)
		const clientPrincipal = req.headers['x-ms-client-principal'];
		
		if (!clientPrincipal) {
			return {
				status: 401,
				headers,
				body: JSON.stringify({ error: 'Not authenticated' }),
			};
		}

		// Decode the user principal
		const principal = JSON.parse(Buffer.from(clientPrincipal, 'base64').toString('utf-8'));
		const userId = principal.userId; // Unique user ID from Azure auth
		const userDetails = principal.userDetails; // GitHub username or email

		// Get environment variables
		const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
		const database = process.env.COSMOS_DB_DATABASE_NAME;

		if (!connectionString || !database) {
			return {
				status: 500,
				headers,
				body: JSON.stringify({ error: 'Server configuration error' }),
			};
		}

		// Parse request body
		const body = req.body || {};
		const { displayName, bio, skills, interests, location, timezone, availability } = body;

		// Validate required fields
		if (!displayName || !bio) {
			return {
				status: 400,
				headers,
				body: JSON.stringify({ error: 'Display name and bio are required' }),
			};
		}

		// Input validation and sanitization
		const sanitizedProfile = {
			displayName: String(displayName).substring(0, 100).trim(),
			bio: String(bio).substring(0, 500).trim(),
			skills: Array.isArray(skills) ? skills.slice(0, 20).map(s => String(s).substring(0, 50)) : [],
			interests: Array.isArray(interests) ? interests.slice(0, 20).map(i => String(i).substring(0, 50)) : [],
			location: location ? String(location).substring(0, 100).trim() : '',
			timezone: timezone ? String(timezone).substring(0, 50).trim() : '',
			availability: ['active', 'inactive', 'busy'].includes(availability) ? availability : 'active',
		};

		// Create profile object
		const profile = {
			id: crypto.randomUUID(),
			userId: userId,
			userDetails: userDetails,
			...sanitizedProfile,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		// Save to database (singleton CosmosClient for connection pooling)
		const client = getCosmosClient(connectionString);
		const db = client.database(database);
		const profilesContainer = db.container('profiles');

		// Check if profile exists for this user
		const query = {
			query: 'SELECT * FROM c WHERE c.userId = @userId',
			parameters: [{ name: '@userId', value: userId }],
		};

		const { resources: existingProfiles } = await profilesContainer.items.query(query).fetchAll();

		if (existingProfiles.length > 0) {
			// Update existing profile
			const existing = existingProfiles[0];
			profile.id = existing.id;
			profile.createdAt = existing.createdAt;
			await profilesContainer.item(profile.id, profile.userId).replace(profile);
		} else {
			// Create new profile
			await profilesContainer.items.create(profile);
		}

		return {
			status: 200,
			headers,
			body: JSON.stringify({
				success: true,
				profile,
			}),
		};
	} catch (error) {
		console.error('Profile save error:', error);
		const errorMessage = error instanceof Error ? error.message : 'Failed to save profile';
		return {
			status: 500,
			headers,
			body: JSON.stringify({ error: errorMessage }),
		};
	}
}

// Singleton CosmosClient for connection pooling (reused across invocations)
let cosmosClient;
function getCosmosClient(connectionString) {
	if (!cosmosClient) {
		cosmosClient = new CosmosClient(connectionString);
	}
	return cosmosClient;
}
