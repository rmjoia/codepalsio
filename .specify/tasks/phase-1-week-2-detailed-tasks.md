# Phase 1, Week 2: Landing Page & Admin Dashboard

**Status**: Not Started  
**Target Start**: Week 2 (after Week 1 infrastructure complete)  
**Duration**: 5 working days  
**Total Effort Estimate**: ~7-8 developer days

---

## Overview

Week 2 focuses on brand implementation, landing page creation, admin dashboard, email templates, and i18n infrastructure. By end of Week 2, the website goes live with professional branding and admin tools are ready for profile moderation.

**Week 2 Success**: 
- Live website with brand identity
- Admin dashboard functional
- Email templates configured
- i18n infrastructure supporting 4 locales

---

# Task 1.2.1: Brand Implementation

**Priority**: P0 (Blocker - all UI depends on brand)  
**Assigned To**: Designer + Frontend Lead  
**Duration**: 2 days  
**Effort**: 1.5 developer days

**Description**: Import brand identity assets (logo, colors, typography) and create design system components.

**Acceptance Criteria**:

*Brand Assets*:
- [ ] Logo files imported: Concept 1 (Connected Hands & Code)
  - [ ] SVG version (scalable, for web)
  - [ ] PNG 1024px (for print/large displays)
  - [ ] PNG 256px (for social profiles)
  - [ ] PNG 64px (for smaller contexts)
  - [ ] PNG 16px favicon
- [ ] Color palette defined and validated:
  - [ ] Primary: Teal #00BCD4 (RGB: 0, 188, 212)
  - [ ] Accent: Gold #FFB700 (RGB: 255, 183, 0)
  - [ ] Secondary colors for UI (buttons, hover states)
  - [ ] All colors meet WCAG 2.1 AA contrast requirements (≥4.5:1 for text)
- [ ] Typography selected:
  - [ ] Heading font (1 choice)
  - [ ] Body text font (1 choice)
  - [ ] Monospace font for code examples (1 choice)
  - [ ] Font pairing documented
  - [ ] Web-safe fallbacks specified
  - [ ] Font licenses verified (must be open or commercially licensed)

*Design System Components* (Statiq templates):
- [ ] Button component: Default, hover, active, disabled states
- [ ] Card component: Title, description, footer, shadow effects
- [ ] Form inputs: Text, textarea, checkbox, radio, select, color variations
- [ ] Modal/Dialog: Header, body, footer, close button
- [ ] Navigation: Header nav bar with logo, links, mobile hamburger
- [ ] Footer: Links, copyright, social media icons
- [ ] Badges: Status badges (pending, approved, rejected)
- [ ] Typography scale: h1-h6, body text, captions
- [ ] Spacing scale: Consistent padding/margin tokens
- [ ] Icon system: 20+ essential icons (+, -, search, menu, close, etc.)

*Styling*:
- [ ] CSS variables defined for all colors, fonts, spacing
- [ ] Dark mode considerations documented (for future phases)
- [ ] Responsive breakpoints: Mobile (320px), Tablet (768px), Desktop (1024px), Large (1440px)
- [ ] All components responsive and tested at each breakpoint

*Accessibility (WCAG 2.1 AA)*:
- [ ] Color contrast verified: All text ≥4.5:1, UI components ≥3:1
- [ ] Focus indicators visible on all interactive elements (min 2px outline)
- [ ] Keyboard navigation works for all components
- [ ] No reliance on color alone for information (icons + text)
- [ ] Touch targets ≥48px minimum

**Testing Strategy**:

*Visual Testing*:
- [ ] Brand consistency audit: All components use correct logo, colors, typography
- [ ] Component library screenshots: Documented each component in all states
- [ ] Responsive testing: All components render correctly at each breakpoint
- [ ] Cross-browser: Chrome, Firefox, Safari, Edge

