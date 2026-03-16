---
phase: 05-dependency-security
plan: 01
subsystem: security
tags: [sri, cdn, subresource-integrity, noopener, noreferrer, supply-chain, tabnapping]
dependency_graph:
  requires: [DOMPurify-CDN-with-SRI]
  provides: [Supabase-SRI-pin, noopener-all-blank-links]
  affects: [all 27 HTML files]
tech_stack:
  added: [supabase-js@2.98.0 via CDN with SRI]
  patterns: [SRI integrity hash, pinned CDN version, rel=noopener noreferrer]
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
  - "Supabase JS pinned to @2.98.0/dist/umd/supabase.js — the explicit file path is required for SRI; the floating @2 URL uses dynamic minification which produces different bytes each request"
  - "SRI hash sha384-NRo2jhGGHu91p1IOcVC3UWI5Vnd+xGXfD/8N7Hr9+aGTK0d/Pl0i+kUZsB/zIlrK was pre-computed against the static UMD build file"
  - "crossorigin=anonymous required alongside integrity attribute for browser to enforce SRI on cross-origin resources"
  - "DOMPurify script ordering preserved on 4 rich-content pages: DOMPurify before Supabase"
  - "Inline script content not modified — CSP hashes for Plan 05-02 remain valid"
metrics:
  duration: ~6min
  completed: 2026-02-27
  tasks_completed: 2
  files_modified: 27
requirements: [SECR-04, SECR-06]
---

# Phase 5 Plan 1: Supabase SRI Pin + noopener on All Pages Summary

**One-liner:** Supabase JS pinned to @2.98.0 with sha384 SRI hash on all 27 pages; rel="noopener noreferrer" added to all 91 target="_blank" links across 26 pages to prevent supply chain attacks and reverse tabnapping.

## What Was Built

Two mechanical HTML security hardening tasks applied across all 27 HTML files:

1. **rel="noopener noreferrer" on all blank-target links** — Added to all 91 `target="_blank"` anchor tags across 26 HTML files (admin.html skipped — zero blank-target links). Prevents reverse tabnapping via `window.opener` access (SECR-06).

2. **Supabase JS pinned to @2.98.0 with SRI hash** — Replaced the floating `@2` CDN URL with the pinned exact-version URL `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.98.0/dist/umd/supabase.js` across all 27 HTML files. Added `integrity="sha384-NRo2jhGGHu91p1IOcVC3UWI5Vnd+xGXfD/8N7Hr9+aGTK0d/Pl0i+kUZsB/zIlrK"` and `crossorigin="anonymous"` to each. Prevents supply chain attacks via CDN tampering (SECR-04).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add rel="noopener noreferrer" to all target="_blank" links | 2a7ca1c | 26 HTML files (91 insertions) |
| 2 | Pin Supabase JS to v2.98.0 with SRI hash on all 27 pages | 343af77 | All 27 HTML files |

## Verification Results

All plan verification criteria passed:

- **No floating Supabase URLs:** `grep -rn 'supabase-js@2"' *.html | wc -l` = 0
- **All 27 files have pinned Supabase:** `grep -rl 'supabase-js@2.98.0/dist/umd/supabase.js' *.html | wc -l` = 27
- **All integrity attrs present:** `grep -rl 'integrity="sha384-NRo2jhGGHu91p1IOcVC3UWI5Vnd' *.html | wc -l` = 27
- **All crossorigin attrs present:** `grep -rl 'crossorigin="anonymous"' *.html | wc -l` = 27
- **No blank-target links without noopener:** `grep -rn 'target="_blank"' *.html | grep -v 'noopener' | wc -l` = 0
- **DOMPurify SRI intact on 4 pages:** `grep -c 'dompurify@3.3.1' chat.html discussion.html postcards.html text.html` = 1 for each

## Implementation Details

**Supabase SRI script tag (all 27 HTML files):**

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.98.0/dist/umd/supabase.js"
    integrity="sha384-NRo2jhGGHu91p1IOcVC3UWI5Vnd+xGXfD/8N7Hr9+aGTK0d/Pl0i+kUZsB/zIlrK"
    crossorigin="anonymous"></script>
```

**noopener noreferrer pattern (all blank-target links):**

```html
<!-- Before -->
<a href="https://ko-fi.com/mmcgee" target="_blank">Support</a>

<!-- After -->
<a href="https://ko-fi.com/mmcgee" target="_blank" rel="noopener noreferrer">Support</a>
```

**Link patterns updated across all 26 files (91 total):**
- Ko-fi links: `<a href="https://ko-fi.com/mmcgee" target="_blank">` — in nav + footer on every page
- GitHub links: `<a href="https://github.com/mereditharmcgee/the-commons..." target="_blank">` — in footer on every page
- External resource links (Anthropic constitution, GitHub issues, Ko-fi widget, API docs, etc.)

## Decisions Made

- **Floating @2 URL incompatible with SRI:** jsDelivr dynamically minifies the `@2` URL — bytes differ each request. The `@2.98.0/dist/umd/supabase.js` URL serves a static file with stable bytes, making SRI possible.
- **DOMPurify ordering preserved:** On the 4 rich-content pages (chat.html, discussion.html, postcards.html, text.html), DOMPurify appears before Supabase. Only the Supabase tag was modified; ordering maintained.
- **Inline scripts untouched:** No content between `<script>` and `</script>` was modified. CSP inline-script hashes computed for Plan 05-02 remain valid.
- **admin.html excluded from noopener task:** admin.html has zero `target="_blank"` links; it was included for the Supabase SRI task (Task 2 covers all 27 files).

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Verified the following:

- `about.html` contains `supabase-js@2.98.0/dist/umd/supabase.js` — FOUND
- `index.html` contains `supabase-js@2.98.0/dist/umd/supabase.js` — FOUND
- `chat.html` contains `supabase-js@2.98.0/dist/umd/supabase.js` — FOUND
- `admin.html` contains `integrity="sha384-NRo2jhGGHu91p1IOcVC3UWI5Vnd` — FOUND
- `chat.html` contains `dompurify@3.3.1` — FOUND (DOMPurify SRI untouched)
- Zero `target="_blank"` without noopener — VERIFIED (grep returns 0)
- Commit `2a7ca1c` exists — FOUND
- Commit `343af77` exists — FOUND

## Self-Check: PASSED
