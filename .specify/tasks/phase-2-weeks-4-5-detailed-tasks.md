# Phase 2, Weeks 4-5: Profile Browse & Discovery, Connection Invites

**Status**: Not Started  
**Target Start**: Week 4 (after Week 3 user registration complete)  
**Duration**: 2 weeks (10 working days)  
**Total Effort Estimate**: ~20 developer days

---

## Overview

Weeks 4-5 build on user profiles created in Week 3 by enabling users to discover each other and request connections. Week 4 focuses on the browse/discovery system with filtering. Week 5 implements connection invites, acceptance/rejection/blocking, and bidirectional visibility.

**Phase 2 Success (Weeks 3-5)**:
- ≥50 user profiles approved
- ≥10 successful connections
- Browse system responsive (<1sec)
- Contact privacy enforced

---

# WEEK 4: PROFILE BROWSE & DISCOVERY

## Task 2.2.1: Browse Endpoint

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Build backend API endpoint for browsing and filtering developer profiles.

**Acceptance Criteria**:

*Endpoint*: `GET /api/profiles/browse`

*Query Parameters*:
- [ ] `seeking` (optional): "mentor", "mentee", "both" - filters profiles by seeking status
- [ ] `skills` (optional): Comma-separated list (e.g., "React,Node.js") - AND logic (all skills required)
- [ ] `level` (optional): "beginner", "intermediate", "advanced", "expert" - filters by experience level
- [ ] `page` (optional): Integer, default 1 - for pagination
- [ ] `limit` (optional): Integer, default 20, max 100 - results per page

*Response Format*:
```json
{
  "success": true,
  "data": [
    {
      "profile_id": "uuid",
      "user_id": "github_id",
      "username": "username",
      "avatar": "https://...",
      "seeking": "mentor",
      "skills": ["React", "Node.js"],
      "experience_level": "intermediate",
      "top_skills_count": 3,
      "created_date": "2025-11-16T..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 347,
    "total_pages": 18
  }
}
```

