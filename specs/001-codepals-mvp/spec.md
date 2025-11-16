# Feature Specification: CodePals.io MVP Platform

**Feature Branch**: `001-codepals-mvp`  
**Created**: 2025-11-16  
**Status**: Draft  
**Input**: Stakeholder interviews and constitution alignment (CodePals.io Constitution v1.2.0)

---

## Product Vision & Mission

**Mission**: Foster a respectful, values‑driven developer growth network where people learn by building relationships, receiving mentorship and coaching, and sharing their development journey—grounded in transparency, security, privacy, and community support. CodePals.io enables context‑rich help requests and meaningful connections rather than transactional Q&A.

**Vision**: A trusted global developer community where people support people—creating opportunities for those who need them most, fostering genuine connections, and using technology and mentorship as means to improve lives and enable better futures.

---

## Phased Roadmap

### Phase 1: Foundation & Landing (Weeks 1-2)
**Goal**: Establish online presence and infrastructure; communicate vision to early community.

- **US-1.1**: Deploy Infrastructure & CI/CD Pipeline
- **US-1.2**: Create Landing Page with Brand Identity
- **US-1.3**: Setup Admin Dashboard & Moderation Tools

### Phase 2: Core Platform Features (Weeks 3-5)
**Goal**: Enable core mentorship matching and profile discovery.

- **US-2.1**: User Registration & Profile Creation
- **US-2.2**: Profile Browse & Discovery
- **US-2.3**: Connection Invites & Management

### Phase 3: Community Engagement (Weeks 6-8)
**Goal**: Build community participation and trust through engagement tools.

- **US-3.1**: Community Events System
- **US-3.2**: Help Board & Calls-to-Action
- **US-3.3**: Karma System & Recognition Badges

### Phase 4: Transparency & Analytics (Weeks 9-10)
**Goal**: Demonstrate platform health and build trust through public metrics.

- **US-4.1**: Public KPI Dashboard & Transparency

### Future Phases (Phase 2+)
- Advanced Karma system (decay, negative scores, leaderboards)
- Job board with remote roles
- Real-time chat / messaging platform
- Mentorship session scheduling UI
- Mobile app
- Localization / i18n

---

## Development Standards & Testing (NON-NEGOTIABLE)

### Testing Strategy

**Unit Testing (Jasmine/Karma)**:
- All new business logic MUST have unit test coverage
- Meaningful assertions for normal and edge cases
- Negative test cases for error paths
- Target: ≥80% code coverage for core modules

**Integration Testing**:
- API endpoints tested with realistic data flows
- Database interactions validated
- External service integrations (SendGrid, GitHub OAuth) mocked/stubbed

**End-to-End Testing (Playwright)**:
- All critical user journeys MUST have E2E tests
- Examples: user signup → profile creation → approval → discovery → connection; help board → voting → Karma; admin workflows
- Authentication flows (GitHub OAuth)
- Multilingual flows (locale switching, translated content)
- Cross-browser testing: Chrome, Firefox, Safari

**Accessibility Testing**:
- Automated WCAG 2.1 AA checks (axe, pa11y)
- Manual screen reader testing for critical paths
- Keyboard navigation validation

### Technology Stack

**Frontend & Static Site**: Statiq, Azure Static Web Apps  
**Backend**: Node.js serverless, Cosmos DB  
**Testing**: Jest/Vitest (unit), Playwright (E2E)  
**CI/CD**: GitHub Actions  
**Monitoring**: Azure Application Insights  
**Email**: SendGrid API  
**Auth**: GitHub OAuth

---

## User Scenarios & Testing *(mandatory)*

---

## PHASE 1: FOUNDATION & LANDING

### US-1.1: Deploy Infrastructure & CI/CD Pipeline (Priority: P0)

**Description**: Establish CodePals.io backend infrastructure, CI/CD pipeline, and monitoring so that subsequent features have a live, deployable platform.

**Why this priority**: Foundational blocker; all other features depend on having deployed infrastructure.

**Independent Test**: Website is live; GitHub OAuth functions; admin panel loads; database connectivity verified; email service operational; monitoring active.

**Acceptance Scenarios**:

1. **Given** deployment pipeline configured, **When** code is committed to main, **Then** static site builds via Statiq and deploys to Azure Static Web Apps.
2. **Given** backend API configured, **When** Node.js serverless function deployed, **Then** API endpoints respond (health check: `/api/health` returns 200 OK).
3. **Given** Cosmos DB free tier provisioned, **When** connection string configured, **Then** database queries execute successfully.
4. **Given** GitHub OAuth app created, **When** authentication flow tested, **Then** OAuth returns valid user ID and username.
5. **Given** SendGrid API key configured, **When** test email triggered, **Then** email delivery succeeds.
6. **Given** admin panel deployed, **When** admin (you) authenticates with GitHub, **Then** admin panel loads and displays dashboard.
7. **Given** website live, **When** monitoring configured, **Then** uptime checks and error logging active (Azure Application Insights).
8. **Given** infrastructure live, **When** security scanned, **Then** HTTPS enforced; secrets in environment variables only; no exposed credentials.

