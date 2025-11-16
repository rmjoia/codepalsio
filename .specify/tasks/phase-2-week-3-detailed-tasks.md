# Phase 2, Weeks 3-5: Core Platform Features

**Status**: Not Started  
**Target Start**: Week 3 (after Phase 1 complete)  
**Duration**: 3 weeks (15 working days)  
**Total Effort Estimate**: ~75 developer days (1-2 FTE)

---

## Overview

Phase 2 delivers the core platform: user profiles, discovery system, and connection management. By end of Phase 2, the platform enables first mentorship matches—developers can register, create profiles, browse for mentors/mentees, and connect with mutual consent.

**Phase 2 Success**: 
- ≥50 user profiles approved
- ≥10 successful connections
- New user signup-to-profile takes <5 minutes
- Browse system responsive (<1sec)

---

# WEEK 3: User Registration & Profile Creation

**Goal**: Enable developers to register via GitHub OAuth and create a mentorship profile.  
**Duration**: 5 working days  
**Effort**: ~15 developer days

---

## Task 2.1.1: User Registration Flow via GitHub OAuth

**Priority**: P1 (Critical path)  
**Assigned To**: Backend Lead  
**Duration**: 2 days  
**Effort**: 2 developer days

**Description**: Implement complete GitHub OAuth registration flow → profile creation form → profile submission → "Pending Review" state.

**Acceptance Criteria**:
- [ ] Landing page: "Sign In with GitHub" button redirects to GitHub OAuth
- [ ] OAuth flow: User authorizes → redirected to `/auth/callback?code=...`
- [ ] Callback handler: Exchanges code for access token, creates/updates User record in Cosmos DB
- [ ] New user flag: If user not in DB, redirect to profile creation form; if existing, redirect to dashboard
- [ ] Profile creation form displays all required fields:
  - [ ] Seeking status: Radio buttons (Mentor / Mentee / Both)
  - [ ] Skills: Multi-select autocomplete (React, Node.js, Python, etc.) - max 10 skills
  - [ ] Experience level: Dropdown (Beginner / Intermediate / Advanced / Expert)
  - [ ] Bio: Text area (≤500 chars), display char counter
  - [ ] Location: Country/State/City picker; visibility toggle ("Show my location")
  - [ ] Social links: Discord, LinkedIn, Twitter, personal website (optional)
  - [ ] Availability: Toggle "Available for pairing sessions"
  - [ ] Age confirmation: Radio (Under 18 / 18 or older); if <18, next question is parental email
  - [ ] Parent email field (conditional): "If under 18, enter parent/guardian email"
- [ ] Form validation (client-side + server-side):
  - [ ] Required fields: Seeking, skills (≥1), experience level, age confirmation
  - [ ] Bio sanitization: Remove HTML/script tags, max 500 chars
  - [ ] Location: Valid country code (ISO 3166)
  - [ ] Social links: URL format validation (regex for Discord, LinkedIn, etc.)
  - [ ] Email (for parent): Valid email format
- [ ] Server-side submission:
  - [ ] `POST /api/auth/register` receives form data
  - [ ] Validate all inputs (no HTML injection, file size <5MB if any)
  - [ ] Create CodePals Profile record in Cosmos DB:
    - [ ] Fields: user_id, seeking, skills, experience_level, bio, location, location_visibility, social_links, availability, age_verified, parental_email (if <18), submission_date
  - [ ] Mark profile status: "pending_review" (if ≥18) or "pending_parental_consent" (if <18)
  - [ ] Trigger: If parental consent required, send parental verification email (see Task 2.1.4); else notify admin (see Task 2.1.2)
  - [ ] Response: `{success: true, profile_id: "...", status: "pending_review"}` with message "Your profile is under review"
- [ ] Session management:
  - [ ] User authenticated: JWT token created and stored in secure cookie (HttpOnly, Secure, SameSite=Strict)
  - [ ] User can navigate to dashboard, sees "Profile Under Review" banner
  - [ ] Logout endpoint: `/api/auth/logout` clears JWT cookie

**Testing Strategy**:

*Unit Tests (Jasmine/Karma)*:
- [ ] Form validation: Required fields enforced (seeking, skills, experience)
- [ ] Text sanitization: HTML/script tags removed from bio ("Test <script>alert('xss')</script>" → "Test alert('xss')")
- [ ] Email validation: Correct format accepted, invalid format rejected
- [ ] Skills multi-select: ≥1 skill required, ≤10 allowed
- [ ] Age validation: Under 18 → parental email required; 18+ → parental email hidden
- [ ] Location picker: Valid country code → accepted; invalid → rejected

