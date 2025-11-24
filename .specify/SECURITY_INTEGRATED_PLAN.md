# CodePals.io Security-Integrated Development Plan
**Date**: November 24, 2025  
**Status**: Updated after bug fix and security posture assessment  
**Scope**: Incorporates 20 security tasks into existing Phase breakdown

---

## Executive Summary

Current MVP plan (200-250 dev days) prioritizes features first, with security deferred to Phase 4 (Week 10). This creates **launch blockers** - 11 critical security gaps must be closed pre-production.

**Recommendation**: Move **8 critical security tasks** into Phases 2-3 to achieve production-readiness incrementally. Remaining 12 tasks become polish/compliance items.

**Revised Timeline**:
- **Phase 1** (Complete): Landing page, infrastructure, code quality gates ✅
- **Phase 2** (Modified): User registration + **encryption-at-rest & security headers**
- **Phase 3** (New): Profile discovery + **SAST tooling, audit logging, request validation**
- **Phase 4** (New): Analytics + **OWASP audit, GDPR compliance, penetration test**

**Impact**: Adds ~7-10 dev days to timeline (5% increase), eliminates launch blockers.

---

## Security Tasks Breakdown

### CRITICAL (Must-Have Before Launch)

| Task | Phase | Effort | Status | Rationale |
|------|-------|--------|--------|-----------|
| Encryption at rest (sensitive fields) | Phase 2 | 2 days | Not started | Data protection - GDPR requirement |
| Security headers (CSP, X-Frame, etc) | Phase 2 | 0.5 days | Not started | Defense-in-depth, OWASP Top 10 |
| Error message hardening (no PII leaks) | Phase 2 | 1 day | Not started | Prevents info disclosure vulnerability |
| Request validation middleware | Phase 2 | 1 day | Not started | XSS/injection prevention (OWASP A7) |
| SAST tooling (CodeQL/Snyk) | Phase 3 | 1 day | Not started | Catch vulnerabilities early in CI/CD |
| Audit logging for sensitive operations | Phase 3 | 2 days | Not started | Accountability, incident response |
| Security-focused unit tests | Phase 3 | 1.5 days | Not started | Validate auth, encryption, validation logic |
| User export/delete endpoints (GDPR) | Phase 4 | 2 days | Not started | Legal compliance, GDPR Article 15/17 |
| GDPR compliance audit | Phase 4 | 1.5 days | Not started | Data Processing Agreement, retention |
| OWASP Top 10 security audit | Phase 4 | 1.5 days | Not started | Professional security assessment |

**Subtotal**: ~14 dev days | **Impact**: +7% to project timeline

### HIGH PRIORITY (Before 1.0 release)

| Task | Phase | Effort | Status | Rationale |
|------|-------|--------|--------|-----------|
| Contact privacy filter (social links) | Phase 2 | 1 day | Not started | Information disclosure prevention |
| Parental consent verification (enforcement) | Phase 2 | 1 day | Not started | Age-gating enforcement (compliance) |
| Secrets rotation policy | Phase 4 | 0.5 days | Not started | Key management best practice |
| Monitoring & alerts setup | Phase 4 | 1.5 days | Not started | Incident detection, SLA enforcement |

**Subtotal**: ~4 dev days | **Impact**: +2% to project timeline

### MEDIUM PRIORITY (Post-Launch Polish)

| Task | Phase | Effort | Status | Rationale |
|------|-------|--------|--------|-----------|
| Request signing/verification | Phase 3 | 1 day | Not started | API security enhancement |
| Load test rate limiting | Phase 4 | 1 day | Not started | Performance validation |
| Dependency scanning automation | Phase 1 | 0.5 days | Not started | Continuous security monitoring |
| Penetration testing | Phase 4 | 1.5 days | Not started | Third-party validation (optional) |
| Incident response runbook | Phase 4 | 0.5 days | Not started | Operational procedure |
| Bug bounty program | Post-MVP | 0.5 days | Not started | Community security engagement |

**Subtotal**: ~5.5 dev days | **Impact**: +3% to project timeline

---

## Integrated Phase Schedule

### Phase 1 (COMPLETE ✅)
**Weeks 1-2**: Landing page, infrastructure, CI/CD  
**Status**: 90% complete (build warning fixes + bug fix committed)

**Security additions (already done)**:
- ✅ Zero credentials in code (verified via ESLint + secret scanning)
- ✅ HTTPS enforced on all domains
- ✅ 43 ESLint strict rules configured
- ✅ Key Vault for secrets management

### Phase 2 (MODIFIED - Add Security Tasks)
**Weeks 3-5**: User registration + Profile creation  
**Base effort**: 75 dev days  
**Added security effort**: ~6 dev days  
**Total**: ~81 dev days

