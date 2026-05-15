/**
 * Functions v4 entrypoint. Each side-effect import triggers an
 * `app.http(...)` registration in the imported file. Keeping this
 * explicit (rather than a glob in package.json `main`) means future
 * helper modules dropped into api/src/ don't get eagerly loaded as
 * functions.
 */
import './profile-get';
import './profile-save';
import './profiles-list';
import './profile-by-username';
import './account-delete';
import './get-roles';
import './admin-users';
import './admins-list';
import './admins-grant';
import './admins-revoke';
