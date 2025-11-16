# Governance Overview

**Constitution**: See `.specify/memory/constitution.md` (Version 1.1.0)

This document provides a concise orientation; the Constitution remains authoritative.

## Current Mode: Interim Single Maintainer
One maintainer currently fulfills all roles (security, privacy, moderation, release coordination). Role expansion review will occur when sustained external contributions begin.

## Roles (Future Expansion)
| Role | Purpose |
|------|---------|
| Maintainer | Strategic direction, merges, enforcement |
| Security Steward | Threat modeling, dependency vetting, incident coordination |
| Privacy & Data Steward | Data minimization oversight |
| Community Moderator | Code of Conduct adherence, inclusive facilitation |
| Mentorship Lead | Onboarding paths, pairing, learning assets |
| Documentation Lead | Architecture + contributor docs currency |
| Release Manager | Versioning, changelog integrity, quality gate verification |
| Scholarship Panel Coordinator (future) | Scholarship process transparency and impact reporting |
| Metrics & Transparency Analyst | Governance metrics dashboard publication |

## Decision Model
- Interim: Maintainer documents rationale for governance changes following public discussion window.
- Future (≥3 Maintainers): Simple majority for standard decisions; supermajority + security steward for security/privacy principle changes.

## Amendment Workflow (Summary)
1. Proposal issue created (see template).
2. Public discussion minimum 7 days (unless emergency security/privacy fast-track).
3. Approval threshold based on phase (interim vs multi-maintainer).
4. Merge triggers version bump + communication.
5. Post-change metrics monitored.

## Governance Metrics (Tracked)
- Security remediation time (high/critical) ≤7 days median.
- Roadmap/changelog refresh ≥1 per month.
- Incident disclosure summary ≤72h post resolution.
- Secret exposure incidents: 0 per quarter.
- Data category additions require justification.
- Conduct cases resolved ≤7 days median.
- Mentorship guidance update ≥1 per quarter.
- Scholarship readiness status (Not Ready / In Progress / Ready).

## Scholarships (Future)
Activation requires: funding transparency, panel formation, published criteria, annual impact report.

## Dispute Resolution
Triage by maintainer. If unresolved in multi-maintainer phase: formal vote (simple majority). Further escalation: community advisory discussion thread.

## Communication Channels
- Roadmap updates (monthly)
- Release notes (every tagged release)
- Amendment announcements (blog/newsletter for MAJOR changes)

## Fast-Track Security/Privacy Changes
Allowed only for active exploitation or compliance emergency; retrospective issue mandatory.

---
For full details or authoritative wording see the Constitution.