#### Week 3 (User Registration)
- Task 2.1.1: User registration flow via GitHub OAuth
- Task 2.1.2: Profile approval workflow
- Task 2.1.3: Profile data model (Cosmos DB)
- **NEW Task 2.1.3.1: Encryption at rest** (1.5 days)
  - Encrypt social_links, email, parental_email in Cosmos DB
  - Use Azure Key Vault for key management
  - Implement middleware for transparent encrypt/decrypt
  - Test encryption key rotation
- Task 2.1.4: Parental consent process
- Task 2.1.5: Registration testing

#### Week 4 (Profile Discovery & Privacy)
- Task 2.2.1: Profile browse & search
- **NEW Task 2.2.1.1: Security headers** (0.5 days)
  - Add CSP, X-Frame-Options, X-Content-Type-Options to staticwebapp.config.json
  - Configure Strict-Transport-Security (HSTS)
  - Test header injection prevention
- **NEW Task 2.2.1.2: Error message hardening** (1 day)
  - Audit all API error responses
  - Remove stack traces, PII, database structure info
  - Implement generic error messages for user-facing responses
  - Log detailed errors server-side only
- Task 2.2.2: Connection invite system
- Task 2.2.3: Help board system
- **NEW Task 2.2.3.1: Contact privacy filter** (1 day)
  - Query filter: social_links, email only visible to authenticated users
  - Admin dashboard: Override privacy for moderation
  - Audit logging for privacy-sensitive data access

#### Week 5 (Completion & Validation)
- Task 2.3.1: Badge system
- Task 2.3.2: User dashboard
- **NEW Task 2.3.2.1: Request validation middleware** (1 day)
  - Implement input sanitization for all endpoints
  - XSS protection: HTML escape, CSP directives
  - SQL injection prevention (parameterized queries - already done)
  - CSRF protection: Token validation on state-changing requests
  - Rate limiting per endpoint
  - Request size limits
- **NEW Task 2.3.2.2: Security-focused unit tests** (1.5 days)
  - Auth edge cases (expired tokens, invalid signatures, missing headers)
  - Encryption/decryption roundtrips
  - Input validation (XSS, injection payloads)
  - Privacy filters (social links visibility)
  - Age-gating enforcement
- Task 2.3.3: Notification system
- Task 2.3.4: Phase 2 testing & integration

### Phase 3 (MODIFIED - Add Monitoring & SAST)
**Weeks 6-8**: Analytics, recommendations, performance  
**Base effort**: 75 dev days  
**Added security effort**: ~4.5 dev days  
**Total**: ~79.5 dev days

#### Week 6 (Analytics Foundation)
- Task 3.1.1: Event logging & metrics collection
- Task 3.1.2: User dashboard with recommendations
- **NEW Task 3.1.2.1: SAST tooling integration** (1 day)
  - Add CodeQL analysis to GitHub Actions workflow
  - Configure Snyk for npm dependency scanning
  - Set up alerts for security findings
  - Fail build on CRITICAL/HIGH vulnerabilities
  - Document remediation process

#### Week 7 (Recommendation Engine)
- Task 3.2.1: Match algorithm implementation
- Task 3.2.2: Skill-based recommendations
- **NEW Task 3.2.2.1: Audit logging for sensitive operations** (2 days)
  - Log all profile approvals/rejections (admin who, when, why)
  - Log data exports/deletions (GDPR compliance)
  - Log failed authentication attempts (security incident detection)
  - Log admin dashboard access
  - Store audit logs in immutable container (Azure Confidential Ledger for MVP)
  - Implement audit log retention policy (7 years per compliance)

#### Week 8 (Performance & Polish)
- Task 3.3.1: Caching strategy & optimization
- Task 3.3.2: Database query optimization
- **NEW Task 3.3.2.1: Request signing & verification** (1 day)
  - Implement HMAC-SHA256 for API requests
  - Add signature validation middleware
  - Protect against replay attacks (nonce/timestamp)
  - Test cross-origin request integrity

### Phase 4 (MODIFIED - Add Compliance Audit)
**Weeks 9-10**: Analytics dashboards, launch polish  
**Base effort**: 50 dev days  
**Added security effort**: ~5.5 dev days  
**Total**: ~55.5 dev days

