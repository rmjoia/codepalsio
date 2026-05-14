# Tasks: User-to-User Messaging + Admin CMS/Ticketing

**Feature**: 005-messaging-and-admin-tickets
**Created**: 2026-05-14
**Spec**: `.specify/spec/005-messaging-and-admin-tickets.md`
**Plan**: `.specify/plan/005-messaging-and-admin-tickets.md`

`[P]` = parallelisable with siblings. Tests-first throughout.

---

## US1 + US2 — Peer messaging + inbox (P1, MVP)

### Schema + infra

- **T-510**: `infra/main.bicep` — add `messages` container, partition key `/conversationId`, indexing policy `consistent`, included paths default + explicit on `createdAt`, `lastActivityAt`, `participants[]`.
- **T-511 [P]**: `infra/Initialize-Infra.Tests.ps1` — assert the new container exists, partition key correct.

### Repo + validation (libs first)

- **T-520 [P]**: `api/src/lib/messages-validation.test.ts` — cases: empty body rejected, body > 4000 chars rejected, leading/trailing whitespace trimmed, control chars rejected.
- **T-521 [P]**: `api/src/lib/messages-validation.ts` — implement `validateMessageBody(raw): {ok, body} | {error}`.
- **T-522 [P]**: `api/src/lib/messages-repo.fake.ts` — in-memory fake mirroring the planned production repo shape.
- **T-523 [P]**: `api/src/lib/messages-repo.test.ts` — test suite against the fake: `appendMessage`, `getConversation`, `listConversations(userId)`, `markRead(conversationId, userId)`, conversation-doc-etag concurrency.
- **T-524**: `api/src/lib/messages-repo.ts` — production repo using `@azure/cosmos`. Implements the same interface as the fake.

### Send endpoint

- **T-530 [P]**: `api/src/messages-send.test.ts` — auth 401, blocked-by-recipient 403 (mock spec-003 block check), oversize 400, happy-path 200, returns the persisted message including server-assigned id + createdAt.
- **T-531**: `api/src/messages-send.ts` — `POST /api/messages` handler. Validates body, runs block check, derives `conversationId = sort([fromUserId, toUserId]).join(':')`, upserts conversation doc + appends message in a single sproc (or write-through helper with CAS retry; pick in implementation review).
- **T-532**: Spec 003 block-check integration — if spec 003's `POST /api/blocks` hasn't shipped yet, stub `isBlockedBy(toUserId, fromUserId)` to return false with an inline TODO + comment referencing the spec. Replace with the real check once 003 US4 lands.

### Inbox + thread endpoints

- **T-540 [P]**: `api/src/conversations-list.test.ts` — auth required, returns user's conversations sorted by `lastActivityAt` DESC, capped at 50, includes preview + unread count.
- **T-541**: `api/src/conversations-list.ts` — `GET /api/conversations`. Cross-partition query by `participants` ARRAY_CONTAINS.
- **T-542 [P]**: `api/src/conversations-get.test.ts` — non-participant gets 404, participant gets ≤200 messages in send-order.
- **T-543**: `api/src/conversations-get.ts` — `GET /api/conversations/:conversationId`. Point-read on the partition + range on `createdAt`.
- **T-544 [P]**: `api/src/conversations-read.test.ts` — marks other-party messages as read, updates unread counter on conversation doc.
- **T-545**: `api/src/conversations-read.ts` — `POST /api/conversations/:conversationId/read`.

### SWA config + route gates

- **T-550**: `staticwebapp.config.json` — add routes for `/inbox/*`, `/api/messages`, `/api/conversations*`. All under `authenticated`.
- **T-551 [P]**: `src/staticwebapp.config.test.ts` — invariant tests for the new routes.

### Frontend services

- **T-560 [P]**: `src/services/messages.ts` — `sendMessage(toUserId, body)`, `getConversations()`, `getConversation(id)`, `markRead(id)`. Mirror the API surface.
- **T-561 [P]**: `src/services/messages.test.ts` — happy paths + error paths (401, 403, 400).

### UI

