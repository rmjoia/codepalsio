# Feature Specification: Community Safety & Anti-Abuse

**Feature Branch**: `003-community-safety-and-anti-abuse`
**Created**: 2026-05-08
**Status**: Draft
**Input**: User description (paraphrased): "We're going to start having codepals registered and listed; we have to have a particular focus on privacy and security. We don't want people exploiting this to find dates and partners for nothing else than learning to code."

This is a **cross-cutting spec**. It defines the platform-wide safety stance and the controls each future user-facing feature must implement (or justify omitting). It is paired with **`002-spoken-languages-and-discovery-filter.md`** — that spec consumes this one's defenses. This document also informs **all future** features that touch profile data, discovery, or interaction (connections, messaging, notifications).

---

## Summary

CodePals' value proposition is connecting developers for learning, mentoring, and pairing — not for romantic or social outreach. As soon as the directory has > 100 codepals with public profiles, abuse vectors that already exist on every developer-directory product (LinkedIn, GitHub, Stack Overflow) will appear here too: dating-app exploitation, harassment, doxxing-via-narrow-filter, scraping for outreach lists, impersonation. This spec captures the threat model and the **layered defenses** that make those vectors expensive enough to be impractical.

The constitution already commits to Privacy and Security as **NON-NEGOTIABLE** principles (1.3.0, Principles 3 and 5). This spec operationalizes those principles for community-facing surfaces. It does NOT replace `CODE_OF_CONDUCT.md`, `PRIVACY.md`, `SECURITY.md`, or `TERMS.md` — it complements them by making the implementation requirements concrete.

---

## Threat Model