*Accessibility Testing*:
- [ ] Automated: axe DevTools on all components
- [ ] Manual: Color contrast verified with WebAIM Contrast Checker
- [ ] Keyboard: Tab through all interactive elements, focus indicators visible
- [ ] Screen reader: NVDA/JAWS test sample components

**Dependencies**: None (can start in parallel with Week 1 tasks)

**Blockers**: None

**Related Files**:
- `frontend/styles/variables.css` - CSS custom properties for brand
- `frontend/styles/components/` - All component stylesheets
- `frontend/styles/responsive.css` - Responsive grid system
- `docs/BRAND_GUIDELINES.md` - Brand identity documentation
- `docs/DESIGN_SYSTEM.md` - Component library documentation

---

# Task 1.2.2: Landing Page (Statiq Static Site)

**Priority**: P0  
**Assigned To**: Frontend Lead + Designer  
**Duration**: 2 days  
**Effort**: 2 developer days

**Description**: Create responsive landing page with hero, mission statement, value proposition, events banner, CTAs.

**Acceptance Criteria**:

*Page Structure*:
- [ ] Hero section:
  - [ ] Logo centered or left-aligned
  - [ ] Headline: "A trusted global developer community where people support people"
  - [ ] Subheadline: "Mentorship, connections, and opportunities"
  - [ ] Background: Gradient using Teal + Gold or subtle pattern
  - [ ] CTA button: "Sign In with GitHub" (primary action)
- [ ] Mission statement section:
  - [ ] Vision statement displayed prominently
  - [ ] 3 core value cards:
    - [ ] "Mentorship Matching" + icon + description
    - [ ] "Real Connections" + icon + description
    - [ ] "Transparency First" + icon + description
  - [ ] Cards use design system styling
- [ ] Events banner:
  - [ ] Shows next upcoming event (title, date, "Join on Discord" button)
  - [ ] Updated daily by cron job (if event passed, next event shown)
  - [ ] Eye-catching styling (contrasting color, clear typography)
- [ ] CTA section:
  - [ ] "Ready to find your code pal?" headline
  - [ ] Two CTAs: "Sign In" and "Learn More" (About page)
- [ ] Footer:
  - [ ] Links: About, Events, Metrics (Week 10), Code of Conduct, Privacy, GitHub repo
  - [ ] Copyright notice
  - [ ] Social media icons (Twitter, Discord, GitHub)
  - [ ] Logo in footer

*Responsive Design*:
- [ ] Mobile (320px): Single column, touch-friendly buttons, hamburger menu
- [ ] Tablet (768px): 2 columns for cards, improved spacing
- [ ] Desktop (1024px+): Full-width layout with optimized spacing

*Performance*:
- [ ] Page load time: <3 seconds (target Lighthouse ≥90)
- [ ] Image optimization: Logo PNG compressed, no oversized images
- [ ] CSS minified: No unused CSS
- [ ] JavaScript minimal: Statiq generates static HTML (no build tools needed)
- [ ] Fonts: Web fonts loaded efficiently (google-fonts, preconnect)

*SEO & Meta*:
- [ ] Page title: "CodePals.io - Mentorship Platform for Developers"
- [ ] Meta description: "Connect with mentors, grow your skills, build genuine relationships. CodePals.io enables meaningful developer connections."
- [ ] Open Graph tags: og:title, og:description, og:image (logo), og:url
- [ ] Twitter card: twitter:card, twitter:title, twitter:description, twitter:image

**Testing Strategy**:

*Functional Testing*:
- [ ] All links work and go to correct pages (About, Events, CoC, Privacy, GitHub, Discord)
- [ ] GitHub login button redirects to OAuth flow (tested in local dev)
- [ ] Events banner displays correctly (test with mock event data)

*Performance Testing*:
- [ ] Lighthouse audit: ≥90 score on desktop and mobile
- [ ] <3 second load time verified (Chrome DevTools)
- [ ] Image optimization checked (no oversized images)