#### Week 9 (Analytics & Security Verification)
- Task 4.1.1: Event logging & metrics collection
- Task 4.1.2: User dashboard analytics
- **NEW Task 4.1.2.1: GDPR compliance audit** (1.5 days)
  - Data inventory: All personal data collected, storage location, retention
  - Data Processing Agreement with Azure: Review and sign-off
  - Data retention policy: Implement auto-deletion after retention period
  - User export endpoint: Verify all data included in export
  - User deletion endpoint: Verify cascading deletes, GDPR right to be forgotten
  - GDPR checklist completion: Privacy by design, consent management, breach procedures

#### Week 10 (Launch Readiness & Security Sign-Off)
- Task 4.2.1: Pre-launch compliance audit & incident response
  - **Rename from "Platform Launch Readiness" to emphasize security focus**
  - OWASP Top 10 assessment: Professional review of all 10 categories
    - A1: Broken Access Control - RBAC validation
    - A2: Cryptographic Failures - Encryption at rest/transit
    - A3: Injection - Input validation audit
    - A4: Insecure Design - Threat modeling
    - A5: Security Misconfiguration - Config hardening
    - A6: Vulnerable Components - Dependency audit
    - A7: Authentication Failures - Auth flow review
    - A8: Software Integrity Failures - Code signing, supply chain
    - A9: Logging & Monitoring - Incident detection
    - A10: Using Components with Known Vulnerabilities - Dependency audit
  - Penetration testing (optional): External security firm conducts 1-2 day PT
  - Incident response runbook: Document procedures for:
    - Data breach (internal, external)
    - DDoS attack
    - Account compromise
    - Service unavailability
    - Escalation paths and communication templates
  - Security incident response drill: Simulate breach, test procedures
  - Monitoring & alerts: Verify detection of suspicious activity
  - Uptime SLA: ≥99.5% in staging environment verified
  - Post-launch documentation: Security architecture, threat model, incident procedures

- Task 4.2.2: Final performance validation
- **NEW Task 4.2.2.1: Load testing rate limiting** (1 day)
  - Simulate attack scenarios (100 req/sec per IP)
  - Verify 100 req/min per IP enforced
  - Test circuit breaker for database exhaustion
  - Measure response time under load

- Task 4.2.3: Production launch
- **NEW Task 4.2.3.1: Secrets rotation policy** (0.5 days)
  - Establish quarterly rotation for GitHub OAuth credentials
  - Quarterly rotation for Cosmos DB connection strings
  - Quarterly rotation for JWT signing keys
  - Document key rotation procedure

- Task 4.2.4: Post-launch support setup
- **NEW Task 4.2.4.1: Monitoring & security alerts** (1.5 days)
  - Azure Monitor: Setup alerts for:
    - Failed auth attempts (>5 per IP per hour)
    - Rate limit triggers (>100 req/min per IP)
    - API errors (>5% error rate)
    - Database throttling (RU limit exceeded)
    - Suspicious data access patterns
  - Set up escalation to on-call security team
  - Integration with incident management system

---

## Task Count Summary

| Aspect | Original Plan | New Tasks | Total | Impact |
|--------|---------------|-----------|-------|--------|
| Feature Tasks | 45 | 0 | 45 | +0% |
| Security Tasks (Phase 2-3) | 0 | 8 | 8 | +8 new |
| Compliance Tasks (Phase 4) | 4 | 3 | 7 | Existing, emphasized |
| **Total Tasks** | 49 | 11 | 60 | +22% task count |
| **Dev Days Estimate** | 200-250 | +14 critical | 214-264 | +5-7% timeline |

---

## Risk Assessment

### Before Changes
- ⚠️ **HIGH**: 11 critical security gaps → Launch blocked
- ⚠️ **HIGH**: No encryption at rest → GDPR non-compliance
- ⚠️ **MEDIUM**: No audit logging → Can't detect admin abuse
- ⚠️ **MEDIUM**: No SAST → Vulnerabilities not caught until testing

### After Changes
- ✅ **RESOLVED**: Encryption at rest implemented Phase 2 Week 3
- ✅ **RESOLVED**: Security headers Phase 2 Week 4
- ✅ **RESOLVED**: Error hardening Phase 2 Week 4
- ✅ **RESOLVED**: Request validation Phase 2 Week 5
- ✅ **RESOLVED**: SAST integrated Phase 3 Week 6
- ✅ **RESOLVED**: Audit logging Phase 3 Week 7
- ✅ **RESOLVED**: GDPR audit Phase 4 Week 9
- ✅ **RESOLVED**: OWASP audit Phase 4 Week 10

**Result**: Security-first development, production-ready by end of Phase 4.

---

## Implementation Strategy

### Option A: Incremental Security (Recommended)
Integrate security tasks into existing phases as described above.

**Pros**:
- Continuous security improvement (not Big Bang at end)
- Catch vulnerabilities early
- Achieves production-readiness by Phase 4 Week 10
- Minimal schedule disruption

