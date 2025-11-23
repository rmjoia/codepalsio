/**
 * Azure Function: GET /api/config-test
 * Test endpoint to verify configuration and environment variables
 */
export default async function (context, req) {
	const headers = {
		'Content-Type': 'application/json',
	};

	try {
		// Check which secrets are configured (mask values)
		const maskedSecrets = {
			githubClientId: process.env.GITHUB_CLIENT_ID
				? process.env.GITHUB_CLIENT_ID.substring(0, 10) + '...'
				: 'Not set',
			githubClientSecret: process.env.GITHUB_CLIENT_SECRET
				? '***' + process.env.GITHUB_CLIENT_SECRET.slice(-4)
				: 'Not set',
			jwtSecret: process.env.JWT_SECRET
				? '***' + process.env.JWT_SECRET.slice(-6)
				: 'Not set',
			cosmosDbConnectionString: process.env.COSMOS_DB_CONNECTION_STRING
				? process.env.COSMOS_DB_CONNECTION_STRING.includes('AccountEndpoint')
					? 'Connection string set'
					: 'Invalid format'
				: 'Not set',
			cosmosDbDatabaseName: process.env.COSMOS_DB_DATABASE_NAME || 'Not set',
		};

		const configInfo = {
			status: 'success',
			source: 'Azure Static Web Apps Configuration',
			environment: process.env.ENVIRONMENT || 'Not set',
			secrets: maskedSecrets,
			timestamp: new Date().toISOString(),
		};

		return {
			status: 200,
			headers,
			body: JSON.stringify(configInfo, null, 2),
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		return {
			status: 500,
			headers,
			body: JSON.stringify(
				{
					status: 'error',
					error: errorMessage,
				},
				null,
				2
			),
		};
	}
}
