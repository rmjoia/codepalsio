# CodePals.io Project Status

**Last reconciled**: 2026-05-08 (PR #47)
**Status**: Phase 1 (foundation) ✅ shipped. Phase 2 (core platform — profiles, directory, admin) ✅ mostly shipped. Public discovery + community-safety surface in flight via specs 002 + 003.
**Live**: https://dev.codepals.io ✅. https://codepals.io ✅ (landing page; public discovery features not yet promoted to prod tier — promotion path is intentionally manual; see "Operator action items" below).

This file is the **current source of truth** for project state. The other documents in `.specify/` (`IMPLEMENTATION_PLAN.md`, `QUICK_REFERENCE.md`, `spec/codepals-mvp.md`, `plan/codepals-mvp.md`, `tasks/phase-*-tasks.md`, `tasks/MVP_COMPLETE_TASK_BREAKDOWN.md`) predate the work tracked here and remain for historical context only — they are NOT reliable as a current-state reference.

---

## Shipped — current main

Each row links to the PR(s) that landed it.

### Foundation & infrastructure

| Item | PR(s) | Notes |
|---|---|---|
| Initial Astro 5 + Tailwind landing page | (pre-PR-#11) | codepals.io + dev.codepals.io |
| IaC: Bicep (`infra/main.bicep`) + PowerShell driver (`infra/Initialize-Infra.ps1`) | #11 | Resource Group, Static Web App, Key Vault, Cosmos DB serverless, managed identity with federated OIDC |
| API ported to TypeScript (Azure Functions v4) | #19 | `api/` workspace, vitest |
| Azure Functions v4 programmatic registration fix | #15 | |
| api_build_command CI fix | #21 | |
| Mobile-first responsive header | #20 | |
| Avatar fallback to `github.com/{username}.png` | #16 | |
| Profile page avatar id collision fix | #17 | |

### Auth

| Item | PR(s) | Notes |
|---|---|---|
| Migration to SWA built-in auth (drop custom OAuth Functions) | #14 | |
| Custom GitHub identityProviders block in `staticwebapp.config.json` | #36 | Closes the post-#32 login 404 — declares the OAuth registration explicitly |
| CI gating + identity-proxy E2E | #37 | |
| Pipeline rename + correct dev/prod conflation | #38, #42 (folded into #38) | |
| AZURE_SETUP_GUIDE.md callback URL guidance corrected | #37, #40 | The right callback URL is `https://<swa-host>/.auth/login/github/callback` |

### Profile + directory

| Item | PR(s) | Notes |
|---|---|---|
| Profile CRUD (server-validated, server-set `githubUsername`) | #14, then refined by every PR after | |
| `profileVisibility` field, default `'private'` (opt-in to discovery) | #28 | |
| `/find` directory page + GET /api/profiles | #29 | Existing privacy guard test in `profiles-list.test.ts` |
| Privacy guard test for /api/profiles | #30 | Structurally enforces `c.profileVisibility = 'public' AND c.userId != @currentUserId` |
| Profile auto-heal for orphan pre-#14 docs (re-key by githubUsername bridge, rotate id to uuid shape) | #40 | Closes #27 |
| Old-shape orphan rescue when no `githubUsername` field exists | #40 | User-record bridge via `findByGithubUsernameAcrossShapes` |

### Admin / roles

| Item | PR(s) | Notes |
|---|---|---|
| `/admin` page + `/api/admin-users` + role bootstrap (env var) | #32 | |
| Persistent admin management (UI grant/revoke) | #33 | |
| Race-safe admin roster with optimistic concurrency | #35 | `mutateRoster` CAS retry loop |
| `findByGithubUsernameAcrossShapes` for legacy user records + roster repair on legacy migration + bootstrap-on-migration | #43 | Unblocks admin nav for the maintainer's pre-#32 user record |

### Security

| Item | PR(s) | Notes |
|---|---|---|
| CSP phase 1 | #18 | |
| CSP phase 2 — drop `'unsafe-inline'` from script-src | #31 | |
| CODEOWNERS extended with explicit ownership of auth/admin/role surfaces | #39 | Default `* @rmjoia` was already there; extended for grep-ability |
| `npm audit fix --omit=dev` cleanup; audit gate tightened to `--audit-level=high` on prod deps | #38 | One remaining moderate astro XSS finding queued for the Astro 5→6 upgrade |

### CI/CD pipeline

| Item | PR(s) | Notes |
|---|---|---|
| Initial validate-only PR pipeline | (pre-#38) | |
| Proper four-stage pipeline: validate → preview deploy → preview E2E → dev deploy → dev E2E | #38 | |
| E2E suite — auth-flow tests, route-gate tests, SWA-config-invariant tests | #36, #37, #39 | Plus the `staticwebapp.config.test.ts` regression guard |
| `npm test:e2e` separate runner with `vitest.e2e.config.ts` | #38 | Skips locally without `E2E_BASE_URL`, hits live SWA in CI |
| Diagnostic curl step before E2E (auto-prints redirect chain on failure) | #37, #38 | |
| CI resilience: readiness polling + E2E retry-with-backoff | #45 | Replaced fixed `sleep 60`; 3 attempts, 30s gap |

### IaC + automation

| Item | PR(s) | Notes |
|---|---|---|
| `ADMIN_GITHUB_LOGINS` declared in Bicep (per-env via parameter) | #43 | |
| MI granted Contributor on its own RG (control-plane) | #46 | Required for OIDC-driven Bicep apply from CI |
| `infra_apply_dev` CI job (push-to-main / workflow_dispatch on main; OIDC; what-if + create) | #46 | |

### Specs (governance)

| Item | PR(s) | Notes |
|---|---|---|
| Constitution v1.3.0 (8 principles, 4 NON-NEGOTIABLE) | (pre-PR-#11) | `.specify/memory/constitution.md` |
| Spec 002: Spoken Languages on Profile + Discovery Filter | #47 | This PR |
| Spec 003: Community Safety & Anti-Abuse | #47 | This PR; cross-cutting |

---

## In flight

| Item | PR | Status |
|---|---|---|
| Spec 002 + Spec 003 + plans + tasks | **#47** (this PR) | Awaiting final review/merge |

---

## Operator action items (non-code)

These unlock or are required for parts of the shipped chain to actually work end-to-end. Most are one-time:

- [ ] **GitHub Actions vars for `infra_apply_dev`**: `AZURE_CLIENT_ID_DEV`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` — Repo → Settings → Secrets and variables → Actions → Variables tab. Required for #46.
- [ ] **First Bicep apply with Owner perms**: `Initialize-Infra.ps1 -Environment dev` once locally, so the new MI Contributor role assignment from #46 lands. After that, CI auto-applies.
- [ ] **Branch protection on `main`**: Settings → Branches → require Code Owner reviews. Pairs with #39's hardened CODEOWNERS.
- [ ] **GitHub OAuth app callback URL** (dev): `https://dev.codepals.io/.auth/login/github/callback` — verified working post-#37.
- [ ] **Set `ADMIN_GITHUB_LOGINS=rmjoia` on dev SWA** — once #46 has applied via CI + the operator has triggered the first apply, this is automatic from the Bicep param. Until then, set manually in Azure Portal → SWA → Configuration.
- [ ] **Verify admin nav appears on dev** after the above (log out + log in to dev.codepals.io).

---

## Roadmap — Now / Next / Future

### NOW (this PR + close-by)

- PR #47 (specs only) — awaiting your review/merge
- Operator items above

### NEXT — after #47 merges, sequential

1. **003 US1** — ToS clause appended to `TERMS.md` (1-line text PR, ~10 min) + onboarding link
2. **002 US1** — Profile picker for spoken languages + badges (no public-discovery surface change yet, safe to ship anytime after #47 merges)
3. **003 US2** — Reporting endpoint + button + new `reports` Cosmos container (Bicep + handler + UI)
4. **003 US3** — Admin moderation queue at `/admin/reports` + `audit` Cosmos container + suspension via the `member` custom role + `/suspended` page + server-side `assertNotSuspended` (FR-124, FR-124a, FR-124b)

### AFTER NEXT — gates 002's public rollout

5. **002 US2** — `/find` filter + uniqueness guard, behind a `LANGUAGE_FILTER_ENABLED` kill-switch
6. **003 US4** — User blocking + mutual-hide on `/find` (independent of 002 US2; can land any time)

### FUTURE (not yet specced)

| Area | Notes |
|---|---|
| Connections (user ↔ user) | Bicep already provisions the `connections` container; no API/UI yet |
| Connection requests with stated context | Spec 003 P3 deferred; prerequisite for any "messaging" feature |
| In-app messaging | Substantial new moderation surface; do connections first |
| Notifications (in-app, then email) | Email pipeline (SendGrid or equivalent) not yet integrated |
| Astro 5 → 6 upgrade | Clears the one remaining moderate audit finding (`define:vars` XSS); enables tightening the audit gate to `--audit-level=moderate` |
| Prod-tier infra + deploy chain | Separate SWA, separate OAuth app, separate token, manual-approval gate, parallel `infra_apply_prod` + `prod_deploy` + `e2e_prod` jobs |
| i18n translation files | Constitution Principle 8 — currently mostly aspirational; only English strings exist in code |
| Brand assets (Discord, full visual identity) | Constitution Principle 7 — partially done (logo concept selected, palette set); polish + Discord branding outstanding |
| Migration runner harness | Pattern for one-shot Cosmos schema migrations driven from CI; referenced in earlier PRs |
| Behavioral anomaly detection | Spec 003 deferred — flagging accounts with N reports/hour, unusual filter activity |
| Per-language proficiency, region subtags on profile | Spec 002 deferred |

---

## Containers in Cosmos (`codepals-{env}-cosmos`, db `codepals-db`)

| Container | Partition key | Purpose | Provisioned by |
|---|---|---|---|
| `users` | `/id` (= `gh-<lowercased-github-username>` post-#43; legacy = SWA principal hash) | UserRecord — roles, swaUserId backfill, AdminRoster doc (`id='roster'`) | `infra/main.bicep` |
| `profiles` | `/userId` | Profile docs — `id = profile-<uuid>` post-#40; legacy = SWA principal hash | `infra/main.bicep` |
| `connections` | `/userId1` | (Reserved — no API/UI yet, future connections feature) | `infra/main.bicep` |
| `reports` | `/reportedProfileId` | (Future — spec 003 US2) | spec 003 task T-310 |
| `audit` | `/adminId` | (Future — spec 003 US3) | spec 003 task T-320 |
| `blocks` | `/blockerId` | (Future — spec 003 US4) | spec 003 task T-340 |

---

## Test counts (as of PR #47 base)

| Suite | Count | Notes |
|---|---|---|
| `npm run test:run` (frontend + api via root vitest config) | 211+ | Includes the SWA-config-invariant tests |
| `cd api && npm test` | 162 | api unit tests |
| `npm run test:e2e` (locally; skipped without `E2E_BASE_URL`) | 4 | Hits the deployed SWA |

---

## Notes on the historical specs / plans / tasks

- `.specify/spec/codepals-mvp.md` (Apr 2026, 618 lines) — original MVP feature spec. Many "Phase 2/3/4" features remain valid intent; "Phase 1" is fully shipped. Use this as a vision reference, not a tracking doc.
- `.specify/plan/codepals-mvp.md` (Apr 2026, 921 lines) — original execution plan. Same caveats.
- `.specify/IMPLEMENTATION_PLAN.md` (Apr 2026) — references a now-deleted custom-OAuth flow (`/api/auth/login`, `/api/auth/callback`). Superseded; left for historical reference.
- `.specify/QUICK_REFERENCE.md` (Apr 2026) — reasonably accurate on URLs and constitution links; outdated on what's shipped. Cross-check against this doc before relying on it.
- `.specify/tasks/phase-1-week-{1,2}-detailed-tasks.md` — phase 1 work is shipped; the unticked checkboxes there should be considered ✅. Not back-edited (would change historical artifacts); see this doc instead.
- `.specify/tasks/phase-{2,3,4}-...md` — partially shipped (Phase 2 mostly done, 3+4 partially); rely on this doc, not those.

Going forward: **PRs that change shipped state update this file** in the same commit. The historical docs stay frozen as artifacts.
