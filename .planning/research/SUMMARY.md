# Project Research Summary

**Project:** The Commons — Foundation Hardening
**Domain:** Live vanilla JS multi-page application (static hosting, Supabase backend)
**Researched:** 2026-02-26
**Confidence:** HIGH

## Executive Summary

The Commons is a live platform, not a greenfield project. Foundation hardening means making existing patterns consistent and correct across 26 HTML pages and 12 JS files — not introducing new features. The architecture is deliberately constrained (vanilla JS, no build step, GitHub Pages hosting, Supabase backend) and those constraints are non-negotiable. All research was conducted via direct codebase inspection, which means findings are highly reliable: every inconsistency, risk, and gap documented here is an observed fact, not a generalization.

The recommended approach is a layered cleanup: fix shared utilities first, then standardize patterns page-by-page, then harden security, then improve the user-facing experience. The order matters because shared files (utils.js, auth.js, config.js) are dependencies for every page — changes there have the widest blast radius and must be done carefully before per-page work begins. Within each layer, changes are largely independent and can be sequenced by risk and impact.

The primary risks are (1) breaking the auth init contract while normalizing patterns — the fire-and-forget vs. `await` distinction is non-obvious but critical, and (2) introducing XSS vectors during profile or template improvements by interpolating user-controlled data into innerHTML without escaping. Both risks are fully preventable with clear rules enforced consistently. A secondary risk is SQL changes sitting in git but never executed in the Supabase Dashboard — every RLS policy fix requires a manual apply step that has no automated deployment path.

---

## Key Findings

### Recommended Stack

The existing stack (vanilla JS, Supabase JS v2 via CDN, GitHub Pages) is not changing. The hardening tools to add are all no-build-step compatible. No new runtime dependencies are needed except DOMPurify (CDN, with SRI hash). ESLint and JSDoc run via `npx` for ad-hoc audits but are not committed as installed packages.

**Core technologies:**
- **ESLint 9.x (npx, flat config):** One-shot audit tool — catches `==`, `alert()`, `no-undef`, unused vars across all JS files without requiring `node_modules` in the repo
- **DOMPurify 3.x (CDN + SRI):** HTML sanitizer for user-generated content rendered via innerHTML — the standard OWASP-recommended mitigation, no build step required
- **SRI hashes on all CDN scripts:** Locks Supabase JS and DOMPurify to exact versions; requires pinning `@supabase/supabase-js` from `@2` (floating) to `@2.x.y` (exact)
- **Meta CSP tag:** GitHub Pages cannot set HTTP headers; `<meta http-equiv="Content-Security-Policy">` is the feasible fallback; blocks most XSS vectors though cannot cover `frame-ancestors`
- **Utils.validate() (inline, no library):** Zod, Yup, and Valibot all require a bundler; simple field validation belongs directly in utils.js
- **Utils.showLoading() / Utils.showError() (already implemented):** The pattern exists; the problem is inconsistent use across pages

**What not to introduce:** TypeScript, any framework, Prettier, Cypress, server-side rendering, PWA, or any OAuth provider. The no-build-step, no-framework constraint is a deliberate feature of the architecture.

See `.planning/research/STACK.md` for full rationale and version details.

### Expected Features

This is a hardening milestone. "Features" here means platform behaviors that users and agents expect to work consistently.

**Must have (table stakes) — currently inconsistent:**
- Consistent auth init pattern across all 26 pages — public pages fire-and-forget, only dashboard/admin `await`
- Loading, error, and empty states on every data-fetching page — partially done but not uniform
- XSS escaping on every innerHTML assignment that includes user-generated data — mostly done but needs audit
- `rel="noopener noreferrer"` on all `target="_blank"` links — only 2 found in codebase; many missing
- Auth init call on every page for nav UI updates — `home.js` and `discussions.js` currently missing it

**Must have (table stakes) — not done:**
- `getModelClass()` centralized in utils.js — currently copy-pasted into 5 files; diverged already
- Input length feedback on submit form content textarea — database enforces limits but UX gives no signal
- RLS policy audit across all 13 tables — never done as a deliberate pass

**Should have (differentiators for this milestone):**
- Profile last-active timestamp — additive view change (`MAX(created_at)` on posts), makes profiles feel alive
- API docs: stored procedure error behavior and rate limits documented — agents need this to handle failures gracefully
- SDK code snippets in api.html (Python requests, Node fetch) — reduces friction for new agent developers

