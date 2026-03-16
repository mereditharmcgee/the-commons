---
phase: 05-dependency-security
plan: 02
subsystem: security
tags: [csp, content-security-policy, xss, inline-scripts, hash-allowlist, supabase, google-fonts, ko-fi]
dependency_graph:
  requires: [Supabase-SRI-pin, noopener-all-blank-links]
  provides: [CSP-all-pages, hash-based-inline-script-allowlist]
  affects: [all 27 HTML files]
tech_stack:
  added: []
  patterns: [Content-Security-Policy meta tag, sha256 inline script hash allowlist, hash-based CSP without unsafe-inline]
key_files:
  modified:
    - about.html
    - admin.html
    - agent-guide.html
    - api.html
    - chat.html
    - claim.html
    - constitution.html
    - contact.html
    - dashboard.html
    - discussion.html
    - discussions.html
    - index.html
    - login.html
    - moment.html
    - moments.html
    - participate.html
    - postcards.html
    - profile.html
    - propose.html
    - reading-room.html
    - reset-password.html
    - roadmap.html
    - search.html
    - submit.html
    - suggest-text.html
    - text.html
    - voices.html
decisions:
  - "Single unified CSP used for all 27 pages — browsers ignore non-matching sha256 hashes, so including all 10 hashes on every page is harmless and avoids per-page variant maintenance"
  - "storage.ko-fi.com included globally in script-src despite only about.html using Ko-fi widget — two meta CSP tags have inconsistent cross-browser behavior, making per-page override unreliable"
  - "All inline script SHA256 hashes verified by recomputing from live file content before insertion, confirming all matched the 05-RESEARCH.md expected values exactly"
metrics:
  duration: ~2min
  completed: 2026-02-27
  tasks_completed: 2
  files_modified: 27
requirements: [SECR-05]
---

# Phase 5 Plan 2: Content-Security-Policy Meta Tag on All Pages Summary

**One-liner:** Content-Security-Policy meta tag with hash-based inline script allowlisting (10 sha256 hashes, no unsafe-inline) added to all 27 HTML pages, covering Supabase CDN, DOMPurify CDN, Ko-fi widget, Google Fonts, and Supabase WebSocket connections.

## What Was Built

A single Content-Security-Policy meta tag was added to every HTML page in the project. The CSP uses hash-based inline script allowlisting — meaning each inline `<script>` block is permitted by its SHA256 fingerprint rather than by `'unsafe-inline'`. This provides real XSS defense: an attacker who injects a new script tag cannot execute it, because the injected script's hash won't be in the allowlist.

**Key properties of the CSP:**
- `default-src 'self'` — fallback allows only same-origin resources
- `script-src` allows: same-origin JS, cdn.jsdelivr.net (Supabase + DOMPurify), storage.ko-fi.com (Ko-fi widget), and 10 sha256 inline script hashes
- `style-src` allows: same-origin CSS + Google Fonts stylesheet (fonts.googleapis.com)
- `font-src` allows: Google Fonts font files (fonts.gstatic.com)
- `connect-src` allows: Supabase REST API (https) + Supabase Realtime WebSocket (wss)
- `img-src` allows: same-origin + data: URIs (for the SVG favicon)
- `object-src 'none'` — disables plugin/Flash embeds entirely
- `base-uri 'self'` — prevents base-tag injection attacks

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Compute and verify all inline script SHA256 hashes | (verification only) | No files modified |
| 2 | Add CSP meta tag to all 27 HTML pages | 4a8080d | All 27 HTML files (54 insertions) |

## Verification Results

All plan verification criteria passed:

- **All 27 pages have CSP meta tag:** `grep -rl 'Content-Security-Policy' *.html | wc -l` = 27
- **No page uses unsafe-inline:** `grep -r 'unsafe-inline' *.html | wc -l` = 0
- **All required directives present (index.html):** `grep 'Content-Security-Policy' index.html | grep -c "default-src.*script-src.*style-src.*font-src.*connect-src.*img-src.*object-src.*base-uri"` = 1
- **WebSocket covered (chat.html):** `grep 'Content-Security-Policy' chat.html | grep -c 'wss://dfephsfberzadihcrhal.supabase.co'` = 1
- **10 sha256 hashes present (index.html):** `grep 'sha256-' index.html | grep -o "sha256-[^']*" | wc -l` = 10
- **CSP before scripts (index.html):** CSP at line 22, first script at line 224
- **cdn.jsdelivr.net covered on all 27 pages:** count = 27
- **fonts.googleapis.com covered on all 27 pages:** count = 27

## Implementation Details

**CSP meta tag (identical across all 27 pages):**

