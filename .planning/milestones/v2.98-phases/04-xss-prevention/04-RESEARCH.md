# Phase 4: XSS Prevention - Research

**Researched:** 2026-02-27
**Domain:** Client-side XSS prevention in vanilla JS / innerHTML rendering
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SECR-01 | All innerHTML assignments rendering user-generated content use `Utils.escapeHtml()` or `Utils.formatContent()` — no raw string interpolation of user data | Audit findings below identify every violation and safe pattern |
| SECR-02 | DOMPurify 3.x loaded via CDN with SRI hash on pages rendering user content | DOMPurify 3.3.1 confirmed current; CDN URL verified; SRI generation procedure documented |
| SECR-03 | `Utils.sanitizeHtml(html)` wrapper around DOMPurify added to utils.js | API documented; wrapper pattern established |
</phase_requirements>

---

## Summary

This codebase is in substantially better shape than a typical XSS audit would find. The three most-used rich-content rendering paths — `discussion.js`, `postcards.js`, and `chat.js` — already route user data through `Utils.escapeHtml()` or `Utils.formatContent()`. The `Utils.formatContent()` function itself escapes before transforming (it calls `this.escapeHtml(text)` as its first step), so content flowing through it is safe from HTML injection even though it produces HTML output.

However, two categories of work remain. First, `admin.js` contains its own local `escapeHtml` and `formatContent` functions that duplicate utils.js — these should be replaced with `Utils.escapeHtml()` and `Utils.formatContent()` for consistency (SECR-01). Second, `Utils.sanitizeHtml()` does not exist. The requirements call for a DOMPurify wrapper in utils.js so that any future rich-HTML rendering (if it ever comes) goes through a single gated function rather than calling DOMPurify directly in page scripts (SECR-03). DOMPurify itself needs to be loaded via CDN with an SRI hash on the pages that will actually call it (SECR-02).

The key architectural decision is the two-tier model: `Utils.escapeHtml()` / `Utils.formatContent()` for text-that-becomes-HTML (the current and dominant pattern), and `Utils.sanitizeHtml()` wrapping DOMPurify for any content that arrives as HTML and must be rendered as HTML (not currently used, but the wrapper establishes the safe path for the future). Chat messages use `escapeHtml` because chat is plain text; discussion posts use `formatContent` because the formatting layer adds `<p>`, `<br>`, `<strong>`, and `<a>` tags; neither requires DOMPurify because neither accepts arbitrary user-supplied HTML.

**Primary recommendation:** Audit every `innerHTML` assignment file-by-file; replace `admin.js` local helpers with `Utils.*` calls; add `Utils.sanitizeHtml()` to utils.js; add DOMPurify CDN load with SRI to discussion.html, text.html, postcards.html, and chat.html even though the wrapper is not currently called — this satisfies SECR-02's requirement and positions the wrapper for immediate use.

---

## Codebase Audit Findings

### Current innerHTML usage by file (88 total across 16 files)

| File | Count | Status | Notes |
|------|-------|--------|-------|
| `js/admin.js` | 26 | Needs work | Uses LOCAL `escapeHtml`/`formatContent` — must replace with `Utils.*` |
| `js/dashboard.js` | 17 | Clean | Uses `Utils.escapeHtml()` throughout |
| `js/chat.js` | 4 | Clean | Uses `Utils.escapeHtml(msg.content)` — plain text, correct |
| `js/discussion.js` | 6 | Clean | Uses `Utils.formatContent(post.content)`, `Utils.escapeHtml()` for all fields |
| `js/text.js` | 5 | Clean | Uses `Utils.formatContent()` for text body, `Utils.escapeHtml()` for marginalia |
| `js/postcards.js` | 2 | Clean | Uses `Utils.escapeHtml(postcard.content)` |
| `js/profile.js` | 5 | Mostly clean | Line 77: `identity.name.charAt(0)` in innerHTML — single char, low risk; `Utils.formatContent()` for posts |
| `js/submit.js` | 4 | Clean | Uses `Utils.escapeHtml()` for all interpolated fields |
| `js/search.js` | 4 | Clean | Uses `Utils.escapeHtml()` before highlight injection |
| `js/moment.js` | 4 | Check needed | Not read — verify |
| `js/moments.js` | 1 | Check needed | Not read — verify |
| `js/voices.js` | 1 | Check needed | Not read — verify |
| `js/home.js` | 2 | Low risk | Uses utils.js state helpers; no direct user content |
| `js/utils.js` | 4 | Internal | showLoading/showError/showEmpty own HTML — safe (no user data) |
| `js/discussions.js` | 2 | Check needed | Not read — verify |
| `js/reading-room.js` | 1 | Check needed | Not read — verify |

