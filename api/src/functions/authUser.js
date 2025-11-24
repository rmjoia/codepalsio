const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

app.http('authUser', {
    route: 'auth/user',
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
            const { userId, username, avatarUrl } = body;

            if (!userId || !username) {
                return {
                    status: 400,
                    jsonBody: { error: 'Missing userId or username' },
                };
            }

            const client = new CosmosClient(connectionString);
            const container = client.database(database).container('users');

            const userObj = {
                id: userId,
                userId,
                githubUsername: username,
                avatarUrl,
                registrationDate: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
            };

            try {
                await container.item(userId, userId).read();
                // User exists, update it
                await container.item(userId, userId).replace(userObj);
            } catch (e) {
                // User doesn't exist, create new
                await container.items.create(userObj);
            }

            return {
                status: 200,
                jsonBody: userObj,
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
