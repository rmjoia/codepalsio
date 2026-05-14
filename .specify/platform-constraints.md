# Platform Constraints

**Last updated**: 2026-05-14
**Status**: Canonical source of truth for platform-specific quirks we've learned the hard way.

This document captures constraints imposed by Azure Static Web Apps (Free tier), Azure Functions (managed under SWA), and Astro 5 that **MUST** be observed in code. Every constraint cites the commit/PR where it was discovered so future readers know the cost of the lesson.

When a constraint is added here, an automated check (test or build-time guard) **MUST** also be added to enforce it. Re-learning the same constraint from a production failure twice is a process failure (see Constitution Principle 9: Verified Quality).

---

## Azure Functions (managed by SWA)

### Function names MUST NOT start with reserved prefixes

**Constraint**: Function names registered via `app.http(NAME, ...)` MUST NOT start with any of:

- `admin` / `admins` — collides with Azure Functions' reserved host management namespace (`/admin/host/status`, `/admin/functions/<name>`, etc.). Resulting `/api/admin-X` URLs return 404 from the SWA frontend proxy even though the function is correctly registered in the SWA Function host.
- `host` / `functions` / `keys` / `extensions` — also Azure Functions host management API prefixes.
- `_` — reserved for system functions.

**Discovered**: 2026-05-14, during PR #52 / pre-#53 debugging. Spent ~2 hours chasing what looked like a registration/deploy bug. The functions were listed in the SWA Portal (APIs → Managed Functions) but all `/api/admin-*` and `/api/admins-*` returned 404. Renaming the registrations to `manage-users` / `roster-list` / `roster-grant` / `roster-revoke` fixed it immediately.

**Symptom signature**: function is listed in Portal but `GET /api/<name>` returns 404 with `net::ERR_ABORTED`, not a 401/403/405.

**Enforced by**: `api/src/lib/function-registrations.test.ts` (asserts no `app.http()` name starts with a reserved prefix). Build fails if a contributor adds one.