**Edge Cases**:
- API rate limiting configured to prevent brute force.
- Cosmos DB connection pooling optimized for free tier (400 RU/s).
- SendGrid free tier allows 100 emails/day; system gracefully handles quota exhaustion.

---

### US-1.2: Create Landing Page with Brand Identity (Priority: P0)

**Description**: Design and implement CodePals.io brand identity (logo, color palette, typography) and deploy a landing page that communicates mission and vision.

**Why this priority**: Brand identity and landing page are prerequisites for all subsequent website pages.

**Independent Test**: Logo finalized; color palette and typography defined; landing page deployed; all pages use consistent branding.

**Acceptance Scenarios**:

1. **Given** brand identity needed, **When** founder uses generative AI (DALL-E, Midjourney), **Then** logo concepts generated; best concept selected and finalized (PNG/SVG).
2. **Given** logo created, **When** brand guidelines documented, **Then** primary color, secondary colors, accents defined with WCAG AA+ contrast ratios.
3. **Given** branding defined, **When** typography selected, **Then** font pairing documented (headings, body); web-safe fallbacks confirmed.
4. **Given** brand identity complete, **When** landing page designed, **Then** mockup includes: hero section, mission statement, value proposition (3 benefits), CTA buttons, footer.
5. **Given** design mockup approved, **When** developer implements, **Then** landing page deployed with responsive design (mobile/tablet/desktop); <3 sec load time.
6. **Given** landing page live, **When** brand audit performed, **Then** logo consistent; colors and typography uniform across all pages.
7. **Given** design complete, **When** design system documented, **Then** component library created (buttons, cards, forms, scales) for handoff.

**Edge Cases**:
- Logo generator may require 2-3 iterations.
- Design system must include dark mode considerations for future phases.

---

### US-1.3: Setup Admin Dashboard & Moderation Tools (Priority: P0)

**Description**: Implement admin panel allowing you to manage platform moderation, approve/reject profiles, manage events, view audit logs, and monitor system health.

**Why this priority**: Admin tools essential for user approval workflow and platform governance from day one.

**Independent Test**: Admin can log in; pending profiles displayed; events manageable; reports visible; audit log shows all actions; system health metrics accessible.

**Acceptance Scenarios**:

1. **Given** admin (you) logged in with GitHub, **When** admin panel accessed, **Then** dashboard displays: pending profile count, next event, system health (uptime, errors).
2. **Given** admin panel loaded, **When** "Pending Profiles" section accessed, **Then** list shows profiles awaiting approval with: GitHub username, age status, submission date, approve/reject buttons.
3. **Given** profile displayed, **When** admin clicks "Approve", **Then** profile marked approved; user notified via email; profile becomes visible.
4. **Given** profile displayed, **When** admin clicks "Reject", **Then** admin prompted for reason; rejection email sent; user can resubmit.
5. **Given** admin panel loaded, **When** "Events" section accessed, **Then** admin can create event (title, description, date/time, Discord link), edit, set visibility, delete.
6. **Given** admin panel loaded, **When** "Reports" section accessed, **Then** list shows all user reports; admin can mark resolved, add notes.
7. **Given** admin panel loaded, **When** "Audit Log" section accessed, **Then** log displays: admin actions (approve, reject, block, delete) with timestamp, admin name, target user, reason.
8. **Given** admin panel loaded, **When** "System Health" section accessed, **Then** displays: API uptime (%), error rate, database query times, email delivery success rate.

**Edge Cases**:
- Audit trail retained for 90 days.
- Bulk operations deferred to Phase 2+.
- Two-factor authentication recommended but not required in MVP.

---

## PHASE 2: CORE PLATFORM FEATURES

### US-2.1: User Registration & Profile Creation (Priority: P1)

**Description**: Enable developers to register via GitHub OAuth and create a CodePals profile with mentorship seeking status, skills, experience level, and contact information.

**Why this priority**: Foundation for all user interactions.

**Independent Test**: User can sign in with GitHub, create profile, understand approval process, receive status updates.

**Acceptance Scenarios**:

1. **Given** user has GitHub account, **When** user clicks "Sign in with GitHub", **Then** user redirected to GitHub OAuth; authentication succeeds and returns to profile creation form.
2. **Given** user authenticated, **When** profile creation form displays, **Then** form shows: seeking status (mentor/mentee/both), skills (multi-select), experience level (beginner/intermediate/advanced), bio (500 char max), location (country/state/city with visibility toggle), social links (Discord, LinkedIn, Twitter, website), availability for pairing (yes/no), age confirmation.
3. **Given** user selects "under 18", **When** age confirmed, **Then** system prompts for parent/guardian email; parent receives verification email with secure link.
4. **Given** parent/guardian clicks verification link, **When** link valid, **Then** parental consent recorded; profile moves to "Pending Admin Review".
5. **Given** user is 18+, **When** profile submitted, **Then** profile immediately moves to "Pending Admin Review".
6. **Given** profile pending review, **When** user logs in, **Then** user sees "Your profile is under review" message; can view/edit submission.
7. **Given** admin approves profile, **When** approval email sent, **Then** user receives notification; profile becomes "Active" and visible.
8. **Given** admin rejects profile, **When** rejection email sent, **Then** user receives email with reason; can resubmit.
9. **Given** user submits profile, **When** form validated, **Then** no HTML injection; text sanitized; files validated (no files >5MB, only image/PDF).

