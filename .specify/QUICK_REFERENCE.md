# CodePals.io MVP: Quick Reference Guide for Teams

**Last Updated**: 2025-11-16  
**Audience**: Developers, QA, Designers, DevOps  
**Use This**: When starting a new phase, week, or task

---

## 📋 Project at a Glance

| Item | Value |
|------|-------|
| **Project** | CodePals.io MVP Platform |
| **Duration** | 10 weeks (4 phases) |
| **Effort** | ~200-250 developer days |
| **Team Size** | 3-4 FTE recommended |
| **Launch Target** | Week 10 (public launch) |
| **Success Criteria** | ≥99.5% uptime, <3sec load, 50+ users by week 5 |

---

## 🎯 Phase Overview

### Phase 1: Foundation & Landing (Weeks 1-2)
**Goal**: Live website with brand identity  
**Key Deliverables**: Infrastructure, landing page, admin dashboard  
**Effort**: ~50 dev days  
**Quality Gate**: Website live, ≥99.5% uptime, <3sec load time  
**Task File**: `.specify/tasks/phase-1-week-1-tasks.md`

### Phase 2: Core Platform (Weeks 3-5)
**Goal**: User profiles, discovery, connections  
**Key Deliverables**: Registration flow, profile browse, connection invites  
**Effort**: ~75 dev days  
**Quality Gate**: 50+ profiles, 10+ connections  
**Task File**: `.specify/tasks/phase-2-week-3-detailed-tasks.md` (Week 3), create Weeks 4-5

### Phase 3: Community Engagement (Weeks 6-8)
**Goal**: Events, help board, Karma system  
**Key Deliverables**: Event system, help board, Karma/badges  
**Effort**: ~75 dev days  
**Quality Gate**: ≥5 posts, ≥10 Karma, ≥80% retention  
**Task File**: Create detailed files from MVP_COMPLETE_TASK_BREAKDOWN.md

### Phase 4: Transparency & Analytics (Weeks 9-10)
**Goal**: Public metrics dashboard  
**Key Deliverables**: Event logging, metrics aggregation, public dashboard  
**Effort**: ~50 dev days  
**Quality Gate**: Dashboard live, all governance gates passed  
**Task File**: Create detailed files from MVP_COMPLETE_TASK_BREAKDOWN.md

---

## 📁 Key Documents

**Governance & Planning**:
- `.specify/memory/constitution.md` - 8 principles, governance rules, Definition of Done
- `.specify/spec/codepals-mvp.md` - 617 lines, 39 functional requirements, 4 phases
- `.specify/plan/codepals-mvp.md` - 920 lines, 10-week roadmap, architecture, data model

**Task Breakdowns**:
- `.specify/tasks/MVP_COMPLETE_TASK_BREAKDOWN.md` - All 4 phases overview
- `.specify/tasks/phase-1-week-1-tasks.md` - Weeks 1-2 detailed tasks (Infrastructure setup)
- `.specify/tasks/phase-2-week-3-detailed-tasks.md` - Week 3 detailed tasks (User registration)

**Brand & Design**:
- `.specify/memory/branding-logo-concepts.md` - 5 logo concepts, selected logo, color palette
- `.specify/memory/branding/assets/` - 13 generated logo images

**Project Status**:
- `.specify/PROJECT_STATUS.md` - Current progress, team structure, next steps

---

## 🚀 Starting a Phase

### Before Day 1
1. **Review Phase Goals**: Read corresponding section in `.specify/plan/codepals-mvp.md`
2. **Read Constitution**: Remind yourself of 8 principles + Definition of Done in `.specify/memory/constitution.md`
3. **Understand Quality Gates**: Review governance checks in `constitution.md`
4. **Review Task Files**: Open detailed task breakdown (e.g., `phase-2-week-3-detailed-tasks.md`)

### Day 1 Kickoff
1. **Team Meeting**: 1 hour review of phase goals, tasks, acceptance criteria
2. **Task Assignment**: Assign specific tasks to team members
3. **Setup Tracking**: Create GitHub issues for each task with acceptance criteria
4. **Dependencies Review**: Understand blocking dependencies (what must be done first)

### Daily (Standup)
**Format**: 15 minutes, every morning

**Questions**:
1. What did I complete yesterday?
2. What am I working on today?
3. Are there any blockers?
4. Are we on track for phase gates?

**Owner**: Project Manager / Tech Lead

### Weekly (Friday Review)
**Format**: 30 minutes, every Friday

**Checklist**:
- [ ] All tasks on schedule?
- [ ] Any blockers requiring escalation?
- [ ] Quality gates being met (tests ≥80%, security checks)?
- [ ] Team morale and velocity okay?
- [ ] Ready for next week's tasks?

