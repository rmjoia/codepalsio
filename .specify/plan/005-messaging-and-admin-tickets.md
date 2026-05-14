# Implementation Plan: User-to-User Messaging + Admin CMS/Ticketing

**Feature**: 005-messaging-and-admin-tickets
**Created**: 2026-05-14
**Status**: Draft
**Spec**: `.specify/spec/005-messaging-and-admin-tickets.md`

---

## Approach

Single Cosmos container `messages`, partitioned by `/conversationId`, holding two doc types: `message` and `conversation` (the latter as a denormalised metadata doc per conversation). Conversation id is **deterministic** from the participant pair, so creating a conversation is upsert-idempotent.

API surface is small (6 endpoints). Frontend gets a new `/inbox` page + a "Message" CTA on `/find` and profile pages. Admin gets a sub-page at `/admin/messages` (compose + send) and `/admin/tickets` (ticket queue).

No real-time infrastructure. Polling at the page level (configurable interval; 30s active / 60s idle).

## Tech stack

- Cosmos DB SDK (already in use)
- Standard fetch + interval polling on the frontend
- Reuse `getClientPrincipal` + `isAdminPrincipal` from existing modules

## Files to touch

### Add

| File | Purpose |
|---|---|
| `infra/main.bicep` | Add `messages` container (partition key `/conversationId`, indexing policy `consistent` with `lastActivityAt` ascending) |
| `api/src/lib/messages-repo.ts` | Repository: upsert conversation, append message, fetch conversation, fetch inbox, mark read |
| `api/src/lib/messages-repo.test.ts` | Repo unit tests against `MessagesRepository.fake.ts` |
| `api/src/lib/messages-repo.fake.ts` | In-memory fake for testing |
| `api/src/lib/messages-validation.ts` | `validateMessageBody(input)` — length cap (4000), trim, reject empty |
| `api/src/messages-send.ts` | `POST /api/messages` |
| `api/src/messages-send.test.ts` | |
| `api/src/conversations-list.ts` | `GET /api/conversations` |
| `api/src/conversations-list.test.ts` | |
| `api/src/conversations-get.ts` | `GET /api/conversations/:conversationId` |
| `api/src/conversations-get.test.ts` | |
| `api/src/conversations-read.ts` | `POST /api/conversations/:conversationId/read` |
| `api/src/conversations-read.test.ts` | |
| `api/src/admin-messages-send.ts` | `POST /api/admin/messages` |
| `api/src/admin-messages-send.test.ts` | |
| `api/src/admin-tickets-list.ts` | `GET /api/admin/tickets` |
| `api/src/admin-tickets-list.test.ts` | |
| `api/src/admin-tickets-state.ts` | `POST /api/admin/tickets/:conversationId/state` |
| `api/src/admin-tickets-state.test.ts` | |
| `src/pages/inbox/index.astro` | Conversation list |
| `src/pages/inbox/[conversationId].astro` | Single thread |
| `src/pages/admin/messages.astro` | Admin compose (send to a user) |
| `src/pages/admin/tickets.astro` | Ticket queue |
| `src/services/messages.ts` | Frontend API client: send, list conversations, get conversation, mark read, admin variants |
| `src/services/messages.test.ts` | |

### Modify

| File | Change |
|---|---|
| `staticwebapp.config.json` | Add `/inbox/*` (authenticated), `/admin/messages` (authenticated — handler enforces messenger), `/admin/tickets` (authenticated — handler enforces messenger). Add `/api/messages`, `/api/conversations*`, `/api/admin/messages`, `/api/admin/tickets*`. All under `authenticated`. |
| `src/staticwebapp.config.test.ts` | Add invariants for the new routes |
| `src/components/Header.astro` | Add "Inbox" link to user dropdown (with unread badge) |
| `src/pages/find.astro` | Add "Message" CTA on each profile card |
| `src/pages/profile/index.astro` | Add "Message" CTA on others' profile views |
| `.specify/PROJECT_STATUS.md` | Move 005 from in-flight to shipped on completion |

### Cross-spec dependencies

- **Spec 003**: blocking + suspension MUST land before 005 goes public. The FR-530/FR-531 checks require those primitives.
- **Spec 004**: `messenger` role recognition. Admin endpoints in 005 call `isMessenger || isManager`.

## Sequencing — shippable PR slices

The whole feature is too big for one PR. Slices:

1. **005-A: Schema + repo + validation** (no UI, no endpoints exposed; lib + tests only). Adds Bicep container. Easy to revert if schema needs rethinking.
2. **005-B: Peer messaging API + minimal `/inbox` UI** (US1 + US2). Gates on spec 003 block check being available — if 003 US4 hasn't shipped, stub the block check to always return false initially with a TODO + spec-003-dependency note.
3. **005-C: Admin messaging + ticketing** (US3 + US4). Depends on 005-B + spec 004 messenger role.
4. **005-D: Block-from-inbox UX** (US5). Tiny wrapper around spec 003's existing block endpoint.

## Constitution compliance check

See spec 005 §"Constitution Compliance Check" — all 8 principles pass.

## Test strategy

- Repo unit tests against a `FakeMessagesRepository` (mirror the existing `users.fake.ts` / `admin-roster.fake.ts` pattern).
- Each handler tests: 401 anonymous, 403 blocked sender, 400 oversize body, 200 happy path, 404 unknown conversation, idempotent re-send (same body twice should produce 2 messages — there's no dedup).
- Concurrency: send-race-with-read test for the conversation doc etag.
- E2E: a "happy-path two-user conversation" test isn't in MVP (E2E suite doesn't have multi-user fixtures); deferred to a future iteration.

## Risks

| Risk | Mitigation |
|---|---|
| Cosmos RU usage above budget | FR-550..552 set explicit RU caps. Monitor with Application Insights once it's wired up. |
| Conversation doc race on simultaneous messages | Etag-based optimistic concurrency, retry loop pattern from `admin-roster.ts`. |
| Polling DOS the API | Server-side rate limit (1/5s per conversation per IP, returns 429). |
| Admin impersonation via `fromDisplay` | Operator-configurable display strings live in app settings, not in user data. Admin's GitHub login is always recorded. |
| Migration complexity if real-time added later | The `messages` schema is read by direct point-reads; adding a SignalR push doesn't require migration — it just adds a write-side fanout. |
| Hard prerequisite (spec 003) not yet shipped | 005-A and 005-B contain explicit dependency notes; 005-B's block check is shimmed if 003's `POST /api/blocks` isn't available. Spec 003 US2-US4 should ideally land before 005-B. |
