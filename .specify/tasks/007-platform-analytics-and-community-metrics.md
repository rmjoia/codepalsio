# Tasks: Platform Adoption Metrics + Community Stats

Spec: `.specify/spec/007-platform-analytics-and-community-metrics.md`

Two surfaces sharing one privacy posture. **Sliced into three PRs** so the
privacy-critical PostHog integration is reviewed in isolation from the
Cosmos-derived community page.

`[P]` = parallelisable inside the same PR.

---

## US1 — Community stats page (P1) 🎯 MVP

The public-facing webapp surface. Cosmos-derived, no third-party in the
read path. Ships independently of PostHog.

### Backend

- **T-700 [P]**: `api/src/community-stats.test.ts` — invariants:
  - Returns the FR-700 shape (`codepalsTotal`, `profilesPublic`,
    `skillsDistinct`, `languagesDistinct`, `activeLastWeek`, `topSkills`,
    `snapshotAt`).
  - Response object MUST NOT contain `userId`, `githubUsername`,
    `displayName`, `lastSeenAt`, or any field-from-Profile beyond the
    declared aggregate counts (privacy invariant, regex-pinned).
  - Cache hit: a second call within 5 min returns the same `snapshotAt`
    and DOES NOT touch Cosmos (mock the queries; assert call count = 0
    on the second invocation).
  - Cache miss: a call past the TTL re-queries Cosmos and updates
    `snapshotAt`.
  - `topSkills` is capped at 10 entries.
- **T-701**: `api/src/community-stats.ts` — new handler.
  - 4–5 Cosmos queries (count UserRecords, count public profiles,
    aggregate distinct skills, aggregate distinct preferredLanguages,
    count active-in-7d via existing `lastSeenAt` field from spec 006).
  - In-memory `{value, expiresAt}` cache, 5-min TTL.
  - `app.http('community-stats', { methods: ['GET'], authLevel: 'anonymous', handler })`.
- **T-702**: `staticwebapp.config.json` — add
  `{ "route": "/api/community-stats", "allowedRoles": ["anonymous", "authenticated"] }`
  BEFORE the `/api/*` catch-all (route-order matters).
- **T-703 [P]**: `src/staticwebapp.config.test.ts` — extend the
  user-facing-routes parametric test to cover the new route's gate.
- **T-704 [P]**: `api/src/index.ts` — import `./community-stats` so the
  Function host registers it (the `function-registrations` test catches
  this if forgotten).

### Frontend

- **T-710 [P]**: `src/services/api.ts` — `CommunityStats` type (mirrors
  FR-700) + `getCommunityStats(): Promise<CommunityStats>` helper.
- **T-711**: `src/pages/community.astro` — new page, anonymous-accessible.
  - Headline numbers in big type via `Intl.NumberFormat(undefined)` for
    locale-aware formatting.
  - Top-skills as chip grid (reuse the chip class from `/find`).
  - Footer line: "Stats refresh every 5 minutes. Last updated: {snapshotAt}"
    rendered via `Intl.DateTimeFormat(undefined, { dateStyle:'medium', timeStyle:'short' })`.
  - Empty state: zero counts render as friendly "still finding our first
    CodePals" copy, not a broken-page experience.
- **T-712 [P]**: `staticwebapp.config.json` — no entry needed (anonymous
  by default), but assert in the test that `/community` is NOT in any
  auth-gated rule.
- **T-713 [P]**: `src/components/Header.astro` — add a `/community` link.
  Visible to anonymous AND authenticated viewers.
- **T-714 [P]**: `src/pages/index.astro` — add a stats teaser block on
  the homepage linking to `/community`.
- **T-715 [P]**: `src/community-page.test.ts` — source-level invariants
  matching the Header/profile-edit pattern:
  - Page declares each stat element by id.
  - Page reads `getCommunityStats()` from `src/services/api`.
  - No `posthog` import on this page (community page must work even with
    PostHog blocked/disabled).
