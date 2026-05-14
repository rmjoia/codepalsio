# Feature Specification: User-to-User Messaging + Admin CMS/Ticketing

**Feature Branch**: `005-messaging-and-admin-tickets`
**Created**: 2026-05-14
**Status**: Draft
**Input**: User description: "Users should be able to message each other (mentor↔mentee, who's online, get help). Admins should be able to message users in a CMS/ticketing flow."

---

## Summary

Adds **async** user-to-user messaging — an inbox, conversation threads, send + read receipts — backed by a single `messages` Cosmos container partitioned by conversation id. Layered on top of the same schema, admins with the `messenger` role can send platform-branded messages and run a lightweight ticketing flow with users (open / responded / resolved states).

Deliberately **not** real-time. Polling on the page (refresh every 30s while the inbox is open) covers the perceived-immediacy need without the cost and complexity of SignalR or WebSockets. Real-time is a future spec; the data model is designed so adding presence-pushed updates later doesn't require a migration.

Spec 003 (community safety) is a hard prerequisite: blocking, reporting, and the ban mechanism MUST all work before this surface goes public. Messaging without moderation tools is the textbook abuse vector this platform was specced to avoid.

---

## Why this matters

- **Codepals can actually connect.** Profile + /find lets two people discover each other; without messaging the introduction loop dead-ends. This is the gap between "developer directory" and "developer community".
- **Admin → user communication is a real ops need.** Today the only way to talk to a user is via their GitHub profile (off-platform). For ToS questions, ban appeals, suspension notifications, etc., a platform inbox keeps the conversation auditable and in-context.
- **Free-tier compatible.** Cosmos serverless reads/writes are cents per thousand requests; messaging volume on a developer community is low. No new Azure resources.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Codepal sends a message to another codepal (Priority: P1) 🎯 MVP

As a signed-in codepal who found another codepal on `/find`, I can send them a direct message to introduce myself or ask a question, so the directory leads to an actual interaction.

**Why this priority**: This is the core user-value loop. Without it the directory is window-dressing.

**Independent Test**: Sign in as user A. Visit `/find`, click on user B's card, click "Message". Compose and send. Sign in as user B in another browser. Visit `/inbox`. See the conversation with A, click to open, see A's message.

**Acceptance Scenarios**:

1. **Given** I'm signed in and viewing user B's profile, **When** I click "Message" and submit "Hi", **Then** the message is persisted and B sees it on next `/inbox` load.
2. **Given** I send 3 messages to B in succession, **When** B opens the conversation, **Then** all 3 appear in send-order, marked as unread.
3. **Given** B replies, **When** I refresh `/inbox` (or the page polls), **Then** I see B's reply within ≤30s.
4. **Given** I send a message containing 5000 chars, **When** the request hits the server, **Then** it's rejected with 400 (max 4000 chars per message — see FR-510).
5. **Given** B has blocked me (spec 003), **When** I attempt to message B, **Then** I receive 403 and the message is not stored.

---

### User Story 2 — Codepal views their inbox and reads conversations (Priority: P1)

As a signed-in codepal, I can see all my conversations on `/inbox` ordered by most-recent activity, see unread counts, and open a conversation to read + reply.

**Why this priority**: Inbox without messaging is empty; messaging without inbox is unreachable. Same P1.

