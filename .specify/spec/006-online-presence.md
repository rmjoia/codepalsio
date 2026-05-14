# Feature Specification: Online Presence

**Feature Branch**: `006-online-presence`
**Created**: 2026-05-14
**Status**: Draft
**Input**: User description: "Users want to see who's online to discuss / get help. Show online status on /find and on profiles. Cheap approach, no real-time required."

---

## Summary

Adds a `lastSeenAt` field to user records, updated on every authenticated API call. A user is "online" if their `lastSeenAt` is within the last 5 minutes. Presence surfaces as a small indicator on `/find` cards and on profile pages. Zero new Azure resources — pure Cosmos field add.

Deliberately **server-driven**, **polling-free**, **best-effort**. No client heartbeat (privacy + simplicity). The signal is "this user has interacted with the platform in the last 5 minutes" rather than "this user has the tab open right now" — slightly looser semantics, dramatically cheaper.

---

## Why this matters

- **Discovery → interaction loop**: spec 005 enables messaging; presence raises the chance of an immediate reply by surfacing who's actually around.
- **Free**: no SignalR, no WebSockets, no Functions timer triggers. One Cosmos write per authenticated request (negligible RU cost).
- **Privacy-respecting**: no fine-grained activity tracking — just a coarse "active within 5 min" boolean. No "last seen 14m ago" precision exposed.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Codepal sees who's online on /find (Priority: P1) 🎯 MVP

As a signed-in codepal browsing /find, I can see at-a-glance which other codepals are currently online, so I can prioritise reaching out to people likely to respond.

**Why this priority**: Without presence, the directory's reach-out probability is uniform. With it, the directory becomes actionable in the now.

**Independent Test**: Two codepals exist. Sign in as A — A's `lastSeenAt` is updated. Sign in as B in another browser — B's `lastSeenAt` is updated. Visit `/find` as A — B's card shows a green "online" indicator. Wait 6 minutes without B doing anything. Refresh /find — B's card no longer shows online (lastSeenAt > 5min ago).

**Acceptance Scenarios**:

1. **Given** B has interacted with the platform within the last 5 minutes, **When** I view /find, **Then** B's card shows an "online" indicator (green dot or similar).
2. **Given** B's last interaction was 6 minutes ago, **When** I view /find, **Then** B's card does NOT show the online indicator.
3. **Given** I'm viewing /find, **When** the directory loads, **Then** each card's `isOnline` flag is already populated by the server (the API joins profiles with user docs server-side per FR-610 + FR-631 and projects only the derived boolean — no client-side fanout, no extra request, no flicker as indicators appear).
4. **Given** B has `profileVisibility: 'private'`, **When** I view /find, **Then** B's card doesn't appear at all (existing privacy guard — presence doesn't change visibility).

---

### User Story 2 — Codepal sees presence on a profile page (Priority: P2)

As a signed-in codepal viewing another codepal's profile, I can see whether they're online — same indicator as on /find.

**Why this priority**: P2 — once /find has it, individual profiles get the same affordance trivially. Same component, different page.

**Independent Test**: Visit `/profile/<other-username>`. If they're online (lastSeenAt < 5min), show indicator next to their display name.

**Acceptance Scenarios**:

1. **Given** I'm viewing another codepal's profile and they're online, **When** the page loads, **Then** their name has an "online" indicator next to it.
2. **Given** the same profile after they've been idle 10 minutes, **When** I reload, **Then** no indicator shows.

---

### User Story 3 — Presence opt-out (Priority: P2)

As a codepal who wants to be discoverable but not have my presence broadcast (e.g. "I'm here but don't want to be pinged"), I can keep my profile public AND independently toggle a "show online status" preference off via a separate `presenceVisible` flag — distinct from `profileVisibility`, which controls directory inclusion. **NEEDS CLARIFICATION**: do we want this opt-out at MVP, or accept that visible-profile = visible-presence as the simpler stance?

**Why this priority**: P2 — privacy-respecting, but adds UX surface. Defer if reasonable; preserve as a future toggle.

**Acceptance Scenarios**:

1. **Given** I toggle "Show my online status" off, **When** another codepal views /find or my profile, **Then** my online indicator never shows (even if I'm actively using the platform).

---

## Edge Cases & Decisions

- **Threshold**: 5 minutes. Chosen because it's the conventional cutoff (Slack uses ~5min for "active"), and matches Cosmos serverless's typical write-then-read latency comfortably.
- **Write frequency**: every authenticated API call writes `lastSeenAt = now()` to the user record. To avoid hot-spotting the user doc, batch: only write if the previous `lastSeenAt` was > 60s ago (server-side check). Same idea as TCP-style coalescing — at most one write per minute per user.
- **Storage location**: on the existing `users` container doc, NOT on the profile doc. Reasoning: profile docs are heavy (bio, skills, etc.) and read frequently for the directory; we don't want to dirty them on every API call. User docs are small and read on every authenticated request anyway.
- **Cross-document join**: directory query reads from `profiles` container. To surface presence, the API needs to join with `users` container. Two options:
  - **Server-side join**: `/api/profiles` reads profiles, then point-reads each user doc for lastSeenAt. O(N) point-reads = up to 100 × ~1 RU = 100 RU per /find call. Acceptable.
  - **Denormalise**: copy lastSeenAt onto the profile doc on each user-doc write. Avoids the join. Cost: profile doc gets dirtied frequently, undermining the original "don't dirty profile docs" principle. Reject.
  - Pick: server-side join (option 1).
- **Privacy**: no historical timestamp exposed. The API returns `{isOnline: boolean}` on each profile, not the actual `lastSeenAt` value.
- **Sign-out + immediate "offline" expectation**: we don't update lastSeenAt on sign-out (it'd require a SWA hook we don't have). The user will appear "online" for up to 5 more minutes after signing out. Acceptable.
- **Multi-device**: lastSeenAt is one value per user. If a user has the app open on phone and laptop, both refresh the same field. No conflict.
- **Botnet detection / abuse**: a malicious script polling /api endpoints can keep `lastSeenAt` fresh indefinitely. Not a real issue — the threshold doesn't gate any action, just a display.

---

## Functional Requirements *(mandatory)*

### Data model

- **FR-601**: `users` container UserRecord MUST add a nullable `lastSeenAt: string` (ISO 8601 timestamp). Backwards-compat: missing field = offline.
- **FR-602**: A middleware/helper on every authenticated API endpoint MUST update `lastSeenAt = now()` for the calling user — but only if the previous value is more than 60s old. This avoids one Cosmos write per request on a chatty session.
- **FR-603**: User opt-out preference `presenceVisible: boolean` (default `true`) MUST live on the user record. When `false`, `isOnline` reports `false` regardless of `lastSeenAt`. (Conditional on US3 surviving the open question.)

### API surface

- **FR-610**: `GET /api/profiles` (existing) MUST add `isOnline: boolean` to each returned profile. `isOnline = (now - lastSeenAt) <= 5min AND presenceVisible !== false`. The boundary is **inclusive** (`<=`) so the exact 5-minute mark counts as online — matches task T-610's boundary test (`lastSeenAt 5m ago → online`).
- **FR-611**: `GET /api/profile-get/:username` (if/when this endpoint exists for viewing others' profiles) MUST include `isOnline`. For viewing self, omit (no point indicating yourself online to yourself).
- **FR-612**: New endpoint `POST /api/presence/visibility` — body `{visible: boolean}` — updates the calling user's `presenceVisible`. Requires `authenticated`. (Conditional on US3.)

### UI

- **FR-620**: `/find` cards MUST render a green dot indicator with `aria-label="Online"` when `isOnline === true`.
- **FR-621**: Profile page MUST render the same indicator next to the user's display name when viewing someone else's profile and they're online.
- **FR-622**: Profile-edit page MUST add a toggle "Show my online status to others" controlling `presenceVisible`. (Conditional on US3.)

### Performance + cost

- **FR-630**: `lastSeenAt` write coalescing (FR-602) MUST keep per-user write rate at ≤1 per minute.
- **FR-631**: `/find`'s join with user docs MUST batch user-doc point-reads in parallel. User docs are partitioned by `/id`; each is ~1 RU. The current `DIRECTORY_PAGE_SIZE` is 100 (see `api/src/profiles-list.ts`); a full page therefore costs ~100 RU for the join alone.
- **FR-632**: Total RU per /find call MUST stay under 100 RU at the current `DIRECTORY_PAGE_SIZE` of 100 (current baseline is ~20 RU for the profile query; presence join adds up to ~100 RU at full page). If we want a tighter budget, the path is to **lower** `DIRECTORY_PAGE_SIZE` (e.g. to 50) — a UI pagination change tracked as a follow-up, NOT something this spec forces. For 006-A's MVP, accept the 100 RU/call ceiling; revisit if traffic warrants.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Cosmos RU spike from per-request writes | FR-602's coalescing keeps writes to ≤1/min per user. Even with 100 active users at saturation, that's 100 writes/min = ~6000/hr ≈ negligible RU. |
| Stale presence after sign-out | Acceptable — up to 5 min staleness. Documented in FR comments. |
| User feels surveilled | Opt-out toggle (FR-603, FR-612, FR-622) lets users disable broadcasting. Default ON because the value is in seeing peers, and the field is coarse. |
| Privacy violation if `lastSeenAt` ISO timestamp leaks | API never returns the raw timestamp — only the derived `isOnline` boolean. Verified by an invariant test on the `/api/profiles` response shape. |
| Race between "write lastSeenAt" middleware and the endpoint handler | The middleware fires async + write-through; the endpoint doesn't depend on the write completing. If the write fails, that request just doesn't update presence — next request retries. |

---

## Out of Scope

- **Precise "last seen N minutes ago" display** — coarse online/offline only.
- **Typing indicators** — UI affordance specific to active conversations (spec 005's domain, future).
- **Push presence updates** — pure polling/server-side derivation; no real-time.
- **Presence history / charts** — not stored.
- **Cross-tab presence sync** — out of scope; same user with two tabs both refresh the same `lastSeenAt`.

---

## Constitution Compliance Check

| Principle | Compliance |
|---|---|
| **P1 — User-First & Inclusive** | Coarse indicator reduces "are they around" friction; opt-out for users who want privacy. ✅ |
| **P2 — Privacy by Default** | API never exposes the raw `lastSeenAt`. Opt-out exists. Default is on (visibility tradeoff). ✅ |
| **P3 — Security (NON-NEGOTIABLE)** | No new attack surface. Write coalescing prevents abuse. ✅ |
| **P4 — Accessibility (NON-NEGOTIABLE)** | Indicator has aria-label. Toggle is keyboard-navigable. ✅ |
| **P5 — No Dark Patterns (NON-NEGOTIABLE)** | No "appear online to get attention" mechanic. Honest signal of recent activity. ✅ |
| **P6 — Open & Transparent** | Threshold + coalescing window documented in spec. ✅ |
| **P7 — Brand consistency** | Reuses existing Tailwind tokens (success-green for online). ✅ |
| **P8 — i18n-friendly** | "Online" string in i18n bundle. ✅ |

---

## Open Questions

- [ ] **Include US3 (presenceVisible toggle) in MVP**, or punt to a follow-up? Recommendation: include — it's small and adds privacy-by-design.
- [ ] **5min threshold vs 10min** — 5 min feels right; tune from logs after launch.
- [ ] **Indicator visual** — small dot vs avatar ring? Decide in plan.

---

## Success Criteria

- **SC-601**: Visiting /find while another codepal is active shows the green indicator on their card within 5 min of their last interaction.
- **SC-602**: Per-/find RU cost stays under 50 RU.
- **SC-603**: Per-user write rate to lastSeenAt is bounded at ≤1/min regardless of API call rate.
- **SC-604**: No `lastSeenAt` timestamp leaves the server (assert via response-shape test).
