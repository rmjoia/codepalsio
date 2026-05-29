# Feature Specification: Platform Adoption Metrics + Community Stats

**Feature Branch**: `007-platform-analytics-and-community-metrics`
**Created**: 2026-05-28
**Status**: Draft
**Input**: User description: "Spec the PostHog work. Focus on relevant metrics for platform adoption — visible on the webapp for the community, AND shareable with potential investors. Must be GDPR-aligned: no PII, aggregate only."

---

## Summary

Adds two complementary surfaces, sharing one collection pipeline:

1. **`/community` page on the webapp** — a public, shareable stats page that any visitor can hit (no login). Shows aggregate adoption signals — "X CodePals", "Y skills represented", "Z active this week" — to build community trust + network-effect appeal.
2. **PostHog Cloud (EU) dashboards** — internal product-analytics surface for the operator (and shareable as screenshots / read-only links with investors). Funnels, retention curves, feature-adoption % — the kind of growth deck a fundraiser needs.

**Two separate data paths, one shared privacy posture.** `/community` is Cosmos-derived only — counters aggregated server-side from the existing user/profile containers, no third-party in the read path. PostHog only powers the behavioural / time-series dashboards Cosmos isn't built for (funnels, retention). The two surfaces never share a pipeline; the unifying constraint is the privacy contract (no PII either way), not a common data store.

**GDPR posture (non-negotiable):** no PII leaves the server. PostHog runs cookieless with no `identify()` call, IP anonymized, autocapture off, session replay disabled. Lawful basis = legitimate interest with a documented balancing test. Opt-out available. Privacy notice updated in the same PR. See `Risks & Mitigations`.

---

## Why this matters

- **Community trust** — a public stats page tells potential members "people are here, this is alive" before they sign in. Network-effect FOMO is the cheapest acquisition channel CodePals has.
- **Operator visibility** — today we have zero data on which features get used. We can't make priority calls without that.
- **Fundraising / partner conversations** — investors and partners ask for the same five numbers (DAU, MAU, retention, funnel conversion, growth). PostHog dashboards make those one screenshot away.
- **Spec discipline** — adding any third-party analytics shifts the privacy-by-default promise we ship in `PRIVACY.md`. This must be a deliberate, documented slice — not a "we'll figure out the legal layer later" bolt-on.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Visitor sees community-stats page (Priority: P1) 🎯 MVP

As a curious visitor (signed in or not) landing on CodePals.io, I can hit `/community` and see at-a-glance how many CodePals are on the platform, what skills are represented, how active the community is right now — without giving up any info myself.

**Why this priority**: The community page is the visible artefact of platform adoption. Without it, the analytics work is invisible to anyone but the operator — defeating half the goal (community signal + investor share).

**Independent Test**: Visit `/community` while signed out. Page renders without redirecting to login. Numbers reflect actual state — at least one of the displayed counts changes after a new user signs up (within the agreed refresh window, see FR-721).

**Acceptance Scenarios**:

1. **Given** I'm not signed in, **When** I navigate to `/community`, **Then** the page loads with stats (no auth redirect).
2. **Given** the platform has N public profiles, **When** I view `/community`, **Then** "CodePals listed" shows N (within cache window).
3. **Given** profiles collectively use M distinct skills, **When** I view `/community`, **Then** "Skills represented" shows M.
4. **Given** I'm on a phone, **When** I view `/community`, **Then** the layout is readable + tappable (Tailwind responsive defaults).
5. **Given** I'm signed in, **When** I view `/community`, **Then** the page behaves identically to signed-out (no per-user content — aggregate only).

---

### User Story 2 — Operator inspects feature adoption on PostHog (Priority: P1) 🎯 MVP

As the operator, I can open the PostHog dashboard (EU host) and answer: "did anyone use the per-field visibility UI this week?", "what's the signup → profile-saved conversion?", "which routes get hit most?" without writing custom queries each time.

