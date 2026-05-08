# Feature Specification: Spoken Languages on Profile + Discovery Filter

**Feature Branch**: `002-spoken-languages-and-discovery-filter`
**Created**: 2026-05-08
**Status**: Draft
**Input**: User description: "Codepals need to specify the languages they speak so people can filter and connect with other codepals that speak the same language. Strong focus on privacy and security — must not enable the platform to be exploited for dating / non-coding use."

---

## Summary

Adds a `spokenLanguages` field to the codepal profile (a curated subset of BCP-47 language tags) and an /find filter so a codepal looking for a mentor / mentee / collaborator can narrow to those who share a common language. Designed defensively: language is a strong human-discovery signal, and discovery signals attract abuse. The design treats the "anti-dating-app exploitation" requirement as a first-class constraint, not a postscript — it shapes the data model, the UX, the filter behaviour, and the surrounding policy (cross-referenced to spec 003).

This spec is paired with **003-community-safety-and-anti-abuse** (platform-wide safety policy and tooling). Spec 003 does not block 002 from shipping, but the items 002 leans on (ToS clause, reporting, filter-uniqueness guard) MUST land before 002 is publicly enabled. Implementation order for the joint MVP is enumerated in `.specify/tasks/002-spoken-languages-and-discovery-filter.md`.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Codepal lists their spoken languages (Priority: P1) 🎯 MVP

As a signed-in codepal, I can set the human languages I'm comfortable communicating in (English, Portuguese, etc.) on my profile, so other codepals can find me as a same-language mentor / mentee / pair-programming partner.

**Why this priority**: This is the foundational data without which no other story works. Even before the filter ships, simply seeing language badges on a profile delivers value (lets two codepals confirm a shared language before reaching out).

**Independent Test**: Sign in, go to `/profile/edit`, add 2 languages from the picker, save, return to `/profile` — the languages render as badges; the saved profile in Cosmos has the canonical BCP-47 codes (server-validated against the allow-list).

**Acceptance Scenarios**:

1. **Given** I'm a signed-in codepal with no languages set, **When** I open the profile edit page, **Then** I see a multi-select language picker populated from a curated allow-list, with no languages pre-selected.
2. **Given** I select 3 languages and save, **When** I return to `/profile`, **Then** the 3 languages render as badges in a deterministic order (alphabetical by display name).
3. **Given** I attempt to POST `spokenLanguages: ['xx']` to `/api/profile-save` (a code not in the allow-list), **When** the request is processed, **Then** the server rejects it with HTTP 400 and the field is unchanged in storage.
4. **Given** I attempt to set 25 languages, **When** the request is processed, **Then** the server caps it at the documented max (10) and returns HTTP 400 listing the limit.
5. **Given** I unselect a previously-saved language and save, **When** I reload, **Then** the unselected language no longer appears.

---

### User Story 2 — Codepal filters /find by language (Priority: P1)

As a signed-in codepal browsing the directory, I can filter the listing to show only codepals who speak one or more languages I select, so I can find folks I can communicate with naturally.

**Why this priority**: This is the use case that motivated the feature. Without filtering, the language data is searchable only via eyeballing — the value is reaching the right person quickly. Same priority as Story 1 because they ship together for the MVP slice (profile + filter is one cohesive user value).

**Independent Test**: Two codepals exist, one with `['en']`, one with `['en', 'pt']`. Sign in as a third user, visit `/find`, select "Portuguese" — only the second codepal appears.

**Acceptance Scenarios**:

