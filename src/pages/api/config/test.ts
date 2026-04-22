import type { APIRoute } from 'astro';
import { config } from '../../../services/ConfigService';
import { getClientPrincipal, hasRole } from '../../../lib/getClientPrincipal';

/**
 * GET /api/config/test
 * Admin-only: verifies which config source is active and shows masked secret shape.
 */
export const GET: APIRoute = async ({ request }) => {
	const headers = { 'Content-Type': 'application/json' };

	const principal = getClientPrincipal(request);
	if (!hasRole(principal, 'admin')) {
		return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers });
	}

	try {
		const secrets = await config.loadAllSecrets();

		const maskedSecrets = {
			githubClientId: secrets.githubClientId.substring(0, 10) + '...',
			githubClientSecret: '***' + secrets.githubClientSecret.slice(-4),
			jwtSecret: '***' + secrets.jwtSecret.slice(-6),
			cosmosDbConnectionString: secrets.cosmosDbConnectionString.includes('AccountEndpoint')
				? 'Connection string set'
				: 'Not set',
			cosmosDbDatabaseName: secrets.cosmosDbDatabaseName,
			sendgridApiKey: '***' + secrets.sendgridApiKey.slice(-6),
		};

		const configInfo = {
			status: 'success',
			source:
				process.env.AZURE_KEYVAULT_URL || process.env.KEY_VAULT_URI
					? 'Azure Key Vault'
					: 'Environment Variables',
			keyVaultUrl: process.env.AZURE_KEYVAULT_URL || process.env.KEY_VAULT_URI || 'Not configured',
			environment: process.env.ENVIRONMENT,
			secrets: maskedSecrets,
			timestamp: new Date().toISOString(),
		};

		return new Response(JSON.stringify(configInfo, null, 2), { status: 200, headers });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		return new Response(
			JSON.stringify({
				status: 'error',
				error: errorMessage,
				source:
					process.env.AZURE_KEYVAULT_URL || process.env.KEY_VAULT_URI
						? 'Azure Key Vault (failed)'
						: 'Environment Variables',
			}),
			{ status: 500, headers }
		);
	}
};