*Responsive Testing*:
- [ ] Mobile (iPhone SE 375px): All content visible, no horizontal scroll
- [ ] Tablet (iPad 768px): Layout adjusts appropriately
- [ ] Desktop (1440px): Full-width layout looks balanced

*Accessibility Testing (WCAG 2.1 AA)*:
- [ ] Color contrast: All text ≥4.5:1
- [ ] Focus indicators: Tab through page, all interactive elements highlighted
- [ ] Keyboard navigation: All CTAs reachable and clickable via keyboard
- [ ] Screen reader: Headings announced correctly, link text descriptive
- [ ] Alt text: All icons/images have descriptive alt text

*Cross-browser Testing*:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

**Dependencies**: 
- Task 1.2.1 (Brand implementation - design system ready)
- Task 1.1.1 (Infrastructure for hosting)

**Blockers**: None

**Related Files**:
- `frontend/pages/index.html` (or `index.md` for Statiq)
- `frontend/layouts/landing.html`
- `frontend/images/hero-background.png`
- `frontend/images/value-icons/` (mentorship, connections, transparency)

---

# Task 1.2.3: About Page

**Priority**: P1  
**Assigned To**: Frontend Lead  
**Duration**: 1 day  
**Effort**: 0.5 developer days

**Description**: Create About page with mission, vision, 8 core principles, and contribution guidelines.

**Acceptance Criteria**:

*Page Content*:
- [ ] Page title: "About CodePals"
- [ ] Navigation link from landing page and footer
- [ ] Sections:
  - [ ] "Our Mission" - Mission statement from spec
  - [ ] "Our Vision" - Vision statement from spec
  - [ ] "Core Principles" - Display all 8 principles from Constitution v1.3.0:
    - [ ] 1. Open Source & Transparency
    - [ ] 2. Code Quality
    - [ ] 3. Security (NON-NEGOTIABLE)
    - [ ] 4. Performance
    - [ ] 5. Privacy (NON-NEGOTIABLE)
    - [ ] 6. Community & Governance
    - [ ] 7. Brand Consistency (NON-NEGOTIABLE)
    - [ ] 8. Internationalization & Accessibility (NON-NEGOTIABLE)
  - [ ] "How to Contribute" - Fork repo, PR workflow, CoC link
  - [ ] "Code of Conduct" - Link to CoC document
  - [ ] "Contact Us" - Email link or contact form

*Links*:
- [ ] Constitution document: `./.specify/memory/constitution.md` or hosted link
- [ ] Code of Conduct: `./CODE_OF_CONDUCT.md`
- [ ] GitHub repo: `https://github.com/rmjoia/codepalsio`
- [ ] Privacy Policy: `./PRIVACY.md`

*Styling*:
- [ ] Uses design system components
- [ ] Responsive layout (mobile, tablet, desktop)
- [ ] Consistent with landing page branding

**Testing Strategy**:

*Functional Testing*:
- [ ] All links work and open correct pages/documents
- [ ] Page loads without errors

*Accessibility Testing (WCAG 2.1 AA)*:
- [ ] Heading hierarchy correct (h1 page title, h2 sections, h3 principles)
- [ ] Color contrast verified
- [ ] Keyboard navigation works
- [ ] Screen reader tested

**Dependencies**: 
- Task 1.2.1 (Brand/design system)

**Blockers**: None

**Related Files**:
- `frontend/pages/about.html`
- `frontend/layouts/content.html`

---

# Task 1.2.4: Admin Dashboard (Statiq Frontend + Node.js Backend)

**Priority**: P0  
**Assigned To**: Backend Lead + Frontend Lead  
**Duration**: 2 days  
**Effort**: 2 developer days

**Description**: Build admin panel for profile approval workflow, event management, reports, audit logs, system health.

**Acceptance Criteria**:

*Authentication*:
- [ ] Admin login via GitHub OAuth
- [ ] Admin role verified in User table (admin_role boolean or enum)
- [ ] Only admins can access `/admin` routes
- [ ] Logout endpoint clears session

