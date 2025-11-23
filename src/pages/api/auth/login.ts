import type { APIRoute } from 'astro';
import { AuthService } from '../../../services/AuthService';
import { UserRepository } from '../../../infrastructure/UserRepository';

/**
 * GET /api/auth/login
 * Initiates GitHub OAuth flow
 */
export const GET: APIRoute = async ({ redirect, url }) => {
	const connectionString = import.meta.env.COSMOS_DB_CONNECTION_STRING;
	const database = import.meta.env.COSMOS_DB_DATABASE_NAME;
	const githubClientId = import.meta.env.GITHUB_CLIENT_ID;
	const githubClientSecret = import.meta.env.GITHUB_CLIENT_SECRET;
	const jwtSecret = import.meta.env.JWT_SECRET;

	if (!connectionString || !database || !githubClientId || !githubClientSecret || !jwtSecret) {
		return new Response('Server configuration error', { status: 500 });
	}

	const userRepository = new UserRepository(connectionString, database);
	const authService = new AuthService(
		userRepository,
		jwtSecret,
		githubClientId,
		githubClientSecret
	);

	const callbackUrl = `${url.origin}/api/auth/callback`;
	const authUrl = authService.getGitHubAuthUrl(callbackUrl);

	return redirect(authUrl, 302);
};
