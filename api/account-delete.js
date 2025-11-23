import { CosmosClient } from '@azure/cosmos';

/**
 * Azure Function: DELETE /api/account-delete
 * Deletes user account and all associated data
 * GDPR compliant data deletion
 * Uses Azure Static Web Apps built-in authentication
 */
export default async function (context, req) {
	// Get authenticated user from Azure Static Web Apps
	const clientPrincipal = req.headers['x-ms-client-principal'];

	if (!clientPrincipal) {
		return redirect('/?error=not_authenticated');
	}

	// Decode the user principal
	const principal = JSON.parse(Buffer.from(clientPrincipal, 'base64').toString('utf-8'));
	const userId = principal.userId;

	const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
	const database = process.env.COSMOS_DB_DATABASE_NAME;

	if (!connectionString || !database) {
		return redirect('/?error=server_config');
	}

	try {
		// Connect to Cosmos DB (singleton client for connection pooling)
		const client = getCosmosClient(connectionString);
		const db = client.database(database);

		// Delete user
		const usersContainer = db.container('users');
		await usersContainer.item(userId, userId).delete();

		// Delete profile (if exists)
		const profilesContainer = db.container('profiles');
		const profileQuery = {
			query: 'SELECT * FROM c WHERE c.userId = @userId',
			parameters: [{ name: '@userId', value: userId }],
		};

		const { resources: profiles } = await profilesContainer.items.query(profileQuery).fetchAll();

		for (const profile of profiles) {
			await profilesContainer.item(profile.id, profile.userId).delete();
		}

		// Redirect to logout (Azure will clear authentication)
		return {
			status: 302,
			headers: {
				Location: '/.auth/logout?post_logout_redirect_uri=/?message=account_deleted',
			},
		};
	} catch (err) {
		console.error('Account deletion error:', err);
		return redirect('/?error=deletion_failed');
	}
}

// Singleton CosmosClient for connection pooling
let cosmosClient;
function getCosmosClient(connectionString) {
	if (!cosmosClient) {
		cosmosClient = new CosmosClient(connectionString);
	}
	return cosmosClient;
}

function redirect(location) {
	return {
		status: 302,
		headers: {
			Location: location,
		},
	};
}