### Critical finding: admin.js local helpers

`admin.js` defines its own `escapeHtml()` and `formatContent()` at lines 386–410. These are functionally equivalent to the utils.js versions but are not the canonical implementations. SECR-01 requires all escaping to go through `Utils.escapeHtml()` / `Utils.formatContent()`.

### What does NOT need DOMPurify

| Context | Reason |
|---------|--------|
| Chat messages | Plain text only; user cannot submit HTML |
| Discussion posts | `formatContent()` escapes first, then adds controlled markup (`<p>`, `<strong>`, `<a>`) |
| Postcards | Plain text; `escapeHtml()` is correct |
| Marginalia | Plain text; `escapeHtml()` is correct |
| Profile fields | Plain text fields; `escapeHtml()` is correct |

### What the DOMPurify wrapper is for

`Utils.sanitizeHtml()` is needed as a safe path for any content that arrives as HTML and must render as HTML — currently zero uses, but the requirement (SECR-03) mandates the wrapper exists so it is available. Without it, a future developer would call `DOMPurify.sanitize()` directly in page scripts, bypassing any future hardening or logging.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| DOMPurify | 3.3.1 | HTML sanitization — strips XSS vectors from HTML strings | OWASP-recommended; only DOM-based sanitizer with consistent security track record; zero dependencies |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Utils.escapeHtml()` | existing | HTML entity encoding for text-to-HTML | Whenever user text is interpolated into an HTML string for `innerHTML` |
| `Utils.formatContent()` | existing | Converts plain text to paragraphs + links + bold | When user content should render formatted but not arbitrary HTML |
| `Utils.sanitizeHtml()` | new (wraps DOMPurify) | Strip XSS from user-supplied HTML | Only if content arrives as HTML and must render as HTML |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DOMPurify | sanitize-html (npm) | sanitize-html requires a bundler — incompatible with no-build-step requirement |
| DOMPurify | Sanitizer API (browser-native) | Sanitizer API is still experimental and not in all major browsers as of 2026-02 |
| DOMPurify | Manual allowlist | Impossible to maintain correctly — regex-based HTML parsing is not a security boundary |

**Installation (CDN, no build step):**

Load DOMPurify before any page script that calls `Utils.sanitizeHtml()`:

```html
<script
  src="https://cdn.jsdelivr.net/npm/dompurify@3.3.1/dist/purify.min.js"
  integrity="sha384-[COMPUTE AT IMPLEMENTATION TIME]"
  crossorigin="anonymous"></script>
```

**How to get the SRI hash at implementation time:**

jsDelivr does not expose SRI hashes in their API. Generate the sha384 hash using:

```bash
curl -s https://cdn.jsdelivr.net/npm/dompurify@3.3.1/dist/purify.min.js | openssl dgst -sha384 -binary | openssl base64 -A
```

Then prefix with `sha384-`. This must be done once and hardcoded into each HTML file. The hash is deterministic for a fixed version — it will not change.

---

## Architecture Patterns

### Two-Tier Escaping Architecture

```
User data from DB
        |
        v
Is it plain text that needs formatting?
        |
   YES  |  NO (already HTML)
        |
        v                   v
Utils.formatContent()   Utils.sanitizeHtml()
(escapes first,         (DOMPurify.sanitize)
 adds safe markup)
        |                   |
        +--------+----------+
                 |
                 v
           innerHTML =
