# Phase 1, Week 1: Infrastructure & Setup

**Status**: Not Started  
**Target Start**: Week 1  
**Duration**: 5 days  
**Effort Estimate**: ~50 developer days (distributed)

---

## Task Breakdown

### Task 1.1.1: Azure Infrastructure Setup
**Priority**: P0 (Blocker)  
**Assigned To**: DevOps / Backend Lead  
**Duration**: 3 days  
**Effort**: 3 days

**Description**: Provision all Azure resources required for MVP backend infrastructure.

**Acceptance Criteria**:
- [ ] Azure subscription created / resource group configured
- [ ] Cosmos DB free tier (400 RU/s) provisioned and connection string saved
- [ ] Connection string stored securely in Azure Key Vault (NOT in code)
- [ ] Azure Storage account created for email templates and logo assets
- [ ] HTTPS enforced on all endpoints
- [ ] Custom domain configured (if available, optional for MVP)
- [ ] Secret rotation policy: 90 days
- [ ] Key Vault access logged and audited
- [ ] Connection pool optimization for free tier (≤400 RU/s)

**Testing**:
- [ ] Database connectivity tested from local machine (connection string works)
- [ ] Key Vault access tested (retrieve secret programmatically)
- [ ] HTTPS tested (no mixed content warnings)

**Dependencies**: None  
**Blockers**: Azure subscription creation  
**Related Files**: 
  - `.github/workflows/secrets.yml` (secret rotation automation)
  - `docs/INFRASTRUCTURE.md` (setup runbook for future developers)

---

### Task 1.1.2: GitHub OAuth Configuration
**Priority**: P0  
**Assigned To**: Backend Lead  
**Duration**: 2 days  
**Effort**: 1 day

**Description**: Register and configure GitHub OAuth app for CodePals.io; enable user authentication flow.

