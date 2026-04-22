import type { APIRoute } from 'astro';
import { UserRepository } from '../../../infrastructure/UserRepository';
import { ProfileRepository } from '../../../infrastructure/ProfileRepository';
import { getClientPrincipal } from '../../../lib/getClientPrincipal';

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
		const profileRepo = new ProfileRepository(connectionString, database);
		const userRepo = new UserRepository(connectionString, database);

		const profile = await profileRepo.findByUserId(principal.userId);
		if (profile) {
			await profileRepo.delete(profile.id, principal.userId);
		}
		await userRepo.delete(principal.userId);

		return new Response(JSON.stringify({ success: true }), { status: 200, headers });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Deletion failed';
		return new Response(JSON.stringify({ error: message }), { status: 500, headers });
	}
};
