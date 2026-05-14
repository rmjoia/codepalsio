# Implementation Plan: Invitation-Based Multi-Role Admin

**Feature**: 004-invitation-based-multi-role-admin
**Created**: 2026-05-14
**Status**: Draft
**Spec**: `.specify/spec/004-invitation-based-multi-role-admin.md`

---

## Approach

Layer per-role permissions on top of the existing admin recognition shipped in PR #49 (`principalHasAdminRole` + `isAdminPrincipal`). Each admin endpoint declares which subset of roles unlocks it; helpers stay tiny and DRY.

Roster-fallback path (`isAdminFor`) stays exactly as PR #49 left it — invoked only when `principal.userRoles` has no admin-tier role at all, and grants `manager`-equivalent access (matching the legacy `admin` capability).

## Tech stack

No new dependencies. All changes are in:
- `api/src/lib/admin-roles.ts` — extend with per-role check helpers
- `api/src/<endpoint>.ts` — swap blanket `principalHasAdminRole` for the specific role(s) each endpoint accepts
- `src/services/api.ts` — mirror new helpers for the frontend
- `src/pages/admin/index.astro` — conditionally render sub-surfaces by role
- `staticwebapp.config.json` — no change (routes still gate on `authenticated`; per-role enforcement is handler-side)
- `AZURE_SETUP_GUIDE.md` — describe Portal invitation flow as primary

## Files to touch

### Add

- `api/src/lib/admin-roles.test.ts` already exists from PR #49 — extend with per-role helper tests
- (No new modules — extension only)

### Modify

| File | Change |
|---|---|
| `api/src/lib/admin-roles.ts` | Add `principalHasRole(p, role)` and convenience checks `isManager`, `isModerator`, `isMessenger`. Keep `principalHasAdminRole` (any admin-tier role) as the "any admin surface" check. |
| `api/src/admin-users.ts` | No change — `GET /api/admin-users` requires any admin-tier role (existing behaviour). |
| `api/src/admins-list.ts` | Change to require `manager` only (FR-411). |
| `api/src/admins-grant.ts` | Same: require `manager`. |
| `api/src/admins-revoke.ts` | Same: require `manager`. |
| `api/src/admin-reports.ts` (new, spec 003 US3) | Will require `moderator` OR `manager`. Out of scope for 004's PR if spec 003 hasn't landed yet — note in the FR but defer. |
| `src/services/api.ts` | Mirror per-role helpers. |
| `src/pages/admin/index.astro` | Hide roster-management section unless `isManager(principal)`; hide reports section unless `isModerator` or `isManager`; etc. |
| `staticwebapp.config.json` | No change. |
| `AZURE_SETUP_GUIDE.md` | New section "Inviting admins (Portal Role management)" as the primary onboarding path. Move the env-var bootstrap to "fallback / first-admin bootstrap". |
| `.specify/PROJECT_STATUS.md` | Move spec 004 from "in flight" to "shipped" row. |

### Delete (deferred to spec 004-followup)

Nothing yet. The Cosmos roster + `/admin/manage-admins` UI stays as the fallback path until invitations are confirmed stable for ≥6 months (FR-432).

## Sequencing — independent shippable PRs

This work is small enough to fit in a single PR, but splitting along role boundaries keeps each PR focused:

1. **PR-A: Helper extensions** — `admin-roles.ts` + tests. No behaviour change. Foundation.
2. **PR-B: Tighten manager-only endpoints** (US1) — `admins-list`, `admins-grant`, `admins-revoke` require `manager`. `/admin/manage-admins` UI hides for non-managers.
3. **PR-C: Wire moderator gates** (US2) — depends on spec 003 US2/US3 landing (`/api/admin/reports*`). If 003 hasn't shipped, defer PR-C.
4. **PR-D: Wire messenger gates** (US3) — depends on spec 005 landing. Defer if 005 not ready.
5. **PR-E: Docs + status update** — `AZURE_SETUP_GUIDE.md` rewrite, `PROJECT_STATUS.md`. Can land alongside PR-B.

Recommended: combine A + B + E into one PR (no external dependencies); ship C/D as spec 003 + 005 land.

## Constitution compliance check

See spec 004 §"Constitution Compliance Check" — all 8 principles pass.

## Test strategy

- `admin-roles.test.ts`: unit tests for each new helper. Use the existing principal-fixture pattern.
- Each admin handler test: add a case for "user with role X but not Y" → expect 403.
- E2E: no change. The auth-flow tests don't exercise role-specific endpoints (they hit `/find` and the homepage).

## Risks

| Risk | Mitigation |
|---|---|
| Test churn explosion | Helpers are pure functions; tests are local. ~10-15 new test cases total. |
| Frontend role logic divergence | `ADMIN_ROLE_NAMES` lives in two places (`api/src/lib/admin-roles.ts` + `src/services/api.ts`). FR-401 says they MUST stay in sync; divergence would silently break UI (admin nav hidden) or mis-gate endpoints. Mitigation is an **explicit cross-file invariant test** (task T-415): parse both files as text, extract the `ADMIN_ROLE_NAMES` array literal from each, assert deep-equal. Fails CI on any drift. Not deferred. |
| Moderator gates referenced but spec 003 not yet shipped | Deferred to PR-C. Document in spec 004 that PR-C is conditional. |
| Operator confusion (two onboarding paths: Portal + UI) | Banner on `/admin/manage-admins` (FR-430) explains the precedence. |