**Edge Cases**:
- Parental consent process includes optional document upload (PDF/image); document encrypted.
- Users can edit pending submissions but not "Active" profiles until Phase 2+ profile-edit feature.
- GitHub account deletion results in profile marked "Orphaned"; admin option to deactivate or preserve per GDPR.

---

### US-2.2: Profile Browse & Discovery (Priority: P1)

**Description**: Enable users to browse and discover developer profiles filtered by seeking status, skills, and experience level.

**Why this priority**: Core engagement feature; demonstrates platform value.

**Independent Test**: User can view filtered profile list; see basic info; cannot see full contact details until connected; search/filter functions work.

**Acceptance Scenarios**:

1. **Given** user logged in with active profile, **When** user navigates to "Browse", **Then** list displays approved profiles (excluding own) in paginated view.
2. **Given** browse list visible, **When** user filters by "Seeking Mentors", **Then** only profiles with seeking="mentor" or seeking="both" shown.
3. **Given** browse list visible, **When** user filters by "Offering Mentorship", **Then** only profiles with seeking="mentee" or seeking="both" shown.
4. **Given** browse list visible, **When** user filters by skill tag (e.g., "React"), **Then** only profiles containing that skill shown.
5. **Given** browse list visible, **When** user filters by experience level, **Then** only profiles with matching level shown.
6. **Given** user viewing profile card, **Then** card displays: GitHub avatar, username, seeking status badge, 3-5 top skills, experience level.
7. **Given** user viewing profile card, **When** user clicks card, **Then** profile detail page opens with: full bio, location (if visible), social links preview, "Connect" button.
8. **Given** user views other user's profile, **When** users NOT yet connected, **Then** full contact details hidden; user sees "Connect to view contact info" message.
9. **Given** user viewing profile card, **When** user has NOT sent invite, **Then** "Connect" button visible; target user's profile NOT visible to target until connection accepted.

**Edge Cases**:
- Pagination limits to 20 profiles per page.
- Filtering combinations (React + Intermediate) work as AND logic.
- Location filtering not included in MVP.

---

### US-2.3: Connection Invites & Management (Priority: P1)

**Description**: Enable users to send connection invites to other profiles; receivers can accept, decline, or block; accepted connections grant bidirectional visibility.

**Why this priority**: Core trust/safety mechanism; prevents unsolicited contact.

**Independent Test**: User A sends invite to User B; User B receives notification; User B can accept/decline/block; after acceptance, both see full details.

**Acceptance Scenarios**:

1. **Given** user A viewing user B's profile, **When** user A clicks "Connect", **Then** invite sent; user A sees "Invite Sent" status.
2. **Given** invite sent, **When** user B logs in, **Then** user B sees notification "User A sent you a connection request" in dedicated "Invites" section.
3. **Given** user B views pending invite, **When** user B clicks "Accept", **Then** connection recorded; both see each other as "Connected"; bidirectional visibility enabled.
4. **Given** user B views pending invite, **When** user B clicks "Decline", **Then** invite removed; user A notified; connection NOT established.
5. **Given** user B views pending invite, **When** user B clicks "Block", **Then** user A blocked; user A cannot view user B's profile; user A cannot send further invites; block permanent.
6. **Given** users A and B connected, **When** either views other's profile, **Then** full profile displayed including contact details; "Message" button visible.
7. **Given** users connected, **When** user A clicks "Message", **Then** user A sees contact methods (email, Discord, LinkedIn) with links to external platforms; NO in-app messaging.
8. **Given** connected users, **When** user A clicks "Disconnect", **Then** connection removed; "Connected" status reverted.
9. **Given** user A blocks user B, **When** block active, **Then** user B cannot see user A's profile; user B cannot send invites.

**Edge Cases**:
- Duplicate invites prevented (if pending, cannot send another).
- If A blocks B, then B tries to invite A: invite rejected with message "This user has blocked connections."
- Bidirectional blocks (A blocks B, B blocks A) result in mutual block.

---

## PHASE 3: COMMUNITY ENGAGEMENT

### US-3.1: Community Events System (Priority: P2)

**Description**: Enable admin to create and schedule community events; display upcoming events on landing page and dedicated events page; events link to Discord.

**Why this priority**: Builds real-time community engagement; showcases platform momentum.

**Independent Test**: Admin can create events; upcoming events visible on landing page banner and events page; unauthenticated users can view events.

**Acceptance Scenarios**:

1. **Given** admin logged in, **When** admin navigates to "Events" section, **Then** form displays: event title, description, date/time (UTC), Discord link, visibility toggle.
2. **Given** admin completes event form, **When** admin clicks "Create", **Then** event saved; future events list updated.
3. **Given** event created, **When** event is next upcoming, **Then** landing page banner displays: event date, title, brief description, "Join on Discord" button.
4. **Given** event date passes, **When** daily cron job runs, **Then** event archived; next upcoming event promoted to banner.
5. **Given** user (authenticated or not) navigates to "Events" page, **When** page loads, **Then** lists all upcoming events in chronological order: title, date/time, description, Discord link.
6. **Given** user clicks "Join on Discord", **When** link clicked, **Then** user redirected to CodePals.io Discord server or event-specific channel.
7. **Given** admin edits event, **When** changes saved, **Then** event updated; users notified if event time changed (optional in MVP).
8. **Given** event resolved/past, **When** viewing events page, **Then** "Past Events" archive link visible; archive accessible for reference.

