# CodePals.io MVP: Complete Task Breakdown

**Project**: CodePals.io MVP Platform  
**Timeline**: 10 weeks (4 phases)  
**Total Effort**: ~200-250 developer days  
**Created**: 2025-11-16

---

## Executive Summary

This document breaks down the CodePals.io MVP implementation plan into concrete, actionable tasks organized by phase and week. Each task includes:
- **Acceptance Criteria**: What must be true for the task to be "done"
- **Effort Estimate**: Developer days required
- **Testing Strategy**: Unit, integration, E2E, security testing
- **Dependencies**: What must be complete first
- **Quality Gates**: Governance checks before proceeding

---

## Phase Overview

| Phase | Weeks | Goal | Key Deliverables |
|-------|-------|------|------------------|
| **Phase 1: Foundation & Landing** | 1-2 | Infrastructure + brand + admin tools | Live website, admin dashboard, infrastructure ready |
| **Phase 2: Core Platform** | 3-5 | User profiles, discovery, connections | Functional mentorship matching platform |
| **Phase 3: Community Engagement** | 6-8 | Events, help board, Karma system | Engaged community with incentive system |
| **Phase 4: Transparency & Analytics** | 9-10 | Public metrics dashboard | Public trust-building metrics |

---

# PHASE 1: FOUNDATION & LANDING

**Goal**: Live website with brand identity, admin dashboard, infrastructure ready for user signup.  
**Duration**: 2 weeks (10 working days)  
**Effort**: ~50 developer days

## Week 1: Infrastructure & Setup (5 days)

### Task 1.1.1: Azure Infrastructure Setup
- **Duration**: 3 days | **Effort**: 3 dev days
- **Acceptance**: Cosmos DB provisioned, Key Vault configured, HTTPS enforced, secret rotation active
- **Quality Gate**: 0 exposed credentials, DB connection tested

### Task 1.1.2: GitHub OAuth Configuration
- **Duration**: 2 days | **Effort**: 1 dev day
- **Acceptance**: OAuth app registered, credentials in Key Vault, OAuth flow documented
- **Quality Gate**: OAuth redirect works, token refresh tested

### Task 1.1.3: CI/CD Pipeline (GitHub Actions)
- **Duration**: 2 days | **Effort**: 2 dev days
- **Acceptance**: `.github/workflows/deploy.yml` created, all PRs run tests/linting/secret scanning, deployment automated
- **Quality Gate**: All checks pass, 0 secrets exposed, coverage ≥80%

### Task 1.1.4: Backend Skeleton (Node.js Serverless)
- **Duration**: 2 days | **Effort**: 2 dev days
- **Acceptance**: API endpoints created, Cosmos DB connected, middleware configured (CORS, rate limiting, error logging)
- **Quality Gate**: `/api/health` returns 200 OK, rate limiting works, CORS validated

---

## Week 2: Landing Page & Admin Dashboard (5 days)

