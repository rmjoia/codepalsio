# Phase 3, Weeks 6-8: Events, Help Board, Karma & Badges System

**Status**: Not Started  
**Target Start**: Week 6 (after ≥10 connections established)  
**Duration**: 3 weeks (15 working days)  
**Total Effort Estimate**: ~30 developer days

---

## Overview

Phase 3 introduces core community engagement features:
- **Week 6**: Events system (users post community events)
- **Week 7**: Help Board & voting (users ask/answer questions)
- **Week 8**: Karma & badges (reputation system & achievement tracking)

These features transform CodePals from a networking app to an engaged community platform.

**Phase 3 Success Criteria**:
- ≥50 events created
- ≥100 help board posts
- ≥200 upvotes/interactions
- ≥30 badges earned across user base

---

# WEEK 6: EVENTS SYSTEM

## Task 3.1.1: Events Data Model & Endpoints

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 1.5 days  
**Effort**: 1.5 developer days

**Description**: Design events data model and build core endpoints for creating, reading, filtering events.

**Acceptance Criteria**:

*Events Table Schema*:
```sql
events:
  - event_id: UUID (primary key)
  - creator_id: string (user_id who created)
  - title: string (100 char max, required)
  - description: string (2000 char max, required)
  - event_type: enum ["workshop", "meetup", "hackathon", "social", "other"]
  - start_datetime: timestamp (ISO 8601)
  - end_datetime: timestamp (ISO 8601, >= start_datetime)
  - timezone: string (IANA timezone, e.g., "Europe/Dublin")
  - location: {
      type: enum ["online", "in-person", "hybrid"],
      city: string (if in-person),
      country: string (if in-person),
      url: string (if online, video conference link),
      address: string (if in-person, street address)
    }
  - max_attendees: integer (optional, null = unlimited)
  - tags: array<string> (e.g., ["React", "Web Dev"], max 5)
  - image_url: string (event banner image, optional)
  - status: enum ["draft", "published", "cancelled"] (default: draft)
  - rsvp_count: integer (denormalized, updated on RSVP changes)
  - created_at: timestamp
  - updated_at: timestamp
  - deleted_at: timestamp (soft delete)
```

*RSVP Table Schema*:
```sql
event_rsvps:
  - rsvp_id: UUID
  - event_id: UUID (foreign key to events)
  - user_id: string (attendee)
  - status: enum ["interested", "attending", "not_attending", "maybe"]
  - created_at: timestamp
  - PRIMARY KEY: (event_id, user_id) - one RSVP per user per event
```

*Endpoints*:

**1. Create Event**: `POST /api/events`
```json
Request:
{
  "title": "React Workshop for Beginners",
  "description": "Learn React fundamentals...",
  "event_type": "workshop",
  "start_datetime": "2025-12-15T18:00:00Z",
  "end_datetime": "2025-12-15T20:00:00Z",
  "timezone": "Europe/Dublin",
  "location": {
    "type": "online",
    "url": "https://zoom.us/j/..."
  },
  "tags": ["React", "Beginners", "Web Dev"],
  "image_url": "https://cdn.codepals.io/events/banner.jpg",
  "max_attendees": 30
}

Response:
{
  "success": true,
  "event_id": "uuid",
  "status": "draft"
}
```

- [ ] Validate: title, description, datetimes required
- [ ] Validate: end_datetime > start_datetime
- [ ] Validate: location.type required; if in-person, require city/country
- [ ] Validate: tags max 5, each ≤20 chars
- [ ] Create event in "draft" status
- [ ] Only event creator can edit/delete

**2. Get Events**: `GET /api/events` (Browse events)
```json
Query params:
- event_type: filter by type
- status: "published" only (default)
- tags: comma-separated, AND logic
- date_from: ISO 8601 (default: today)
- date_to: ISO 8601 (default: 30 days from now)
- location_type: "online", "in-person", or all
- page: pagination
- limit: per page (default 20, max 100)

Response:
{
  "success": true,
  "data": [
    {
      "event_id": "uuid",
      "creator": {
        "user_id": "...",
        "username": "...",
        "avatar": "..."
      },
      "title": "React Workshop",
      "description": "...",
      "event_type": "workshop",
      "start_datetime": "...",
      "end_datetime": "...",
      "timezone": "...",
      "location": {...},
      "tags": ["React", "Beginners"],
      "image_url": "...",
      "rsvp_count": 12,
      "max_attendees": 30,
      "user_rsvp_status": "attending" // current user's RSVP
    }
  ],
  "pagination": {...}
}
```

