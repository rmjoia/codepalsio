# CodePals.io

**A respectful, values-driven developer growth network.**

Foster meaningful mentorship, coaching, and community connections—grounded in transparency, security, privacy, and shared values.

**🌐 Live:** [codepals.io](https://codepals.io) | [dev.codepals.io](https://dev.codepals.io)

---

## 🚀 Quick Links

### Project Governance
- **[Constitution](/.specify/memory/constitution.md)** - Core principles, mission, vision, and governance framework (v1.3.0)
- **[Code of Conduct](./CODE_OF_CONDUCT.md)** - Community standards and expected behavior
- **[Governance](./GOVERNANCE.md)** - Organizational structure and decision-making process
- **[Security Policy](./SECURITY.md)** - Security reporting and vulnerability disclosure
- **[Privacy Policy](./PRIVACY.md)** - Data collection, usage, and user rights

### Product & Planning
- **[MVP Specification](./.specify/spec/codepals-mvp.md)** - Complete feature specification for Phase 1-4 (landing page, core platform, community engagement, analytics)
- **[Implementation Plan](./.specify/plan/codepals-mvp.md)** - Detailed 10-week implementation roadmap with architecture, data model, and quality gates
- **[Brand Identity & Logo Concepts](./.specify/memory/branding-logo-concepts.md)** - 5 logo concepts, color palette (Teal + Gold), typography, Discord branding

### Development Documentation
- **[Implementation Plan Template](/.specify/templates/plan-template.md)** - Framework for technical planning and Constitution compliance
- **[Task Breakdown Template](/.specify/templates/tasks-template.md)** - User story decomposition with independent testability
- **[Specification Template](/.specify/templates/spec-template.md)** - Feature specification format
- **[Checklist Template](/.specify/templates/checklist-template.md)** - Validation and gating checklist

---

## 📋 Documentation Structure

```
codepalsio/
├── README.md (this file)
├── CODE_OF_CONDUCT.md
├── GOVERNANCE.md
├── PRIVACY.md
├── SECURITY.md
├── .specify/
│   ├── memory/
│   │   ├── constitution.md                   # Project constitution & principles (v1.3.0)
│   │   ├── branding-logo-concepts.md        # Logo concepts, color palette, brand identity
│   │   ├── branding/
│   │   │   └── assets/                      # Generated logo images (PNG, JPG)
│   │   └── [other docs]
│   ├── spec/
│   │   └── codepals-mvp.md                  # MVP specification (Phases 1-4)
│   ├── plan/
│   │   └── codepals-mvp.md                  # Implementation plan (10 weeks)
│   └── templates/
│       ├── spec-template.md                 # Feature spec template
│       ├── plan-template.md                 # Implementation plan template
│       ├── tasks-template.md                # Task breakdown template
│       └── checklist-template.md            # Validation checklist template
```

---

## 🎯 Project Overview

### Mission
Foster a respectful, values-driven developer growth network where people learn by building relationships, receiving mentorship and coaching, and sharing their development journey—grounded in transparency, security, privacy, and community support. CodePals.io enables context-rich help requests and meaningful connections rather than transactional Q&A.

### Vision
A trusted global developer community where people support people—creating opportunities for those who need them most, fostering genuine connections, and using technology and mentorship as means to improve lives and enable better futures.

### Core Principles (v1.3.0)

1. **Open Source & Transparency** (NON-NEGOTIABLE) - All code, docs, and decisions publicly accessible
2. **Code Quality** - Clean, maintainable code with mandatory peer review
3. **Security** (NON-NEGOTIABLE) - Industry best practices, input validation, least privilege
4. **Performance** - Efficient, responsive systems with monitoring
5. **Privacy** (NON-NEGOTIABLE) - Minimal data collection, transparent usage, policy compliance
6. **Community & Governance** - Respectful collaboration, inclusive contribution pathways
7. **Brand Consistency** (NON-NEGOTIABLE) - Unified visual identity across all platforms
8. **Internationalization & Accessibility** (NON-NEGOTIABLE) - Multi-language support, WCAG 2.1 AA compliance

---

## 📦 MVP Roadmap (Phased Delivery)

### Phase 1: Foundation & Landing (Weeks 1-2)
- Deploy infrastructure & CI/CD pipeline
- Create landing page with brand identity
- Setup admin dashboard & moderation tools

### Phase 2: Core Platform Features (Weeks 3-5)
- User registration & profile creation
- Profile browse & discovery
- Connection invites & management

### Phase 3: Community Engagement (Weeks 6-8)
- Community events system
- Help board & calls-to-action
- Karma system & recognition badges

### Phase 4: Transparency & Analytics (Weeks 9-10)
- Public KPI dashboard & transparency metrics

**See [MVP Spec](./.specify/spec/codepals-mvp.md) for detailed user stories, requirements, and success criteria.**

---

## 💻 Technology Stack

### Frontend
- **Framework**: [Astro](https://astro.build) 5.15+ with TypeScript
- **Styling**: Tailwind CSS 3.3+
- **Components**: Astro components (`.astro` files)
- **Build**: Static site generation (SSG)

### Infrastructure & Deployment
- **Hosting**: Azure Static Web Apps (Free tier)
- **IaC**: PowerShell + Bicep templates
- **DNS**: Azure DNS Zones (dev.codepals.io, codepals.io)
- **CI/CD**: GitHub Actions + PowerShell modules (in progress)
- **Environments**:
  - **Production**: https://codepals.io
  - **Development**: https://dev.codepals.io

### Planned (Phase 2+)
- **Backend**: Node.js serverless (Azure Functions)
- **Database**: Cosmos DB (free tier, 400 RU/s)
- **Auth**: GitHub OAuth
- **Email**: SendGrid (100 emails/day free tier)
- **Monitoring**: Azure Application Insights
- **Testing**: Vitest (unit), Playwright (E2E)

### Development Tools
- **Linting**: ESLint with Astro plugin
- **Formatting**: Prettier with Astro plugin
- **Security**: Snyk for dependency scanning
- **Package Manager**: npm

---

## 🧑‍💻 Current Status

### ✅ Completed (Phase 1 - Week 2)
- **Landing Page**: Live at codepals.io and dev.codepals.io
  - Hero section with animated background
  - Features showcase
  - How It Works section
  - Call-to-Action components
  - Footer with Discord integration
- **Brand Implementation**: Logo, colors (Teal #00BCD4 + Gold #FFB700), typography
- **Policy Pages**: Code of Conduct, Privacy Policy, Terms of Service (pages + modals)
- **Responsive Design**: Mobile-first with animations
- **Infrastructure**: PowerShell + Bicep provisioning (dev + prod)
- **DNS Configuration**: Custom domains configured and live

### ⏳ In Progress (Phase 1 - Week 1)
- **CI/CD Pipeline**: GitHub Actions workflow (PR #11)
- **Infrastructure Automation**: Full automation via PowerShell modules (PR #11)
- **TypeScript Migration**: Convert components to strict TypeScript (planned)

### 📋 Planned
- **Phase 2**: User profiles, GitHub OAuth, profile discovery (Weeks 3-5)
- **Phase 3**: Community events, help board, Karma system (Weeks 6-8)
- **Phase 4**: Public metrics dashboard (Weeks 9-10)

---

## 🌍 Internationalization (i18n)

CodePals.io is architected for global accessibility from the outset.

### Supported Locales (MVP)
- 🇵🇹 Portuguese (Portugal) - `pt-PT`
- 🇮🇪 English (Ireland) - `en-IE`
- 🇫🇷 French (France) - `fr-FR`

### Future Expansion (Community-Driven)
- 🇪🇸 Spanish (Spain) - `es-ES` (potential)
- RTL language support (e.g., Arabic, Hebrew)

**See [MVP Spec - Internationalization Requirements](./.specify/spec/codepals-mvp.md#internationalization-i18n--localization) (FR-1.21-1.36) for architecture details.**

---

## 🎨 Brand & Design

### Brand Identity (Complete)
- **Logo**: 5 concepts generated via GitHub Copilot + FLUX.1-dev; **Concept 1 (Connected Hands & Code) SELECTED** ⭐
  - Primary: `CodePals01.png` (1008KB) | `concept1.jpg` (1020KB)
  - Concepts 2-5: Available in `.specify/memory/branding/assets/`
  - See [Brand Identity & Logo Concepts](./.specify/memory/branding-logo-concepts.md) for full evaluation and rationale
- **Color Palette**: WCAG 2.1 AA compliant (Primary: Teal #00BCD4, Gold #FFB700; Accents: Coral, Green)
- **Typography**: Clean, modern fonts for web and print
- **Design System**: Reusable components (buttons, cards, forms, modals)
- **Generated by**: GitHub Copilot using FLUX.1-dev image generation model
- **Attribution**: All logo concepts and images created by GitHub Copilot

### Logo Concepts Overview

| Concept | Status | Description | Files |
|---------|--------|-------------|-------|
| **01: Connected Hands & Code** | ⭐ SELECTED | Two stylized hands with code bracket, teal + gold | CodePals01.png, concept1.jpg |
| **02: Pen Meets Code** | Archive | Calligraphy pen transitioning to code bracket | CodePals02.png, Concept2.jpg |
| **03: Globe with Code Lattice** | Archive | Golden lattice network forming globe | Codepals03.png, concept03.jpg |
| **04: Ascending Stairs & Connection** | Future | Upward progression with support arcs | Codepals04.png, concept04.jpg |
| **05: Stylized "C" + Connection Node** | Future | Iconic C with glowing connection | Codepals05.png, concept05.jpg |
| **00: Alternative Palette** | Reference | Different color direction (archived) | CodePals00.png |

**All logo assets**: `.specify/memory/branding/assets/` (11MB total, 13 files)

### Discord Server
- Community hub with structured channels
- Mentorship matching & support
- Event announcements & discussions
- Branded with Concept 1 logo and color palette (teal + gold)

### Social Media Strategy
- LinkedIn: Professional network & thought leadership
- Twitter/X: Announcements & community updates
- Instagram: Visual storytelling & member highlights
- All platforms use Concept 1 logo and Teal + Gold palette

---

**See [Brand Identity & Logo Concepts](./.specify/memory/branding-logo-concepts.md) for detailed vision, brand personality, color specifications, and full evaluation of all 5 concepts.**

---

## 🛠️ Technology Stack

**Frontend & Static Site**
- Static Site Generation: Statiq
- Hosting: Azure Static Web Apps

**Backend & API**
- Runtime: Node.js (serverless)
- Database: Cosmos DB (Azure, free tier)

**Infrastructure**
- CI/CD: GitHub Actions
- Monitoring: Azure Application Insights
- Email: SendGrid API
- Authentication: GitHub OAuth

**Development**
- Specification-Driven Development: Spec-Kit
- Linting & Formatting: Standard tools
- Testing: Per-feature coverage requirements
- Security: Secret scanning, OWASP compliance

---

## 📖 How to Read This Documentation

**For First-Time Visitors:**
1. Start with this README for overview
2. Read [Constitution](/.specify/memory/constitution.md) for principles & mission
3. Review [MVP Spec](./.specify/spec/codepals-mvp.md) for what's being built

**For Contributors:**
1. Review [Code of Conduct](./CODE_OF_CONDUCT.md) and [GOVERNANCE](./GOVERNANCE.md)
2. Check [Constitution - Definition of Done](/.specify/memory/constitution.md#development-workflow--quality-gates)
3. Review [Security Policy](./SECURITY.md) for vulnerability reporting
4. See templates in `.specify/templates/` for contribution workflow

**For Designers:**
1. Review [Brand Identity & Logo Concepts](./.specify/memory/branding-logo-concepts.md) for all 5 concepts, color palette (Teal #00BCD4, Gold #FFB700), typography
2. View generated logo assets in `.specify/memory/branding/assets/` (Concept 1 selected for production)
3. Check [MVP Spec - Brand Requirements](./.specify/spec/codepals-mvp.md#brand-identity--design) (FR-1.6-1.10) for implementation details

**For Product Managers:**
1. Read [MVP Spec](./.specify/spec/codepals-mvp.md) for complete feature breakdown
2. Review [Constitution - Non-Negotiables](/.specify/memory/constitution.md#non-negotiables--technology-stack)
3. Check [Governance Metrics](/.specify/memory/constitution.md#governance-metrics-constitution-scoped)

**For DevOps/Infrastructure:**
1. Review [Technology Stack](#-technology-stack) section above
2. Check [MVP Spec - Infrastructure Requirements](./.specify/spec/codepals-mvp.md#phase-1-foundation--landing) (FR-1.1-1.39)
3. See [Security Policy](./SECURITY.md)

---

## 🤝 Contributing

CodePals.io welcomes contributions aligned with our mission and principles. 

**Next Steps for Contributors:**
1. Fork and clone the repository
2. Review [Code of Conduct](./CODE_OF_CONDUCT.md)
3. Check [GOVERNANCE](./GOVERNANCE.md) for decision-making process
4. See Constitution [Definition of Done](/.specify/memory/constitution.md#development-workflow--quality-gates)

**Translation Contributions:**
- Community translations are welcome!
- See [MVP Spec - Translation Workflow](./.specify/spec/codepals-mvp.md) (FR-1.31)
- [Contributing guide for translations](https://github.com/rmjoia/codepalsio/wiki) (coming soon)

---

## 📊 Transparency & Community

### Public Metrics
- Signup trends & active user counts
- Mentor/mentee ratio
- Community engagement metrics
- Platform costs & sustainability status
- Code of Conduct enforcement (removals, blocks)

**See [MVP Spec - Phase 4](./.specify/spec/codepals-mvp.md#phase-4-transparency--analytics) for public dashboard spec.**

### Roadmap & Updates
- Follow [Governance](./GOVERNANCE.md) for how decisions are made
- Check [Constitution](/.specify/memory/constitution.md) for project governance
- Review GitHub [Issues](https://github.com/rmjoia/codepalsio/issues) & [Discussions](https://github.com/rmjoia/codepalsio/discussions)

---

## 📞 Get in Touch

- **Discord**: [Join our community](https://discord.com/channels/1439633906231021578/1439633906801578008)
- **GitHub Issues**: [Ask questions or report issues](https://github.com/rmjoia/codepalsio/issues)
- **GitHub Discussions**: [Community conversations](https://github.com/rmjoia/codepalsio/discussions)

---

## 📜 License & Legal

- **Code**: [License TBD - typically open source like MIT or Apache 2.0]
- **Privacy Policy**: See [PRIVACY.md](./PRIVACY.md)
- **Security Policy**: See [SECURITY.md](./SECURITY.md)
- **Code of Conduct**: See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

---

**Last Updated**: November 16, 2025  
**Constitution Version**: 1.3.0  
**MVP Spec Status**: Draft  
**Implementation Plan Status**: Draft  
**Brand Status**: Complete (5 concepts generated, Concept 1 selected)  
**Logo Attribution**: Generated by GitHub Copilot using FLUX.1-dev