---

## ✅ Definition of Done

**Before marking a task complete**, verify:

1. **Code**
   - [ ] Code changes submitted in PR to `main`
   - [ ] Peer review completed (≥1 approval)
   - [ ] Tests passing (100% green)

2. **Testing**
   - [ ] Unit tests written (≥80% coverage new code)
   - [ ] Integration tests written (if applicable)
   - [ ] E2E tests written (if user-facing feature)
   - [ ] All tests passing locally and in CI/CD

3. **Security**
   - [ ] No credentials in code (secret scan clean)
   - [ ] Input validation on all endpoints
   - [ ] HTTPS enforced
   - [ ] Security review completed (if applicable)

4. **Quality**
   - [ ] Linting passes (0 errors)
   - [ ] Performance baseline met (<3sec page load, <1sec API)
   - [ ] Accessibility tested (WCAG 2.1 AA)
   - [ ] Brand consistency verified (logo, colors, typography)

5. **Documentation**
   - [ ] Code comments for complex logic
   - [ ] API documentation updated (if new endpoint)
   - [ ] README updated (if new feature)
   - [ ] Architecture doc updated (if major change)

6. **i18n & Accessibility**
   - [ ] All user-facing strings externalized (no hardcoding)
   - [ ] i18n strings translated for 4 locales (≥95% coverage)
   - [ ] WCAG 2.1 AA compliance verified
   - [ ] Screen reader tested (if critical feature)

---

## 🛡️ Quality Gates (Per Phase)

### Before Phase Transition (Week-End Gate)

**Security**:
- [ ] Secret scanning: 0 exposed credentials
- [ ] Dependency check: No known vulnerabilities
- [ ] OWASP checks: Input validation, output sanitization

**Testing**:
- [ ] Unit test coverage: ≥80% on all new code
- [ ] Integration tests: All APIs tested with realistic data
- [ ] E2E tests: All critical user journeys tested
- [ ] Performance: Page loads <3sec, API responses <1sec

**Quality**:
- [ ] Linting: 0 errors (warnings okay)
- [ ] Code review: All PRs peer-reviewed
- [ ] Accessibility: WCAG 2.1 AA automated checks passed, manual testing done

**Governance**:
- [ ] Brand consistency: Logo, colors, typography verified
- [ ] i18n coverage: ≥95% translated for 4 locales
- [ ] Compliance: All Constitution principles embedded
- [ ] Documentation: Feature docs, API docs updated

**Release Readiness** (Phase Completion):
- [ ] Zero critical bugs
- [ ] Performance baseline met
- [ ] Monitoring active (Azure App Insights)
- [ ] Deployment runbook updated

---

## 📊 Success Metrics by Phase

| Phase | Week | Metric | Target | Verify |
|-------|------|--------|--------|--------|
| Phase 1 | 2 | Website uptime | ≥99.5% | Azure monitoring |
| Phase 1 | 2 | Page load time | <3 sec | Lighthouse ≥90 |
| Phase 2 | 5 | Registered users | ≥50 | User table count |
| Phase 2 | 5 | Connections | ≥10 | Connection table count |
| Phase 3 | 8 | Help posts | ≥5 | HelpBoardPost count |
| Phase 3 | 8 | Karma awarded | ≥10 | Karma.total_points sum |
| Phase 3 | 8 | Retention (7d) | ≥80% | EventLog active users |
| Phase 4 | 10 | Dashboard uptime | ≥99.5% | Azure monitoring |

---

## 🔧 Tech Stack Quick Reference

| Layer | Technology | Why This |
|-------|-----------|---------|
| **Frontend** | Statiq | Static site gen, fast, simple |
| **Hosting** | Azure Static Web Apps | Free tier, built-in CI/CD |
| **Backend** | Node.js Serverless | Fast startup, Azure integration |
| **Database** | Cosmos DB (NoSQL) | Free tier 400 RU/s sufficient |
| **Auth** | GitHub OAuth | Free, developer-friendly |
| **Email** | SendGrid | 100/day free tier, reliable |
| **Monitoring** | Azure App Insights | Free tier, good visibility |
| **Unit Tests** | Jasmine/Karma | User's known stack |
| **E2E Tests** | Playwright | Cross-browser, fast, maintainable |
| **CI/CD** | GitHub Actions | Native to repo, free |

---

## 🎨 Brand Quick Reference

**Logo**: Connected Hands & Code (Concept 1)  
**Primary Color**: Teal #00BCD4  
**Accent Color**: Gold #FFB700  
**Font**: TBD (to be selected in Phase 1)  
**Logo Files**: `.specify/memory/branding/assets/Codepals01.png` (main), plus JPG variants