- [ ] Return only "published" events by default
- [ ] Filter by event_type, tags (AND logic), date range
- [ ] Sort by start_datetime ascending
- [ ] Include current user's RSVP status (if user logged in)

**3. Get Event Detail**: `GET /api/events/{event_id}`
```json
Response:
{
  "success": true,
  "event": {
    "event_id": "uuid",
    "creator": {...},
    "title": "...",
    "description": "...",
    "attendees": [
      {
        "user_id": "...",
        "username": "...",
        "avatar": "...",
        "status": "attending"
      }
    ],
    "user_rsvp_status": "attending"
  }
}
```

- [ ] Return full event details
- [ ] List attendees (only if published or creator viewing)
- [ ] Include current user's RSVP status

**4. Update Event**: `PATCH /api/events/{event_id}`
- [ ] Only creator can update (check creator_id)
- [ ] Can update: title, description, datetime, location, max_attendees, tags
- [ ] Cannot change: creator_id, created_at

**5. Publish Event**: `POST /api/events/{event_id}/publish`
- [ ] Change status from "draft" → "published"
- [ ] Send notification to followers/all users (optional, Week 7)
- [ ] Only creator can publish

**6. Cancel Event**: `POST /api/events/{event_id}/cancel`
- [ ] Change status to "cancelled"
- [ ] Notify all attendees (email)
- [ ] Refund/cancel RSVPs

*Database Indexes*:
- [ ] (status, start_datetime) - for "upcoming events" queries
- [ ] (creator_id) - for "my events" queries
- [ ] (tags) - for tag-based filtering
- [ ] (event_type) - for type filtering

**Testing Strategy**:

*Unit Tests*:
- [ ] Validation: Missing fields → 400 error
- [ ] Validation: end_datetime < start_datetime → error
- [ ] Status transitions: draft → published, published → cancelled
- [ ] Authorization: Non-creator cannot update

*Integration Tests*:
- [ ] Create event → retrieve → verify all fields
- [ ] Filter by type, tags, date range
- [ ] Performance: Query with 1000+ events, <500ms response

*E2E Tests*:
- [ ] Create event (draft) → publish → visible in browse

**Dependencies**: 
- Task 1.1.4 (Backend API skeleton)
- Task 2.1.3 (User model, creator_id)

**Blockers**: None

**Related Files**:
- `backend/src/events/model.js`
- `backend/src/events/endpoints.js`
- `backend/tests/events.test.js`

---

## Task 3.1.2: RSVP Endpoints

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 0.5 days  
**Effort**: 0.5 developer days

**Description**: Build RSVP endpoints for users to register interest in events.

**Acceptance Criteria**:

*Endpoint 1*: `POST /api/events/{event_id}/rsvp`
```json
Request:
{
  "status": "attending" // or "interested", "maybe", "not_attending"
}

Response:
{
  "success": true,
  "rsvp_status": "attending"
}
```

- [ ] Validate: status is one of allowed values
- [ ] Create or update RSVP record
- [ ] Increment event.rsvp_count (denormalized for fast queries)
- [ ] Check max_attendees: If full, disallow "attending" (allow "interested")
- [ ] Authenticated user required

*Endpoint 2*: `DELETE /api/events/{event_id}/rsvp`
- [ ] Remove RSVP
- [ ] Decrement rsvp_count
- [ ] If event cancelled: Auto-remove all RSVPs

*Endpoint 3*: `GET /api/users/{user_id}/events`
- [ ] Get user's RSVPd events
- [ ] Filter by status: "attending", "interested", "maybe"
- [ ] Sort by start_datetime

*Side Effects*:
- [ ] On RSVP: Optional notification to event creator (Week 7)

**Testing Strategy**:

*Unit Tests*:
- [ ] Valid RSVP statuses accepted
- [ ] Max attendees check: Can't RSVP "attending" when full
- [ ] RSVP count updated correctly

*Integration Tests*:
- [ ] RSVP → event rsvp_count incremented
- [ ] Remove RSVP → rsvp_count decremented

**Dependencies**: 
- Task 3.1.1 (Events model)

**Blockers**: None

---

## Task 3.1.3: Events Page Frontend

**Priority**: P1  
**Assigned To**: Frontend Lead  
**Duration**: 1.5 days  
**Effort**: 1.5 developer days

**Description**: Build responsive events browse page with filters, event cards, detail modal/page.

**Acceptance Criteria**:

*Events Browse Page* (`/events`):
- [ ] Filter panel (left sidebar or top bar):
  - [ ] Event type: Checkboxes for workshop, meetup, hackathon, social, other
  - [ ] Date range: Start/end date pickers
  - [ ] Location: Radio buttons for online/in-person/hybrid
  - [ ] Tags: Multi-select autocomplete (searchable)
  - [ ] Clear filters button