**Independent Test**: User A has conversations with B, C, D (D's most recent). Visit `/inbox` — see D, C, B in that order, with unread badges where applicable. Open B — message thread renders. Read receipts update for A's view (B's messages now show "read").

**Acceptance Scenarios**:

1. **Given** I have conversations with 3 users with different `lastActivityAt` timestamps, **When** I open `/inbox`, **Then** the list is sorted DESC by `lastActivityAt`.
2. **Given** B has sent me 2 unread messages, **When** I view `/inbox`, **Then** the conversation card with B shows a badge with "2".
3. **Given** I open the conversation with B, **When** I scroll through the message thread, **Then** I see ALL messages (no pagination in MVP — capped at 200 per conversation server-side; older are accessible via "load more" in a future iteration).
4. **Given** I open a conversation, **When** the open completes, **Then** the messages I just viewed are marked as read on the server (B's `/inbox` will now show them as read on next refresh).

---

### User Story 3 — Admin sends a platform message to a user (Priority: P2)

As an admin with the `messenger` role, I can send a platform-branded message to any user — for ToS clarifications, ban notifications, support replies — and the user sees it in their inbox as an "official" message visually distinct from peer messages.

**Why this priority**: P2 because there's no immediate need until user counts grow to where ad-hoc support is required. But the data model includes it from day one so we don't migrate later.

**Independent Test**: Invite a test account as `messenger`. Sign in as that account. Open `/admin/messages` (new admin sub-page). Send a message to user A from "CodePals Admin". User A's inbox shows the message with an admin badge / different styling.

**Acceptance Scenarios**:

1. **Given** I'm a `messenger`, **When** I send an admin message to user A, **Then** the message persists with `kind: 'admin'`, `fromAdminLogin: '<my-github-login>'`, and `fromDisplay: 'CodePals Admin'` (or a configurable display name).
2. **Given** user A receives an admin message, **When** they open it, **Then** the UI renders it with admin styling (e.g. badge, primary-colour border) and the sender shows as "CodePals Admin" rather than my GitHub handle.
3. **Given** I'm only a `messenger` (not `manager`), **When** I attempt to view a user's profile via `/admin/users/:id`, **Then** I receive 403 (different role's surface).
4. **Given** user A is blocked from messaging by admin policy (suspended via spec 003), **When** I send them an admin message, **Then** it succeeds — admins are exempt from user-blocking and from suspension's `assertNotSuspended` guard.

---

### User Story 4 — Admin runs a ticket flow (Priority: P2)

As a `messenger`-role admin, I can mark a conversation as a "ticket", see its current state (open / waiting on user / waiting on admin / resolved), and resolve it when handled. Tickets show in a separate `/admin/tickets` view.

**Why this priority**: P2 — depends on US3 landing. Adds structured triage on top of free-form admin messaging.

**Independent Test**: Send an admin message to user A. From `/admin/tickets`, mark the conversation as a ticket. User A replies; ticket moves to "waiting on admin". Admin replies; "waiting on user". Admin clicks "Resolve"; ticket disappears from the open queue.

**Acceptance Scenarios**:

1. **Given** I've sent an admin message creating conversation X, **When** I click "Open as ticket" on conversation X, **Then** the conversation gains a `ticketState: 'awaiting-user'` field and appears in `/admin/tickets`.
2. **Given** ticket X is `awaiting-user`, **When** user A replies, **Then** ticket auto-transitions to `awaiting-admin`.
3. **Given** ticket X is `awaiting-admin`, **When** I click "Resolve", **Then** `ticketState: 'resolved'`, conversation drops out of the open queue but is still readable from `/admin/tickets?state=resolved`.
4. **Given** a conversation has never been opened as a ticket, **When** I view `/admin/tickets`, **Then** the conversation does not appear (free-form admin messages are NOT tickets unless explicitly flagged).

---

### User Story 5 — Receiver controls (Priority: P2)

As a codepal, I can mute or delete a conversation, blocking the other user from further messages (uses the spec 003 blocking mechanism).

**Why this priority**: P2 — needed for healthy UX but can launch with just "block from spec 003" if a UI iteration is too tight.

**Independent Test**: Receive a message from B. From the conversation view, click "Block this user". The conversation hides; B can no longer send to me; spec 003's block list now contains B.

**Acceptance Scenarios**:

1. **Given** I open a conversation with B, **When** I click "Block", **Then** spec 003's `POST /api/blocks` runs, B is added to my block list, and the conversation no longer appears in my inbox.
2. **Given** I've blocked B, **When** B attempts to send me a new message, **Then** the message is rejected with 403 (existing spec 003 enforcement).
3. **Given** I've blocked B, **When** I unblock via spec 003's flow, **Then** B's prior messages reappear in my inbox (we soft-hide, not delete) and new messages can land.

---

## Edge Cases & Decisions

- **Conversation id derivation**: deterministic from the pair of user ids — `convId = sort([userIdA, userIdB]).join(':')`. Avoids duplicate conversations for the same pair. Admin messages: `convId = 'admin:' + targetUserId` (distinct namespace; one admin conversation per user).
- **Message ordering**: server-side `createdAt` timestamp. Display strictly ascending; we don't permit edit/delete in MVP (immutable thread).
- **Message length**: 4000 chars per message (FR-510). Long-form content (markdown? code blocks?) deferred — plain text only for MVP.
- **Read receipts**: yes for user↔user (lightweight trust signal). Admin messages also track read state, used in ticket transitions.
- **Multi-device**: a user may have the app open in two browsers. The first to open a conversation marks messages as read; the second sees the updated state on next poll. No conflict.
- **Deleted user**: messages persist (other party can still view their side of the conversation). The sender's display becomes "[deleted user]". Profile photo falls back.
- **Polling interval**: 30s while a conversation is open, 60s on `/inbox`. Configurable via a single `MESSAGING_POLL_INTERVAL` constant.
- **Storage cap**: 200 messages per conversation in the MVP. Older messages remain in Cosmos but UI only loads the latest 200. Pagination is queued for a later iteration. Note: 200 × ~4KB per doc ≈ 800KB per conversation hard cap (well within Cosmos doc-size limits).
- **No real-time push**: deliberately. Adding SignalR is a separate spec (queued, future).

---

## Functional Requirements *(mandatory)*

### Data model

- **FR-501**: Cosmos container `messages` MUST be partitioned by `/conversationId`. Single point-read for opening a conversation; no cross-partition queries on the inbox hot path.
- **FR-502**: Each message MUST carry `{id, conversationId, fromUserId, toUserId, body, kind: 'peer' | 'admin', createdAt, readAt?, fromAdminLogin?, fromDisplay?}`.
- **FR-503**: Conversation metadata (last activity, unread counts, ticket state) MUST be denormalised onto a `conversation` doc within the same container (`id: 'conv:<conversationId>'`). Updated transactionally with each new message via a stored procedure or a thin write-through helper. **NEEDS CLARIFICATION**: prefer the helper if it can be made race-safe; otherwise a single stored proc per conversation.
- **FR-504**: Conversation doc fields: `{id, type: 'conversation', participants: [userIdA, userIdB], lastActivityAt, lastMessagePreview, unreadByA, unreadByB, ticketState?: 'awaiting-user' | 'awaiting-admin' | 'resolved'}`.

### API surface

- **FR-510**: `POST /api/messages` — body `{toUserId, body}`. Body ≤ 4000 chars; enforces spec 003 block check (target has not blocked sender); upserts the conversation doc; appends the message doc; returns the new message.
- **FR-511**: `GET /api/conversations` — returns the calling user's conversations ordered by `lastActivityAt` DESC. Caps at 50 conversations in MVP; "load more" deferred.
- **FR-512**: `GET /api/conversations/:conversationId` — returns the latest ≤200 messages. 404 if the caller is not a participant.
- **FR-513**: `POST /api/conversations/:conversationId/read` — marks messages-from-the-other-side as read for the caller. Updates the unread counter on the conversation doc.
- **FR-514**: `POST /api/admin/messages` — body `{toUserId, body, fromDisplay?}`. Requires `messenger` OR `manager` role. Creates/reuses the `admin:<toUserId>` conversation.
- **FR-515**: `GET /api/admin/tickets` — lists conversations with `ticketState` set. Requires `messenger` OR `manager`.
- **FR-516**: `POST /api/admin/tickets/:conversationId/state` — body `{state: 'awaiting-user' | 'awaiting-admin' | 'resolved'}`. Manual override (auto-transitions happen on message events; this is for edge cases).

### UI

- **FR-520**: `/inbox` page lists conversations with avatar, display name, last message preview, unread badge.
- **FR-521**: Clicking a conversation opens `/inbox/:conversationId` (or modal — TBD in plan); message thread + send composer.
- **FR-522**: Admin messages render with a visual distinguisher (badge + accent border).
- **FR-523**: Profile page and `/find` profile cards add a "Message" CTA for any public profile of an authenticated user.
- **FR-524**: `/admin/tickets` shows open tickets with state, last activity, click to open the conversation in admin context.

### Privacy + safety

- **FR-530**: Spec 003's `POST /api/blocks` check MUST run on every `POST /api/messages` — blocked sender → 403, message not stored.
- **FR-531**: Suspended users (spec 003's `member`-role removal) MUST be unable to send peer-to-peer messages. Admins remain reachable from suspended users (so they can appeal) — admin → suspended user direction is unrestricted.
- **FR-532**: Messages are NOT readable by anyone other than the two participants (or `manager` per future moderation tooling — out of scope here; tracked as a follow-up).
- **FR-533**: No notification/webhook to third-party services. Messages stay inside the platform.
- **FR-534**: Conversation participants MUST be locked at conversation-doc creation. A future feature that "adds a third party to the conversation" (group chat) is OUT OF SCOPE; MVP is strictly 1:1.

### Roles (cross-references spec 004)

- **FR-540**: `POST /api/messages`, `GET /api/conversations`, `GET /api/conversations/:id`, `POST /api/conversations/:id/read` require `authenticated`.
- **FR-541**: `POST /api/admin/messages`, `GET /api/admin/tickets`, `POST /api/admin/tickets/:id/state` require `messenger` OR `manager`.

### Performance

- **FR-550**: Opening a conversation MUST be a single point-read (one `convId` partition + range on `createdAt`). RU budget per open: ≤5.
- **FR-551**: `/inbox` MUST be a single cross-partition query on `participants` filtered by `lastActivityAt`. Cap at 50; RU budget ≤20 per request.
- **FR-552**: Poll-on-open MUST be a delta query — only fetch messages with `createdAt > lastSeenTimestamp` (passed in by client). RU budget ≤1 per idle poll.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Abuse / spam via messaging | Spec 003's block + report + ban mechanisms are hard prerequisites. Rate-limiting per sender (FR-553, future) — for MVP rely on Cosmos RU as a soft brake. |
| Cosmos RU spike from runaway poll loops | Hard server-side rate limit on poll endpoint: max 1 request per conversation per 5s per client IP. 429 if exceeded. |
| Conversation doc race conditions on simultaneous messages | Use Cosmos optimistic concurrency on the conversation doc (same pattern as `adminRoster` in PR #35). Each message append revs the etag. |
| Admin message impersonation | Admin display name is controlled by the admin (FR-514's `fromDisplay`), but the underlying `fromAdminLogin` is always the actual admin's GitHub login. Spec 003 audit log records the action. |
| 4000-char limit too short | Tunable. 4000 was picked as "enough for a thoughtful message, short of an email essay". Easy to bump if logs show users hitting it. |
| Real-time expectation creep | Set expectation in UI: "Polls every 30s while open." Future spec 007 (SignalR) adds push. |
| Suspended user can't reach admins for appeal | FR-531 explicitly carves out admin → suspended direction. Suspension page links to the admin inbox. |

---

## Out of Scope

- **Real-time delivery** — async/poll only.
- **Group conversations (3+ participants)** — strict 1:1.
- **Rich content** — plain text. No markdown, images, files, voice notes.
- **Push notifications** (email, web push, mobile) — separate notification spec; messaging persists, nothing pings.
- **Search across messages** — would need indexing; not in MVP.
- **Edit / delete messages** — immutable thread. Users can block to stop receiving.
- **Message reactions / threading** — flat thread only.
- **Encryption** — at-rest encryption is Cosmos's default. End-to-end is out of scope and arguably antithetical to the moderation surface.

---

## Constitution Compliance Check

| Principle | Compliance |
|---|---|
| **P1 — User-First & Inclusive** | Closes the directory-to-interaction loop. Inbox is keyboard-navigable. Plain-text only is inherently i18n-safe. ✅ |
| **P2 — Privacy by Default** | Only participants can read a conversation (FR-532). No third-party data sharing (FR-533). Blocking integrates with spec 003. ✅ |
| **P3 — Security (NON-NEGOTIABLE)** | API endpoints gate on `authenticated` + block check + role (admin endpoints). Cosmos optimistic concurrency for write-safety. RU budget caps prevent DoS. ✅ |
| **P4 — Accessibility (NON-NEGOTIABLE)** | Standard form controls; semantic HTML; ARIA labels on unread badges. Plan to verify with axe. ✅ |
| **P5 — No Dark Patterns (NON-NEGOTIABLE)** | No "must reply" guilt-tripping. Block is one click. No retention manipulation. Polling explicit in UI. ✅ |
| **P6 — Open & Transparent** | Schema documented (FR-501..504). Source of truth = `messages` container. Admin messages traceable to actual login (FR-514). ✅ |
| **P7 — Brand consistency** | Reuses existing Tailwind tokens. Admin messages get a distinct visual treatment that's still on-brand. ✅ |
| **P8 — i18n-friendly** | All UI strings via the (future) i18n bundle; plain-text bodies are inherently translatable. ✅ |

---

## Open Questions

- [ ] **`/inbox` vs `/messages`** as the URL path — `/inbox` reads more conversationally; either is fine. Pick in plan.
- [ ] **Polling interval defaults** — 30s active / 60s idle feels right for chat-ish-but-not-realtime UX. Tune from logs.
- [ ] **Conversation deletion** — should "Block" also delete? Spec 003's block leaves messages stored but hidden; we follow that. Confirm.
- [ ] **Admin "from" display name** — operator-configurable per message or fixed "CodePals Admin"? Lean fixed for MVP (less attack surface).
- [ ] **Manager visibility into peer conversations** — for moderation review of a reported message. Defer to a separate moderation-tooling spec; do NOT include in 005.

---

## Success Criteria

- **SC-501**: Two codepals can introduce each other on `/find`, exchange ≥5 messages, and reach a connection within a single sign-in session.
- **SC-502**: Median open-to-message-visible latency on the same browser is ≤50ms (it's a single Cosmos point-read).
- **SC-503**: Suspended users (spec 003) cannot send peer messages but CAN reach admins (FR-531 verified end-to-end).
- **SC-504**: Cost: messaging at 10k messages/day stays under $1/month in Cosmos RU + storage costs.
- **SC-505**: No real-time infrastructure (SignalR / WebSockets) introduced.
