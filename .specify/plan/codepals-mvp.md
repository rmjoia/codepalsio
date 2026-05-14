> ⚠️ **HISTORICAL — see `.specify/PROJECT_STATUS.md` for current state** (reconciled 2026-05-08).
> The 10-week schedule, technology choices, and risk register here are the original plan as written. Schedule + status are stale. New work tracks through numbered plans (`plan/002-...`, `plan/003-...`).

---

# Implementation Plan: CodePals.io MVP Platform

**Feature Branch**: `plan/001-codepals-mvp`  
**Created**: 2025-11-16  
**Status**: Draft  
**Input**: MVP Specification (`.specify/spec/codepals-mvp.md`) v1.0 + Constitution v1.3.0

---

## Executive Summary

This implementation plan translates the CodePals.io MVP specification (617 lines, 39 functional requirements, 4 phases) into a detailed execution roadmap spanning 10 weeks across 4 independent phases. Each phase delivers independently valuable features with clear success criteria and testable acceptance scenarios.

**Key Outcomes**:
- **Phase 1** (Weeks 1-2): Infrastructure + landing page + admin tools → **Live, branded website with admin dashboard**
- **Phase 2** (Weeks 3-5): User profiles + discovery + connections → **Functional mentorship matching platform**
- **Phase 3** (Weeks 6-8): Events + help board + Karma → **Engaged community with incentive system**
- **Phase 4** (Weeks 9-10): Metrics + transparency dashboard → **Public trust-building metrics**

**Total Effort Estimate**: ~200-250 developer days (assuming 1 FTE or part-time equivalents)

---

## Constitution Compliance Check

All 8 principles from Constitution v1.3.0 are embedded in this plan:

✅ **Principle 1: Open Source & Transparency** - Public repo, no secrets in code, governance transparent  
✅ **Principle 2: Code Quality** - Vitest unit tests (≥80%), Playwright E2E, peer review mandatory  
✅ **Principle 3: Security** - OWASP best practices, input validation, env-var secrets, HTTPS enforced  
✅ **Principle 4: Performance** - <3sec landing page load, API latency <1sec, monitoring active  
✅ **Principle 5: Privacy** - Minimal data collection, location visibility toggle, encrypted sensitive fields  
✅ **Principle 6: Community & Governance** - CoC displayed, contribution pathways, governance metrics tracked  
✅ **Principle 7: Brand Consistency** - Logo, color palette, typography consistent; Discord branding applied  
✅ **Principle 8: I18n & Accessibility** - 4 locales supported (pt-PT, en-IE, fr-FR, es-ES), WCAG 2.1 AA, RTL ready  

**Quality Gates Applied**:
- Secret scanning ✅
- Static analysis (linting) ✅
- Unit test coverage ≥80% ✅
- Integration/E2E tests ✅
- Performance baseline <3sec ✅
- Security review (input validation, access control) ✅
- Brand consistency audit ✅
- i18n coverage ≥95% ✅
- WCAG 2.1 AA validation ✅
- Peer review mandatory ✅

---

## Architecture & Technology Stack

### Chosen Stack Rationale

| Layer | Choice | Rationale | MVP Fit |
|-------|--------|-----------|---------|
| **Frontend** | Astro + TypeScript | Modern static site gen, component-based, TypeScript support, excellent DX | ✅ Landing + admin UI + events |
| **Hosting** | Azure Static Web Apps | Free tier, scales, built-in CI/CD, HTTPS | ✅ Phase 1 launch target |
| **Infrastructure** | PowerShell + Bicep | Automated provisioning, Infrastructure as Code, GitHub Actions orchestration | ✅ Dev + Prod environments |
| **Backend** | Node.js Serverless | Fast startup, Azure Functions integration, cost-effective | ✅ API endpoints, workflows |
| **Database** | Cosmos DB (free tier) | NoSQL, 400 RU/s sufficient for MVP, scales easily | ✅ Document-oriented schema |
| **Auth** | GitHub OAuth | Free, familiar to dev audience, zero passwords to manage | ✅ Profile creation flow |
| **Email** | SendGrid | 100 emails/day free tier, reliable, templates | ✅ Notifications, approvals |
| **Monitoring** | Azure App Insights | Free tier, error logging, performance monitoring | ✅ SLA tracking, troubleshooting |
| **CI/CD** | GitHub Actions + PowerShell | GitHub Actions orchestrates PowerShell modules for infrastructure | ✅ Automated testing + deploy |
| **Testing (Unit)** | Vitest | Modern, fast, TypeScript-first testing framework | ✅ Per Constitution Principle 2 |
| **Testing (E2E)** | Playwright | Cross-browser, fast, maintainable | ✅ Critical user journey validation |

### Data Model Overview

**Core Entities** (18 tables in Cosmos DB):

**User Management**:
- User (GitHub ID, username, avatar, approval status, role, Karma, badges)
- CodePals Profile (seeking, skills, bio, location, social links, age/parental consent status)
- ParentalConsent (guardian email, verification token, documents)

**Connections**:
- Connection (bidirectional: pending/accepted/declined/blocked)

**Community**:
- Event (title, description, date/time, Discord link, visibility)
- HelpBoardPost (author, type, title, skills, vote count, status)
- HelpBoardVote (user, post, Karma awarded)
- Karma (user total, history array)
- Badge, UserBadge (earned recognition)

**Analytics**:
- EventLog (signup, login, profile_edit, invite, vote, etc.)
- Report (user reports for CoC violations)
- AdminAuditLog (all admin actions: approve, reject, block, delete)

