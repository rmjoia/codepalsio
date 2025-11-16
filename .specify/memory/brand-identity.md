# CodePals.io Brand Identity Guide

**Version**: 1.0.0  
**Last Updated**: 2025-11-16  
**Status**: Draft (Awaiting Logo & Color Finalization)

---

## Purpose

This document defines the visual identity and branding standards for CodePals.io across all platforms (website, Discord server, documentation, social media). All public-facing materials MUST adhere to these guidelines per Constitution Principle 7: Brand Consistency.

---

## Logo

### Status: 🟡 In Progress

**Requirements**:
- Represents developer growth, mentorship, community connection
- Scalable (works at 16px favicon and large banner sizes)
- Simple, memorable, professional
- Works in full color, monochrome, and reversed (light on dark)

**Design Direction** (to explore with AI generation):
- **Concept 1**: Abstract representation of people connecting (nodes/network visual)
- **Concept 2**: Combination of code symbols (`</>`) with human/community element
- **Concept 3**: Growth metaphor (tree, upward arrow) combined with tech element
- **Concept 4**: Handshake or helping hand with digital/pixel aesthetic

**AI Generation Prompts** (for DALL-E, Midjourney, or similar):

```
Prompt 1: "Minimalist tech logo for developer mentorship platform, abstract connected nodes forming community network, modern flat design, professional, scalable vector style, blue and purple gradient"

Prompt 2: "Logo design combining code brackets </> with human silhouettes helping each other, clean geometric shapes, tech startup aesthetic, vibrant but professional color palette"

Prompt 3: "Abstract logo representing developer growth and collaboration, upward arrow merging with people icons, modern sans-serif wordmark 'CodePals', trustworthy and inclusive feel"

Prompt 4: "Simple iconic logo of two hands connecting with digital circuit pattern, minimalist line art, suitable for tech platform, works in monochrome and color"
```

**Deliverables Needed**:
- [ ] Primary logo (full color, SVG + PNG @1x, @2x, @3x)
- [ ] Logomark/icon only (for favicons, social avatars)
- [ ] Monochrome version (black on transparent, white on transparent)
- [ ] Minimum size specifications (smallest legible size)
- [ ] Clear space requirements (padding around logo)

**File Naming Convention**:
```
/assets/brand/
├── logo-full-color.svg
├── logo-full-color@1x.png (256x256)
├── logo-full-color@2x.png (512x512)
├── logo-full-color@3x.png (1024x1024)
├── logomark-color.svg
├── logomark-mono-black.svg
├── logomark-mono-white.svg
└── favicon.ico (generated from logomark)
```

---

## Color Palette

### Status: 🟡 In Progress

**Requirements**:
- WCAG 2.1 AA contrast compliance (4.5:1 for normal text, 3:1 for large text)
- Accessible color combinations for text/backgrounds
- Distinct primary, secondary, accent, neutral palette
- Works in light and dark modes

**Proposed Palette** (to be finalized):

#### Primary Colors
- **Primary Blue**: `#[TBD]` - Trust, professionalism, tech
- **Primary Purple**: `#[TBD]` - Creativity, community, mentorship
- Usage: CTAs, primary buttons, links, brand emphasis

#### Secondary Colors
- **Secondary Teal**: `#[TBD]` - Growth, learning
- **Secondary Orange**: `#[TBD]` - Energy, connection
- Usage: Accents, highlights, badges, event banners

#### Neutral Colors
- **Dark Gray**: `#[TBD]` - Headings, body text (on light backgrounds)
- **Medium Gray**: `#[TBD]` - Secondary text, borders
- **Light Gray**: `#[TBD]` - Backgrounds, cards, dividers
- **Off-White**: `#[TBD]` - Page backgrounds

#### Semantic Colors
- **Success Green**: `#[TBD]` - Approvals, success states
- **Warning Yellow**: `#[TBD]` - Warnings, pending states
- **Error Red**: `#[TBD]` - Errors, rejections
- **Info Blue**: `#[TBD]` - Informational messages

**Accessibility Testing**:
- [ ] All text/background combinations pass WCAG AA (use WebAIM Contrast Checker)
- [ ] Color-blind safe palette (test with Coblis Color Blindness Simulator)
- [ ] Dark mode variants defined