| Threat | Description | Existing Mitigation | Gap |
|---|---|---|---|
| **T1** Dating-app exploitation | Users contact others for romantic/dating outreach instead of code-related collaboration | Implicit (CoC), no explicit ToS clause | ToS clause + reporting workflow |
| **T2** Harassment | Targeted unwanted contact, slurs, or repeated unwelcome outreach | CoC, GitHub-level blocking (out-of-band) | In-app blocking, reporting, moderation |
| **T3** Doxxing-via-filter | Combining narrow facets (location + language + availability) to single out a person and identify them | None | Filter uniqueness guard (spec 002 FR-011) |
| **T4** Scraping for outreach | Bot enumerates the public directory to harvest GitHub usernames for off-platform outreach (recruiter spam, phishing, dating) | `/find` is `authenticated`-gated (login required) | Rate-limiting on /api/profiles + log-driven anomaly detection |
| **T5** Impersonation | Account claims to be someone they're not (a known dev, a celebrity, etc.) | GitHub OAuth (account is tied to a real GitHub login); `githubUsername` is server-set, not user-claimed | Rare for our scale; reporting catches it |
| **T6** Filter for protected attributes | Filter combinations infer gender / age / nationality / disability from non-protected facets | Currently no fields collect these directly; profile fields are self-declared opt-in | Avoid adding facets for protected attributes; document this as a non-goal in every future feature spec |
| **T7** Profile data exfiltration via API | Authenticated user calls /api/profiles with crafted parameters to bypass visibility | `/api/profiles` query has explicit `c.profileVisibility = 'public'` filter, structurally enforced (privacy-guard tests in `profiles-list.test.ts`) | Maintain test coverage; add similar guards on every new discovery endpoint |
| **T8** Stale data from auth migration | Pre-PR-#14 user records / profiles inadvertently exposed to others (legacy hash as id, etc.) | Auto-heal in `findProfileWithAutoHeal` (PR #40) re-keys legacy data + rotates id away from the legacy SWA principal hash (PR #40, closes #27) | Continue this pattern for any future schema migrations |
| **T9** Compromised admin / insider misuse | A legitimate admin account is phished or sold; OR an admin acts maliciously (mass-suspends users, exfiltrates report notes, grants admin to a confederate). High blast radius because admin endpoints carry destructive actions (suspend, unlist, revoke). | (a) Audit log (FR-122) — every admin action is recorded immutably with `(adminId, action, target, timestamp)`, joinable by reportId. (b) Defense-in-depth role checks in handlers (mirroring `admin-users.ts`), not just SWA route gates. (c) Anti-self-action guard (FR-123) — admin can't suspend/unlist themselves. (d) Roster atomicity (PR #35) — admin grants/revokes are CAS-protected, can't race. (e) CODEOWNERS (PR #39) requires maintainer review on every admin/auth code change. | (e) Alerting on abnormal admin activity volumes (e.g., > N suspensions/hour, > M unlists/day) — instrumented via FR-150 logging, alerting wired in a future ops spec. (f) Admin role rotation policy (constitution-level: how long does admin persist? grants expire?) — out of scope for MVP, called out for the constitution amendment that introduces it. |

---

## Defense Principles

These principles MUST be considered in every spec and PR review touching profile, discovery, or interaction:

- **DP-1 (Layered defenses)**: No single mechanism is the line of defense. Combine policy (ToS), prevention (validation, rate limits), detection (logging), and response (reporting + moderation). Removing one layer must not silently disable the others.
- **DP-2 (Default to private)**: New profile fields default to `private` (or absent from public listings) until the product team explicitly publishes them. Publishing requires updating the user-facing privacy notice.
- **DP-3 (Server-derived discovery signals)**: Fields used as discovery signals (`githubUsername`, `spokenLanguages`, future skills/availability) MUST be server-validated against allow-lists where possible. Never trust the client.
- **DP-4 (Don't add facets for protected attributes)**: Gender, sexual orientation, religion, disability status, age — out of scope as profile fields, full stop. If a future feature would benefit from one of these (e.g., "support women in tech"), it must be discussed in a constitution amendment, not a feature PR.
- **DP-5 (Reportable surfaces)**: Anything a user can publish to others must be reportable by other users. The reporting URL must be one click away from the offending content.
- **DP-6 (Auditable moderator actions)**: Every admin action (suspend, unlist, role grant/revoke) writes an immutable audit row. Already partially in place via `admin-roster` race-safe writes (PR #35).
- **DP-7 (Visibility ≠ deletion)**: Unlisting a profile from /find does NOT delete its data. The user can re-publish. Account deletion is a separate, fully-destructive operation (existing `/api/account-delete`).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Terms of Service explicitly excludes romantic / dating use (Priority: P1) 🎯

As a CodePals operator, I want the Terms of Service to explicitly state that the platform is for code learning, mentorship, and pairing — and that using it for dating, romantic, or solely-social outreach is grounds for removal — so reports of that behaviour have a clear policy basis for moderator action.

**Why this priority**: Without this clause, every other defense in this spec is opinion-based. Policy first, mechanism second. This is a one-line text change to `TERMS.md` plus a one-line update to the on-boarding consent flow that links to the updated terms.

**Independent Test**: Visit `TERMS.md` (or its rendered route in the app); verify the new clause is present, links from the on-boarding flow, and is referenced in the reporting form.

**Acceptance Scenarios**:

1. **Given** the deployed app, **When** I open `TERMS.md`, **Then** I see a numbered clause naming the prohibited uses and the consequence (account removal).
2. **Given** I'm on the reporting form, **When** I select "Reason: Off-topic outreach (dating/social)", **Then** the form references the Terms clause by number.

---

### User Story 2 — Authenticated user reports a profile (Priority: P1)

As a signed-in codepal who has encountered behaviour that violates the Terms (off-topic outreach, harassment, etc.), I can report the offending profile from the profile view page, providing a category and an optional note. The report is queued for admin review, and I'm told it was received.

**Why this priority**: Reporting closes the loop between the ToS clause and enforcement. Without it, the clause is unenforceable in practice. P1 because it's the minimum viable enforcement mechanism.

**Independent Test**: Sign in as user A, view user B's profile (test fixture), click "Report", select a reason, submit. Sign in as admin, view the moderation queue, see the report.

**Acceptance Scenarios**:

1. **Given** I'm viewing another codepal's profile, **When** I click "Report", **Then** I see a dialog with a reason picker (categories, no free text in the picker; an optional 500-char note field).
2. **Given** I submit a report, **When** the request is processed, **Then** a `Report` document is created in Cosmos with `{reporterId, reportedProfileId, reason, note?, createdAt, status: 'open'}` and I see a confirmation toast.
3. **Given** I report the same profile twice within 24h, **When** the second submission lands, **Then** the existing report row is updated in place (last note wins, `updatedAt` advances) and a single row remains in the admin queue — prevents brigading inflation. The repository contract is "upsert by (reporterId, reportedProfileId, 24h-window)", not "always insert".
4. **Given** an admin views `/admin/reports`, **When** they load the page, **Then** they see open reports newest-first, with reporter / reported / reason / note / 'view profile' link / actions (dismiss / suspend / unlist).
5. **Given** the reported profile no longer exists (account-deleted), **When** the admin views the report, **Then** the row shows "Profile deleted" gracefully and the only action is "Dismiss".

---

### User Story 3 — Admin moderation queue with audit trail (Priority: P1)

As an admin, I see all open reports in a queue at `/admin/reports` and can take action: dismiss (no violation), unlist (`profileVisibility = 'private'` set by admin, distinct from owner-initiated private), or suspend (block the user from logging in). Every action writes an audit row.

**Why this priority**: The companion to Story 2. Reports without a moderation surface are useless.

**Independent Test**: Run with one open report. As admin, click "Unlist". Verify the reported profile's `profileVisibility` flips to `'private'` AND an audit row is written with `{adminId, action: 'unlist', targetProfileId, reportId, timestamp}`. Verify the report's `status` becomes `'resolved'`.

**Acceptance Scenarios**:

1. **Given** an open report, **When** admin clicks "Dismiss", **Then** report `status` flips to `'dismissed'`, an audit row is written, no profile changes.
2. **Given** an open report, **When** admin clicks "Unlist", **Then** the reported profile's `profileVisibility` becomes `'private'` (with `unlistedBy: <adminId>` for distinction from owner-initiated), report status becomes `'resolved'`, audit row written.
3. **Given** the unlisted profile owner logs in, **When** they view `/profile/edit`, **Then** they see a banner: "Your profile has been unlisted by a moderator. See [reason]." and the visibility toggle is disabled until an admin re-enables it.
4. **Given** an open report, **When** admin clicks "Suspend", **Then** the user's `users` doc gets `suspended: true`, the rolesSource handler returns `[]` for them (no roles → no auth-gated routes accessible), and an audit row is written. (Suspension is reversible.)

---

### User Story 4 — User-side blocking (Priority: P2)

As a signed-in codepal, I can block another codepal so they no longer see me on `/find` and cannot send me connection requests in the future. Blocking is one-directional and silent — the blocked user is not notified.

**Why this priority**: Blocking is the user's own remediation tool when reporting feels excessive (or when they just don't want a particular interaction without making a moral judgment). P2 because reporting + admin moderation already covers the worst case; blocking is the ergonomic improvement.

**Independent Test**: User A blocks user B. User A and B both have public profiles. Sign in as B and visit `/find` — A should not appear. Sign in as A and visit `/find` — B does not appear. Both still see the rest of the directory.

**Acceptance Scenarios**:

1. **Given** I'm viewing another codepal's profile, **When** I click "Block", **Then** I see a confirm dialog explaining "They won't see you on /find or be able to contact you. They are not notified."
2. **Given** I block user X, **When** I or X visit `/find`, **Then** the other party does not appear in either's results (mutual hide).
3. **Given** I unblock user X, **When** either of us refreshes `/find`, **Then** the other reappears subject to normal visibility rules.
4. **Given** I attempt to block more than 100 users, **When** the request lands, **Then** it's rejected with HTTP 400 (anti-DoS cap, documented).

---

### User Story 5 — Filter uniqueness guard (Priority: P1, cross-ref spec 002)

This story lives primarily in **spec 002 FR-011**. Recapping here so the safety surface is contiguous: any /find filter combining ≥ 2 narrowing facets that resolves to fewer than 5 candidates returns a "Broaden your filters" sentinel instead of identifying matches. The threshold is reviewable via FR-012-style logging.

---

### User Story 6 — Connection requests must include a stated coding context (Priority: P3, deferred)

A future feature (not in this spec's MVP) will let codepals send connection requests via the platform. When that feature lands, this spec mandates that the request payload includes a free-text "what do you want to learn / build / pair on?" field, capped at 500 chars, stored on the request, and visible to the recipient before they accept. Empty or sub-20-character submissions MUST be rejected client-side with a "Tell them what you'd like to collaborate on" prompt.

This serves two purposes: (1) friction against drive-by outreach, (2) gives the recipient context to consent — and gives moderators evidence if the request was off-topic.

**Acceptance** (deferred): designed as an explicit field on the connection request entity in the connections feature spec, when written.

---

### Edge Cases

- **Self-report**: Submitting a report on your own profile — rejected client-side with "You can edit/delete your profile directly".
- **Admin acts on themselves**: An admin can't suspend/unlist themselves (server-side guard) — must be done by another admin (or via account-delete). Existing admin tooling already prevents last-admin-suspension.
- **Blocked user changes username**: GitHub usernames can be renamed. Block records use the SWA principal hash (`userId`), not the github login, so renames don't break the block.
- **Bulk reporting / brigading**: a single profile receives 50 reports in 5 minutes — the queue surfaces them as a single inflated row with `reportCount: 50`, and the admin sees a "spike" indicator. Not auto-actioned — humans decide.
- **Account deletion of a reported user**: Reports remain in the audit log (anonymized to `<deleted user>`) for the retention period documented in PRIVACY.md.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Policy

- **FR-101**: `TERMS.md` MUST include an explicit clause naming prohibited uses (romantic/dating/non-coding outreach) and the consequence (account removal).
- **FR-102**: The on-boarding flow MUST present the updated Terms before the user can complete profile setup, with a clear acceptance gesture.

#### Reporting

- **FR-110**: Authenticated users MUST be able to report any profile they can view from the profile-view page.
- **FR-111**: A `Report` document MUST be created in a new `reports` Cosmos container with the schema in "Key Entities" below.
- **FR-112**: Reports MUST be de-duplicated per (reporterId, reportedProfileId) within a 24-hour window. The repository contract is **upsert** keyed on that tuple: a second submission within the window updates the existing row's `note` and `updatedAt` (last-note-wins) and does NOT create a new row. Outside the 24-hour window, a new row is created. The admin queue therefore shows one row per (reporter, reported) pair within the dedup window, regardless of resubmissions.
- **FR-113**: The reporter MUST receive a non-detailed confirmation ("Thanks, we'll review.") — never feedback about the outcome (privacy of the reported user).

#### Moderation

- **FR-120**: Admins MUST have a `/admin/reports` route showing open reports, sortable, filterable by reason / age / report-count.
- **FR-121**: Admins MUST be able to dismiss / unlist / suspend with one click from the queue.
- **FR-122**: Every moderator action MUST write a row to a `audit` Cosmos container: `{id, adminId, action, targetUserId?, targetProfileId?, reportId?, reason?, timestamp}`.
- **FR-123**: An admin MUST NOT be able to suspend or unlist themselves (server-side check).
- **FR-124**: Suspension MUST be enforced via SWA's role-based route gating, not via `roles: []` from rolesSource alone. SWA's built-in `authenticated` role is granted to every signed-in user regardless of what the rolesSource handler returns; gating user-facing routes on `authenticated` therefore does NOT prevent a suspended user from reaching them. To enforce suspension:
  - Introduce a custom role **`member`** that the rolesSource handler grants to signed-in, non-suspended users (and `admin` continues to imply `member`).
  - Gate all user-facing routes (`/profile/*`, `/find`, `/welcome`, `/api/profile-*`, `/api/profiles`, `/api/account-delete`, `/api/reports*`, `/api/blocks*`) on `member` instead of `authenticated`.
  - Introduce a public route **`/suspended`** with `allowedRoles: ['anonymous', 'authenticated']` — accessible by anyone signed in (even without `member`), so suspended users can land on it after login.
  - The rolesSource handler grants `['suspended']` (and NOT `member`) to suspended users; the `/suspended` page renders a clear "Your account is suspended" message keyed on that role for the signed-in branch.
  - The `responseOverrides.401` redirect MUST direct to `/.auth/login/github` for unauthenticated users and to `/suspended` for users with the `suspended` role (this distinction is achievable via separate route entries, since the SWA gate evaluates `allowedRoles` per route).
- **FR-124a**: `/api/get-roles` (rolesSource) MUST return `['suspended']` for users with `users.suspended === true`, and MUST NOT return `'member'` or `'admin'` for them. Admins MAY also be suspended; in that case `'admin'` is also withheld until unsuspension.
- **FR-124b**: Server-side defense-in-depth: every authenticated handler (e.g., `profile-save`, `profile-get`, `profiles-list`) MUST check `users.suspended === true` for the calling principal AND return HTTP 403 if so, even if the SWA gate somehow let the request through. This mirrors the existing pattern of admin handlers double-checking the role server-side (see `admin-users.ts`). Cost is one user-record point-read per request, cached if hot.
- **FR-125**: Unlisted profiles MUST have `unlistedBy: <adminId>` set so the owner sees a moderator-action banner distinct from their own private toggle.

#### Blocking

- **FR-130**: Authenticated users MUST be able to block another user from the other's profile view.
- **FR-131**: A `Block` row MUST be created in the `blocks` Cosmos container: `{id, blockerId, blockedId, createdAt}`.
- **FR-132**: `/api/profiles` MUST exclude profiles where `(currentUserId, profileId)` OR `(profileId, currentUserId)` exists in `blocks` (mutual hide).
- **FR-133**: Connection request endpoints (when implemented) MUST reject requests where blocker/blocked relation exists.
- **FR-134**: A user MUST NOT be able to maintain more than 100 active blocks (anti-DoS).
- **FR-135**: Blocking MUST be silent — the blocked user receives no notification or visible signal.

#### Discovery / Filter Hardening

- **FR-140**: Any new discovery filter (language, location, availability, future) MUST honor the uniqueness guard documented in spec 002 FR-011.
- **FR-141**: Profile fields proposed for inclusion in a discovery filter MUST be reviewed against DP-4 (no protected attributes) before merge. The PR description MUST explicitly call out the threat-model classification.

#### Logging

- **FR-150**: All moderator actions, block/unblock events, and report submissions MUST be logged at INFO level with structured fields (per existing logging conventions in the API handlers).
- **FR-151**: /find query parameters MUST be logged at INFO level (per spec 002 FR-012). Log retention follows PRIVACY.md.

### Key Entities

- **Report** (`reports` Cosmos container, partition key `/reportedProfileId`):
  - `id: string` — uuid
  - `reporterId: string` — SWA principal userId
  - `reportedProfileId: string`
  - `reportedUserId: string` — for join with users container
  - `reason: 'off_topic' | 'harassment' | 'impersonation' | 'spam' | 'other'`
  - `note?: string` — ≤ 500 chars
  - `createdAt: string` — ISO8601
  - `status: 'open' | 'resolved' | 'dismissed'`
  - `resolution?: { adminId, action, timestamp }`
- **AuditEntry** (`audit` Cosmos container, partition key `/adminId`):
  - `id: string`
  - `adminId: string`
  - `action: 'dismiss_report' | 'unlist_profile' | 'relist_profile' | 'suspend_user' | 'unsuspend_user' | 'grant_admin' | 'revoke_admin' | ...`
  - `targetUserId?` / `targetProfileId?` / `reportId?`
  - `reason?: string`
  - `timestamp: string` — ISO8601
- **Block** (`blocks` Cosmos container, partition key `/blockerId`):
  - `id: string` — `${blockerId}:${blockedId}`
  - `blockerId: string`
  - `blockedId: string`
  - `createdAt: string`

(Containers added to `infra/main.bicep` in spec 003's plan — declarative, not operator-clicked.)

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-101**: Within 1 day of merge, `TERMS.md` reflects the new clause and the on-boarding flow links to it.
- **SC-102**: Admin can resolve an open report in **< 30 seconds** of UI interaction (from `/admin/reports` to action committed and audit row written).
- **SC-103**: Reporting submission round-trip latency p95 < 500ms.
- **SC-104**: Mutual-block hide is enforced 100% across `/api/profiles` queries (verified by integration test analogous to the existing privacy-guard test).
- **SC-105**: Filter uniqueness guard (spec 002 FR-011) fires on 100% of qualifying queries (zero leaks of < 5 results when the threshold conditions hold).
- **SC-106**: 0 successful filter combinations that infer DP-4 protected attributes (sampled audit by maintainer or community review monthly).
- **SC-107**: 100% of moderator actions have a corresponding audit row (joinable via `reportId`).

---

## Out of Scope (deferred / future specs)

- **In-app 1:1 messaging**: a substantial feature that introduces new moderation surfaces. Not in MVP. When designed, it MUST require a stated coding context (see Story 6) and MUST be reportable per FR-110.
- **Behavioral anomaly detection**: e.g., automatically flagging accounts that issue > N reports / hour or filter > N times / minute. Useful at scale; premature for current usage.
- **Photo-attachment moderation**: avatars are GitHub-only (no uploads). Re-evaluate if/when uploads are introduced.
- **Country / region as a filter facet**: explicitly out — see DP-4.
- **Email notifications about moderator actions**: deferred until we have an email pipeline.
