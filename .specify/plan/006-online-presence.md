# Implementation Plan: Online Presence

**Feature**: 006-online-presence
**Created**: 2026-05-14
**Status**: Draft
**Spec**: `.specify/spec/006-online-presence.md`

---

## Approach

Add `lastSeenAt` + `presenceVisible` to UserRecord. A thin async middleware in every authenticated endpoint coalesces writes to ≤1/min per user. `/api/profiles` joins with user docs by point-read fanout and returns a derived `isOnline` boolean (raw timestamp never leaves the server).

No new Cosmos container, no new Azure resources, no new dependencies.

## Tech stack

- Existing Cosmos SDK (`@azure/cosmos`)
- Existing `lib/users.ts` UserRepository — extend
- No new libs

## Files to touch

### Modify

| File | Change |
|---|---|
| `api/src/lib/types.ts` | Add `lastSeenAt?: string` and `presenceVisible?: boolean` to UserRecord |
| `api/src/lib/users.ts` | Add `touchLastSeen(userId)` — coalesced write helper. Reads current `lastSeenAt`, writes only if >60s old. |
| `api/src/lib/users.fake.ts` | Mirror `touchLastSeen` |
| `api/src/lib/users.test.ts` | Tests for the coalescing behaviour |
| `api/src/lib/presence.ts` (new) | `derivePresence(user, now)` — pure function; returns boolean. Tests for threshold + opt-out logic. |
| `api/src/lib/presence.test.ts` (new) | |
| Every authenticated handler under `api/src/*.ts` | After `getClientPrincipal`, fire-and-forget `touchLastSeen(principal.userId).catch(noop)`. Centralised in a `withPresenceTracking` helper to avoid copy-paste. |
| `api/src/lib/with-presence.ts` (new) | Helper wrapper / middleware |
| `api/src/profiles-list.ts` | Join with user docs to populate `isOnline` per profile |
| `api/src/profiles-list.test.ts` | Add cases: online profile gets `isOnline: true`, offline profile gets `isOnline: false`, `presenceVisible: false` always returns `isOnline: false`, raw `lastSeenAt` never appears in response |
| `api/src/presence-visibility.ts` (new) | `POST /api/presence/visibility` — toggles user's `presenceVisible` |
| `api/src/presence-visibility.test.ts` (new) | |
| `staticwebapp.config.json` | Add `/api/presence/visibility` route (`authenticated`) |
| `src/staticwebapp.config.test.ts` | Invariant test |
| `src/services/api.ts` | Add `togglePresenceVisibility(visible: boolean)` |
| `src/services/api.ts` | Extend `DirectoryProfile` type with `isOnline: boolean` |
| `src/pages/find.astro` | Render online dot indicator on each card |
| `src/pages/profile/[username].astro` (if it exists for viewing others) or `src/pages/profile/index.astro` | Render online dot next to display name (only for others, not self) |
| `src/pages/profile/edit.astro` | Add "Show my online status to others" toggle, calls `togglePresenceVisibility` |
| `infra/main.bicep` | No change (schema add is field-level, Cosmos doesn't enforce schema) |
| `.specify/PROJECT_STATUS.md` | Move 006 to shipped on completion. **Do NOT** add a `presence` row to the Cosmos containers table — there's no new container. Instead, add a note next to the `users` row that it carries `lastSeenAt` + `presenceVisible` post-006. |

### Add

| File | Purpose |
|---|---|
| `src/components/OnlineIndicator.astro` | Small green-dot component (shared between `/find` and profile views) |

## Sequencing — shippable slices

This is small enough for a single PR, but two slices keep diffs reviewable:

1. **006-A**: Field + middleware + visibility endpoint + presence derivation + test coverage (no UI). Behaviour: every authenticated request updates lastSeenAt; `/api/profiles` returns isOnline. UI changes deferred.
2. **006-B**: UI surfaces — OnlineIndicator component, integration on /find + profile, edit-page toggle.

Ship 006-A first; 006-B can land alongside or in a follow-up.

## Constitution compliance check

See spec 006 §"Constitution Compliance Check" — all 8 principles pass.

## Test strategy

- Pure-function tests for `derivePresence`: at threshold, just inside, just outside, with `presenceVisible: false`, with `lastSeenAt` missing entirely.
- Coalescing test for `touchLastSeen`: two calls within 60s → only one write; two calls > 60s apart → two writes.
- `/api/profiles` response-shape invariant: response objects MUST NOT include `lastSeenAt`. New test in `profiles-list.test.ts`.
- E2E: no change (presence is a derived display, not auth-flow).

## Risks

| Risk | Mitigation |
|---|---|
| Per-request write hot-spots a user doc | Coalescing (FR-602) keeps writes to ≤1/min. |
| `/api/profiles` RU cost grows | FR-632 caps at 50 RU; measured + monitored. Reduce parallelism in the join if needed. |
| Schema migration on existing user records | None — fields are optional, missing = offline by default. |
| Privacy violation via timestamp leak | Test enforces the response shape; CodeQL / lint can't catch it but the explicit test will. |
