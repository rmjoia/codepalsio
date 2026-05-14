# Tasks: Online Presence

**Feature**: 006-online-presence
**Created**: 2026-05-14
**Spec**: `.specify/spec/006-online-presence.md`
**Plan**: `.specify/plan/006-online-presence.md`

`[P]` = parallelisable with siblings. Test-first.

---

## US1 + US2 — Online indicator on /find + profile (P1 + P2)

### Pure logic + field (foundation)

- **T-610 [P]**: `api/src/lib/presence.test.ts` — cases: lastSeenAt 1m ago → online, 5m ago → online (boundary), 6m ago → offline, missing → offline, presenceVisible:false → offline regardless.
- **T-611 [P]**: `api/src/lib/presence.ts` — implement `derivePresence(user, now)` returning boolean.
- **T-612 [P]**: `api/src/lib/types.ts` — extend UserRecord with `lastSeenAt?: string` and `presenceVisible?: boolean`.
- **T-613 [P]**: `api/src/lib/users.test.ts` — coalescing test: two `touchLastSeen` calls within 60s produce one write; calls > 60s apart produce two.
- **T-614**: `api/src/lib/users.ts` — implement `touchLastSeen(userId)`: read current, write only if `(now - current.lastSeenAt) > 60s`.
- **T-615 [P]**: `api/src/lib/users.fake.ts` — mirror `touchLastSeen` for tests.
- **T-616 [P]**: `api/src/lib/with-presence.ts` — `withPresenceTracking(handler)` wrapper that fires-and-forgets `touchLastSeen(principal.userId)` on every authenticated entry. Catches and swallows write errors.

### Middleware integration

- **T-620**: Update every authenticated handler under `api/src/` (`profile-save`, `profile-get`, `profiles-list`, `account-delete`, `get-roles`, `admin-users`, `admins-list`, `admins-grant`, `admins-revoke`, plus future spec 005 handlers when they exist) to wrap with `withPresenceTracking`.

### /api/profiles join

- **T-630 [P]**: `api/src/profiles-list.test.ts` — add cases: profile with online user → `isOnline: true`, with offline user → `isOnline: false`, with `presenceVisible: false` → `isOnline: false`. Invariant: `lastSeenAt` MUST NOT appear in any response object.
- **T-631**: `api/src/profiles-list.ts` — after the profile query, batch point-read user docs for each `userId`; map onto profiles; derive `isOnline`. Project `lastSeenAt` OUT of the response.

### Visibility toggle endpoint

- **T-640 [P]**: `api/src/presence-visibility.test.ts` — auth required, body validated (`visible: boolean`), writes the field on the user doc.
- **T-641**: `api/src/presence-visibility.ts` — `POST /api/presence/visibility`. Upserts the user doc with the new flag.
- **T-642**: `staticwebapp.config.json` + invariant test — add the route under `authenticated`.

### Frontend services

- **T-650 [P]**: `src/services/api.ts` — extend `DirectoryProfile` type with `isOnline: boolean`. Add `togglePresenceVisibility(visible: boolean): Promise<void>`.

### UI

- **T-660 [P]**: `src/components/OnlineIndicator.astro` — small green dot (or avatar ring), `aria-label="Online"`. Hidden when `isOnline: false`.
- **T-661 [P]**: `src/pages/find.astro` — render `<OnlineIndicator isOnline={profile.isOnline} />` on each profile card.
- **T-662 [P]**: `src/pages/profile/index.astro` (or the equivalent "view another profile" page) — render the indicator next to display name only when viewing someone else.
- **T-663 [P]**: `src/pages/profile/edit.astro` — add a toggle "Show my online status to others" wired to `togglePresenceVisibility`.

---

## Cross-cutting

- **T-670**: `npm run test:run` + `cd api && npm test` + `npm run format` + `npm run lint` — green.
- **T-671**: `.specify/PROJECT_STATUS.md` — move 006 to shipped table; note the denormalisation strategy on the Cosmos containers table.

---

## Suggested PR composition

| PR | Tasks | Depends on |
|---|---|---|
| **006-A** (field + middleware + join + tests) | T-610..T-616, T-620, T-630, T-631, T-640..T-642, T-650, T-670, T-671 | Nothing |
| **006-B** (UI surfaces) | T-660..T-663 | 006-A |

006-A can ship alongside or before 006-B; the UI changes are an independent layer on top of the server-side derivation.