*Dashboard Overview Section*:
- [ ] Displays:
  - [ ] Pending profiles count
  - [ ] Next upcoming event (date, title)
  - [ ] System health: API uptime %, error rate
  - [ ] Last updated timestamp

*Pending Profiles Section*:
- [ ] List all profiles with status = "pending_review"
- [ ] Table columns:
  - [ ] GitHub username / avatar
  - [ ] Age status ("18+", "<18 pending consent", "<18 consent verified")
  - [ ] Submission date
  - [ ] Approve button (green)
  - [ ] Reject button (red)
- [ ] Approve flow:
  - [ ] Click Approve → confirmation dialog
  - [ ] Confirmation → Call `POST /api/profiles/{id}/approve`
  - [ ] Profile status → "approved"
  - [ ] Approval email sent to user
  - [ ] Audit log entry created
  - [ ] Profile removed from pending list
- [ ] Reject flow:
  - [ ] Click Reject → text input for rejection reason
  - [ ] Submit reason → Call `POST /api/profiles/{id}/reject` with reason
  - [ ] Profile status → "rejected"
  - [ ] Rejection email sent with reason
  - [ ] Audit log entry created
- [ ] Pagination: 20 profiles per page

*Events Section*:
- [ ] List all events (upcoming and past)
- [ ] Create new event form:
  - [ ] Title input
  - [ ] Description textarea
  - [ ] Date/time picker (UTC)
  - [ ] Discord link input
  - [ ] Visibility toggle (public/private)
  - [ ] Create button
- [ ] Edit event: Click event → form pre-fills → save changes
- [ ] Delete event: Confirmation dialog → delete
- [ ] Audit log entries for all event actions

*Reports Section*:
- [ ] List all user reports (Code of Conduct violations)
- [ ] Columns: Reporter, Reported user, violation type, status (open/resolved), action
- [ ] Mark resolved: Click "Resolve" → report status changed
- [ ] Add notes: Text field to add admin notes
- [ ] Audit log entries

*Audit Log Section*:
- [ ] List all admin actions chronologically (newest first)
- [ ] Columns: Admin name, action (approve/reject/block/delete), target user, timestamp, reason (if applicable)
- [ ] Filter by action type (approve, reject, block, delete)
- [ ] Pagination: 50 entries per page

*System Health Section*:
- [ ] Displays metrics (pulled from Azure Application Insights):
  - [ ] API uptime % (target ≥99.5%)
  - [ ] Error rate (%) over last 24h
  - [ ] Database query times (avg, p95, p99)
  - [ ] Email delivery success rate %
  - [ ] Current RU/s consumption (Cosmos DB)
- [ ] Visual indicators: Green (healthy), yellow (warning), red (critical)
- [ ] Last refresh timestamp + manual refresh button

*Styling & UX*:
- [ ] Uses design system components
- [ ] Responsive: Works on desktop (assumed admin use), mobile fallback
- [ ] Clear section headers and navigation
- [ ] Consistent color coding (green = approve, red = reject, yellow = warning)

**Testing Strategy**:

*Functional Testing*:
- [ ] Admin login works (GitHub OAuth)
- [ ] Non-admin users cannot access `/admin` (401/403 error)
- [ ] Pending profiles display correctly
- [ ] Approve: Click approve → profile marked approved → email sent → audit log entry
- [ ] Reject: Click reject → rejection reason captured → email sent → profile rejectable
- [ ] Events: Create → list updated; Edit → changes persisted; Delete → removed
- [ ] Audit log: All actions recorded

*Integration Testing*:
- [ ] Cosmos DB queries for pending profiles work
- [ ] Email service integration (mock/real SendGrid)
- [ ] Audit log inserts to DB
- [ ] System health metrics pulled from Azure App Insights

