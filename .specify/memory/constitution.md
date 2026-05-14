<!--
Sync Impact Report
Version: 1.3.0 → 1.4.0
Change Type: MINOR (one new NON-NEGOTIABLE principle: Verified Quality)
Modified Sections:
  - Core Principles: added Principle 9
  - Non-Negotiables: added "Verified Quality" line
  - Definition of Done: tightened item 7 to require named verification
  - Quality Gates: added platform-constraint enforcement requirement
Added Principles:
  - Principle 9: Verified Quality (NON-NEGOTIABLE) — every PR must include
    automated verification of its promised behavior; production bugs must
    ship with regression tests; platform constraints must be encoded as
    enforcing checks (`.specify/platform-constraints.md`)
Templates Impact:
  ✅ .github/pull_request_template.md added with mandatory "Verified by" section
  ✅ .specify/platform-constraints.md added as canonical list
  ✅ api/src/lib/function-registrations.test.ts enforces the function-name constraint
  ✅ src/staticwebapp.config.test.ts cross-references routes ↔ registrations
  ✅ e2e/api-smoke.e2e.test.ts validates post-deploy reachability
Rationale for adoption: Across PRs #48-#52 we shipped four classes of bug
that should have been impossible to merge — inline scripts blocked by
our own CSP, function-name collisions with Azure's reserved namespace,
route declaration order causing 404s, and admin-roster state drift. Each
bug surfaced via user console-paste in production rather than automated
verification. P9 codifies the discipline: a PR's promises are mechanical,
not narrative.
Deferred Items: branch protection on `main` (operator action; tracked in
PROJECT_STATUS operator items)
-->

# CodePals.io Constitution

## Core Principles

### 1. Open Source & Transparency (NON-NEGOTIABLE)
All code, documentation, and architectural decisions MUST be publicly accessible and contribution-friendly. No secrets, credentials, or sensitive data may be committed or exposed (including in history, logs, or config). All contributions MUST follow documented guidelines and adhere to project values of openness, clarity, and traceability. Rationale: Transparency accelerates learning, trust, and community stewardship while reducing hidden risk.

### 2. Code Quality
Code MUST be clean, readable, maintainable, and aligned with established style guides. Mandatory peer review is REQUIRED for every change prior to merge. Each feature or change MUST include accompanying documentation (inline where necessary plus higher-level docs when behavior materially changes). Unit tests (Jasmine/Karma) MUST cover new logic with meaningful assertions; integration and end-to-end tests (Playwright) MUST cover critical user journeys. Rationale: Consistent quality reduces defects, onboarding friction, long-term maintenance overhead, and regression risk.

### 3. Security (NON-NEGOTIABLE)
Designs and implementations MUST apply industry best practices (e.g., OWASP). All inputs MUST be validated; all outputs sanitized where applicable. Secrets MUST be stored only in approved secure channels (never source-controlled). Least privilege MUST be enforced across code, infrastructure, and automation. Security considerations MUST be explicitly addressed in design reviews and PR descriptions. Rationale: Proactive security protects users, reputation, and sustainability.

### 4. Performance
Systems MUST be efficient and responsive. Designs SHOULD minimize resource usage and avoid unnecessary complexity. Performance baselines MUST be monitored and regression risk called out in reviews. Significant changes MUST document expected impact (CPU, memory, latency, throughput). Rationale: Predictable performance preserves user trust and scalability.

### 5. Privacy (NON-NEGOTIABLE)
Only the minimal necessary data MAY be collected. Usage of data MUST be transparent and comply with applicable regulations. Data retention and handling MUST follow documented policies. Rationale: Respecting privacy safeguards users and reduces regulatory risk.

### 6. Community & Governance
Collaboration MUST remain respectful, inclusive, and constructive. A published Code of Conduct governs behavior. Decisions MUST prioritize security, stability, and user trust over expediency. Contribution pathways (issues, PRs, discussions) MUST remain open and well-documented. Rationale: Healthy governance enables sustainable growth and innovation.

### 7. Brand Consistency (NON-NEGOTIABLE)
Visual identity (logo, color palette, typography, design system) MUST be consistent across all official platforms (website, Discord server, documentation, social media). Brand assets MUST be version-controlled and accessible in a centralized brand repository. All public-facing materials (landing pages, community spaces, marketing) MUST adhere to documented brand guidelines. Discord server customization (server icon, banner, role colors, channel naming) MUST reflect CodePals.io brand identity. Rationale: Consistent branding builds recognition, trust, and professionalism; a cohesive visual presence across platforms strengthens community identity and reduces user confusion.

