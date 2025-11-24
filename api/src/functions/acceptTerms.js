const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

/**
 * POST /api/account/accept-terms
 * Mark user as having accepted terms of service
 */
app.http('acceptTerms', {
    route: 'account/accept-terms',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
            const database = process.env.COSMOS_DB_DATABASE_NAME;

            if (!connectionString || !database) {
                return {
                    status: 500,
                    jsonBody: { error: 'Database not configured' },
                };
            }

            const body = await request.json();
            const { userId } = body;

            if (!userId) {
                return {
                    status: 400,
                    jsonBody: { error: 'Missing userId' },
                };
            }

            const client = new CosmosClient(connectionString);
            const container = client.database(database).container('users');

            try {
                const existingUser = await container.item(userId, userId).read();
                const updatedUser = {
                    ...existingUser.resource,
                    termsAccepted: true,
                    termsAcceptedDate: new Date().toISOString(),
                };
                await container.item(userId, userId).replace(updatedUser);

                return {
                    status: 200,
                    jsonBody: updatedUser,
                };
            } catch (e) {
                return {
                    status: 404,
                    jsonBody: { error: 'User not found' },
                };
            }
        } catch (error) {
            context.log('Error:', error);
            return {
                status: 500,
                jsonBody: { error: error.message },
            };
        }
    },
});
