'use strict';

// Functions v4 entrypoint. Each require() triggers the app.http(...)
// registration inside that file. Keeping this explicit (rather than a
// `"main": "*.js"` glob) means future helper modules dropped into api/
// aren't eagerly loaded as functions.
require('./profile-get');
require('./profile-save');
require('./account-delete');
