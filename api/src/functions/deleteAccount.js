const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

/**
 * POST /api/account/delete
 * Delete user account and all associated data (marks as deleted, retains data for 90 days)
 * 
 * GDPR Compliance:
 * 1. Marks user as deleted in Cosmos DB (soft delete, 90-day retention for recovery)
 * 2. Calls Azure Static Web Apps /.auth/purge/ endpoint to remove personal data from platform
 * 3. Logs deletion for audit trail
 * 
 * Request body: { userId }
 * Response: { success: true, message: "..." } or error
 */
app.http('deleteAccount', {
    route: 'account/delete',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
            const database = process.env.COSMOS_DB_DATABASE_NAME;
            const webAppDomain = process.env.WEBSITE_HOSTNAME; // Set by Azure SWA automatically

            if (!connectionString || !database) {
                context.log('Missing database configuration');
                return {
                    status: 500,
                    jsonBody: { error: 'Database not configured' },
                };
            }

            const body = await request.json();
            const { userId } = body;

            if (!userId || typeof userId !== 'string' || userId.trim() === '') {
                return {
                    status: 400,
                    jsonBody: { error: 'Missing or invalid userId' },
                };
            }

            const client = new CosmosClient(connectionString);
            const usersContainer = client.database(database).container('users');
            const profilesContainer = client.database(database).container('profiles');

            try {
                // Step 1: Read user to verify exists
                const { resource: existingUser } = await usersContainer.item(userId, userId).read();
                if (!existingUser) {
                    return {
                        status: 404,
                        jsonBody: { error: 'User not found' },
                    };
                }

                // Step 2: Mark user as deleted (soft delete - retain for 90 days)
                const deletionDate = new Date();
                const scheduledDeletionDate = new Date(deletionDate.getTime() + 90 * 24 * 60 * 60 * 1000);
                
                const updatedUser = {
                    ...existingUser,
                    isDeleted: true,
                    deletedAt: deletionDate.toISOString(),
                    scheduledDeletionDate: scheduledDeletionDate.toISOString(),
                };
                await usersContainer.item(userId, userId).replace(updatedUser);

                // Step 3: Also mark profile as deleted if exists
                try {
                    const { resource: existingProfile } = await profilesContainer.item(userId, userId).read();
                    if (existingProfile) {
                        const updatedProfile = {
                            ...existingProfile,
                            isDeleted: true,
                            deletedAt: deletionDate.toISOString(),
                            scheduledDeletionDate: scheduledDeletionDate.toISOString(),
                        };
                        await profilesContainer.item(userId, userId).replace(updatedProfile);
                    }
                } catch (e) {
                    // Profile might not exist, that's ok
                    context.log('Profile does not exist for deletion:', userId);
                }

                // Step 4: Call Azure Static Web Apps .auth/purge/ endpoint to remove personal data
                // This prevents the platform from providing user info on future requests
                const purgeUrl = webAppDomain 
                    ? `https://${webAppDomain}/.auth/purge/github`
                    : null;

                if (purgeUrl) {
                    try {
                        const purgeResponse = await fetch(purgeUrl, { method: 'GET' });
                        // Purge endpoint returns 200 on success, but we don't fail if it doesn't
                        // since the user is already deleted from our database
                        context.log(`Auth purge requested: ${purgeResponse.status}`);
                    } catch (purgeError) {
                        // Log but don't fail - user is already deleted from database
                        context.log('Warning: Auth purge failed (non-critical):', purgeError.message);
                    }
                } else {
                    context.log('Warning: WEBSITE_HOSTNAME not available, skipping auth purge');
                }

                // Step 5: Log deletion for audit trail (GDPR compliance)
                context.log({
                    event: 'account_deleted',
                    userId: userId,
                    timestamp: deletionDate.toISOString(),
                    scheduledHardDeleteDate: scheduledDeletionDate.toISOString(),
                });

                return {
                    status: 200,
                    jsonBody: {
                        success: true,
                        message: 'Your account has been deleted. Your data will be permanently removed after 90 days.',
                    },
                };
            } catch (e) {
                context.log('Error during account deletion:', e);
                // Only return 404 if the specific issue is user not found
                const status = e.code === 'NotFound' ? 404 : 500;
                return {
                    status: status,
                    jsonBody: { error: e.message || 'Failed to delete account' },
                };
            }
        } catch (error) {
            context.log('Error:', error);
            return {
                status: 500,
                jsonBody: { error: error.message || 'Failed to delete account' },
            };
        }
    },
});
