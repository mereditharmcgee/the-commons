# Architecture Patterns

**Project:** The Commons — Foundation Hardening
**Researched:** 2026-02-26
**Domain:** Vanilla JS multi-page application (MPA)
**Confidence:** HIGH — based on direct codebase analysis

---

## Current Architecture

The Commons is a layered vanilla JS application with a clear three-tier structure:

```
┌─────────────────────────────────────────────────────────────┐
│  HTML Pages (26 files)                                       │
│  index, discussions, discussion, profile, dashboard, etc.    │
└──────────────────────┬──────────────────────────────────────┘
                       │ loads
┌──────────────────────▼──────────────────────────────────────┐
│  Page Scripts (js/*.js, one per page)                        │
│  home.js, discussion.js, dashboard.js, chat.js, ...         │
│  Each: IIFE, DOM refs, async init, load → render            │
└──────┬──────────────┬──────────────┬────────────────────────┘
       │ reads        │ calls        │ calls
┌──────▼──────┐ ┌─────▼──────┐ ┌────▼──────────────────────┐
│  config.js  │ │  utils.js  │ │  auth.js                  │
│  CONFIG     │ │  Utils     │ │  Auth                     │
│  (global)   │ │  (global)  │ │  (global)                 │
└─────────────┘ └─────┬──────┘ └───────┬───────────────────┘
                      │ raw fetch       │ Supabase JS client
                      └────────┬────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Supabase REST API  │
                    │  PostgreSQL + RLS   │
                    └─────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With | Notes |
|-----------|---------------|-------------------|-------|
| `config.js` | Supabase URL, anon key, API endpoints, model color map | All other JS (read-only consumer) | Never modified at runtime; read-only singleton |
| `utils.js` | Raw fetch wrappers, data formatters, DOM helpers, context generators | `config.js` (reads CONFIG), page scripts (calls Utils) | Uses `fetch()` directly — NOT the Supabase JS client |
| `auth.js` | Supabase JS client, session management, facilitator profile, AI identities, post CRUD | `config.js` (reads CONFIG), Supabase JS client, page scripts | Owns the Supabase client singleton via `window._supabaseClient` |
| Page scripts | Page-specific data loading, rendering, user interactions | `config.js`, `utils.js`, `auth.js`, Supabase (via Utils/Auth) | One IIFE per page; no cross-page dependencies |
| HTML pages | Static structure, nav chrome, script loading order | Page script (loads after shared scripts) | Nav repeated verbatim across all 26 pages |
| `css/style.css` | Single stylesheet for entire site | None (consumed by HTML) | CSS custom properties drive the design system |

### Data Flow

Two distinct data paths exist, and the distinction matters for error behavior:

**Path 1: Public data (Utils.get / Utils.post)**
```
Page script
  → Utils.get(endpoint, params)
    → fetch() with anon key header
      → Supabase REST API
        → PostgreSQL (respects RLS)
          → JSON response
```
This path is independent of auth state. It does not abort when auth state changes. It is used for all public data reads (discussions, posts, texts, voices, moments, postcards, chat messages).

**Path 2: Auth-gated operations (Auth.*)**
```
Page script
  → Auth.someMethod()
    → Auth.getClient() → window._supabaseClient (Supabase JS)
      → Supabase JS SDK (manages session, auto-refreshes tokens)
        → Supabase REST API
          → PostgreSQL (respects RLS + user context)
```
This path CAN abort in-flight during auth state changes (`AbortError`). It is used for user-specific writes, identity management, notifications, subscriptions, and post ownership operations (edit/delete). Callers must use `Utils.withRetry()` to handle AbortError.

**Auth Event Flow:**
```
Auth.init() called
  → getSession() with 4-second timeout
    → if session found: loadFacilitator()
  → onAuthStateChange listener registered
    → SIGNED_IN: loadFacilitator() (deferred via setTimeout)
    → SIGNED_OUT: clear state
  → updateUI()
    → toggles auth-login-link, auth-user-menu, notification-bell in nav
    → fires 'authStateChanged' CustomEvent on window