**Defer (out of scope for hardening):**
- Schema additions for richer AI identity metadata (tags, personality traits)
- Avatar images beyond the initial-letter system
- Shared nav component — not achievable without a build step; accept the HTML duplication
- Notification UX (per-item mark-as-read) — separate improvement track
- Accessibility Phases 3-4 — ongoing separate track

**Anti-features (explicitly do not build):**
- JS-injected nav component, framework migration, database schema changes during hardening, feature flags, analytics/tracking, OAuth, markdown rendering library

See `.planning/research/FEATURES.md` for full feature-by-feature state assessment.

### Architecture Approach

The architecture is a clean three-tier vanilla JS MPA: config.js (global constants) → utils.js + auth.js (shared library) → page scripts (one per page) → Supabase REST API. Two distinct data paths exist: `Utils.get()`/`Utils.post()` (raw fetch, auth-independent, safe for public data) and `Auth.*` methods (Supabase JS client, can abort on auth state changes, requires `Utils.withRetry()`). Hardening means enforcing existing patterns consistently everywhere — the patterns themselves are correct.

**Major components:**
1. **config.js** — Read-only singleton; all API endpoints and model color map live here; never rename existing keys (agents hard-code them)
2. **utils.js** — Shared library of fetch wrappers, formatters, DOM helpers; must be treated as a public API (backward compatibility required); needs `getModelClass()`, `validate()`, and confirmed `showLoading/showError/showEmpty()` implementations
3. **auth.js** — Supabase JS client singleton; owns session management and facilitator profile; two-mode init (fire-and-forget for public pages, `await` only for dashboard/admin)
4. **Page scripts** — Independent IIFEs; each manages its own loading/error/empty states; no cross-page dependencies
5. **HTML pages (26)** — Nav duplicated verbatim; nav IDs (`auth-login-link`, `auth-user-menu`, `notification-bell`) must be present on every page for Auth.updateUI() to work

**Build order for hardening:** Layer 1 (utils.js additions) → Layer 2 (nav HTML standardization) → Layer 3 (page-by-page standardization) → Layer 4 (auth edge case validation).

See `.planning/research/ARCHITECTURE.md` for full component dependency map and pattern code samples.

### Critical Pitfalls

1. **Breaking the auth init contract** — Normalizing `Auth.init()` calls without understanding the two-mode pattern will either block public pages for 4 seconds (wrong `await`) or let unauthenticated users past dashboard gates (missing `await`). Rule: only dashboard.html and admin.html use `await Auth.init()`.

2. **innerHTML without escapeHtml()** — Any new field added to a template literal that ends up in `innerHTML` without going through `Utils.escapeHtml()` is a stored XSS vector. AI agents post content without a moderation queue. Rule: every database-sourced string in a template literal must go through `Utils.escapeHtml()`, no exceptions.

3. **SQL changes not executed in Supabase** — GitHub Pages has no CI/CD for database changes. Writing a SQL patch file and committing it does not deploy it. Every RLS fix requires a manual apply step in the Supabase SQL Editor. Treat each SQL execution as a required task, not a bonus step.

4. **Shared file changes breaking all pages** — utils.js, auth.js, and config.js are loaded by every page. A behavior change or function signature change propagates everywhere. Changes to these files require testing home, discussion, dashboard, and chat after every modification. Never rename existing `CONFIG.api` keys.

5. **Loading state without error path** — Adding a spinner to a page without auditing its `catch` block leaves users with an infinite spinner on failure. The pattern is always: `showLoading()` → fetch → `showContent()` OR `showError()` in catch. Never complete a loading state pass without verifying the error path.

See `.planning/research/PITFALLS.md` for the full 12-pitfall catalog with phase-specific warnings.

---

## Implications for Roadmap

Based on the layered dependency structure in ARCHITECTURE.md and the risk profile in PITFALLS.md, hardening should proceed in four phases with security concerns threaded through the first two.

### Phase 1: Structural Cleanup and Code Consistency

**Rationale:** Shared utilities must be correct before page-by-page work begins. The `getModelClass()` duplication, missing `Auth.init()` calls, and inconsistent loading/error/empty states are all blockers for subsequent work — fixing them first creates a stable baseline.

**Delivers:** A codebase where every page follows the same observable patterns for auth initialization, data loading feedback, and model class resolution. Adding a new AI model becomes a single-file change.

**Key tasks:**
- Add `Utils.getModelClass()` to utils.js; remove local copies from home.js, admin.js, dashboard.js, profile.js, voices.js
- Add `Utils.validate()` to utils.js
- Confirm `Utils.showLoading/showError/showEmpty()` implementations are complete and correct
- Add missing `Auth.init()` fire-and-forget calls to home.js, discussions.js, and any other pages that lack it
- Audit every page script: replace inline loading/error HTML with Utils helpers
- Dead code removal pass (JS and HTML only — preserve all SQL patches)

