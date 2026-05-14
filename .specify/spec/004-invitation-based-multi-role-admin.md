# Feature Specification: Invitation-Based Multi-Role Admin

**Feature Branch**: `004-invitation-based-multi-role-admin`
**Created**: 2026-05-14
**Status**: Draft
**Input**: User description: "Restrict the admin area to users invited via the Role management blade. Different roles allow different admin capabilities — moderation, messaging, overall admin. Future roles can be added (e.g. for chat moderation) without code changes to the role assignment system."

---

## Summary

Splits the current monolithic "admin" capability into three explicit roles assigned via the SWA Portal's invitation system: `manager`, `moderator`, `messenger`. Each role gates a distinct subset of admin endpoints, so a moderator can address reports without being able to send admin messages, and a messenger can run a ticketing flow without being able to ban users. Admin assignment becomes a one-click Portal operation rather than a code path through the Cosmos `adminRoster` doc.

Deprecates (but does not yet delete) the Cosmos-roster admin system shipped in PRs #32-#35 + #43. The roster remains live as a fallback in case Microsoft retires the SWA invitation system — a real risk Microsoft has signalled (originally said March 2025, currently still operational on existing SWAs as of 2026-05). PR #49 already shipped the recognition layer (`principalHasAdminRole`) treating all admin-tier roles as equivalent; this spec layers per-role permissions on top.

---

## Why this matters

- **Reduce blast radius of admin compromise**: a stolen `messenger` session can't ban users; a stolen `moderator` session can't impersonate the platform via tickets. Today a single `admin` role grants everything.
- **Self-service admin onboarding**: today the maintainer either runs through the `/admin/manage-admins` UI or relies on the `ADMIN_GITHUB_LOGINS` env var bootstrap. Invitations remove the manage-admins UI entirely — onboarding happens in the Azure Portal, where ops people already are.
- **Free tier compatibility**: invitations are the only role-assignment mechanism Microsoft officially supports on SWA Free. `rolesSource` (the function-based alternative) is Standard-only. Confirmed working on dev (`principal.userRoles` includes `manager`).
- **Future extensibility**: adding a new role (e.g. `chat-moderator` for spec 005's messaging surface) becomes a Portal action + a config map update — no migration of Cosmos data.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Maintainer invites a manager (Priority: P1) 🎯 MVP

As the maintainer, I can invite another GitHub user with the `manager` role via the Portal Role management blade, and they receive full admin access on next sign-in.

**Why this priority**: This is the foundational story — without it, multi-role onboarding doesn't exist. The maintainer themselves already has `manager` (set during PR #48's verification work).

**Independent Test**: From Azure Portal → Static Web App (`codepals-dev`) → Role management → Invite, generate an invitation for `<github-handle>` with role `manager`. Send the link, the invitee signs in, hits `/admin`, sees the full admin UI surfaces (users list, manage admins, reports queue when shipped).

**Acceptance Scenarios**:

1. **Given** the maintainer creates an invitation with role `manager`, **When** the invitee accepts the link and signs in via GitHub, **Then** their `principal.userRoles` includes `manager` and they can view `/admin` without 403.
2. **Given** a user invited with role `manager`, **When** they call `GET /api/admin-users`, **Then** they receive 200.
3. **Given** an invitation expires or is revoked in the Portal, **When** the user signs in again, **Then** their `userRoles` no longer carries `manager` and `/admin` returns 403.

---

### User Story 2 — Moderator handles reports without messaging powers (Priority: P1)

As a community moderator (e.g. a trusted volunteer), I can be invited with role `moderator` and use the moderation queue, but I cannot send platform-branded messages to users.

**Why this priority**: This is the principle-of-least-privilege story that motivates the whole split. Same priority as US1 because the split has no value without at least one role split visible to users.