**Why this priority**: Without this, every product-decision question becomes a Cosmos query exercise. The operator-facing dashboard is the everyday tool.

**Independent Test**: After the PR ships and a few real interactions occur on dev, the PostHog EU dashboard shows non-zero counters for `page_view`, `profile_saved`, `field_visibility_changed`.

**Acceptance Scenarios**:

1. **Given** a user signs up and saves a profile, **When** I open PostHog, **Then** the funnel `landing → signup_completed → profile_saved` shows that user's progression as one anonymous counter increment per step.
2. **Given** anyone changes a field's audience, **When** I filter on `field_visibility_changed`, **Then** I see the event with payload `{field_type, level}` (no userId, no githubUsername).
3. **Given** I want to share with an investor, **When** I open PostHog's "share dashboard" UI, **Then** I can generate a read-only link of a curated dashboard (PostHog's standard feature).

---

### User Story 3 — User opts out of analytics (Priority: P2)

As a CodePal who wants the platform but not to be counted in any analytics, I can toggle "Don't include me in usage stats" in a settings affordance, and from that moment onwards no events fire from my browser.

**Why this priority**: Defensible-by-default analytics + a clear opt-out is the standard expectation. P2 because the analytics setup is already privacy-minimised (no PII, no identification, cookieless) — opt-out is the cherry, not the foundation.

**Acceptance Scenarios**:

1. **Given** I toggle the opt-out on, **When** I navigate any page, **Then** no PostHog events fire (verify in DevTools network tab — no requests to `eu.i.posthog.com`).
2. **Given** I've opted out, **When** I view `/community`, **Then** the page still renders (community page reads from our own `/api/community-stats`, not PostHog).
3. **Given** I haven't toggled the opt-out, **When** I navigate any page, **Then** events fire normally — opt-out is **explicit**, not "wait for the user to opt in" (legitimate-interest basis; see Risks).

---

### User Story 4 — Investor receives a stats deck (Priority: P2)

As the operator preparing for an investor / partner conversation, I can pull a one-page summary of the top adoption metrics (DAU, MAU, growth rate, profile-completion rate) from PostHog directly, with the option to deep-link to the public `/community` page as the supporting "this is verifiable" artefact.

**Why this priority**: P2 because the data is collected by US1+US2 — this is a "use" story, not a "build" story. Listed for completeness; the implementation is operator workflow + PostHog config, not code.

---

## Edge Cases & Decisions

- **Where the community page gets its numbers**: Cosmos, NOT PostHog. Rationale:
  - "X CodePals listed" / "Y skills represented" are **deterministic counts** of our own data. PostHog can't answer them — it never sees the profile docs. Cosmos can answer them in one query each, ~5–15 RU.
  - Keeps the public read path third-party-free. If PostHog is ever down, `/community` still works.
  - PostHog handles **time-series + behaviour** (DAU, funnels) that Cosmos isn't built for.