*Integration Tests*:
- [ ] OAuth callback: Code → access token → User record created in Cosmos DB
- [ ] User can log in again: Session created, existing user returned to dashboard (not profile form)
- [ ] Cosmos DB queries: New user indexed by user_id; profile queryable by approval_status

*E2E Tests (Playwright)*:
- [ ] Full signup journey: Click "Sign in with GitHub" → OAuth popup → Authorize → Profile form → Submit → "Profile Under Review" message
- [ ] Edge case: Under 18 signup → Parental email sent → Can logout/login → Still shows "pending_parental_consent"
- [ ] Negative case: Try submit without required fields → Validation error shown
- [ ] Negative case: Try inject HTML in bio → Sanitized, alert doesn't trigger on profile page

**Dependencies**: 
- Task 1.1.2 (GitHub OAuth app configured)
- Task 1.1.4 (Backend API skeleton)

**Blockers**: None

**Related Files**:
- `backend/src/auth.js` (OAuth flow, token generation)
- `backend/src/middleware/auth.js` (Session validation)
- `frontend/pages/auth/register.html` (Profile creation form)
- `frontend/pages/auth/register.js` (Client-side form handling, validation)
- `backend/src/db/schemas/user.js` (User schema)
- `backend/src/db/schemas/profile.js` (CodePals Profile schema)
- `backend/tests/auth.test.js` (Unit tests)
- `backend/tests/e2e/signup.spec.js` (E2E tests)

**Success Criteria**:
- ✅ User can register in <5 minutes start-to-finish
- ✅ First user profile submitted and marked "pending_review"
- ✅ Unit test coverage ≥80% on auth module
- ✅ E2E test passes for full signup flow
- ✅ No HTML injection possible

---

## Task 2.1.2: Profile Approval Workflow

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 1 day  
**Effort**: 0.5 developer days

**Description**: Admin can approve or reject pending profiles; users notified; audit log recorded.

**Acceptance Criteria**:

*Admin Dashboard* (Frontend):
- [ ] "Pending Profiles" section displays list:
  - [ ] Table columns: GitHub username, age status ("18+", "<18 pending consent", "<18 consent verified"), submission date, action buttons
  - [ ] Approve button (green) → confirmation dialog → "Are you sure?"
  - [ ] Reject button (red) → text input field appears for rejection reason
  - [ ] Pagination: 20 profiles per page

*Backend Approval Endpoint* (`POST /api/profiles/{profileId}/approve`):
- [ ] Admin authentication required (admin role verified)
- [ ] Update profile: status → "approved", approval_date → now, approved_by_admin → username
- [ ] Create audit log entry: {admin: "...", action: "approve", profile_id: "...", timestamp: now}
- [ ] Send approval email to user (see Task 1.2.5)
- [ ] Response: `{success: true, profile_id: "...", message: "Profile approved"}`

*Backend Rejection Endpoint* (`POST /api/profiles/{profileId}/reject`):
- [ ] Admin authentication required
- [ ] Request body: `{rejection_reason: "Reason for rejection"}`
- [ ] Validation: rejection_reason not empty, ≤500 chars
- [ ] Update profile: status → "rejected", rejection_date → now, rejection_reason → stored, rejected_by_admin → username
- [ ] Create audit log entry: {admin: "...", action: "reject", profile_id: "...", reason: "...", timestamp: now}
- [ ] Send rejection email to user with reason (see Task 1.2.5)
- [ ] User can resubmit profile after rejection
- [ ] Response: `{success: true, profile_id: "...", message: "Profile rejected"}`

*User Experience After Approval*:
- [ ] User logs in: Dashboard no longer shows "Profile Under Review"; instead shows "Your Profile" with view/edit button (edit deferred to Phase 2+)
- [ ] User profile appears in browse system (visible to other users)
- [ ] User can now send connection invites, vote on help board posts, etc.

*User Experience After Rejection*:
- [ ] User logs in: Banner shows "Your profile was rejected" + reason
- [ ] User can click "Edit and Resubmit" → form pre-fills with previous submission → user can modify and resubmit

**Testing Strategy**:

*Unit Tests*:
- [ ] Approval logic: Profile status changes to "approved", approval_date set
- [ ] Rejection logic: Profile status changes to "rejected", rejection_reason stored
- [ ] Audit log: Admin name and action recorded correctly

*E2E Tests (Playwright)*:
- [ ] Admin approves profile: Admin login → pending profiles → click approve → confirmation → profile approved → user receives email
- [ ] Admin rejects profile with reason: Admin login → reject with reason → profile rejected → user receives email with reason

**Dependencies**: 
- Task 2.1.1 (User registration creates pending profiles)
- Task 1.2.4 (Admin dashboard UI)

**Blockers**: None

**Related Files**:
- `backend/src/profiles/approve.js` (Approval logic)
- `backend/src/profiles/reject.js` (Rejection logic)
- `backend/src/db/auditLog.js` (Audit logging)
- `frontend/admin/pending-profiles.html` (Admin UI)
- `backend/tests/profiles.test.js` (Unit tests)

---

## Task 2.1.3: Profile Data Model (Cosmos DB Schema)

**Priority**: P1  
**Assigned To**: Backend Lead + DevOps  
**Duration**: 1 day  
**Effort**: 0.5 developer days

**Description**: Design and implement Cosmos DB schema for CodePals profiles with encryption, indexing, and performance optimization.

**Acceptance Criteria**:

*Cosmos DB Container: "profiles"*:
- [ ] Partition key: `/user_id` (for optimal query performance)
- [ ] Document schema:
  ```json
  {
    "id": "profile_uuid",
    "user_id": "github_user_id",
    "seeking": "mentor|mentee|both",
    "skills": ["React", "Node.js"],
    "experience_level": "beginner|intermediate|advanced|expert",
    "bio": "User's bio",
    "location": {
      "country": "IE",
      "state": "Dublin",
      "city": "Dublin"
    },
    "location_visibility": true,
    "social_links": {
      "discord": "encrypted: user#1234",
      "linkedin": "encrypted: https://...",
      "twitter": "encrypted: @handle",
      "website": "encrypted: https://..."
    },
    "availability": true,
    "age_verified": true,
    "parental_consent_status": "not_required|pending|verified",
    "parental_email": "encrypted: ...",
    "status": "pending_review|approved|rejected",
    "approval_date": "2025-11-20T10:00:00Z",
    "approved_by_admin": "admin_username",
    "rejection_reason": null,
    "creation_date": "2025-11-18T14:30:00Z",
    "updated_date": "2025-11-18T14:30:00Z"
  }
  ```

*Encryption*:
- [ ] Sensitive fields encrypted at rest: discord, linkedin, twitter, website, parental_email
- [ ] Encryption key: Managed by Azure Key Vault (not in code)
- [ ] Encrypt on write: Middleware intercepts profile save, encrypts sensitive fields
- [ ] Decrypt on read: Middleware decrypts before returning to frontend (only if user authorized)

*Indexes*:
- [ ] Partition key index: `/user_id` (automatic, full partition key queries)
- [ ] Range index: `/status` (query profiles by approval status for admin dashboard)
- [ ] Range index: `/seeking` (query by mentor/mentee/both for browse)
- [ ] Range index: `/creation_date` (sort by newest first)
- [ ] Composite index: `[{path: "/status"}, {path: "/creation_date", order: "descending"}]` (query: all approved profiles ordered by newest)

*Performance Tuning*:
- [ ] RU/s consumption: Estimate for read/write operations
  - [ ] Create profile: ~5-10 RU
  - [ ] Read profile: ~1 RU
  - [ ] Update status (approve): ~5 RU
  - [ ] Query profiles by status: ~10-50 RU depending on page size
- [ ] Free tier limit: 400 RU/s → Sufficient for MVP
- [ ] Monitoring: Track RU consumption; alert if >350 RU/s (85% of quota)

*Data Validation*:
- [ ] All fields required except optional ones: social_links, parental_email, rejection_reason
- [ ] Skills array: Min 1, max 10 items
- [ ] Experience level: Enum (beginner, intermediate, advanced, expert)
- [ ] Status: Enum (pending_review, approved, rejected)

**Testing Strategy**:

*Unit Tests*:
- [ ] Encryption/decryption: Plain text → encrypted → decrypted matches original
- [ ] Schema validation: Invalid seeking value rejected, valid values accepted
- [ ] Index verification: Queries use expected indexes (check query plan)