**Suggested Tools**:
- [Coolors.co](https://coolors.co) - Palette generation
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Adobe Color Accessibility Tools](https://color.adobe.com/create/color-accessibility)

---

## Typography

### Status: 🟡 In Progress

**Requirements**:
- Web-safe fonts with fallbacks
- Legible at all sizes (mobile to desktop)
- Professional, modern, approachable
- Free/open-source licenses preferred

**Proposed Font Pairings** (to be finalized):

#### Option 1: Inter + Source Code Pro
- **Headings**: Inter (Google Fonts) - Clean, modern, highly legible
- **Body**: Inter (same for consistency)
- **Code/Monospace**: Source Code Pro - Developer-friendly, readable
- **Fallback**: `system-ui, -apple-system, sans-serif`

#### Option 2: Poppins + Roboto Mono
- **Headings**: Poppins (Google Fonts) - Friendly, geometric, approachable
- **Body**: Poppins (lighter weights)
- **Code/Monospace**: Roboto Mono
- **Fallback**: `system-ui, -apple-system, sans-serif`

#### Option 3: System Fonts (Performance-First)
- **All Text**: System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`)
- **Code**: System monospace stack (`"SF Mono", Monaco, "Cascadia Code", monospace`)
- **Benefit**: Zero web font load time; instant rendering

**Typography Scale**:
```css
/* To be defined once font selected */
--font-size-xs: 0.75rem;    /* 12px */
--font-size-sm: 0.875rem;   /* 14px */
--font-size-base: 1rem;     /* 16px */
--font-size-lg: 1.125rem;   /* 18px */
--font-size-xl: 1.25rem;    /* 20px */
--font-size-2xl: 1.5rem;    /* 24px */
--font-size-3xl: 2rem;      /* 32px */
--font-size-4xl: 2.5rem;    /* 40px */

--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

--line-height-tight: 1.2;
--line-height-normal: 1.5;
--line-height-relaxed: 1.75;
```

---

## Discord Server Branding

### Status: 🔴 Not Started

**Discord Server**: https://discord.com/channels/1439633906231021578/1439633906801578008

**Customization Checklist**:

#### Server Identity
- [ ] **Server Icon**: Upload logomark (512x512 PNG, circular crop)
- [ ] **Server Banner**: Create banner image (960x540 PNG) with logo + tagline
- [ ] **Server Name**: CodePals.io (already set)
- [ ] **Server Description**: "A respectful, values-driven developer growth network. Learn through mentorship, coaching, and community."

#### Role Colors (align with brand palette)
- [ ] **@Admin**: Primary Blue
- [ ] **@Moderator**: Primary Purple
- [ ] **@Mentor**: Secondary Teal
- [ ] **@Active Member**: Secondary Orange
- [ ] **@Member**: Medium Gray

#### Channel Naming Conventions
```
📢 ANNOUNCEMENTS
├── #welcome - Onboarding, rules, CoC
├── #announcements - Official platform updates
└── #events - Community events calendar

💬 COMMUNITY
├── #introductions - Member introductions
├── #general - General chat
├── #mentorship-requests - Help board (work/school/self-dev tagged)
└── #wins - Celebrate community achievements

🛠️ SUPPORT
├── #help-wanted - Technical questions
├── #feedback - Platform feedback
└── #bug-reports - Issue tracking

🎯 RESOURCES
├── #learning-resources - Curated materials
└── #job-board - Remote opportunities (Phase 2+)
```

#### Custom Emojis (optional, post-MVP)
- [ ] CodePals logo emoji
- [ ] Badge emojis (Helping Hand, Community Champion, Mentor Extraordinaire)
- [ ] Reaction emojis for Karma/recognition

#### Server Splash Screen (if unlocked)
- [ ] Custom splash with logo + mission statement

---

## Design System Components

### Status: 🟡 In Progress

**Purpose**: Reusable UI components with consistent styling for website implementation.

**Components to Define** (post-logo/color finalization):

#### Buttons
- Primary button (CTA, high emphasis)
- Secondary button (medium emphasis)
- Tertiary/ghost button (low emphasis)
- Disabled state
- Loading state
- Sizes: small, medium, large

#### Cards
- Profile card (browse view)
- Event card (upcoming events)
- Help board post card
- Metric/KPI card (dashboard)

#### Forms
- Input fields (text, email, textarea)
- Select dropdowns
- Multi-select tags (skills)
- Checkboxes, radio buttons
- Error states, validation messages

#### Navigation
- Header/nav bar
- Footer
- Breadcrumbs
- Pagination

#### Badges & Labels
- User role badges (Mentor, Mentee, Admin)
- Karma score display
- Recognition badges (Helping Hand, etc.)
- Post type labels (Looking for Mentor, Help Wanted)

#### Modals & Overlays
- Connection invite modal
- Profile approval modal (admin)
- Confirmation dialogs

**Tooling**:
- [ ] CSS custom properties (variables) for colors, spacing, typography
- [ ] Component documentation (Storybook or simple HTML/CSS examples)
- [ ] Figma/design file (optional, for visual reference)

---

## Usage Guidelines

### Do's ✅
- Use official logo files only (no recreations or modifications)
- Maintain minimum clear space around logo (equal to logo height)
- Use approved color palette for all brand materials
- Ensure WCAG AA contrast for all text/background combinations
- Reference this guide for all public-facing design decisions

### Don'ts ❌
- Do not distort, rotate, or skew the logo
- Do not use unapproved colors or gradients
- Do not place logo on busy or low-contrast backgrounds
- Do not use unofficial fonts or typography
- Do not create unofficial brand variations

---

## Asset Repository

### Current Status: 🔴 Not Created

**Future Location** (post-finalization):
```
/assets/brand/
├── logos/          # SVG, PNG exports at multiple sizes
├── colors/         # Palette swatches, CSS variables
├── typography/     # Font files (if self-hosted), specimen sheet
├── discord/        # Server icon, banner, role icons
└── guidelines.pdf  # Exported version of this guide
```

**Version Control**:
- All finalized brand assets MUST be committed to repository
- Changes to brand assets MUST go through PR review
- This guide (brand-identity.md) is source of truth; update version on changes

---

---

## Brand Messaging & Tagline

### Status: 🔴 Not Started

**Purpose**: Define CodePals.io's mission statement and tagline that resonates with developers and inspires community participation.

**Current Inspiration**:
- "Connected by our ❤️ to code"
- Mission: Foster a respectful, values-driven developer growth network where people learn by building relationships, receiving mentorship and coaching, and sharing their development journey.

**Tagline Requirements**:
- Powerful and inspirational
- Emphasizes connection, mentorship, and community
- Easy to remember and share
- Works across all platforms (short form for Twitter, longer for LinkedIn)
- Reflects the values: transparency, inclusivity, growth

**Deliverables Needed**:
- [ ] Primary tagline (main brand motto)
- [ ] Alternative taglines (for different contexts: mission, value prop, call-to-action)
- [ ] Tagline variations for social media (LinkedIn, Twitter, Discord)

---

## Discord Server Strategy

### Status: 🔴 Not Started

**Purpose**: Plan CodePals.io Discord server structure, organization, and community management approach.

**Key Areas to Define**:

#### Server Structure & Organization
- [ ] Category hierarchy (Announcements, Community, Support, Resources, etc.)
- [ ] Channel naming conventions and purposes
- [ ] Channel organization by function (onboarding, general chat, mentorship, help, events, resources)
- [ ] Welcome/onboarding flow for new members
- [ ] Rules & Code of Conduct channel

#### Roles & Permissions
- [ ] Role hierarchy and naming (Admin, Moderator, Mentor, Member, etc.)
- [ ] Role color scheme (aligned with brand palette)
- [ ] Permission matrix per role
- [ ] Self-assignable roles (if applicable)

#### Community Guidelines
- [ ] Moderation policy and escalation procedures
- [ ] Spam/CoC violation handling
- [ ] Member activity expectations
- [ ] Mentor/mentee matching workflow (if manual)

#### Automation & Bots
- [ ] Welcome bot for onboarding messages
- [ ] Auto-moderation (spam filters, link restrictions)
- [ ] Reaction-based roles (optional)
- [ ] Event announcement reminders

#### Media & Branding
- [ ] Server icon (circular crop of logomark)
- [ ] Server banner (960x540 PNG with logo + tagline + mission)
- [ ] Channel category icons (if Discord supports custom graphics)
- [ ] Bot avatar design

---

## Social Media Strategy

### Status: 🔴 Not Started

**Purpose**: Define social media presence, content pillars, and asset requirements for LinkedIn, Twitter/X, and other platforms.

**Platforms to Support**:
- [ ] LinkedIn (professional network, long-form content)
- [ ] Twitter/X (announcements, community updates, quick tips)
- [ ] Instagram (visual storytelling, community highlights)
- [ ] GitHub (project updates, contributor spotlights)

#### Asset Requirements by Platform

**LinkedIn**:
- [ ] Profile banner (1200x627 px) with logo + tagline
- [ ] Company page cover photo
- [ ] Post templates (image dimensions: 1200x627 for link preview)
- [ ] Content calendar structure

**Twitter/X**:
- [ ] Profile avatar (400x400 px, logomark)
- [ ] Profile banner (1500x500 px with brand palette)
- [ ] Post templates for announcements, updates, community highlights

**Instagram**:
- [ ] Profile picture (logomark, 1080x1080 px)
- [ ] Story template (1080x1920 px)
- [ ] Feed post template (1080x1080 px square)
- [ ] Highlight covers for stories

**General**:
- [ ] Social media guidelines (tone, posting frequency, response times)
- [ ] Hashtag strategy (#CodePals, #DeveloperGrowth, #Mentorship, etc.)
- [ ] Content pillars (community wins, tutorials, mentorship tips, transparency updates)

#### Content Calendar
- [ ] Launch announcements
- [ ] Community spotlights (member highlights, success stories)
- [ ] Event promotions
- [ ] Transparency updates (KPI sharing, roadmap updates)
- [ ] Educational content (mentorship tips, learning resources)

---

## Next Steps (Phase 2: Branding & Community)

**Immediate**:
1. Finalize brand tagline and messaging
2. Generate logo concepts using AI
3. Define color palette and typography
4. Create Discord server structure & strategy
5. Design social media assets (banners, templates, icons)

**Short-term**:
1. Set up Discord server with full customization
2. Launch social media profiles (LinkedIn, Twitter/X)
3. Create content calendar for first month
4. Establish community guidelines and moderation protocols

**Long-term**:
1. Build comprehensive brand style guide (Figma or similar)
2. Create reusable social media templates
3. Develop content creation workflow
4. Scale social presence to additional platforms (YouTube, TikTok, etc.)

---