- **Refresh cadence**: `/api/community-stats` is cached server-side for 5 minutes (FR-721). Stats don't change second-to-second; the cache pins our RU spend at a known ceiling regardless of traffic.
- **Anonymous vs authenticated visitors**: `/community` is anonymous-accessible (FR-720 sets `allowedRoles: ['anonymous', 'authenticated']`). The data is aggregate; there's no privacy reason to gate it.
- **PostHog host**: EU only. `eu.posthog.com` for the SDK, `eu.i.posthog.com` for ingest. Hardcoded in the analytics wrapper; not configurable per env (less rope to misconfigure).
- **PostHog cookies**: NONE. `persistence: 'memory'` — events fire, no identifier persists across page reloads. ePrivacy cookie-banner threshold not crossed.
- **PostHog `identify()`**: NEVER called. Events are unattributed. We sacrifice per-user retention curves (which would need stable IDs) in exchange for not handling PII.
- **PostHog autocapture**: OFF. Only explicit `track(event, props)` calls send data. We know exactly what's collected, which we have to disclose in `PRIVACY.md`.
- **PostHog session replay**: OFF, and **double-locked** by `mask_all_text: true` so a future "let me just turn on replay" doesn't accidentally capture profile contents (which after spec 006-A's per-field visibility would be a real privacy regression).
- **Event payload shape**: only literal feature/route names + coarse enums. No free-form user input. No identifiers. Reviewer must reject any event with a username/email/userId in the payload — pinned by a TypeScript wrapper that types the allowed payload keys.
- **Opt-out persistence**: `localStorage.codepals_no_analytics = '1'`. localStorage is **not** a cookie under ePrivacy (it's first-party storage of a user preference; not a tracker). Documented.
- **What about visitors with 3rd-party-cookie / Brave-style protection that blocks PostHog?**: Analytics silently fail (PostHog SDK is robust to network blocks). Community page still works (it reads our own endpoint).
- **`/community` and the existing `/find` directory**: `/community` is the **aggregate** view (counts, distributions); `/find` is the **enumerable** view (one card per profile, signed-in only). Different audiences, different gates.

---

## Functional Requirements _(mandatory)_

### Community stats API + page

- **FR-700**: New endpoint `GET /api/community-stats` MUST return an aggregate snapshot:
  ```ts
  {
    codepalsTotal: number,        // count of UserRecords whose id STARTS WITH 'gh-' (excludes the admin-roster singleton 'roster' and any future non-user docs in the same container)
    profilesPublic: number,       // count of profiles with profileVisibility = 'public'
    skillsDistinct: number,       // count of distinct skills across all public profiles
    languagesDistinct: number,    // count of distinct preferredLanguages across public profiles
    activeLastWeek: number,       // count of UserRecords with lastSeenAt within 7 days (spec 006 field)
    topSkills: Array<{ name: string; count: number }>,  // top 10 by frequency
    snapshotAt: string,           // ISO timestamp of when the cache was last computed
  }
  ```
- **FR-701**: `GET /api/community-stats` MUST be anonymous-accessible (`allowedRoles: ['anonymous', 'authenticated']` in `staticwebapp.config.json`).
- **FR-702**: The response MUST be cached server-side for 5 minutes (e.g. an in-memory `{value, expiresAt}` per Function worker). RU budget per real call ≤ 50 RU (3–5 small COUNT/DISTINCT queries).
- **FR-703**: The endpoint MUST NOT return any user-identifying data — pinned by a structural invariant test (no `userId`, no `githubUsername`, no `lastSeenAt`, no `displayName` in the response).
- **FR-710**: New page `/community.astro` MUST render the snapshot in mobile-first responsive layout. Headline numbers in big type; top-skills as a chip list; "as of {snapshotAt}" footnote.
- **FR-711**: `/community` MUST be anonymous-accessible in `staticwebapp.config.json`. No login wall.
- **FR-712**: `/community` MUST have an explicit link from the homepage (`/`) — discoverable without typing the URL.
- **FR-713**: The page MUST handle the empty/just-launched case gracefully: zero counts render as "0" with friendly framing, not error states.

### Analytics wrapper (PostHog integration)

- **FR-720**: New module `src/lib/analytics.ts` — the **single** point where PostHog is initialised. No other file imports `posthog-js` directly (lint rule + grep-invariant test).
- **FR-721**: Initialisation config (hardcoded; not env-configurable to prevent operator misconfig):
  ```ts
  posthog.init(PUBLIC_POSTHOG_KEY, {
  	api_host: 'https://eu.i.posthog.com',
  	ui_host: 'https://eu.posthog.com',
  	persistence: 'memory',
  	autocapture: false,
  	capture_pageview: false, // we send page_view explicitly with our shape
  	disable_session_recording: true,
  	disable_surveys: true,
  	mask_all_text: true, // defence-in-depth if replay accidentally turns on
  	mask_all_element_attributes: true,
  	ip: false, // PostHog server-side IP anonymisation
  	respect_dnt: true,
  });
  ```
- **FR-722**: `PUBLIC_POSTHOG_KEY` is the project public key — safe to ship in the client bundle (it's how PostHog identifies the project; not a secret). Sourced from an Azure Static Web App **application setting** of the same name, read via `import.meta.env.PUBLIC_POSTHOG_KEY` at `astro build` time. NOT committed to source. NOT stored in Key Vault (it's a public token; Key Vault is the wrong tool — and forces a runtime secret fetch we don't need for a build-time constant). Documented in `AZURE_SETUP_GUIDE.md`. If the key is unset at build time, `analytics.init()` MUST short-circuit (no-op) instead of throwing — preserves graceful degradation for forks / local previews without a PostHog project.
- **FR-722a**: Any **server-side** PostHog secret introduced later (e.g. a Personal API Key for export jobs, dashboard provisioning, or feature-flag fetches from the API host) MUST go to **Azure Key Vault** and be read via the existing `ConfigService` pattern (`src/services/ConfigService.ts` → `getSecret('POSTHOG_PERSONAL_API_KEY')`). It MUST NOT live in an SWA env var (env vars are bundled into the build artifact for `PUBLIC_*` and survive container restarts as plaintext for non-public ones — Key Vault is the only acceptable home for true secrets per the existing repo posture). No such server secret is needed for the PR1 scope (frontend-only event capture); this FR exists to pin the rule before scope creeps.
- **FR-723**: Exported `track<E extends EventName>(event: E, props: EventPayloads[E])` is the **only** way to send an event. `EventPayloads` is a typed map (one entry per allowed event) so a free-form user string can't be stuffed into a payload without a type error.
- **FR-724**: `posthog.identify(...)` MUST NEVER be called. Lint rule + test asserts no source line matches `posthog.identify(`.
- **FR-725**: On every page mount, fire `track('page_view', { route })` where `route` is a **normalized literal route name** (see FR-726's `RouteName` union) derived from `window.location.pathname` via a small mapping function (e.g. `/find/<username>` → `'find-detail'`, `/find` → `'find'`). The raw pathname MUST NOT be sent — dynamic segments could carry identifiers (usernames, ids). Unknown paths map to `'other'`. No query string or hash is ever read.
- **FR-726**: Initial event surface (PR1 scope — extend cautiously later). All payload value types are literal unions, `boolean`, or `number` — **never unrestricted `string`** (privacy guardrail; enforced by T-741):
  - `page_view` `{ route: RouteName }` where `RouteName = 'home' | 'find' | 'find-detail' | 'profile-edit' | 'community' | 'welcome' | 'admin' | 'other'`
  - `signup_completed` `{}`
  - `profile_saved` `{ visibility: 'public' | 'private' }`
  - `field_visibility_changed` `{ field: HideableField, level: FieldVisibility }`
  - `find_card_clicked` `{}`
- **FR-727**: Before any `track()` call, the module MUST check `localStorage.getItem('codepals_no_analytics')` — if set, return without firing.

### CSP

- **FR-730**: PR1 bundles `posthog-js` via `npm` (per T-730) — the SDK ships in the Astro build artifact, not loaded from a CDN. Therefore `staticwebapp.config.json` MUST add **only** `https://eu.i.posthog.com` to `connect-src`; `script-src` is unchanged. The CSP test (`src/staticwebapp.config.test.ts`) gets a new invariant pinning exactly `connect-src` += `https://eu.i.posthog.com`, asserting that `https://eu.posthog.com` is **NOT** in `script-src` (so a future CDN switch is a deliberate, test-failing change). The spec-007 justification lives in the test file's inline comment (JSON has no comments — never inline-justify in `staticwebapp.config.json` itself).

### Opt-out UI (US3, P2)

- **FR-740**: Profile-edit page (or a new `/settings`) MUST surface a single toggle "Include me in anonymous platform analytics" (default ON). Toggling OFF writes `localStorage.codepals_no_analytics = '1'`; toggling ON removes the key.
- **FR-741**: The toggle MUST take effect immediately (no reload). Because FR-727 mandates `localStorage.getItem('codepals_no_analytics')` is read on **every** `track()` call (no cached opt-out state in module memory), the next event after the toggle naturally respects the new value. No `analytics.refresh()` API is needed or exposed; the `localStorage`-on-every-call read IS the mechanism.

### Privacy disclosure

- **FR-750**: `PRIVACY.md` MUST be updated in the same PR that introduces the analytics module. Sections to add:
  - What's collected (the event list from FR-726)
  - What's NOT collected (no PII, no identifier, no IP retention, no replay)
  - Processor (PostHog Cloud EU + DPA link)
  - Retention (configured to 90 days; PostHog default years)
  - Opt-out instructions
- **FR-751**: `.specify/privacy/posthog-lia.md` — the Legitimate Interest Assessment (balancing test) MUST be committed alongside the implementation PR. Template covers: purpose, necessity, balancing, opt-out, expectation.

### Operator dashboards (US4)

- **FR-760**: No code changes. Operator configures PostHog dashboards manually post-deploy. Documented in `AZURE_SETUP_GUIDE.md`: a list of recommended dashboards (signup funnel, feature adoption, retention) with the PostHog event names from FR-726.

---

## Risks & Mitigations

| Risk                                                 | Mitigation                                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GDPR violation through accidental PII capture        | Typed event payloads (FR-723); lint/grep invariant that bans `posthog.identify`; autocapture off; mask_all_text on; explicit event whitelist of 5 events                           |
| Cookie-banner law triggered by accident              | `persistence: 'memory'` (FR-721); zero cookies set by PostHog with this config. localStorage opt-out flag is a user-preference, not a tracker (documented in `PRIVACY.md`)         |
| Session replay accidentally enabled                  | `disable_session_recording: true` + `mask_all_text: true` + `mask_all_element_attributes: true` — three locks. PR-template-check could add a grep guard if we want belt-and-braces |
| PostHog outage breaks `/community`                   | `/community` reads `/api/community-stats` (Cosmos-derived). PostHog only powers the operator dashboards (US2/US4). Public surface stays up                                         |
| Cosmos cost from `/community` polling                | 5-minute server-side cache (FR-702); RU ceiling ≤50/refresh regardless of public traffic                                                                                           |
| Investor / community shown stale numbers             | `snapshotAt` is part of the response (FR-700) and rendered (FR-710's footnote). Honesty: visitors know it's a 5-min cache, not real-time                                           |
| CSP relaxation undermines hardened policy            | Two explicit additions to `connect-src`/`script-src` with inline comment + spec reference. CSP test pins them (no silent further widening)                                         |
| Operator forgets to sign PostHog DPA                 | LIA document (FR-751) requires a signed-DPA reference; PR template's "Operator action items" section flags it                                                                      |
| Visitor with privacy tools sees inconsistent numbers | Acceptable. The aggregate community page works (own endpoint). Behavioural events for that visitor are absent from PostHog — that's the user's choice                              |

---

## Out of Scope

- **Per-user behavioural tracking** — no `identify()`, no cohort retention by individual.
- **Session replay** — explicitly off + locked. Cannot be enabled without a spec amendment + privacy review.
- **A/B testing infrastructure** — PostHog supports it; we don't ship it here. Spec extension if/when needed.
- **Email digests of stats** — investor + community comms outside the webapp are manual today. Automation later.
- **Real-time dashboards** — 5-minute community cache is the contract. Real-time is a heavy feature for no real benefit.
- **Heatmaps** — autocapture is off; heatmaps need it. Not now.
- **Self-hosting PostHog** — start on Cloud EU (signed DPA, zero ops). Revisit if scale or legal pressure changes.

---

## Constitution Compliance Check

| Principle                                    | Compliance                                                                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P1 — User-First & Inclusive**              | Community stats are public, no login wall. Opt-out exists. Anonymous-by-default analytics respect the user. ✅                                                                                                           |
| **P2 — Privacy by Default (NON-NEGOTIABLE)** | No PII; no identifier; no cookies; no replay; explicit event whitelist; opt-out. LIA documented. ✅                                                                                                                      |
| **P3 — Security (NON-NEGOTIABLE)**           | CSP additions are minimal + explicit. No new attack surface beyond the read-only `/api/community-stats` endpoint, which is rate-limit-friendly (cached). Public key is non-sensitive per PostHog's model. ✅             |
| **P4 — Accessibility (NON-NEGOTIABLE)**      | `/community` follows the existing form/page a11y patterns. Numbers in semantic `<dl>`/`<output>` markup. ✅                                                                                                              |
| **P5 — No Dark Patterns (NON-NEGOTIABLE)**   | Opt-out is one toggle, no friction. Stats are honest aggregates with `snapshotAt`. No "active in last X hours" inflation. ✅                                                                                             |
| **P6 — Open & Transparent**                  | Event list + retention + processor in `PRIVACY.md`. LIA committed. ✅                                                                                                                                                    |
| **P7 — Brand consistency**                   | Reuses existing Tailwind tokens. Numbers card matches `/find` card visual style. ✅                                                                                                                                      |
| **P8 — i18n-friendly**                       | Stat labels in i18n bundle. Numbers locale-formatted via `Intl.NumberFormat`. ✅                                                                                                                                         |
| **P9 — Verified Quality (NON-NEGOTIABLE)**   | Source-grep invariants: no `posthog.identify`, no `posthog-js` import outside `src/lib/analytics.ts`. Endpoint-level test for `/api/community-stats` shape + no-PII invariant. Playwright DOM smoke for `/community`. ✅ |

---

## Open Questions

- [ ] **Top-skills cap** — show top 10 or top 20? Recommendation: 10 for mobile readability, with "see more" later if needed.
- [ ] **Country / timezone distribution on `/community`?** — interesting, but timezone is per-user data (currently a single string field on profile). Aggregate distribution (count by region) is fine; exact precision risks identifying tiny populations. Defer to a follow-up + a re-anonymisation review.
- [ ] **Should `/community` show online-now count** (leverages spec 006 `lastSeenAt`)? — yes, and `activeLastWeek` is already in FR-700. An "online now" (5-min cutoff) would be punchier but updates every 5min; acceptable, queue as follow-up.
- [ ] **Operator dashboard list** in `AZURE_SETUP_GUIDE.md` — final list of dashboards + which screenshots make a good investor pack. Decide alongside the first real investor conversation.
- [ ] **PostHog feature flags** — out of scope here; useful later for safe rollouts (e.g. View Transitions). Note in `Out of Scope`.

---

## Success Criteria

- **SC-700**: `/community` loads in under 500ms (5-min cache, no third-party in the read path) and renders non-zero stats once the platform has any data.
- **SC-701**: `/api/community-stats` RU cost ≤ 50 RU per cache miss; cache hit serves in <5ms.
- **SC-702**: PostHog EU dashboard shows a working `signup_completed → profile_saved` funnel within 24h of the analytics PR merging.
- **SC-703**: No `posthog.identify(` anywhere in the codebase (lint/grep invariant test passes).
- **SC-704**: No event payload contains a `userId`, `githubUsername`, or any field-from-Profile (typed `EventPayloads` map enforces this; test exercises every event constructor and asserts no PII keys).
- **SC-705**: The Legitimate Interest Assessment (`.specify/privacy/posthog-lia.md`) is committed alongside the implementation PR.
- **SC-706**: `PRIVACY.md` discloses the analytics processor, the event list, retention, and opt-out before the analytics module ships.
- **SC-707**: Opt-out toggle: when enabled, zero requests to `eu.i.posthog.com` (verifiable in DevTools network tab; assertable in Playwright DOM smoke).
