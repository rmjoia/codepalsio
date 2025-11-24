// Import all function modules to register them with the app
require('./functions/authUser');
require('./functions/profileGet');
require('./functions/profileSave');

// Export app so Azure Functions can use it
const { app } = require('@azure/functions');
module.exports = app;
require('./functions/profileSave');
