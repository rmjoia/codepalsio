# Security Policy

**Project**: CodePals.io | **Constitution Version**: 1.1.0

## Reporting a Vulnerability
Please email: security@codepals.io (placeholder – update when active). Include:
- Summary of the issue
- Steps to reproduce
- Potential impact
- Suggested remediation (optional)

We aim to acknowledge within **24 hours** and provide initial triage result within **48 hours**.

Do NOT publicly disclose vulnerabilities before a fix unless coordinated and explicitly agreed.

## Supported Scope
- Repository source code
- CI/CD workflows
- Static site build pipeline
- Infrastructure/key management scripts (when added)

Client-side static assets are intentionally free of secrets; any secret exposure risk should be reported.

## Handling & Disclosure Timeline
1. Receipt & Acknowledgment
2. Triage (assign severity)
3. Fix or mitigation in ≤7 days for High/Critical
4. Post-resolution public summary within 72 hours
5. Optional CVE coordination (future capability)

## Security Baseline (Summary)
- Secret scanning (GitHub) enforced
- Dependency alerts monitored (Dependabot)
- SAST (CodeQL or equivalent) planned post stabilization
- No secrets in source, commits, or logs
- Access limited via least privilege (GitHub permissions, Key Vault access uses managed identity)

Refer to the Constitution for full principles: Transparency, Security, Privacy.

## Fast-Track Amendments
Emergency governance/security clarifications may bypass the standard 7-day window but MUST have a retrospective issue opened after resolution.

## Safe Harbor
Good-faith security research, conducted without data exfiltration or service disruption, is welcomed. Avoid:
- Denial-of-service attacks
- Accessing personal data without consent
- Public disclosure before coordination

## Future Enhancements
- Formal threat model diagrams
- Automated secret revocation workflow
- Bug bounty / vulnerability disclosure platform evaluation

---
For questions unrelated to vulnerabilities, open a discussion in the repository.
