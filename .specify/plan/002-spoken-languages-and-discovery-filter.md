# Implementation Plan: Spoken Languages on Profile + Discovery Filter

**Feature Branch**: `002-spoken-languages-and-discovery-filter` (and follow-on feature branches per task)
**Date**: 2026-05-08
**Spec**: `.specify/spec/002-spoken-languages-and-discovery-filter.md`
**Companion safety spec**: `.specify/spec/003-community-safety-and-anti-abuse.md`
**Input**: User description: "Codepals need to specify the languages they speak so people can filter and connect."

---

## Summary

Adds a `spokenLanguages: string[]` field to the `Profile` Cosmos document, edited via `/profile/edit`, rendered as badges on profile views, and filterable on `/find`. Validates against a curated allow-list server-side. Honors existing privacy invariants. Implements the **filter uniqueness guard** (FR-011) to prevent narrow-filter doxxing.

The functional surface is small. The discipline is in **what we don't ship**: no protected-attribute facets (DP-4), no unilateral writes to discovery signals (DP-3), no defaults that surface PII without consent (DP-2). The spec leans on three policy/tooling defenses that arrive from spec 003 in parallel: ToS clause, reporting workflow, admin moderation queue. We sequence those so the language feature ships behind a working safety net (see "Sequencing & Dependencies" below).

---

## Technical Context

**Language/Version**: TypeScript (frontend Astro 5.x; api Azure Functions on node:20)
**Primary Dependencies**: `@azure/cosmos`, `@azure/functions`, Astro, vitest
**Storage**: Azure Cosmos DB (NoSQL, serverless) — existing `profiles` container, partition key `/userId`
**Testing**: vitest (api unit + frontend unit + frontend SWA-config-invariant + e2e)
**Target Platform**: Azure SWA (dev: dev.codepals.io; prod: codepals.io — separate SWA, out of scope here)
**Project Type**: web application — frontend (`src/`) + api (`api/src/`)
**Performance Goals**: spec SC-002 — /find filter API p95 < 500ms for ≤ 100 profiles (matches existing `DIRECTORY_PAGE_SIZE = 100`)
**Constraints**: SWA Free tier (limits SWA-managed concurrency); Cosmos serverless RU/s billed per request
**Scale/Scope**: Tens to hundreds of codepals near term; expect to revisit pagination + filter performance at ~1k profiles

---

## Constitution Check

Confirmed against Constitution v1.3.0:

1. **Transparency**: No secrets introduced. Allow-list hardcoded in source (auditable). No new credentials, no env vars beyond what already exists. ✅
2. **Code Quality**: Follows existing patterns (validation in `api/src/lib/validation.ts`, profile shape in `api/src/lib/types.ts`, list filter in `api/src/profiles-list.ts`, edit form in `src/pages/profile/edit.astro`). New module `lib/languages.ts` for the allow-list with tests. ✅
3. **Security (NON-NEGOTIABLE)**: Server-side allow-list validation (FR-002), cap (FR-003), normalization (FR-004), structurally-enforced privacy filter on the new query (FR-008/009 mirroring `profiles-list.ts:PROFILES_QUERY` invariants). New unit tests on the privacy-guard pattern. ✅
4. **Performance**: Filter adds an `ARRAY_CONTAINS_ANY`-equivalent (Cosmos has no built-in ANY but we can use `EXISTS(SELECT VALUE l FROM l IN c.spokenLanguages WHERE l IN (...))`). Indexed via the existing `automatic: true` indexing policy on `/*`. Expected p95 unchanged for the 100-profile cap. ✅
5. **Privacy (NON-NEGOTIABLE)**: New field is self-asserted public attribute. `profileVisibility = 'private'` default still applies. Filter logs (FR-012) retain only the requesting userId, not the matched-profile userIds. Per PRIVACY.md retention. ✅
6. **Community & Governance**: Allow-list additions are spec-amendments (governance trail), not silent code-only changes. ✅
7. **Definition of Done**: tests, docs, review, deployment verification all in scope per existing pipeline. ✅
8. **Dependency Vetting**: No new npm dependencies needed. ✅
9. **Quality Gates**: lint, format, audit, frontend + api tests, build — all run via existing `Validate (lint, audit, tests, build)` job. ✅
10. **Risk Register**: see spec 002 "Risks & Mitigations" section. ✅

(NEW principles in 1.3.0:)

- **Brand Consistency**: Language badges follow the existing badge styles in `Header.astro`/`profile/index.astro`. No new visual primitives. ✅
- **Internationalization & Accessibility**: Allow-list is locale-keyed; display names come from i18n strings (FR-013). Picker is keyboard-accessible (`<select multiple>` is the safe default; if a custom UI is built, ARIA roles + keyboard nav are mandatory). ✅

**No violations.** No "Complexity Tracking" entries needed.

---

## Project Structure

### Documentation (this feature)

```text
.specify/
├── spec/
│   ├── 002-spoken-languages-and-discovery-filter.md   # already drafted
│   └── 003-community-safety-and-anti-abuse.md         # already drafted (companion)
├── plan/
│   └── 002-spoken-languages-and-discovery-filter.md   # this file
└── tasks/
    └── 002-spoken-languages-and-discovery-filter.md   # tasks (next document)
```

