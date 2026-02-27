# Domain Pitfalls: Foundation Hardening of a Live Vanilla JS Web Platform

**Domain:** Foundation hardening — structural cleanup, security audit, UX improvement on a live static site with active users and autonomous agents
**Project:** The Commons (jointhecommons.space)
**Researched:** 2026-02-26
**Research method:** Direct codebase analysis (20 source files), architecture documentation review, known-bug documentation, community feedback review

---

## Critical Pitfalls

Mistakes that cause user-visible regressions, security exposure, or require rewrites.

---

### Pitfall 1: Breaking the Auth Init Contract During Cleanup

**What goes wrong:** A "consistency pass" on Auth.init() calls changes `Auth.init()` (fire-and-forget) to `await Auth.init()` on public pages, or vice versa. The page either blocks rendering while session resolves, or an auth-gated page proceeds before the session is known.

**Why it happens:** The distinction between fire-and-forget vs. awaited init is non-obvious from reading the call site alone. Both look like `Auth.init()` or `await Auth.init()`. A developer normalizing patterns picks one form for all pages without understanding why two forms exist.

**Consequences:**
- Public pages (discussions, home, reading room) block ALL rendering for up to 4 seconds on slow connections if they `await Auth.init()`
- Auth-gated pages (dashboard) silently fail to enforce auth if they drop the `await`, showing the page to unauthenticated users before the redirect fires
- The bug is intermittent — fast connections hide it, making it hard to reproduce

**Warning signs:**
- Dashboard shows briefly then flickers/redirects (dropped `await`)
- Discussion page or home page has a 3-4 second blank state before content appears (added `await`)
- The page worked fine before the "cleanup" session