- **T-570**: `src/pages/inbox/index.astro` — conversation list, unread badges, sorted by lastActivityAt DESC, "Open" link per conversation.
- **T-571 [P]**: `src/pages/inbox/[conversationId].astro` — thread view, send composer, polling every 30s, mark-read on open.
- **T-572 [P]**: `src/components/Header.astro` — add "Inbox" link to the user dropdown with unread badge (call `/api/conversations` once on dropdown open).
- **T-573 [P]**: `src/pages/find.astro` — add "Message" CTA on each public profile card (POSTs to `/api/messages` after a confirm modal).
- **T-574 [P]**: `src/pages/profile/index.astro` — add "Message" CTA on others' profile views (not when viewing own).

---

## US3 + US4 — Admin messaging + ticketing (P2)

**Depends on**: US1/US2 landed, spec 004 messenger role recognised.

### Admin endpoints

- **T-580 [P]**: `api/src/admin-messages-send.test.ts` — `messenger` accepted, `manager` accepted, `moderator` rejected, anonymous rejected.
- **T-581**: `api/src/admin-messages-send.ts` — `POST /api/admin/messages`. Bypasses spec-003 block (admins are exempt) and spec-003 suspension (FR-531). Persists with `kind: 'admin'`, `fromAdminLogin`, `fromDisplay`.
- **T-582 [P]**: `api/src/admin-tickets-list.test.ts` — returns conversations with `ticketState` set, sorted by lastActivityAt.
- **T-583**: `api/src/admin-tickets-list.ts` — `GET /api/admin/tickets`.
- **T-584 [P]**: `api/src/admin-tickets-state.test.ts` — admin role accepted, sets `ticketState` on conversation doc, auto-transitions on user reply.
- **T-585**: `api/src/admin-tickets-state.ts` — `POST /api/admin/tickets/:conversationId/state`.
- **T-586**: Update `api/src/messages-send.ts` — when a peer message lands on a conversation with `ticketState`, auto-transition to `'awaiting-admin'` (or `'awaiting-user'` depending on sender role).

### Frontend admin UI

- **T-590**: `src/pages/admin/messages.astro` — compose form, recipient selector (autocomplete on github username), preview, send.
- **T-591 [P]**: `src/pages/admin/tickets.astro` — ticket queue, filter by state, click to open in admin context (read-only thread + reply composer).
- **T-592 [P]**: `src/pages/admin/index.astro` — add nav tiles for messages + tickets, conditionally rendered behind `isMessenger || isManager`.

### SWA config

- **T-595**: Add `/admin/messages`, `/admin/tickets`, `/api/admin/messages`, `/api/admin/tickets*` routes — all `authenticated` (handler enforces role).
- **T-596 [P]**: SWA config tests for the new routes.

---

## US5 — Block from inbox (P2)

**Depends on**: spec 003 US4 (`POST /api/blocks`) shipped.

- **T-600 [P]**: `src/pages/inbox/[conversationId].astro` — "Block this user" button. POSTs to `/api/blocks` then refreshes the inbox.
- **T-601 [P]**: Wire the resulting block list into `/api/messages` send check (already covered by FR-530 / T-532).

---

## Cross-cutting

- **T-610**: `npm run test:run` + `cd api && npm test` + `npm run format` + `npm run lint` — all green.
- **T-611**: Update `.specify/PROJECT_STATUS.md`:
  - Move 005 to shipped table (per slice as they ship).
  - Add `messages` to the Cosmos containers table.
- **T-612**: Update `AZURE_SETUP_GUIDE.md` — note the new `messages` container; no operator action required at deploy time beyond the Bicep apply.

---

## Suggested PR composition

| PR | Tasks | Depends on |
|---|---|---|
| **005-A** (schema + repo + validation) | T-510, T-511, T-520-T-524 | Nothing (pure libs) |
| **005-B** (peer messaging + inbox) | T-530-T-545, T-550, T-551, T-560-T-574 | 005-A + (ideally) spec 003 US4 for the block check |
| **005-C** (admin messaging + tickets) | T-580-T-596 | 005-B + spec 004 messenger role recognition |
| **005-D** (block-from-inbox UX) | T-600, T-601 | 005-B + spec 003 US4 |

005-A can ship any time. 005-B is the big user-visible deliverable. 005-C + 005-D land alongside their cross-spec dependencies.