**Brand Rules**:
- Logo min size: 16px (favicon)
- Color contrast: ≥4.5:1 (WCAG AA)
- Typography: Consistent headings and body fonts
- Discord: Server icon + banner apply brand colors

---

## 📞 Escalation Path

**Issue Type** → **Owner** → **When**

- **Blocker (task can't proceed)** → Tech Lead → Same day
- **Dependency miss** → Project Manager → Next standup
- **Quality gate failure** → QA Lead → Before PR merge
- **Security issue** → Security Lead → Immediately
- **Performance degradation** → DevOps → Investigate same day
- **Budget/scope change** → Project Owner → Next planning meeting

---

## 🎓 Learning Resources

**For the Team**:
- Constitution v1.3.0: Review governance principles, Definition of Done, quality gates
- MVP Spec: Understand feature scope, 39 FRs, 4 phases
- Implementation Plan: Know architecture, data model, i18n strategy
- Constitution: Review governance checks, compliance requirements

**Before First Phase**:
- Read `.specify/spec/codepals-mvp.md` (entire file)
- Review `.specify/memory/constitution.md` (entire file)
- Skim `.specify/plan/codepals-mvp.md` (architecture + Phase overview)

**Before Each Week**:
- Read corresponding task file (e.g., `phase-2-week-3-detailed-tasks.md`)
- Review acceptance criteria for your assigned tasks
- Understand testing strategy for your task

---

## 🚨 Common Pitfalls to Avoid

1. **Hardcoded strings**: ALL user-facing text must be in i18n files (not code)
2. **Skipped tests**: Every feature must have unit + E2E tests (≥80% coverage)
3. **Secret commits**: NEVER commit API keys, connection strings (use Key Vault)
4. **Skipped accessibility**: WCAG 2.1 AA is NON-NEGOTIABLE (test every page)
5. **Brand inconsistency**: Use exact logo and colors from brand assets (not eyeballed)
6. **Unfocused PRs**: Keep PRs small and focused (1 feature = 1 PR)
7. **Missing docs**: Update docs when architecture/API changes
8. **Testing after code**: Write tests DURING development (TDD if possible)

---

## 📈 Weekly Planning Template

```markdown
## Week X Planning (Date: Month Day - Month Day)

### Phase: X.Y | Goal: [Goal]

### Tasks This Week
- [ ] Task A.B.1 - [Description] (Owner: Name)
- [ ] Task A.B.2 - [Description] (Owner: Name)
- [ ] Task A.B.3 - [Description] (Owner: Name)

### Dependencies
- Depends on: [What must be done first]
- Blockers: [Known risks]

### Quality Gates
- [ ] Unit test coverage ≥80%
- [ ] All tests passing
- [ ] Zero security issues
- [ ] Performance baseline met
- [ ] Accessibility verified

### Success Criteria (End of Week)
- [ ] All tasks complete
- [ ] All quality gates passed
- [ ] Ready for next phase/week

### Risks / Notes
- [Any risks or updates]
```

---

## 🎯 Weekly Standup Template

```
Standup - Week X, Day Y
Duration: 15 min

### Per Team Member (2 min each)
1. **[Name]**: [Yesterday's work] → [Today's work] → [Blockers?]
2. **[Name]**: [Yesterday's work] → [Today's work] → [Blockers?]
...

### Blockers (5 min)
- [Blocker 1] - Owner: [Name]
- [Blocker 2] - Owner: [Name]

### Status
- On track for phase gates? YES / NO
- Any escalations? [Describe]

### Next Standup
- Date: [Next day]
- Time: [Time]
```

---

## 📞 Contact & Support

**Questions?** Refer to:
1. Constitution (`constitution.md`) - Governance questions
2. Spec (`codepals-mvp.md`) - Feature questions
3. Plan (`codepals-mvp.md`) - Architecture/design questions
4. Task file (e.g., `phase-2-week-3-detailed-tasks.md`) - Task-specific questions
5. Project Owner - Strategic/priority questions

---

## ✨ Version History

- **v1.0** (2025-11-16): Initial MVP specification, implementation plan, task breakdown
- **v1.3.0** (Constitution): 8 principles, Brand Consistency + i18n & Accessibility NON-NEGOTIABLE
- **Phase 1** (2025-11-16): Infrastructure tasks defined, ready to execute

---

**Last Updated**: 2025-11-16  
**Next Review**: Week 1 end (2025-11-22)  
**Owner**: Project Manager  
**Audience**: All team members
