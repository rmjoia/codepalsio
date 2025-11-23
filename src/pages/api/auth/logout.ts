import type { APIRoute } from 'astro';

/**
 * GET /api/auth/logout
 * Clears session cookie and redirects to homepage
 */
export const GET: APIRoute = async ({ cookies, redirect }) => {
	// Clear session cookie
	cookies.delete('session', {
		path: '/',
	});

	return redirect('/', 302);
};
