import type { APIRoute } from 'astro';
import { config } from '../../../services/ConfigService';

/**
 * GET /api/config/test
 * Test endpoint to verify configuration source (Key Vault vs env vars)
 * Shows which secrets are loaded and from where
 */
export const GET: APIRoute = async () => {
	const headers = {
		'Content-Type': 'application/json',
	};

	try {
		// Load all secrets
		const secrets = await config.loadAllSecrets();

		// Mask sensitive values
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

		return new Response(JSON.stringify(configInfo, null, 2), {
			status: 200,
			headers,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		return new Response(
			JSON.stringify(
				{
					status: 'error',
					error: errorMessage,
					source:
						process.env.AZURE_KEYVAULT_URL || process.env.KEY_VAULT_URI
							? 'Azure Key Vault (failed)'
							: 'Environment Variables',
				},
				null,
				2
			),
			{
				status: 500,
				headers,
			}
		);
	}
};