*Filtering Logic*:
- [ ] Exclude self (current user's profile)
- [ ] Exclude unmatched profiles (filter by seeking status):
  - [ ] If user seeking="mentor": Show profiles with seeking="mentee" OR seeking="both"
  - [ ] If user seeking="mentee": Show profiles with seeking="mentor" OR seeking="both"
  - [ ] If user seeking="both": Show all (OR logic on seeking values)
- [ ] Skills filter: AND logic - profile must have ALL requested skills
  - [ ] Example: skills="React,Node" → profile must have both React AND Node.js
- [ ] Level filter: Exact match
- [ ] Only return "approved" profiles

*Performance*:
- [ ] Response time: <1 second (target <500ms)
- [ ] Cosmos DB indexes on: user_id (partition), seeking, skills, level
- [ ] Pagination: Limit 100 results max

*Validation*:
- [ ] Invalid page number → default to 1
- [ ] Invalid seeking value → return 400 error
- [ ] Invalid level → return 400 error

*Security*:
- [ ] Authenticated user required (JWT token)
- [ ] Contact details NOT returned (social_links, email encrypted and hidden)
- [ ] Location NOT returned (unless explicitly visible and connected)

**Testing Strategy**:

*Unit Tests*:
- [ ] Filter logic: seeking OR/AND combinations tested
- [ ] Pagination: Page 1, last page, out-of-bounds handled
- [ ] Validation: Invalid params return 400

*Integration Tests*:
- [ ] Query database with filters, verify results correct
- [ ] Performance: Load test with 1000+ profiles, measure response time
- [ ] Indexes used correctly (check query plan)

*E2E Tests*:
- [ ] Browse endpoint returns profiles correctly
- [ ] Filters work as expected

**Dependencies**: 
- Task 2.1.3 (Profile data model with proper indexes)
- Task 1.1.4 (Backend API skeleton)

**Blockers**: None

**Related Files**:
- `backend/src/profiles/browse.js`
- `backend/tests/profiles.test.js`

---

## Task 2.2.2: Browse UI

**Priority**: P1  
**Assigned To**: Frontend Lead + Designer  
**Duration**: 2 days  
**Effort**: 2 developer days

**Description**: Build responsive browse page with filters, profile cards, pagination.

**Acceptance Criteria**:

*Page Structure*:
- [ ] Title: "Browse Developers" or "Find Your Code Pal"
- [ ] Filter panel (left sidebar, responsive):
  - [ ] Seeking status: Dropdown or radio buttons (Seeking Mentor / Seeking Mentee / Both)
  - [ ] Skills: Multi-select autocomplete input with dropdown
    - [ ] Searchable: Type "React" → shows matching skills
    - [ ] Tag display: Selected skills shown as tags/pills
    - [ ] Remove button on each tag
  - [ ] Experience level: Button group or dropdown (Beginner, Intermediate, Advanced, Expert)
  - [ ] Apply Filters button (mobile) or auto-apply (desktop)
  - [ ] Clear Filters button
- [ ] Profile cards grid (right side, responsive):
  - [ ] Card layout: Grid on desktop (3 cols), 2 cols tablet, 1 col mobile
  - [ ] Card content:
    - [ ] User avatar
    - [ ] Username
    - [ ] Seeking status badge (color-coded: blue for mentor, green for mentee)
    - [ ] Top 3-5 skills (displayed as tags)
    - [ ] Experience level badge (Beginner, Intermediate, etc.)
    - [ ] Created date ("Joined X days ago")
    - [ ] "Connect" button (primary CTA)
- [ ] Pagination controls:
  - [ ] Previous/Next buttons
  - [ ] Page number display ("Page 1 of 18")
  - [ ] Go to page input (optional)
- [ ] Empty state:
  - [ ] Message if no profiles match filters ("No developers found matching your criteria")
  - [ ] Suggestion to broaden filters

*Responsive Design*:
- [ ] Mobile (320px): Single column, filters collapsible
- [ ] Tablet (768px): Two-column layout (filters left, cards right)
- [ ] Desktop (1024px+): Full-width, comfortable spacing

*Loading & Performance*:
- [ ] Loading state: Spinner while fetching
- [ ] Skeleton cards: Placeholder cards while loading
- [ ] Lazy load images: User avatars loaded on demand

*Search/Filter Behavior*:
- [ ] On filter change: Automatically fetch new data (if desktop) or on Apply button click (if mobile)
- [ ] Loading indicator shows during fetch
- [ ] Error handling: Display error message if API fails
- [ ] No results: Display empty state

**Testing Strategy**:

*Functional Testing*:
- [ ] Filter combinations work: Filter by seeking + skills + level
- [ ] Pagination: Navigate pages, card counts correct
- [ ] Card click: Navigate to profile detail
- [ ] Connect button: Visible, clickable (leads to Task 2.3)

*Performance Testing*:
- [ ] Page load: <2 seconds
- [ ] Pagination: Smooth, no jank
- [ ] Filter change: Response <500ms

*Responsive Testing*:
- [ ] Mobile: Filters collapsible, cards stack vertically
- [ ] Tablet: Two-column layout works
- [ ] Desktop: Full-width comfortable

*Accessibility Testing (WCAG 2.1 AA)*:
- [ ] Filter labels associated with inputs
- [ ] Keyboard navigation: Tab through filters and cards
- [ ] Screen reader: Seeking badge status announced
- [ ] Focus indicators visible

**Dependencies**: 
- Task 2.2.1 (Browse endpoint built)
- Task 1.2.1 (Design system - cards, buttons)

**Blockers**: None

**Related Files**:
- `frontend/pages/browse.html`
- `frontend/scripts/browse.js` (Filter logic, API calls)
- `frontend/components/profile-card.html`
- `frontend/components/filter-panel.html`

---

## Task 2.2.3: Profile Detail Page

**Priority**: P1  
**Assigned To**: Frontend Lead  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Show full developer profile with privacy enforcement (contact details hidden until connected).

**Acceptance Criteria**:

*Profile Page Content*:
- [ ] User avatar (large)
- [ ] Username and Karma score (⭐ Karma: 42)
- [ ] Seeking status badge
- [ ] Experience level
- [ ] Bio / About section (full text)
- [ ] All skills (not just top 3)
- [ ] Badges earned (if any)
- [ ] Creation date ("Member since X months ago")

*Conditional Content - If NOT Connected*:
- [ ] Location: HIDDEN (shows "Connect to view location")
- [ ] Social links (Discord, LinkedIn, etc.): HIDDEN (shows "Connect to view contact info")
- [ ] "Connect" button: Prominent, primary CTA
- [ ] Message: "Connect to view full profile and contact information"

*Conditional Content - If Connected*:
- [ ] Location: VISIBLE (country, state, city per visibility preference)
- [ ] Social links: VISIBLE with clickable links
- [ ] "Message" button: Shows options (Discord, LinkedIn, email, website)
- [ ] "Disconnect" button: Secondary action

*Conditional Content - If Blocked*:
- [ ] Profile not visible
- [ ] Message: "This user is not available"

*Navigation*:
- [ ] Back button to browse
- [ ] Related profiles (suggested connections, similar skills)

*Responsive Design*:
- [ ] Mobile: Stacked layout
- [ ] Desktop: Sidebar (profile info) + main (bio, skills, badges)

**Testing Strategy**:

*Privacy Testing*:
- [ ] Not connected: Contact details hidden, "Connect to view" shown
- [ ] Connected: Contact details visible
- [ ] Blocked: Profile not accessible

*Accessibility Testing*:
- [ ] Screen reader: Full profile content announced
- [ ] Color contrast: All text readable
- [ ] Keyboard: Tab through all interactive elements

**Dependencies**: 
- Task 2.2.1 (Browse endpoint - retrieve single profile)
- Task 2.1.3 (Profile data model)

**Blockers**: None

**Related Files**:
- `frontend/pages/profile/[user_id].html`
- `frontend/scripts/profile-detail.js`

---

## Task 2.2.4: Data Privacy

**Priority**: P0 (Critical)  
**Assigned To**: Backend Lead + Security Lead  
**Duration**: 1 day  
**Effort**: 0.5 developer days

**Description**: Enforce contact detail privacy in database queries (visible only to connected users).

**Acceptance Criteria**:

*Privacy Rules*:
- [ ] Contact details (social_links, email, location) encrypted in DB at rest
- [ ] Query logic checks connection status before returning:
  ```
  SELECT profile WHERE user_id=X
  IF requester connected to user_id THEN
    Return full profile (including social_links, location)
  ELSE
    Return profile WITHOUT social_links, location
  ```
- [ ] Admin can view all details (with audit log entry)

*Encryption*:
- [ ] Sensitive fields encrypted: social_links, email (if stored), parental_email
- [ ] Encryption key from Azure Key Vault (not hardcoded)
- [ ] Encrypt on write, decrypt on read

*Audit Logging*:
- [ ] When admin views full profile: Log entry created
  - [ ] Log: {admin_user_id, action: "view_full_profile", target_user_id, timestamp}

*Database Optimization*:
- [ ] Index on (user_id, requester_id, connection_status) for fast privacy checks
- [ ] Minimize queries to check connection status

**Testing Strategy**:

*Privacy Tests*:
- [ ] Not connected: Query returns profile WITHOUT social_links
- [ ] Connected: Query returns profile WITH social_links
- [ ] Admin access: Admin can see full profile, audit log entry created

*Performance Tests*:
- [ ] Privacy check happens in single query (no N+1 queries)

**Dependencies**: 
- Task 2.1.3 (Encryption in profile model)
- Task 2.3.2 (Connection status stored)

**Blockers**: None

**Related Files**:
- `backend/src/profiles/privacy-check.js` (Privacy middleware)
- `backend/tests/privacy.test.js`

---

## Task 2.2.5: Browse Testing

**Priority**: P1  
**Assigned To**: QA / Test Automation  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Comprehensive testing of browse/discovery system.

**Acceptance Criteria**:

*Unit Tests*:
- [ ] Filter logic: All AND/OR combinations
- [ ] Pagination calculations
- [ ] Validation: Invalid params rejected

*Integration Tests*:
- [ ] Browse with filters: Database queries work, results correct
- [ ] Pagination: Total count, per-page limits
- [ ] Performance: Response <500ms with 1000+ profiles
- [ ] Privacy: Contact details not returned unless connected

*E2E Tests (Playwright)*:
- [ ] Browse → filter by seeking → verify results
- [ ] Browse → filter by skills → AND logic verified
- [ ] Browse → pagination → navigate pages
- [ ] Browse → click card → profile detail shows
- [ ] Profile detail → not connected → contact hidden
- [ ] Profile detail → connect → (leads to Week 5 connect flow)

**Testing Strategy**: ≥80% coverage on browse module

**Dependencies**: All browse tasks (2.2.1-2.2.4)

**Blockers**: None

---

## Week 4 Success Criteria (Day 5)

**MUST PASS before Week 5 starts**:
- ✅ Browse endpoint working (<1sec response)
- ✅ Filters: seeking, skills (AND logic), level working
- ✅ Pagination: 20 results/page, navigation works
- ✅ Browse UI: Responsive, accessible (WCAG AA)
- ✅ Profile detail page: Shows full bio, skills, badges
- ✅ Privacy enforcement: Contact details hidden until connected
- ✅ ≥80% unit test coverage
- ✅ E2E tests passing (browse → filter → detail)

---

# WEEK 5: CONNECTION INVITES & MANAGEMENT

## Task 2.3.1: Connection Invite Endpoint

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 1 day  
**Effort**: 0.5 developer days

**Description**: Create endpoint for sending connection invites.

**Acceptance Criteria**:

*Endpoint*: `POST /api/connections/invite`

*Request Body*:
```json
{
  "target_user_id": "github_id"
}
```

*Validation*:
- [ ] Authenticated user required
- [ ] Cannot invite self
- [ ] Cannot duplicate invite (check if already pending/accepted/blocked)

*Response*:
```json
{
  "success": true,
  "connection_id": "uuid",
  "status": "pending"
}
```

*Side Effects*:
- [ ] Create Connection record: {user_a, user_b, status="pending", created_timestamp}
- [ ] Send email to target_user_b: "User A sent you a connection request"
- [ ] Audit log entry (optional)

*Edge Cases*:
- [ ] If A invites B, then B tries to invite A: Reject with "Invite already exists"
- [ ] If A blocks B: B cannot invite A

**Testing Strategy**:

*Unit Tests*:
- [ ] Valid invite: Connection created
- [ ] Self-invite: Rejected
- [ ] Duplicate invite: Rejected
- [ ] Block logic: Blocked user cannot invite

*Integration Tests*:
- [ ] Email sent to target user
- [ ] Connection record inserted to DB

**Dependencies**: 
- Task 1.1.4 (Backend API)
- Task 2.1.5 (Email templates)

**Blockers**: None

---

## Task 2.3.2: Connection Management Endpoints

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Accept, decline, block, disconnect endpoints.

**Acceptance Criteria**:

*Endpoint 1*: `POST /api/connections/{id}/accept`
- [ ] Accept invite → Connection status = "accepted"
- [ ] Both users notified (optional email: "Connection accepted!")
- [ ] Bidirectional visibility enabled
- [ ] Audit log entry

*Endpoint 2*: `POST /api/connections/{id}/decline`
- [ ] Decline invite → Connection deleted
- [ ] Inviter notified (optional)
- [ ] Audit log entry

*Endpoint 3*: `POST /api/connections/{id}/block`
- [ ] Block user → Connection status = "blocked"
- [ ] Permanent block: Blocked user cannot view profile, cannot invite
- [ ] Audit log entry: {action: "block", blocker, blocked_user, timestamp}
- [ ] Appeals process documented (contact admin)

*Endpoint 4*: `POST /api/connections/{id}/disconnect`
- [ ] Remove connection → Connection deleted
- [ ] Both users notified
- [ ] Audit log entry

*Security*:
- [ ] Authenticated user required
- [ ] Can only accept/decline/disconnect own connections
- [ ] Only invitee can accept/decline, either user can block/disconnect

**Testing Strategy**:

*Unit Tests*:
- [ ] Status transitions: pending → accepted, pending → declined, any → blocked
- [ ] Permissions: Only authorized user can accept/decline/block/disconnect

*Integration Tests*:
- [ ] DB updates correctly
- [ ] Emails sent
- [ ] Bidirectional visibility after accept

*E2E Tests*:
- [ ] User A invites B → B receives email → B accepts → both see full profiles

**Dependencies**: 
- Task 2.3.1 (Invite logic)
- Task 2.1.3 (Connection data model)

**Blockers**: None

---

## Task 2.3.3: Connection UI

**Priority**: P1  
**Assigned To**: Frontend Lead  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Build UI for viewing/managing connection invites and connected users.

**Acceptance Criteria**:

*Invites Section* (Dashboard, `/dashboard` or `/invites`):
- [ ] List all pending invites sent to current user
- [ ] Card for each invite: Sender avatar, name, seeking status, "Accept", "Decline", "Block" buttons
- [ ] Accept: Confirm → redirect or modal
- [ ] Decline: Confirm → remove from list
- [ ] Block: Confirm with reason (optional) → permanent block

*Connected Users Section* (Dashboard, `/connections`):
- [ ] List all accepted connections
- [ ] Card for each connection: User avatar, name, seeking status, "Message", "Disconnect" buttons
- [ ] Message: Shows external contact methods (Discord, LinkedIn, email)
- [ ] Disconnect: Confirm → connection removed

*Profile Card Integration*:
- [ ] When not connected: Show "Connect" button
- [ ] When invite pending: Show "Invite Pending" (disabled)
- [ ] When connected: Show "Message" + "Disconnect" buttons
- [ ] When blocked: Show "Blocked" (no actions)

**Testing Strategy**:

*Functional Testing*:
- [ ] Invites list displays correctly
- [ ] Accept/decline buttons work
- [ ] Connected users list displays
- [ ] Message button shows contact methods

*Accessibility Testing*:
- [ ] Keyboard: Tab through buttons, activate with Enter
- [ ] Screen reader: Button purposes announced

**Dependencies**: 
- Task 2.3.1, 2.3.2 (APIs built)
- Task 1.2.1 (Design system)

**Blockers**: None

---

## Task 2.3.4: Bidirectional Visibility

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 1 day  
**Effort**: 0.5 developer days

**Description**: Enable full profile visibility for connected users.

**Acceptance Criteria**:

*On Connection Accept*:
- [ ] Query for connection: WHERE (user_a=X AND user_b=Y) OR (user_a=Y AND user_b=X) AND status='accepted'
- [ ] If found: Return full profile (social_links, location, etc.)
- [ ] If not found: Return limited profile

*Profile Detail Query*:
- [ ] User X requests profile of User Y
- [ ] Check connection status between X and Y
- [ ] If connected (status='accepted'): Return full profile
- [ ] Else: Return limited profile (hide contact details)

*External Contact Methods* ("Message" Button):
- [ ] Show contact options:
  - [ ] Discord: `discord-username` → link to Discord profile or DM
  - [ ] LinkedIn: Full profile URL
  - [ ] Twitter: `@handle` → link to profile
  - [ ] Email: Obfuscated or masked (optional: send via CodePals email system)
  - [ ] Website: Full URL link
- [ ] NO in-app messaging (external links only)

**Testing Strategy**:

*Privacy Tests*:
- [ ] Not connected: Contact methods not returned
- [ ] Connected: Contact methods returned correctly
- [ ] External links: All work and open correct profiles

**Dependencies**: 
- Task 2.3.2 (Accept connection)
- Task 2.2.4 (Privacy enforcement)

**Blockers**: None

---

## Task 2.3.5: Connection Testing

**Priority**: P1  
**Assigned To**: QA / Test Automation  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Comprehensive connection workflow testing.

**Acceptance Criteria**:

*Unit Tests*:
- [ ] Connection status transitions
- [ ] Validation: Duplicate invites, self-invite rejected
- [ ] Block enforcement: Blocked user cannot interact

*Integration Tests*:
- [ ] Full connection workflow: Invite → Accept → Bidirectional visibility
- [ ] Emails: Sent at each step
- [ ] DB: Connections stored correctly

*E2E Tests (Playwright)*:
1. **Happy Path**: User A browses → finds User B → sends invite → User B receives email → User B accepts → Both see full profiles
2. **Decline Flow**: User A invites B → B declines → Invite removed
3. **Block Flow**: User A invites B → B blocks A → A cannot view B's profile → A cannot send invites to B
4. **Disconnect Flow**: A and B connected → A disconnects → Connection removed, both users notified

**Negative Tests**:
- [ ] Duplicate invites rejected
- [ ] Self-invite rejected
- [ ] Blocked user cannot communicate

**Testing Strategy**: ≥80% coverage on connections module

**Dependencies**: All connection tasks (2.3.1-2.3.4)

**Blockers**: None

---

## Phase 2 Completion (Week 5 End)

**MUST PASS before Phase 3 starts**:
- ✅ 50+ user profiles approved
- ✅ ≥10 successful connections established
- ✅ Browse filtering works, <1sec response
- ✅ Contact privacy enforced (hidden until connected)
- ✅ Connection invite workflow end-to-end working
- ✅ Bidirectional visibility: Connected users see full profiles
- ✅ Block functionality: Blocked users cannot view/communicate
- ✅ ≥80% test coverage across all Phase 2 code
- ✅ E2E tests: Signup → Browse → Connect → Bidirectional visibility
- ✅ Zero security incidents (privacy enforced, no data leaks)

---

## Weeks 4-5 Effort Summary

| Week | Task | Duration | Effort | Status |
|------|------|----------|--------|--------|
| 4 | 2.2.1 | 1 day | 1 day | Planning |
| 4 | 2.2.2 | 2 days | 2 days | Planning |
| 4 | 2.2.3 | 1 day | 1 day | Planning |
| 4 | 2.2.4 | 1 day | 0.5 days | Planning |
| 4 | 2.2.5 | 1 day | 1 day | Planning |
| 5 | 2.3.1 | 1 day | 0.5 days | Planning |
| 5 | 2.3.2 | 1 day | 1 day | Planning |
| 5 | 2.3.3 | 1 day | 1 day | Planning |
| 5 | 2.3.4 | 1 day | 0.5 days | Planning |
| 5 | 2.3.5 | 1 day | 1 day | Planning |
| **Total** | | **10 days** | **~9-10 days** | Planning |