*Integration Tests*:
- [ ] Create profile: Document saved to Cosmos DB, indexed correctly
- [ ] Query by status: `SELECT * WHERE status='approved'` returns correct profiles
- [ ] Update profile: Status change → indexed correctly for next query
- [ ] RU consumption: Measure RU/s for typical operations, ensure <400 RU/s

**Dependencies**: 
- Task 1.1.1 (Cosmos DB provisioned)

**Blockers**: None

**Related Files**:
- `backend/src/db/schemas/profile.js` (Profile schema definition)
- `backend/src/db/cosmos.js` (Cosmos DB client + encryption middleware)
- `backend/src/encryption/secrets.js` (Encryption/decryption functions)
- `docs/COSMOS_SCHEMA.md` (Schema documentation)
- `backend/tests/cosmos.test.js` (Integration tests)

---

## Task 2.1.4: Parental Consent Process

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Implement workflow for users under 18: send parental verification email, verify consent, unlock profile for admin review.

**Acceptance Criteria**:

*Parental Consent Email Workflow*:
- [ ] User <18 submits profile → system sends email to parent/guardian email (see Task 1.2.5 for email template)
- [ ] Email contains:
  - [ ] Personalized greeting: "Hi [parent name]"
  - [ ] Clear explanation: "[Child name] is registering for CodePals.io, a mentorship platform..."
  - [ ] CodePals mission statement (link to About page)
  - [ ] Security & privacy statement (link to Privacy policy)
  - [ ] One-click verification link: `https://codepals.io/consent/verify?token=...&profile_id=...`
  - [ ] Token expires in 7 days
  - [ ] Optional: Document upload link (parent can upload permission slip, parental consent form as PDF/image)

*Backend Endpoint: `GET /consent/verify?token=TOKEN&profile_id=PROFILE_ID`*:
- [ ] Validate token: Must be valid, not expired, matches profile_id
- [ ] Display confirmation page: "Thank you for verifying your permission. [Child]'s profile is now being reviewed by our admin team."
- [ ] On confirmation click (or after page load):
  - [ ] Update ParentalConsent record: consent_verified → true, verified_date → now
  - [ ] Update Profile: parental_consent_status → "verified"
  - [ ] Move profile to "pending_review" (ready for admin)
  - [ ] Notify admin: Profile now ready for review (no separate email, just update admin dashboard)

*Optional Document Upload*:
- [ ] ParentalConsent form on verification page: "Upload optional supporting documents (PDF, JPG, PNG, max 5MB)"
- [ ] On upload:
  - [ ] Validate file: Only PDF/image types, <5MB
  - [ ] Upload to Azure Storage (private blob, not publicly accessible)
  - [ ] Store blob URL in ParentalConsent.documents array (encrypted)
  - [ ] Admin can view document from admin dashboard

*Cosmos DB Schema: "parental_consents"*:
- [ ] Document:
  ```json
  {
    "id": "consent_uuid",
    "profile_id": "profile_uuid",
    "user_id": "github_user_id",
    "guardian_email": "encrypted: parent@example.com",
    "verification_token": "hashed_token",
    "token_expires": "2025-11-25T14:30:00Z",
    "consent_verified": false,
    "verified_date": null,
    "documents": ["encrypted: https://blob_url_1", "encrypted: https://blob_url_2"],
    "creation_date": "2025-11-18T14:30:00Z"
  }
  ```

*Admin Dashboard Integration*:
- [ ] Pending profiles section: Show "18+", "<18 consent pending", "<18 consent verified" badge
- [ ] When reviewing <18 profiles awaiting consent: Admin sees "Awaiting parental consent" message + link to consent page status
- [ ] When consent verified: Badge changes to "<18 consent verified" → Admin can approve/reject

**Testing Strategy**:

*Unit Tests*:
- [ ] Token generation: Unique, expires after 7 days
- [ ] Token validation: Valid token passes, expired token rejected, invalid token rejected
- [ ] Email parsing: Verification link correctly formatted

*Integration Tests*:
- [ ] Full flow: User <18 → parental email sent → guardian clicks link → ParentalConsent updated → Profile marked "verified"
- [ ] Document upload: File validated, stored in Azure Storage, URL encrypted in DB
- [ ] Token expiration: After 7 days, verification link doesn't work

*E2E Tests (Playwright)*:
- [ ] Signup as under 18: Enter profile → select "Under 18" → enter parent email → submit
- [ ] Verify email received (mock/test email service)
- [ ] Click verification link: Confirmation page shows, ParentalConsent updated
- [ ] Profile now appears in admin "pending_review" list

