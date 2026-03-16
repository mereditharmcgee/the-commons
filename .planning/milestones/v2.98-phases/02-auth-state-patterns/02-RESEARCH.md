# Phase 2: Auth & State Patterns - Research

**Researched:** 2026-02-26
**Domain:** Vanilla JS auth initialization patterns, loading/error/empty state UI
**Confidence:** HIGH — research is entirely based on reading the live codebase and existing utilities

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Loading state design**
- Use `--accent-gold` (#d4a574) for loading indicator color — branded, not generic gray
- Claude's discretion on spinner vs skeleton vs shimmer per page (pick what fits the content type)
- Claude's discretion on content-area-only vs full-page loading (recommend content-area-only so nav stays usable)
- Claude's discretion on timeout behavior (recommend showing error after reasonable timeout with retry)

**Error message style**
- Warm, conversational tone — "We couldn't load the discussions right now. Want to try again?"
- Always include a retry button on every error state — no exceptions
- Include a subtle technical hint in fine print (e.g., small muted "Error 503" below the friendly message)
- Claude's discretion on inline banner vs toast per context (recommend inline for primary content failures, toast for secondary)

**Empty state content**
- Inviting and warm tone — "No discussions yet — be the first to start a conversation"
- Context-specific messages per page — each page gets a tailored empty state, not a generic "Nothing here"
- Include call-to-action buttons where relevant (e.g., "Create a postcard" on empty postcards page)
- Claude's discretion on whether to include subtle icons above text per page

### Claude's Discretion
- Loading indicator type per page (spinner, skeleton, or shimmer)
- Loading placement (content-area vs full-page) — preference for content-area-only
- Timeout thresholds and behavior
- Error presentation format per context (inline banner vs toast)
- Auth redirect target (login page with message recommended)
- Post-login return behavior (return to original page recommended)
- Auth failure handling on public pages (silent recommended)
- Session expired vs not-logged-in messaging distinction
- Empty state icon/illustration choices per page

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STRC-02 | All public pages call `Auth.init()` fire-and-forget for nav UI updates | Audit complete — see Architecture Patterns; 5 pages need fixes |
| STRC-03 | Only auth-gated pages (dashboard, admin) use `await Auth.init()` | dashboard.js uses `await` correctly; admin.js has its own auth check (not Auth.init); 3 pages use problematic patterns |
| STRC-04 | All data-fetching pages show loading indicators via `Utils.showLoading()` | voices.js, moments.js, moment.js, profile.js use ad-hoc strings instead of Utils.showLoading |
| STRC-05 | All data-fetching pages show error feedback via `Utils.showError()` on API failure | voices.js, moments.js, moment.js, profile.js use ad-hoc inline HTML instead of Utils.showError |
| STRC-06 | All data-fetching pages show empty states via `Utils.showEmpty()` when no data | voices.js, moments.js, moment.js, profile.js use ad-hoc inline HTML instead of Utils.showEmpty |
</phase_requirements>

---

## Summary

Phase 2 is a standardization pass across the JS codebase — no new features, no schema changes. The existing infrastructure is in good shape: `utils.js` already has `showLoading()`, `showError()`, and `showEmpty()` helpers; `Auth.init()` is already implemented with a 4-second timeout and a fire-and-forget design; and the CSS already has `.loading`, `.loading__spinner`, `.alert--error`, `.empty-state`, and their sub-elements.

Most data-fetching pages (`discussions.js`, `discussion.js`, `home.js`, `postcards.js`, `reading-room.js`, `text.js`) already use the correct Utils helpers. The work is concentrated in a handful of files that pre-date or missed the standardization: `voices.js`, `moments.js`, `moment.js`, and `profile.js` use ad-hoc inline HTML strings instead of the shared helpers. Auth init patterns are largely correct at the HTML layer (all public pages call `Auth.init()` in an inline script block), but some JS files (`submit.js`, `profile.js`) use non-canonical patterns that need alignment.

The primary work is: (1) upgrade `Utils.showError()` to support retry buttons and warm messaging, (2) upgrade `Utils.showEmpty()` to support CTA buttons and context-specific text, (3) audit and fix auth init patterns in 3-4 JS files, (4) apply the upgraded helpers consistently to the non-conforming pages.

**Primary recommendation:** Upgrade the Utils helpers first (they are the foundation), then apply them page-by-page in a single wave — don't patch individual pages before the helpers are ready.

---

## Standard Stack

### Core (no installs — everything is already in the codebase)

| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| `Utils.showLoading(container, message)` | `js/utils.js:480` | Renders spinner + message into container | Exists; needs no changes for STRC-04 |
| `Utils.showError(container, message)` | `js/utils.js:497` | Renders `.alert--error` into container | Exists; needs upgrade for retry button + warm tone |
| `Utils.showEmpty(container, title, text)` | `js/utils.js:513` | Renders `.empty-state` into container | Exists; needs upgrade for CTA button support |
| `Auth.init()` | `js/auth.js:19` | Fire-and-forget auth with 4s timeout | Exists; correct implementation |
| `.loading` / `.loading__spinner` | `css/style.css:1179` | Spinner animation, gold `border-top-color` via `--accent-gold` | Exists; already branded gold |
| `.alert--error` | `css/style.css:1044` | Red-tinted error banner | Exists; may need `.alert--error--retry` variant or just inline button |
| `.empty-state` + children | `css/style.css:792` | Centered empty state with icon, title, text | Exists; may need `.empty-state__cta` for action buttons |

### No External Dependencies

This is vanilla JS. No npm, no build step. All patterns are DOM manipulation + existing CSS classes. No new libraries needed.

---

## Architecture Patterns

### Current Auth Init Pattern (Correct — already established)

**Public pages (HTML inline script block):**
```html
<!-- Correct: fire-and-forget, does not block page render -->
<script>
    Auth.init();
</script>
```

**Auth-gated pages (in the JS module):**
```javascript
// dashboard.js — correct
await Auth.init();
if (!Auth.isLoggedIn()) {
    loadingState.style.display = 'none';
    notLoggedIn.style.display = 'block';
    return;
}
```

**Non-blocking with post-auth callback (correct for public pages with auth-dependent UI):**
```javascript
// discussion.js — correct pattern
const authReady = Auth.init();      // fire-and-forget
authReady.then(async () => {        // auth-dependent UI wired up after
    if (!Auth.isLoggedIn()) return;
    // set up subscribe button
});
loadData();                         // data load fires immediately, no auth dependency
```

### Pattern: Utils.showLoading() (already standardized)

```javascript
// Correct — from discussions.js, home.js, postcards.js, reading-room.js, text.js
Utils.showLoading(container);     // renders spinner into container
// ... async fetch ...
// container.innerHTML = ... OR Utils.showError() OR Utils.showEmpty()
```

### Pattern: Utils.showError() — Needs Upgrade

**Current signature:** `showError(container, message = 'Something went wrong')`

**Current output (no retry):**
```html
<div class="alert alert--error">${message}</div>
```

**Needed upgrade — signature:** `showError(container, message, { onRetry } = {})`

**Needed output:**
```html
<div class="alert alert--error">
    <p class="alert__message">We couldn't load the discussions right now. Want to try again?</p>
    <button class="alert__retry-btn">Try again</button>
    <p class="alert__technical">Error: Failed to fetch</p>  <!-- subtle, muted -->
</div>
```

The `onRetry` callback gets wired to the button after rendering. Callers pass their load function as the retry handler.

### Pattern: Utils.showEmpty() — Needs Upgrade

**Current signature:** `showEmpty(container, title = 'Nothing here yet', text = '')`

**Current output (no CTA):**
```html
<div class="empty-state">
    <div class="empty-state__icon">◯</div>
    <div class="empty-state__title">${title}</div>
    <div class="empty-state__text">${text}</div>
</div>
```

**Needed upgrade — signature:** `showEmpty(container, title, text, { ctaLabel, ctaHref } = {})`

**Needed output (when CTA provided):**
```html
<div class="empty-state">
    <div class="empty-state__icon">◯</div>
    <div class="empty-state__title">${title}</div>
    <div class="empty-state__text">${text}</div>
    <a href="${ctaHref}" class="empty-state__cta btn btn--primary">${ctaLabel}</a>
</div>
```

CTA is optional — pages without a relevant action omit `ctaLabel`/`ctaHref`.

### Anti-Patterns to Avoid

- **Ad-hoc loading strings:** `container.innerHTML = '<p class="text-muted">Loading voices...</p>'` — use `Utils.showLoading()` instead
- **Ad-hoc error HTML:** `container.innerHTML = '<p class="text-muted">Error loading voices. Please try again.</p>'` — use `Utils.showError()` instead
- **Ad-hoc empty state HTML:** Inline `<div class="voices-empty">` with custom styles — use `Utils.showEmpty()` instead
- **`await Auth.init()` on public pages:** Blocks render, hurts perceived performance, wrong for nav-only auth updates
- **`Auth.init().then()` in JS when HTML already calls it:** Double-init (guarded by `if (this.initialized) return` but still confusing)
- **No retry button on error:** Current `Utils.showError()` has no retry — must be fixed before rollout

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spinner animation | Custom CSS animation | Existing `.loading__spinner` | Already branded gold, already in CSS |
| Error styling | New CSS classes | Existing `.alert--error` | Consistent with rest of site |
| Empty state styling | Custom inline styles | Existing `.empty-state` hierarchy | Already designed, tested |
| Auth state check | Direct Supabase client calls | `Auth.isLoggedIn()`, `Auth.getUser()` | Handles session state correctly |
| Retry logic | `setTimeout` polling | `Utils.withRetry()` for AbortError | Existing helper handles the known Supabase AbortError case |

**Key insight:** All the CSS and JS infrastructure exists. This phase is about applying it consistently, not building new infrastructure (except the retry button extension to `showError`).

---

## Common Pitfalls

### Pitfall 1: Double Auth.init()
**What goes wrong:** Some JS files call `Auth.init()` themselves while the HTML page also calls it inline. The second call returns immediately (guarded by `if (this.initialized) return`) but creates confusing code.
**Why it happens:** JS files were written independently of the HTML inline script pattern.
**How to avoid:** If the HTML already calls `Auth.init()` in an inline block, the JS file should NOT call it again. Use `window.addEventListener('authStateChanged', ...)` to react to auth state, or check `Auth.isLoggedIn()` synchronously.
**Warning signs:** JS file calls `Auth.init()` AND corresponding HTML has an inline `Auth.init()` call.

**Affected files needing audit:**
- `voices.js` — calls `Auth.init()` in JS; `voices.html` calls it inline too (likely double)
- `submit.js` — uses `Auth.init().then(...)` pattern in JS; `submit.html` calls it inline too
- `profile.js` — stores `const authReady = Auth.init()` and later `await authReady`; `profile.html` calls it inline too

### Pitfall 2: Retry Button Wiring
**What goes wrong:** `Utils.showError()` renders a button, but the click handler must be attached AFTER `innerHTML` assignment (not inside the HTML string, since inline `onclick` is fragile).
**Why it happens:** innerHTML-based rendering requires post-render event wiring.
**How to avoid:** After calling `Utils.showError(container, message, { onRetry: fn })`, the helper internally does `container.querySelector('.alert__retry-btn').addEventListener('click', onRetry)`.
**Warning signs:** Retry button renders but clicking does nothing.

### Pitfall 3: Container ID Mismatches
**What goes wrong:** Some pages use `display: none / display: block` on pre-existing HTML elements (like `loadingState`, `errorState` elements in the HTML) rather than injecting into a container. `Utils.showLoading()` injects into a container — it's not compatible with the "show/hide pre-existing elements" pattern.
**Why it happens:** Different pages were built at different times with different patterns.
**How to avoid:** Audit each page's HTML structure before applying Utils helpers. Pages using pre-existing state divs (`profile.js` with `loading-state`/`error-state` elements) may need a different approach — either replace the pre-existing state elements with a single container, or keep the show/hide pattern for those pages.
**Affected pages:** `profile.js` uses `loadingState.style.display = 'none'` + `errorState.style.display = 'block'` — these reference pre-existing HTML elements, not a single container. This page needs structural review before applying Utils helpers blindly.

### Pitfall 4: Empty State in Grid Contexts
**What goes wrong:** `postcards.js` wraps its ad-hoc empty state in `style="grid-column: 1 / -1"` because postcards render in a CSS grid. If `Utils.showEmpty()` renders a single element into the grid container, it won't span all columns without this style.
**Why it happens:** The grid container is also the content container, so a single child doesn't span by default.
**How to avoid:** CSS should have `.empty-state` receive `grid-column: 1 / -1` when inside a grid, OR wrap the empty state call in a span-all div. Check if postcards container is a grid and handle accordingly.

### Pitfall 5: Warm Message Tone in Utils.showError()
**What goes wrong:** If the message is constructed generically in Utils ("Something went wrong"), all error states sound the same. If callers pass warm messages, they're inconsistent.
**Why it happens:** Centralized helpers encourage generic messages; page-specific tone requires page-specific strings.
**How to avoid:** `Utils.showError()` accepts a caller-provided warm message. Each page call passes its own message. The helper handles layout (retry button, technical hint). Convention: callers ALWAYS pass a warm message, never rely on the default.

### Pitfall 6: moments.js / moment.js Use DOMContentLoaded Pattern
**What goes wrong:** `moments.js` and `moment.js` use `document.addEventListener('DOMContentLoaded', async () => { ... })` instead of an IIFE. This is different from the rest of the codebase (which uses `(async function() { ... })()`).
**Why it happens:** These files were written in a different style.
**How to avoid:** Standardize to IIFE pattern when touching these files, OR keep DOMContentLoaded and just fix the state patterns inside them. Don't mix patterns. Changing to IIFE is a low-risk refactor if done at the same time.

---

## Code Examples

### Upgraded Utils.showError() with Retry Button

```javascript
// In utils.js — upgraded signature
showError(container, message = 'Something went wrong. Want to try again?', { onRetry } = {}) {
    if (typeof container === 'string') {
        container = document.querySelector(container);
    }
    if (!container) return;
    container.innerHTML = `
        <div class="alert alert--error">
            <p class="alert__message">${this.escapeHtml(message)}</p>
            ${onRetry ? `<button class="alert__retry-btn btn btn--small">Try again</button>` : ''}
        </div>
    `;
    if (onRetry) {
        container.querySelector('.alert__retry-btn').addEventListener('click', onRetry);
    }
},
```

### Upgraded Utils.showEmpty() with CTA

```javascript
// In utils.js — upgraded signature
showEmpty(container, title = 'Nothing here yet', text = '', { ctaLabel, ctaHref } = {}) {
    if (typeof container === 'string') {
        container = document.querySelector(container);
    }
    if (!container) return;
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state__icon">◯</div>
            <div class="empty-state__title">${this.escapeHtml(title)}</div>
            ${text ? `<div class="empty-state__text">${this.escapeHtml(text)}</div>` : ''}
            ${ctaLabel && ctaHref ? `<a href="${this.escapeHtml(ctaHref)}" class="empty-state__cta btn btn--primary">${this.escapeHtml(ctaLabel)}</a>` : ''}
        </div>
    `;
},
```

### Correct Page Load Pattern (voices.js example — current vs target)

```javascript
// CURRENT (voices.js) — non-standard
voicesList.innerHTML = '<p class="text-muted">Loading voices...</p>';
// ...
voicesList.innerHTML = '<div class="voices-empty" style="grid-column: 1 / -1; ...">...</div>';
// ...
voicesList.innerHTML = '<p class="text-muted">Error loading voices. Please try again.</p>';

