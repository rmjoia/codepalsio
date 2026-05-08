---
description: "Task list for spec 002 — Spoken Languages on Profile + Discovery Filter"
---

# Tasks: Spoken Languages on Profile + Discovery Filter

**Input**: `.specify/spec/002-spoken-languages-and-discovery-filter.md`, `.specify/plan/002-spoken-languages-and-discovery-filter.md`
**Companion**: `.specify/spec/003-community-safety-and-anti-abuse.md` (P1a, P1b, P1c MUST land before T-220 series enables the public filter)
**Tests**: REQUIRED — every PR includes vitest unit/integration coverage and (where applicable) e2e.

**Constitution Compliance**: Each task MUST uphold Principles 1–8. Privacy + Security tasks below explicitly annotate the constraint that informs them.

**Organization**: Tasks are grouped by user story (US1, US2, US3 from spec 002) so each can ship as an independent PR.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 (or SHARED for foundational)
- File paths are exact

---

## Phase 1: Foundational (shared across stories)

**Purpose**: Allow-list module + type updates that every downstream task depends on.

- [ ] **T-201** [P] [SHARED] Add `Profile.spokenLanguages?: string[]` to `api/src/lib/types.ts` (Principle 5 — privacy: optional + defensive default for legacy docs).
- [ ] **T-202** [P] [SHARED] Create `api/src/lib/languages.ts` exporting `LANGUAGE_ALLOW_LIST: readonly string[]` (initial set per spec 002 "Key Entities") and helpers `isAllowedLanguage(s)`, `normalizeLanguageList(input)` — the latter lowercases, dedupes, and strips entries that are not in the allow-list. It does NOT cap length; over-cap rejection is the caller's contract per FR-003 (reject-and-preserve, not truncate). The handler in T-212 enforces the cap separately and returns HTTP 400. (Principles 3, 8 — security/i18n.)
- [ ] **T-203** [SHARED] Create `api/src/lib/languages.test.ts` covering: allow-list shape (lowercase, no duplicates, all ≤ 3 chars); `isAllowedLanguage` accepts/rejects; `normalizeLanguageList` lowercases / dedupes / strips invalid entries; explicitly does NOT truncate (length-cap is enforced upstream by the handler).
- [ ] **T-204** [P] [SHARED] Mirror the allow-list constant in the frontend at `src/lib/languages.ts` (re-exported, plus a `LANGUAGE_DISPLAY_NAMES` lookup keyed by code, sourced from i18n strings — Principle 8). Add `src/lib/languages.test.ts` asserting the keys match `api/src/lib/languages.ts`'s allow-list (drift guard).
- [ ] **T-205** [SHARED] Add `PRIVACY.md` paragraph mentioning the new `spokenLanguages` self-disclosed field, retention follows existing profile retention.
- [ ] **T-206** [SHARED] Verify `api/src/lib/profile-repo.ts:PROFILE_FIELDS` already includes `spokenLanguages` projection — if not, add it; add a regression test in `profile-repo.test.ts`.

**Checkpoint**: Foundation ready; US1 and US2 implementation can proceed.

---

## Phase 2: User Story 1 — Codepal sets spoken languages on profile (Priority: P1) 🎯 MVP

**Goal**: Codepals can edit and view their own languages. No /find filter yet — this slice is independently shippable and demoable (you can see your languages on your profile).

**Independent Test**: Sign in, edit profile, save 3 languages, refresh — badges render in alphabetical order.

### Tests for User Story 1 (REQUIRED — before implementation)

- [ ] **T-210** [P] [US1] Add `profile-save.test.ts` cases: (a) accepts allow-listed codes, normalizes to lowercase, dedupes; (b) rejects non-allow-listed codes with HTTP 400 + preserves existing stored value; (c) **rejects** > 10 entries with HTTP 400 + preserves existing stored value (NOT truncate); (d) preserves stored value when request omits the field.
- [ ] **T-211** [P] [US1] Add `profile-get.test.ts` (or extend existing) asserting `spokenLanguages` is returned in the response payload.

### Implementation for User Story 1

- [ ] **T-212** [US1] Wire `normalizeLanguageList` (T-202) into `api/src/profile-save.ts` — read `body.spokenLanguages`, normalize, **then enforce the length cap (10) at the handler level**: if the normalized list exceeds 10, return HTTP 400 with `{ error: 'spokenLanguages exceeds maximum of 10 entries', max: 10 }` and DO NOT upsert. Otherwise, store on the upserted Profile. (Principle 3 — server-side validation, never trust client; reject-and-preserve over silent truncation, FR-003.)
- [ ] **T-213** [US1] Update `src/pages/profile/edit.astro` and `src/pages/profile/setup.astro` to render a `<select multiple>` populated from `LANGUAGE_DISPLAY_NAMES`, pre-selected from the loaded profile, posted as `spokenLanguages` on save.
- [ ] **T-214** [US1] Update `src/pages/profile/index.astro` to render language badges (deterministic alphabetical order by display name, locale-aware sort).
- [ ] **T-215** [US1] Update `src/services/api.ts` Profile type to include `spokenLanguages?: string[]` (mirror api/src/lib/types.ts).
- [ ] **T-216** [US1] Verify XSS-safe rendering — language badge text comes from the i18n display-name table (allow-list-keyed, no user input).
- [ ] **T-217** [US1] Run prettier + lint + unit tests; open PR with assignee + Copilot review request.

