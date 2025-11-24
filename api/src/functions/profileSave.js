const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

/**
 * POST /api/profile/save
 * Save user profile to Cosmos DB
 */
app.http('profileSave', {
    route: 'profile/save',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const body = await request.json();
            const { userId, displayName, bio, skills, interests, location, timezone, availability } = body;

            if (!userId) {
                return {
                    status: 400,
                    jsonBody: { error: 'Missing userId' },
                };
            }

            // Validate bio length if provided
            if (bio && (bio.length < 50 || bio.length > 500)) {
                return {
                    status: 400,
                    jsonBody: { error: 'Bio must be between 50 and 500 characters' },
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

            const profileObj = {
                id: userId,
                userId,
                displayName,
                bio: bio || '',
                skills: skills || [],
                interests: interests || [],
                location: location || '',
                timezone: timezone || '',
                availability: availability || 'active',
                updatedAt: new Date().toISOString(),
            };

            try {
                await container.item(userId, userId).read();
                // Profile exists, update it
                await container.item(userId, userId).replace(profileObj);
            } catch (e) {
                // Profile doesn't exist, create new
                profileObj.createdAt = new Date().toISOString();
                await container.items.create(profileObj);
            }

            return {
                status: 200,
                jsonBody: profileObj,
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