```html
<!-- CSP: regenerate inline-script hashes after modifying any <script> block. See .planning/phases/05-dependency-security/05-RESEARCH.md -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://storage.ko-fi.com 'sha256-dptEh/JzFYXFzlMhpnxf7BFQPVCCqLJfAFiNl0PYKcU=' 'sha256-AmGvtDAkv/U6sY31qctvMI13eS/PK4mLWMxS0mpjCyU=' 'sha256-5/+tr6pajWLn1EMnNqD8G8ROaTMezRxiuDVqusamKAg=' 'sha256-3VoNQXcTAIhqvOpAynL0bQqKyc5aySlYbS5FXeiKplw=' 'sha256-5vsNBx1i0x7j5KGDiOK35Segml2RZbH+lEfvjFKwK88=' 'sha256-VSyVr5+j6OQM5AeWfOQQfMvc6L6d3IAFgbYKkjstIFE=' 'sha256-B0/QCsSJo7JEZPNCUpm0ACmeZMF0DwkTXcc2OKlwVw0=' 'sha256-H29Z3oYLhFB6oeCtS9mYXhJLGzfwDvE+VyMiA8nYtY8=' 'sha256-/Syw3BObAEQeAhc7W/96pkHR6FNkiAQChzOXOGGYBHw=' 'sha256-7mR6jWtMXpj3YX5hY4wjjmMzW6HM1pypl7u2u7aR2+w='; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://dfephsfberzadihcrhal.supabase.co wss://dfephsfberzadihcrhal.supabase.co; img-src 'self' data:; object-src 'none'; base-uri 'self'">
```

**Inline script hashes (all verified before insertion):**

| Hash | Page(s) |
|------|---------|
| `sha256-dptEh/JzFYXFzlMhpnxf7BFQPVCCqLJfAFiNl0PYKcU=` | 15 pages (common Auth.init() block) |
| `sha256-AmGvtDAkv/U6sY31qctvMI13eS/PK4mLWMxS0mpjCyU=` | about.html (Ko-fi widget init) |
| `sha256-5/+tr6pajWLn1EMnNqD8G8ROaTMezRxiuDVqusamKAg=` | agent-guide.html |
| `sha256-3VoNQXcTAIhqvOpAynL0bQqKyc5aySlYbS5FXeiKplw=` | api.html |
| `sha256-5vsNBx1i0x7j5KGDiOK35Segml2RZbH+lEfvjFKwK88=` | claim.html |
| `sha256-VSyVr5+j6OQM5AeWfOQQfMvc6L6d3IAFgbYKkjstIFE=` | contact.html |
| `sha256-B0/QCsSJo7JEZPNCUpm0ACmeZMF0DwkTXcc2OKlwVw0=` | index.html |
| `sha256-H29Z3oYLhFB6oeCtS9mYXhJLGzfwDvE+VyMiA8nYtY8=` | login.html |
| `sha256-/Syw3BObAEQeAhc7W/96pkHR6FNkiAQChzOXOGGYBHw=` | participate.html |
| `sha256-7mR6jWtMXpj3YX5hY4wjjmMzW6HM1pypl7u2u7aR2+w=` | reset-password.html |

**Pages with no inline scripts (CSP still added, extra hashes ignored by browser):**
admin.html, dashboard.html, profile.html, voices.html

**Placement in head — before first link or script tag:**

```html
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="twitter:image" content="...">   <!-- last existing meta tag -->

    <!-- CSP: regenerate inline-script hashes after modifying any <script> block. See .planning/phases/05-dependency-security/05-RESEARCH.md -->
    <meta http-equiv="Content-Security-Policy" content="...">   <!-- NEW: inserted here -->

    <link rel="canonical" href="...">
    <link rel="stylesheet" href="css/style.css">
    ...
```

## Decisions Made

- **Single CSP for all 27 pages:** Browsers ignore sha256 hashes that don't match any script on the current page, so including all 10 hashes globally is harmless. This allows one maintained CSP string rather than 27 per-page variants. Tradeoff: slightly longer CSP header.
- **storage.ko-fi.com global:** Only about.html loads the Ko-fi widget script, but two `<meta http-equiv="Content-Security-Policy">` tags in the same document have inconsistent cross-browser behavior. Adding Ko-fi to the global script-src on all pages is the accepted tradeoff.
- **Hashes verified before insertion:** Task 1 recomputed all SHA256 hashes from live file content. All 10 matched the 05-RESEARCH.md expected values exactly, confirming no inline script was accidentally modified during prior phases.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Verified the following:

- `index.html` contains `Content-Security-Policy` — FOUND (line 22)
- `chat.html` contains `wss://dfephsfberzadihcrhal.supabase.co` in CSP — FOUND
- `about.html` contains `storage.ko-fi.com` in CSP — FOUND
- `admin.html` CSP placed before first `<link>` tag — FOUND (CSP at line 9, link at line 10)
- No file contains `unsafe-inline` — VERIFIED (grep returns 0)
- Total inline scripts found: 24 (matches expected) — VERIFIED
- Commit `4a8080d` exists — FOUND

## Self-Check: PASSED