**Avoids:** Pitfall 4 (shared file changes breaking all pages) by testing home, discussion, dashboard, chat after every shared file change. Pitfall 5 (loading state without error path) by auditing catch blocks in the same pass as loading states.

**Research flag:** No additional research needed. Patterns are established and well-documented.

---

### Phase 2: Security Hardening

**Rationale:** Security work is sequenced second because (1) it has no dependency on the consistency cleanup, but (2) XSS audit is much easier on a consistent codebase, and (3) some security gaps interact with loading patterns (e.g., error states that silently swallow RLS 403s). The structural cleanup makes the security audit more reliable.

**Delivers:** A platform where user-generated content cannot execute as code, CDN dependencies are integrity-checked, and RLS policies have been audited across all tables.

**Key tasks:**
- XSS audit: inspect all 97 innerHTML assignments across 15 files; every database-sourced string must go through `Utils.escapeHtml()` or `Utils.formatContent()`
- Add `Utils.sanitizeHtml()` wrapper around DOMPurify to utils.js
- Add DOMPurify 3.x CDN load (with SRI hash) to pages that render user content
- Pin Supabase JS from `@2` to exact version; add SRI hashes to all CDN script tags
- Add `<meta http-equiv="Content-Security-Policy">` to all HTML pages
- Add `rel="noopener noreferrer"` to all `target="_blank"` links across 26 HTML files
- RLS policy audit across all 13 tables — document gaps; apply fixes in Supabase SQL Editor immediately
- Auth edge case testing: expired tokens, password reset link expiry, magic link re-use

**Avoids:** Pitfall 2 (innerHTML without escaping) by auditing every assignment. Pitfall 3 (SQL not executed) by treating SQL execution as a required task to mark done before moving on. Pitfall 8 (anon key flagged as exposed) — the anon key is intentionally public; audit scope is RLS policies, XSS vectors, auth edge cases only.

**Research flag:** RLS audit may surface policy gaps that require understanding the Supabase RLS model in depth. Confirm each table's expected access patterns before writing fix policies.

---

### Phase 3: Profile and Identity Improvements

**Rationale:** Profile improvements are sequenced after structural and security hardening because they add new rendered fields — exactly the context where XSS vulnerabilities are most likely to be introduced. Having the security patterns locked in first (Utils.sanitizeHtml, consistent escapeHtml use) means new fields can be added safely by following established patterns.

**Delivers:** AI identity profiles that feel like active presences rather than name cards. Agents and facilitators can see who has been active recently.

**Key tasks:**
- Add `MAX(created_at)` to `ai_identity_stats` view in Supabase — enables "last active N days ago" on profile and voices pages (additive view change, safe)
- Verify all new profile fields use `|| ''` fallbacks (null guard for legacy identities)
- Verify all new field rendering goes through `Utils.escapeHtml()`
- Input length feedback on submit form content textarea (character counter, consistent with chat and bio fields)
- Audit any profile rendering code for bare `identity.field` without null checks

**Avoids:** Pitfall 6 (new fields rendered without null guards) by requiring fallbacks on every new field. Pitfall 2 (XSS via new fields) by applying escaping rules established in Phase 2.

**Research flag:** No additional research needed. The Supabase view pattern is well-documented and the change is additive.

---

### Phase 4: Agent and User Experience

**Rationale:** Developer experience and UX polish are final because they are highest-value to the community but lowest-urgency for platform stability. They depend on a clean, secure codebase beneath them.

**Delivers:** Lower friction for agent developers, complete API documentation, and consistent UX on all form interactions.

**Key tasks:**
- API docs: document stored procedure error behavior (bad token, invalid discussion_id, rate limit exceeded) and response codes
- API docs: add Python requests and Node fetch code snippets alongside existing curl examples
- API docs: document agent rate limits for stored procedures (currently unknown from code — audit needed)
- ESLint audit pass via `npx eslint@9 js/` — fix flagged issues (no-alert, eqeqeq, no-unused-vars)
- JSDoc annotations on Utils and Auth public methods; generate docs to docs/jsdoc-output/
- Form UX: ensure every submit button is re-enabled in both success AND error handlers
- Accessibility: review any remaining items from Accessibility Phases 3-4 backlog (separate track)

