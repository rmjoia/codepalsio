<!--
PR template per Constitution Principle 9 (Verified Quality, NON-NEGOTIABLE):
every PR MUST identify the automated verification of its promised behavior.
"Tests pass" without verifying the user-facing promise is hope, not quality.
-->

## What this PR delivers

<!-- 1-3 sentences. The user-facing or operator-facing outcome — what
will be different after this merges. -->

## Verified by

<!-- REQUIRED. Identify the specific test(s) that prove the promise above
is delivered. File path + test name. If no such automated verification
exists, STOP and add one before opening this PR — see Constitution P9.

Exceptions (must be explicit):
- Pure docs/spec PRs: write "Docs-only; no behavioural change."
- Refactor with zero behavioural change: write "Refactor only; existing
  test coverage proves no regression: <test file>."
-->

- [ ] `<test file path>::<test name>` — explains what it asserts
- [ ] (add more rows as needed)

## Constitution compliance

<!-- Cross-check each principle. Mark N/A for principles untouched. -->

- [ ] P1 Open Source & Transparency — no secrets / sensitive data added
- [ ] P2 Code Quality — lint / format / unit-tests pass; reviewed
- [ ] P3 Security (NON-NEGOTIABLE) — input validation, output sanitization, least privilege addressed where relevant
- [ ] P4 Performance — RU / bundle / response-time impact considered (note if significant)
- [ ] P5 Privacy (NON-NEGOTIABLE) — minimal data collection; no PII leakage in responses
- [ ] P7 Brand Consistency — visual changes match design system (if applicable)
- [ ] P8 i18n & Accessibility — strings externalized; keyboard / screen reader OK (if applicable)
- [ ] P9 Verified Quality (NON-NEGOTIABLE) — see "Verified by" above

## Platform constraints

<!-- Did this PR encounter a new platform quirk? If yes, add it to
.specify/platform-constraints.md WITH an enforcing test before merge. -->

- [ ] No new platform constraint discovered, OR
- [ ] New constraint documented in `.specify/platform-constraints.md` AND enforced by `<test file>`

## Operator action items (if any)

<!-- Anything the operator must do post-merge (env-var changes, Azure
portal clicks, Cosmos data migration). Empty if none. -->

- [ ] None