**Dependencies**: 
- Task 2.1.1 (User registration collects parental email if <18)
- Task 1.2.5 (Email templates created)
- Task 1.1.1 (Azure Storage for document uploads)

**Blockers**: None

**Related Files**:
- `backend/src/consent/verify.js` (Consent verification endpoint)
- `backend/src/db/schemas/parentalConsent.js` (Parental consent schema)
- `backend/src/email/sendVerificationEmail.js` (Email sending logic)
- `frontend/pages/consent/verify.html` (Verification confirmation page)
- `backend/tests/consent.test.js` (Unit tests)

---

## Task 2.1.5: Registration Testing (Unit, Integration, E2E)

**Priority**: P1  
**Assigned To**: QA / Test Automation  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Comprehensive test coverage for user registration, profile creation, approval workflow, and parental consent.

**Test Suites**:

*Unit Tests (Jasmine/Karma)* - Target ≥80% coverage:
- [ ] Form validation:
  - [ ] Required fields enforced (seeking, skills, experience level)
  - [ ] Optional fields handled correctly (social links, bio)
  - [ ] Text sanitization (HTML removal)
  - [ ] Email format validation
  - [ ] Age confirmation triggers parental email field
- [ ] Authentication:
  - [ ] OAuth token parsed correctly
  - [ ] Session created after OAuth
  - [ ] JWT token generation and validation
- [ ] Data encryption:
  - [ ] Social links encrypted/decrypted
  - [ ] Parental email encrypted
  - [ ] Sensitive fields not leaking
- [ ] Edge cases:
  - [ ] Empty skills → validation error
  - [ ] >10 skills → validation error
  - [ ] Oversized bio (>500 chars) → truncated/error
  - [ ] Invalid country code → error
  - [ ] Parent email duplicate submission → deduplicated

*Integration Tests*:
- [ ] OAuth flow:
  - [ ] Redirect to GitHub OAuth → auth code → token → User record created
  - [ ] Subsequent login: User exists → redirect to dashboard (not profile form)
- [ ] Cosmos DB:
  - [ ] New profile indexed correctly
  - [ ] Query by status returns correct profiles
  - [ ] Update profile status persists
- [ ] Email service:
  - [ ] Approval email sent when profile approved (mock SendGrid)
  - [ ] Rejection email sent when profile rejected
  - [ ] Parental consent email sent when <18
- [ ] RU consumption:
  - [ ] Typical operations (create, read, update) within RU budget

*E2E Tests (Playwright)* - Critical user journeys:

1. **Happy Path: 18+ User Registration**
   - [ ] Navigate to landing page
   - [ ] Click "Sign In with GitHub"
   - [ ] GitHub OAuth popup (or redirect)
   - [ ] Authorize → Redirected to profile form
   - [ ] Fill in all fields:
     - [ ] Select "Mentee" for seeking
     - [ ] Add "React", "Node.js" skills
     - [ ] Select "Intermediate" experience
     - [ ] Enter bio: "Love building with React"
     - [ ] Select location: Ireland, Dublin, Dublin
     - [ ] Add Discord: "username#1234"
     - [ ] Select "18 or older" for age
   - [ ] Click Submit
   - [ ] See success message: "Your profile is under review"
   - [ ] Dashboard shows "Profile Under Review" banner

2. **Parental Consent Flow: <18 User Registration**
   - [ ] Sign in → Select "Under 18"
   - [ ] Enter parent email: "parent@example.com"
   - [ ] Submit
   - [ ] See: "We've sent a verification link to your parent/guardian. Your profile will be reviewed once they verify."
   - [ ] Verify email sent (check mock email inbox)
   - [ ] Click verification link
   - [ ] Confirmation page: "Thank you for verifying..."
   - [ ] Back to admin dashboard: Profile now in "pending_review" with "<18 verified" badge
   - [ ] Admin approves → User receives approval email

3. **Validation Errors**
   - [ ] Try submit without selecting seeking status → Error: "Please select how you're looking to connect"
   - [ ] Try submit without skills → Error: "Add at least one skill"
   - [ ] Try submit with >10 skills → Error: "Maximum 10 skills allowed"
   - [ ] Try submit with HTML in bio: `<script>alert('xss')</script>` → Sanitized, no alert on profile page

