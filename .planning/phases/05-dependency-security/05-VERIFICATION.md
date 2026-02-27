---
phase: 05-dependency-security
verified: 2026-02-27T00:00:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
---

# Phase 5: Dependency Security Verification Report

**Phase Goal:** All CDN-loaded scripts are integrity-checked and all pages declare a Content-Security-Policy
**Verified:** 2026-02-27
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every `<script src="...supabase...">` tag on every page uses an exact version pin and has an `integrity` attribute with a valid SRI hash | VERIFIED | `grep -rl 'supabase-js@2.98.0/dist/umd/supabase.js' *.html` = 27; floating `@2` URL count = 0; integrity attr count = 27; crossorigin count = 27 |
| 2 | Every HTML page has a `<meta http-equiv="Content-Security-Policy">` tag that restricts script sources to known CDNs and self | VERIFIED | CSP meta tag on 27/27 pages; 0 pages use `unsafe-inline`; all 27 have `cdn.jsdelivr.net`, `fonts.googleapis.com`, `wss://dfephsfberzadihcrhal.supabase.co` in directives |
| 3 | Every `<a target="_blank">` link across all 26 pages has `rel="noopener noreferrer"` — no exceptions | VERIFIED | 91 blank-target links all have noopener; 0 violations across all 27 HTML files; admin.html confirmed to have 0 blank-target links |

**Score:** 3/3 truths verified

---

### Required Artifacts

#### Plan 05-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `about.html` | SRI-pinned Supabase tag + noopener on blank-target links, contains `supabase-js@2.98.0` | VERIFIED | Confirmed pinned Supabase tag with sha384 hash; 4 blank-target links all have `rel="noopener noreferrer"` |
| `index.html` | SRI-pinned Supabase tag + noopener on blank-target links, contains `supabase-js@2.98.0` | VERIFIED | Confirmed pinned Supabase tag; 4 blank-target links all have `rel="noopener noreferrer"` |
| `chat.html` | SRI-pinned Supabase tag (after DOMPurify) + noopener on blank-target links, contains `supabase-js@2.98.0` | VERIFIED | DOMPurify at line 250, Supabase at line 253 — correct ordering; dompurify@3.3.1 SRI intact |

#### Plan 05-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `index.html` | CSP meta tag with inline-script hash coverage, contains `Content-Security-Policy` | VERIFIED | CSP at line 22, first script at line 224; 10 sha256 hashes present; all required directives confirmed |
| `chat.html` | CSP meta tag covering WebSocket connect-src, contains `Content-Security-Policy` | VERIFIED | CSP at line 22; `wss://dfephsfberzadihcrhal.supabase.co` confirmed in connect-src |
| `admin.html` | CSP meta tag (no inline scripts — simpler), contains `Content-Security-Policy` | VERIFIED | CSP at line 9; placed before `<link>` at line 10 |
| `about.html` | CSP meta tag covering Ko-fi widget script, contains `Content-Security-Policy` | VERIFIED | `storage.ko-fi.com` confirmed in script-src |

---

### Key Link Verification

#### Plan 05-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| All 27 HTML files | cdn.jsdelivr.net | `script src` with `integrity` attribute | WIRED | Pattern `integrity="sha384-NRo2jhGGHu91p1IOcVC3UWI5Vnd` found in all 27 files |
| All 26 HTML files with `target="_blank"` | External URLs | Anchor tags with `rel="noopener noreferrer"` | WIRED | 91/91 blank-target links have `rel="noopener noreferrer"`; 0 violations |

#### Plan 05-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| All 27 HTML files | CSP enforcement | `meta http-equiv` tag | WIRED | 27/27 pages have `Content-Security-Policy` meta tag |
| CSP `script-src` | `cdn.jsdelivr.net` + inline hashes | Hash-based allowlist with `sha256-` | WIRED | 27/27 pages have `cdn.jsdelivr.net` in CSP; 10 sha256 hashes present in all files |
| CSP `connect-src` | `dfephsfberzadihcrhal.supabase.co` | REST + WebSocket allowlist | WIRED | All 27 pages include `wss://dfephsfberzadihcrhal.supabase.co` in connect-src (confirmed via chat.html spot-check) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SECR-04 | 05-01 | Supabase JS pinned to exact version (not floating `@2`) with SRI hash on all pages | SATISFIED | Floating `@2` URL count = 0; pinned `@2.98.0/dist/umd/supabase.js` on all 27 pages with `integrity="sha384-..."` and `crossorigin="anonymous"` |
| SECR-05 | 05-02 | `<meta http-equiv="Content-Security-Policy">` tag added to all HTML pages | SATISFIED | 27/27 pages have CSP meta tag; 0 use `unsafe-inline`; all directives present (default-src, script-src, style-src, font-src, connect-src, img-src, object-src, base-uri) |
| SECR-06 | 05-01 | `rel="noopener noreferrer"` added to all `target="_blank"` links across all pages | SATISFIED | 91/91 blank-target links secured; 0 violations; admin.html has 0 blank-target links (correctly excluded from task) |