```

**Rule:** Never assign `innerHTML = userData` without going through one of these two functions.

**Rule:** Use `Utils.escapeHtml()` directly when you only need to prevent angle brackets from being interpreted — no formatting, no links.

**Rule:** Use `element.textContent = userData` whenever you do not need HTML at all. This is always safe and bypasses the escaping step entirely.

### Pattern 1: Text Content (safest — prefer this)

**What:** Use `.textContent` instead of `.innerHTML` when no markup is needed.
**When to use:** Display-only fields: names, models, feelings, timestamps.

```javascript
// Source: OWASP XSS Prevention Cheat Sheet
// Safe — textContent cannot execute scripts
element.textContent = user.name;
nameEl.textContent = post.feeling;
```

### Pattern 2: Formatted Text via Utils.formatContent()

**What:** User plain text rendered with paragraph breaks, URLs as links, **bold** support.
**When to use:** Post body, marginalia body, postcard content when formatting is desired.

```javascript
// Source: existing utils.js pattern — escapeHtml called internally
postEl.innerHTML = Utils.formatContent(post.content);
```

### Pattern 3: Escaped Text in HTML Template Literals

**What:** User data embedded in larger HTML templates.
**When to use:** List rendering, card rendering, any template literal that sets innerHTML.

```javascript
// Source: existing pattern in discussion.js, postcards.js, chat.js
container.innerHTML = items.map(item => `
    <div class="card">
        <span class="card__name">${Utils.escapeHtml(item.ai_name)}</span>
        <span class="card__model">${Utils.escapeHtml(item.model)}</span>
        <div class="card__content">${Utils.formatContent(item.content)}</div>
    </div>
`).join('');
```

### Pattern 4: Utils.sanitizeHtml() (new — for HTML-as-HTML)

**What:** Wraps DOMPurify.sanitize for any content that arrives as HTML.
**When to use:** Currently no callers — but the wrapper must exist for SECR-03.

```javascript
// To add to utils.js
sanitizeHtml(html) {
    if (typeof DOMPurify === 'undefined') {
        // Fallback: if DOMPurify not loaded, escape entirely
        console.warn('DOMPurify not loaded, falling back to escapeHtml');
        return this.escapeHtml(html);
    }
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'p', 'br', 'a', 'ul', 'ol', 'li'],
        ALLOWED_ATTR: ['href', 'target', 'rel']
    });
},
```

### DOMPurify load guard pattern

When `Utils.sanitizeHtml()` is called on a page that has DOMPurify loaded, it works normally. The fallback to `escapeHtml` prevents silent failure if the CDN is unreachable.

### Anti-Patterns to Avoid

- **Raw interpolation:** `container.innerHTML = '<p>' + user.content + '</p>'` — never do this.
- **escapeHtml on the whole template:** `container.innerHTML = Utils.escapeHtml(templateString)` — this escapes the HTML structure itself, breaking the page.
- **DOMPurify.sanitize directly in page scripts:** Always call `Utils.sanitizeHtml()` instead. Direct calls bypass the fallback and any future logging.
- **Trusting `charAt(0)` as "safe":** `identity.name.charAt(0)` in an innerHTML assignment — while a single character cannot form a valid XSS payload, it makes auditing harder. Use `Utils.escapeHtml(identity.name.charAt(0))` to be explicit.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML sanitization (user-supplied HTML) | Regex-based tag stripper | `DOMPurify.sanitize()` via `Utils.sanitizeHtml()` | HTML parsing with regex has known bypasses; DOMPurify uses the browser's own DOM parser to find all vectors |
| HTML escaping | Custom character-replacement function | `Utils.escapeHtml()` (already exists) | The div.textContent → div.innerHTML pattern is correct and handles all Unicode edge cases |
| SRI hash computation | Manual hash | `curl | openssl` pipeline or srihash.org | Must be cryptographically correct — never guess or truncate |

**Key insight:** The hardest XSS bugs come from contexts developers don't consider: data attributes rendered in `onclick` handlers, CSS `style` attribute injection, `href="javascript:"` URLs. DOMPurify handles all of these. Regex strippers don't.

---

## Common Pitfalls

### Pitfall 1: admin.js Local Helpers

**What goes wrong:** `admin.js` defines local `escapeHtml()` and `formatContent()` that shadow `Utils.*`. A developer who copies admin.js patterns to a new file gets functions that look identical but are disconnected from utils.js. If utils.js's escaping is hardened in the future, admin.js's copies don't inherit the change.

**Why it happens:** admin.js was likely written before utils.js had these helpers, or to avoid a dependency.

**How to avoid:** Replace `escapeHtml(x)` with `Utils.escapeHtml(x)` and `formatContent(x)` with `Utils.formatContent(x)` throughout admin.js. The function signatures are identical.

**Warning signs:** Grep for `function escapeHtml` — should return zero results after the fix.

### Pitfall 2: Forgetting DOMPurify CDN on New Rich-Content Pages

**What goes wrong:** A new page renders user HTML via `Utils.sanitizeHtml()` but doesn't load DOMPurify. The fallback kicks in, content is escaped instead of sanitized, and the rendering is wrong — no visible XSS, but also no rich text.

**How to avoid:** `Utils.sanitizeHtml()` must log a console warning on fallback. The four pages that render rich content (discussion, text, postcards, chat) must all load DOMPurify via CDN. Add it to all four even though they use `escapeHtml`/`formatContent` today — it's a prerequisite for the wrapper to work.

**Warning signs:** Console shows "DOMPurify not loaded, falling back to escapeHtml" in production.

### Pitfall 3: SRI Hash Version Mismatch

**What goes wrong:** The CDN URL says `dompurify@3.3.1` but the SRI hash was computed against `3.3.0`. The browser blocks the script. Page renders blank in supported browsers.

**How to avoid:** Always compute the hash against the exact file at the exact version URL you are using. Re-compute if the version changes. Never copy an SRI hash from a blog post or Stack Overflow.

**Warning signs:** Browser console shows "Failed to find a valid digest in the 'integrity' attribute".

### Pitfall 4: Using escapeHtml Where textContent Suffices

**What goes wrong:** Not a security bug, but an efficiency and readability issue. Code like `el.innerHTML = Utils.escapeHtml(name)` when `el.textContent = name` would work just as well creates unnecessary escaping artifacts if the string contains `&` characters that should display literally.

**How to avoid:** For display-only text nodes with no surrounding HTML structure, use `.textContent`. Use `Utils.escapeHtml()` only when the escaped text is part of a larger HTML string passed to `innerHTML`.

### Pitfall 5: innerHTML with onclick and UUIDs

**What goes wrong:** `admin.js` currently does:
```javascript
onclick="editModerationNote('${post.id}', ...)"
```
A UUID (`post.id`) is a fixed-format string that cannot contain `'` or `>`. This is safe in practice, but only because Supabase UUIDs are constrained. If the pattern were generalized to arbitrary IDs, it would be a JS injection vector.

