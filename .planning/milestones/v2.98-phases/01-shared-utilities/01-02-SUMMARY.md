---
phase: 01-shared-utilities
plan: 02
subsystem: shared-utilities
tags: [refactor, getModelClass, utils, deduplication]
dependency_graph:
  requires: [01-01]
  provides: [STRC-01]
  affects: [home.js, admin.js, dashboard.js, profile.js, voices.js]
tech_stack:
  added: []
  patterns: [Utils.getModelClass() as single source of truth for model CSS class resolution]
key_files:
  modified:
    - js/home.js
    - js/admin.js
    - js/dashboard.js
    - js/profile.js
    - js/voices.js
decisions:
  - "Keep HEAD (remote) structure for voices.js during merge conflict — remote had added renderVoices/sortIdentities/follower_count features that must be preserved"
  - "Fixed additional getModelClass call site in admin.js renderPostcards (line 536) found during conflict resolution — not listed in plan interfaces"
metrics:
  duration: ~10min
  completed: 2026-02-26
  tasks_completed: 2
  files_modified: 5
---

# Phase 1 Plan 02: Migrate Local getModelClass to Utils.getModelClass Summary

Removed 5 duplicate local `getModelClass()` function definitions and migrated all call sites to `Utils.getModelClass()`. After this plan, adding a new AI model to CONFIG.models is a 2-file change (config.js + style.css) instead of a 7-file change.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove local getModelClass from all 5 JS files | b354383 | js/home.js, js/admin.js, js/dashboard.js, js/profile.js, js/voices.js |
| 2 | Visual verification (checkpoint:human-verify) | — | Auto-approved (yolo mode) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed additional getModelClass call site in admin.js renderPostcards**
- **Found during:** Task 1 (conflict resolution)
- **Issue:** admin.js line 536 (`renderPostcards`) had a bare `getModelClass(pc.model)` call not listed in the plan's interfaces section (plan listed lines 346, 398, 620, 674 but missed this one)
- **Fix:** Replaced with `Utils.getModelClass(pc.model)`
- **Files modified:** js/admin.js
- **Commit:** b354383

**2. [Rule 3 - Blocking] Resolved merge conflicts in admin.js and voices.js**
- **Found during:** Task 1 git push
- **Issue:** Remote main had 13 commits ahead (accessibility improvements, follower counts, sort buttons in voices.js) causing conflicts
- **Fix:** Rebased, resolved conflicts by taking remote's structural changes (renderVoices, sortIdentities, follower_count) while applying our Utils.getModelClass substitution
- **Files modified:** js/admin.js, js/voices.js
- **Commit:** b354383

## Auto-approved Checkpoint

Task 2 (checkpoint:human-verify) was auto-approved per yolo mode configuration. The refactored files were pushed to GitHub Pages at https://jointhecommons.space/. All call sites use `Utils.getModelClass()`. No bare `getModelClass(` calls remain in any plan-scope file.

## Verification

```
grep -rn "function getModelClass" js/   → NONE (only utils.js definition)
grep -rn "getModelClass(" js/ | grep -v "Utils\.getModelClass"  → js/search.js only (out of scope)
```

## Self-Check: PASSED

- js/home.js: modified, contains Utils.getModelClass
- js/admin.js: modified, contains Utils.getModelClass
- js/dashboard.js: modified, contains Utils.getModelClass
- js/profile.js: modified, contains Utils.getModelClass
- js/voices.js: modified, contains Utils.getModelClass
- Commit b354383: exists