4. **Session Management**
   - [ ] After profile submission → Logged in state persists
   - [ ] Reload page → Still logged in, dashboard loads
   - [ ] Click Logout → Redirected to landing page, session cleared
   - [ ] Try access dashboard without login → Redirected to login

**Performance Testing**:
- [ ] Registration form load time: <2 sec
- [ ] Form submission: Response <1 sec
- [ ] Email send: No noticeable delay (async in background)
- [ ] Page transitions smooth, no janky animations

**Accessibility Testing** (WCAG 2.1 AA):
- [ ] Form labels associated with inputs
- [ ] Keyboard navigation: Tab through all form fields, submit with Enter
- [ ] Focus indicators: Visible on all interactive elements
- [ ] Color contrast: Form labels vs background ≥4.5:1
- [ ] Error messages screen-reader tested
- [ ] Mobile testing: Form usable on iPhone/Android (touch targets ≥48px)

**Test Coverage Report**:
- [ ] All new code ≥80% covered
- [ ] Critical paths (happy path, error handling) 100% covered
- [ ] Coverage report generated and published in CI/CD

**Blockers**: None

**Related Files**:
- `backend/tests/auth.test.js`
- `backend/tests/profiles.test.js`
- `backend/tests/consent.test.js`
- `backend/tests/e2e/signup.spec.js`
- `backend/tests/e2e/parental-consent.spec.js`
- `.github/workflows/test.yml` (CI test workflow)

**Success Criteria**:
- ✅ ≥80% unit test coverage on auth + profiles modules
- ✅ All E2E tests pass (happy path, error cases, accessibility)
- ✅ First 5 test users register successfully
- ✅ Zero security issues (no XSS, HTML injection, credential leaks)

---

## Week 3 Success Criteria (Day 5)

**MUST PASS before Week 4 starts**:
- ✅ User registration flow end-to-end working
- ✅ First 5+ profiles created and submitted for review
- ✅ Admin dashboard showing pending profiles
- ✅ Approval/rejection workflow functional
- ✅ Parental consent flow tested
- ✅ ≥80% unit test coverage
- ✅ All E2E tests passing (signup, parental consent)
- ✅ No security issues (XSS, injection, credential leaks)

---

## Week 3 Effort Summary

| Task | Duration | Effort | Status |
|------|----------|--------|--------|
| 2.1.1 | 2 days | 2 days | Planning |
| 2.1.2 | 1 day | 0.5 days | Planning |
| 2.1.3 | 1 day | 0.5 days | Planning |
| 2.1.4 | 1 day | 1 day | Planning |
| 2.1.5 | 1 day | 1 day | Planning |
| **Total** | **5 days** | **~5 days** | Planning |

---

## Dependencies & Blockers

**All Week 3 tasks depend on Phase 1 completion**:
- ✅ Task 1.1.1 (Azure infrastructure)
- ✅ Task 1.1.2 (GitHub OAuth)
- ✅ Task 1.1.3 (CI/CD pipeline)
- ✅ Task 1.1.4 (Backend skeleton)
- ✅ Task 1.2.4 (Admin dashboard)
- ✅ Task 1.2.5 (Email templates)
- ✅ Task 1.2.6 (i18n setup)

**Parallel work possible**: All Week 3 tasks can be started simultaneously on Day 1 after Phase 1 complete.

---

## Key Files to Create/Modify

**Backend**:
- `backend/src/auth.js` - OAuth flow, session management
- `backend/src/profiles/register.js` - Profile creation endpoint
- `backend/src/profiles/approve.js` - Admin approval logic
- `backend/src/consent/verify.js` - Parental consent verification
- `backend/src/db/schemas/profile.js` - Profile data model
- `backend/src/db/schemas/parentalConsent.js` - Parental consent schema
- `backend/tests/auth.test.js` - Auth unit tests
- `backend/tests/profiles.test.js` - Profile unit tests
- `backend/tests/e2e/signup.spec.js` - Signup E2E tests

**Frontend**:
- `frontend/pages/auth/register.html` - Profile form
- `frontend/pages/auth/register.js` - Form validation, submission
- `frontend/pages/consent/verify.html` - Consent verification page
- `frontend/admin/pending-profiles.html` - Admin pending profiles list

**Documentation**:
- `docs/PROFILES_API.md` - Profile endpoints documentation
- `docs/PARENTAL_CONSENT.md` - Parental consent workflow documentation

