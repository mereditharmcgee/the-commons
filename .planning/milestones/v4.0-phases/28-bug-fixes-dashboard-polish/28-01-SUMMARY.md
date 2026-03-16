---
phase: 28-bug-fixes-dashboard-polish
plan: 01
subsystem: ui
tags: [auth, csp, bfcache, event-delegation, discussion, dashboard, modals]

# Dependency graph
requires:
  - phase: 24-notifications
    provides: authStateChanged event pattern used by discussion.js
  - phase: 22-site-shell-navigation
    provides: nav auth UI (login link, user menu, bell icon)
provides:
  - Working reply button on discussion threads (no double Auth.init dispatch)
  - Clean dashboard load with no auto-opening modals (HTML + bfcache guard)
  - Correct auth state on discussion page (no redundant authStateChanged flash)
affects: [discussion.html, dashboard.html, js/discussion.js, js/dashboard.js]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - pageshow/persisted bfcache guard for modals
    - HTML style='display:none' as primary modal hide (before JS executes)
    - Remove redundant inline Auth.init() calls to prevent double authStateChanged dispatch

key-files:
  created: []
  modified:
    - discussion.html
    - dashboard.html
    - js/dashboard.js

key-decisions:
  - "BUG-01: Root cause was redundant Auth.init() call in discussion.html inline script causing extra authStateChanged dispatch and renderPosts() re-render during which reply button clicks could be dropped"
  - "BUG-02: auth.js _authResolved guard was already correct -- no changes needed; fix came from removing the double dispatch source in discussion.html"
  - "BUG-05: Dual defense strategy -- HTML style='display:none' for initial load, pageshow/persisted handler for bfcache restoration; both needed for complete coverage"

patterns-established:
  - "pageshow event with e.persisted check is the correct bfcache guard pattern for modals"
  - "Inline scripts at bottom of body calling Auth.init() are redundant if the page JS IIFE already calls it; remove to prevent double dispatch"

requirements-completed: [BUG-01, BUG-02, BUG-05]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 28 Plan 01: Bug Fixes (Reply Button, Auth State, Dashboard Modals) Summary

**Fixed three user-reported bugs: removed redundant double Auth.init() call on discussion page (BUG-01/02) and added bfcache-safe modal hiding to dashboard (BUG-05)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-04T23:48:50Z
- **Completed:** 2026-03-04T23:53:23Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Removed redundant `Auth.init()` inline script from `discussion.html` that was causing a double `authStateChanged` dispatch, which triggered an extra `renderPosts()` call that could disrupt reply button click handling (BUG-01) and cause brief auth state UI flash (BUG-02)
- Added `style="display: none;"` to `identity-modal` and `token-modal` elements in `dashboard.html` as primary defense against modal auto-opening on initial page load (BUG-05)
- Added `pageshow` event listener in `dashboard.js` with `e.persisted` check to re-hide modals when page is restored from bfcache (back-forward cache), covering the back-button scenario (BUG-05)
- Removed orphaned CSP hash from `discussion.html` that corresponded to the deleted inline script

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix reply button and auth state bugs (BUG-01, BUG-02)** - `ee1b6e2` (fix)
2. **Task 2: Fix dashboard modal auto-open on load (BUG-05)** - `9fa22eb` (fix)

## Files Created/Modified
- `discussion.html` - Removed redundant DOMContentLoaded Auth.init() inline script; removed orphaned CSP hash
- `dashboard.html` - Added `style="display: none;"` to identity-modal and token-modal elements
- `js/dashboard.js` - Added pageshow/persisted bfcache guard to re-hide all modals on bfcache restore; updated guard comment

## Decisions Made
- Root cause of BUG-01: The `discussion.html` had both `discussion.js` (IIFE calls `Auth.init()` directly) AND an inline `<script>` calling `Auth.init()` on DOMContentLoaded. The second call was guarded by `initialized` flag but still triggered `updateUI()` which dispatched `authStateChanged`, causing `renderPosts()` to run twice. During the second re-render (which briefly clears and rebuilds `postsContainer.innerHTML`), click events could be dropped.
- BUG-02 was caused by the same double dispatch -- the extra `authStateChanged` event was reaching pages that hadn't finished initial render, causing brief auth state inconsistency in the UI.
- auth.js `_authResolved` guard in `updateUI()` was already correctly implemented; no changes to auth.js were needed.
- BUG-05 root cause: `.modal { display: none }` in CSS handles the initial load, but when a user has a modal open, navigates to another page, then presses Back, the browser bfcache restores the page with JS state preserved (modal's `style.display = 'flex'`). The fix requires both HTML attribute (for non-bfcache loads) and `pageshow` handler (for bfcache restores).

## Deviations from Plan

None - plan executed exactly as written. Root cause analysis confirmed the plan's hypothesis about double Auth.init() and bfcache as the root causes.

## Issues Encountered
- `dashboard.html` had already been modified by prior phase 28-02 work (Danger Zone section, delete account modal) - this was expected and the new modal elements were already correctly hidden with `style="display: none;"` from that earlier work.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three bugs (BUG-01, BUG-02, BUG-05) resolved
- Phase 28-02 (account deletion) was already underway in parallel -- that work is at checkpoint awaiting human verification
- v4.0 Commons 2.0 release-blocking bugs now fixed

---
*Phase: 28-bug-fixes-dashboard-polish*
*Completed: 2026-03-04*
