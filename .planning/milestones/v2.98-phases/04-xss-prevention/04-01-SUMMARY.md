---
phase: 04-xss-prevention
plan: 01
subsystem: security
tags: [xss, dompurify, sri, content-security, utils]
dependency_graph:
  requires: []
  provides: [Utils.sanitizeHtml, DOMPurify-CDN-with-SRI]
  affects: [js/utils.js, discussion.html, text.html, postcards.html, chat.html]
tech_stack:
  added: [dompurify@3.3.1 via CDN]
  patterns: [SRI integrity hash, DOMPurify whitelist sanitization, escapeHtml fallback]
key_files:
  modified:
    - js/utils.js
    - discussion.html
    - text.html
    - postcards.html
    - chat.html
decisions:
  - "DOMPurify 3.3.1 pinned by version in CDN URL and locked with sha384 SRI hash to prevent supply chain attacks"
  - "Allowed tags restricted to formatting/structure only: b, strong, i, em, p, br, a, ul, ol, li"
  - "DOMPurify inserted before Supabase script in load order so global is available when any JS calls sanitizeHtml"
  - "sanitizeHtml fallback to escapeHtml with console.warn preserves safety if CDN fails"
  - "DOMPurify scoped to 4 rich-content pages only (discussion, text, postcards, chat) per SECR-02"
metrics:
  duration: ~2min
  completed: 2026-02-27
  tasks_completed: 1
  files_modified: 5
requirements: [SECR-02, SECR-03]
---

# Phase 4 Plan 1: DOMPurify CDN Integration and Utils.sanitizeHtml() Summary

**One-liner:** Utils.sanitizeHtml() wraps DOMPurify.sanitize() with a whitelist and escapeHtml fallback; DOMPurify 3.3.1 loaded via CDN with sha384 SRI on all four rich-content pages.

## What Was Built

Added XSS prevention infrastructure required by SECR-02 and SECR-03:

1. **Utils.sanitizeHtml() in js/utils.js** — New method that wraps `DOMPurify.sanitize()` with a minimal allowed-tag whitelist. Falls back gracefully to `Utils.escapeHtml()` with a console warning when DOMPurify is not loaded (e.g., CDN failure).

2. **DOMPurify 3.3.1 CDN script tags** — Added to all four rich-content pages (discussion.html, text.html, postcards.html, chat.html) with:
   - Exact version pin (`@3.3.1`)
   - SRI integrity hash (`sha384-80VlBZnyAwkkqtSfg5NhPyZff6nU4K/qniLBL8Jnm4KDv6jZhLiYtJbhglg/i9ww`)
   - `crossorigin="anonymous"` attribute
   - Placement before the Supabase CDN script (correct load order)

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Utils.sanitizeHtml() to utils.js and DOMPurify CDN to 4 HTML pages | e2234af | js/utils.js, discussion.html, text.html, postcards.html, chat.html |

## Verification Results

All plan verification criteria passed:

- `grep -c "sanitizeHtml" js/utils.js` returns 2 (JSDoc + method definition)
- `grep -c "dompurify@3.3.1" discussion.html` = 1
- `grep -c "dompurify@3.3.1" text.html` = 1
- `grep -c "dompurify@3.3.1" postcards.html` = 1
- `grep -c "dompurify@3.3.1" chat.html` = 1
- `grep -c "integrity=" discussion.html text.html postcards.html chat.html` = 1 for each
- `grep -c "dompurify" js/home.js js/admin.js` = 0 for each (DOMPurify not added to non-rich-content pages)

## Implementation Details

**sanitizeHtml method (js/utils.js, after formatContent):**

```javascript
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

**DOMPurify CDN script tag (all 4 HTML files):**

```html
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.3.1/dist/purify.min.js"
    integrity="sha384-80VlBZnyAwkkqtSfg5NhPyZff6nU4K/qniLBL8Jnm4KDv6jZhLiYtJbhglg/i9ww"
    crossorigin="anonymous"></script>
```

## Decisions Made

- **DOMPurify tag placement:** Inserted before the Supabase script tag so the DOMPurify global is available before any page JS runs. Per plan spec, this is before `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">`.
- **Whitelist conservatism:** Tags limited to common safe formatting; no `<div>`, `<span>`, `<img>`, `<iframe>` or event-bearing attributes. This is intentionally restrictive — the wrapper exists for future use.
- **No pages beyond the four:** admin.html, index.html, home.js, admin.js — none received DOMPurify. SECR-02 explicitly scopes this to the four rich-content pages.

## Deviations from Plan

None — plan executed exactly as written.

Note: The changes were committed in a prior session under commit `e2234af` (which included both this plan's changes and a pre-existing admin.js refactoring from Phase 03). The commit message referenced `04-02` in error, but the content is correct and complete.

## Self-Check

Verified the following:

- `js/utils.js` contains `sanitizeHtml` — FOUND
- `discussion.html` contains `dompurify@3.3.1` — FOUND
- `text.html` contains `dompurify@3.3.1` — FOUND
- `postcards.html` contains `dompurify@3.3.1` — FOUND
- `chat.html` contains `dompurify@3.3.1` — FOUND
- Commit `e2234af` exists — FOUND

## Self-Check: PASSED
