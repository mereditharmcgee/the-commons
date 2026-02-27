---
phase: 02-auth-state-patterns
plan: 02
subsystem: frontend-js
tags: [state-patterns, utils, voices, profile, home, submit, auth-init]
dependency_graph:
  requires: [02-01]
  provides: [standardized-state-patterns-voices-profile-home-submit]
  affects: [js/voices.js, js/profile.js, js/home.js, js/submit.js]
tech_stack:
  added: []
  patterns:
    - Utils.showLoading() for initial load states
    - Utils.showError() with onRetry callback for recoverable errors
    - Utils.showEmpty() with CTA for zero-content states
    - Named loadVoices() function extracted from IIFE for retry support
key_files:
  created: []
  modified:
    - js/voices.js
    - js/profile.js
    - js/home.js
    - js/submit.js
decisions:
  - voices.js IIFE body refactored to extract loadVoices() — required to pass function reference to onRetry
  - profile.js errorState div removed; errors rendered into loadingState container via Utils.showError()
  - submit.js double Auth.init() left in place with clarifying comment — guarded by this.initialized, .then() chain is correct
  - home.js activity feed error uses window.location.reload() as retry — no named function to reference
metrics:
  duration: ~2min
  completed: 2026-02-27
  tasks_completed: 2
  files_modified: 4
---

# Phase 2 Plan 2: Auth State Patterns — voices/profile/home/submit Summary

**One-liner:** Replaced ad-hoc innerHTML state strings in voices.js, profile.js, home.js, and submit.js with Utils.showLoading/showError/showEmpty helpers, including retry callbacks and warm error messaging.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Standardize voices.js loading/error/empty state patterns | 4643352 | js/voices.js |
| 2 | Standardize profile.js, home.js, and submit.js patterns | 9ac5e5a | js/profile.js, js/home.js, js/submit.js |

## Changes Made

### Task 1 — voices.js

- Extracted `loadVoices()` function from the top-level IIFE body so that a reference to it can be passed as `onRetry` to `Utils.showError()`
- Replaced `voicesList.innerHTML = '<p class="text-muted">Loading voices...</p>'` with `Utils.showLoading()`
- Replaced ad-hoc empty-state `<div class="voices-empty">` block with `Utils.showEmpty()` with a "Learn how to participate" CTA linking to `participate.html`
- Replaced `voicesList.innerHTML = '<p class="text-muted">Error loading voices...'` with `Utils.showError()` with `onRetry: () => loadVoices()` and `technicalDetail: error.message`
- `Auth.init()` left as fire-and-forget — voices.html has no inline call, so this is the canonical init

### Task 2 — profile.js

- Removed the unused `errorState` variable declaration (the `#error-state` div is no longer manipulated from JS)
- Replaced `loadingState.style.display = 'none'; errorState.style.display = 'block'` (missing-ID case) with `Utils.showError()` — "link might be broken" messaging, retry navigates to voices.html
- Added `Utils.showError()` with `onRetry: () => window.location.reload()` to the catch block for load failures
- Replaced `loadingState.style.display = 'none'; errorState.style.display = 'block'` (not-found case) with `Utils.showError()` — "may have been removed" messaging, retry navigates to voices.html
- Auth pattern (`const authReady = Auth.init()` / `await authReady`) left unchanged — correct fire-background, await-before-subscribe pattern

### Task 2 — home.js

- Replaced `activityFeed.innerHTML = '<p class="text-muted text-center">No recent activity.</p>'` with `Utils.showEmpty()` with body copy "Check back soon — conversations are always starting."
- Replaced `activityFeed.innerHTML = ''` in catch block with `Utils.showError()` — "couldn't load recent activity" with `onRetry: () => window.location.reload()`
- Discussions section (already using Utils helpers correctly) left untouched

### Task 2 — submit.js

- Added 3-line clarifying comment above the `Auth.init().then()` call explaining that double-init is intentional: the second call returns immediately (guarded by `this.initialized`) while the `.then()` chain executes auth-dependent setup (identity loading, facilitator pre-fill)

## Deviations from Plan

None — plan executed exactly as written. The plan's own note to use the comment-only approach for submit.js was followed.

## Verification

```
voices.js Utils helper count: 3 (showLoading + showError + showEmpty) ✓
profile.js Utils.showError count: 3 (missing-ID + load-failure + not-found) ✓
home.js showError+showEmpty count: 4 (2 activity feed + 2 discussions section) ✓
voices.js text-muted remaining: 0 ✓
submit.js Auth.init count: 2 (expected — double-init intentional with comment) ✓
```

## Self-Check

Files verified:
- js/voices.js — FOUND, contains Utils.showLoading/showError/showEmpty
- js/profile.js — FOUND, contains 3x Utils.showError, no errorState variable
- js/home.js — FOUND, activity feed uses Utils.showEmpty and Utils.showError
- js/submit.js — FOUND, Auth.init() has clarifying comment

Commits verified:
- 4643352 — FOUND (voices.js refactor)
- 9ac5e5a — FOUND (profile/home/submit refactor)

## Self-Check: PASSED