**Checkpoint**: User Story 1 fully functional. Codepals can list languages on their profile (no filter yet — that's US2).

---

## Phase 3: User Story 2 — Filter /find by language (Priority: P1)

**⚠️ Pre-requisite**: spec 003 P1a (ToS clause) + P1b (reporting endpoint + button) + P1c (admin moderation queue) MUST be merged before this user story is enabled in production. The implementation can proceed in parallel; the rollout is gated.

**Goal**: Codepals can narrow `/find` results to those who speak selected languages, with the FR-011 uniqueness guard preventing narrow-filter doxxing.

**Independent Test**: With seeded fixtures (3 codepals, mixed languages), the filter narrows correctly; setting language + 1 other facet that resolves to < 5 codepals returns the uniqueness sentinel.

### Tests for User Story 2 (REQUIRED — before implementation)

- [ ] **T-220** [P] [US2] `profiles-list.test.ts` — assert the new query parses `?lang=pt,es` correctly: deduplicates, lowercases, validates against allow-list, ignores unknown codes (does NOT 400 — silent drop avoids leaking allow-list shape).
- [ ] **T-221** [P] [US2] `profiles-list.test.ts` — assert the SQL query includes the EXISTS subquery and binds `@languages` parameter (structural invariant test, mirrors existing privacy-guard test pattern).
- [ ] **T-222** [P] [US2] `profiles-list.test.ts` — uniqueness guard: when result count < threshold AND filter has ≥ 2 facets, response is `{ profiles: [], uniquenessGuardTriggered: true }` instead of leaking matches.
- [ ] **T-223** [P] [US2] `profiles-list.test.ts` — uniqueness guard does NOT fire when only language is filtered (1 facet), result count immaterial.
- [ ] **T-224** [P] [US2] `profiles-list.test.ts` — privacy guard preserved: `c.profileVisibility = 'public'` AND `c.userId != @currentUserId` invariants still in the WHERE clause.

### Implementation for User Story 2

- [ ] **T-225** [US2] Update `api/src/profiles-list.ts:PROFILES_QUERY` (or replace with `buildProfilesQuery(filter)`) to accept a `languages: string[]` parameter and inject the EXISTS subquery server-side.
- [ ] **T-226** [US2] Add the uniqueness-guard logic in `profilesHandler`: count facets; if ≥ 2 and result count < threshold (config constant `UNIQUENESS_GUARD_MIN_RESULTS = 5`), return the sentinel.
- [ ] **T-227** [US2] Update `src/pages/find.astro` to render a multi-select language filter; on selection change, hit `/api/profiles?lang=...`; render badges per result; render the uniqueness-guard banner when the response carries the sentinel flag.
- [ ] **T-228** [US2] Add `LANGUAGE_FILTER_ENABLED` config constant in `src/lib/feature-flags.ts` (or similar). Hide the filter UI when false. Keep the API param-acceptance unchanged so the kill-switch is purely a UI affordance.
- [ ] **T-229** [US2] Update `src/staticwebapp.config.test.ts` route gates if any new endpoint is added (none expected — `/api/profiles` already exists with `authenticated` gate).
- [ ] **T-230** [US2] Add `e2e/profile-and-find.e2e.test.ts` exercising the round trip: profile-edit → save → /find filter → result hits → uniqueness guard fires when conditions met.
- [ ] **T-231** [US2] Add structured logging in `profilesHandler` for FR-012 (filter parameters + requesting userId, no matched-userIds).
- [ ] **T-232** [US2] Run prettier + lint + unit + e2e (PR-preview) + audit; open PR with assignee + Copilot review request.

**Checkpoint**: User Story 2 functional behind the feature flag. Verify with the kill-switch off (filter UI hidden, no behaviour change) before flipping it on in dev.

---

## Phase 4: User Story 3 — Render languages on profile views (Priority: P2)

**Goal**: Language badges visible on `/profile` (own and others when public profile views exist).

**Note**: For the current MVP, "viewing another's profile" is not yet a user-facing route — `/profile` is your own. This story is largely covered by US1's badge rendering. Tracked here for traceability when public profile routes ship.

- [ ] **T-240** [US3] When public profile view route is introduced (not in this PR), reuse the badge rendering from `profile/index.astro`. No code today.

**Checkpoint**: Deferred — re-activate when public profile routes are speced.

---

## Phase 5: Polish & cross-cutting

- [ ] **T-250** [P] [SHARED] Update `AZURE_SETUP_GUIDE.md` only if any new app setting / container is introduced (currently none — confirm before merge).
- [ ] **T-251** [P] [SHARED] Update `README.md` Features section to mention language matching.
- [ ] **T-252** [SHARED] After 30 days of usage, review filter-result distributions logged via T-231 and adjust `UNIQUENESS_GUARD_MIN_RESULTS` if SC-006 indicates a different threshold is appropriate.
- [ ] **T-253** [SHARED] Audit query (admin tooling, separate spec): verify SC-003 invariant — 100% of stored language codes are in the allow-list. Run monthly via CI, not interactively.

---

## Dependencies

- **Phase 1 (Foundational)** — no internal blockers; can start now.
- **Phase 2 (US1)** — blocked on Phase 1 (T-201, T-202, T-204 specifically).
- **Phase 3 (US2)** — blocked on Phase 1 + Phase 2 + spec 003 P1a + P1b + P1c.
- **Phase 4 (US3)** — deferred.

## Implementation Strategy

**MVP cut**: Phase 1 + Phase 2 (US1) ship first as a single PR. Public-visible value but no new discovery axis introduced — safe even before spec 003 P1a/b/c land.

**Discovery enable**: Phase 3 (US2) ships after spec 003 P1a/b/c. Feature-flagged for the rollout (T-228 kill switch).

**Polish**: Phase 5 batched after both above are stable.