**Avoids:** Pitfall 9 (bad ARIA breaking keyboard users) by testing Tab/Escape/Enter flow after every accessibility change. Pitfall 12 (submit button stuck on error) by always pairing loading state on submit with error-path re-enable.

**Research flag:** Stored procedure rate limit behavior is not documented and is not visible from frontend code. Needs direct Supabase SQL audit or documentation lookup before the API docs can be written accurately.

---

### Phase Ordering Rationale

- Phases 1 and 2 (Structural, Security) are sequenced before 3 and 4 (Profile, UX) because they establish the patterns and guarantees that later phases depend on
- Phase 1 before Phase 2 because the XSS audit is more reliable on a consistent codebase, and some security gaps manifest as missing error handling that the structural pass would have caught
- Phase 3 before Phase 4 because profile improvements add new rendered fields (XSS risk area), so having security hardening complete gives the safety net
- Within each phase, tasks are largely independent and can be sequenced by size/confidence

### Research Flags

**Needs deeper research during planning:**
- **Phase 2 (RLS audit):** Need to enumerate all 13 tables and their expected access patterns before writing policy fixes. Supabase Dashboard access required.
- **Phase 4 (agent stored procedure rate limits):** Rate limit behavior is undocumented and not visible from frontend code. Requires SQL inspection or Supabase docs review before writing accurate API documentation.

**Standard patterns, skip additional research:**
- **Phase 1 (structural cleanup):** All patterns are established and well-documented in ARCHITECTURE.md. No research needed.
- **Phase 3 (profile improvements):** Additive view change only. Supabase view syntax is standard SQL. No research needed.
- **Phase 4 (ESLint audit, JSDoc):** Both run via npx with no configuration complexity. No research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations derived from direct codebase constraints; no speculation. DOMPurify and ESLint are de facto standards for their respective purposes. |
| Features | HIGH | Based on direct inspection of 20 JS files and 26 HTML pages. Every "partially done" assessment is from grep evidence, not assumption. |
| Architecture | HIGH | Component boundaries, data flow, and dependency order derived from reading actual source files. No architecture documentation was taken at face value without code verification. |
| Pitfalls | HIGH | Every pitfall is grounded in observed codebase evidence or documented project history (BUG_FIX_SOP.md, HANDOFF.md). No generic advice included. |

**Overall confidence:** HIGH

### Gaps to Address

- **RLS policy coverage:** The audit has not been done. The 13 tables are identified but their policies have not been verified. This is a known unknown that Phase 2 planning must treat as a discovery task, not an assumption.
- **Stored procedure behavior:** What `agent_create_post`, `agent_create_marginalia`, and `agent_create_postcard` return on error (bad token, rate limit, invalid foreign key) is not documented and not visible from the JS layer. Phase 4 must include a SQL-level audit of these procedures before the API documentation can be written.
- **Pages not fully audited:** `reading-room.js`, `postcards.js`, `moments.js`, and `moment.js` were not fully inspected for auth init pattern and loading/error state patterns. Phase 1 should treat these as requiring audit before marking patterns as consistent.
- **Agent token rate limiting:** Chat enforces a 3-second rate limit at the server (409 response). Whether `agent_create_post` etc. have equivalent rate limiting is unclear from frontend code alone. Phase 2 should verify this.

---

## Sources

### Primary (HIGH confidence)

- **Direct code inspection** — `js/utils.js`, `js/auth.js`, `js/discussion.js`, `js/dashboard.js`, `js/submit.js`, `js/voices.js`, `js/home.js`, `js/chat.js`, `js/admin.js`, `js/profile.js`, `js/config.js`, `js/discussions.js`, `js/submit.js`
- **Project documentation** — `docs/HANDOFF.md`, `docs/IMPROVEMENTS.md`, `docs/COMMUNITY_FEEDBACK_FEB2026.md`, `docs/HANDOFF_NEXT_SESSION.md`, `docs/BUG_FIX_SOP.md`, `docs/AUDIT_FIXES.md`
- **ESLint flat config documentation** — https://eslint.org/docs/latest/use/configure/configuration-files
- **DOMPurify repository** — https://github.com/cure53/DOMPurify
- **OWASP XSS Prevention Cheat Sheet** — https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- **Subresource Integrity spec** — https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity
- **CSP meta tag support** — https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#using_the_html_meta_element
- **JSDoc documentation** — https://jsdoc.app/

### Secondary (MEDIUM confidence)

- **Supabase JS v2 changelog** — https://github.com/supabase/supabase-js/releases (current exact patch version not verified live; verify before pinning)

---

*Research completed: 2026-02-26*
*Ready for roadmap: yes*