### 8. Internationalization & Accessibility (NON-NEGOTIABLE)
Architecture MUST support internationalization (i18n) from the outset to enable multi-language community growth. Initial locale support includes Portuguese (Portugal), English (Ireland), and French (France); Spanish (Spain) MAY be added based on community demand. All user-facing text MUST be externalized into locale-specific translation files (no hardcoded strings). Translation contributions from the community MUST follow a documented review and approval workflow. Designs MUST comply with WCAG 2.1 AA accessibility standards (keyboard navigation, screen reader support, sufficient contrast). Rationale: Global accessibility expands reach, inclusivity, and equitable access; early i18n architecture prevents costly refactoring; community-driven translation scales sustainably and fosters ownership.

### 9. Verified Quality (NON-NEGOTIABLE)
Every PR MUST include automated verification of the behavior it promises to deliver — not merely unit tests of internal logic, but a check that proves the user-facing outcome works. PR descriptions MUST name the specific test (file path + test name) that verifies the promise. PRs without verifiable claims MUST NOT be merged.

When a bug is discovered in production, the fix MUST include a regression test that would have caught it before merge. If no such test is feasible at the current architecture, the underlying gap MUST be documented and a follow-up issue opened to close it.

Platform-specific constraints (Azure Functions reserved names, SWA tier limitations, Astro bundling heuristics, Cosmos schema invariants) MUST be recorded in `.specify/platform-constraints.md` with a citation to the discovery, AND enforced by an automated check (unit test, build-time guard, or post-deploy E2E assertion). Re-learning the same constraint from a production failure twice constitutes a process failure.

Rationale: Trust in a PR's correctness must be mechanical, not narrative. "Tests pass" without verifying the actual user-facing promise is hope, not quality. Treating each production bug as a missing test ratchets the discipline upward over time — eventually the only way for a bug to ship is for the platform itself to introduce a new failure mode.

## Mission & Vision

**Mission**: Foster a respectful, values‑driven developer growth network where people learn by building relationships, receiving mentorship and coaching, and sharing their development journey—grounded in transparency, security, privacy, and community support. CodePals.io enables context‑rich help requests (clearly marked as work, school, or self‑development) and meaningful connections rather than transactional Q&A.

**Vision**: A trusted global developer community where people support people—creating opportunities for those who need them most, fostering genuine connections, and using technology and mentorship as means to improve lives and enable better futures.

## Non-Negotiables & Technology Stack

**Non-Negotiables**:
- No secrets or sensitive data in code or public artifacts.
- Dependencies MUST be vetted and kept up to date.
- Security, performance, and privacy MUST be addressed in every design and review.
- Brand consistency MUST be maintained across all platforms (website, Discord, documentation).
- Internationalization (i18n) MUST be supported; no hardcoded user-facing strings permitted.
- Accessibility (WCAG 2.1 AA) MUST be upheld in all user interfaces.
- Verified Quality: PRs MUST include automated verification of the promised behavior; platform constraints MUST be encoded as enforcing checks (see Principle 9).

**Technology Stack (Initial)**:
- Primary Language: .NET ecosystem
- Static Site Generation: Statiq (or equivalent)
- Specification-Driven Development: Spec-Kit
- Hosting: Cloud-based static hosting
- CI/CD: Automated pipelines with security checks
- Security Frameworks: OWASP principles as guiding standards

## Development Workflow & Quality Gates

**Definition of Done** (a change is complete ONLY when all apply):
1. Code meets quality and style standards.
2. Security and privacy principles are upheld (explicitly referenced in PR description).
3. Brand consistency maintained (visual identity, Discord assets, design system adherence).
4. Internationalization requirements met (externalized strings, locale support verified).
5. Accessibility validated (WCAG 2.1 AA compliance for UI changes).
6. Documentation (feature + architectural impact) is updated.
7. Automated checks (lint, tests, security scans) pass — AND the PR description names the specific test that verifies the promised behavior (Principle 9).
8. Peer review is completed and approved.
9. Deployment to designated environment is successful and post-deploy smoke E2E (verifying every declared `/api/*` route reachable, etc.) passes.
10. Any platform constraint discovered during the work is documented in `.specify/platform-constraints.md` with an accompanying enforcing test.