**i18n**:
- Locale (pt-PT, en-IE, fr-FR, es-ES configs)
- Translation (externalized strings per locale/namespace)
- UserLocalePreference (user's selected locale)

### i18n Architecture

**Translation File Structure**:
```
i18n/
├── en-IE/
│   ├── common.json      (generic UI strings: welcome, logout, etc.)
│   ├── profile.json     (profile form labels, seeking options, skills)
│   ├── errors.json      (validation messages, API errors)
│   ├── emails.json      (transactional email templates)
│   └── badges.json      (badge names, descriptions)
├── pt-PT/
├── fr-FR/
└── es-ES/
```

**Locale Detection**:
1. User's explicit preference (stored in UserLocalePreference)
2. Browser Accept-Language header (fallback)
3. Default: en-IE

**Coverage Requirement**: ≥95% core strings translated per supported locale (tracked in Locale.coverage_percentage)

---

## Phase-by-Phase Breakdown

### PHASE 1: Foundation & Landing (Weeks 1-2)

**Goal**: Live website with brand identity, admin dashboard, infrastructure ready for user signup.

#### Week 1: Infrastructure & Setup

**Tasks**:
1. **Azure Setup** (3 days)
   - Create Azure subscription / resource group
   - Provision Cosmos DB (free tier: 400 RU/s)
   - Configure Cosmos DB connection string → environment variables
   - Create Azure Storage for email templates, logo assets
   - Enable HTTPS, configure custom domain (if available)
   - Security: Enable secret rotation, key vault integration

2. **GitHub OAuth Configuration** (2 days)
   - Register GitHub OAuth app (Settings → Developer Settings → OAuth Apps)
   - Configure redirect URI: `https://codepals.io/auth/callback`
   - Store client ID & secret in Azure Key Vault (NOT in code)
   - Implement OAuth flow: /login → GitHub → /auth/callback → set session

3. **CI/CD Pipeline (GitHub Actions)** (2 days)
   - Create `.github/workflows/deploy.yml` for main branch
   - Trigger: `npm run build` (Statiq) on commit to main
   - Tests: Run linting, Jasmine unit tests (≥80% coverage gate)
   - Deploy: Static site → Azure Static Web Apps
   - Secrets scanning: GitHub Advanced Security scan before deploy
   - Deployment gate: Must pass all checks before merge

4. **Backend Skeleton (Node.js Serverless)** (2 days)
   - Create `backend/` directory with Node.js project
   - Implement API structure: `/api/health`, `/api/auth/*`, `/api/profiles/*`, `/api/events/*`, etc.
   - Setup middleware: CORS (CodePals.io frontend only), rate limiting (100 req/min per IP), error logging
   - Connect to Cosmos DB: Initialize client, test connection
   - Environment variables: DB_CONNECTION_STRING, GITHUB_CLIENT_ID, SENDGRID_API_KEY, AZURE_INSIGHTS_KEY
   - Deploy: Azure Functions (HTTP triggers)

**Deliverables**:
- ✅ Cosmos DB provisioned, connection verified
- ✅ GitHub OAuth app registered, redirect URI configured
- ✅ GitHub Actions CI/CD pipeline active (all PRs run tests)
- ✅ Backend API skeleton deployed: `/api/health` returns 200 OK
- ✅ HTTPS enforced, custom domain configured
- ✅ Monitoring active (Azure App Insights logging all requests)

**Quality Gates Passed**:
- ✅ Secret scanning: 0 exposed credentials
- ✅ Linting: 0 errors
- ✅ API uptime: ≥99.5% (monitored)

---

#### Week 2: Landing Page & Admin Dashboard

**Tasks**:

1. **Brand Implementation** (2 days)
   - Import brand identity: logo (SVG + PNG), color palette (Teal #00BCD4, Gold #FFB700), typography
   - Create design system components: buttons, cards, forms, modals (Statiq templates)
   - Implement consistent styling across all pages
   - WCAG 2.1 AA validation: color contrast ≥4.5:1, focus indicators, keyboard nav

2. **Landing Page (Statiq)** (2 days)
   - Hero section: CodePals.io logo, headline ("A trusted developer community"), tagline
   - Mission statement section: Vision + 3 core benefits ("Mentorship Matching", "Real Connections", "Transparency First")
   - Events highlight banner: Next upcoming event (title, date, "Join on Discord" button)
   - CTA buttons: "Sign In with GitHub" (login), "Learn More" (About page)
   - Footer: Links to About, Events, Metrics, Code of Conduct, Privacy, GitHub repo
   - Responsive design: Mobile-first, test on phones/tablets/desktop
   - Performance: <3 seconds load time (Lighthouse target ≥90)

3. **About Page** (1 day)
   - Mission + Vision statement
   - Core principles (transparency, security, privacy, community, brand consistency, i18n)
   - How to contribute: GitHub fork, PR workflow, CoC link
   - Link to Constitution, Code of Conduct

4. **Admin Dashboard (Statiq + Node.js API)** (2 days)
   - Authentication: Admin login via GitHub OAuth (admin role verified in DB)
   - Dashboard sections:
     - **Overview**: Pending profiles count, next event date, system health (API uptime %, error rate)
     - **Pending Profiles**: List with GitHub username, age status, submission date, Approve/Reject buttons, reason input
     - **Events**: Create/edit/delete events (title, description, date/time UTC, Discord link, visibility)
     - **Reports**: List of user reports with status (open/resolved), notes
     - **Audit Log**: All admin actions (approve, reject, block, delete) with timestamp, admin name, target user, reason
     - **System Health**: API uptime %, error rate, DB query times, email delivery success %
   - Validation: Admin must authenticate via GitHub; only admin role can access

5. **Email Templates (SendGrid)** (1 day)
   - Profile approval notification
   - Profile rejection notification (with reason)
   - Parental consent verification email (with secure link)
   - Admin notification: New profile submitted for review
   - All templates: Externalized strings (i18n-ready), branded footer with logo, Color palette applied

6. **i18n Setup** (1 day)
   - Create translation files in `i18n/` per locale (en-IE, pt-PT, fr-FR, es-ES)
   - Populate common strings: navigation, buttons, headings, footers
   - Implement locale switcher component (dropdown, flag icons)
   - Date/time formatting per locale (DD/MM/YYYY vs MM/DD/YYYY, 24h vs 12h)
   - Test locale switching: en-IE → pt-PT → en-IE (ensure all strings translated)

**Deliverables**:
- ✅ Landing page live with brand identity, <3sec load time
- ✅ About page + links to governance docs
- ✅ Admin dashboard: pending profiles, events, reports, audit log, system health
- ✅ Email templates: approval, rejection, parental consent, admin notifications
- ✅ i18n infrastructure: 4 locales supported, locale switcher on all pages, 95%+ coverage
- ✅ WCAG 2.1 AA compliance verified (color contrast, keyboard nav, screen reader tested)

**Success Criteria Met**:
- ✅ Website live (uptime ≥99.5%)
- ✅ Landing page loads <3sec (Lighthouse ≥90)
- ✅ Brand identity consistent across all pages
- ✅ Admin dashboard functional (can approve/reject profiles)
- ✅ Zero security incidents (HTTPS, no exposed secrets)

---

### PHASE 2: Core Platform Features (Weeks 3-5)

**Goal**: Functional user profiles, discovery, and connection system enabling first mentorship matches.

#### Week 3: User Registration & Profile Creation

**Tasks**:

1. **User Registration Flow** (2 days)
   - Endpoint: `POST /api/auth/register` (GitHub OAuth)
   - Flow: User clicks "Sign In with GitHub" → OAuth redirect → user authenticated → profile creation form shows
   - Profile form fields: seeking (mentor/mentee/both), skills (multi-select), experience level, bio (500 char), location (country/state/city, visibility toggle), social links (Discord, LinkedIn, Twitter, website), availability for pairing, age confirmation
   - Age confirmation logic: If <18, prompt for parent/guardian email + verification link
   - Parental consent email: Guardian receives secure link; must click to verify (token valid 7 days)
   - Profile submission: Mark as "Pending Review" → admin notified
   - Validation: No HTML injection, text sanitized, file size <5MB, only image/PDF files
   - Test coverage: ≥80% with Jasmine/Karma unit tests

2. **Profile Approval Workflow** (1 day)
   - Admin views pending profile → clicks Approve
   - Profile marked "Active" → user receives approval email
   - Profile becomes visible in browse/discovery system
   - Audit log entry: "Approved profile [username]" by admin at timestamp
   - Rejection path: Admin clicks Reject → prompted for reason → reason emailed to user → user can resubmit

3. **Profile Data Model** (1 day)
   - Cosmos DB schema for CodePals Profile
   - Fields: seeking, skills, experience_level, bio, location, location_visibility, social_links, availability, age_verified, parental_consent_status
   - Encryption: Social links, email, location (encrypted at rest)
   - Indexing: by user_id, approval_status (for admin query), seeking (for browse)

4. **Parental Consent Process** (1 day)
   - ParentalConsent table: user_id, guardian_email, verification_token, consent_verified (boolean), timestamp, documents (array of blob URLs)
   - Email workflow: Guardian clicks link → token validated → consent recorded → profile moves to admin review
   - Optional document upload: Guardian can upload PDF/image for additional verification
   - Documents: Encrypted in Cosmos DB, accessible only to admin

5. **Testing** (1 day)
   - Jasmine unit tests: Registration flow, age validation, HTML sanitization
   - Playwright E2E tests: User signup → OAuth → profile form → submission → "Pending Review" state
   - Integration tests: SendGrid email delivery verified, Cosmos DB profile insert verified
   - Negative tests: Invalid age, missing required fields, oversized files

**Deliverables**:
- ✅ User registration via GitHub OAuth
- ✅ Profile creation form with all required fields
- ✅ Parental consent workflow (if under 18)
- ✅ Profile approval workflow (admin dashboard integration)
- ✅ Encrypted sensitive fields in Cosmos DB
- ✅ Email notifications: approval, rejection, parental consent
- ✅ Unit test coverage ≥80%, E2E tests for signup flow

---

#### Week 4: Profile Browse & Discovery

**Tasks**:

1. **Browse Endpoint** (1 day)
   - `GET /api/profiles/browse?seeking=mentor&skills=React,Node&level=intermediate&page=1`
   - Returns: Paginated list (20 per page) of approved profiles matching filters
   - Filters: seeking (OR logic: mentor OR mentee), skills (AND logic), experience level
   - Exclude: Self profile, unmatched profiles
   - Response: avatar, username, seeking status badge, top 3-5 skills, experience level, created date

2. **Browse UI** (2 days)
   - Filter panel: Seeking status (dropdown), skills (multi-select with autocomplete), experience level (buttons)
   - Profile cards: Display matching profiles in grid/list
   - Pagination: Previous/Next buttons, page numbers
   - Responsive: Mobile-friendly layout
   - Performance: <1sec response time on browse endpoint
   - Test: Jasmine unit tests for filter logic, Playwright E2E test for browse flow

3. **Profile Detail Page** (1 day)
   - When user clicks profile card: Show full bio, location (if visible), social links preview, "Connect" button
   - If NOT connected: Full contact details hidden, message "Connect to view contact info"
   - If connected: All details visible, "Message" button shows external contact methods
   - Accessibility: Screen reader tested, keyboard navigation

4. **Data Privacy** (1 day)
   - Contact details (email, location, social links) encrypted in DB
   - Only visible to connected users (query: WHERE user_a=X AND user_b=Y AND status='accepted')
   - Admin can view all details (with audit log entry)

5. **Testing** (1 day)
   - Jasmine: Filter logic (AND/OR combinations), pagination calculations
   - Playwright E2E: Browse → filter → click profile → verify details hidden until connected
   - Integration: Verify DB queries optimized for filter (use indexes on seeking, skills)

**Deliverables**:
- ✅ Browse endpoint with filtering (seeking, skills, level)
- ✅ Profile detail page with privacy controls
- ✅ Browse UI: Filters, cards, pagination
- ✅ <1sec browse API response
- ✅ Encrypted contact details, visible only to connected users
- ✅ Unit test ≥80%, E2E tests for browse flow

---

#### Week 5: Connection Invites & Management

**Tasks**:

1. **Connection Invite Endpoint** (1 day)
   - `POST /api/connections/invite` (user_a, user_b)
   - Create Connection record: status="pending", created_timestamp
   - Prevent duplicates: If already pending/accepted/blocked, reject
   - Notify user_b: Email notification "User A sent you a connection request"
   - Response: Connection ID, status="pending"

2. **Connection Management Endpoints** (1 day)
   - `POST /api/connections/{id}/accept` → status="accepted", bidirectional visibility enabled
   - `POST /api/connections/{id}/decline` → connection deleted, user_a notified
   - `POST /api/connections/{id}/block` → status="blocked", permanent block, user_a cannot view profile or send invites, audit log entry
   - `POST /api/connections/{id}/disconnect` → connection deleted, both users notified

3. **Connection UI** (1 day)
   - Invites section: User sees all pending invites with "Accept", "Decline", "Block" buttons
   - Connected users list: Dashboard showing all accepted connections
   - Profile card: "Connect" button (if not connected), "Message" button (if connected)
   - Block management: Blocked users cannot be seen; appeals via admin only

4. **Bidirectional Visibility** (1 day)
   - Upon acceptance: Both users see each other's full profiles (contact details, social links, location if enabled)
   - Both see "Message" button → links to Discord/email/LinkedIn (external, no in-app messaging)
   - Both see "Disconnect" button

5. **Testing** (1 day)
   - Jasmine: Invite validation, block logic, bidirectional status updates
   - Playwright E2E: User A sends invite → User B receives email → User B accepts → Both see full profiles
   - Negative test: Duplicate invites rejected, blocks prevent all contact

**Deliverables**:
- ✅ Connection invite endpoint
- ✅ Accept/decline/block/disconnect endpoints
- ✅ Connection UI: Pending invites, connected users, profile card buttons
- ✅ Bidirectional visibility on acceptance
- ✅ Permanent block enforcement
- ✅ Email notifications: Invite sent, accept confirmation
- ✅ Unit test ≥80%, E2E tests for full connection flow

**Phase 2 Success Criteria Met**:
- ✅ First 50 user profiles approved within 2 weeks of launch ✅ (by end of Phase 2)
- ✅ New users complete profile in <5 minutes ✅
- ✅ First 10 successful connections within 4 weeks ✅ (by mid-Phase 3)
- ✅ Browse filtering works, <1sec response ✅

---

### PHASE 3: Community Engagement (Weeks 6-8)

**Goal**: Build engagement through events, help board, Karma system; establish community identity.

#### Week 6: Community Events System

**Tasks**:

1. **Events Endpoints** (1 day)
   - `POST /api/events` (admin only) - Create event: title, description, date/time (UTC), Discord link, visibility
   - `GET /api/events` - List all upcoming events (public, no auth required)
   - `PUT /api/events/{id}` (admin only) - Edit event
   - `DELETE /api/events/{id}` (admin only) - Delete event
   - Validation: Date in UTC, Discord link valid format, title <200 chars

2. **Events Banner on Landing Page** (1 day)
   - Query: Next upcoming event (date > now, ordered by date ascending, limit 1)
   - Display: Event title, date/time (formatted per locale), "Join on Discord" button
   - Update: Daily cron job runs at midnight UTC; if event passed, promotes next event
   - Responsive: Mobile-friendly banner layout

3. **Events Page** (1 day)
   - Public page listing all upcoming events in chronological order
   - Display: Title, description, date/time (locale-formatted), Discord link
   - Archive link: "Past Events" showing archived (date < now) events
   - No auth required: Unauthenticated users can view events
   - Responsive design, <2sec load

4. **Admin Events UI** (1 day)
   - Admin dashboard "Events" section
   - Form: Create new event (title, description, date/time picker, Discord link, visibility toggle)
   - List: Upcoming events with Edit/Delete buttons
   - Edit flow: Pre-fill form, save changes, update DB
   - Audit log: Record all event creation/modification/deletion with admin name, timestamp

5. **Testing** (1 day)
   - Jasmine: Date parsing (UTC), event filtering (past/future)
   - Playwright E2E: View events page → click Discord link → create event (admin) → verify banner updated
   - Cron job: Test daily update logic (mock time)

**Deliverables**:
- ✅ Events endpoints: create, list, update, delete
- ✅ Events banner on landing page (next event highlighted)
- ✅ Public events page (no auth required)
- ✅ Admin events UI (create, edit, delete)
- ✅ Daily cron job for banner update
- ✅ Locale-aware date/time formatting
- ✅ Unit test ≥80%, E2E tests for event flow

---

#### Week 7: Help Board & Voting System

**Tasks**:

1. **Help Board Endpoints** (2 days)
   - `POST /api/helpboard/posts` - Create post: type, title, description, skills (multi-select), date_needed (optional)
   - `GET /api/helpboard/posts?type=mentor&skills=React&page=1` - Browse posts with filters, pagination
   - `PUT /api/helpboard/posts/{id}` (author only) - Edit post
   - `POST /api/helpboard/posts/{id}/resolve` (author only) - Mark resolved (move to archive)
   - `DELETE /api/helpboard/posts/{id}` (admin/author) - Delete post
   - Post types: "Looking for Mentor", "Looking for Mentee", "Looking for Community", "Help Wanted", "Other"
   - Validation: Title <200 chars, description <2000 chars, skills valid, no HTML injection

2. **Voting & Karma Integration** (1 day)
   - `POST /api/helpboard/posts/{id}/vote` - User thumbs up post
   - Award Karma: 1 point per thumbs up to post author
   - Record: HelpBoardVote with user, post, timestamp
   - Prevent duplicates: One vote per user per post (query: WHERE user_id=X AND post_id=Y)
   - Update Karma: Increment Karma.total_points, append to Karma.history array

3. **Help Board UI** (2 days)
   - Feed: List of open posts sorted by newest first (paginated, 20 per page)
   - Filter panel: Post type (dropdown), skills (multi-select), date range (optional)
   - Post card: Author profile (avatar, username, Karma score), post type badge, title, description, skills tags, vote count, creation date, "Help with this" button
   - Click "Help with this": Modal shows external contact methods (email, Discord, LinkedIn) with links; NO in-app messaging
   - Author can mark "Resolved": Post moved to archive, but remains visible (not deleted)
   - Responsive design, <1sec browse response

4. **Testing** (1 day)
   - Jasmine: Vote validation (one per user), Karma calculation, filter logic
   - Playwright E2E: Create post → vote on post → verify Karma awarded → check archive
   - Integration: Cosmos DB indexes on post_type, skills, status (for fast queries)

**Deliverables**:
- ✅ Help board endpoints (CRUD, vote)
- ✅ Voting system with Karma integration
- ✅ Help board UI: Feed, filters, post cards, voting
- ✅ Mark post resolved / archive flow
- ✅ External contact methods (no in-app messaging)
- ✅ <1sec browse response time
- ✅ Unit test ≥80%, E2E tests for help board flow

---

#### Week 8: Karma System & Badges

**Tasks**:

1. **Karma Data Model** (1 day)
   - Karma table: user_id, total_points, history (array of {date, action, points, context, from_user})
   - Initialize on user signup: user_id, total_points=0, history=[]
   - On vote: total_points += 1, append {date: now, action: "vote", points: 1, context: {post_id}, from_user: voter_id}

2. **Badge System** (1 day)
   - Badge table: id, name, Karma threshold, icon_url, description, created_timestamp
   - Seed badges: "Helping Hand" (10+), "Community Champion" (50+), "Mentor Extraordinaire" (100+)
   - UserBadge table: user_id, badge_id, awarded_date, notification_sent (boolean)
   - Daily cron job: Check all users; if Karma >= threshold AND badge not earned, award badge

3. **Badge Award Workflow** (1 day)
   - Cron job runs daily (check all users)
   - For each user: Calculate earned badges based on Karma
   - If new badge earned: Add to UserBadge, set notification_sent=false
   - Send email notification: "You've earned the 'Helping Hand' badge! 🎉" with badge icon
   - Set notification_sent=true
   - Audit log: "Badge awarded to [username]: Helping Hand"

4. **Badge Display** (1 day)
   - Profile page: Display Karma score (⭐ Karma: 42) and earned badges with icons, names, descriptions
   - Badge styling: Icon + name + description, styled per design system
   - Accessible: Screen reader: "Achievement: Helping Hand - Awarded for contributing 10+ Karma points"

5. **Testing** (1 day)
   - Jasmine: Karma calculation, badge threshold logic, daily job simulation
   - Playwright E2E: Create post → get votes → check Karma updated → verify badge awarded (next day)
   - Negative test: Karma decreases if post deleted (handle retroactively)

**Deliverables**:
- ✅ Karma tracking with history
- ✅ Badge system: "Helping Hand", "Community Champion", "Mentor Extraordinaire"
- ✅ Daily badge award cron job
- ✅ Badge display on profile
- ✅ Email notifications on badge award
- ✅ Karma visible on all user profiles
- ✅ Unit test ≥80%, E2E tests for Karma/badge flow

**Phase 3 Success Criteria Met**:
- ✅ First 5 help board posts within 4 weeks ✅
- ✅ First 10+ Karma points awarded ✅
- ✅ First event held with ≥5 Discord attendees ✅
- ✅ ≥80% user retention (return within 7 days) ✅

---

### PHASE 4: Transparency & Analytics (Weeks 9-10)

**Goal**: Public metrics dashboard demonstrating platform health and building trust through transparency.

#### Week 9: Analytics Infrastructure & Metrics Collection

**Tasks**:

1. **Event Logging** (1 day)
   - EventLog table: user_id, event_type, timestamp, metadata (JSON)
   - Event types: signup, login, profile_view, invite_sent, invite_accepted, connect, disconnect, block, report, vote
   - Log on every action: User signup → EventLog entry {user_id, event_type: "signup", timestamp: now}
   - Metadata: Optional context (post_id for vote, connection_id for connect, etc.)
   - Indexes: By user_id, event_type, timestamp (for aggregation queries)

2. **Metrics Aggregation Job** (2 days)
   - Weekly cron job (every Sunday midnight UTC): Aggregates EventLog into KPI metrics
   - Calculates:
     - Total registered users (count User where approval_status='active')
     - Monthly active users (count distinct user_id from EventLog where event_type in [login, profile_view, vote] AND timestamp > 30 days ago)
     - New signups this month (count EventLog where event_type='signup' AND month=current)
     - Mentor/mentee ratio (count profiles where seeking='mentor' / count profiles where seeking='mentee')
     - Geographic distribution (count users grouped by location)
     - Churn (users active 30d ago but not in last 7d)
   - Stores results in Metrics table: {week, total_registered, monthly_active, signup_rate, mentor_mentee_ratio, geographic, churn, created_timestamp}

3. **Public Metrics API Endpoint** (1 day)
   - `GET /api/metrics` (public, no auth)
   - Returns latest KPI snapshot: {total_registered, monthly_active, signup_rate, mentor_mentee_ratio, geographic_distribution}
   - Response time: <500ms (cached)
   - Format: JSON, easy to visualize

4. **Transparency Data** (1 day)
   - Add to Metrics: platform_costs (estimated), donation_link, funding_goals
   - Add CoC enforcement metrics: violations_resolved_this_week, blocks_removals_count, appeals_pending
   - All tracked per week; historical data retained

5. **Testing** (1 day)
   - Jasmine: Metrics calculation logic (user counts, ratios, churn)
   - Integration: Mock EventLog entries, run aggregation job, verify calculations correct
   - Performance: Metrics API <500ms response time

**Deliverables**:
- ✅ EventLog table and logging on every user action
- ✅ Weekly metrics aggregation cron job
- ✅ Metrics table with historical tracking
- ✅ Public metrics API endpoint (no auth)
- ✅ Cost transparency data
- ✅ CoC enforcement metrics
- ✅ Unit test ≥80%, integration tests for aggregation

---

#### Week 10: Public Dashboard & Final Polish

**Tasks**:

1. **Public Metrics Dashboard** (2 days)
   - New page: `/metrics` (public, no auth required)
   - Sections:
     - **Summary Cards**: Total registered users, Monthly active, Signup rate (trend ↑/↓), Mentor/mentee ratio
     - **Growth Chart**: Line chart of signup trend by week (last 12 weeks), legend
     - **Geographic Distribution**: Bar chart or map of top countries by user count
     - **Cost Transparency**: "Platform runs on free tiers: Azure, Cosmos DB, SendGrid" + estimated costs if scaling
     - **CoC Enforcement**: "Weekly violations resolved: X, Blocks: Y, Appeals: Z"
     - **Funding & Sponsors**: Donation link, sponsor logos (if available), funding goals
   - Responsive: Mobile-friendly charts, <3sec load time
   - Chart library: Chart.js or similar (lightweight)
   - Timezone: All dates in UTC with locale formatting

2. **Dashboard Update Process** (1 day)
   - Metrics page: Queries Metrics table for latest week
   - Cache strategy: 24h cache on dashboard (fresh weekly after aggregation job)
   - Manual refresh: Admin can trigger refresh from dashboard
   - Uptime target: ≥99.5% (monitored)

3. **Privacy & Data Validation** (1 day)
   - Metrics are aggregated only (no PII)
   - Geographic: Countries only (no city-level data)
   - User counts: Anonymized, no individual user details
   - Audit: Verify all data in dashboard is public (no leakage of private info)

4. **E2E Testing & QA** (2 days)
   - Playwright E2E tests: Navigate to metrics page → verify all charts load → verify numbers make sense
   - Performance: Lighthouse ≥90 on metrics page
   - Mobile testing: Verify responsive on iPhone/Android
   - Accessibility: WCAG 2.1 AA compliance (color contrast, alt text for charts, keyboard nav)

5. **Final Polish & Documentation** (1 day)
   - Create CONTRIBUTING.md: How to report bugs, submit PRs, contribute translations
   - Update README with links to all pages (landing, metrics, events, etc.)
   - Deploy checklist: All features tested, documentation updated, accessibility verified
   - Launch documentation: Deployment runbook, troubleshooting guide

6. **Launch Preparation** (1 day)
   - Smoke tests: Every critical user journey working end-to-end
   - Performance: All pages <3sec load time
   - Security: HTTPS enforced, no secrets in logs, rate limiting active
   - Monitoring: Uptime checks, error alerts configured
   - Go/no-go decision: All Phase 4 criteria met?

**Deliverables**:
- ✅ Public metrics dashboard with charts
- ✅ Cost transparency section
- ✅ CoC enforcement metrics
- ✅ <3sec dashboard load time, ≥99.5% uptime
- ✅ WCAG 2.1 AA compliance (charts, responsive, keyboard nav)
- ✅ CONTRIBUTING.md and final documentation
- ✅ Deployment runbook and troubleshooting guide
- ✅ End-to-end testing complete, all gates passed

**Phase 4 Success Criteria Met**:
- ✅ KPI dashboard deployed and publicly accessible ✅
- ✅ Metrics updated weekly via batch job ✅
- ✅ ≥99.5% dashboard uptime ✅

---

## Cross-Phase Concerns

### Security & Privacy Throughout All Phases

**Secret Management**:
- All secrets (API keys, connection strings) stored in Azure Key Vault
- Never committed to Git
- Rotated every 90 days
- Audit log: Who accessed which secrets, when

**Input Validation**:
- All endpoints validate inputs (no HTML injection, sanitize text)
- Whitelist allowed characters per field
- File uploads: Max 5MB, whitelist image/PDF only
- Rate limiting: 100 req/min per IP on all endpoints

**Encryption**:
- Database: Sensitive fields encrypted at rest (social links, email, location, documents)
- In transit: All API calls over HTTPS
- Email: SendGrid uses TLS

**Access Control**:
- Role-based: admin vs user
- Profile details visible only to connected users (DB query filters)
- Admin audit log: Every admin action logged with timestamp, user, reason

**GDPR/Privacy**:
- User can delete account → marks user as "deleted" (data retained for 90 days, then purged)
- Location visibility toggle: Users control if location shown
- GitHub account deletion: Profile marked "orphaned", admin can preserve or deactivate

---

### Testing Strategy Throughout All Phases

**Unit Testing (Jasmine/Karma)**:
- Target: ≥80% code coverage for all backend services
- Test framework setup: `npm run test` runs full suite with coverage report
- CI gate: PRs must have ≥80% coverage to merge
- Mock external services: SendGrid, Cosmos DB (use mocks in unit tests)

**Integration Testing**:
- Test API endpoints with realistic data flows
- Database: Use test Cosmos DB container (separate from production)
- Email: SendGrid sandbox mode (no actual emails sent)
- GitHub OAuth: Use test GitHub app credentials

**End-to-End Testing (Playwright)**:
- Critical user journeys:
  - Signup → profile creation → approval → approval email received
  - Browse → filter → click profile → connect → acceptance → message
  - Help board → create post → vote → verify Karma awarded
  - Admin: Approve profile → check audit log
  - Locale switching: en-IE → pt-PT → verify all strings translated
- Cross-browser: Chrome, Firefox, Safari
- CI: Run E2E tests on every PR (< 15 min execution)

**Performance Testing**:
- Load test: Simulate 100 concurrent users browsing profiles
- Target: <1sec response time for browse endpoint, <3sec for page loads
- Monitor: Database query times, API response times

**Accessibility Testing**:
- Automated: axe or pa11y on every page (WCAG 2.1 AA)
- Manual: Screen reader (NVDA, JAWS) testing on critical paths
- Keyboard: Tab through all forms, verify focus indicators visible

---

### Internationalization (i18n) Throughout All Phases

**Translation Files**:
- Structure: `i18n/[locale]/[namespace].json`
- Namespaces: common, profile, errors, emails, badges, events, help_board
- Keys: Hierarchical (common.welcome, profile.bio_label, errors.required_field)
- Each locale: ≥95% coverage of core strings (tracked in Locale.coverage_percentage)

**Locale Detection**:
1. User's explicit preference (UserLocalePreference)
2. Browser Accept-Language header
3. Fallback: en-IE

**Email Localization**:
- SendGrid templates: Externalized per locale
- User's preferred locale: Email sent in their language
- Sender name: Can be localized (optional, "CodePals.io Support" or "Support CodePals.io")

**Date/Time Formatting**:
- pt-PT: DD/MM/YYYY, 24h time
- en-IE: DD/MM/YYYY, 24h time
- fr-FR: DD/MM/YYYY, 24h time
- es-ES: DD/MM/YYYY, 24h time

**RTL Support**:
- CSS structured for LTR/RTL: Use `dir="ltr"` or `dir="rtl"` on body
- Margin/padding: Use `margin-inline-start`, `margin-inline-end` (CSS Logical Properties)
- Text alignment: `text-align: start` (auto-flips with dir)

---

### Quality Gates Per Phase

**Phase 1 Gates**:
- ✅ Secret scanning: 0 exposed credentials
- ✅ Linting: 0 errors
- ✅ Unit tests: ≥80% coverage (backend)
- ✅ Performance: <3sec page load (Lighthouse ≥90)
- ✅ Security: HTTPS, no secrets in logs
- ✅ Brand audit: Logo, colors, typography consistent
- ✅ i18n coverage: ≥95% for en-IE, pt-PT, fr-FR, es-ES
- ✅ WCAG 2.1 AA: Color contrast ≥4.5:1, keyboard nav, screen reader tested
- ✅ Peer review: At least 1 approver before merge

**Phase 2 Gates**:
- ✅ All Phase 1 gates
- ✅ Unit tests: ≥80% coverage (profile, connection endpoints)
- ✅ E2E tests: Signup, browse, connect flows passing
- ✅ Integration tests: OAuth, email delivery verified
- ✅ Performance: Browse endpoint <1sec response
- ✅ Privacy: Contact details encrypted, visible only to connected users
- ✅ i18n: All profile fields translated for all locales

**Phase 3 Gates**:
- ✅ All Phase 1-2 gates
- ✅ Unit tests: ≥80% coverage (help board, Karma, badges)
- ✅ E2E tests: Help board, voting, Karma, badges flows passing
- ✅ Integration tests: Voting, Karma calculation verified
- ✅ Performance: Help board browse <1sec
- ✅ Accessibility: Post cards, voting UI keyboard accessible
- ✅ i18n: Help board types, badge names translated

**Phase 4 Gates**:
- ✅ All Phase 1-3 gates
- ✅ Unit tests: ≥80% coverage (metrics aggregation)
- ✅ E2E tests: Metrics page load, data accuracy verified
- ✅ Integration tests: Metrics cron job runs correctly
- ✅ Performance: Metrics page <3sec, dashboard <500ms API response
- ✅ Data validation: No PII in public metrics (countries only, no users named)
- ✅ Uptime: ≥99.5% monitoring active
- ✅ Documentation: README, CONTRIBUTING, deployment runbook complete

---

## Resource & Timeline Summary

### Estimated Effort by Phase

| Phase | Duration | Dev Days | Key Deliverables |
|-------|----------|----------|------------------|
| **Phase 1** | Weeks 1-2 | ~40-50 | Infrastructure, landing page, admin dashboard, i18n setup |
| **Phase 2** | Weeks 3-5 | ~60-70 | User profiles, discovery, connections, full auth flow |
| **Phase 3** | Weeks 6-8 | ~60-70 | Events, help board, Karma, badges, community engagement |
| **Phase 4** | Weeks 9-10 | ~30-40 | Analytics, metrics dashboard, transparency, final polish |
| **Total MVP** | 10 weeks | ~190-230 | **Live, feature-complete MVP with 4 phases** |

### Resource Requirements

**Core Team** (Minimum viable):
- 1 Full-stack developer (Node.js + Statiq)
- 1 QA/Tester (Playwright E2E, accessibility)
- 1 Part-time designer/brand lead (logo, design system, accessibility reviews)
- 1 Part-time DevOps (Azure setup, CI/CD, monitoring)
- 1 Project owner (you) for admin workflows, governance, CoC decisions

**Tools & Infrastructure**:
- Azure subscription (free tier sufficient for MVP)
- GitHub repo (public, free)
- SendGrid free tier
- Cosmos DB free tier (400 RU/s)
- GitHub Actions CI/CD (free)

**Development Environment**:
- Node.js 18+, npm
- Statiq v0.20+
- Playwright, Jasmine/Karma for testing
- VS Code with extensions (ESLint, Prettier, etc.)

---

## Risk Mitigation

### Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **GitHub OAuth goes down** | Users can't sign in | Fallback: Email auth with OTP (Phase 2+); cache OAuth tokens |
| **Cosmos DB free tier insufficient** | Scaling costs spike | Monitor RU usage; optimize queries; upgrade to paid at 400 RU/s threshold |
| **Low initial user adoption** | Platform feels empty | Launch with internal team, friends, early community; build events as engagement hook |
| **Parental consent workflow complex** | High friction for <18 users | Simplified UX: Email guardian, 1-click verification; optional document upload |
| **Translation coverage <95%** | i18n non-negotiable violated | Hire community translators; offer contribution pathway; start with en-IE + pt-PT, add fr-FR later |
| **Security incident (credentials leaked)** | Trust destroyed | Weekly secret rotation; no secrets in logs; incident response runbook; disclosure timeline (72h) |
| **Performance degradation** | Users abandon platform | Load testing in Phase 2; optimize queries; cache metrics; CDN for static assets |
| **Admin workload overwhelming** | You burned out | Auto-approval for low-risk profiles; bulk operations in Phase 2+; recruit moderators |

---

## Success Metrics & Definition of Done

### MVP Launch Success Criteria

**User Adoption**:
- ✅ Launch with ≥10 beta testers by end of Phase 1
- ✅ 50+ approved profiles by end of Phase 2
- ✅ First 10 successful connections by mid-Phase 3
- ✅ 5+ help board posts + 10+ Karma points awarded by end of Phase 3
- ✅ ≥80% of users return within 7 days (retention signal)

**Quality & Reliability**:
- ✅ Website uptime ≥99.5%
- ✅ Page load times <3sec (Lighthouse ≥90)
- ✅ API response <1sec for all browse endpoints
- ✅ Zero security incidents (no leaked credentials)
- ✅ Unit test coverage ≥80% across all services
- ✅ E2E tests passing for all critical user journeys

**Governance & Compliance**:
- ✅ Zero Code of Conduct violations (or <3% of active users)
- ✅ Constitution Principle 7 (Brand Consistency): Logo + colors + typography consistent ✅
- ✅ Constitution Principle 8 (i18n & Accessibility): ≥95% locale coverage + WCAG 2.1 AA ✅
- ✅ Transparency: Public metrics dashboard live, updated weekly ✅

**Product Viability**:
- ✅ Clear path to Phase 2+ features (roadmap documented)
- ✅ User feedback collected (surveys, GitHub Issues)
- ✅ Community sentiment positive (Discord, GitHub Discussions)
- ✅ Sustainability plan (free tier roadmap, donation link, funding goals)

---

## What's Next After MVP Launch

### Immediate Post-Launch (Weeks 11-12)
- Gather user feedback
- Monitor platform health (uptime, errors, performance)
- Quick bug fixes
- Plan Phase 2+ features based on feedback

### Phase 2+ Future Features (Post-MVP)
- Advanced Karma system (decay, negative scores, leaderboards)
- Real-time messaging / in-app chat
- Job board with remote roles
- Mobile app (iOS/Android)
- Mentorship session scheduling UI
- Advanced community features (forums, wiki)

---

## Approval & Sign-Off

**Plan Status**: Draft  
**Ready for Implementation**: YES (once tasks.md generated and approved)

**Next Step**: Generate Phase 1 task breakdown (`tasks.md`) with:
- User stories decomposed into independent, testable tasks
- Task assignments and dependencies
- Estimated story points per task
- Definition of Done per task
- Acceptance criteria per task

---

**Plan Created By**: GitHub Copilot  
**Plan Date**: November 16, 2025  
**Constitution Version**: 1.3.0  
**Specification Version**: 1.0 (Draft)  
**MVP Scope**: Phases 1-4 (10 weeks, ~200 developer days)