**Edge Cases**:
- Event time in UTC to avoid timezone confusion.
- Discord link can be full server link or event-specific channel invite.
- Recurring events not supported in MVP.

---

### US-3.2: Help Board & Calls-to-Action (Priority: P2)

**Description**: Create a help board where users post calls-to-action; other users vote (thumbs up) to recognize helpful responses and contribute to Karma system.

**Why this priority**: Lowers friction for users to find help/mentorship; builds community engagement.

**Independent Test**: User can browse help board posts filtered by type; user can create and publish post; posts display author Karma rating; voting system functions.

**Acceptance Scenarios**:

1. **Given** user with active profile logged in, **When** user navigates to "Help Board", **Then** page displays list of open help requests (posts) sorted by newest first.
2. **Given** help board visible, **When** posts load, **Then** each post displays: author profile (name, avatar), post type badge, title, description, required skills/topics, creation date, author's Karma rating.
3. **Given** help board visible, **When** user filters by post type, **Then** only posts of selected type shown (options: "Looking for Mentor", "Looking for Mentee", "Looking for Community", "Help Wanted", "Other").
4. **Given** help board visible, **When** user filters by skill tag, **Then** only posts mentioning that skill shown.
5. **Given** user viewing post, **When** user clicks "Help with this" or "Respond", **Then** modal displays external contact options (email, Discord, LinkedIn); user provides contact info; NO in-app messaging.
6. **Given** user wants to create post, **When** user clicks "Create Request", **Then** form displays: post type (dropdown), title, description, required skills (multi-select), optional date needed by.
7. **Given** user submits post, **When** form validated, **Then** post published immediately; appears on help board; author receives notification if others engage.
8. **Given** user viewing post, **When** user clicks thumbs up on a response/author, **Then** Karma points awarded to post author; Karma history updated; vote recorded (one vote per user per post).
9. **Given** post resolved, **When** post author marks "Resolved", **Then** post moved to archive; still viewable but filtered out of "Open Requests" by default.
10. **Given** admin reviews help board, **When** spam/CoC violation detected, **Then** admin can delete/hide post; post author notified if applicable.

**Edge Cases**:
- One vote per user per post.
- Thumbs down not supported in MVP (only positive Karma).
- Resolved posts remain visible for reference.

---

### US-3.3: Karma System & Recognition Badges (Priority: P2)

**Description**: Track community recognition through Karma points; calculate and award badges based on Karma thresholds; display on user profiles.

**Why this priority**: Recognizes community contributions; incentivizes helping behavior.

**Independent Test**: Voting on help board awards Karma; Karma visible on profiles; badges calculated correctly; badges displayed publicly.

**Acceptance Scenarios**:

1. **Given** user receives thumbs up on help board post, **When** vote recorded, **Then** Karma points awarded (1 point per thumbs up in MVP).
2. **Given** user receives Karma points, **When** Karma updated, **Then** Karma history records: date, action, points awarded, context (which post), who voted.
3. **Given** user profile viewed, **When** profile loads, **Then** Karma score visible next to username (e.g., "⭐ Karma: 45").
4. **Given** user reaches Karma threshold, **When** daily job runs, **Then** system calculates earned badges: "Helping Hand" (10+), "Community Champion" (50+), "Mentor Extraordinaire" (100+).
5. **Given** user earns badge, **When** badge awarded, **Then** badge added to user's list; user notified via email; badge becomes public on profile.
6. **Given** user profile viewed, **When** profile loads, **Then** earned badges displayed alongside Karma score with badge icon, name, description.
7. **Given** user profile viewed, **When** user has no badges yet, **Then** "No badges yet" message displayed; Karma score still visible.
8. **Given** Karma history requested, **When** history accessed, **Then** displays all transactions: date, action, points, context.

**Edge Cases**:
- Badges earned are permanent; no badge loss in MVP.
- Karma decay/loss not implemented in MVP.
- Badge artwork/icons managed by design system and stored as URLs.

---

## PHASE 4: TRANSPARENCY & ANALYTICS

### US-4.1: Public KPI Dashboard & Transparency (Priority: P2)

**Description**: Create and publish a public dashboard displaying CodePals.io platform metrics (signups, active users, mentor/mentee ratio, costs, funding status) to demonstrate growth and build trust.

**Why this priority**: Transparency is a core principle; builds trust; demonstrates sustainability.

**Independent Test**: Dashboard deployed and publicly accessible; metrics updated weekly; dashboard shows signup trends, user counts, cost breakdown, funding status.

**Acceptance Scenarios**:

1. **Given** user (authenticated or not) visits CodePals.io, **When** user clicks "Community Metrics" or "Transparency", **Then** user navigated to public KPI dashboard.
2. **Given** dashboard loads, **When** page initializes, **Then** displays: total registered users, monthly active users (30-day), new signups this month, mentor/mentee ratio (%), geographic distribution (countries), platform costs (free tier usage), donation/sponsor status, funding goals.
3. **Given** dashboard visible, **When** user hovers over chart, **Then** tooltip shows detailed breakdown (e.g., signup trend by week, country breakdown by %).
4. **Given** new user approved by admin, **When** approval timestamp recorded, **Then** KPI metrics updated within 24 hours (daily batch job).
5. **Given** dashboard visible, **When** user views "Cost Transparency" section, **Then** displays: monthly free tier usage, estimated costs if scaling, donation/sponsor link.
6. **Given** dashboard visible, **When** user views "Safety & Removals" section, **Then** displays: CoC violations resolved this month, blocks/removals (weekly count).
7. **Given** dashboard loads, **When** page refreshes weekly, **Then** metrics updated from Cosmos DB aggregated event logs.
8. **Given** dashboard deployed, **When** uptime monitored, **Then** ≥99.5% uptime target.

**Edge Cases**:
- Real-time metrics not required; weekly updates acceptable.
- PII not displayed; aggregated data only.
- Geographic distribution shows countries only (no city-level data).

---

## Requirements *(mandatory)*

### Functional Requirements by Phase

#### PHASE 1: Foundation & Landing

**Website Infrastructure & Deployment:**
- **FR-1.1**: System MUST deploy static website via Statiq to Azure Static Web Apps; CI/CD triggered on main branch commits.
- **FR-1.2**: System MUST serve landing page with sections: hero banner, mission statement, value proposition, events snapshot, CTA buttons ("Join Waitlist", "Learn More").
- **FR-1.3**: System MUST provide responsive design for mobile, tablet, desktop; all pages load in <3 seconds.
- **FR-1.4**: System MUST include navigation menu with links to: Landing, Events, Community Metrics, About, Code of Conduct, Privacy Policy.
- **FR-1.5**: System MUST include About page explaining CodePals.io mission, vision, principles, and how to contribute.

**Brand Identity & Design:**
- **FR-1.6**: System MUST display CodePals.io logo in header/footer on all pages per `.specify/memory/brand-identity.md` specifications.
- **FR-1.7**: System MUST enforce consistent brand color palette across all pages per brand identity guide; all color combinations MUST meet WCAG 2.1 AA contrast requirements.
- **FR-1.8**: System MUST use consistent typography per brand identity guide for headings, body, UI elements.
- **FR-1.9**: System MUST provide design system documentation (component library, spacing, color tokens, typography scales) aligned with brand identity guide for developer handoff.
- **FR-1.10**: Discord server customization (icon, banner, role colors, channel naming) MUST reflect brand identity per `.specify/memory/brand-identity.md` Discord Branding section.

**Backend Infrastructure:**
- **FR-1.10**: System MUST deploy Node.js serverless API backend on Azure Static Web Apps; API routes for auth, profiles, events, help board, metrics.
- **FR-1.11**: System MUST configure Cosmos DB (free tier: 400 RU/s) with connection pooling and query optimization.
- **FR-1.12**: System MUST enforce HTTPS only; no unencrypted traffic allowed.
- **FR-1.13**: System MUST implement error logging and monitoring (Azure Application Insights); errors logged centrally.
- **FR-1.14**: System MUST store secrets (API keys, connection strings) in Azure Static Web Apps environment variables only; NO secrets in code.
- **FR-1.15**: System MUST configure SendGrid API integration for transactional emails.
- **FR-1.16**: System MUST enforce rate limiting on API endpoints (prevent brute force, scraping).
- **FR-1.17**: System MUST implement CORS properly (allow CodePals.io frontend only).

**GitHub OAuth & Authentication:**
- **FR-1.18**: System MUST authenticate users via GitHub OAuth (GitHub Developers app configured with redirect URI).
- **FR-1.19**: System MUST store only GitHub user ID and username locally; NO passwords or GitHub tokens persisted.
- **FR-1.20**: System MUST enforce role-based access: normal users, admin (you).

**Internationalization (i18n) & Localization:**
- **FR-1.21**: System architecture MUST support internationalization from the outset; NO hardcoded user-facing strings permitted in code.
- **FR-1.22**: System MUST externalize all user-facing text into locale-specific translation files (JSON, YAML, or .properties format).
- **FR-1.23**: System MUST support initial locales: Portuguese (Portugal, pt-PT), English (Ireland, en-IE), French (France, fr-FR).
- **FR-1.24**: System SHOULD support Spanish (Spain, es-ES) as community-driven expansion; infrastructure MUST accommodate adding locales without code changes.
- **FR-1.25**: System MUST detect user locale preference via: (1) explicit user selection (stored in profile), (2) browser Accept-Language header, (3) fallback to en-IE default.
- **FR-1.26**: System MUST provide locale switcher UI component on all pages (dropdown or flag selector).
- **FR-1.27**: Translation files MUST follow namespaced key structure (e.g., `common.welcome`, `profile.bio_label`, `errors.required_field`) for maintainability.
- **FR-1.28**: System MUST gracefully handle missing translations; if key not found in selected locale, fallback to en-IE, then display key name as last resort.
- **FR-1.29**: Date, time, and number formatting MUST respect locale conventions (DD/MM/YYYY vs MM/DD/YYYY, 24h vs 12h time, comma vs period decimals).
- **FR-1.30**: Currency (if introduced in future phases) MUST display in locale-appropriate format.
- **FR-1.31**: System MUST provide translation contribution workflow: community members can submit translation PRs; translations reviewed and approved by native speakers or maintainers before merge.
- **FR-1.32**: Locale coverage MUST be tracked per Constitution governance metrics (≥95% core strings translated for supported locales).
- **FR-1.33**: Locale configuration MUST include: locale code, locale name, enabled status, text direction (LTR/RTL), native language name, and flag emoji for UI selector.
- **FR-1.34**: System MUST support Right-to-Left (RTL) text direction for future locale additions (e.g., Arabic, Hebrew); CSS MUST be structured to accommodate dir="rtl" attribute without requiring code changes.
- **FR-1.35**: Transactional emails (password resets, notifications, approvals) MUST be localized to user's preferred locale; email templates MUST be externalized alongside UI translations.
- **FR-1.36**: Email sender address and signature MUST respect locale (optional localized sender name, e.g., "CodePals.io Support" in French becomes "Support CodePals.io").

