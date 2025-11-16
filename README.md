# CodePals.io

**A respectful, values-driven developer growth network.**

Foster meaningful mentorship, coaching, and community connections—grounded in transparency, security, privacy, and shared values.

---

## 🚀 Quick Links

### Project Governance
- **[Constitution](/.specify/memory/constitution.md)** - Core principles, mission, vision, and governance framework (v1.3.0)
- **[Code of Conduct](./CODE_OF_CONDUCT.md)** - Community standards and expected behavior
- **[Governance](./GOVERNANCE.md)** - Organizational structure and decision-making process
- **[Security Policy](./SECURITY.md)** - Security reporting and vulnerability disclosure
- **[Privacy Policy](./PRIVACY.md)** - Data collection, usage, and user rights

### Product & Planning
- **[MVP Specification](./specs/001-codepals-mvp/spec.md)** - Complete feature specification for Phase 1-4 (landing page, core platform, community engagement, analytics)
- **Brand Identity Guide** (coming after spec finalization) - Logo, color palette, typography, Discord strategy, social media assets

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
│   │   ├── constitution.md           # Project constitution & principles
│   │   └── brand-identity.md         # Brand strategy & design system
│   └── templates/
│       ├── spec-template.md          # Feature spec template
│       ├── plan-template.md          # Implementation plan template
│       ├── tasks-template.md         # Task breakdown template
│       └── checklist-template.md     # Validation checklist template
└── specs/
    └── 001-codepals-mvp/
        └── spec.md                   # MVP specification (Phases 1-4)
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

**See [MVP Spec](./specs/001-codepals-mvp/spec.md) for detailed user stories, requirements, and success criteria.**

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

**See [MVP Spec - Internationalization Requirements](./specs/001-codepals-mvp/spec.md#internationalization-i18n--localization) (FR-1.21-1.36) for architecture details.**

---

## 🎨 Brand & Design

### Brand Identity (In Progress)
- **Logo**: AI-generated concepts (4 design directions documented in brand guide)
- **Color Palette**: WCAG 2.1 AA compliant colors for accessibility
- **Typography**: Clean, modern fonts for web and print
- **Design System**: Reusable components (buttons, cards, forms, modals)

### Discord Server
- Community hub with structured channels
- Mentorship matching & support
- Event announcements & discussions
- See [Brand Identity Guide - Discord Section](/.specify/memory/brand-identity.md#discord-server-branding)

### Social Media Strategy
- LinkedIn: Professional network & thought leadership
- Twitter/X: Announcements & community updates
- Instagram: Visual storytelling & member highlights
- See [Brand Identity Guide - Social Media Section](/.specify/memory/brand-identity.md#social-media-strategy)

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
3. Review [MVP Spec](./specs/001-codepals-mvp/spec.md) for what's being built

**For Contributors:**
1. Review [Code of Conduct](./CODE_OF_CONDUCT.md) and [GOVERNANCE](./GOVERNANCE.md)
2. Check [Constitution - Definition of Done](/.specify/memory/constitution.md#development-workflow--quality-gates)
3. Review [Security Policy](./SECURITY.md) for vulnerability reporting
4. See templates in `.specify/templates/` for contribution workflow

**For Designers:**
1. Review [Brand Identity Guide](/.specify/memory/brand-identity.md) for color, typography, logo direction
2. Check [MVP Spec - Brand Requirements](./specs/001-codepals-mvp/spec.md#brand-identity--design) (FR-1.6-1.10)

**For Product Managers:**
1. Read [MVP Spec](./specs/001-codepals-mvp/spec.md) for complete feature breakdown
2. Review [Constitution - Non-Negotiables](/.specify/memory/constitution.md#non-negotiables--technology-stack)
3. Check [Governance Metrics](/.specify/memory/constitution.md#governance-metrics-constitution-scoped)

**For DevOps/Infrastructure:**
1. Review [Technology Stack](#-technology-stack) section above
2. Check [MVP Spec - Infrastructure Requirements](./specs/001-codepals-mvp/spec.md#phase-1-foundation--landing) (FR-1.1-1.39)
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
- See [MVP Spec - Translation Workflow](./specs/001-codepals-mvp/spec.md) (FR-1.31)
- [Contributing guide for translations](https://github.com/rmjoia/codepalsio/wiki) (coming soon)

---

## 📊 Transparency & Community

### Public Metrics
- Signup trends & active user counts
- Mentor/mentee ratio
- Community engagement metrics
- Platform costs & sustainability status
- Code of Conduct enforcement (removals, blocks)

**See [MVP Spec - Phase 4](./specs/001-codepals-mvp/spec.md#phase-4-transparency--analytics) for public dashboard spec.**

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
