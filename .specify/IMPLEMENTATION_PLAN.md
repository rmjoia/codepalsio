# GitHub Authentication & Registration Flow - Implementation Plan

## Current Status
✅ Domain models (User, Profile)
✅ Infrastructure (UserRepository, AuthService)
✅ OAuth endpoints (/api/auth/login, /api/auth/callback)
✅ No vulnerabilities in dependencies

## Complete User Journey

### 1. Initial Sign-in Flow
**Current:** Landing page → "Sign in with GitHub" → GitHub OAuth → Callback → Welcome

**Need to add:**
- [ ] Terms acceptance page (after first OAuth)
- [ ] Email verification with SendGrid
- [ ] Token-based email confirmation
- [ ] Profile completion prompt

### 2. Terms & Conditions Acceptance
**Route:** `/welcome` (modified)
**Components:**
- Display Terms, Privacy Policy, Code of Conduct (modal or inline)
- Checkbox acceptance (required)
- Continue button (disabled until accepted)
- Store acceptance timestamp in User model

### 3. Email Verification
**After terms acceptance:**
- Generate unique verification token
- Send email via SendGrid
- User clicks link with token
- Verify token and activate account
- Redirect to profile setup

### 4. Profile Setup
**Route:** `/profile/setup`
**Required fields:**
- Display name
- Bio (min 50 chars)
- Skills (min 2)
- Interests (min 2)
- Location
- Timezone
- Privacy setting (public/private)

### 5. Find CodePals (Authenticated Users Only)
**Route:** `/find`
**Features:**
- Search only public profiles
- Filter by skills, interests, location
- Match scoring algorithm
- Request connection button

### 6. Reporting System
**Features:**
- Report button on any profile
- Modal with:
  - Reason (dropdown: harassment, spam, inappropriate content, etc.)
  - Detailed description (required, min 50 chars)
  - Specific dates/events
  - Evidence links (optional)
- Store reports in Cosmos DB (reports container)
- Email admins on new reports

## Required Changes to Domain Models

### User Model Updates
```typescript
- Add: emailVerified: boolean
- Add: emailVerificationToken?: string
- Add: emailVerificationTokenExpiry?: Date
- Add: termsAcceptedAt?: Date
- Add: privacyAcceptedAt?: Date
- Add: codeOfConductAcceptedAt?: Date
- Add: profileVisibility: 'public' | 'private'
```

### New Domain Models Needed
```typescript
- Report entity (reporterId, reportedUserId, reason, description, evidence, status)
- EmailVerificationToken entity
```

## API Endpoints Needed

### Email Verification
- `POST /api/auth/send-verification` - Send/resend verification email
- `GET /api/auth/verify-email?token=xxx` - Verify email token

### Profile Management
- `GET /api/profile` - Get current user's profile
- `POST /api/profile` - Create/update profile
- `PATCH /api/profile/visibility` - Update privacy setting

### Search & Discovery
- `GET /api/users/search?skills=...&interests=...` - Search public profiles
- `GET /api/users/:id` - Get public profile by ID

### Reporting
- `POST /api/reports` - Submit new report
- `GET /api/reports/my` - Get user's submitted reports (optional)

## Security Considerations

### CSRF Protection
- Implement CSRF tokens for state-changing operations
- Use SameSite cookies

### Rate Limiting
- Login attempts: 5 per 15 minutes
- Email sending: 3 per hour
- Report submissions: 5 per day

### Input Sanitization
- HTML escape all user inputs
- Validate email format
- Sanitize URLs in profiles

### Privacy
- Never expose private profiles in search
- Never expose email addresses
- Audit log all privacy-sensitive operations

## SendGrid Integration

### Email Templates Needed
1. **Welcome Email** - After email verification
2. **Verification Email** - With verification link
3. **Report Notification** - To admins
4. **Account Status** - When profile approved/rejected

### Environment Variables
```
SENDGRID_API_KEY=your-key
SENDGRID_FROM_EMAIL=noreply@codepals.io
SENDGRID_ADMIN_EMAIL=admin@codepals.io
```

## Implementation Order (Vertical Slices)

### Slice 1: Terms Acceptance ✅ START HERE
1. Update User model with terms fields
2. Create terms acceptance page
3. Update welcome.astro to show terms
4. Store acceptance in Cosmos DB
5. Tests + commit

### Slice 2: Email Verification
1. Add SendGrid integration
2. Generate verification tokens
3. Send verification email
4. Create verification endpoint
5. Tests + commit

### Slice 3: Profile Setup
1. Create profile setup page
2. Profile creation API
3. Privacy settings
4. Tests + commit

### Slice 4: Find CodePals
1. Search API (public profiles only)
2. Find page UI
3. Profile detail view
4. Tests + commit

### Slice 5: Reporting System
1. Report domain model
2. Report submission API
3. Report UI (modal)
4. Admin notification
5. Tests + commit

## Notes
- Each slice is independently testable and deployable
- User can't access Find CodePals until profile is complete
- All emails are transactional (not marketing)
- Generic language throughout (no pronouns unless provided by GitHub)
- All user content must be sanitized before display
