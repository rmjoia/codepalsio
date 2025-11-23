import type { APIRoute } from 'astro';
import { AuthService } from '../../../services/AuthService';
import { UserRepository } from '../../../infrastructure/UserRepository';

/**
 * GET /api/auth/callback
 * Handles GitHub OAuth callback
 */
export const GET: APIRoute = async ({ request, redirect, cookies }) => {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');

	if (error) {
		return redirect(`/?error=${encodeURIComponent(error)}`, 302);
	}

	if (!code) {
		return redirect('/?error=missing_code', 302);
	}

	const connectionString = import.meta.env.COSMOS_DB_CONNECTION_STRING;
	const database = import.meta.env.COSMOS_DB_DATABASE_NAME;
	const githubClientId = import.meta.env.GITHUB_CLIENT_ID;
	const githubClientSecret = import.meta.env.GITHUB_CLIENT_SECRET;
	const jwtSecret = import.meta.env.JWT_SECRET;

	if (!connectionString || !database || !githubClientId || !githubClientSecret || !jwtSecret) {
		return redirect('/?error=server_config', 302);
	}

	try {
		const userRepository = new UserRepository(connectionString, database);
		const authService = new AuthService(
			userRepository,
			jwtSecret,
			githubClientId,
			githubClientSecret
		);

		const { user, token } = await authService.handleOAuthCallback(code);

		// Set HttpOnly cookie with JWT (secure in production)
		cookies.set('session', token, {
			httpOnly: true,
			secure: import.meta.env.ENVIRONMENT === 'prod',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7, // 7 days
			path: '/',
		});

		// Check if this is the user's first login by comparing registration and last login dates
		// If they're the same (within a second), it's their first time
		const isFirstLogin =
			Math.abs(user.registrationDate.getTime() - user.lastLogin.getTime()) < 1000;

		if (isFirstLogin) {
			// New user - show welcome and onboarding
			return redirect(`/welcome?user=${encodeURIComponent(user.githubUsername)}`, 302);
		} else {
			// Returning user - skip welcome page, go to profile
			return redirect('/profile', 302);
		}
	} catch (err) {
		console.error('OAuth callback error:', err);
		return redirect('/?error=auth_failed', 302);
	}
};