**Admin Dashboard & Moderation:**
- **FR-1.33**: System MUST provide admin panel to view pending profiles with approve/reject actions and reason input.
- **FR-1.34**: System MUST provide admin panel to create, edit, delete events.
- **FR-1.35**: System MUST provide admin panel to view all user reports, mark resolved, add notes.
- **FR-1.36**: System MUST provide admin panel to view audit log (all admin actions: timestamp, action, target user, reason).
- **FR-1.37**: System MUST provide admin panel to view system health metrics (API uptime, error rate, database queries, email delivery).
- **FR-1.38**: System MUST log all admin actions; audit trail retained for 90 days.
- **FR-1.39**: System MUST send admin notifications when new profiles submitted for review.

#### PHASE 2: Core Platform Features

**User Registration & Profile Creation:**
- **FR-2.1**: System MUST display profile creation form with fields: seeking, skills, experience level, bio (500 char max), location (with visibility toggle), social links, availability for pairing, age confirmation.
- **FR-2.2**: System MUST require age confirmation; if under 18, prompt for parent/guardian email.
- **FR-2.3**: System MUST send parental consent email to guardian with secure verification link; parent must click link to enable review.
- **FR-2.4**: System MUST allow optional document upload (PDF/image) for parental verification; documents encrypted in Cosmos DB.
- **FR-2.5**: System MUST mark profiles as "Pending Review" after submission; admin receives email notification.
- **FR-2.6**: System MUST validate all input (no HTML injection; sanitize text; reject files >5MB, non-image/PDF).
- **FR-2.7**: System MUST allow users to edit pending profiles before admin review.
- **FR-2.8**: System MUST send approval/rejection email to user; approved users' profiles become "Active" and visible.
- **FR-2.9**: System MUST allow profile author and admin to see pending profile details; MUST NOT show to other users until approved.

**Profile Browse & Discovery:**
- **FR-2.10**: System MUST display approved profiles only to other approved users; profile cards show: avatar, username, seeking status, top 3-5 skills, experience level.
- **FR-2.11**: System MUST allow filtering by seeking status (Seeking Mentors / Offering Mentorship).
- **FR-2.12**: System MUST allow filtering by skill tags (multi-select, AND logic).
- **FR-2.13**: System MUST allow filtering by experience level (beginner/intermediate/advanced).
- **FR-2.14**: System MUST NOT show full contact details until users are connected.
- **FR-2.15**: System MUST paginate profile browse results (20 profiles per page).
- **FR-2.16**: System MUST exclude self from browse list.

**Connection Invites & Management:**
- **FR-2.17**: System MUST allow users to send connection invites; target user receives notification.
- **FR-2.18**: System MUST prevent duplicate pending invites.
- **FR-2.19**: System MUST allow receiver to accept, decline, or block invite.
- **FR-2.20**: System MUST record accepted connections as bidirectional; both users see each other's full profiles.
- **FR-2.21**: System MUST display "Message" button on connected profile linking to external contact methods.
- **FR-2.22**: System MUST allow users to disconnect; connection reverted to "Not Connected".
- **FR-2.23**: System MUST enforce block permanence; blocked user cannot view profile or send invites; appeal via admin only.
- **FR-2.24**: System MUST hide mutual blocks.

#### PHASE 3: Community Engagement

**Events Management:**
- **FR-3.1**: System MUST maintain events table: title, description, date/time (UTC), Discord link, visible/hidden status, timestamps.
- **FR-3.2**: System MUST provide admin panel to create, edit, delete events with title, description, date/time, Discord link, visibility toggle.
- **FR-3.3**: System MUST display highlights banner on landing page featuring next upcoming event.
- **FR-3.4**: System MUST automatically update landing page banner daily; when event date passes, promote next upcoming event.
- **FR-3.5**: System MUST provide public "Events" page listing all upcoming events in chronological order.
- **FR-3.6**: System MUST allow unauthenticated users to view events page and banner (no login required).
- **FR-3.7**: System MUST archive past events; display "Past Events" archive link for reference.

