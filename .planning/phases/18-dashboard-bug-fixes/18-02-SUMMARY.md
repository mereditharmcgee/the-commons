---
phase: 18-dashboard-bug-fixes
plan: "02"
subsystem: dashboard
tags: [bug-fix, accessibility, security, ux]
dependency_graph:
  requires: []
  provides: [DASH-02, DASH-03, DASH-04, DASH-05]
  affects: [js/dashboard.js]
tech_stack:
  added: []
  patterns: [finally-block, per-modal-state, url-validation, loading-indicators]
key_files:
  created: []
  modified:
    - js/dashboard.js
decisions:
  - "Per-modal trigger/cleanup vars (not shared) eliminate cross-modal state corruption"
  - "isSafeUrl() allows relative paths and http/https only -- javascript: URIs are silently dropped"
  - "Stats use unicode ellipsis (U+2026) as loading placeholder; ? for error state"
metrics:
  duration: "25 min"
  completed: "2026-03-01T15:14:24Z"
  tasks_completed: 2
  files_modified: 1
---

# Phase 18 Plan 02: Dashboard Bug Fixes Summary

**One-liner:** Four critical JS bugs fixed -- submit button finally-block, per-modal focus isolation, javascript: URI rejection, and stats loading/error indicators.

## What Was Built

Fixed four safety and reliability bugs in `js/dashboard.js`:

1. **DASH-02 -- Submit button finally block:** The identity form submit handler now captures `isEdit` before the try block and resets the button in a `finally` block. Previously, if `loadIdentities()` threw after a successful save, the button stayed permanently disabled.

2. **DASH-03 -- Per-modal focus trap variables:** Replaced shared `activeModalTrigger`/`activeModalCleanup` with `identityModalTrigger`/`identityModalCleanup` and `tokenModalTrigger`/`tokenModalCleanup`. Opening the token modal while the identity modal is closing no longer corrupts focus restoration.

3. **DASH-04 -- Notification link URI validation:** Added `isSafeUrl()` helper that rejects `javascript:` URIs, allowing only relative paths and `http:`/`https:` protocols. Notification links are also escaped with `Utils.escapeHtml()` before insertion into href attributes.

4. **DASH-05 -- Stats loading/error indicators:** `loadStats()` now sets all stat values to `…` (U+2026 ellipsis) before fetching. On network error, any stat still showing `…` becomes `?` rather than a misleading `0`. Stats that loaded before the error keep their real values.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 08db427 | fix(18-02): submit button finally block and per-modal focus trap variables |
| 2 | 2df18d7 | fix(18-02): notification link validation and stats loading indicators |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `js/dashboard.js` exists and contains all required changes
- Commit 08db427 verified in git log
- Commit 2df18d7 verified in git log
