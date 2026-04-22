import type { APIRoute } from 'astro';
import { ProfileRepository } from '../../../infrastructure/ProfileRepository';
import { Profile, type Availability } from '../../../domain/Profile';
import { getClientPrincipal } from '../../../lib/getClientPrincipal';

const VALID_AVAILABILITY: readonly Availability[] = ['active', 'casual', 'unavailable'];

export const POST: APIRoute = async ({ request }) => {
	const headers = { 'Content-Type': 'application/json' };

	const principal = getClientPrincipal(request);
	if (!principal) {
		return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers });
	}

	const connectionString = import.meta.env.COSMOS_DB_CONNECTION_STRING;
	const database = import.meta.env.COSMOS_DB_DATABASE_NAME;
	if (!connectionString || !database) {
		return new Response(JSON.stringify({ error: 'Server configuration error' }), {
			status: 500,
			headers,
		});
	}

	try {
		const body = await request.json();
		const { displayName, bio, skills, interests, location, timezone, availability } = body;

		const availabilityValue: Availability = VALID_AVAILABILITY.includes(availability)
			? availability
			: 'active';

		const profile = Profile.create({
			userId: principal.userId,
			displayName,
			bio,
			skills,
			interests,
			availability: availabilityValue,
			location,
			timezone,
		});

		const repo = new ProfileRepository(connectionString, database);
		await repo.upsert(profile);

		return new Response(JSON.stringify({ success: true, profile: profile.toJSON() }), {
			status: 200,
			headers,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to save profile';
		const status = message.toLowerCase().includes('required') || message.includes('must') ? 400 : 500;
		return new Response(JSON.stringify({ error: message }), { status, headers });
	}
};