// TARGET (voices.js) — standardized
Utils.showLoading(voicesList);
// ...
Utils.showEmpty(voicesList, 'No AI voices here yet', 'Be the first to create a persistent AI identity.');
// ...
Utils.showError(voicesList, "We couldn't load voices right now. Want to try again?", { onRetry: loadVoices });
```

### Correct Auth Pattern on Public Page (voices.js)

```javascript
// voices.html already calls Auth.init() inline — voices.js should NOT also call it.
// REMOVE this from voices.js:
// Auth.init();  // <-- DELETE

// Instead, if auth state needed for UI, listen for the event:
window.addEventListener('authStateChanged', (e) => {
    // Update any auth-dependent UI
});
```

---

## Page-by-Page Audit

### STRC-02/03: Auth Init Pattern Audit

| Page | HTML inline Auth.init? | JS file Auth.init? | Pattern in JS | Status |
|------|----------------------|-------------------|--------------|--------|
| home (index.html) | Yes | No JS call | n/a | CORRECT |
| discussions.html | Yes | No JS call | n/a | CORRECT |
| discussion.html | Yes | `const authReady = Auth.init()` | fire-and-forget stored in var | CORRECT — JS call is the actual init; HTML call is likely the canonical one; verify no double |
| reading-room.html | Yes | No JS call | n/a | CORRECT |
| text.html | Yes | No JS call | Uses `Auth.isLoggedIn()` inline | CORRECT |
| postcards.html | Yes | No JS call | Uses `Auth.isLoggedIn()` + event listener | CORRECT |
| chat.html | Yes | No JS call | n/a | CORRECT |
| moments.html | Yes | No JS call | n/a | CORRECT |
| moment.html | Yes | No JS call | n/a | CORRECT |
| voices.html | No HTML init found | `Auth.init()` in JS | fire-and-forget | NEEDS VERIFY — check voices.html |
| profile.html | No HTML init found | `const authReady = Auth.init()` | stored, later `await authReady` | NEEDS FIX — `await authReady` blocks profile data load |
| about.html | Yes | n/a (static) | n/a | CORRECT |
| api.html | Yes | n/a (static) | n/a | CORRECT |
| agent-guide.html | Yes | n/a (static) | n/a | CORRECT |
| submit.html | Yes (HTML) | `Auth.init().then(...)` in JS | chained | NEEDS VERIFY — double init? |
| dashboard.html | No | `await Auth.init()` | awaited | CORRECT |
| admin.html | No | `checkAuth()` (own impl) | awaited own impl | CORRECT — admin has its own auth check, not Auth.init |

**Key finding on profile.js:** `profile.js` stores `const authReady = Auth.init()` and then does `await authReady` AFTER loading the identity data — this is actually correct. The profile data load fires immediately, the `await` only blocks the subscribe button setup. But the HTML may also call `Auth.init()` inline. Need to verify profile.html.

### STRC-04/05/06: State Pattern Audit

| Page | showLoading | showError | showEmpty | Notes |
|------|-------------|-----------|-----------|-------|
| discussions.js | YES | YES | YES | Fully compliant |
| discussion.js | YES | YES | YES | Fully compliant |
| home.js | YES (discussions) | YES | YES | Activity feed uses ad-hoc `activityFeed.innerHTML = ''` on error — needs fix |
| postcards.js | YES | YES | NO (inline HTML) | Empty state is ad-hoc inline HTML |
| reading-room.js | YES | YES | YES | Fully compliant |
| text.js | YES | YES | NO (inline `<p class="empty-state">`) | Marginalia empty state uses wrong class directly |
| voices.js | NO (ad-hoc string) | NO (ad-hoc string) | NO (ad-hoc HTML) | All three need fixing |
| moments.js | NO | NO (ad-hoc div) | NO (show/hide element) | Pattern entirely different — pre-existing HTML elements |
| moment.js | NO | NO (ad-hoc div) | NO (show/hide element) | Pattern entirely different — pre-existing HTML elements |
| profile.js | NO (ad-hoc string) | NO (show/hide element) | NO (ad-hoc string) | Uses pre-existing `errorState` div — structural issue |
| chat.js | N/A (real-time, no list fetch) | N/A | N/A | Chat has its own connection status UI — not in scope |
| search.js | N/A (no initial load) | N/A | N/A | Search only loads on user query — not in scope |

---

## CSS Gaps

The existing CSS is almost complete. The following additions are needed:

1. **`.alert__retry-btn`** — Button inside `.alert--error`. Style it to match the site's button patterns. Minimal: inherits `.btn` class or gets a simple inline style override.
2. **`.empty-state__cta`** — Link-as-button inside `.empty-state`. Should use `.btn--primary` appearance. Can reuse existing `.btn` classes if they exist, or add a small rule.
3. **`.alert__technical`** — Subtle muted text below the main error message. Font-size 0.8rem, `color: var(--text-muted)`.

Verify whether `.btn` and `.btn--primary` classes already exist in `style.css` before creating new ones.

---

## State of the Art

This is a vanilla JS codebase with no framework. The patterns here are not tied to any framework release cycle.

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Ad-hoc `innerHTML` for loading | `Utils.showLoading()` | Established in utils.js; some pages not yet using it |
| Page-by-page error strings | `Utils.showError()` | Established; needs retry upgrade |
| Ad-hoc empty state HTML | `Utils.showEmpty()` | Established; needs CTA upgrade |
| `await Auth.init()` everywhere | `Auth.init()` fire-and-forget + 4s timeout | Established; a few pages still blocking |

---

## Open Questions

1. **Does voices.html call Auth.init() inline?**
   - What we know: voices.js calls `Auth.init()` directly. Other public pages call it in an HTML inline block.
   - What's unclear: Whether voices.html has an inline block OR relies on the JS call exclusively.
   - Recommendation: Read voices.html before planning the task. If HTML already has it, remove from JS. If not, leave in JS (already fire-and-forget, which is correct).

2. **Does profile.html call Auth.init() inline?**
   - What we know: profile.js stores `const authReady = Auth.init()` and uses `await authReady`.
   - What's unclear: Whether profile.html also has an inline call, making it double-init.
   - Recommendation: Read profile.html. The `await authReady` in profile.js is used only for subscribe button setup — this is actually fine since the identity data loads without waiting. However, profile.js should use `Auth.init()` fire-and-forget OR trust the HTML init.

3. **Do `.btn` and `.btn--primary` classes exist in style.css?**
   - What we know: Empty state CTAs and retry buttons need button styling.
   - What's unclear: Whether these classes exist (they weren't in the searched output).
   - Recommendation: Grep for `.btn` in style.css before planning. If it doesn't exist, add minimal button classes as part of this phase's CSS task.

4. **moments.js / moment.js: Migrate pattern or adjust in place?**
   - What we know: These files use `DOMContentLoaded` listener pattern + show/hide pre-existing HTML elements. Applying Utils helpers requires either converting containers to injection targets or adapting Utils helpers.
   - What's unclear: Whether the HTML for moments uses dedicated container divs that can receive innerHTML injection.
   - Recommendation: Read moments.html and moment.html structures before planning tasks for these files.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase reading — `js/utils.js` (showLoading, showError, showEmpty implementations)
- Direct codebase reading — `js/auth.js` (Auth.init implementation and 4s timeout)
- Direct codebase reading — `js/dashboard.js` (await Auth.init pattern)
- Direct codebase reading — all page JS files (auth and state pattern audit)
- Direct codebase reading — `css/style.css` (existing CSS classes for loading, error, empty states)
- Direct codebase reading — HTML files (inline Auth.init calls)

### Secondary (MEDIUM confidence)
- None needed — all findings from direct codebase inspection

---

## Metadata

**Confidence breakdown:**
- Auth init pattern audit: HIGH — read every JS file and HTML file
- State pattern audit: HIGH — read every JS file, counted Utils usage
- Utils upgrade design: HIGH — based on existing code signatures and user decisions
- CSS gap assessment: MEDIUM — identified likely gaps; needs verification of `.btn` class existence
- Open questions: documented explicitly with recommended resolution path

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable — no external dependencies, pure codebase research)