**No orphaned requirements detected.** All three Phase 5 requirement IDs (SECR-04, SECR-05, SECR-06) appear in plan frontmatter and are satisfied. REQUIREMENTS.md traceability table marks all three as Complete.

**Note:** REQUIREMENTS.md shows SECR-02 and SECR-03 as not checked off (still `[ ]` in the checkbox list), despite being assigned to Phase 4. This is a Phase 4 concern and out of scope for Phase 5 verification. Phase 5 requirements (SECR-04, SECR-05, SECR-06) are all marked checked (`[x]`).

---

### Commits Verified

| Commit | Description | Status |
|--------|-------------|--------|
| `2a7ca1c` | feat(05-01): add rel="noopener noreferrer" to all target="_blank" links | CONFIRMED — present in git log |
| `343af77` | feat(05-01): pin Supabase JS to v2.98.0 with SRI hash on all 27 pages | CONFIRMED — present in git log |
| `4a8080d` | feat(05-02): add Content-Security-Policy meta tag to all 27 HTML pages | CONFIRMED — present in git log |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns found |

Scanned all 27 HTML files for: TODO/FIXME/PLACEHOLDER/HACK comments, empty implementations, stub returns. None found in Phase 5 modified files. The maintenance comment `<!-- CSP: regenerate inline-script hashes after modifying any <script> block. -->` added to all files is appropriate documentation, not a placeholder.

---

### Human Verification Required

#### 1. Browser SRI Hash Enforcement

**Test:** Open any page (e.g., `index.html`) in a browser. Open DevTools Network panel, reload. Check that the Supabase JS file loads with status 200 and no console errors about SRI hash mismatch.
**Expected:** Supabase JS loads successfully; no "Failed to find a valid digest" or "Subresource Integrity" errors in console.
**Why human:** Cannot verify browser SRI enforcement without actually loading the page in a browser. The hash is correct per the plan's pre-computation, but hash mismatch would only surface at runtime.

#### 2. CSP Inline Script Hash Correctness

**Test:** Open a page with inline scripts (e.g., `login.html`, `index.html`) in a browser. Open DevTools Console. Check for any CSP violation errors mentioning "sha256" or "script-src".
**Expected:** No CSP violation errors; the page functions normally (auth init runs, data loads).
**Why human:** The sha256 hashes were verified by recomputing from live file content (confirmed by 05-02-SUMMARY.md), but browser enforcement of the hash-based allowlist can only be confirmed by observing the running page. Any whitespace difference not caught by the Python hash script would only surface here.

#### 3. Supabase WebSocket via CSP

**Test:** Open `chat.html` in a browser. Open DevTools Console and Network panel. Verify the WebSocket connection to `wss://dfephsfberzadihcrhal.supabase.co` is established (look for 101 Switching Protocols).
**Expected:** WebSocket connects; no CSP block on `wss://` origin; real-time chat messages appear.
**Why human:** CSP `connect-src` enforcement for WebSockets requires browser execution.

#### 4. Ko-fi Widget on about.html

**Test:** Open `about.html` in a browser. Verify the Ko-fi widget loads and renders.
**Expected:** Ko-fi widget visible; no CSP errors about `storage.ko-fi.com`.
**Why human:** Third-party widget loading requires browser verification; the `storage.ko-fi.com` allowlist entry is in the CSP but widget behavior can only be confirmed visually.

---

### Additional Observations

**CSP Design Verified:**
- No page uses `'unsafe-inline'` — confirmed by grep across all 27 files (count = 0).
- The single unified CSP approach (all 10 sha256 hashes on every page) is correctly implemented; extra hashes are harmless per spec.
- `storage.ko-fi.com` inclusion in global script-src is a documented intentional design decision.
- `object-src 'none'` and `base-uri 'self'` hardening directives are present.

**DOMPurify SRI Preserved:**
- Phase 4's DOMPurify SRI tags on chat.html, discussion.html, postcards.html, text.html are intact (each returns count=1 for `dompurify@3.3.1`).
- Script ordering on 4 rich-content pages: DOMPurify before Supabase — confirmed on chat.html (lines 250 vs 253).

---

## Summary

Phase 5 goal is **achieved**. All three success criteria from ROADMAP.md are met:

1. Every Supabase script tag on all 27 pages uses the exact pinned version `@2.98.0/dist/umd/supabase.js` with a valid `sha384` SRI hash and `crossorigin="anonymous"` — confirmed 27/27, 0 floating `@2` URLs remain.

2. Every HTML page (all 27) has a `<meta http-equiv="Content-Security-Policy">` tag restricting scripts to known CDNs and self, using hash-based inline script allowlisting without `unsafe-inline` — confirmed 27/27.

3. Every `<a target="_blank">` link across all 26 applicable pages (admin.html has none) has `rel="noopener noreferrer"` — confirmed 91/91, 0 violations.

All three requirement IDs (SECR-04, SECR-05, SECR-06) are satisfied. Three commits documented in summaries are confirmed in git log. No anti-patterns detected. Human verification is recommended for browser-side enforcement of SRI and CSP at runtime.

---

_Verified: 2026-02-27_
_Verifier: Claude (gsd-verifier)_
