# SEO verification + sitemap submission

This is the operator-side checklist for registering `codepals.io` with
the major search engines so new signups find us. Everything here is
one-time setup; the ongoing work is handled by `sitemap.xml` (auto-
served from `public/`) and `robots.txt`.

Decision in the launch plan was **Google Search Console + Bing
Webmaster Tools only, no tracking scripts** (keeps the privacy
posture; see `PRIVACY.md`).

## 0. What's already shipped in-repo

- `public/sitemap.xml` — enumerates every public static route plus
  the dynamic `/find/<username>` canonical path pattern. Auto-updated
  when a new static page lands under `src/pages/*`; dynamic routes
  are enumerated at launch and then re-enumerated per PR.
- `public/robots.txt` — allows crawling of everything NOT under
  `/profile`, `/admin`, `/api`, `/.auth`. Points at the sitemap.
- `src/components/SEO.astro` — per-page `<title>`, `<meta
  description>`, canonical, OpenGraph + Twitter cards, JSON-LD on
  the landing page. Already live.

What's missing is **proof-of-ownership** for Search Console and Bing
Webmaster. Each needs a one-time verification artifact placed either
in `public/` (gets served at the site root) or as a DNS TXT record
on the apex domain.

## 1. Google Search Console

1. Visit https://search.google.com/search-console and sign in with
   the account that will own the property.
2. Click **Add property** → **URL prefix** → `https://codepals.io/`
   (apex, with the trailing slash).
3. Google offers five verification methods. Prefer in this order:
   a. **HTML file**: Google gives you `google<hash>.html`. Download it,
      drop it into `public/` under its exact filename, commit, and
      let CI redeploy to `dev.codepals.io` first (confirm the file is
      served at `https://dev.codepals.io/google<hash>.html`) then
      merge to prod — the final verification click goes against
      `https://codepals.io/google<hash>.html`.
   b. **DNS TXT record** on the apex: paste the TXT record Google
      gives you into your DNS provider. Takes 5-60 minutes to
      propagate.
   c. **HTML meta tag**: add it to the `<head>` via a new prop on
      `src/components/SEO.astro` (`verificationGoogle={...}`). Only
      the landing page needs it. More churn than the file; prefer
      options (a) or (b).
4. Once verified, submit the sitemap:
   **Sitemaps** → **Add a new sitemap** → `https://codepals.io/sitemap.xml`.

Keep the verification artifact in place — if Google ever re-verifies
and the file is gone, the property is removed.

## 2. Bing Webmaster Tools

1. Visit https://www.bing.com/webmasters and sign in.
2. **Add a site** → `https://codepals.io/`.
3. Bing offers three verification methods. Prefer:
   a. **Import from Google Search Console** — if you already did
      step 1, this is one click. No new file.
   b. **XML file** — `BingSiteAuth.xml` into `public/`.
   c. **Meta tag** — same mechanism as Google's option (c).
4. Submit the sitemap: **Sitemaps** → `https://codepals.io/sitemap.xml`.

## 3. After both are verified

- Request initial indexing for the landing page in Google: Search
  Console → **URL Inspection** → paste `https://codepals.io/` →
  **Request indexing**. Repeat for `/resources` and `/find` (the
  high-value public pages).
- Check **Coverage** / **Pages** after 48 hours. Expect "Discovered
  — currently not indexed" to resolve to "Indexed" within a week on
  a brand-new site.
- The sitemap re-crawl happens weekly by default. New pages added
  after launch (e.g., a new `/blog/<slug>`) propagate automatically
  once they land in `public/sitemap.xml`.

## 4. Monitoring

Both consoles email on:
- Manual actions / security issues (critical — act within 24h)
- Crawl errors on sitemap paths (recoverable — investigate within a week)
- Core Web Vitals regressions (quarterly batch review)

If you'd rather monitor through a feed, both support RSS of their
"Issues" list; I can wire a `/admin` tile for either or both when
there's a signal worth watching.

## 5. What we're NOT doing (and why)

- **Google Analytics 4** — ruled out at launch. Required cookie
  consent banner + privacy policy update for EU users; the
  observability-vs-privacy trade didn't earn its complexity on an
  MVP that doesn't need pageview breakdowns yet.
- **Plausible / Umami / Fathom** — same reasoning but less painful;
  revisit at ~1k monthly actives if the operator wants aggregate
  "what pages do people visit?" numbers. All three are privacy-first
  and cookieless, so there's no banner cost.
- **Google Tag Manager / Facebook Pixel / LinkedIn Insight Tag** —
  explicit no. We're not running ads and the pixels would add third-
  party cookies for zero signal.