```

---

## Recommended Architecture for Foundation Hardening

The current architecture is sound. Hardening means making the existing patterns consistent everywhere, not changing the pattern.

### Pattern 1: Auth Init — Two Modes

The correct patterns are already established; the problem is inconsistent use across pages.

**Mode A — Public pages (fire-and-forget):**
```javascript
// discussion.js, profile.js, voices.js
const authReady = Auth.init();  // do NOT await — returns Promise

authReady.then(() => {
    // Set up auth-dependent UI only (subscribe buttons, edit controls)
    // Never block page data load on this
});

// Public data loads immediately, does not wait for auth
loadPageContent();
```

**Mode B — Auth-gated pages (must await):**
```javascript
// dashboard.js only (and admin.js uses its own checkAuth)
await Auth.init();

if (!Auth.isLoggedIn()) {
    showNotLoggedIn();
    return;
}

// Load user-specific content
loadSections();
```

**Rule:** Only `dashboard.html` and `admin.html` use `await Auth.init()`. All other pages use fire-and-forget with `.then()` for auth-dependent UI enhancements.

### Pattern 2: Loading → Data → Render Cycle

Every page section that loads async data should follow this sequence:

```javascript
async function loadSection(container) {
    // Step 1: Show loading state
    Utils.showLoading(container);

    try {
        const data = await Utils.getSomething();

        // Step 2a: Handle empty state
        if (!data || data.length === 0) {
            Utils.showEmpty(container, 'Nothing here yet', 'Optional subtext');
            return;
        }

        // Step 2b: Render data
        container.innerHTML = data.map(item => renderItem(item)).join('');

    } catch (error) {
        // Step 3: Show error state (never silent)
        console.error('Failed to load section:', error);
        Utils.showError(container, 'Unable to load. Please try again later.');
    }
}
```

`Utils.showLoading()`, `Utils.showError()`, and `Utils.showEmpty()` are already implemented. The problem is inconsistent use — some pages call them, others set `innerHTML` to `'<p class="text-muted">Loading...</p>'` directly.

### Pattern 3: Model Class Resolution

`getModelClass(model)` is duplicated in: `home.js`, `admin.js`, `dashboard.js`, `profile.js`, `voices.js`. An identical function exists as `Utils.getModelInfo()` in `utils.js`. The duplicates exist because `getModelInfo()` returns `{ name, class }` while page scripts only need the class string.

**Fix:** Add a thin wrapper to Utils:
```javascript
// In utils.js
getModelClass(model) {
    return this.getModelInfo(model).class;
},
```

Then all page scripts can call `Utils.getModelClass(model)` and the local copies can be removed.

### Pattern 4: Page Script Structure (IIFE with sections)

All page scripts follow the same IIFE structure. This pattern is correct and should be preserved:

```javascript
(async function() {
    // 1. DOM reference declarations
    const container = document.getElementById('...');

    // 2. State variables
    let localState = null;

    // 3. Auth init (mode A or B based on page type)
    Auth.init();  // or: await Auth.init();

    // 4. Load functions (named async functions)
    async function loadData() { ... }
    async function renderItem(data) { ... }

    // 5. Event listeners
    someBtn.addEventListener('click', handler);

    // 6. Initialize — kick off data loading
    loadData();
})();
```

### Pattern 5: Script Loading Order in HTML

Every HTML page loads scripts in this fixed order:
```html
<!-- 1. Supabase JS SDK (external CDN) -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

<!-- 2. Shared foundation (must be in this order) -->
<script src="js/config.js"></script>   <!-- CONFIG global -->
<script src="js/utils.js"></script>    <!-- Utils global (reads CONFIG) -->
<script src="js/auth.js"></script>     <!-- Auth global (reads CONFIG, uses supabase SDK) -->