*E2E Testing (Playwright)*:
- [ ] Admin login flow
- [ ] Approve profile workflow (happy path + error cases)
- [ ] Reject profile with reason
- [ ] Create event
- [ ] View audit log

**Dependencies**: 
- Task 1.1.2 (GitHub OAuth configured)
- Task 1.1.4 (Backend API skeleton)
- Task 1.2.1 (Design system for UI)
- Task 1.2.5 (Email templates)

**Blockers**: None

**Related Files**:
- `frontend/pages/admin/index.html` (dashboard overview)
- `frontend/pages/admin/profiles.html` (pending profiles)
- `frontend/pages/admin/events.html` (events management)
- `frontend/pages/admin/reports.html` (user reports)
- `frontend/pages/admin/audit-log.html` (audit log viewer)
- `frontend/pages/admin/system-health.html` (system metrics)
- `backend/src/admin/profiles.js` (approve/reject endpoints)
- `backend/src/admin/events.js` (event CRUD endpoints)
- `backend/tests/admin.test.js` (admin workflow tests)
- `backend/tests/e2e/admin-dashboard.spec.js` (E2E tests)

---

# Task 1.2.5: Email Templates (SendGrid)

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 1 day  
**Effort**: 0.5 developer days

**Description**: Create branded email templates for profile approval, rejection, parental consent, and admin notifications.

**Acceptance Criteria**:

*Email Template 1: Profile Approval*:
- [ ] Subject: "Your CodePals profile has been approved! 🎉"
- [ ] Recipient: User
- [ ] Content:
  - [ ] Personalized greeting: "Hi [username]"
  - [ ] Approval message: "Your profile is now active and visible to other developers"
  - [ ] Call-to-action button: "Browse Mentors" (link to `/browse`)
  - [ ] Secondary message: "Start making connections and find your code pal"
- [ ] Footer: CodePals logo, copyright, unsubscribe link
- [ ] Branding: Teal + Gold colors, consistent font

*Email Template 2: Profile Rejection*:
- [ ] Subject: "CodePals profile - Action needed"
- [ ] Recipient: User
- [ ] Content:
  - [ ] Personalized greeting: "Hi [username]"
  - [ ] Rejection message: "Thank you for applying to CodePals. Unfortunately, we couldn't approve your profile at this time."
  - [ ] Rejection reason: "[Admin provided reason]"
  - [ ] Next steps: "You can edit and resubmit your profile. Here are some tips: [suggestions based on reason]"
  - [ ] Call-to-action: "Resubmit your profile"
  - [ ] Support: "Questions? Contact us at support@codepals.io"
- [ ] Footer: Logo, copyright, contact
- [ ] Branding: Professional, empathetic tone

*Email Template 3: Parental Consent Verification*:
- [ ] Subject: "CodePals - Parent/Guardian Verification Required"
- [ ] Recipient: Parent/guardian email
- [ ] Content:
  - [ ] Greeting: "Dear Parent/Guardian"
  - [ ] Explanation: "[Child name] is registering for CodePals, a mentorship platform connecting developers..."
  - [ ] CodePals mission: Link to About page, brief description
  - [ ] Safety statement: "Privacy and security are our top priority. [Privacy link]"
  - [ ] Verification button: "Verify Consent" (link with token: `https://codepals.io/consent/verify?token=...`)
  - [ ] Token expiration: "This link expires in 7 days"
  - [ ] Optional: Document upload link
- [ ] Footer: Logo, contact email, privacy link
- [ ] Branding: Trustworthy, professional tone

*Email Template 4: Admin Notification - New Profile Pending Review*:
- [ ] Subject: "New profile pending review - [username]"
- [ ] Recipient: Admin (you)
- [ ] Content:
  - [ ] New submission notification: "[username] submitted a profile for review"
  - [ ] Profile summary:
    - [ ] Seeking status: Mentor/Mentee/Both
    - [ ] Skills: [List of skills]
    - [ ] Age status: [18+ or <18 pending consent / verified]
  - [ ] Call-to-action: "Review profile" (link to admin dashboard)
  - [ ] Submission timestamp
