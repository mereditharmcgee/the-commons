---
phase: 18-dashboard-bug-fixes
plan: "03"
subsystem: dashboard
tags: [bug-fix, reliability, performance, event-handling]
dependency_graph:
  requires: [18-02]
  provides: [DASH-06, DASH-07, DASH-11]
  affects: [js/dashboard.js]
tech_stack:
  added: []
  patterns: [Utils.withRetry, Promise.all, container-scoped querySelectorAll]
key_files:
  created: []
  modified:
    - js/dashboard.js
decisions:
  - "Container-scoped querySelectorAll (identitiesList/subscriptionsList/tokensList) replaces document-scoped selectors to prevent cross-section handler attachment"
  - "Promise.all for loadTokens fires getAllMyTokens and getMyIdentities concurrently even though getAllMyTokens internally fetches identities — saves one sequential round-trip"
metrics:
  duration: "8 min"
  completed: "2026-03-01"
  tasks_completed: 2
  files_modified: 1
---

# Phase 18 Plan 03: Dashboard JS Reliability Fixes Summary

**One-liner:** withRetry on notification actions, container-scoped button selectors, and parallel Promise.all token loading in dashboard.js

## What Was Built

Three JS quality and reliability bugs fixed in `js/dashboard.js`:

**DASH-06 — withRetry on notification actions:**
- Notification filter tab click handler now wraps `loadNotifications(false)` in `Utils.withRetry()` with a `.catch()` error log
- Mark-all-read handler wraps both `Auth.markAllAsRead()` and `loadNotifications(false)` in `Utils.withRetry()` inside a try/catch block
- Prevents AbortError crashes when Supabase client aborts in-flight requests during auth state changes

**DASH-07 — Container-scoped event selectors:**
- `.edit-identity-btn` and `.unpin-identity-btn`: changed from `document.querySelectorAll` to `identitiesList.querySelectorAll`
- `.unsubscribe-btn`: changed from `document.querySelectorAll` to `subscriptionsList.querySelectorAll`
- `.revoke-token-btn`: changed from `document.querySelectorAll` to `tokensList.querySelectorAll`
- Handlers now bind only to buttons within their correct section, not any matching class anywhere in the document

**DASH-11 — Parallel token and identity loading:**
- `loadTokens()` replaced sequential `await AgentAdmin.getAllMyTokens()` + `await Auth.getMyIdentities()` with `Promise.all([AgentAdmin.getAllMyTokens(), Auth.getMyIdentities()])`
- Both requests now fire concurrently, saving one sequential round-trip

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | withRetry on notification actions + scoped selectors | a9ac44a | js/dashboard.js |
| 2 | Promise.all parallel token/identity loading | a9ac44a | js/dashboard.js |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- js/dashboard.js modified: confirmed
- Commit a9ac44a exists: confirmed
- identitiesList.querySelectorAll (2 occurrences): confirmed
- subscriptionsList.querySelectorAll: confirmed
- tokensList.querySelectorAll: confirmed
- withRetry.*loadNotifications: confirmed
- withRetry.*markAllAsRead: confirmed
- Promise.all with getAllMyTokens and getMyIdentities: confirmed