**Acceptance Criteria**:
- [ ] GitHub OAuth app registered in project owner's account (Settings → Developer Settings → OAuth Apps)
- [ ] App name: CodePals.io MVP
- [ ] Client ID and Client Secret generated
- [ ] Authorization callback URL: `https://codepals.io/auth/callback` (or `http://localhost:3000/auth/callback` for dev)
- [ ] Client Secret stored in Azure Key Vault (NOT in environment file or code)
- [ ] OAuth flow documented: `/login` → GitHub → `/auth/callback` → session established
- [ ] Token expiration policy documented (GitHub's default: 1 hour access token, refresh token available)
- [ ] OAuth scopes minimal: `user:email, read:user` (no write access requested)

**Testing**:
- [ ] OAuth redirect works: Click "Sign in with GitHub" → Redirects to GitHub → Approve → Back to `/auth/callback`
- [ ] Session created: After OAuth, user ID stored in session/JWT
- [ ] Token refresh works: Access token expires, refresh token used to get new access token
- [ ] Edge case: User denies OAuth permission → Graceful error message shown

**Dependencies**: Task 1.1.1 (Azure setup for Key Vault)  
**Blockers**: None  
**Related Files**:
  - `backend/src/auth.js` (OAuth flow implementation)
  - `backend/src/middleware/auth.js` (authentication middleware)
  - `docs/OAUTH.md` (OAuth flow diagram)

---

### Task 1.1.3: CI/CD Pipeline (GitHub Actions)
**Priority**: P0  
**Assigned To**: DevOps / Full-Stack Lead  
**Duration**: 2 days  
**Effort**: 2 days

**Description**: Setup automated build, test, security scan, and deploy pipeline via GitHub Actions.

**Acceptance Criteria**:
- [ ] `.github/workflows/deploy.yml` created
- [ ] Trigger: On push to `main` branch
- [ ] Workflow steps:
  - [ ] Checkout code
  - [ ] Install dependencies (`npm ci`)
  - [ ] Lint (`npm run lint`) - must pass, 0 errors
  - [ ] Run unit tests (`npm run test`) - must pass with ≥80% coverage
  - [ ] Secret scanning (`GitHub Advanced Security` or `TruffleHog`) - must find 0 exposed credentials
  - [ ] Build static site (`npm run build` with Statiq)
  - [ ] Deploy to Azure Static Web Apps (`azure/static-web-apps-deploy@v1`)
- [ ] Deployment gate: PR cannot merge until all checks pass
- [ ] Build artifacts cached to speed up repeated builds
- [ ] Log retention: Build logs retained for 90 days
- [ ] Email notifications on build failure (to team)
- [ ] Badge in README showing pipeline status

**Testing**:
- [ ] Trigger workflow manually: Commit dummy file to main → Pipeline runs → All steps pass
- [ ] Simulate test failure: One test fails → Pipeline fails → PR blocked
- [ ] Simulate coverage failure: Coverage <80% → Pipeline fails → PR blocked
- [ ] Simulate secret: Commit fake AWS key → Secret scanner catches it → Pipeline fails

**Dependencies**: Task 1.1.1 (Azure setup for deployment), Task 1.1.2 (GitHub OAuth for Key Vault access)  
**Blockers**: None  
**Related Files**:
  - `.github/workflows/deploy.yml` (GitHub Actions configuration)
  - `.github/workflows/test.yml` (Test-only workflow for PRs, optional)
  - `docs/CI_CD.md` (Pipeline diagram and troubleshooting)

---

### Task 1.1.4: Backend Skeleton (Node.js Serverless)
**Priority**: P0  
**Assigned To**: Backend Lead  
**Duration**: 2 days  
**Effort**: 2 days

**Description**: Create backend API skeleton with basic endpoints, middleware, error handling, and Cosmos DB integration.

**Acceptance Criteria**:
- [ ] Project structure created: `backend/` with `src/`, `tests/`, `docs/`
- [ ] `package.json` configured with dependencies:
  - [ ] `express` (web framework)
  - [ ] `@azure/cosmos` (Cosmos DB client)
  - [ ] `dotenv` (environment variables)
  - [ ] `axios` (HTTP client for OAuth, SendGrid)
  - [ ] `jest` (unit test framework)
  - [ ] `supertest` (HTTP testing)
- [ ] `.env.example` created (template for environment variables)
- [ ] Environment variables documented:
  - [ ] `DB_CONNECTION_STRING`
  - [ ] `GITHUB_CLIENT_ID`
  - [ ] `GITHUB_CLIENT_SECRET`
  - [ ] `SENDGRID_API_KEY`
  - [ ] `AZURE_INSIGHTS_KEY`
  - [ ] `NODE_ENV` (development, production)
- [ ] API endpoints created (empty, return placeholder responses):
  - [ ] `GET /api/health` - returns `{status: "OK", timestamp: now}`
  - [ ] `POST /api/auth/login` - placeholder
  - [ ] `GET /api/auth/callback` - placeholder
  - [ ] `GET /api/profiles` - placeholder
  - [ ] `POST /api/events` - placeholder
- [ ] Middleware configured:
  - [ ] CORS: Allow only `https://codepals.io` origin (configurable for localhost dev)
  - [ ] Rate limiting: 100 requests/min per IP (using `express-rate-limit`)
  - [ ] Error logging: All errors logged to Azure Application Insights
  - [ ] Request ID tracking: Each request assigned unique ID for tracing
- [ ] Cosmos DB client initialized and tested:
  - [ ] Connection string loaded from environment
  - [ ] Database created (if not exists): `codepals_db`
  - [ ] Connection pool configured for free tier
  - [ ] Connection pooling limits: Max 100 connections
- [ ] Error handling middleware:
  - [ ] Catches all errors, logs them, returns standardized error response
  - [ ] Format: `{error: "message", status: 500, requestId: "uuid"}`
- [ ] Logging configured:
  - [ ] All requests logged: `${timestamp} ${method} ${url} ${status}`
  - [ ] Errors logged with full stack trace
  - [ ] Logs sent to Azure Application Insights and console (for local development)

**Testing**:
- [ ] Unit test: Health endpoint returns 200 OK with correct JSON
- [ ] Unit test: Unknown endpoint returns 404
- [ ] Unit test: Rate limiting: 101st request within 1 min returns 429 (Too Many Requests)
- [ ] Unit test: CORS: Request from unauthorized origin returns 403
- [ ] Integration test: Cosmos DB connection works (query returns result)
- [ ] Integration test: Error logging: Intentional error → Azure Application Insights receives log

**Dependencies**: Task 1.1.1 (Azure setup), Task 1.1.3 (CI/CD for automated testing)  
**Blockers**: None  
**Related Files**:
  - `backend/src/index.js` (Express app entry point)
  - `backend/src/middleware/errorHandler.js` (Error handling middleware)
  - `backend/src/middleware/cors.js` (CORS configuration)
  - `backend/src/middleware/rateLimiter.js` (Rate limiting)
  - `backend/src/db/cosmos.js` (Cosmos DB client)
  - `backend/tests/health.test.js` (Unit test for health endpoint)
  - `docs/API.md` (API documentation template)

---

## Phase 1, Week 1 Success Criteria

- [ ] All 4 tasks completed and merged to `main`
- [ ] Azure infrastructure live: Resource group, Cosmos DB, Key Vault created
- [ ] GitHub OAuth app registered and credentials stored securely
- [ ] CI/CD pipeline automated: All PRs run tests, linting, secret scanning
- [ ] Backend API deployed: `/api/health` returns 200 OK
- [ ] Monitoring active: Azure Application Insights logging all requests
- [ ] Zero security incidents: No exposed credentials, HTTPS enforced
- [ ] Team can spin up local dev environment: `npm install && npm run dev` works

---

## Phase 1, Week 1 Quality Gates

**MUST PASS before proceeding to Week 2**:

- ✅ Secret scanning: 0 exposed credentials in code or history
- ✅ Linting: 0 errors (warnings acceptable)
- ✅ Unit test coverage: ≥80% for all new code
- ✅ API health check: `/api/health` endpoint responds with 200 OK
- ✅ Azure provisioning: Cosmos DB connection verified, Key Vault access tested
- ✅ HTTPS enforcement: All endpoints serve over HTTPS, no mixed content
- ✅ Monitoring: Azure Application Insights active, receiving logs
- ✅ Rate limiting: Configured and tested (100 req/min per IP)

**Security Review Checklist**:
- ✅ No secrets in `.env` or `package.json`
- ✅ All secrets in Azure Key Vault
- ✅ CORS restricted to authorized origins
- ✅ Input validation on all endpoints (even if empty in Week 1)
- ✅ Error messages don't leak sensitive info (e.g., no full DB stack traces)

---

## Dependencies & Blockers

| Task | Depends On | Blocker? |
|------|-----------|----------|
| 1.1.1 | None | No |
| 1.1.2 | 1.1.1 (Key Vault) | No |
| 1.1.3 | 1.1.1, 1.1.2 | No |
| 1.1.4 | 1.1.1, 1.1.3 | No |

**Critical Path**: Tasks can be started in parallel after 1.1.1 completes (1-2 day delay).

---

## Effort Breakdown

| Task | Effort | Duration | Notes |
|------|--------|----------|-------|
| 1.1.1 | 3 days | 3 days | Infrastructure setup (can be done in parallel) |
| 1.1.2 | 1 day | 2 days | OAuth config (depends on 1.1.1) |
| 1.1.3 | 2 days | 2 days | CI/CD pipeline setup |
| 1.1.4 | 2 days | 2 days | Backend skeleton (depends on 1.1.3 for automated testing) |
| **Total** | **~8 days** | **5 calendar days** | Parallel execution = faster completion |

---

## Success Metrics

- Website live and publicly accessible
- `/api/health` endpoint returns 200 OK
- GitHub Actions pipeline green on all PRs
- Azure monitoring active and receiving metrics
- Zero security findings in infrastructure audit
- Team can deploy to production in <5 minutes (automated)