- [ ] Footer: Logo, contact
- [ ] Branding: Professional, actionable

*Email Template 5: Badge Award Notification*:
- [ ] Subject: "🎉 You've earned the '[Badge Name]' badge!"
- [ ] Recipient: User
- [ ] Content:
  - [ ] Greeting: "Hi [username]"
  - [ ] Badge announcement: "Congratulations! You've been awarded the [Badge Name] badge"
  - [ ] Badge icon: Embedded image
  - [ ] Description: "[Badge description and why earned]"
  - [ ] Encouragement: "Keep helping the community and earning more badges!"
  - [ ] Call-to-action: "View your profile" (link to `/profile`)
- [ ] Footer: Logo, copyright
- [ ] Branding: Celebratory, positive tone

*Template Technical Requirements*:
- [ ] All strings externalized for i18n (no hardcoded text)
- [ ] HTML + plain text versions (fallback for email clients)
- [ ] Responsive design: Works on mobile, tablet, desktop
- [ ] Logo images: Hosted on CDN or embedded (base64) - NO large file sizes
- [ ] Colors: Use Teal #00BCD4, Gold #FFB700, accent colors
- [ ] Font fallbacks: System fonts (Arial, Helvetica, sans-serif)
- [ ] Links: Https only, track opens/clicks in SendGrid

*SendGrid Configuration*:
- [ ] Create template for each email type in SendGrid dashboard
- [ ] Store template IDs in environment variables:
  - [ ] `SENDGRID_TEMPLATE_APPROVAL`
  - [ ] `SENDGRID_TEMPLATE_REJECTION`
  - [ ] `SENDGRID_TEMPLATE_CONSENT`
  - [ ] `SENDGRID_TEMPLATE_ADMIN_NOTIFICATION`
  - [ ] `SENDGRID_TEMPLATE_BADGE_AWARD`
- [ ] Test emails: Send to self, verify rendering and links
- [ ] Unsubscribe link: Configured in SendGrid (legal requirement)

**Testing Strategy**:

*Functional Testing*:
- [ ] Each template renders without errors in SendGrid
- [ ] All template variables populated correctly (no {{ undefined }} placeholders)
- [ ] All links valid and traceable

*Email Client Testing*:
- [ ] Desktop: Outlook, Gmail, Apple Mail
- [ ] Mobile: Gmail app, Apple Mail app
- [ ] Web: Gmail, Outlook.com, Yahoo

*Localization Testing*:
- [ ] Templates work with i18n strings for all 4 locales (en-IE, pt-PT, fr-FR, es-ES)
- [ ] Date/time formatting per locale

**Dependencies**: 
- Task 1.1.1 (SendGrid API configured)
- Task 1.2.1 (Brand identity - colors, fonts)
- Task 1.2.6 (i18n setup for translation strings)

**Blockers**: None

**Related Files**:
- `backend/src/email/templates/approval.html`
- `backend/src/email/templates/rejection.html`
- `backend/src/email/templates/consent.html`
- `backend/src/email/templates/admin-notification.html`
- `backend/src/email/templates/badge-award.html`
- `backend/src/email/sendEmail.js` (Email sending logic with template IDs)
- `backend/tests/email.test.js` (Unit tests for email rendering)

---

# Task 1.2.6: i18n Infrastructure Setup

**Priority**: P1  
**Assigned To**: Backend Lead + Frontend Lead  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Setup internationalization infrastructure supporting 4 locales with translation files, locale detection, and date/time formatting.

**Acceptance Criteria**:

*Translation File Structure*:
- [ ] Directory created: `i18n/`
- [ ] Locale subdirectories:
  - [ ] `i18n/en-IE/` (English - Ireland)
  - [ ] `i18n/pt-PT/` (Portuguese - Portugal)
  - [ ] `i18n/fr-FR/` (French - France)
  - [ ] `i18n/es-ES/` (Spanish - Spain)
