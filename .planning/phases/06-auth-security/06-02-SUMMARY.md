---
phase: 06-auth-security
plan: "02"
subsystem: auth-edge-cases
tags: [auth, security, csp, edge-cases, user-experience]
dependency_graph:
  requires: [js/auth.js, login.html, reset-password.html, js/dashboard.js]
  provides: [SECR-08, SECR-09, SECR-10]
  affects: [all 27 HTML pages (CSP hash updates)]
tech_stack:
  added: []
  patterns: [URL hash param reading, URLSearchParams, Supabase getSession(), history.replaceState()]
key_files:
  created: []
  modified:
    - js/dashboard.js
    - login.html
    - reset-password.html
    - "all 27 HTML pages (CSP sha256 hash updates)"
decisions:
  - "06-02: Magic link error check placed BEFORE Auth.init() to prevent Supabase client from processing the malformed hash"
  - "06-02: history.replaceState() used to clear error hash before redirect to avoid confusing Supabase client on login page"
  - "06-02: recoveryLink.innerHTML used for reset-password recovery paragraph — contains only a hardcoded href='login.html', no user input"
  - "06-02: login.html showError() is textContent-based (XSS-safe) — reason param is hardcoded in dashboard.js, not from user input"
metrics:
  duration: "~4 minutes"
  completed: "2026-02-28"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 29
requirements:
  - SECR-08
  - SECR-09
  - SECR-10
---

# Phase 6 Plan 02: Auth Edge Case Handling Summary

**One-liner:** Auth edge case handling — expired session, reused magic link, and expired reset link each produce clear user-facing messages with recovery paths, plus CSP hash updates across all 27 pages.

## What Was Built

Three auth edge cases now produce clear, contextual user-facing messages instead of silent failures or confusing UI states:

**SECR-08 — Expired session redirect (dashboard.js):**
Instead of showing the hidden "not-logged-in" div, `dashboard.js` now redirects unauthenticated users to `login.html?reason=session_expired`. The login page reads the `reason` parameter and displays "Your session has expired. Please sign in again."

**SECR-09 — Expired/reused password reset link (reset-password.html):**
After `Auth.init()`, `reset-password.html` calls `getSession()` to check for a valid recovery session. If none exists (link expired or already used), the form is hidden and a clear error is shown: "This password reset link has already been used or has expired." A recovery paragraph is added dynamically with a link back to login to request a new reset.

**SECR-10 — Reused magic link (dashboard.js + login.html):**
Before `Auth.init()`, `dashboard.js` checks the URL hash for Supabase's `error_code=otp_expired` parameter. On match, the hash is cleared via `history.replaceState()` to prevent Supabase client confusion, then the user is redirected to `login.html?reason=magic_link_expired`. Login displays: "That sign-in link has already been used. Please sign in with your password or request a new magic link."

**CSP hash updates (all 27 pages):**
Both `login.html` and `reset-password.html` inline scripts were modified, invalidating their existing CSP sha256 hashes. New hashes were computed and replaced across all 27 HTML files:
- login.html: `H29Z3oYLhFB6oeCtS9mYXhJLGzfwDvE+VyMiA8nYtY8=` → `N4aeyiWhMOTZjzDfoZAfr6vu1pX13OlacZT+G05nERo=`
- reset-password.html: `7mR6jWtMXpj3YX5hY4wjjmMzW6HM1pypl7u2u7aR2+w=` → `++HZGeeGbY+DoKKb62Fkiie5w5MvT3zRZJD0Ym21A3g=`

## Task Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Magic link error detection + expired session redirect in dashboard.js | 1cb0af0 | js/dashboard.js |
| 2 | Expired reset link detection in reset-password.html + contextual messages in login.html + CSP hash updates | 5efa27b | login.html, reset-password.html, 25 other HTML files |

## Verification Results

- dashboard.js detects `otp_expired` in URL hash BEFORE `Auth.init()` (pos 5358 < 5757): PASS
- dashboard.js redirects to `login.html?reason=session_expired` when not logged in: PASS
- reset-password.html calls `getSession()` after `Auth.init()` and shows "already been used or has expired" message: PASS
- reset-password.html hides form when link expired (`resetForm.style.display = 'none'`): PASS
- reset-password.html shows link back to login.html for recovery: PASS
- login.html reads `?reason=` param via URLSearchParams and shows contextual messages: PASS
- CSP hashes updated in all 27/27 HTML pages: PASS
- No changes to admin.js (separate auth flow): PASS

## Decisions Made

1. **Magic link check before Auth.init():** The hash check must run before `Auth.init()` because Supabase v2's `onAuthStateChange` listener processes the URL hash as part of initialization. Checking first prevents the client from entering a confused state when the hash contains error params instead of valid tokens.

2. **history.replaceState() to clear hash:** After detecting the magic link error, the hash is cleared before redirecting. This prevents the Supabase client on the login page from attempting to process the stale error hash.

3. **recoveryLink.innerHTML for reset-password recovery paragraph:** The `innerHTML` assignment in `reset-password.html` constructs `<a href="login.html">Go to login</a>` — a fully hardcoded anchor with no user input. XSS risk is zero. The plan explicitly permitted this pattern.

4. **showError() via textContent (XSS-safe):** The login page's `showError()` function uses `errorDiv.textContent = message` — inherently XSS-safe. The `reason` values (`session_expired`, `magic_link_expired`) come from hardcoded strings in `dashboard.js`, not from untrusted user input.

## Deviations from Plan

### Pre-existing hash discrepancy discovered and resolved

**Found during:** Task 2 (CSP hash computation)

**Issue:** When computing the OLD hash for `login.html`'s inline script using `rfind()` (the method described in the plan), the result matched the CSP hash (`H29Z3...`). However, an initial attempt using a different extraction method (capturing more trailing whitespace) produced a different hash. Investigation confirmed the CSP hash was correct and matched the actual script content — no pre-existing bug.

**Fix:** Used the same regex extraction method (`re.findall(r'<script>(.*?)</script>')`) that the 05-02 plan used to ensure consistency, then computed new hashes with the same method.

**Commit:** 5efa27b

## Self-Check: PASSED

**Files exist:**
- FOUND: js/dashboard.js
- FOUND: login.html
- FOUND: reset-password.html
- FOUND: .planning/phases/06-auth-security/06-02-SUMMARY.md

**Commits exist:**
- FOUND: 1cb0af0 (dashboard.js magic link + session redirect)
- FOUND: 5efa27b (reset-password.html, login.html, 27 CSP hash updates)

**Key content verified:**
- otp_expired in dashboard.js: FOUND
- magic_link_expired in dashboard.js: FOUND
- session_expired in dashboard.js: FOUND
- resetSession in reset-password.html: FOUND
- reason checks in login.html: FOUND
- new login.html CSP hash in login.html: FOUND
- new reset-password.html CSP hash in reset-password.html: FOUND
