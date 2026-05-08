# Implementation Plan: Community Safety & Anti-Abuse

**Feature Branch**: `003-community-safety-and-anti-abuse` (and follow-on per task)
**Date**: 2026-05-08
**Spec**: `.specify/spec/003-community-safety-and-anti-abuse.md`
**Companion feature spec (consumer)**: `.specify/spec/002-spoken-languages-and-discovery-filter.md`

---

## Summary

Operationalizes the platform-wide safety stance: explicit Terms of Service prohibition on dating/non-coding outreach, in-app reporting workflow, admin moderation queue with audit trail, and user-side blocking. Lays the groundwork that future discovery features (spec 002 first, more to follow) lean on for enforcement.

This plan is **deliberately broken into independent shippable PRs** — each P-priority user story in spec 003 is one PR. They can land in priority order without waiting on each other beyond the obvious dependency (the moderation queue UI in P2 needs the reports container from P1 to be useful).

---

## Technical Context

**Language/Version**: TypeScript (frontend Astro 5.x; api Azure Functions on node:20)
**Primary Dependencies**: existing — `@azure/cosmos`, `@azure/functions`, Astro, vitest. No new deps.
**Storage**: Azure Cosmos DB — three new containers: `reports`, `audit`, `blocks`. Bicep additions in `infra/main.bicep` (declaratively provisioned).
**Testing**: vitest (api unit + frontend unit) + e2e for the user flows.
**Target Platform**: dev SWA (dev.codepals.io). Prod tier remains out of scope for this spec.

---

## Constitution Check

1. **Transparency**: All new code public. Audit log is the source of truth — even moderator actions are auditable. ✅
2. **Code Quality**: Reports / audit / blocks each get their own repository module + fake (mirroring `admin-roster` and `users`). Existing patterns extended, not reinvented. ✅
3. **Security (NON-NEGOTIABLE)**: Server-side authZ on every moderator endpoint (defense in depth, mirroring `admin-users.ts`). De-duplication of reports prevents brigading-as-a-DoS. Block cap (FR-134). Anti-self-action guard on suspend/unlist (FR-123). ✅
4. **Performance**: Three new point-read patterns, all keyed by partition. Reports queue is paginated server-side. ✅
5. **Privacy (NON-NEGOTIABLE)**: Audit log is admin-only-readable. Reporter identity is never disclosed to the reported user. Account deletion anonymizes audit references (per PRIVACY.md; documented in this spec's edge cases). ✅
6. **Community & Governance**: ToS clause is a governance artifact; documented in `TERMS.md`. ✅
7. **Definition of Done**: per task. ✅
8. **Dependency Vetting**: no new deps. ✅
9. **Quality Gates**: existing pipeline. ✅
10. **Risk Register**: see spec 003 "Threat Model" section. ✅

**No violations.**

---

## Project Structure

### Documentation

```text
.specify/
├── spec/
│   └── 003-community-safety-and-anti-abuse.md    # already drafted
├── plan/
│   └── 003-community-safety-and-anti-abuse.md    # this file
└── tasks/
    └── 003-community-safety-and-anti-abuse.md    # tasks (next document)
```

### Source code (additions only)

Each user story is a discrete shippable slice. Paths shown per slice:

**P1a — ToS clause (Story 1):**
```text
TERMS.md                                            [MOD]   Add prohibited-uses clause
src/pages/welcome.astro                             [MOD]   Link to terms in onboarding
.specify/spec/003-...md                             [MOD]   Reference clause number
```

**P1b — Reporting (Story 2):**
```text
api/src/
├── lib/reports.ts                                  [NEW]   Report repo (Cosmos + interface + fake)
├── lib/reports.test.ts                             [NEW]
├── lib/reports.fake.ts                             [NEW]
├── reports-create.ts                               [NEW]   POST /api/reports (authenticated)
└── reports-create.test.ts                          [NEW]
src/components/ReportButton.astro                   [NEW]
src/pages/profile/index.astro                       [MOD]   Wire ReportButton
infra/main.bicep                                    [MOD]   Add `reports` container
```

**P1c — Moderation queue + audit (Story 3):**
```text
api/src/
├── lib/audit.ts                                    [NEW]   Audit-entry repo
├── lib/audit.test.ts                               [NEW]
├── lib/audit.fake.ts                               [NEW]
├── reports-list.ts                                 [NEW]   GET /api/reports (admin)
├── reports-list.test.ts                            [NEW]
├── reports-resolve.ts                              [NEW]   POST /api/reports/:id/resolve (admin)
└── reports-resolve.test.ts                         [NEW]
src/pages/admin/reports.astro                       [NEW]   Moderation queue UI
infra/main.bicep                                    [MOD]   Add `audit` container
staticwebapp.config.json                            [MOD]   Gate /admin/reports + /api/reports* on admin
src/staticwebapp.config.test.ts                     [MOD]   Assert new gates
```

**P2 — User blocking (Story 4):**
```text
api/src/
├── lib/blocks.ts                                   [NEW]   Block repo
├── lib/blocks.test.ts                              [NEW]
├── lib/blocks.fake.ts                              [NEW]
├── blocks-create.ts                                [NEW]   POST /api/blocks
├── blocks-delete.ts                                [NEW]   DELETE /api/blocks/:blockedId
├── profiles-list.ts                                [MOD]   Mutual-hide for blocks
└── profiles-list.test.ts                           [MOD]   Privacy guard for blocked users
src/components/BlockButton.astro                    [NEW]
src/pages/profile/index.astro                       [MOD]   Wire BlockButton
infra/main.bicep                                    [MOD]   Add `blocks` container
```

---

## Sequencing

P1a (ToS) → P1b (reporting) → P1c (moderation queue + audit) → P2 (blocking).

P1a is text-only — lands in a single small PR.
P1b lands once the `reports` container exists.
P1c lands once P1b is in (so the admin queue has something to display).
P2 is independent of the reporting chain technically, but staged after so the moderator response capability exists before users have a self-serve mute.

---

## Risks & Mitigations (plan-level)

| Risk | Mitigation |
|---|---|
| New Cosmos containers introduce schema drift across envs | Containers are declared in Bicep; the infra-apply CI job (PR #46) brings them up automatically. No operator-clicked PowerShell. |
| Admin actions misuse / over-suspend | All actions audited (FR-122). Audit log is admin-readable. Constitution Principle 6 (community governance) covers escalation paths. |
| Moderation queue grows unbounded | Server-side pagination (TOP 100 newest-open). Admins can mark "dismissed" to exit the queue. |
| Reports container becomes a vector for spam-by-report | FR-112 dedupes. SC-102 latency budget keeps the path lightweight. Future: per-reporter rate limit if abuse appears. |

---

## Definition of Done

- All spec 003 functional requirements implemented and tested.
- TERMS.md clause merged and referenced from welcome / reporting form.
- Audit log records 100% of moderator actions (verified by integration test).
- Block-mutual-hide invariant proven by privacy-guard test analogous to `/api/profiles` existing one.
- Constitution Principle 6 (Community & Governance) revisited in the PR description for P1c (admin power increases).
