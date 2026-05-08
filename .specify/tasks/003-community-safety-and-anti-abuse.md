---
description: "Task list for spec 003 — Community Safety & Anti-Abuse"
---

# Tasks: Community Safety & Anti-Abuse

**Input**: `.specify/spec/003-community-safety-and-anti-abuse.md`, `.specify/plan/003-community-safety-and-anti-abuse.md`
**Tests**: REQUIRED — every PR includes vitest unit/integration coverage and (where applicable) e2e.

**Constitution Compliance**: Each task MUST uphold Principles 1–8. Privacy + Security + Community-Governance tasks below explicitly annotate which principle drives them.

**Organization**: Each user story (US1..US4 from spec 003) is one shippable PR. Stories ship in priority order — US1 → US2 → US3 → US4.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: User Story 1 — Terms of Service clause (Priority: P1) 🎯

**Goal**: `TERMS.md` explicitly disallows romantic/dating/non-coding outreach and links from the on-boarding flow.

### Implementation

- [ ] **T-301** [US1] Add a numbered "Prohibited uses" clause to `TERMS.md` naming dating/romantic/social outreach as prohibited and stating the consequence (account removal). Keep the language clear and non-legalistic. (Principle 6 — Community & Governance.)
- [ ] **T-302** [US1] Update `src/pages/welcome.astro` to link to the relevant clause from the onboarding consent step.
- [ ] **T-303** [US1] Update `CODE_OF_CONDUCT.md` cross-reference if needed.
- [ ] **T-304** [US1] PR with assignee + Copilot review request; merge.

**Checkpoint**: ToS clause live. All subsequent enforcement (US2/3) has policy basis.

---

## Phase 2: User Story 2 — Reporting workflow (Priority: P1)

**Goal**: Authenticated users can report a profile via a one-click button. Reports land in a new `reports` Cosmos container.

### Foundational (this story owns the new container)