### Source code (additions only — green = new, yellow = modified)

```text
api/src/
├── lib/
│   ├── languages.ts             [NEW]   Allow-list + validation helpers
│   ├── languages.test.ts        [NEW]   Allow-list invariant tests
│   ├── types.ts                 [MOD]   Profile.spokenLanguages?: string[]
│   └── validation.ts            [MOD]   normalizeLanguageList(list, allowList) helper
├── profile-save.ts              [MOD]   Read+normalize spokenLanguages from request body
├── profile-get.ts               [MOD]   Project spokenLanguages in the query (already added in profile-repo's PROFILE_FIELDS — verify)
├── profiles-list.ts             [MOD]   Accept ?lang=pt,es query string; build EXISTS subquery; honor uniqueness guard
└── profiles-list.test.ts        [MOD]   New cases for filter parsing + uniqueness guard

src/
├── pages/
│   ├── profile/
│   │   ├── edit.astro           [MOD]   Multi-select picker for languages
│   │   ├── index.astro          [MOD]   Render language badges
│   │   └── setup.astro          [MOD]   Same picker as edit
│   └── find.astro               [MOD]   Language multi-select filter; uniqueness-guard banner
├── services/
│   └── api.ts                   [MOD]   Add `languages` param to `getPublicProfiles(filter)`
└── staticwebapp.config.test.ts  [no change — existing route gating still applies to /find]

infra/
├── main.bicep                   [no change — `profiles` container already exists]

e2e/
└── profile-and-find.e2e.test.ts [NEW]   E2E: edit profile, filter /find, verify uniqueness guard
```

**Structure Decision**: existing web-app shape (frontend `src/` + api `api/src/`). No new directories or projects.

---

## Sequencing & Dependencies

The spec depends on three items from 003 (ToS clause, reporting workflow, admin moderation queue) being shipped **before** the language filter is publicly enabled. Implementation order accounts for this:

| Step | Owner | Tier | Notes |
|---|---|---|---|
| **1. ToS clause merged** | spec 003 task T-301 | Text-only `TERMS.md` change | Trivial; lands first |
| **2. Reports container + minimal API + admin queue UI** | spec 003 tasks T-310..T-316 | api + frontend + Bicep | ~ 1 PR; ships before language filter so reports of off-topic outreach have somewhere to go |
| **3. Spec 002 P1: profile-edit picker + badges + server-validate** | this plan, tasks T-201..T-208 | api + frontend | Doesn't yet expose any new discovery surface — safe to ship even if step 2 is still in flight |
| **4. Spec 002 P1: /find filter + uniqueness guard** | this plan, tasks T-220..T-228 | api + frontend + e2e | Public discovery surface — gated on 1 + 2 being live |
| **5. Spec 003 user blocking** | spec 003 tasks T-330..T-336 | api + frontend | Lands after the discovery filter so the visible cost of bad behaviour exists before the new discovery axis goes wide |

**Feature flag exit ramp**: if reports of language-driven abuse spike post-launch, the /find filter UI can be hidden client-side (one-line change to `/find` page) while the rest of the feature stays live. The server-side filter accepts but optionally ignores the param when a `LANGUAGE_FILTER_ENABLED` config flag is false. Cheap kill switch, encoded in tasks below.

---

## Risks & Mitigations (plan-level, beyond spec 002 §Risks)

| Risk | Mitigation |
|---|---|
| Cosmos query performance on `EXISTS(SELECT VALUE l FROM l IN c.spokenLanguages WHERE l IN (...))` worse than expected | Verified locally with N=100 fixtures (matches the current `DIRECTORY_PAGE_SIZE`); if p95 exceeds SC-002, fall back to a denormalized index field (`spokenLanguagesString: string` joined-comma) with a `CONTAINS` query — known faster on Cosmos serverless. |
| Allow-list disagreement (e.g., "should we include constructed languages?") | Allow-list edits are spec-amendments. Discussion happens on the spec, not in the PR. |
| The uniqueness guard threshold (5) is wrong for our scale | FR-011 + SC-006: threshold is a single config constant. We log filter result counts (FR-012) and tune the threshold based on the distribution after 30 days of usage. |
| Picker UX is bad on mobile | Use `<select multiple>` for the MVP — ugly but works everywhere with zero a11y bugs. A custom combobox is a follow-up enhancement, not blocking. |

---

## Definition of Done (plan-level)

- All spec 002 functional requirements implemented and tested.
- All success criteria measurable and instrumented (logging where called for).
- Spec 003 P1 + P2 (ToS clause + reporting + moderation queue) merged before /find filter is publicly enabled.
- E2E suite extended with the profile-and-find scenario.
- `AZURE_SETUP_GUIDE.md` updated only if a new app setting / container is introduced (none in this spec).
- `PRIVACY.md` updated to mention the new self-disclosed `spokenLanguages` field.
- Constitution compliance section in the PR description filled in (per template).
