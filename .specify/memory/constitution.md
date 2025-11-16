<!--
Sync Impact Report
Version: 1.2.0 → 1.3.0
Change Type: MINOR (two new principles added: Brand Consistency + Internationalization & Accessibility; governance materially expanded to guide multi-platform branding and i18n architecture)
Modified Sections: None
Added Principles:
  - Principle 7: Brand Consistency (NON-NEGOTIABLE) - Discord server branding, visual identity across platforms, design system enforcement
  - Principle 8: Internationalization & Accessibility (NON-NEGOTIABLE) - i18n architecture, locale support (pt-PT, en-IE, fr-FR, es-ES), community translation workflow, WCAG compliance
Templates Impact:
  ✅ spec-template.md: Already includes "Key Entities" for i18n data modeling; no update needed
  ✅ plan-template.md: Constitution Check already covers all principles generically; no update needed  
  ✅ tasks-template.md: Updated Constitution Compliance note to include Brand Consistency and Internationalization & Accessibility principles
Follow-up TODOs:
  - Brand assets (logo, color palette, Discord server assets) to be created per FR-1.6 through FR-1.9 in spec 001-codepals-mvp
  - i18n implementation details (translation file structure, locale detection, fallback strategy) to be specified in future product spec or architecture doc
  - Community translation contribution workflow to be documented in CONTRIBUTING.md (post-MVP)
  - Discord server customization (https://discord.com/channels/1439633906231021578/1439633906801578008) to apply brand assets once finalized
Deferred Items: None (all principles complete and actionable)
-->

# CodePals.io Constitution

## Core Principles

### 1. Open Source & Transparency (NON-NEGOTIABLE)
All code, documentation, and architectural decisions MUST be publicly accessible and contribution-friendly. No secrets, credentials, or sensitive data may be committed or exposed (including in history, logs, or config). All contributions MUST follow documented guidelines and adhere to project values of openness, clarity, and traceability. Rationale: Transparency accelerates learning, trust, and community stewardship while reducing hidden risk.

### 2. Code Quality
Code MUST be clean, readable, maintainable, and aligned with established style guides. Mandatory peer review is REQUIRED for every change prior to merge. Each feature or change MUST include accompanying documentation (inline where necessary plus higher-level docs when behavior materially changes). Rationale: Consistent quality reduces defects, onboarding friction, and long-term maintenance overhead.

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
7. Automated checks (lint, tests, security scans) pass.
8. Peer review is completed and approved.
9. Deployment to designated environment is successful and production behavior verified.

**Quality Gates**:
- Secret scanning MUST pass.
- Static analysis and linting MUST have zero high-severity findings.
- Tests MUST cover new logic with meaningful assertions; high-risk paths REQUIRE negative cases.
- Performance-sensitive changes MUST note expected impact and provide measurement plan.
- Security-sensitive changes MUST enumerate mitigations (validation, encoding, access control).
- Brand assets MUST pass visual consistency review (color, typography, logo usage).
- i18n changes MUST include locale coverage verification (all supported locales have translations or documented fallback).
- Accessibility changes MUST pass automated WCAG checks and manual screen reader validation (where applicable).

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

**Version**: 1.3.0 | **Ratified**: 2025-11-16 | **Last Amended**: 2025-11-16