- [ ] Events list/grid (right):
  - [ ] Card per event: Title, creator, date/time, type badge, rsvp_count, image
  - [ ] Quick RSVP buttons: "Attending", "Interested", "Maybe", "Not Going"
  - [ ] Responsive: Grid on desktop (3 cols), 2 cols tablet, 1 col mobile
  - [ ] Click card → Event detail (modal or navigate to `/events/{id}`)
- [ ] Empty state: "No events found"
- [ ] Loading: Spinner while fetching

*Event Detail*:
- [ ] Full event info: Title, description, creator, date/time, location, tags, image, attendees list
- [ ] RSVP section: Show current user's status + buttons to change
- [ ] Attendees list: Show avatars, names, usernames
- [ ] Share buttons: Copy link, share to Discord, email
- [ ] Map (if in-person): Show location on map (Mapbox or similar)

*Responsive Design*:
- [ ] Mobile (320px): Single column, filters collapsible
- [ ] Tablet (768px): Two-column
- [ ] Desktop (1024px+): Full-width

*Performance*:
- [ ] Load time: <2 seconds
- [ ] Lazy load images

*Accessibility*:
- [ ] WCAG 2.1 AA compliant
- [ ] Keyboard navigation: Tab through filters, cards, buttons
- [ ] Screen reader: Event details announced

**Testing Strategy**:

*Functional*:
- [ ] Filter combinations work
- [ ] RSVP buttons functional
- [ ] Card click navigates to detail

*Responsive*:
- [ ] Mobile, tablet, desktop layouts correct

*Accessibility*:
- [ ] Keyboard navigation works
- [ ] Screen reader friendly

**Dependencies**: 
- Task 3.1.1, 3.1.2 (Events endpoints)
- Task 1.2.1 (Design system)

**Blockers**: None

---

## Task 3.1.4: Event Creation Form

**Priority**: P1  
**Assigned To**: Frontend Lead  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Build event creation/editing form for users.

**Acceptance Criteria**:

*Event Creation Form* (`/events/create`):
- [ ] Form fields:
  - [ ] Title: Text input (100 char max, with char counter)
  - [ ] Description: Textarea (2000 char max, with char counter)
  - [ ] Event Type: Dropdown (workshop, meetup, hackathon, social, other)
  - [ ] Start Date/Time: Datetime picker
  - [ ] End Date/Time: Datetime picker (must be >= start)
  - [ ] Timezone: Dropdown (auto-detect user's timezone)
  - [ ] Location Type: Radio buttons (online/in-person/hybrid)
  - [ ] Location Details:
    - [ ] If online: URL input (Zoom, Google Meet, etc.)
    - [ ] If in-person: City, country, address inputs
  - [ ] Max Attendees: Number input (optional)
  - [ ] Tags: Multi-select searchable input (add up to 5)
  - [ ] Banner Image: Image upload (drag-and-drop)
  - [ ] Save as Draft button
  - [ ] Publish button

*Validation (Client-side)*:
- [ ] Required fields: Title, description, datetimes, location
- [ ] Date validation: End >= start
- [ ] Tags: Max 5, each ≤20 chars

*Validation (Server-side)*:
- [ ] All above + content moderation (Task 3.1.5)

*Image Upload*:
- [ ] Accept PNG, JPG (max 5MB)
- [ ] Resize to 1200x630px for banner
- [ ] Upload to Azure Blob Storage (or CDN)
- [ ] Return image URL

*Draft Saving*:
- [ ] Auto-save draft every 30 seconds (optional)
- [ ] Show "Draft saved" notification
- [ ] Retrieve draft on page revisit (if in-progress)

**Testing Strategy**:

*Functional*:
- [ ] Form validation works (client and server)
- [ ] Image upload works, resized correctly
- [ ] Draft saved and retrieved

*Accessibility*:
- [ ] Form labels associated with inputs
- [ ] Keyboard navigation through form

**Dependencies**: 
- Task 3.1.1 (Events endpoints)
- Task 1.2.1 (Design system)

**Blockers**: None

---

## Task 3.1.5: Events Testing

**Priority**: P1  
**Assigned To**: QA / Test Automation  
**Duration**: 0.5 days  
**Effort**: 0.5 developer days

**Description**: Comprehensive testing of events system.

**Acceptance Criteria**:

*Unit Tests*:
- [ ] Event creation validation (all fields)
- [ ] RSVP status transitions
- [ ] Max attendees enforcement

*Integration Tests*:
- [ ] Create event → retrieve → verify all fields
- [ ] Filter by type, tags, date range
- [ ] RSVP → rsvp_count updated
- [ ] Event cancellation → all RSVPs removed

*E2E Tests (Playwright)*:
1. **Create & Publish**: User creates event (draft) → fills all fields → publishes → visible in browse
2. **Browse & RSVP**: User browses events → filters by type → RSVPs "attending" → appears in "My Events"
3. **Event Full**: Event at max_attendees → new user can RSVP "interested" but not "attending"

**Testing Strategy**: ≥80% coverage on events module

**Effort**: 0.5 developer days

**Dependencies**: All events tasks (3.1.1-3.1.4)

**Blockers**: None

---

## Week 6 Success Criteria (Day 5)

**MUST PASS before Week 7 starts**:
- ✅ Events endpoints working (create, read, RSVP)
- ✅ Validation: All required fields enforced
- ✅ Events page responsive, accessible (WCAG AA)
- ✅ Filtering: By type, date, location, tags working
- ✅ RSVP: Users can set status, max_attendees enforced
- ✅ Image upload: Works, resized to correct dimensions
- ✅ ≥80% test coverage
- ✅ E2E tests passing

---

# WEEK 7: HELP BOARD & VOTING SYSTEM

## Task 3.2.1: Help Board Data Model & Endpoints

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Design help board (Q&A) data model and core endpoints.

**Acceptance Criteria**:

*Help Board Tables*:

**1. Posts Table**:
```sql
help_board_posts:
  - post_id: UUID (primary key)
  - creator_id: string (user_id who asked/answered)
  - title: string (200 char max, required if post_type="question")
  - content: string (5000 char max, required)
  - post_type: enum ["question", "answer"] (default: question)
  - parent_post_id: UUID (null if question, references question if answer)
  - tags: array<string> (max 5 tags, e.g., ["React", "CSS"])
  - status: enum ["active", "resolved", "archived"] (default: active)
  - upvote_count: integer (denormalized, default 0)
  - answer_count: integer (for questions, denormalized)
  - created_at: timestamp
  - updated_at: timestamp
  - deleted_at: timestamp (soft delete)
```

**2. Votes Table**:
```sql
help_board_votes:
  - vote_id: UUID
  - post_id: UUID (foreign key)
  - user_id: string (who voted)
  - vote_type: enum ["upvote", "downvote"] // NOTE: Start with upvotes only (Week 8 downvotes)
  - created_at: timestamp
  - PRIMARY KEY: (post_id, user_id) - one vote per user per post
```

*Endpoints*:

**1. Create Question**: `POST /api/help-board/questions`
```json
Request:
{
  "title": "How do I center a div in CSS?",
  "content": "I'm trying to center a div both horizontally and vertically...",
  "tags": ["CSS", "HTML"]
}

Response:
{
  "success": true,
  "post_id": "uuid",
  "post_type": "question"
}
```

- [ ] Validate: title (required, 1-200 chars), content (required, 1-5000 chars)
- [ ] Validate: tags max 5
- [ ] Create question in "active" status
- [ ] Spam filter (optional, Week 8)

**2. Create Answer**: `POST /api/help-board/questions/{question_id}/answers`
```json
Request:
{
  "content": "You can use flexbox or grid..."
}

Response:
{
  "success": true,
  "post_id": "uuid",
  "post_type": "answer"
}
```

- [ ] Validate: content required, 1-5000 chars
- [ ] Create answer record with parent_post_id = question_id
- [ ] Increment question.answer_count

**3. Get Questions**: `GET /api/help-board/questions`
```json
Query params:
- tags: comma-separated (AND logic)
- sort: "newest", "most-upvoted", "most-answered"
- status: "active", "resolved", "archived"
- search: Full-text search on title + content
- page, limit

Response:
{
  "success": true,
  "data": [
    {
      "post_id": "uuid",
      "creator": {user_id, username, avatar, karma_score},
      "title": "How do I center a div?",
      "content_preview": "I'm trying to center a div...",
      "tags": ["CSS", "HTML"],
      "upvote_count": 42,
      "answer_count": 3,
      "user_voted": false // current user's vote
    }
  ]
}
```

- [ ] Return only "active" questions by default
- [ ] Sort by: newest (created_at DESC), most-upvoted, most-answered
- [ ] Full-text search: Search title + content
- [ ] Return preview (first 200 chars of content)

**4. Get Question Detail**: `GET /api/help-board/questions/{question_id}`
```json
Response:
{
  "success": true,
  "question": {
    "post_id": "uuid",
    "creator": {...},
    "title": "...",
    "content": "...",
    "tags": [...],
    "upvote_count": 42,
    "created_at": "...",
    "answers": [
      {
        "post_id": "uuid",
        "creator": {...},
        "content": "...",
        "upvote_count": 15,
        "created_at": "..."
      }
    ],
    "user_voted": false
  }
}
```

- [ ] Return question + all answers sorted by upvote_count DESC
- [ ] Include current user's vote status (for karma tracking)

**5. Mark as Resolved**: `POST /api/help-board/questions/{question_id}/resolve`
- [ ] Only question creator can mark as resolved
- [ ] Change status: "active" → "resolved"
- [ ] Award karma to accepted answer author (Task 3.3)

*Indexes*:
- [ ] (post_type, status, created_at) - for "recent questions" queries
- [ ] (tags) - for tag filtering
- [ ] (upvote_count, created_at) - for "most upvoted"

**Testing Strategy**:

*Unit Tests*:
- [ ] Question creation validation
- [ ] Answer creation validation
- [ ] Status transitions

*Integration Tests*:
- [ ] Create question → retrieve → all fields correct
- [ ] Create answer → question.answer_count incremented
- [ ] Filter by tags, sort by upvotes

**Dependencies**: 
- Task 1.1.4 (Backend API)
- Task 2.1.3 (User model)

**Blockers**: None

---

## Task 3.2.2: Upvote Endpoints & Karma Integration

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 0.5 days  
**Effort**: 0.5 developer days

**Description**: Build upvoting endpoints and integrate with karma system.

**Acceptance Criteria**:

*Endpoint*: `POST /api/help-board/{post_id}/upvote`
```json
Request:
{} // no body needed

Response:
{
  "success": true,
  "upvote_count": 43
}
```

- [ ] Validate: Authenticated user required
- [ ] Validate: Cannot upvote own post
- [ ] Check if user already upvoted (idempotent):
  - [ ] If already upvoted: Remove vote (toggle)
  - [ ] Else: Add upvote
- [ ] Update post.upvote_count (denormalized)
- [ ] Award karma to post author:
  - [ ] +1 karma per upvote (on first upvote by this user)
  - [ ] -1 karma if upvote removed
  - [ ] Max karma awarded per post: 50 (cap to prevent gaming)

*Endpoint*: `GET /api/help-board/{post_id}/votes`
- [ ] Return vote count + current user's vote status
- [ ] Include upvoters' list (optional, for transparency)

*Side Effects*:
- [ ] Track upvote events for ranking algorithm (Week 8)
- [ ] Optional notification to post author (Week 7+)

**Testing Strategy**:

*Unit Tests*:
- [ ] Upvote creates vote record
- [ ] Duplicate upvote removes vote (toggle)
- [ ] Cannot upvote own post
- [ ] Self-upvote attempt → error

*Integration Tests*:
- [ ] Upvote → upvote_count incremented
- [ ] Upvote → author karma incremented (+1)
- [ ] Remove upvote → karma decremented (-1)
- [ ] Karma max cap enforced (50 per post)

**Dependencies**: 
- Task 3.2.1 (Help board posts)
- Task 3.3.1 (Karma data model - Week 8, but can build stubs)

**Blockers**: None

---

## Task 3.2.3: Help Board Frontend

**Priority**: P1  
**Assigned To**: Frontend Lead  
**Duration**: 1.5 days  
**Effort**: 1.5 developer days

**Description**: Build help board browse and question detail pages.

**Acceptance Criteria**:

*Help Board Browse Page* (`/help-board`):
- [ ] Filter panel:
  - [ ] Tags: Multi-select autocomplete
  - [ ] Sort: Dropdown (Newest, Most Upvoted, Most Answered)
  - [ ] Search: Text input for full-text search
- [ ] Questions list:
  - [ ] Question card: Title, creator, tags, upvote_count, answer_count, created_date
  - [ ] Responsive grid (desktop 3 cols, mobile 1)
  - [ ] Click → Question detail page
- [ ] "Ask Question" button (CTA) → Create question form
- [ ] Empty state: "Be the first to ask a question!"
- [ ] Loading: Spinner

*Question Detail Page* (`/help-board/questions/{id}`):
- [ ] Question:
  - [ ] Title, creator, tags, content (full markdown)
  - [ ] Upvote button + count
  - [ ] "Mark as Resolved" button (if creator)
  - [ ] Created/updated dates
- [ ] Answers section:
  - [ ] List all answers sorted by upvotes DESC
  - [ ] Per answer: Creator, content (markdown), upvote button + count, created date
  - [ ] Answer marked as "Accepted" (checkmark icon) if question resolved
- [ ] "Add Answer" button → Answer form (modal or collapse)
- [ ] Responsive design

*Accessibility (WCAG 2.1 AA)*:
- [ ] Keyboard: Tab through questions, buttons
- [ ] Screen reader: Question titles, answer counts announced

**Testing Strategy**:

*Functional*:
- [ ] Filter by tags works
- [ ] Search works
- [ ] Sort by upvotes works
- [ ] Upvote button toggles (adds/removes vote)
- [ ] Create question/answer forms work

*Responsive*:
- [ ] Mobile, tablet, desktop layouts correct

*Accessibility*:
- [ ] Keyboard navigation works
- [ ] Screen reader friendly

**Dependencies**: 
- Task 3.2.1, 3.2.2 (Help board endpoints)
- Task 1.2.1 (Design system - Markdown rendering)

**Blockers**: None

---

## Task 3.2.4: Help Board Testing

**Priority**: P1  
**Assigned To**: QA / Test Automation  
**Duration**: 0.5 days  
**Effort**: 0.5 developer days

**Description**: Comprehensive testing of help board and voting system.

**Acceptance Criteria**:

*Unit Tests*:
- [ ] Question/answer creation validation
- [ ] Upvote logic: Toggle, self-vote prevention
- [ ] Karma award calculation

*Integration Tests*:
- [ ] Create question → retrieve → fields correct
- [ ] Answer creation → question.answer_count incremented
- [ ] Upvote → upvote_count incremented, author karma incremented
- [ ] Sorting: Most upvoted, newest, most answered

*E2E Tests (Playwright)*:
1. **Create & Answer**: User A creates question → User B answers → User A upvotes answer → answer moves to top
2. **Mark Resolved**: User A marks answer as resolved → answer marked with checkmark
3. **Karma Gain**: User B creates answer → users upvote → User B gains karma (visible on profile)

**Testing Strategy**: ≥80% coverage on help board module

**Dependencies**: All help board tasks (3.2.1-3.2.3)

**Blockers**: None

---

## Week 7 Success Criteria (Day 5)

**MUST PASS before Week 8 starts**:
- ✅ Help board questions/answers working
- ✅ Full-text search working, results relevant
- ✅ Filtering by tags, sorting (newest/upvoted) working
- ✅ Upvoting works, togglable, karma awarded
- ✅ Question detail page shows all answers sorted by upvotes
- ✅ Help board page responsive, accessible (WCAG AA)
- ✅ ≥80% test coverage
- ✅ E2E tests passing
- ✅ 100+ help board posts created

---

# WEEK 8: KARMA & BADGES SYSTEM

## Task 3.3.1: Karma & Badges Data Models

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Design karma and badges data models.

**Acceptance Criteria**:

*Karma Table*:
```sql
user_karma:
  - user_id: string (primary key, foreign key to users)
  - total_karma: integer (default 0, minimum 0)
  - karma_breakdown: {
      "help_board_upvotes": integer, // +1 per upvote on your post
      "question_answered": integer, // +5 per question answered
      "connection_made": integer, // +2 per connection
      "event_attended": integer, // +3 per event attended (Week 9)
      "badge_earned": integer, // +10 per badge earned
      "verified_mentor": integer, // +20 for mentor verification
      "event_created": integer, // +5 per event created
      "helpful_comment": integer // +2 per helpful vote on comment (optional)
    }
  - last_updated: timestamp
```

*Badges Table*:
```sql
badges:
  - badge_id: UUID (primary key)
  - name: string (e.g., "First Question Answered")
  - description: string (e.g., "You answered your first help board question!")
  - icon_url: string (SVG icon)
  - category: enum ["achievement", "milestone", "community"]
  - trigger_event: string (JSON object specifying trigger condition)
    - Example for "First Answer": {event: "answer_created", count: 1}
    - Example for "Helpful": {event: "post_upvotes", threshold: 10}
  - created_at: timestamp
```

**Sample Badges**:

| Badge | Category | Trigger | Karma |
|-------|----------|---------|-------|
| First Question | achievement | Ask first question on help board | +0 (just badge) |
| First Answer | achievement | Answer first question | +0 |
| Helpful (10 upvotes) | milestone | Post receives 10 upvotes | +0 |
| Mentor (20 connections) | milestone | Make 20 connections | +0 |
| Community Leader (50 karma) | achievement | Reach 50 karma | +0 |
| Event Organizer | community | Create 5 events | +0 |
| Response Master | achievement | Answer 50 help board questions | +0 |

*User Badges Table*:
```sql
user_badges:
  - user_badge_id: UUID
  - user_id: string
  - badge_id: UUID
  - earned_at: timestamp
  - PRIMARY KEY: (user_id, badge_id) - one badge per user
```

*Karma Triggers* (Business Logic):
- [ ] Help board upvote: +1 karma to post author
- [ ] Question answered: +5 karma to question author when answered (optional)
- [ ] Connection made: +2 karma to both users
- [ ] Badge earned: +10 karma (only for major badges, not all)
- [ ] Event created: +5 karma
- [ ] Mentor verification: +20 karma (Week 9+)

**Testing Strategy**:

*Unit Tests*:
- [ ] Karma calculation: Add/subtract correctly
- [ ] Karma minimum: Cannot go below 0
- [ ] Badge triggers: Fire at correct thresholds

**Dependencies**: 
- Task 1.1.4 (Backend API)
- Task 2.1.3 (User model)

**Blockers**: None

---

## Task 3.3.2: Badge Award Endpoint & Automation

**Priority**: P1  
**Assigned To**: Backend Lead  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Build endpoint to award badges and automate badge awards based on user actions.

**Acceptance Criteria**:

*Endpoints*:

**1. Award Badge**: `POST /api/users/{user_id}/badges/{badge_id}`
- [ ] Admin-only endpoint
- [ ] Check if user already has badge (prevent duplicates)
- [ ] Create user_badge record
- [ ] Increment user karma (if badge grants karma)
- [ ] Send notification to user (email)

**2. Get User Badges**: `GET /api/users/{user_id}/badges`
```json
Response:
{
  "success": true,
  "badges": [
    {
      "badge_id": "uuid",
      "name": "First Answer",
      "description": "You answered your first question",
      "icon_url": "https://cdn.codepals.io/badges/first-answer.svg",
      "earned_at": "2025-12-20T10:30:00Z"
    }
  ]
}
```

*Automation Rules*:
- [ ] **First Question**: Trigger when user creates first help board question
  - [ ] Check: COUNT(user's questions) == 1
  - [ ] Award: "First Question" badge
- [ ] **First Answer**: Trigger when user creates first help board answer
  - [ ] Check: COUNT(user's answers) == 1
  - [ ] Award: "First Answer" badge
- [ ] **Helpful** (10 upvotes): Trigger when post reaches 10 upvotes
  - [ ] Check: post.upvote_count >= 10
  - [ ] Award: "Helpful" badge (if not already awarded)
- [ ] **Mentor** (20 connections): Trigger when user reaches 20 connections
  - [ ] Check: COUNT(user's accepted connections) >= 20
  - [ ] Award: "Mentor" badge
- [ ] **Community Leader** (50 karma): Trigger when user reaches 50 karma
  - [ ] Check: user.total_karma >= 50
  - [ ] Award: "Community Leader" badge + 10 karma
- [ ] **Event Organizer** (5 events created): Trigger when user creates 5th event
  - [ ] Check: COUNT(user's events) >= 5
  - [ ] Award: "Event Organizer" badge
- [ ] **Response Master** (50 answers): Trigger when user answers 50 questions
  - [ ] Check: COUNT(user's answers) >= 50
  - [ ] Award: "Response Master" badge

*Implementation*:
- [ ] Use event-driven architecture: When upvote/answer/connection happens, check badge triggers
- [ ] Async processing (queue): Don't block main request
- [ ] Idempotent: If badge already awarded, do nothing

**Testing Strategy**:

*Unit Tests*:
- [ ] Badge triggers fire at correct thresholds
- [ ] No duplicate badge awards
- [ ] Karma incremented when badge awarded

*Integration Tests*:
- [ ] User creates question → "First Question" badge awarded
- [ ] Post reaches 10 upvotes → "Helpful" badge awarded
- [ ] User reaches 20 connections → "Mentor" badge awarded

**Dependencies**: 
- Task 3.3.1 (Badge models)
- Task 3.2.2 (Upvote events)
- Task 2.3 (Connection events)

**Blockers**: None

---

## Task 3.3.3: Karma & Badges Frontend Display

**Priority**: P1  
**Assigned To**: Frontend Lead  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Display karma score and badges on user profiles and in leaderboard.

**Acceptance Criteria**:

*User Profile Updates*:
- [ ] Karma score displayed prominently: "⭐ Karma: 42" (with emoji or icon)
- [ ] Badges section: Show all earned badges as icon grid
  - [ ] Per badge: Icon, name, earned date (on hover)
  - [ ] Clickable: Shows badge description modal
- [ ] Karma breakdown (optional expandable section):
  - [ ] Show breakdown by category (help board upvotes: +5, connections: +4, etc.)

*Leaderboard Page* (`/leaderboard`):
- [ ] Top 50 users by karma score
- [ ] Columns: Rank, Username, Avatar, Karma Score, Badges (count), This Week (karma gained)
- [ ] Search: Find user by username
- [ ] Filter: "All Time", "This Month", "This Week"
- [ ] Responsive table

*Badges Gallery* (Optional, `/badges`):
- [ ] Show all available badges
- [ ] Per badge: Icon, name, description, unlock condition, rarity (how many users have it)
- [ ] User's earned badges highlighted

*Notifications*:
- [ ] When badge earned: Toast notification ("Congratulations! You earned 'First Answer' badge!")
- [ ] Email notification: "You've earned a new badge!" (optional)

**Testing Strategy**:

*Functional*:
- [ ] Karma score updates when action taken (upvote, connection)
- [ ] Badge appears on profile after earned
- [ ] Leaderboard displays top users
- [ ] Badges clickable, show description

*Responsive*:
- [ ] Mobile, tablet, desktop layouts correct

*Accessibility*:
- [ ] Karma score announced by screen reader
- [ ] Badges have alt text

**Dependencies**: 
- Task 3.3.1, 3.3.2 (Karma/badge endpoints)
- Task 1.2.1 (Design system)

**Blockers**: None

---

## Task 3.3.4: Karma & Badges Testing

**Priority**: P1  
**Assigned To**: QA / Test Automation  
**Duration**: 1 day  
**Effort**: 1 developer day

**Description**: Comprehensive testing of karma and badges system.

**Acceptance Criteria**:

*Unit Tests*:
- [ ] Karma calculations: Add/subtract correctly, minimum 0
- [ ] Badge triggers: Fire at correct thresholds
- [ ] No duplicate badges

*Integration Tests*:
- [ ] Upvote → author karma increases
- [ ] Connection → both users karma increases
- [ ] Badge trigger → badge awarded, karma incremented
- [ ] Leaderboard: Ranks correct based on karma

*E2E Tests (Playwright)*:
1. **Earn Badges**: User answers first question → "First Answer" badge earned → visible on profile
2. **Karma Progression**: User answers questions → gets upvotes → karma increases → moves up leaderboard
3. **Badge Recognition**: User reaches 50 karma → "Community Leader" badge awarded + 10 karma (now 60)
4. **Leaderboard**: Check leaderboard shows users in correct rank order

**Negative Tests**:
- [ ] Cannot earn same badge twice
- [ ] Karma doesn't go below 0

**Testing Strategy**: ≥80% coverage on karma/badges module

**Dependencies**: All karma/badges tasks (3.3.1-3.3.3)

**Blockers**: None

---

## Phase 3 Completion (Week 8 End)

**MUST PASS before Phase 4 starts**:
- ✅ Events system fully working (create, RSVP, browse, ≥50 events)
- ✅ Help board fully working (Q&A, upvotes, ≥100 posts)
- ✅ Karma system working (accumulates correctly, ≥200 total karma across users)
- ✅ Badges system working (≥30 badges earned across user base)
- ✅ Leaderboard displays top users by karma
- ✅ All features responsive, accessible (WCAG AA)
- ✅ ≥80% test coverage across Phase 3 code
- ✅ E2E tests: Create event → RSVP, Ask question → Answer → Earn karma & badges
- ✅ Performance: <1sec for all queries
- ✅ No spam/abuse (moderation ready for Week 9+)

---

## Weeks 6-8 Effort Summary

| Week | Task | Duration | Effort | Status |
|------|------|----------|--------|--------|
| 6 | 3.1.1 | 1.5 days | 1.5 days | Planning |
| 6 | 3.1.2 | 0.5 days | 0.5 days | Planning |
| 6 | 3.1.3 | 1.5 days | 1.5 days | Planning |
| 6 | 3.1.4 | 1 day | 1 day | Planning |
| 6 | 3.1.5 | 0.5 days | 0.5 days | Planning |
| 7 | 3.2.1 | 1 day | 1 day | Planning |
| 7 | 3.2.2 | 0.5 days | 0.5 days | Planning |
| 7 | 3.2.3 | 1.5 days | 1.5 days | Planning |
| 7 | 3.2.4 | 0.5 days | 0.5 days | Planning |
| 8 | 3.3.1 | 1 day | 1 day | Planning |
| 8 | 3.3.2 | 1 day | 1 day | Planning |
| 8 | 3.3.3 | 1 day | 1 day | Planning |
| 8 | 3.3.4 | 1 day | 1 day | Planning |
| **Total** | | **14.5 days** | **15 days** | Planning |