- **T-716 [P]**: `e2e-browser/community.spec.ts` — Playwright hermetic
  smoke (depends on the e2e foundation from #65 landing):
  - Mock `/api/community-stats`; navigate; assert numbers render +
    `snapshotAt` footer present.
  - Mock the endpoint returning zeros; navigate; assert friendly empty
    state.

---

## US2 — PostHog wrapper + initial event surface (P1) 🎯 MVP

Privacy-critical. Reviewed as its OWN PR so the GDPR posture lands
deliberately. Ships ONLY after the LIA + privacy-notice update are in
the same diff.

### Privacy documents (required in the same PR)

- **T-720**: `.specify/privacy/posthog-lia.md` — Legitimate Interest
  Assessment. Sections: purpose (FR-720 + spec context), data collected
  (FR-726 event list verbatim), data NOT collected (no PII, no
  identifier, no IP, no replay), processor (PostHog Cloud EU + DPA),
  retention (configured 90 days), opt-out (FR-727 + FR-740), balancing
  test, reasonable-expectation argument.
- **T-721**: `PRIVACY.md` — add a "Usage analytics" section listing:
  processor, what's collected, what's NOT collected, retention, opt-out
  instructions. Cross-link to the LIA.
- **T-722**: `AZURE_SETUP_GUIDE.md` — operator runbook:
  - Sign the PostHog DPA.
  - Create the EU project + record the public key as
    `PUBLIC_POSTHOG_KEY` SWA app setting.
  - Recommended dashboards (signup funnel, feature adoption,
    weekly-active retention) with the FR-726 event names.

### Module

- **T-730 [P]**: `package.json` — add `posthog-js` as a frontend
  dependency. Pin a specific version.
- **T-731**: `src/lib/analytics.ts` — single point of PostHog contact.
  - `init()` called once from a top-level script (e.g. Header). Idempotent.
  - Config exactly per FR-721 (hardcoded — not env-configurable).
  - Exports `track<E extends EventName>(event: E, props: EventPayloads[E])`.
  - Exports `EventName` union + `EventPayloads` typed map covering the
    FR-726 events.
  - Reads `localStorage.codepals_no_analytics` before every track; if set,
    short-circuit.
- **T-732 [P]**: `src/lib/analytics.test.ts` — unit:
  - Type-level: `EventPayloads` map has exactly the FR-726 keys (no
    extras, no missing).
  - Runtime: opt-out flag set → `track()` does not call the PostHog
    client (mock `posthog-js`; assert `capture` not called).
  - Runtime: opt-out flag absent → `track()` calls `posthog.capture`
    with the event name + props.

### Static guards (lint-level invariants)

- **T-740 [P]**: `eslint.config.js` — add a `no-restricted-imports` rule
  for `posthog-js` with an `allowedFrom: ['src/lib/analytics.ts']`-style
  pattern (or equivalent via a custom rule). Prevents any other file
  from importing PostHog directly — single point of change.
- **T-741 [P]**: `src/analytics-invariants.test.ts` — grep-level
  invariants:
  - No occurrence of `posthog.identify(` anywhere in the source.
  - No `posthog-js` import outside `src/lib/analytics.ts`.
  - The `EventPayloads` map's value types are limited to: literal-string
    unions, `boolean`, and `number`. Specifically NOT `string` (which
    could carry user input). Manual visual review unless a TypeScript
    AST helper is feasible — at minimum a regex on the source.

### Wiring (initial event surface — FR-726)

- **T-750 [P]**: `src/components/Header.astro` — call `analytics.init()`
  on script load. Fire `track('page_view', { route: window.location.pathname })`
  on each mount (Header is on every page).
- **T-751 [P]**: `src/pages/welcome.astro` — fire `track('signup_completed', {})`
  on first arrival after OAuth.
- **T-752 [P]**: `src/pages/profile/index.astro` — fire
  `track('profile_saved', { visibility })` after a successful save; fire
  `track('field_visibility_changed', { field, level })` when a
  field-visibility selector value changes (debounced).
- **T-753 [P]**: `src/pages/find.astro` — fire `track('find_card_clicked', {})`
  on each profile-card click.

### CSP

- **T-760**: `staticwebapp.config.json` — extend the CSP global header:
  - `connect-src` += ` https://eu.i.posthog.com`
  - `script-src` += ` https://eu.posthog.com` (only if the SDK loads
    from CDN; if bundled via `posthog-js`, only `connect-src` needs the
    addition — verify which path we're on).
  - Inline-comment-justify the additions with a `# spec 007` reference.
- **T-761 [P]**: `src/staticwebapp.config.test.ts` — pin the new CSP
  values. Test fails if either domain is removed OR a third domain is
  added without updating the test (catches silent CSP-widening).

---

## US3 — Opt-out toggle (P2)

Defer to a follow-up PR if scope pressure mounts; otherwise bundle with
US2 since it's small.

- **T-770 [P]**: `src/pages/profile/index.astro` — add a single toggle
  in the edit form: "Include me in anonymous platform analytics"
  (default ON). Toggling writes/removes
  `localStorage.codepals_no_analytics`.
- **T-771 [P]**: `src/profile-edit.test.ts` — assert the toggle exists +
  the wire-up writes localStorage.
- **T-772 [P]**: `e2e-browser/analytics-optout.spec.ts` — Playwright
  hermetic smoke: enable the toggle → assert zero outbound requests
  matching `**/posthog.com/**` on a subsequent page navigation.

---

## US4 — Operator-facing dashboards (P2)

No code. The events ship in US2; the operator configures dashboards in
PostHog directly.

- **T-780**: After deploy, manually create:
  - **Signup funnel**: `page_view (route: /)` → `signup_completed` →
    `profile_saved`
  - **Feature adoption**: rolling-30-day counts for each event in FR-726
  - **Weekly active**: distinct anonymous sessions per ISO week (PostHog
    derives this from page_view + its session_id without `identify()`)
- **T-781**: Document each dashboard's PostHog URL in
  `AZURE_SETUP_GUIDE.md` (operator-only — these links are private to the
  PostHog project).

---

## Cross-cutting

- **T-790**: `npm run test:run` + `( cd api && npm test )` + `npm run lint` +
  `npm run audit` + `npm run build` + Playwright suite — green.
- **T-791**: `.specify/PROJECT_STATUS.md` — move 007 to the shipped row
  when the LAST of the slice-PRs (US1 + US2 + US3 if included) lands.
  Add a `community-stats` row to the API endpoint table.

---

## Suggested PR composition

| PR                                                                | Tasks                                                                   | Depends on                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **007-A** (community stats — Cosmos-derived, no third-party)      | T-700..T-716, T-790 (partial)                                           | Nothing on the spec side. The Playwright smoke (T-716) needs #65 (e2e foundation) merged. |
| **007-B** (PostHog wrapper + privacy docs + initial events + CSP) | T-720..T-722, T-730..T-741, T-750..T-753, T-760..T-761, T-790 (partial) | 007-A is independent; either order works                                                  |
| **007-C** (opt-out toggle)                                        | T-770..T-772                                                            | 007-B (the analytics module must exist)                                                   |
| **007-D** (operator dashboards)                                   | T-780, T-781                                                            | 007-B (the events must be flowing) — no code, runbook only                                |

007-A is the lowest-risk, highest-community-visibility slice. Recommended
first.

007-B is the privacy-critical slice. Review it with the LIA and
`PRIVACY.md` open side-by-side; the diff is intentionally LARGER than
usual because three files (privacy doc, LIA, code) must move together
to be defensible.
