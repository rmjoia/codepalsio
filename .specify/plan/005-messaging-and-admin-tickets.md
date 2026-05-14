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
- Reuse `getClientPrincipal` from existing modules. **Authorisation:** peer messaging endpoints (`POST /api/messages`, `GET /api/conversations*`, `POST /api/conversations/:id/read`) gate on `authenticated`. **Admin** messaging endpoints (`POST /api/admin/messages`, `GET /api/admin/tickets`, `POST /api/admin/tickets/:id/state`) MUST use the role-specific helpers from spec 004 — `isMessenger(principal) || isManager(principal)` — NOT the broad `isAdminPrincipal` (which would also pass `moderator`, violating FR-541 / spec 004's role split).

## Files to touch

### Add

| File | Purpose |
|---|---|
| `infra/main.bicep` | Add `messages` container (partition key `/conversationId`, indexing policy `consistent` with `lastActivityAt` ascending) |
| `api/src/lib/messages-repo.ts` | Repository: upsert conversation, append message, fetch conversation, fetch inbox, mark read |
| `api/src/lib/messages-repo.test.ts` | Repo unit tests against `messages-repo.fake.ts` (the file listed immediately below; repo convention is lowercase kebab-case for API files). |
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
2. **005-B: Peer messaging API + minimal `/inbox` UI** (US1 + US2). **Hard dependency: spec 003 US4 (`POST /api/blocks` + the block list query) MUST ship before 005-B is publicly exposed.** Spec 005's safety prerequisite (FR-530) is non-negotiable. Two acceptable workflows: (a) wait for 003 US4 to merge before opening 005-B's PR (preferred), or (b) ship 005-B's code with the endpoint and UI **gated behind a `MESSAGING_ENABLED` env-var feature flag defaulting to `false`** — code can land but the public surface stays dark until 003 US4 is live AND the flag is flipped. Stubbing `isBlockedBy` to always return `false` while the endpoint is publicly reachable is NOT acceptable — that would launch messaging without the documented block enforcement.
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
| Hard prerequisite (spec 003 US4) not yet shipped | 005-B's PR is gated on 003 US4 landing first (preferred), OR the messaging endpoints/UI ship behind a `MESSAGING_ENABLED` feature flag defaulting to `false` so the surface stays dark until both 003 US4 is live and the flag is flipped. No stubbed-block-check path is acceptable for a public launch — FR-530 is non-negotiable. |
