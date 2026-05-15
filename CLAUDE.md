# CodePals — Claude Code instructions

Project-level instructions read at session start. Keep this file lean —
duplicating Constitution / spec text here makes both drift. Cross-link
instead.

## Pre-PR self-review checklist (mandatory)

Run **every** step before pushing the first PR commit. If any step fails,
fix before opening the PR — CI will fail on the same things and the
review-comment roundtrip is wasteful.

```sh
# Frontend (repo root)
npm run format:check       # prettier
npm run lint               # eslint
npm run audit              # npm audit --omit=dev --audit-level=high
npm run test:run           # vitest (includes API + SWA-config invariants)
npm run build              # astro build + verify-no-inline-scripts

# API (api/)
( cd api && npm audit --audit-level=moderate && npm run typecheck && npm run build )
```

`npm run validate` runs format:check + lint + test:run + audit + build
in one go, but does **not** cover the API audit/typecheck. Run the
`( cd api && ... )` block separately.

## Pre-merge re-check (mandatory)

Re-run the audit step before merging any PR that's been open more than a
few hours. New npm advisories land daily and the lockfile snapshot at
PR-open time can go stale before the merge button is pressed.

```sh
npm run audit
( cd api && npm audit --audit-level=moderate )
```

PR #56 (devalue sparse-array DoS, GHSA-77vg-94rm-hx3p) was the trigger:
#55's Validate run passed at 16:22 UTC, the advisory landed ~14h later,
every subsequent PR failed Validate until the bump. Re-running audit at
merge time would have caught it on whichever branch was up next.

## Conventions

- **Constitution P9 (Verified Quality, NON-NEGOTIABLE)** — every PR body
  MUST have a populated `## Verified by` section naming the test(s) that
  prove the promised behaviour. Exception phrases: `Docs-only; no
  behavioural change.` or `Refactor only; existing coverage: <ref>`.
  Enforced by `.github/workflows/pr-template-check.yml`.
- **One slice per PR.** Don't bundle unrelated concerns. Security
  fixes that unblock CI are an acceptable exception when they touch
  only the lockfile.
- **Don't reopen / re-open merged or closed PRs** unless explicitly
  asked.
- **Never force-push** unless the user explicitly asks for it.
- **GitHub MCP only** for repo interactions (no `gh` CLI in this
  environment). Scope is restricted to `rmjoia/codepalsio`.
- **Assign the PR owner on creation.** GitHub blocks the PR author
  from being added as a reviewer on their own PR, but `assignees`
  works. `mcp__github__create_pull_request` has no assignees field —
  call `mcp__github__issue_write` with `method: 'update'` and
  `assignees: ['rmjoia']` right after creation so the PR shows up in
  the owner's "assigned to you" view.

## Where else to look

- `.specify/` — specs, plans, tasks per feature
- `.specify/platform-constraints.md` — quirks of the SWA / Cosmos /
  Functions stack that bit us in prod. Add a new entry (with an
  enforcing test) whenever a new constraint surfaces.
- `.github/pull_request_template.md` — canonical PR template
- `.github/workflows/azure-static-web-apps.yml` — CI pipeline (validate,
  deploy, post-deploy E2E)
- `.github/workflows/pr-template-check.yml` — P9 enforcement