1. **Given** there are 5 public codepals with mixed languages, **When** I select "Portuguese" in the /find filter, **Then** only codepals whose `spokenLanguages` array contains "pt" appear in the results.
2. **Given** I select two languages "Portuguese" + "Spanish", **When** the filter runs, **Then** results include codepals who speak EITHER language (OR semantics, documented in the UI). [NEEDS CLARIFICATION: confirm OR vs AND default; this spec assumes OR is more useful for "I can talk to anyone in either"]
3. **Given** my own profile has `spokenLanguages: ['en']`, **When** I filter by "English", **Then** my own profile is NOT in the results (existing privacy behaviour preserved — you don't see yourself on /find).
4. **Given** a codepal has `profileVisibility = 'private'`, **When** any filter runs, **Then** that codepal never appears regardless of language match.
5. **Given** the filter combination resolves to fewer than 5 codepals AND uses ≥ 2 narrowing facets (e.g., language + location + availability), **When** the filter runs, **Then** the UI shows a "Broaden your filters to see results" banner instead of the (potentially identifying) result list. See FR-011 (uniqueness guard).

---

### User Story 3 — Codepals see languages on profile views (Priority: P2)

As a signed-in codepal viewing another codepal's profile, I see the languages they speak as visible badges, so I can confirm communication compatibility before initiating a connection.

**Why this priority**: Discoverable via Story 1 already (the badges render on profile pages). Bumping to P2 only for the case of ensuring the badges are also visible on the public profile route (`/profile/{username}` if/when implemented), which is itself a future feature. For the current MVP, profile-view rendering is the same component as profile-edit's preview, so it ships with P1.

**Independent Test**: Visit any other codepal's profile and verify the language badges render. Covered by the same E2E that exercises Story 1.

---

### Edge Cases

- **Empty languages list**: a codepal with `spokenLanguages: []` is INCLUDED in unfiltered /find but EXCLUDED from any language-filtered query (no language match possible).
- **Languages on legacy profiles** (pre-#24 docs lacking the field): backfilled to `[]` server-side via the same defensive `?? []` pattern used elsewhere; no migration required.
- **Filter selecting a language no one speaks**: returns 0 results with a "No codepals match" message — does NOT trigger the uniqueness guard (0 < 5, but it's not a doxxing signal because there's nothing to dox).
- **Language allow-list change** (e.g., add "Catalan"): existing profiles unaffected; the picker shows the new option going forward. Languages REMOVED from the allow-list still render on existing profiles (display-only) but cannot be re-saved — the next profile-save server-side normalizes them out.
- **Case sensitivity**: BCP-47 codes are case-insensitive ("en", "EN" both legal); we normalize to lowercase on save.
- **Region subtags** (e.g., "pt-BR" vs "pt-PT"): out of scope for MVP — store base language ("pt") only. A future enhancement may add region preference as an orthogonal field.
- **Profile owner filtering /find by their own languages**: still excluded from results (per existing /find query). UI shows a "your own profile is hidden from this view by design" hint in the empty-state.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a signed-in codepal to add/remove spoken languages on their own profile via `/profile/edit`.
- **FR-002**: System MUST validate submitted language codes against a server-side allow-list (curated subset of BCP-47 base codes — see "Key Entities → LanguageAllowList"). Codes not in the list MUST be rejected with HTTP 400 and the existing stored value preserved.
- **FR-003**: System MUST cap `spokenLanguages` at a documented maximum (10) per profile. Submissions exceeding the cap MUST be rejected with HTTP 400.
- **FR-004**: System MUST normalize submitted codes to lowercase, deduplicate, and store in the profile document under `spokenLanguages: string[]`.
- **FR-005**: System MUST render `spokenLanguages` as visible badges on profile views (own and others'), in a deterministic order (alphabetical by display name in the user's UI locale).
- **FR-006**: Users MUST be able to filter `/find` results by one or more languages selected from the same allow-list.
- **FR-007**: The filter MUST treat multiple selected languages as OR (a codepal matches if ANY of their `spokenLanguages` matches ANY selected filter value).
- **FR-008**: The filter MUST honor existing `profileVisibility = 'public'` constraint (private profiles never appear regardless of language match).
- **FR-009**: The filter MUST exclude the current user from results (preserves existing /find behaviour from `profiles-list.ts`).
- **FR-010**: The `spokenLanguages` field MUST NOT be settable from request paths other than `/api/profile-save`. The handler MUST validate it server-side; the field MUST NOT be derivable from URL query params or client-only state.
- **FR-011** (Anti-doxxing uniqueness guard): When a /find query combines language with ≥ 1 other narrowing facet AND resolves to fewer than 5 candidate profiles, the API MUST return a sentinel response (`{ profiles: [], uniquenessGuardTriggered: true }`) instead of the actual matches. The UI MUST render a "Broaden your filters" message. This protects against using filters to single out individuals (per spec 003 platform-safety policy).
- **FR-012**: The system SHOULD log /find query parameters server-side (Application Insights or equivalent) at INFO level, retaining no PII beyond the requesting userId — used to detect filter-bombing / scraping behaviour patterns. Retention per PRIVACY.md.
- **FR-013**: All language strings rendered in the UI MUST come from the i18n translation files (per Constitution Principle 8). The allow-list keys are stable; display names are localized.
- **FR-014**: The /api/profiles GET response projection MUST include `spokenLanguages` so the directory UI can render badges. The field is non-PII (a self-asserted public attribute on a public profile).

### Key Entities

- **Profile.spokenLanguages** (new field on existing `Profile`): `string[]` — array of BCP-47 base language codes from the allow-list. Optional in the type (defensive for legacy docs); empty array means "not specified". Server-side normalized to lowercase, capped at 10, deduplicated.
- **LanguageAllowList** (new module, frontend + api): canonical set of supported language codes. Initial set: `['en', 'pt', 'es', 'fr', 'de', 'it', 'nl', 'pl', 'ro', 'sv', 'no', 'da', 'fi', 'el', 'hu', 'cs', 'sk', 'ru', 'uk', 'tr', 'ar', 'he', 'fa', 'hi', 'bn', 'ur', 'zh', 'ja', 'ko', 'vi', 'th', 'id']` — covers the languages spoken by the constitution-supported i18n locales (`pt-PT`, `en-IE`, `fr-FR`, `es-ES`) plus a broad initial superset. Additions are spec-amendments, not code-only changes.
- **FindFilter** (new ephemeral entity, query-string only — never persisted): `{ languages: string[], availability?: ..., location?: ..., ... }`. Server validates against the allow-list before issuing the Cosmos query.

### Out of Scope (deferred)

- Per-language proficiency ratings (beginner/conversational/native).
- Region subtags (`pt-PT` vs `pt-BR`) as a separate filter facet.
- Language-of-the-day / featured codepals by language.
- Translation of profile bios (just labels — see FR-013).
- 1:1 messaging between matched codepals (in spec 003's deferred section).

---

## Risks & Mitigations *(mandatory for privacy/security-sensitive features)*

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R1** — Dating-app exploitation: users use language + location filters to find single same-language partners for non-coding outreach | High (every successful platform with a directory and a user-controlled signal field attracts this) | Brand damage, user safety, GDPR/data-subject complaints, potential platform-of-record-for-harassment liability | (a) ToS clause explicitly disallowing romantic/dating use (spec 003 P1). (b) Reporting workflow + admin moderation queue (spec 003 P2). (c) FR-011 filter uniqueness guard. (d) No 1:1 DMs in app at MVP — outreach goes through GitHub username only, which is already public on github.com. (e) `profileVisibility = 'private'` default (existing). |
| **R2** — Doxxing via narrow filters: combining language + location + availability + skills can resolve to a single individual, especially in small linguistic communities (e.g., "Portuguese-speaking dev in County Cork"). | Medium | Doxxing of identifiable codepals; chilling effect on profile completeness | FR-011 uniqueness guard. The threshold (5 profiles) is a starting point — see SC-006 below for the metric to re-tune it. |
| **R3** — Tampered language values: client sends garbage / malicious / oversized strings to inflate filter buckets or cause UI rendering bugs | Medium | Data quality degradation, possible XSS if rendered without escaping | FR-002 (allow-list validation), FR-003 (cap), FR-010 (server-side only writes), existing CSP `script-src 'self'` (no inline-script attack surface), existing `textContent`-based DOM-driven profile rendering (no `innerHTML`). |
| **R4** — Sycophantic / signaling profiles: codepal lists 30 languages they don't actually speak to maximize match probability (the LinkedIn problem) | Low-Medium | Filter-quality degradation; users land on incompatible matches | FR-003 cap of 10 (deliberately tight). Optional future: peer-flag mechanism in spec 003. |
| **R5** — Filter abuse for scraping: bots iterate over language filter values to enumerate the directory | Medium | PII exposure scaling, T&C violation | FR-012 server-side logging for pattern detection. SWA's built-in rate-limiting tier (or follow-up: app-level rate limit on `/api/profiles`). The `/find` route is `authenticated`-gated, so scrapers need a real GitHub login → high cost-per-bot. |

The full threat model and the platform-wide defense layers live in **`.specify/spec/003-community-safety-and-anti-abuse.md`**. This spec leans on three of those defenses (R1.a, R1.b, R2 = FR-011); it implements R2 directly and assumes R1.a/R1.b ship in parallel from spec 003 before public rollout.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A codepal can set 3 languages and save in **under 30 seconds** of UI interaction (one page load to landing).
- **SC-002**: /find filter returns correct results within **p95 < 500ms** at the API layer for queries returning ≤ 200 profiles (consistent with `DIRECTORY_PAGE_SIZE = 200` from `profiles-list.ts`).
- **SC-003**: 100% of `spokenLanguages` values stored in Cosmos are members of the allow-list (verified by a periodic audit query in admin tooling — separate spec).
- **SC-004**: Zero successful writes of language values from request paths other than `/api/profile-save` (verified by a privacy-guard test analogous to the existing `/api/profiles` privacy guard test in `api/src/profiles-list.test.ts`).
- **SC-005**: When measured over a rolling 7-day window, **0** /find query responses leak < 5 profiles via FR-011 (uniqueness guard fires before that boundary).
- **SC-006** (instrumentation): The uniqueness-guard threshold (initial: 5) is reviewable against actual filter-result distributions logged via FR-012, and adjustable via a single configuration constant without code changes elsewhere.
- **SC-007**: 0 reports of language-field-driven harassment within the first 30 days post-launch (tracked via spec 003's reporting workflow).
