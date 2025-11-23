import type { APIRoute } from 'astro';
import { AuthService } from '../../../services/AuthService';
import { UserRepository } from '../../../infrastructure/UserRepository';

/**
 * GET /api/account/delete
 * Deletes user account and all associated data
 * GDPR compliant data deletion
 */
export const GET: APIRoute = async ({ cookies, redirect }) => {
	const sessionToken = cookies.get('session')?.value;

	if (!sessionToken) {
		return redirect('/?error=not_authenticated', 302);
	}

	const connectionString = import.meta.env.COSMOS_DB_CONNECTION_STRING;
	const database = import.meta.env.COSMOS_DB_DATABASE_NAME;
	const jwtSecret = import.meta.env.JWT_SECRET;

	if (!connectionString || !database || !jwtSecret) {
		return redirect('/?error=server_config', 302);
	}

	try {
		const userRepository = new UserRepository(connectionString, database);
		const authService = new AuthService(
			userRepository,
			jwtSecret,
			'', // Not needed for verification
			''
		);

		// Verify token and get user
		const payload = authService.verifyToken(sessionToken);
		if (!payload) {
			return redirect('/?error=invalid_session', 302);
		}

		// Delete user from database
		await userRepository.delete(payload.userId);

		// Clear session cookie
		cookies.delete('session', {
			path: '/',
		});

		return redirect('/?message=account_deleted', 302);
	} catch (err) {
		console.error('Account deletion error:', err);
		return redirect('/?error=deletion_failed', 302);
	}
};
