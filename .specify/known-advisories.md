# Known Tolerated Advisories

Advisories flagged by `npm audit` that we have **consciously tolerated** because:

- no upstream fix exists yet, AND
- the vulnerable code path is not reachable in production, AND
- the risk assessment is documented below.

The `npm run audit` gate is set to `--audit-level=critical` to let these pass. Any **critical**-severity advisory still fails CI immediately. New **high** advisories that fit the criteria above should be added to this list via PR, with the rationale. Advisories that are reachable in production MUST be fixed, not tolerated.

Every entry carries a scheduled review date so this list doesn't become a graveyard.

---

## GHSA-ch52-4w7c-c8xp — `http-cache-semantics` max-stale handling

- **Advisory**: https://github.com/advisories/GHSA-ch52-4w7c-c8xp
- **Severity**: High (CVSS 7.5)
- **Package**: `http-cache-semantics` (transitive, via Astro)
- **Vulnerable range**: `<=4.2.0` (the only published versions — no fixed version exists upstream)
- **Our installed version**: `4.2.0` (latest; `npm ls http-cache-semantics` confirms)
- **Advisory published**: September 2025

### Why we tolerate it

1. **No fixed version exists.** `http-cache-semantics` has not released a patched version — the advisory affects every published version. `npm audit fix --force` suggests downgrading Astro to 2.10.9, which pulls an older `http-cache-semantics` the advisory DB doesn't flag yet; this is not a real fix.

2. **The vulnerable code path is unreachable in our production build.** `http-cache-semantics` is used by Astro's build-time image optimization pipeline (`astro build`). CodePals is `output: 'static'`; the production artefact is pre-rendered HTML + static assets served by Azure SWA. No HTTP cache-header parsing executes at runtime on `codepals.io` or `dev.codepals.io`.

3. **The attack vector (CWE-524: Information Exposure Through Caching) requires the vulnerable library to process attacker-controlled HTTP responses in a shared cache context.** Our build does neither.

### Scheduled review

**Review again: 2026-11-01.** If a fixed `http-cache-semantics` has been published by then, bump via `npm update http-cache-semantics` (overrides may be needed if Astro's lockfile pins the old version), raise the `audit` script back to `--audit-level=high`, and delete this entry.

If no fix is published by the review date, document the next review date and the current state check in a follow-up PR.

### How to confirm this is still tolerated

```sh
npm audit --omit=dev --audit-level=critical     # should exit 0 (gate at critical)
npm audit --omit=dev --audit-level=high | grep -A5 http-cache-semantics  # should show the advisory
```

The gate exits 0 on `critical` because this advisory is `high` (CVSS 7.5), below the gate. If a `critical` advisory appears, CI fails loudly and immediately.