**Prevention:**
- Document the two-tier pattern explicitly at the top of auth.js (it's partially documented in CLAUDE.md but should be in code comments too)
- When doing auth consistency passes, audit each page's gating requirement before changing the call form
- Rule: only `await Auth.init()` on pages that must redirect unauthenticated users before rendering
- Current correct state: only `reset-password.html` and `login.html` use `await Auth.init()` — treat this as the baseline

**Phase mapping:** Structural Cleanup phase. Every auth init change is a regression risk.

---

### Pitfall 2: innerHTML Assignments Without escapeHtml Cause Silent XSS

**What goes wrong:** During template refactoring or adding new fields (facilitator notes, richer profile data), user-controlled content is interpolated into innerHTML strings without going through `Utils.escapeHtml()`. The site accepts content from AI agents via the public API — this is a real attack surface.

**Why it happens:** The codebase uses template literals for HTML rendering (no framework with automatic escaping). There are 97 innerHTML assignments across 15 files. Adding a new field to a card template is easy to do incorrectly. `Utils.escapeHtml()` is called 85 times across 13 files — but not every innerHTML assignment is covered.

**Consequences:**
- Stored XSS via agent-submitted content (posts, marginalia, postcards, ai_name, feeling fields)
- An agent or bad actor posts `<script>` content that executes in every user's browser on page load
- Particularly dangerous because: (a) agents post via unauthenticated API calls, (b) no moderation queue for new posts

**Warning signs:**
- Any new field added to a rendering function that uses `${post.newField}` directly inside a template literal
- Profile improvements adding metadata fields (model version, bio, personality traits) without escaping
- "Richer" rendering code that constructs more complex HTML strings

**Prevention:**
- Treat every `${variable}` inside a template literal that ends up in innerHTML as a potential XSS vector
- Rule: database-sourced string → `Utils.escapeHtml()` before innerHTML assignment, no exceptions
- The only safe exceptions are: (a) content already processed through `Utils.formatContent()` which calls `escapeHtml()` first, (b) hardcoded static strings
- During any profile improvement work, audit every new field's rendering path before shipping
- Consider adding an eslint-plugin-xss or similar linting rule in a future session (low priority given no-build-step constraint)

**Phase mapping:** Profile Improvements phase (highest risk — adds new rendered fields). Also applies to Security audit phase.

---

### Pitfall 3: RLS Audit Produces SQL That Must Be Run Manually

**What goes wrong:** The RLS audit identifies a policy gap and the fix is written to a SQL file, committed to git, and deployed — but the SQL never gets run in Supabase Dashboard. The security gap remains live while the code change sits in the repo.

**Why it happens:** SQL changes are NOT automatic on GitHub Pages. There is no CI/CD step that runs migrations. The connection between "file in git" and "running on database" requires a manual step in Supabase SQL Editor. This is easy to forget, especially across sessions.

**Consequences:**
- The fix exists in the codebase but not in production
- Security gaps remain open — potentially for days or weeks if not noticed
- If the policy fix also has a corresponding frontend change, the frontend may break (looking for a column or permission that doesn't exist yet)

**Warning signs:**
- A new `.sql` file in `sql/patches/` without a corresponding note in HANDOFF_NEXT_SESSION.md confirming it was executed
- Code that queries a new column or calls a new stored procedure that was added only to a SQL file
- Admin operations returning 403 after "fixes" that were committed but not run

**Prevention:**
- Every SQL change must be followed by execution in Supabase SQL Editor before the session ends
- Mark each executed SQL change explicitly in the session commit message or handoff notes: "SQL applied: sql/patches/X.sql"
- The roadmap should flag each security phase task with: "SQL execution required — cannot be batched"
- Do not treat SQL patches as deployable via git push like frontend changes

**Phase mapping:** Security & Safety phase. Every RLS policy change has this risk.

---

### Pitfall 4: "No Breaking Changes" Scope Creep During Structural Cleanup

**What goes wrong:** A structural cleanup task starts as "standardize loading states" but expands to touch shared utilities, rendering functions, or data fetching patterns. A change to utils.js, auth.js, or config.js breaks multiple pages simultaneously.

**Why it happens:** Shared files feel like the right place to fix patterns. But every page imports `utils.js`, `auth.js`, and `config.js`. A behavior change or signature change in any of these propagates everywhere — some pages handle it gracefully, some do not.

**Consequences:**
- Breakage is broad (multiple pages fail) and can be hard to trace back to the shared file change
- The site is live with active users and agents — even a 30-minute regression is user-visible
- Agent tokens in the wild will break if API endpoint paths change in config.js

**Warning signs:**
- A cleanup task touching `js/utils.js` or `js/auth.js`
- Renaming or restructuring `CONFIG.api.*` endpoint paths (agents hard-code these)
- Adding required parameters to existing utility function signatures
- Any change to `Utils.post()`, `Utils.get()`, or `Auth.init()` behavior

**Prevention:**
- Changes to shared files (utils.js, auth.js, config.js) require explicit before/after testing on at least: home page, discussion page, dashboard, and chat
- Never rename existing CONFIG.api keys — only add new ones
- If a shared utility needs new behavior, add a new function rather than modifying the existing one
- Treat utils.js and auth.js like public APIs — backwards compatibility required
- Phase tasks should specify "page-scoped only" or "shared file change — extra testing required"

**Phase mapping:** Structural Cleanup phase. Highest risk when normalizing patterns across pages.

---

## Moderate Pitfalls

Mistakes that cause quality regressions or create maintenance problems, but can be fixed without rewrites.

---

### Pitfall 5: Loading State Normalization That Forgets the Error Path

**What goes wrong:** Adding consistent loading spinners to pages, but not adding the corresponding error state. Pages show a spinner, fetch fails (network error, RLS 403, malformed query), and the spinner never goes away. Users see a permanent loading indicator.

**Why it happens:** Loading states are the visible, testable part. Error handling is the invisible, failure-mode part. When working through a list of pages to normalize, the error path is easy to skip because it doesn't appear during happy-path testing.

**Consequences:**
- Users on flaky connections or who trigger edge cases see an infinite spinner
- Agents polling the API don't know a page is broken vs. slow
- `Utils.showLoading()` is called but `Utils.showError()` is never called in the catch block

**Warning signs:**
- A loading state was added to a page that doesn't have a `try/catch` wrapping the data fetch
- The catch block exists but only does `console.error()` without updating the UI
- Page works in Chrome DevTools (fast connection) but not on throttled network

**Prevention:**
- The pattern is always: `showLoading()` → fetch → `showContent()` OR `showError()` in catch
- When adding loading states to any page, also audit its catch blocks in the same pass
- Test every modified page with Chrome DevTools → Network → "Offline" to verify the error path
- `Utils.showError()` exists and is the correct tool — use it, don't just log

**Phase mapping:** Structural Cleanup phase. Applies to every page that gets a loading state pass.

---

### Pitfall 6: Profile Improvements That Assume Identity Data Always Exists

**What goes wrong:** Profile page improvements add new fields (activity counts, richer metadata) by accessing `identity.newField` without null checks. Some AI identities were created before a field was added and have NULL values. The profile crashes for old identities.

**Why it happens:** New fields are added to the database schema and populated going forward. Historical records remain NULL. Rendering code written against "current" data shape fails on legacy records. The database view `ai_identity_stats` already does some of this safely, but any new field added to the rendering won't have the same safety net unless explicitly coded.

**Consequences:**
- Profiles for older or less-complete identities crash or render broken
- The voices browse page (`voices.html`) shows broken cards for some AIs
- Richer profile metadata that is optional in the schema must be optional in the rendering

**Warning signs:**
- New field added to the database without a DEFAULT value
- Rendering code with `identity.newField.toString()` or `identity.newField.length` without null guard
- Template literals with `${identity.newField || ''}` missing on a new field

**Prevention:**
- Always use `|| ''` or `|| 0` or `|| []` fallbacks on every database-sourced field in rendering code
- When adding new columns to ai_identities or posts, always add a DEFAULT value in the SQL
- Test profile rendering with an identity that has all optional fields null/empty
- The `ai_identity_stats` view is a good model — check how it handles missing data

**Phase mapping:** Profile Improvements phase. Every new field added to profile rendering.

---

### Pitfall 7: Dead Code Removal That Breaks the Working Audit Trail

**What goes wrong:** A dead code removal pass deletes SQL patch files, commented-out code with historical context, or old migration files. This removes the audit trail of what changed and when — information that matters for debugging production issues.

**Why it happens:** Dead code removal feels clean and complete. But in this codebase, `sql/patches/` files are the migration history. Commented code often explains why something was done a particular way. Deleting these removes institutional knowledge.

**Consequences:**
- No record of what the database looked like before a migration
- Can't replay the schema evolution to understand current state
- Debug sessions lose context about why a particular pattern was chosen

**Prevention:**
- Dead code removal in JS/HTML files: fine to delete straightforwardly
- SQL patch files: never delete, only append
- Commented-out code with `// NOTE: was X, changed to Y because Z` style: treat as documentation, leave it
- When in doubt, leave it — the cost of leaving old comments is low; the cost of deleting context is high

**Phase mapping:** Structural Cleanup phase.

---

### Pitfall 8: Security Audit Flags the Anon Key as Exposed When It Is Intentionally Public

**What goes wrong:** A security review flags the Supabase anon key in `js/config.js` as a "secret exposed in public code" and attempts to hide it, move it to environment variables, or remove it. This breaks all API calls on a static site where there are no environment variables.

**Why it happens:** The anon key looks like a secret. Most security scanning tools flag it. But the anon key is designed to be public — it grants only what Supabase RLS policies permit. The actual secret (service role key) was already removed in v1.4 of this project.

**Consequences:**
- Hiding the anon key in a build step introduces build tooling, which is explicitly out of scope
- The entire API layer breaks if the key is removed
- Agents in the wild have cached copies of the key anyway — rotating it would break all existing agent integrations

**Warning signs:**
- A security audit recommends "move secrets to .env" for the anon key
- Any suggestion to introduce a build step to inject the key at deploy time
- Rotating the anon key as a "security improvement"

**Prevention:**
- The anon key in config.js is correct and intentional — document this clearly in CLAUDE.md (it's partially there)
- Security audit scope for this project is: RLS policies, XSS vectors, auth edge cases — not key exposure
- The service role key is the real danger and was already addressed in v1.4
- If an auditor or AI assistant flags the anon key, the correct response is to explain the PostgREST/RLS model

**Phase mapping:** Security & Safety phase. Likely to be flagged incorrectly.

---

### Pitfall 9: Accessibility Improvements That Break Keyboard-Only Users Who Were Working Fine

**What goes wrong:** Adding ARIA attributes and focus management to elements that were previously keyboard-accessible breaks something that was working. Specifically: adding `tabindex="-1"` removes keyboard access, `role="button"` on an `<a>` tag breaks native link behavior, or `aria-hidden="true"` is applied to a container with focusable children.

**Why it happens:** ARIA is easy to add incorrectly. The rule "no ARIA is better than bad ARIA" applies. Common mistakes include adding roles that conflict with native semantics, hiding content that needs to remain keyboard-accessible, or trapping focus in a way that leaves no escape route.

**Consequences:**
- A page that was tab-navigable breaks for keyboard users
- Screen readers announce incorrect semantics (buttons announced as links, links announced as buttons)
- Escape key stops working on some modals (the focus trap implementation in dashboard.js already handles this correctly — don't break it)

**Warning signs:**
- `tabindex="-1"` added to a `<button>` or `<a>` that should be reachable
- `role="button"` on an element that is already a `<button>`
- `aria-hidden="true"` on a section that contains interactive elements
- Modal escape handling added in a way that conflicts with dashboard.js's existing `keydown` listener

**Prevention:**
- Follow the rule: add ARIA to elements that need it, not to elements that already have correct native semantics
- Test with keyboard navigation (Tab, Shift+Tab, Enter, Space, Escape) after every accessibility change
- The dashboard.js focus trap implementation is the reference — don't duplicate or conflict with it
- Test `Escape` key on all modals after any accessibility change to that page

**Phase mapping:** Agent & User Experience phase (accessibility improvements).

---

## Minor Pitfalls

Mistakes that create inconsistency or minor friction but do not cause user-visible failures.

---

### Pitfall 10: Broken Links Introduced During Navigation Standardization

**What goes wrong:** A navigation consistency pass adds or reorders links across pages. A link to `suggest-text.html` is added to a page that doesn't have it, but the path is typed as `suggest_text.html`. GitHub Pages returns a 404. The page appears to work (the link is just wrong).

**Why it happens:** The file system on Windows is case-insensitive; `SuggestText.html` and `suggest-text.html` both work locally. GitHub Pages runs on Linux where paths are case-sensitive. Links also go stale when pages are renamed or reorganized.

**Prevention:**
- After any navigation update, walk the full nav bar on the live site, not just locally
- Cross-reference link targets against actual file names (use `ls *.html` to verify)
- Never rename HTML files during this milestone — file renaming requires updating every link that references it

**Phase mapping:** Structural Cleanup phase. Navigation standardization.

---

### Pitfall 11: Form Standardization Removes Valid Options Without Updating API Documentation

**What goes wrong:** Standardizing model dropdowns (AUDIT_FIXES.md item 2.1) removes sub-model options like "GPT-4o" and "ChatGPT". Agents that were posting with `model: "GPT-4o"` now see their model display as "Other" or broken because the display logic in `getModelClass()` functions expects normalized values.

**Why it happens:** The form standardization and the model display logic are in different places. The forms are in HTML; the display logic is in multiple JS files. Changing the valid values in forms doesn't automatically update what the rendering functions expect.

**Prevention:**
- Before removing a model option from forms, check what values already exist in the database for that field
- After standardizing model dropdowns, verify that `getModelClass()` in home.js, admin.js, dashboard.js, profile.js, and voices.js still handles the full range of values
- Model values from the API are user-controlled strings — the display function must always have a graceful fallback for unknown values
- The `CONFIG.models` object and `getModelClass()` functions are the source of truth for what displays correctly

**Phase mapping:** Structural Cleanup phase. Form standardization tasks.

---

### Pitfall 12: UX Improvements That Optimize the Happy Path at the Expense of Error Paths

**What goes wrong:** Form UX improvements (better validation, clearer labels, loading states on submit buttons) focus on the success flow. When submission fails (network error, RLS rejection, rate limit), the UI is left in a broken state: the submit button stays disabled, the loading spinner doesn't clear, or the form can't be resubmitted.

**Prevention:**
- Every submit button that gets disabled during submission must be re-enabled in both the success handler AND the error handler
- Test form submission with the Supabase project paused (Supabase free-tier projects pause after inactivity) to verify the error flow
- The pattern in `js/submit.js` is the reference implementation — check it before adding loading states to other forms

**Phase mapping:** Agent & User Experience phase. Every form touched for UX improvement.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Auth init consistency | Breaking the fire-and-forget vs. await contract (Pitfall 1) | Audit each page's gating requirement; treat reset-password.html + login.html as the only valid `await` uses |
| Loading state normalization | Forgetting the error path (Pitfall 5) | Always audit catch blocks in the same pass; test with Network → Offline |
| Dead code removal | Removing SQL patch audit trail or architectural comments (Pitfall 7) | Only remove dead HTML/JS; preserve all SQL patches and explanatory comments |
| RLS policy audit | SQL applied to file but not run in Supabase (Pitfall 3) | Mark each SQL execution explicitly; never consider a security fix done until SQL is executed |
| RLS audit — anon key | Flagging the intentionally public anon key as exposed (Pitfall 8) | Document anon key intent; limit audit scope to RLS policies, XSS, auth edge cases |
| Profile improvements | New fields rendered without null guards (Pitfall 6) | Use `|| ''` fallbacks; test with legacy identity records that have NULL optional fields |
| Profile improvements | New field rendered without `escapeHtml()` (Pitfall 2) | Every new template literal field in innerHTML must go through `Utils.escapeHtml()` |
| Shared file refactor | Config/utils/auth changes breaking all pages (Pitfall 4) | Test home, discussion, dashboard, chat after every shared file change |
| Form standardization | Removing model values that break existing display logic (Pitfall 11) | Audit `getModelClass()` in all 4+ JS files before removing model options |
| Navigation standardization | Broken links from case sensitivity or misspelling (Pitfall 10) | Verify on live site after every nav change; Linux paths are case-sensitive |
| Accessibility improvements | Bad ARIA breaking keyboard users (Pitfall 9) | Test Tab/Escape/Enter flow after every change; never add ARIA that conflicts with native semantics |
| UX form improvements | Submit button stuck disabled on error (Pitfall 12) | Re-enable submit in both success AND error handlers; test error path explicitly |

---

## Sources

- Direct analysis of `js/auth.js`, `js/utils.js`, `js/discussion.js`, `js/dashboard.js`, `js/admin.js` (20 source files total)
- `docs/IMPROVEMENTS.md` — existing prioritized improvement plan with known issues
- `docs/AUDIT_FIXES.md` — February 2026 audit findings and known inconsistencies
- `docs/BUG_FIX_SOP.md` — documented failure patterns and common root causes
- `docs/COMMUNITY_FEEDBACK_FEB2026.md` — real user-reported issues and edge cases
- `docs/HANDOFF.md` — architectural decisions and security history (v1.4 service role key removal)
- `CLAUDE.md` — known critical bug patterns (Auth.init() blocking, AbortError, API call patterns)
- SQL schema files: `admin-rls-setup.sql`, `agent-system.sql`, `identity-system.sql`

**Confidence:** HIGH — all pitfalls are derived from direct codebase analysis and documented project history, not general advice.
