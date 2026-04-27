import { CosmosClient, type Container } from '@azure/cosmos';

/**
 * Cached at module scope. Azure Functions reuses the worker process
 * across invocations, so keeping the client around avoids the TLS/auth
 * handshake on every request.
 */
let cachedClient: CosmosClient | null = null;
let cachedConnectionString: string | null = null;

function getClient(connectionString: string): CosmosClient {
	if (!cachedClient || cachedConnectionString !== connectionString) {
		cachedClient = new CosmosClient(connectionString);
		cachedConnectionString = connectionString;
	}
	return cachedClient;
}

export function getContainer(
	connectionString: string,
	database: string,
	containerName: string
): Container {
	return getClient(connectionString).database(database).container(containerName);
}

/**
 * Get the raw client when you need access to multiple containers in one
 * handler (e.g., account-delete crosses profiles + users).
 */
export function getCosmosClient(connectionString: string): CosmosClient {
	return getClient(connectionString);
}

export function getCosmosConfig(): { connectionString: string; database: string } | null {
	const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
	const database = process.env.COSMOS_DB_DATABASE_NAME;
	if (!connectionString || !database) return null;
	return { connectionString, database };
}