**Help Board & Community Calls-to-Action:**
- **FR-3.8**: System MUST maintain help board posts table: author, post type, title, description, required skills, vote count, status, timestamps.
- **FR-3.9**: System MUST provide post type options: "Looking for Mentor", "Looking for Mentee", "Looking for Community", "Help Wanted", "Other".
- **FR-3.10**: System MUST allow filtering help board posts by post type and skill tags.
- **FR-3.11**: System MUST display on each post: author profile (name, avatar, Karma rating), post type badge, title, description, creation date, required skills.
- **FR-3.12**: System MUST allow users to respond to posts by providing external contact info; NO in-app messaging.
- **FR-3.13**: System MUST allow post authors to mark requests as "Resolved"; resolved posts moved to archive.
- **FR-3.14**: System MUST allow users to vote on posts (thumbs up only in MVP); votes contribute to Karma system.
- **FR-3.15**: System MUST restrict one vote per user per post.
- **FR-3.16**: System MUST allow admin to delete/hide posts for CoC violations or spam.

**Karma System & Badges:**
- **FR-3.17**: System MUST track Karma points per user (starting at 0); Karma incremented by community votes (thumbs up).
- **FR-3.18**: System MUST store Karma history: date, action, points awarded, context (post ID), who voted.
- **FR-3.19**: System MUST display Karma points on user profile (public, visible to all).
- **FR-3.20**: System MUST calculate and award badges based on Karma thresholds: "Helping Hand" (10+), "Community Champion" (50+), "Mentor Extraordinaire" (100+).
- **FR-3.21**: System MUST display earned badges on user profile with badge icon, name, description; badges permanent.
- **FR-3.22**: System MUST notify user (email) when badge awarded.

**Security, Privacy & Code of Conduct:**
- **FR-3.23**: System MUST display Code of Conduct and Privacy Policy on signup page; users must acknowledge before submitting profile.
- **FR-3.24**: System MUST provide "Report" button on profiles; reports go to admin with reason and user context.
- **FR-3.25**: System MUST allow admin to block users immediately if CoC violation confirmed; user notified with reason.
- **FR-3.26**: System MUST mark blocked users as "Removed" in transparency metrics (weekly count).
- **FR-3.27**: System MUST encrypt sensitive fields in Cosmos DB (social links, email, location).
- **FR-3.28**: System MUST log all user actions for analytics (signup, login, profile_edit, invite_sent, invite_accepted, connect, disconnect, block, report, vote).

#### PHASE 4: Transparency & Analytics

**Public KPI Dashboard:**
- **FR-4.1**: System MUST maintain events log with user actions (signup, login, invite_sent, invite_accepted, connect, vote, etc.).
- **FR-4.2**: System MUST aggregate events into KPI metrics: total registered, monthly active, signup rate, mentor/mentee ratio, geographic distribution, monthly churn.
- **FR-4.3**: System MUST generate public JSON API endpoint `/api/metrics` returning latest KPI snapshot (no auth required).
- **FR-4.4**: System MUST publish public dashboard visualizing KPI data: charts (signup trend, user growth), summary cards.
- **FR-4.5**: System MUST refresh metrics weekly via batch job; dashboard reflects latest data.
- **FR-4.6**: System MUST include transparency section on dashboard: platform costs, donation/sponsor status, funding goals.
- **FR-4.7**: System MUST display CoC enforcement metrics: violations resolved, blocks/removals count (weekly).
- **FR-4.8**: System MUST ensure dashboard uptime ≥99.5%.

---

## Key Entities

### Core User & Profile Entities
- **User**: GitHub ID (PK), GitHub username, avatar URL, registration date, last login, approval status, role (user/admin), Karma points, badges (array).
- **CodePals Profile**: User ID (FK), seeking (enum: mentor/mentee/both), skills (array), experience level (enum), bio (text, max 500 chars), location, location visibility toggle, social links (Discord, LinkedIn, Twitter, website), availability for pairing (boolean), age verified, parental consent status, documents (array of blob refs), created/updated timestamps.
- **ParentalConsent**: User ID (FK), guardian email, verification token, consent verified, consent timestamp, document URLs (array).

### Connection & Relationship Entities
- **Connection**: User A ID (FK), User B ID (FK), status (enum: pending/accepted/declined/blocked), created/updated timestamps.

### Community & Engagement Entities
- **Event**: Title, description, date/time (UTC), Discord link, visible (boolean), admin who created (User ID FK), created/updated timestamps.
- **HelpBoardPost**: ID (PK), author User ID (FK), post type (enum), title, description, required skills (array), vote count, status (enum: open/resolved/deleted), created/updated timestamps.
- **HelpBoardVote**: User ID (FK), post ID (FK), vote (up), Karma awarded, timestamp.

### Karma & Recognition Entities
- **Karma**: User ID (PK), total points, history (array of transactions: date, action, points, context, from user).
- **Badge**: ID (PK), badge name, Karma threshold, icon URL, description, created timestamp.
- **UserBadge**: User ID (FK), badge ID (FK), awarded date, notification sent (boolean).

### Analytics & Admin Entities
- **EventLog**: User ID (FK), event type (enum: signup/login/profile_edit/invite_sent/invite_accepted/connect/disconnect/block/report/vote), timestamp, metadata (optional).
- **Report**: Reporter User ID (FK), reported User ID (FK), reason (text), status (enum: open/resolved), admin notes, created/resolved timestamps.
- **AdminAuditLog**: Admin ID (FK), action (enum: approve/reject/block/delete), target User ID (FK), reason, timestamp.