**Independent Test**: Invite a test account with role `moderator`. Sign in as that account. `GET /api/admin/reports` returns 200. `POST /api/admin/messages` returns 403 (when spec 005's admin messaging ships).

**Acceptance Scenarios**:

1. **Given** I'm invited with role `moderator` only, **When** I open `/admin`, **Then** I see the reports queue, audit log, and user-ban actions. I do NOT see message-sending UI or admin-roster management UI.
2. **Given** I'm a moderator, **When** I call moderation endpoints (`/api/admin/reports*`, `/api/admin/ban`), **Then** I receive 200 (subject to specific endpoint semantics).
3. **Given** I'm a moderator, **When** I call manager-only endpoints (`/api/admins-grant`, `/api/admins-revoke`), **Then** I receive 403.

---

### User Story 3 — Messenger runs a ticketing flow (Priority: P2)

As a support-role user, I can be invited with role `messenger` to send platform-branded messages and run a CMS/ticket flow with users, without seeing moderation tools or admin-roster management.

**Why this priority**: P2 because spec 005's admin messaging is the prerequisite — this role has no surface to gate until messaging ships. Defined here so the role taxonomy is complete and the messaging surface can refer to it.

**Independent Test**: After spec 005 lands, invite a test account with role `messenger`. They can `POST /api/admin/messages` but not `POST /api/admin/ban`.

**Acceptance Scenarios**:

1. **Given** I'm invited as `messenger`, **When** I open `/admin`, **Then** I see the CMS/ticketing UI and nothing else.
2. **Given** I'm a `messenger`, **When** I send a platform message via the admin messaging endpoint, **Then** the message lands in the target user's inbox flagged as `kind: 'admin'`.

---

### User Story 4 — Fallback to Cosmos roster (Priority: P3)

As the maintainer, if Microsoft retires the SWA invitation system, I can still grant admin roles by entering users into the Cosmos `adminRoster` doc — either via the existing `/admin/manage-admins` UI or a direct write.

**Why this priority**: P3 because invitations are working today. Defined as a contingency so the deprecation path of the roster is reversible without an emergency rewrite.

**Independent Test**: Disable invitation roles (simulate retirement by removing the invited role from the SWA's role registry), then grant admin via `POST /api/admins-grant`. The granted user can still access `/admin` on next sign-in, because `isAdminFor()` queries the Cosmos roster as a fallback when `principal.userRoles` lacks an admin-tier role.

**Acceptance Scenarios**:

1. **Given** a user has no admin-tier role in `principal.userRoles` AND their user record is in the Cosmos roster, **When** they sign in, **Then** they have admin access (via `isAdminFor` fallback).
2. **Given** the roster path is the only one active (no invitations), **When** the maintainer uses `/admin/manage-admins` to grant admin, **Then** the new admin gets access on next sign-in.

---

## Edge Cases & Decisions

- **User has multiple admin roles simultaneously** (e.g. invited as both `manager` and `moderator`): they get the **union** of capabilities. Treated as a "manager who can also do moderation actions" — no conflict.
- **A `manager` is invited, then their invitation is revoked but their old user record is still in the Cosmos roster**: the roster is checked AFTER `principal.userRoles`. Roster grants admin even though invitation no longer does. By design — supports the fallback story. The maintainer who wants a hard revoke must remove from both the invitation system AND the roster.
- **The `admin` role string is treated as equivalent to `manager`** for backward compatibility. Pre-spec-004 roster entries say `roles: ['admin']`; we don't migrate them.
- **The maintainer themselves can't revoke their own `manager` role via the API** — Portal-side they could, but for the API path we keep the existing "cannot revoke the last remaining admin" guard from `admins-revoke.ts`. This guard now considers any admin-tier role across the roster + invited set [NEEDS CLARIFICATION: simpler is to keep the guard on the roster only since invitations are operator-managed in the Portal anyway].
- **No promotion from one role to another via API** — re-invite via Portal. Avoids ambiguity about who can elevate whom.

---

## Functional Requirements *(mandatory)*

### Role definitions

- **FR-401**: System MUST recognise four admin-tier role names in `principal.userRoles`: `admin`, `manager`, `moderator`, `messenger`. The full list lives in `api/src/lib/admin-roles.ts` (`ADMIN_ROLE_NAMES`) and `src/services/api.ts` (mirror); both files MUST stay in sync.
- **FR-402**: `admin` (legacy) and `manager` MUST be treated as equivalent for permission purposes — both grant the full admin surface.
- **FR-403**: `moderator` MUST grant access to moderation endpoints (defined per spec 003) but MUST NOT grant access to admin-roster management or admin messaging.
- **FR-404**: `messenger` MUST grant access to admin messaging endpoints (defined per spec 005) but MUST NOT grant access to moderation or admin-roster management.
- **FR-405**: A user with any admin-tier role MUST see the admin nav item in the Header; clicking it lands on `/admin`, where the surfaces visible to them are the union of what their roles permit.

### Endpoint gating

- **FR-410**: `GET /api/admin-users` MUST require any admin-tier role.
- **FR-411**: `GET /api/admins-list`, `POST /api/admins-grant`, `POST /api/admins-revoke` MUST require `manager` (or `admin` legacy). Moderators/messengers MUST get 403.
- **FR-412**: `GET /api/admin/reports`, `POST /api/admin/reports/:id/action`, `POST /api/admin/ban` (spec 003) MUST require `moderator` OR `manager`.
- **FR-413**: `POST /api/admin/messages`, `GET /api/admin/tickets`, `POST /api/admin/tickets/:id/resolve` (spec 005) MUST require `messenger` OR `manager`.
- **FR-414**: Every admin endpoint MUST first check the **specific** roles it requires (e.g. `manager` for `/api/admins-grant`; `moderator OR manager` for moderation; `messenger OR manager` for CMS). If the principal's `userRoles` contains one of the required roles, grant access. **If not — even if the principal has some other admin-tier role** — fall through to `isAdminFor()` (roster lookup) and grant only if the roster lists the user. This ensures legitimate legacy admins (who hold `admin` in the Cosmos roster but were invited as `messenger`) still pass a manager-only endpoint via the roster path, because the roster fallback is `manager`-equivalent (FR-402). Worked example: a user with `principal.userRoles: ['messenger']` calling `POST /api/admins-grant` — the principal-only check fails (messenger isn't manager), but if their user id is in the roster they pass via the roster fallback.

### UI

- **FR-420**: The Header's admin link MUST show when the principal has any admin-tier role.
- **FR-421**: The `/admin` page MUST conditionally render sub-surfaces based on the principal's roles: roster-management section only for `manager`, reports queue only for `moderator`/`manager`, CMS only for `messenger`/`manager`.
- **FR-422**: An admin-tier user navigating to a sub-surface they lack permission for MUST receive the same "Forbidden" message the API returns, not a blank page or a generic 500.

### Roster deprecation (gradual)

- **FR-430**: The `/admin/manage-admins` UI MUST add a banner indicating that "Admin onboarding is now managed via the Azure Portal Role management blade. This UI remains for legacy maintenance only."
- **FR-431**: `POST /api/admins-grant` MUST continue to work for `manager`-authenticated callers — kept as the fallback path per US4.
- **FR-432**: A future spec (queued as 004-followup, not in this MVP) will fully retire the roster path once invitations have been confirmed stable for ≥6 months.

### Operator setup

- **FR-440**: Documentation (`AZURE_SETUP_GUIDE.md`) MUST describe the Portal invitation flow as the primary admin-onboarding path, with the `/admin/manage-admins` UI as fallback.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Microsoft retires the SWA invitation system | Cosmos roster path remains live (FR-431). The maintainer can grant admin via `/admin/manage-admins` UI if invitations stop working. Monitor the deprecation timeline; flip the default if Microsoft announces a hard cutoff. |
| A user is invited with `manager` AND has a pre-spec-004 user record with `roles: ['admin']` | FR-402 makes them equivalent — no behaviour difference. The user record's `roles` array is informational; the principal's `userRoles` is authoritative. |
| Two admin-tier roles needed simultaneously (e.g. a "lead moderator" who can also message users) | Multi-role invitations are supported — invite with `["moderator", "messenger"]`. Capabilities union. |
| Stale roles after revocation | SWA refreshes `userRoles` on every authenticated request from the invitation registry. No client-side caching beyond the current page load (already memoised via `getPrincipalWithRoles`). Sign out + sign back in if a revocation needs to be immediate. |
| Invitation links shared with the wrong person | Standard Portal feature: links are single-use and expiry-bound. Operator hygiene problem, not a product problem. |

---

## Out of Scope

- **Role assignment via in-app UI** — deliberately Portal-only. Keeps the admin-roster code small and the trust boundary clear (Portal access = admin grant; app-level access = use the granted role).
- **Time-bound roles** ("moderator until 2026-12-31") — not supported by the invitation system; defer to operator hygiene.
- **Per-feature role splits beyond the three named** — `manager`, `moderator`, `messenger` cover the foreseeable surface. Add more (e.g. `analytics`) as new specs.
- **Migration of the `roles: ['admin']` field on legacy `users` docs** — left as-is; FR-402 collapses the difference.

---

## Constitution Compliance Check

| Principle | Compliance |
|---|---|
| **P1 — User-First & Inclusive** | Reduces ad-hoc admin overhead; volunteer moderators can be onboarded without compromising platform-level access. ✅ |
| **P2 — Privacy by Default** | `principal.userRoles` flows through standard SWA auth; no new PII surfaces. ✅ |
| **P3 — Security (NON-NEGOTIABLE)** | Principle-of-least-privilege at the role level. Each endpoint enforces specifically; defence-in-depth retained via `isAdminFor` fallback. ✅ |
| **P4 — Accessibility (NON-NEGOTIABLE)** | Admin UI changes are conditional rendering only — no new a11y surface. ✅ |
| **P5 — No Dark Patterns (NON-NEGOTIABLE)** | Admin role grants are explicit; users never auto-elevated. ✅ |
| **P6 — Open & Transparent** | Roles documented in code constants + `AZURE_SETUP_GUIDE.md`. Audit log (when spec 003 US3 lands) captures who-did-what. ✅ |
| **P7 — Brand consistency** | No brand-facing surfaces. ✅ |
| **P8 — i18n-friendly** | Role names stay English internal identifiers; user-facing labels translatable. ✅ |

---

## Open Questions

- [ ] **Per-role 403 messages** — should the API surface "you have role X but need role Y" or stay opaque ("Forbidden")? Default opaque to avoid enumerating internal roles to attackers; revisit if it frustrates legitimate admins.
- [ ] **Roster repair vs invitation flag conflict** — what if a user is in the Cosmos roster AND has a revoked invitation? Today they'd still pass via the roster. Confirm this is the desired semantic — see Edge Cases above.
- [ ] **Should `messenger` see other messengers' sent tickets**? Privacy vs collaboration. Defer to spec 005 design.

---

## Success Criteria

- **SC-401**: A user invited with `manager` can perform every action the legacy `admin` role could, with no functional regression.
- **SC-402**: A user invited only with `moderator` can address a report queue end-to-end (when spec 003 lands) but receives 403 on every manager-only endpoint.
- **SC-403**: The maintainer can revoke any admin's access by removing them from the Portal Role management **AND** from the Cosmos roster (via `POST /api/admins-revoke`). Both surfaces must be cleared because the roster is intentionally retained as a fallback (FR-431, US4). A hard-revoke runbook entry MUST exist documenting both steps; partial revocation (Portal only, or roster only) leaves access intact.
- **SC-404**: If invitations are unavailable (simulated by disabling the role in `staticwebapp.config.json`), the maintainer can still onboard a new admin via `/admin/manage-admins` — no code change needed.
