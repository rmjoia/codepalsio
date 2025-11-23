import type { APIRoute } from 'astro';
import { ProfileRepository } from '../../../infrastructure/ProfileRepository';
import { Profile } from '../../../domain/Profile';
import { AuthService } from '../../../services/AuthService';
import { UserRepository } from '../../../infrastructure/UserRepository';

/**
 * POST /api/profile/save
 * Save user profile
 */
export const POST: APIRoute = async ({ request, cookies }) => {
	const headers = {
		'Content-Type': 'application/json',
	};

	try {
		// Check authentication
		const sessionToken = cookies.get('session')?.value;
		if (!sessionToken) {
			return new Response(JSON.stringify({ error: 'Not authenticated' }), {
				status: 401,
				headers,
			});
		}

		// Get environment variables
		const connectionString = import.meta.env.COSMOS_DB_CONNECTION_STRING;
		const database = import.meta.env.COSMOS_DB_DATABASE_NAME;
		const jwtSecret = import.meta.env.JWT_SECRET;

		if (!connectionString || !database || !jwtSecret) {
			return new Response(JSON.stringify({ error: 'Server configuration error' }), {
				status: 500,
				headers,
			});
		}

		// Verify token
		const userRepository = new UserRepository(connectionString, database);
		const authService = new AuthService(userRepository, jwtSecret, '', '');
		const payload = authService.verifyToken(sessionToken);

		if (!payload) {
			return new Response(JSON.stringify({ error: 'Invalid session' }), {
				status: 401,
				headers,
			});
		}

		// Parse request body
		const body = await request.json();
		const { displayName, bio, skills, interests, location, timezone, availability } = body;

		// Create profile
		const profile = Profile.create({
			userId: payload.userId,
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
		return new Response(
			JSON.stringify({ error: errorMessage }),
			{
				status: 500,
				headers,
			}
		);
	}
};