**Quality Gates**:
- Secret scanning MUST pass.
- Static analysis and linting MUST have zero high-severity findings.
- Unit tests MUST cover new logic with meaningful assertions; high-risk paths REQUIRE negative cases.
- Integration/end-to-end tests (Playwright) MUST cover critical user journeys and acceptance scenarios.
- Tests MUST pass before merge; test coverage reports required for review.
- Performance-sensitive changes MUST note expected impact and provide measurement plan.
- Security-sensitive changes MUST enumerate mitigations (validation, encoding, access control).
- Brand assets MUST pass visual consistency review (color, typography, logo usage).
- i18n changes MUST include locale coverage verification (all supported locales have translations or documented fallback).
- Accessibility changes MUST pass automated WCAG checks and manual screen reader validation (where applicable).
- Platform constraints (Azure Functions reserved names, SWA tier limits, Astro bundling, Cosmos schema invariants) MUST be encoded in `.specify/platform-constraints.md` and enforced by automated checks. Discovering a constraint via a production failure MUST result in BOTH a doc entry AND an enforcing test in the same fix PR.

## Governance

**Authority & Scope**: This constitution supersedes informal practices. All project artifacts (plans, specs, tasks, code, docs) MUST conform.

**Amendments**:
- Proposal opened via dedicated "Constitution Amendment" issue template.
- Requires: problem statement, proposed change, impact analysis (principles affected), version bump classification (MAJOR/MINOR/PATCH), and migration/communication plan if breaking.
- Approval: ≥2 maintainers + security reviewer for any security/privacy principle change.

**Versioning Policy**:
- MAJOR: Removal or redefinition of a principle or governance process.
- MINOR: Addition of a new principle or material expansion of guidance.
- PATCH: Clarifications, wording improvements, typo fixes only.

**Compliance Review**:
- Weekly automated scan: secrets, dependencies, security advisories.
- Quarterly manual review: principle alignment + retrospective adjustments.
- Violations MUST be documented with remediation tasks and target resolution date.

**Documentation Integration**:
- Plan templates MUST include Constitution Check gate alignment (all 8 principles).
- Tasks MUST reflect security, performance, privacy, brand consistency, i18n, and accessibility concerns where applicable.
- Feature specs MUST produce independently testable user stories consistent with principles.

**Dispute Resolution**:
- Escalate via maintainer triage; unresolved conflicts require formal vote (simple majority of active maintainers).

**Sunset & Retrospective**:
- Annual retrospective evaluates mission relevance; amendments proposed if drift detected.

**Amendment Workflow**:
1. Initiation: Open an "Amendment Proposal" issue including: Context, Problem, Proposed Change, Impact (principles affected), Version Bump Type (MAJOR/MINOR/PATCH), Risk & Mitigation, Migration/Communication Plan.
2. Discussion Window: Minimum 7 days public comment unless emergency security/privacy fix (fast‑track with required postmortem).
3. Approval (Interim Single Maintainer Phase): Maintainer documents rationale and merges after window. When ≥3 maintainers exist: require ≥2 approvals; if security/privacy affected include security steward sign-off.
4. Recording: Merge triggers version bump commit updating constitution and governance changelog entry.
5. Communication: Summary included in roadmap update and release notes; MAJOR changes additionally get a dedicated announcement.
6. Effective Date: Immediate unless migration plan defines delayed activation.
7. Fast-Track Criteria: Only critical security/privacy clarifications with active exploitation risk; retrospective issue MUST follow.
8. Reversal: Same workflow flagged as "Reversal" with rollback plan.

**Interim Single Maintainer Mode**:
- Until additional maintainers onboard, one maintainer fulfills all governance roles (security, privacy, moderation, release). Role distribution review occurs once steady external contribution begins.

**Scholarship Program (Future)**:
- Case-by-case scholarships may be introduced post sustainability milestone; requires panel formation, published criteria, funding transparency, and annual impact report.

**Governance Metrics (Constitution-Scoped)**:
- Security Remediation Time (high/critical) ≤ 7 days median.
- Roadmap / changelog refresh ≥ 1 per month.
- Incident disclosure summary within 72h of resolution.
- Secret exposure incidents target: 0 per quarter.
- Data category additions each require documented justification.
- Code of Conduct cases resolved ≤ 7 days median.
- Mentorship guidance update ≥ 1 per quarter (until formal program).
- Scholarship readiness status tracked quarterly (Not Ready / In Progress / Ready).
- Brand guideline violations reported and resolved ≤ 14 days.
- Locale coverage for supported languages ≥ 95% (core user-facing strings translated).
- WCAG 2.1 AA compliance verified per release (automated + manual spot-check).

**Version**: 1.4.0 | **Ratified**: 2025-11-16 | **Last Amended**: 2026-05-14