- [ ] Namespace JSON files in each locale:
  - [ ] `common.json` - Generic UI strings (welcome, logout, menu, buttons)
  - [ ] `profile.json` - Profile form labels, seeking options, skills
  - [ ] `errors.json` - Validation messages, API errors
  - [ ] `emails.json` - Email template strings (subject, greeting, etc.)
  - [ ] `badges.json` - Badge names and descriptions

*Example Structure*:
```
i18n/
├── en-IE/
│   ├── common.json
│   ├── profile.json
│   ├── errors.json
│   ├── emails.json
│   └── badges.json
├── pt-PT/
│   └── [same files]
├── fr-FR/
│   └── [same files]
└── es-ES/
    └── [same files]
```

*Translation Coverage*:
- [ ] en-IE: 100% (source language, all strings present)
- [ ] pt-PT: ≥95% coverage (can leave some strings in English if unavailable)
- [ ] fr-FR: ≥95% coverage
- [ ] es-ES: ≥95% coverage
- [ ] Coverage tracked in `Locale` table in Cosmos DB

*Core Strings to Translate* (sample from `common.json`):
```json
{
  "welcome": "Welcome to CodePals",
  "sign_in": "Sign In with GitHub",
  "sign_out": "Sign Out",
  "profile": "Profile",
  "browse": "Browse",
  "events": "Events",
  "metrics": "Metrics",
  "code_of_conduct": "Code of Conduct",
  "privacy_policy": "Privacy Policy"
}
```

*Locale Detection*:
1. **Priority order**:
   - User's explicit preference (stored in `UserLocalePreference`)
   - Browser Accept-Language header (fallback)
   - Default: `en-IE`
2. **Detection Logic**:
   - On login: Query `UserLocalePreference` for user_id
   - If not found: Check browser header
   - Store preference for future sessions
3. **Implementation**:
   - Backend: Middleware to set `req.locale` based on priority
   - Frontend: Locale switcher component to change preference
   - Database: Store `UserLocalePreference` {user_id, locale_code, updated_date}

*Date & Time Formatting per Locale*:
- [ ] pt-PT: DD/MM/YYYY, 24h time (e.g., "16/11/2025 14:30")
- [ ] en-IE: DD/MM/YYYY, 24h time (e.g., "16/11/2025 14:30")
- [ ] fr-FR: DD/MM/YYYY, 24h time (e.g., "16/11/2025 14:30")
- [ ] es-ES: DD/MM/YYYY, 24h time (e.g., "16/11/2025 14:30")
- [ ] Implementation: Use `Intl.DateTimeFormat` API (browser) or moment.js (server)

*Locale Switcher Component*:
- [ ] Dropdown or button with flag icons (optional)
- [ ] Displays current locale
- [ ] On change: Save preference to `UserLocalePreference`, reload page
- [ ] Placed in: Header navigation (top-right)
- [ ] Visible on all pages (landing, about, profile, browse, etc.)

*Backend i18n Middleware*:
- [ ] Middleware function: `setLocale(req, res, next)`
  - [ ] Checks `req.user.locale` (from JWT/session)
  - [ ] Falls back to `req.headers['accept-language']`
  - [ ] Falls back to `en-IE`
  - [ ] Sets `req.locale` for use in route handlers
- [ ] Imported in all API routes

*Frontend i18n Implementation*:
- [ ] JavaScript i18n library: `i18next` or similar
- [ ] Load translation files on page load (based on current locale)
- [ ] Replace all hardcoded strings with translation keys
- [ ] Example: Instead of `"Welcome"`, use `t('common.welcome')`

*Email Template i18n*:
- [ ] Email subject and body use translation strings
- [ ] Example: `t('emails.approval_subject', {locale: user.locale})`
- [ ] SendGrid template uses localized strings

*Testing Strategy*:

*Unit Tests*:
- [ ] Locale detection logic: User preference → browser → default
- [ ] Date formatting: Verify correct format per locale
- [ ] Translation loading: All strings load without missing keys

*Integration Tests*:
- [ ] User sets locale → preference saved to DB → page reloads in new locale
- [ ] All pages display translated strings (no missing keys)
- [ ] Emails sent in user's preferred locale

*E2E Tests (Playwright)*:
- [ ] Change locale: Click locale switcher → page refreshes in new language
- [ ] All UI strings translated → no untranslated keys visible
- [ ] Date/time formatted correctly per locale

**Cosmos DB Schema: `locales`**:
```json
{
  "id": "locale_uuid",
  "code": "en-IE",
  "name": "English (Ireland)",
  "active": true,
  "coverage_percentage": 100,
  "last_updated": "2025-11-16T12:00:00Z"
}
```

**Cosmos DB Schema: `userLocalePreferences`**:
```json
{
  "id": "pref_uuid",
  "user_id": "github_user_id",
  "locale_code": "pt-PT",
  "updated_date": "2025-11-16T12:00:00Z"
}
```

**Dependencies**: 
- Task 1.1.4 (Backend API skeleton)
- Task 1.2.1 (Brand consistency - fonts work in all locales)

**Blockers**: None

**Related Files**:
- `i18n/en-IE/common.json`
- `i18n/pt-PT/common.json`
- `i18n/fr-FR/common.json`
- `i18n/es-ES/common.json`
- `backend/src/middleware/locale.js` (Locale detection middleware)
- `frontend/scripts/i18n.js` (Frontend translation loader)
- `frontend/components/locale-switcher.html` (Locale selector component)
- `backend/src/db/schemas/userLocalePreference.js`

---

## Week 2 Success Criteria (Day 5)

**MUST PASS before Phase 1 completion**:
- ✅ Landing page live and publicly accessible
- ✅ Admin dashboard functional (pending profiles, events, reports, audit log, health)
- ✅ Brand identity consistent across all pages (logo, colors, typography)
- ✅ Email templates created and tested
- ✅ i18n infrastructure supporting 4 locales with ≥95% coverage
- ✅ Locale switcher working (change language, page reflects changes)
- ✅ Date/time formatting correct per locale
- ✅ <3sec page load time (Lighthouse ≥90)
- ✅ WCAG 2.1 AA compliance verified (color contrast, keyboard nav, screen reader)
- ✅ All E2E tests passing

---

## Week 2 Effort Summary

| Task | Duration | Effort | Status |
|------|----------|--------|--------|
| 1.2.1 | 2 days | 1.5 days | Planning |
| 1.2.2 | 2 days | 2 days | Planning |
| 1.2.3 | 1 day | 0.5 days | Planning |
| 1.2.4 | 2 days | 2 days | Planning |
| 1.2.5 | 1 day | 0.5 days | Planning |
| 1.2.6 | 1 day | 1 day | Planning |
| **Total** | **5 days** | **~7-8 days** | Planning |

---

## Dependencies & Phase 1 Completion

All Week 2 tasks depend on Week 1 completion:
- ✅ Task 1.1.1 (Azure infrastructure)
- ✅ Task 1.1.2 (GitHub OAuth)
- ✅ Task 1.1.3 (CI/CD pipeline)
- ✅ Task 1.1.4 (Backend skeleton)

**Phase 1 Quality Gates** (Week 2 End):
- ✅ Website live, ≥99.5% uptime
- ✅ Landing page <3sec load time (Lighthouse ≥90)
- ✅ Brand identity consistent across all pages
- ✅ Admin dashboard functional (can approve/reject profiles)
- ✅ Zero security incidents (HTTPS, no exposed secrets)
- ✅ Unit test coverage ≥80%
- ✅ WCAG 2.1 AA compliance verified
- ✅ i18n infrastructure: 4 locales, ≥95% coverage
