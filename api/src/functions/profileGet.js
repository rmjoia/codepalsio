const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

/**
 * GET /api/profile/get
 * Get user profile from Cosmos DB
 */
app.http('profileGet', {
    route: 'profile/get',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            // Get user ID from query param or header
            const userId = request.query.get('userId');
            const xMsClientPrincipal = request.headers.get('x-ms-client-principal');

            let actualUserId = userId;
            if (!actualUserId && xMsClientPrincipal) {
                try {
                    const decoded = Buffer.from(xMsClientPrincipal, 'base64').toString('utf-8');
                    const principal = JSON.parse(decoded);
                    actualUserId = principal.userId;
                } catch (e) {
                    context.log('Error decoding principal:', e);
                }
            }

            if (!actualUserId) {
                return {
                    status: 400,
                    jsonBody: { error: 'Missing userId' },
                };
            }

            const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
            const database = process.env.COSMOS_DB_DATABASE_NAME;

            if (!connectionString || !database) {
                return {
                    status: 500,
                    jsonBody: { error: 'Database not configured' },
                };
            }

            const client = new CosmosClient(connectionString);
            const container = client.database(database).container('profiles');

            const { resources } = await container.items
                .query({
                    query: 'SELECT * FROM c WHERE c.userId = @userId',
                    parameters: [{ name: '@userId', value: actualUserId }],
                })
                .fetchAll();

            if (resources.length === 0) {
                return {
                    status: 404,
                    jsonBody: { error: 'Profile not found' },
                };
            }

            return {
                status: 200,
                jsonBody: resources[0],
            };
        } catch (error) {
            context.log('Error:', error);
            return {
                status: 500,
                jsonBody: { error: error.message },
            };
        }
    },
});
