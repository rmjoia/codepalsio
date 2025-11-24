# CodePals API Testing & Code Quality

## Running Tests

### Test Coverage
```bash
npm test              # Run all tests with coverage report
npm run test:watch   # Run tests in watch mode for development
```

Coverage thresholds are set to 70% for:
- Branches
- Functions
- Lines
- Statements

### Linting
```bash
npm run lint         # Check code quality issues
npm run lint:fix    # Automatically fix fixable issues
```

## Code Quality Standards

### Security
- **Input Validation**: All inputs are validated for type, length, and format
- **Injection Prevention**: Query parameters use parameterized queries
- **Error Handling**: Sensitive information is never exposed in error messages
- **Data Sanitization**: User inputs are sanitized before use

### Best Practices
- **Error Boundaries**: All functions have proper error handling
- **Async/Await**: Consistent use of async/await for database operations
- **Environment Variables**: All secrets are loaded from environment
- **Database Connection**: Connection pooling via singleton CosmosClient

### Testing Strategy

#### authUser.test.js
- Input validation (missing userId, username)
- New user creation with termsAccepted=false
- Existing user updates
- Flag preservation during updates
- Timestamp accuracy
- Error handling

#### acceptTerms.test.js
- Input validation
- Terms acceptance marking
- Timestamp recording
- User existence checks
- Error handling

#### profileGet.test.js
- Query parameter validation
- Profile retrieval
- 404 handling for missing profiles
- Data structure integrity
- Injection attack prevention

#### profileSave.test.js
- Bio length validation (50-500 chars)
- Required field validation
- Optional field handling
- Default value assignment
- Array size limits
- XSS prevention

## Security Audit

Run security audits with:
```bash
npm run security:audit   # Check for vulnerable dependencies
npm run validate         # Full validation (lint + test + audit + build)
```

## Validation Checklist

Before committing:
```bash
npm run validate
```

This runs:
1. ✅ ESLint - Code quality
2. ✅ Jest - Unit tests with coverage
3. ✅ npm audit - Dependency security
4. ✅ Build check

## Function Specifications

### POST /api/auth/user
**Validates:**
- userId (required): GitHub user ID
- username (required): GitHub username
- avatarUrl (optional): User's avatar URL

**Returns:**
- New user: termsAccepted=false, isNewUser=true
- Existing user: preserved termsAccepted flag, isNewUser=false
- Timestamps: registrationDate, lastLogin

### POST /api/account/accept-terms
**Validates:**
- userId (required): User identifier

**Returns:**
- User record with termsAccepted=true
- termsAcceptedDate timestamp

### GET /api/profile/get
**Validates:**
- userId (query param): User identifier

**Returns:**
- Complete profile document
- 404 if profile doesn't exist

### POST /api/profile/save
**Validates:**
- userId (required)
- displayName (required): max 100 chars
- bio (required): 50-500 chars
- skills (array, optional): max 20 items
- interests (array, optional): max 20 items
- location (optional): max 100 chars
- timezone (optional): max 50 chars
- availability (optional): active|casual|unavailable

**Returns:**
- Complete updated profile
- createdAt (new profiles only)
- updatedAt (all profiles)

## Development Workflow

1. Write feature code
2. Write tests for the feature
3. Run `npm run lint` - fix any style issues
4. Run `npm test` - ensure tests pass and coverage is adequate
5. Run `npm run security:audit` - check for vulnerabilities
6. Run `npm run validate` - full check before commit

## CI/CD Integration

The GitHub Actions workflow should run:
```yaml
- npm ci
- npm run validate  # lint + test + audit + build
- Deploy if passing
```