### Task 1.2.1: Brand Implementation
- **Duration**: 2 days | **Effort**: 1-2 dev days
- **Acceptance**: Logo (SVG + PNG), color palette (Teal #00BCD4, Gold #FFB700), typography finalized; design system components created
- **Quality Gate**: WCAG 2.1 AA color contrast (≥4.5:1), focus indicators, keyboard nav tested

### Task 1.2.2: Landing Page (Statiq)
- **Duration**: 2 days | **Effort**: 2 dev days
- **Acceptance**: Hero section, mission statement, events banner, CTAs, responsive layout, <3sec load time
- **Quality Gate**: Lighthouse ≥90, <3sec load time verified, mobile-first responsive tested

### Task 1.2.3: About Page
- **Duration**: 1 day | **Effort**: 0.5 dev days
- **Acceptance**: Mission/Vision, 8 core principles, contribution guidelines, CoC link
- **Quality Gate**: All links working, content accuracy verified

### Task 1.2.4: Admin Dashboard (Statiq + Node.js)
- **Duration**: 2 days | **Effort**: 2 dev days
- **Acceptance**: Authentication, dashboard sections (overview, pending profiles, events, reports, audit log, system health)
- **Quality Gate**: Admin login works, pending profiles display correctly, all sections render

### Task 1.2.5: Email Templates (SendGrid)
- **Duration**: 1 day | **Effort**: 0.5 dev days
- **Acceptance**: Approval, rejection, parental consent, admin notification templates; i18n strings externalized
- **Quality Gate**: All templates have branded footer, color palette applied, no hardcoded strings

### Task 1.2.6: i18n Setup
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: 4 locales (en-IE, pt-PT, fr-FR, es-ES), translation files created, locale switcher component, date/time formatting per locale
- **Quality Gate**: Locale switching works, 95%+ core strings translated per locale

---

## Phase 1 Quality Gates (Week 2 End)

**MUST PASS before Phase 2**:
- ✅ Website live, ≥99.5% uptime
- ✅ Landing page <3sec load time (Lighthouse ≥90)
- ✅ Brand identity consistent across all pages
- ✅ Admin dashboard functional (can approve/reject profiles)
- ✅ Zero security incidents (HTTPS, no exposed secrets)
- ✅ Unit test coverage ≥80%
- ✅ WCAG 2.1 AA compliance verified
- ✅ i18n infrastructure: 4 locales, ≥95% coverage

**Phase 1 Effort**: ~50 developer days (1-2 FTE over 2 weeks)

---

# PHASE 2: CORE PLATFORM FEATURES

**Goal**: Functional user profiles, discovery, and connection system enabling first mentorship matches.  
**Duration**: 3 weeks (15 working days)  
**Effort**: ~75 developer days

## Week 3: User Registration & Profile Creation (5 days)

### Task 2.1.1: User Registration Flow
- **Duration**: 2 days | **Effort**: 2 dev days
- **Acceptance**: GitHub OAuth → profile form → submission → "Pending Review" state
- **Quality Gate**: Unit tests ≥80%, E2E signup flow validated, HTML injection prevented

### Task 2.1.2: Profile Approval Workflow
- **Duration**: 1 day | **Effort**: 0.5 dev days
- **Acceptance**: Admin approves/rejects, user notified, audit log entry created
- **Quality Gate**: Approval email sent, profile marked active, rejection reason captured

### Task 2.1.3: Profile Data Model (Cosmos DB)
- **Duration**: 1 day | **Effort**: 0.5 dev days
- **Acceptance**: Schema designed, sensitive fields encrypted (social links, email, location)
- **Quality Gate**: Indexing on user_id, approval_status verified for performance

### Task 2.1.4: Parental Consent Process
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: <18 triggers parent email, verification token, consent recorded
- **Quality Gate**: Consent email sent, token validation tested, document upload encrypted

### Task 2.1.5: Registration Testing
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Unit tests (registration, age validation, HTML sanitization), E2E (signup flow), integration tests (email delivery, DB insert)
- **Quality Gate**: ≥80% coverage, all edge cases tested (invalid age, missing fields, oversized files)

---

## Week 4: Profile Browse & Discovery (5 days)

### Task 2.2.1: Browse Endpoint
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: `GET /api/profiles/browse` with filtering (seeking, skills, level), pagination, <1sec response
- **Quality Gate**: Filter logic tested (AND/OR combinations), pagination verified

### Task 2.2.2: Browse UI
- **Duration**: 2 days | **Effort**: 2 dev days
- **Acceptance**: Filter panel, profile cards in grid, pagination controls, mobile-responsive
- **Quality Gate**: <1sec browse endpoint response, mobile layout tested, accessibility verified

### Task 2.2.3: Profile Detail Page
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Full bio, location (if visible), social links preview, "Connect" button; contact details hidden until connected
- **Quality Gate**: Privacy logic enforced (query checks connection status before returning details)

### Task 2.2.4: Data Privacy
- **Duration**: 1 day | **Effort**: 0.5 dev days
- **Acceptance**: Contact details encrypted, visible only to connected users, admin has audit log entry on access
- **Quality Gate**: DB queries optimized, encryption/decryption tested

### Task 2.2.5: Browse Testing
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Unit tests (filter logic), E2E (browse → filter → click → privacy check), integration (DB query performance)
- **Quality Gate**: ≥80% coverage, all filter combinations tested

---

## Week 5: Connection Invites & Management (5 days)

### Task 2.3.1: Connection Invite Endpoint
- **Duration**: 1 day | **Effort**: 0.5 dev days
- **Acceptance**: `POST /api/connections/invite`, creates pending connection, email notification sent
- **Quality Gate**: Duplicate invites rejected, email delivery verified

### Task 2.3.2: Connection Management Endpoints
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Accept/decline/block/disconnect endpoints, bidirectional visibility on acceptance
- **Quality Gate**: All status transitions tested, block enforcement verified

### Task 2.3.3: Connection UI
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Invites section, connected users list, profile card buttons
- **Quality Gate**: All UI elements render correctly, button actions work

### Task 2.3.4: Bidirectional Visibility
- **Duration**: 1 day | **Effort**: 0.5 dev days
- **Acceptance**: Both users see full profiles after acceptance, "Message" button shows external contact methods, "Disconnect" button available
- **Quality Gate**: External links work (Discord, LinkedIn, email), no in-app messaging leaks

### Task 2.3.5: Connection Testing
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Unit tests (invite validation, block logic), E2E (full connection flow A→B→accept→message)
- **Quality Gate**: ≥80% coverage, negative tests pass (duplicate invites, blocks prevent contact)

---

## Phase 2 Quality Gates (Week 5 End)

**MUST PASS before Phase 3**:
- ✅ 50+ user profiles approved within 2 weeks of Phase 2 start
- ✅ New users complete profile in <5 minutes
- ✅ Browse filtering works, <1sec response time
- ✅ First 10 successful connections established
- ✅ Contact details visible only to connected users (privacy enforced)
- ✅ Unit test coverage ≥80% on all new code
- ✅ E2E tests cover full signup → browse → connect flow
- ✅ Zero security incidents (no exposed contact details, encryption verified)

**Phase 2 Effort**: ~75 developer days (1-2 FTE over 3 weeks)

---

# PHASE 3: COMMUNITY ENGAGEMENT

**Goal**: Build community participation through events, help board, and Karma system.  
**Duration**: 3 weeks (15 working days)  
**Effort**: ~75 developer days

## Week 6: Community Events System (5 days)

### Task 3.1.1: Events Endpoints
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Create, list, update, delete events; validation on all inputs (UTC dates, Discord link format)
- **Quality Gate**: Admin-only enforcement tested, event ordering verified

### Task 3.1.2: Events Banner on Landing Page
- **Duration**: 1 day | **Effort**: 0.5 dev days
- **Acceptance**: Query next upcoming event, display on landing page, daily cron job promotes next event
- **Quality Gate**: Banner updates correctly, cron job runs at midnight UTC

### Task 3.1.3: Events Page
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Public events page (no auth), upcoming events list, past events archive
- **Quality Gate**: <2sec load time, mobile-responsive, all links work

### Task 3.1.4: Admin Events UI
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Create/edit/delete events, audit log entries, date/time picker
- **Quality Gate**: Form validation works, audit log records all actions

### Task 3.1.5: Events Testing
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Unit tests (date parsing, filtering), E2E (view events → create → verify banner), cron job tested
- **Quality Gate**: ≥80% coverage, date/time formatting per locale verified

---

## Week 7: Help Board & Voting System (5 days)

### Task 3.2.1: Help Board Endpoints
- **Duration**: 2 days | **Effort**: 2 dev days
- **Acceptance**: Create, browse (with filters), update, delete posts; validation on all inputs
- **Quality Gate**: Post types validated, skills filtering works, pagination correct

### Task 3.2.2: Voting & Karma Integration
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Vote endpoint, Karma awarded to post author (1 point per vote), one vote per user per post
- **Quality Gate**: Duplicate votes prevented, Karma updated in real-time

### Task 3.2.3: Help Board UI
- **Duration**: 2 days | **Effort**: 2 dev days
- **Acceptance**: Post feed (newest first), filters, post cards with vote count, "Help with this" modal showing external contact methods
- **Quality Gate**: <1sec browse response, mobile-responsive, voting UI intuitive

### Task 3.2.4: Help Board Testing
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Unit tests (vote validation, Karma calculation), E2E (create post → vote → verify Karma), integration (DB indexes)
- **Quality Gate**: ≥80% coverage, all filter combinations tested

---

## Week 8: Karma System & Badges (5 days)

### Task 3.3.1: Karma Data Model
- **Duration**: 1 day | **Effort**: 0.5 dev days
- **Acceptance**: Karma table with user_id, total_points, history array; initialize on signup
- **Quality Gate**: History entries correctly formatted with date, action, points, context

### Task 3.3.2: Badge System
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Badge table (name, Karma threshold, icon_url); seed 3 badges ("Helping Hand" 10+, "Community Champion" 50+, "Mentor Extraordinaire" 100+)
- **Quality Gate**: Badge thresholds correct, UserBadge table tracks earned badges

### Task 3.3.3: Badge Award Workflow
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Daily cron job checks users, awards new badges, sends email notifications, audit log entries
- **Quality Gate**: Cron job runs on schedule, all users checked, badges awarded correctly

### Task 3.3.4: Badge Display
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Profile displays Karma score (⭐ Karma: 42) and earned badges with icons/names/descriptions
- **Quality Gate**: Badges render correctly, screen reader tested, icon alt text present

### Task 3.3.5: Karma/Badge Testing
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Unit tests (Karma calculation, badge thresholds), E2E (post → vote → Karma awarded), cron job simulation
- **Quality Gate**: ≥80% coverage, edge cases tested (Karma decrease if post deleted)

---

## Phase 3 Quality Gates (Week 8 End)

**MUST PASS before Phase 4**:
- ✅ ≥5 help board posts by end of week 7
- ✅ ≥10 Karma points awarded to at least 2 users
- ✅ ≥1 event held with ≥5 Discord attendees
- ✅ First badges awarded to users (e.g., "Helping Hand")
- ✅ ≥80% user retention (return within 7 days)
- ✅ Community engagement metrics baseline established
- ✅ All Karma/badge calculations verified
- ✅ Unit test coverage ≥80%, E2E tests cover full engagement flow

**Phase 3 Effort**: ~75 developer days (1-2 FTE over 3 weeks)

---

# PHASE 4: TRANSPARENCY & ANALYTICS

**Goal**: Public metrics dashboard demonstrating platform health and building trust.  
**Duration**: 2 weeks (10 working days)  
**Effort**: ~50 developer days

## Week 9: Analytics Infrastructure & Metrics Collection (5 days)

### Task 4.1.1: Event Logging
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: EventLog table, event types logged (signup, login, profile_view, invite_sent, vote, etc.), metadata captured
- **Quality Gate**: All endpoints log events, indexes on user_id/event_type/timestamp correct

### Task 4.1.2: Metrics Aggregation Job
- **Duration**: 2 days | **Effort**: 2 dev days
- **Acceptance**: Weekly cron job aggregates metrics (total users, MAU, signup rate, mentor/mentee ratio, geographic distribution, churn)
- **Quality Gate**: Calculations verified against raw data, results stored in Metrics table

### Task 4.1.3: Public Metrics API Endpoint
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: `GET /api/metrics` (public, no auth), returns latest KPI snapshot, <500ms response, cached 24h
- **Quality Gate**: Response format correct, caching works, no PII leaked

### Task 4.1.4: Transparency Data
- **Duration**: 1 day | **Effort**: 0.5 dev days
- **Acceptance**: Add platform costs, donation link, funding goals, CoC enforcement metrics to Metrics table
- **Quality Gate**: All transparency data tracked and accessible

### Task 4.1.5: Analytics Testing
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: Unit tests (metrics calculations), integration tests (EventLog aggregation), performance tests (<500ms response)
- **Quality Gate**: ≥80% coverage, all calculations verified, performance baseline met

---

## Week 10: Public Dashboard & Final Polish (5 days)

### Task 4.2.1: Public Metrics Dashboard
- **Duration**: 2 days | **Effort**: 2 dev days
- **Acceptance**: `/metrics` page with charts (summary cards, growth chart, geographic distribution, cost transparency, CoC enforcement)
- **Quality Gate**: Lighthouse ≥90, <3sec load time, mobile-responsive

### Task 4.2.2: Dashboard Update Process
- **Duration**: 1 day | **Effort**: 0.5 dev days
- **Acceptance**: Dashboard queries Metrics table, 24h cache, manual refresh option for admin, ≥99.5% uptime
- **Quality Gate**: Cache strategy tested, admin refresh works, uptime monitored

### Task 4.2.3: Privacy & Data Validation
- **Duration**: 1 day | **Effort**: 0.5 dev days
- **Acceptance**: All metrics aggregated (no PII), geographic only country-level, audit verifies no data leakage
- **Quality Gate**: Data validation passed, privacy audit clean

### Task 4.2.4: E2E Testing & QA
- **Duration**: 2 days | **Effort**: 1.5 dev days
- **Acceptance**: E2E tests (navigate → charts load → numbers verified), mobile testing, accessibility verified (WCAG 2.1 AA)
- **Quality Gate**: All critical journeys tested, Lighthouse ≥90, keyboard navigation works

### Task 4.2.5: Final Documentation & Launch
- **Duration**: 1 day | **Effort**: 1 dev day
- **Acceptance**: CONTRIBUTING.md created, README updated with all links, deployment runbook, troubleshooting guide
- **Quality Gate**: All documentation links verified, runbook tested (deployment takes <5 min)

---

## Phase 4 Quality Gates (Week 10 End) - LAUNCH READINESS

**MUST PASS before launching to public**:
- ✅ Metrics dashboard deployed and publicly accessible
- ✅ All KPIs updating weekly via batch job
- ✅ ≥99.5% dashboard uptime
- ✅ <3sec dashboard load time (Lighthouse ≥90)
- ✅ WCAG 2.1 AA compliance verified (all pages)
- ✅ Zero security incidents (secret scanning clean, HTTPS enforced)
- ✅ Unit test coverage ≥80% across all code
- ✅ E2E tests cover all critical user journeys (signup → browse → connect, help board voting, events, metrics)
- ✅ Performance baseline achieved: <3sec page loads, <1sec API responses
- ✅ All governance principles (Constitution v1.3.0) embedded and verified
- ✅ i18n infrastructure: 4 locales, ≥95% translation coverage
- ✅ Brand identity consistent across all pages and platforms

**Phase 4 Effort**: ~50 developer days (1-2 FTE over 2 weeks)

---

## Overall MVP Completion

**Total Effort**: ~200-250 developer days  
**Total Duration**: 10 weeks (2 months)  
**Team Composition** (recommended):
- 1 Full-Stack Developer (Node.js + Statiq)
- 1 QA/Test Automation Engineer
- 1 Part-time Designer (brand, UX reviews)
- 1 Part-time DevOps (infrastructure, CI/CD)
- 1 Project Owner (requirements, decisions, communications)

**Key Success Metrics** (Post-Launch):
- ✅ ≥99.5% uptime across all services
- ✅ <3sec page load time (Lighthouse ≥90)
- ✅ 50+ registered users within first 30 days
- ✅ 10+ successful connections within first 45 days
- ✅ Zero security incidents
- ✅ ≥80% unit test coverage
- ✅ WCAG 2.1 AA compliance verified
- ✅ i18n: ≥95% translation coverage across 4 locales

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Azure free tier quotas exceeded | High | Monitor daily; scale to paid tier if needed; optimize DB queries |
| GitHub OAuth failures | High | Implement manual login fallback (email verification) |
| Cosmos DB query performance | Medium | Pre-optimize indexes; denormalize if needed; consider Azure Cache |
| i18n translation delays | Medium | Use machine translation (DeepL) for initial pass; community refines |
| Low initial user adoption | Medium | Community launch strategy: Discord, Twitter, dev communities |

---

## Next Steps

1. **Immediate** (Today): Review and approve task breakdown
2. **Week 1 Start**: Assign tasks, kick off Phase 1
3. **Weekly**: Hold standups, track progress against Phase gates
4. **Phase Transitions**: Verify all quality gates passed before proceeding
5. **Post-Launch**: Gather feedback, plan Phase 2+ (job board, mobile app, advanced Karma)
