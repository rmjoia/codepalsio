# Tasks: Invitation-Based Multi-Role Admin

**Feature**: 004-invitation-based-multi-role-admin
**Created**: 2026-05-14
**Spec**: `.specify/spec/004-invitation-based-multi-role-admin.md`
**Plan**: `.specify/plan/004-invitation-based-multi-role-admin.md`

Tasks are grouped by user story. `[P]` marks tasks that can run in parallel with siblings (no shared file). Test-first: every behaviour change has a failing test written before the implementation lands.

---

## US1 — Maintainer invites a manager (P1, foundational)

### Test-first

- **T-410 [P]**: In `api/src/lib/admin-roles.test.ts`, add cases for `principalHasRole(p, 'manager')` — returns true when role present, false otherwise, false for null principal.
- **T-411 [P]**: Add cases `isManager(p)`, `isModerator(p)`, `isMessenger(p)` — convenience wrappers; mirror the existing `principalHasAdminRole` test shape.
- **T-412**: In `api/src/admins-list.test.ts`, add a case "user with role `moderator` (no `manager`) calling GET /api/admins-list returns 403". The current test uses `verifyAdmin` seam; for this we'll either remove the seam or set it to call the real helper. **NEEDS CLARIFICATION**: keep `verifyAdmin` and just add explicit principal-role check tests, OR drop the seam to exercise the real path.
- **T-413**: Same shape for `admins-grant.test.ts` and `admins-revoke.test.ts` — moderator/messenger gets 403, manager gets 200.
- **T-414 [P]**: In `admins-list.test.ts` (or a new dedicated test file), add a case for the **roster-fallback path with insufficient invitation role**: principal with `userRoles: ['messenger']`, no `manager`, user id present in the Cosmos roster → call `GET /api/admins-list` → expect 200 (FR-414's "fall through to roster when invited role is insufficient" path).
- **T-415 [P]**: New cross-file invariant test (location: `src/services/api.cross-sync.test.ts` or similar) that reads both `api/src/lib/admin-roles.ts` and `src/services/api.ts` as text, extracts the `ADMIN_ROLE_NAMES` literal from each, asserts deep-equality. Fails CI on any drift (FR-401, plan 004 risk row).

### Implementation

- **T-420**: Extend `api/src/lib/admin-roles.ts` with `principalHasRole(p, role)` + convenience `isManager`/`isModerator`/`isMessenger`. Export from same module.
- **T-421**: Update `api/src/admins-list.ts` to check `isManager(principal) || (await isAdminFor(...))` — replaces the broad `principalHasAdminRole` check from PR #49.
- **T-422**: Same change in `api/src/admins-grant.ts`.
- **T-423**: Same change in `api/src/admins-revoke.ts`.
- **T-424**: `api/src/admin-users.ts` stays as-is — `GET /api/admin-users` is the read-only listing used by every admin sub-surface; needs only admin-tier role.

### Frontend

- **T-430 [P]**: Mirror `principalHasRole` + role-specific wrappers in `src/services/api.ts`.
- **T-431**: In `src/pages/admin/index.astro`, hide the "Manage admins" section (currently shown to any admin) behind `isManager(principal)`.
- **T-432**: Add a small banner above the manage-admins section: "Admin onboarding is primarily managed via the Azure Portal Role management blade. This UI remains for legacy and fallback maintenance." (FR-430)

### Operator docs

- **T-440**: `AZURE_SETUP_GUIDE.md` — replace "Bootstrap an admin (env var)" with "Invite an admin (Portal Role management)" as the primary path. Move the env var path to a "Fallback / first-admin bootstrap" subsection.

---

## US2 — Moderator handles reports without messaging powers (P1, conditional)

**Depends on**: spec 003 US2/US3 endpoints landed.

### Test-first

- **T-450 [P]**: When `admin-reports.test.ts` exists (spec 003), add cases for moderator role accepted, manager accepted, messenger rejected.

### Implementation

- **T-460**: In `api/src/admin-reports.ts` (or whatever spec 003 names it), check `isModerator(principal) || isManager(principal) || (await isAdminFor(...))`.
- **T-461**: Similar for `/api/admin/ban` or whichever endpoint spec 003 US3 introduces.

### Frontend

- **T-470**: In `src/pages/admin/index.astro`, hide the reports queue section behind `isModerator(principal) || isManager(principal)`.

---

## US3 — Messenger runs a ticketing flow (P2, conditional)

**Depends on**: spec 005 implementation landed.

### Test-first

- **T-480 [P]**: Tests for messenger accepted, manager accepted, moderator rejected on the admin messaging endpoints.

### Implementation

- **T-490**: In `api/src/admin-messages.ts` (spec 005), check `isMessenger(principal) || isManager(principal) || (await isAdminFor(...))`.

### Frontend

- **T-495**: In `src/pages/admin/index.astro` (or a new `/admin/messages` page), gate the CMS UI on `isMessenger(principal) || isManager(principal)`.

---

## US4 — Roster fallback (P3, no implementation work)

The roster fallback path is already shipped via PR #49's `isAdminFor` fallback. No work needed here beyond:

- **T-500 [P]**: Documentation pass — confirm `AZURE_SETUP_GUIDE.md` mentions the roster path as the contingency, and explains the order (principal first, roster second).

---

## Cross-cutting

- **T-510**: After all per-role tests pass, run `npm run test:run` + `cd api && npm test` + `npm run format` + `npm run lint` — must all be green.
- **T-520**: Update `.specify/PROJECT_STATUS.md`:
  - Move spec 004 to the "shipped" row in the Admin / roles table.
  - Update the operator action items list — "invite admins via Portal" is now the primary path; the env-var bootstrap moves to "first-admin / fallback only".
- **T-530**: Update spec 003 to reference `moderator` as the role for moderation endpoints (already implied; make explicit).

---

## Suggested PR composition

| PR | Tasks | Depends on |
|---|---|---|
| **004-A** (helpers + manager-only endpoints) | T-410, T-411, T-412, T-413, T-420, T-421, T-422, T-423, T-430, T-431, T-432, T-440, T-500, T-510, T-520 | Nothing — can ship now |
| **004-B** (moderator gates) | T-450, T-460, T-461, T-470 | Spec 003 US2/US3 implementation |
| **004-C** (messenger gates) | T-480, T-490, T-495 | Spec 005 implementation |

Ship 004-A as soon as PR #49 merges. 004-B and 004-C land alongside their dependencies.