- [ ] **T-310** [US2] Add `reports` container to `infra/main.bicep` (partition key `/reportedProfileId`, indexing default).
- [ ] **T-311** [US2] Apply Bicep — once the infra-apply CI job (introduced by PR #46, [merge status to confirm]) is in `main`, the apply happens automatically on push. Until then, the operator runs `infra/Initialize-Infra.ps1 -Environment dev` once with Owner perms (per `infra/README.md`). Either path provisions the new container.

### Tests (REQUIRED — before implementation)

- [ ] **T-312** [P] [US2] `api/src/lib/reports.test.ts` — repo contract per FR-112: `upsertWithin24h(reporterId, reportedProfileId, note?)` finds the existing row keyed on `(reporterId, reportedProfileId)` if its `createdAt` is within the last 24h and updates `note` + `updatedAt` (last-note-wins); otherwise inserts a new row. Tests: insert when none exists; update-in-place inside the window; new insert outside the window; concurrent upserts converge.
- [ ] **T-313** [P] [US2] `api/src/reports-create.test.ts` — endpoint: 401 unauthenticated, validates reason enum, caps note at 500 chars, dedupes on (reporterId, reportedProfileId, 24h window), returns generic confirmation.

### Implementation

- [ ] **T-314** [US2] `api/src/lib/reports.ts` — `Report` type + `ReportRepository` interface + Cosmos impl + fake.
- [ ] **T-315** [US2] `api/src/reports-create.ts` — `app.http('reports-create', { methods: ['POST'], authLevel: 'anonymous' })` handler enforcing FR-110..113. Server reads `reportedProfileId` from body, looks up the reported profile to record `reportedUserId`, writes the Report.
- [ ] **T-316** [US2] `staticwebapp.config.json` — gate `/api/reports*` on `authenticated`. Update `src/staticwebapp.config.test.ts` route-gate assertions accordingly.
- [ ] **T-317** [US2] `src/components/ReportButton.astro` — opens a modal with reason picker + optional note + submit. POST to `/api/reports`. Confirmation toast on success.
- [ ] **T-318** [US2] Wire `ReportButton` into `src/pages/profile/index.astro` (visible on viewing other codepals' profiles).
- [ ] **T-319** [US2] PR with assignee + Copilot review request; merge.

**Checkpoint**: Users can submit reports. Admin queue not yet built (US3) — moderators read Cosmos directly until then. Acceptable for short window.

---

## Phase 3: User Story 3 — Admin moderation queue + audit (Priority: P1)

**Goal**: Admins see open reports at `/admin/reports`, can dismiss/unlist/suspend, every action audited.

### Foundational

- [ ] **T-320** [US3] Add `audit` container to `infra/main.bicep` (partition key `/adminId`).
- [ ] **T-321** [US3] Apply Bicep — auto via the infra-apply CI job (PR #46) once it's in `main`; otherwise `infra/Initialize-Infra.ps1 -Environment dev` (one-time operator run).

### Tests (REQUIRED)

- [ ] **T-322** [P] [US3] `api/src/lib/audit.test.ts` — append-only repo (no update/delete API), list-by-target.
- [ ] **T-323** [P] [US3] `api/src/reports-list.test.ts` — admin-only (401/403 invariants), pagination (TOP 100), default sort newest-open-first, filter by reason / age / report-count.
- [ ] **T-324** [P] [US3] `api/src/reports-resolve.test.ts` — admin-only, action enum, writes audit row, updates report status, anti-self-action guard (FR-123).

### Implementation

- [ ] **T-325** [US3] `api/src/lib/audit.ts` — `AuditEntry` type + `AuditRepository` (write-only + listByTarget) + Cosmos impl + fake.
- [ ] **T-326** [US3] `api/src/reports-list.ts` — admin endpoint, pagination + filters. Defense-in-depth admin role check (mirrors `admin-users.ts`).
- [ ] **T-327** [US3] `api/src/reports-resolve.ts` — admin endpoint. Switch on action (`dismiss` / `unlist` / `suspend`). For `unlist`: set `profileVisibility='private'` + `unlistedBy=<adminId>` on the profile. For `suspend`: set `suspended=true` on the user record. Always write audit row. FR-123 self-action guard.
- [ ] **T-328** [US3] `api/src/get-roles.ts` (and `api/src/lib/roles.ts:resolveRoles`) — return `['suspended']` for users with `users.suspended === true`. Non-suspended users get `['member']` (always) plus `['admin']` if they're in the AdminRoster. The `member` role is the new gate for user-facing routes (per FR-124). Suspended admins do NOT receive `'admin'` until unsuspended.
- [ ] **T-328a** [US3] `staticwebapp.config.json` — replace `allowedRoles: ['authenticated']` with `allowedRoles: ['member']` on every user-facing route (`/profile/*`, `/find`, `/welcome`, `/api/profile-*`, `/api/profiles`, `/api/account-delete`, and the new `/api/reports*` and `/api/blocks*` introduced by this spec). Keep `'admin'` gates as-is. Add `/suspended` route with `allowedRoles: ['anonymous', 'authenticated']`.
- [ ] **T-328b** [US3] `src/staticwebapp.config.test.ts` — extend the route-role-gate it.each table to assert each user-facing route has `member` (not `authenticated`). Add a new test asserting `/suspended` is reachable while signed in with only the `suspended` role.
- [ ] **T-328c** [US3] Server-side defense-in-depth (FR-124b): every authenticated handler MUST check the calling user's `users.suspended` flag and short-circuit with HTTP 403 if true. Add a shared helper `assertNotSuspended(principal, repo)` and wire it into `profile-get`, `profile-save`, `profiles-list`, `account-delete`, plus the new `reports-create`, `blocks-create`, `blocks-delete`. Tests cover the 403 path for each handler.
- [ ] **T-329** [US3] `src/pages/profile/edit.astro` — show "Your profile has been unlisted by a moderator" banner when `unlistedBy` is set; disable the visibility toggle.
- [ ] **T-330** [US3] `src/pages/admin/reports.astro` — moderation queue UI. Reuse the admin auth pattern from `admin/index.astro`. Action buttons inline.
- [ ] **T-331** [US3] `staticwebapp.config.json` — gate `/admin/reports` and `/api/reports/*/resolve` on `admin` role. Update `staticwebapp.config.test.ts`.
- [ ] **T-332** [US3] Suspended-user landing page — clear "Your account is suspended" message at `/suspended` (or rendered by 403 handler).
- [ ] **T-333** [US3] PR with assignee + Copilot review request; merge.

**Checkpoint**: Reports → review → action → audit pipeline complete. Spec 002 P1c precondition satisfied — language filter can be enabled.

---

## Phase 4: User Story 4 — User-side blocking (Priority: P2)

**Goal**: Users can block another user; mutual hide on /find; future connection requests rejected.

### Foundational

- [ ] **T-340** [US4] Add `blocks` container to `infra/main.bicep` (partition key `/blockerId`).
- [ ] **T-341** [US4] Apply Bicep — auto via the infra-apply CI job (PR #46) once it's in `main`; otherwise `infra/Initialize-Infra.ps1 -Environment dev` (one-time operator run).

### Tests (REQUIRED)

- [ ] **T-342** [P] [US4] `api/src/lib/blocks.test.ts` — create, delete, list-blockers-of, list-blocked-by.
- [ ] **T-343** [P] [US4] `api/src/blocks-create.test.ts` — auth, cap (FR-134, 100 active), idempotent, no notification side-effects.
- [ ] **T-344** [P] [US4] `api/src/blocks-delete.test.ts` — auth, idempotent unblock.
- [ ] **T-345** [P] [US4] `api/src/profiles-list.test.ts` — extend privacy-guard tests: blocker AND blocked relations both hide.

### Implementation

- [ ] **T-346** [US4] `api/src/lib/blocks.ts` — `Block` type + repo (create, delete, listByBlocker, listByBlocked) + fake.
- [ ] **T-347** [US4] `api/src/blocks-create.ts` + `blocks-delete.ts` — endpoints. Server-set `blockerId = principal.userId`, `blockedId` from body. Cap check.
- [ ] **T-348** [US4] `api/src/profiles-list.ts` — extend `PROFILES_QUERY` (or post-process) to filter by mutual block. Performance tradeoff: small in-memory filter on the 100-row page (`DIRECTORY_PAGE_SIZE = 100` per `api/src/profiles-list.ts:19`) is acceptable; revisit at scale or if/when the cap rises.
- [ ] **T-349** [US4] `src/components/BlockButton.astro` — wire onto `src/pages/profile/index.astro` (visible when viewing another codepal).
- [ ] **T-350** [US4] `staticwebapp.config.json` — gate `/api/blocks/*` on `authenticated`. Update `staticwebapp.config.test.ts`.
- [ ] **T-351** [US4] PR with assignee + Copilot review request; merge.

**Checkpoint**: Blocking works. Future connection-request feature must consult the `blocks` repo before delivering requests.

---

## Phase 5: Polish

- [ ] **T-360** [P] [SHARED] Update `PRIVACY.md` to describe new data flows (reports / audit / blocks; retention; visibility).
- [ ] **T-361** [P] [SHARED] Update `SECURITY.md` to mention reporting as the path for non-vulnerability community concerns (so security@ inbox is not the catch-all).
- [ ] **T-362** [SHARED] After 30 days of operation, revisit FR-112 dedup window and FR-134 block cap if ops data suggests different values.

---

## Dependencies

- **US1** (P1) — no dependencies; ships first.
- **US2** (P1) — blocks T-220 series of spec 002 (US2 — public discovery filter rollout).
- **US3** (P1) — blocks T-220 series of spec 002 too. Depends on US2 (queue needs reports to display).
- **US4** (P2) — independent. Can ship before or after spec 002 US2 rollout.

## Implementation Strategy

Sequential, in priority order. Each user story is one PR. After T-319 (US2 done) and T-333 (US3 done), spec 002 is unblocked for public rollout (T-220 series).

US4 can land before or after spec 002 enable — independent of the language filter rollout.