**How to avoid:** Store IDs in `data-*` attributes, not in `onclick` strings. Add event listeners programmatically. This is a future hardening recommendation — not a current blocker for SECR-01.

---

## Code Examples

Verified patterns from the existing codebase and DOMPurify docs:

### utils.js — Utils.sanitizeHtml() addition

```javascript
// Source: DOMPurify README + existing utils.js pattern
/**
 * Sanitize HTML from untrusted sources. Wraps DOMPurify.sanitize().
 * Use this for any content that arrives as HTML and must render as HTML.
 * For plain text that needs formatting, use formatContent() instead.
 * @param {string} html - Potentially unsafe HTML string
 * @returns {string} Sanitized HTML safe for innerHTML assignment
 */
sanitizeHtml(html) {
    if (typeof DOMPurify === 'undefined') {
        console.warn('Utils.sanitizeHtml: DOMPurify not loaded, falling back to escapeHtml');
        return this.escapeHtml(html);
    }
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'p', 'br', 'a', 'ul', 'ol', 'li'],
        ALLOWED_ATTR: ['href', 'target', 'rel']
    });
},
```

### DOMPurify script tag (to add to HTML pages)

```html
<!-- Place before other JS files in <head> or before closing </body> -->
<!-- SRI hash must be computed: curl -s https://cdn.jsdelivr.net/npm/dompurify@3.3.1/dist/purify.min.js | openssl dgst -sha384 -binary | openssl base64 -A -->
<script
  src="https://cdn.jsdelivr.net/npm/dompurify@3.3.1/dist/purify.min.js"
  integrity="sha384-COMPUTED_HASH_HERE"
  crossorigin="anonymous"></script>
```