### Internationalization Entities
- **Locale**: Locale code (PK, e.g., pt-PT, en-IE, fr-FR, es-ES), locale name (e.g., "Português (Portugal)"), enabled (boolean), text direction (enum: LTR/RTL), native language name, flag emoji, coverage percentage (calculated from translation completeness).
- **Translation**: Locale code (FK), namespace (e.g., "common", "profile", "errors", "emails"), key (e.g., "welcome", "bio_label"), value (translated text), email_template (boolean, true if this is email content), last updated, contributor (optional User ID FK).
- **UserLocalePreference**: User ID (FK), preferred locale code (FK), auto-detected locale (from browser), created/updated timestamps.

---

## Success Criteria *(mandatory)*

### Phase 1: Foundation & Landing
- **SC-1.1**: Infrastructure deployed and live; uptime ≥99.5%.
- **SC-1.2**: Landing page loads in <3 seconds on 4G connection (throttled).
- **SC-1.3**: Brand identity finalized; logo, colors, typography consistent across all pages.
- **SC-1.4**: Admin dashboard functional; admin can approve/reject profiles, manage events, view audit logs.
- **SC-1.5**: Zero security incidents; HTTPS enforced; no exposed credentials.

### Phase 2: Core Platform Features
- **SC-2.1**: First 50 user profiles approved within 2 weeks of launch.
- **SC-2.2**: New users complete profile onboarding in <5 minutes.
- **SC-2.3**: First 10 successful connections (mutual invites accepted) within 4 weeks.
- **SC-2.4**: Profile browse filtering works correctly; search results fast (<1 sec).

### Phase 3: Community Engagement
- **SC-3.1**: First 5 help board posts within 4 weeks.
- **SC-3.2**: First 10+ Karma points awarded within 4 weeks.
- **SC-3.3**: First event held with ≥5 Discord attendees.
- **SC-3.4**: ≥80% of users return within 7 days of first login (retention signal).

### Phase 4: Transparency & Analytics
- **SC-4.1**: KPI dashboard deployed and publicly accessible; uptime ≥99.5%.
- **SC-4.2**: Metrics updated weekly; no manual intervention required after setup.

### Overall Community Health
- **SC-Overall.1**: Zero Code of Conduct violations in first month (or <3% of active users if growth rapid).
- **SC-Overall.2**: Community sentiment positive; platform perceived as trustworthy, inclusive, safe.

---

## Assumptions

1. GitHub OAuth will remain free and available throughout MVP and beyond.
2. Azure Static Web Apps, Cosmos DB, and SendGrid free tiers will remain sufficient for MVP traffic (<5K requests/day).
3. Statiq can efficiently generate static site; frontend doesn't require heavy client-side framework initially.
4. Users will honestly declare age and parental consent status; manual admin review provides verification backstop.
5. Generative AI tools (DALL-E, Midjourney, etc.) available for logo generation; final logo deliverable in SVG/PNG.
6. Community will value Karma system as intrinsic motivation; no monetary rewards tied to Karma in MVP.
7. Initial user growth will be gradual (organic, word-of-mouth); no paid acquisition in Phase 1.
8. One vote per user per post is sufficient to prevent Karma manipulation in MVP.

---

## Out of Scope (Future Phases - Phase 2+)

### Features Deferred to Phase 2+
- **Profile Management**: Custom profile fields (profile pictures, resume uploads, portfolio links), profile editing by users, profile search by location.
- **Messaging**: Real-time in-app chat, message history, notification preferences.
- **Mentorship Tools**: Session scheduling and tracking UI, session notes, goal tracking, progress milestones.
- **Karma System**: Decay over time, negative Karma, leaderboards, Karma appeals/disputes, advanced abuse detection.
- **Events**: RSVP system, attendee tracking, recurring events, event reminders (email/SMS), calendar integration.
- **Job Board**: Remote role postings, remote-only filters, salary transparency, application tracking, employer profiles.
- **Community Features**: Badges beyond Karma-based, discussion forums, wiki/documentation sections, mentorship matching algorithm.
- **Payments**: Scholarship fund processing, donation processing, sponsored features, payment infrastructure.
- **Mobile**: Native mobile apps (iOS, Android), PWA optimization.
- **Advanced Analytics**: Heatmaps, funnel analysis, cohort analysis, ML-based recommendations.

---

## Notes

- **Transparency is a core principle**, not just a feature: All governance, costs, removals, and metrics published publicly.
- **Privacy by default**: Users control all visibility; locations hidden unless explicitly enabled.
- **Trust-building is priority**: Approval workflow, CoC enforcement, secure external messaging.
- **Inclusivity**: No barriers to signup (GitHub free for everyone); documentation open to all; contribution via GitHub PRs.
- **Scalability mindset**: Architecture (static + serverless) scales to 10x users without cost increase initially.
- **Phased delivery**: Each phase is independently valuable; can launch and gather feedback before proceeding to next phase.
- **Admin workload**: You (founder) can manage <500 users with current admin tools; Phase 2+ may require bulk operations and automation.