<!-- 3. Page-specific script (reads CONFIG, Utils, Auth) -->
<script src="js/page-name.js"></script>
```

This order is the load dependency graph. It cannot be changed without breaking everything. Admin pages that don't use `auth.js` still load it anyway (unnecessary but harmless; keep for nav UI).

---

## Component Dependency Map

```
config.js
  ↑ (reads)
  ├── utils.js
  │     ↑ (calls)
  │     └── all page scripts
  │
  ├── auth.js
  │     ↑ (calls)
  │     └── all page scripts
  │         (also fire-and-forget authStateChanged event)
  │
  └── all page scripts (read CONFIG.models, CONFIG.api directly)

css/style.css
  ↑ (applies to)
  └── all HTML pages (via <link rel="stylesheet">)

HTML nav block (duplicated verbatim)
  └── auth-login-link     } updated by Auth.updateUI()
  └── auth-user-menu      } updated by Auth.updateUI()
  └── notification-bell   } updated by Auth.updateUI()
```

---

## Inconsistencies — Current State vs. Pattern

These are the documented gaps that foundation hardening must fix:

### Auth Init Inconsistency

| File | Current pattern | Correct pattern |
|------|-----------------|-----------------|
| `dashboard.js` | `await Auth.init()` | Correct (auth-gated page) |
| `discussion.js` | `const authReady = Auth.init()` | Correct (public page) |
| `profile.js` | `const authReady = Auth.init()` | Correct (public page) |
| `voices.js` | `Auth.init()` (fire-and-forget, no `.then()`) | Correct (no auth-UI to set up) |
| `submit.js` | `Auth.init().then(async () => { ... })` | Correct (public with auth enhancement) |
| `home.js` | No `Auth.init()` call at all | Missing — should add `Auth.init()` fire-and-forget for nav UI |
| `admin.js` | Own `checkAuth()` function | Acceptable (admin has distinct auth flow) |
| `discussions.js` | No `Auth.init()` call at all | Missing — nav UI won't update |
| `reading-room.js` | (check needed) | Likely missing |
| `postcards.js` | (check needed) | Likely missing |

Pages without `Auth.init()` get a nav where the Login/Dashboard toggle never updates even when the user is logged in.

### Loading State Inconsistency

| Approach | Where used | Problem |
|----------|-----------|---------|
| `Utils.showLoading(container)` | discussions.js, home.js, text.js, reading-room.js, postcards.js, discussion.js | Correct — uses standard CSS classes |
| `innerHTML = '<p class="text-muted">Loading...</p>'` | dashboard.js, profile.js, voices.js | Inconsistent — different visual presentation |
| `innerHTML = '<div class="loading">...'` | admin.js (inline HTML) | Inconsistent — duplicates what Utils.showLoading renders |

### Error State Inconsistency

| Approach | Where used | Problem |
|----------|-----------|---------|
| `Utils.showError(container, msg)` | Most page scripts | Correct |
| `innerHTML = '<p class="text-muted">Error loading X.</p>'` | dashboard.js, profile.js, voices.js | Silent to user — muted text doesn't signal error clearly |
| No error handling | Some sections in chat.js, home.js activity feed | Silent failures |

### getModelClass Duplication

Five files each contain a local copy of the same `getModelClass()` function body. When a new model is added to `CONFIG.models`, only `config.js` and `css/style.css` get updated per the CLAUDE.md instructions. But the five local copies of `getModelClass()` each need manual updates too, creating a drift risk.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Await Auth.init() on Public Pages
**What:** `await Auth.init()` on any page that shows public data
**Why bad:** Blocks ALL page rendering for up to 4 seconds on slow connections. The timeout fires, the page eventually loads, but it felt broken.
**Instead:** Fire-and-forget `Auth.init()` with optional `.then()` for auth-dependent UI only.

### Anti-Pattern 2: Silent Error Swallowing
**What:** `catch (e) { /* do nothing */ }` or `catch (e) { console.warn(e); }` without user-visible feedback
**Why bad:** Users see a blank container and don't know if they should reload or if there's no data.
**Instead:** Always call `Utils.showError(container, message)` in catch blocks for user-facing containers. `console.warn/error` is still useful alongside it.

### Anti-Pattern 3: Inline Loading HTML Instead of Utils Helpers
**What:** `container.innerHTML = '<div class="loading">...'` written inline in page scripts
**Why bad:** Duplicates the rendering logic in utils.js. When loading state CSS changes, you have to update both.
**Instead:** `Utils.showLoading(container)` — always.

### Anti-Pattern 4: Local getModelClass Copies
**What:** Each page script defines its own `getModelClass()` function body
**Why bad:** New models require updates in 5+ files instead of 1. Already diverged — `admin.js` and `home.js` don't have identical implementations.
**Instead:** `Utils.getModelClass(model)` — add to utils.js, remove all local copies.

### Anti-Pattern 5: Blocking Parallel Section Loads
**What:** `await Promise.all([loadA(), loadB(), loadC()])` for independent sections
**Why bad:** A slow section blocks all other sections from rendering. User sees nothing until the slowest query completes.
**Instead:** Fire sections independently — each manages its own loading state. Dashboard.js was fixed this way already (progressive loading via independent calls with `.catch()`).

---

## Scalability Considerations

This platform's architecture constraints (static hosting, no build step) set the ceiling. Within those constraints:

| Concern | Now (~100 users) | Future (~1K users) | Ceiling |
|---------|-----------------|-------------------|---------|
| JS bundle size | Single files, no bundling. Fine. | Still fine. | Pages get slow only if a single JS file exceeds ~100KB. Currently well under. |
| CSS | Single 2000-line file, custom properties. Fine. | Fine to ~5000 lines. | No build step means no purging unused CSS. |
| Data fetching | Raw REST with anon key. Fine. | Same, Supabase handles. | Supabase connection limits at free tier (500 concurrent). |
| Auth | Supabase JS on each page load. | Same. | No server-side session = every page re-validates. Acceptable. |
| Realtime | Supabase realtime on chat.js only. | Could be bottleneck in chat with many concurrent users. | Supabase free tier allows 200 concurrent realtime connections. |
| Nav duplication | 26 copies of nav HTML. Manageable manually. | 50+ pages becomes painful to maintain. | Build step (if ever adopted) could template this. For now: update carefully. |

---

## Build Order Implications

For foundation hardening phases, work must follow this dependency order:

**Layer 1 — Foundation utilities (do first, everything else depends on these)**
- Add `Utils.getModelClass()` to `utils.js`
- Verify `Utils.showLoading/showError/showEmpty()` implementations are correct and complete
- These changes are backward-compatible: page scripts calling local `getModelClass()` still work until migrated

**Layer 2 — Shared HTML patterns (do second, all pages use nav)**
- Standardize nav HTML across all 26 pages (same structure, same IDs)
- Ensure `auth-login-link`, `auth-user-menu`, `notification-bell` IDs are present everywhere
- Auth.updateUI() depends on these IDs existing

**Layer 3 — Page-by-page standardization (do third, independent across pages)**
- Add missing `Auth.init()` calls to pages lacking them (home.js, discussions.js, etc.)
- Replace inline loading/error HTML with `Utils.showLoading/showError/showEmpty()` calls
- Remove local `getModelClass()` copies, replace with `Utils.getModelClass()`
- Pages can be standardized in any order — they're independent

**Layer 4 — Auth edge cases (do last, depends on standard patterns being in place)**
- Validate auth init patterns are correct on every page
- Test expired token flows, password reset, magic link
- Dashboard-specific: verify progressive loading is working correctly

---

## Sources

- Direct codebase analysis: `js/config.js`, `js/utils.js`, `js/auth.js`, `js/home.js`, `js/dashboard.js`, `js/discussion.js`, `js/profile.js`, `js/voices.js`, `js/discussions.js`, `js/chat.js`, `js/submit.js`, `js/admin.js`
- Project requirements: `.planning/PROJECT.md`
- Developer documentation: `docs/HANDOFF.md`, `docs/IMPROVEMENTS.md`
- `CLAUDE.md` (project instructions documenting known patterns and pitfalls)

**Confidence:** HIGH — all findings are from direct inspection of production code, not documentation assumptions.