### admin.js — replace local helper calls

```javascript
// BEFORE (local helper):
${escapeHtml(post.model)}

// AFTER (use Utils):
${Utils.escapeHtml(post.model)}
```

### Correct textContent usage (don't use innerHTML for simple text)

```javascript
// Source: OWASP DOM-based XSS Prevention Cheat Sheet
// When you only need text, textContent is always safe:
element.textContent = identity.name;

// Only use innerHTML + escapeHtml when you need the text embedded in HTML:
container.innerHTML = `<span class="badge">${Utils.escapeHtml(identity.name)}</span>`;
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `innerHTML = userContent` (raw) | `innerHTML = Utils.escapeHtml(userContent)` | Prevents HTML injection |
| `innerHTML = userContent` (raw, rich) | `innerHTML = Utils.sanitizeHtml(userContent)` via DOMPurify | Prevents XSS in rich HTML |
| browser-native Sanitizer API | DOMPurify | Sanitizer API is experimental; DOMPurify works everywhere |
| Local per-file `escapeHtml()` | Centralized `Utils.escapeHtml()` | One implementation, one place to harden |

**Deprecated/outdated:**
- Local `escapeHtml` functions in individual JS files: superseded by `Utils.escapeHtml()` from Phase 1
- `sanitize-html` npm package: requires bundler, incompatible with this project's no-build-step constraint

---

## Open Questions

1. **profile.js line 77 — `charAt(0)` in innerHTML**
   - What we know: `identity.name.charAt(0).toUpperCase()` is a single uppercase letter — cannot form a complete XSS payload
   - What's unclear: Whether the escaping discipline should explicitly cover single-char uses to make auditing simpler
   - Recommendation: Apply `Utils.escapeHtml(identity.name.charAt(0).toUpperCase())` — it costs nothing and keeps the audit rule simple ("all user data in innerHTML goes through Utils")

2. **admin.js `onclick="...'${post.id}'..."` pattern**
   - What we know: UUIDs are format-constrained and cannot inject JS
   - What's unclear: Whether this pattern should be refactored to `data-id` attributes as a hardening step
   - Recommendation: Out of scope for Phase 4 — document as a future hardening note but don't block SECR-01 on it

3. **Pages that need DOMPurify CDN tag**
   - Phase 4 requirements specify: discussion, text, postcards, chat
   - Phase 4 requirements do NOT include profile, admin, dashboard
   - Recommendation: Add DOMPurify to exactly the four named pages — SECR-02 is scoped to rich-content pages

---

## Sources

### Primary (HIGH confidence)
- DOMPurify GitHub README (fetched 2026-02-27) — version 3.3.1 confirmed, API verified
- DOMPurify 3.3.1 CDN file header comment (fetched from cdn.jsdelivr.net 2026-02-27) — version string verified
- existing utils.js (read directly from codebase) — escapeHtml, formatContent patterns
- existing discussion.js, chat.js, text.js, postcards.js, admin.js, profile.js (read from codebase) — innerHTML audit

### Secondary (MEDIUM confidence)
- OWASP XSS Prevention Cheat Sheet (fetched 2026-02-27) — escapeHtml vs DOMPurify decision rules
- OWASP DOM-based XSS Prevention Cheat Sheet (fetched 2026-02-27) — textContent vs innerHTML guidance

### Tertiary (LOW confidence)
- jsDelivr package page — SRI hash format confirmed as available; exact hash value for 3.3.1 must be computed at implementation time from the file content

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — DOMPurify version confirmed from CDN file; existing utils.js functions verified by reading source
- Architecture: HIGH — two-tier escaping pattern derived directly from codebase audit + OWASP guidance
- Pitfalls: HIGH — admin.js local helpers confirmed by direct source read; SRI pitfall confirmed by official CDN documentation

**Research date:** 2026-02-27
**Valid until:** 2026-05-27 (DOMPurify 3.x stable; check for new releases before implementation)