**Cons**:
- Slightly longer phases (6-10% increase per phase)
- More context switches for developers

### Option B: Security Sprint (Alternative)
Complete all security tasks in dedicated 2-week "Security Hardening Sprint" after Phase 3 (between Weeks 8-9).

**Pros**:
- Focused security effort
- Clear security deliverables
- Can hire security consultant for sprint

**Cons**:
- Feature development pauses
- Larger schedule impact (5-10% for sprint)
- Security debt accumulates early phases

### Option C: Defer Everything (Not Recommended)
Keep security tasks in Phase 4 Week 10 only.

**Pros**:
- Features get more time

**Cons**:
- ❌ Launches with security gaps
- ❌ GDPR non-compliance on Day 1
- ❌ Vulnerabilities in production
- ❌ Incident response required immediately

**Recommendation**: **Option A - Incremental Security**

---

## Success Criteria (Updated)

### Phase 1 ✅ COMPLETE
- ✅ Landing page live, zero warnings
- ✅ Infrastructure provisioned
- ✅ 90% complete
- ✅ Code quality gates established
- ✅ Zero ESLint errors

### Phase 2 (New Criteria)
- ✅ ≥50 user profiles created and approved
- ✅ Registration flow <5 min from signup to profile submission
- ✅ **Encryption at rest for sensitive fields implemented and tested**
- ✅ **Security headers configured and validated**
- ✅ **Error messages hardened (no PII leaks)**
- ✅ **Input validation middleware deployed**
- ✅ **Privacy filters: social links visible only to authenticated users**
- ✅ **Parental consent flow enforced for users <18**
- ✅ ≥80% unit test coverage (including security tests)
- ✅ All E2E tests passing

### Phase 3 (New Criteria)
- ✅ ≥100 users with active connections
- ✅ Browse system responsive (<1sec)
- ✅ **SAST tooling integrated and passing (CodeQL + Snyk)**
- ✅ **Audit logging for all admin and sensitive operations**
- ✅ **Security-focused unit tests (80%+ coverage for auth/encryption/validation)**
- ✅ **Request signing/verification implemented**
- ✅ Recommendation engine accurate (≥70% match quality)
- ✅ Dashboard showing personal stats

### Phase 4 (New Criteria)
- ✅ Analytics infrastructure capturing all metrics
- ✅ ≥99.5% uptime verified in staging
- ✅ **GDPR compliance audit passed (Data Processing Agreement signed)**
- ✅ **OWASP Top 10 assessment completed (0 critical findings)**
- ✅ **User export/delete endpoints functional (GDPR compliance)**
- ✅ **Secrets rotation policy documented and tested**
- ✅ **Monitoring & alerts configured for security incidents**
- ✅ **Incident response runbook completed and drilled**
- ✅ **Load testing rate limiting (verified 100 req/min enforcement)**
- ✅ Production launch approved by security team

---

## Next Steps

1. **This Week (Nov 24-29)**:
   - ✅ Approve security integration plan
   - Push latest bug fix to main
   - Create Phase 2 implementation tasks with security subtasks
   - Schedule security kick-off meeting

2. **Week 1 of Phase 2 (Dec 2-5)**:
   - Implement encryption at rest (Task 2.1.3.1)
   - Begin user registration flow (Task 2.1.1)
   - Parallel: Configure security headers (Task 2.2.1.1)

3. **Ongoing**:
   - Weekly security checkpoint (Tuesday standups)
   - Monthly OWASP compliance review
   - Track security debt in backlog

---

## Files to Update

- [ ] `.specify/tasks/phase-2-week-3-detailed-tasks.md` - Add Task 2.1.3.1 (Encryption at rest)
- [ ] `.specify/tasks/phase-2-weeks-4-5-detailed-tasks.md` - Add Tasks 2.2.1.1, 2.2.1.2, 2.2.3.1, 2.3.2.1, 2.3.2.2
- [ ] `.specify/tasks/phase-3-weeks-6-8-detailed-tasks.md` - Add Tasks 3.1.2.1, 3.2.2.1, 3.3.2.1
- [ ] `.specify/tasks/phase-4-weeks-9-10-detailed-tasks.md` - Add Tasks 4.1.2.1, 4.2.2.1, 4.2.3.1, 4.2.4.1
- [ ] `.specify/PROJECT_STATUS.md` - Update with security roadmap
- [ ] `.specify/IMPLEMENTATION_PLAN.md` - Add security considerations

---

**Status**: Ready for review and approval  
**Created**: November 24, 2025, 4:00 PM UTC  
**Branch**: feat/github-auth-profiles
