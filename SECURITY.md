# Security Policy

**Project**: CodePals.io | **Constitution Version**: 1.2.0

## Reporting a Vulnerability

- **Security + abuse**: `abuse@codepals.io`.
  Please include:
  - Summary of the issue
  - Steps to reproduce
  - Potential impact
  - Suggested remediation (optional)
- **Private vulnerability reporting via GitHub** is also enabled:
  <https://github.com/rmjoia/codepalsio/security/advisories/new>. Use this
  when you'd prefer the discussion to happen entirely on GitHub.

We acknowledge within **24 hours** and provide an initial triage result
within **48 hours**. Do NOT publicly disclose vulnerabilities before a
fix unless coordinated and explicitly agreed.

## Supported Scope

- Repository source code (frontend + API)
- CI/CD workflows (`.github/workflows/*.yml`)
- Static site build pipeline (Astro + Azure Static Web Apps)
- Azure Functions (`api/`)
- Cosmos DB access patterns + visibility filters

Client-side static assets are intentionally free of secrets; any secret
exposure risk should be reported immediately.

## Handling & Disclosure Timeline

1. Receipt & acknowledgment (within 24 h)
2. Triage + severity assignment (within 48 h)
3. Fix or mitigation in ≤7 days for High / Critical
4. Post-resolution public summary within 72 h of fix
5. Optional CVE coordination (future capability)

## Security Baseline (current, as of PR #106 / #107 landing)

### Repository-level

- **Secret scanning**: GitHub secret scanning + push protection enabled.
  See repo Settings → Code security.
- **Dependabot**: configured in `.github/dependabot.yml` for three
  ecosystems (`npm` root, `npm /api`, `github-actions`) on a weekly
  cadence. Minor + patch grouped; majors isolated.
- **Dependency audit at build time**: `npm run audit`
  (`--audit-level=critical`) runs in the `validate` CI job. One
  known-advisory exception (`http-cache-semantics`, GHSA-ch52-4w7c-c8xp)
  is documented in [`.specify/known-advisories.md`](.specify/known-advisories.md)
  with a reachability analysis + review date.
- **CodeQL**: default-setup static analysis for `javascript-typescript`
  runs on push + weekly schedule. Blocking findings fail the `validate`
  job via branch-protection required-checks.
- **Private vulnerability reporting**: enabled.
- **GitHub Actions permissions**: workflow-level `permissions: {}` + per-
  job scoped grants. See `.github/workflows/azure-static-web-apps.yml`
  and `.github/workflows/pr-template-check.yml`.

### Branch protection on `main`

- 1 approving review required (dismiss stale on new commit)
- Code Owners review required for sensitive paths (see `.github/CODEOWNERS`)
- Required status checks: `Validate (lint, audit, tests, build)`,
  `PR body has 'Verified by' (Constitution P9)`, `CodeQL / Analyze`,
  `Deploy dev` + `E2E (dev.codepals.io)`
- Signed commits required
- Linear history required
- No bypass actors
- No force pushes

### API / Azure

- **Suspension gate**: every authenticated handler calls
  `assertNotSuspended` before any Cosmos write; a static test (`suspension-
  coverage.test.ts`) fails CI if a new handler forgets. See
  [`api/src/lib/suspension.ts`](api/src/lib/suspension.ts).
- **Per-field visibility**: `applyFieldVisibility` strips fields marked
  `private` from non-owner responses before any projection. The matcher
  for `/api/profiles?q=` is explicitly tested to NOT see stripped fields
  — searching bio text can never return a profile whose bio is hidden.
- **Rate limiting**: `createRateLimiter` is used on the hot-path write
  endpoints. In-memory per-user bucket; hard cap per time window.
- **Secrets management**: Cosmos connection string + SWA deploy token
  live only in GitHub Actions secrets and the Azure Function App's
  Application Settings. No long-lived secret in source control.
  See `AZURE_SETUP_GUIDE.md` for the operator-side setup.
- **Content Security Policy**: strict `script-src 'self'`, no
  `unsafe-inline`. A build-time verifier (`scripts/verify-no-inline-
  scripts.mjs`) fails the build if any inline script sneaks into
  `dist/`.

## Fast-Track Amendments

Emergency governance / security clarifications may bypass the standard
7-day amendment window but MUST have a retrospective issue opened after
resolution. See the Constitution.

## Safe Harbor

Good-faith security research, conducted without data exfiltration or
service disruption, is welcomed. Please avoid:

- Denial-of-service attacks (including volumetric load tests)
- Accessing other users' personal data without consent (even one row)
- Public disclosure before coordination

Research in scope that follows these ground rules is explicitly not
grounds for a legal claim, DMCA notice, or account suspension.

## Future Enhancements

- Formal threat model diagrams (OWASP STRIDE)
- Automated secret rotation workflow for the SWA deploy token
- OIDC federation replacing the long-lived SWA deploy token
- Bug bounty / coordinated-disclosure platform evaluation

---

For questions unrelated to vulnerabilities, open a discussion in the
repository or use the in-product "Help & feedback" link (user menu →
Help & feedback) which routes to a GitHub issue with the user-help
template.
