import type { APIRoute } from 'astro';
import { ProfileRepository } from '../../../infrastructure/ProfileRepository';
import { Profile } from '../../../domain/Profile';

interface ClientPrincipal {
	identityProvider: string;
	userDetails: string;
	userId: string;
	userRoles: string[];
}

/**
 * POST /api/profile/save
 * Save user profile
 * Requires Azure Static Web Apps authentication
 */
export const POST: APIRoute = async ({ request }) => {
	const headers = {
		'Content-Type': 'application/json',
	};

	try {
		// Check authentication via Azure Static Web Apps header
		const clientPrincipalHeader = request.headers.get('x-ms-client-principal');
		if (!clientPrincipalHeader) {
			return new Response(JSON.stringify({ error: 'Not authenticated' }), {
				status: 401,
				headers,
			});
		}

		// Decode Azure principal
		let clientPrincipal: ClientPrincipal;
		try {
			const decoded = Buffer.from(clientPrincipalHeader, 'base64').toString('utf-8');
			clientPrincipal = JSON.parse(decoded);
		} catch {
			return new Response(JSON.stringify({ error: 'Invalid authentication header' }), {
				status: 401,
				headers,
			});
		}

		// Get environment variables
		const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
		const database = process.env.COSMOS_DB_DATABASE_NAME;

		if (!connectionString || !database) {
			return new Response(JSON.stringify({ error: 'Server configuration error' }), {
				status: 500,
				headers,
			});
		}

		const userId = clientPrincipal.userId;

		// Parse request body
		const body = await request.json();
		const { displayName, bio, skills, interests, location, timezone, availability } = body;

		// Validate input
		if (typeof displayName !== 'string' || displayName.length > 100) {
			return new Response(JSON.stringify({ error: 'Invalid displayName' }), {
				status: 400,
				headers,
			});
		}

		if (bio && (typeof bio !== 'string' || bio.length > 500)) {
			return new Response(JSON.stringify({ error: 'Invalid bio' }), {
				status: 400,
				headers,
			});
		}

		if (skills && (!Array.isArray(skills) || skills.length > 20)) {
			return new Response(JSON.stringify({ error: 'Invalid skills' }), {
				status: 400,
				headers,
			});
		}

		if (interests && (!Array.isArray(interests) || interests.length > 20)) {
			return new Response(JSON.stringify({ error: 'Invalid interests' }), {
				status: 400,
				headers,
			});
		}

		// Create profile
		const profile = Profile.create({
			userId,
			displayName,
			bio,
			skills,
			interests,
			location,
			timezone,
			availability: availability || 'active',
		});

		// Save to database
		const profileRepository = new ProfileRepository(connectionString, database);
		await profileRepository.upsert(profile);

		return new Response(
			JSON.stringify({
				success: true,
				profile: profile.toJSON(),
			}),
			{
				status: 200,
				headers,
			}
		);
	} catch (error) {
		console.error('Profile save error:', error);
		const errorMessage = error instanceof Error ? error.message : 'Failed to save profile';
		return new Response(JSON.stringify({ error: errorMessage }), {
			status: 500,
			headers,
		});
	}
};