**References**: [Azure Functions host API docs](https://learn.microsoft.com/en-us/azure/azure-functions/functions-host-properties-reference) (the `/admin/*` namespace).

---

### Route/function consistency is required, both ways

**Constraint**: Every `/api/X` route declared in `staticwebapp.config.json` MUST have a matching `app.http('X', ...)` registration in `api/src/*.ts`. Conversely, every `app.http('X', ...)` registration MUST have a matching `/api/X` route in `staticwebapp.config.json` (so route-level role gates aren't silently bypassed).

**Why**: Forgetting one side has caused multiple silent regressions — a renamed function with a stale route gate the SWA still applies, or a new route declared but no function to handle it (yielding 404 from the static handler).

**Enforced by**: `src/staticwebapp.config.test.ts` (cross-reference test, both directions).

---

## Azure Static Web Apps Free tier

### No `auth.rolesSource`, no `auth.identityProviders` custom registration

**Constraint**: `staticwebapp.config.json` MUST NOT contain `auth.rolesSource` or `auth.identityProviders`. These are SWA Standard-tier features. Declaring them on Free will either be silently ignored or break the auth handshake.

**Roles on Free**: assigned exclusively via the Portal's **Role management** invitation blade. Invited roles appear in `principal.userRoles` on every authenticated request. Roster-based grants (Cosmos `adminRoster` doc) are a parallel fallback path — see `api/src/lib/roles.ts` and spec 004.

**Enforced by**: `src/staticwebapp.config.test.ts` — invariants assert both fields are absent from the config.

**Discovered**: PR #48 (cost cut from Standard to Free).

---

### Route declaration order matters; first match wins

**Constraint**: SWA evaluates `routes` in declaration order. The first match wins. **`/admin/*` (and any other broad page-route patterns) MUST appear AFTER specific `/api/*` route declarations** to avoid a page-route bleeding into the API namespace.

**Discovered**: 2026-05-14, during PR #52 debugging. Initially mistakenly diagnosed as the cause of `/api/admin-users` 404s. Turned out NOT to be the cause (the function-name reservation was the real issue), but the route-ordering risk is real regardless.

**Enforced by**: `src/staticwebapp.config.test.ts` — invariant asserts `/admin/*` is positioned after every `/api/*` route.

---

### Pre-configured identity providers on Free tier: only GitHub + AAD

**Constraint**: Free tier supports only the pre-configured GitHub and Microsoft Entra ID identity providers. Apple / Facebook / Google / Twitter require Standard tier + custom registration. References to `/.auth/login/<provider>` in `staticwebapp.config.json` (or elsewhere) MUST be limited to `github` or `aad`.

**Enforced by**: `src/staticwebapp.config.test.ts`.

**Discovered**: PR #48.

---

### Managed Functions are not a separate Azure resource

**Constraint** (operator clarification, not enforced in code): The `api/` folder deploys as **managed Functions** hosted inside the SWA resource itself. There is no separate Function App resource in the resource group. Operators inspecting the Azure resource list will see only the SWA, Cosmos, Key Vault, and Managed Identity — **this is correct**; the function host runs as part of the SWA. Functions are visible in **Portal → Static Web App → APIs → Managed Functions**.

**Discovered**: 2026-05-14. Operator asked "where do you see we're using Azure Functions? I don't have any resource for it" — leading to confirmation that managed Functions is the only option on Free.

---

## Astro 5

### Inline `<script>` blocks WILL break under our CSP

**Constraint**: Astro emits very small `<script>` blocks inline as `<script type="module">…</script>`. Our CSP (`script-src 'self'`) has no `'unsafe-inline'`, so inline scripts are blocked at runtime, silently breaking page behavior.

**Mitigation**: Keep page-level setup code in shared modules imported by `Header.astro`'s already-large `<script>` block. The bundled chunk exceeds Astro's inlining threshold and emits externally.

**Enforced by**: `scripts/verify-no-inline-scripts.mjs` chained into `npm run build`. Fails the build (and CI) if any inline `<script>` block ends up in `dist/**/*.html`.

**Discovered**: 2026-05-14, during PR #52. First fix was reactive (move modal-init to Header). Second fix was the build-time guard so a future shrinkage can't silently regress.

---

## Cosmos DB

### `adminRoster` doc lives in the `users` container as a singleton

**Constraint**: There is **no separate `adminRoster` container**. The roster is a single document with `id: 'roster'` stored in the `users` container, partitioned by `/id` (the same partition shape as user records). The roster doc co-locates with user records intentionally — admin operations are bounded by user state.

**Schema**:
```json
{
  "id": "roster",
  "admins": ["gh-rmjoia", "gh-<other>", ...],
  "updatedAt": "<ISO 8601>",
  "_etag": "<managed by Cosmos>"
}
```

**Bootstrap fallback** (recovery runbook): If you ever need to manually seed yourself as admin (e.g. after Microsoft retires the invitation system, or after a Cosmos restore wiped the roster), there are **two** steps — editing only the roster doc is NOT sufficient on Free tier because the SWA route gates on `/admin/*` and the admin API endpoints require an admin-tier SWA role BEFORE the handler ever reads the Cosmos roster:

1. **SWA-side role**: assign yourself an admin-tier role (e.g. `manager`) via Azure Portal → Static Web App → Role management → Invite. Accept the invitation, sign out, sign back in. Verify `principal.userRoles` includes the role via `/.auth/me`.

2. **Cosmos-side roster (optional but recommended)**: edit the `users` container's `id: "roster"` doc in Cosmos Data Explorer and add your user id (`gh-<lowercased-github-username>`) to the `admins` array. This ensures the legacy roster path also grants admin (defence in depth), AND makes you appear in the `/admin/manage-admins` UI list.

Skipping step (1) leaves the SWA gate blocking you regardless of roster contents. Skipping step (2) leaves you with admin access via invitation but not visible in the admin UI's "Admins" list (which sources from the roster). Both steps are independent — operator does whichever combination matches their recovery situation.

**Discovered**: PR #35 (race-safe roster with optimistic concurrency).

---

## How to add a new constraint

1. Write a brief description following the format above.
2. **Cite the commit / PR / incident** where the constraint was discovered.
3. **Add an automated check** (test, build-time guard, or CI step) that enforces it. Reference the check from this doc.
4. Update the **Constitution Principle 9 (Verified Quality)** if the new constraint represents a new class of risk.

The goal: re-learning the same platform constraint twice should be impossible. Each constraint here represents real time lost; the enforcement test pays that cost back forever.
