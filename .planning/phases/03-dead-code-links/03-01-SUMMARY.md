---
phase: 03-dead-code-links
plan: 01
subsystem: ui
tags: [eslint, dead-code, javascript, linting]

# Dependency graph
requires: []
provides:
  - ESLint flat config (eslint.config.mjs) for script-mode IIFE JS with no-unused-vars and no-unreachable rules
  - Dead variables removed: isAdmin (admin.js), discussionIds (profile.js), nameDisplay (text.js)
  - 10 unused catch params renamed with underscore prefix across chat.js, dashboard.js, submit.js, utils.js
  - Broken identity.html link fixed to profile.html in admin.js View Profile link and POST_CLAIMS_SOP.md
affects: [future JS files, onboarding/contributor docs]

# Tech tracking
tech-stack:
  added: [eslint 9.x (npm dev dependency), eslint.config.mjs (flat config format)]
  patterns: [underscore prefix convention for intentionally unused catch params (catch (_e)), eslint no-unused-vars with caughtErrorsIgnorePattern]

key-files:
  created:
    - eslint.config.mjs
    - package.json
    - package-lock.json
  modified:
    - js/admin.js
    - js/chat.js
    - js/dashboard.js
    - js/profile.js
    - js/submit.js
    - js/text.js
    - js/utils.js
    - docs/sops/POST_CLAIMS_SOP.md

key-decisions:
  - "ESLint flat config (eslint.config.mjs) chosen over legacy .eslintrc - required for ESLint 9.x"
  - "Underscore prefix convention (_e, _error) for intentionally unused catch params; caughtErrorsIgnorePattern added to config to suppress ESLint warnings for this pattern"
  - "isAdmin variable removed entirely with all 3 assignments - was never read so all uses were dead writes"
  - "discussionIds line removed from profile.js - the Set/map had no side effects, safe to delete"
  - "nameDisplay removed from text.js - variable built but never referenced in template output"

patterns-established:
  - "Unused catch param pattern: prefix with underscore (catch (_e)) — ESLint config suppresses warnings via caughtErrorsIgnorePattern: '^_'"
  - "ESLint runs via npx eslint js/ — no npm script required, just npx"

requirements-completed: [STRC-07, STRC-09]

# Metrics
duration: 15min
completed: 2026-02-27
---

# Phase 3 Plan 1: Dead Code and Broken Links Summary

**ESLint config established, 3 dead variables removed, 10 catch params prefixed, and broken identity.html link fixed to profile.html — ESLint now runs clean with zero warnings across all 21 JS files**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-27T00:00:00Z
- **Completed:** 2026-02-27T00:15:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Created `eslint.config.mjs` flat config for script-mode IIFE JS — enables ongoing lint enforcement
- Removed 3 genuinely dead variables (`isAdmin`, `discussionIds`, `nameDisplay`) with all associated assignments
- Renamed 10 unused catch/event params to underscore-prefix convention across 4 files
- Fixed confirmed broken link: `identity.html?id=` → `profile.html?id=` in admin.js and POST_CLAIMS_SOP.md
- ESLint produces zero warnings across all 21 JS files

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ESLint config and fix all 13 dead code findings** - `49c0b66` (feat)
2. **Task 2: Fix broken identity.html link in admin.js and verify all JS-rendered hrefs** - `28970d5` (fix)

**Plan metadata:** _(committed with final state update)_

## Files Created/Modified

- `eslint.config.mjs` - ESLint flat config for script-mode JS, sourceType "script", globals for browser + project globals, no-unused-vars with underscore-ignore pattern
- `package.json` - npm init with eslint dev dependency
- `package-lock.json` - lock file for npm install
- `js/admin.js` - Removed `isAdmin` declaration and all 3 assignments; fixed `identity.html` → `profile.html` in View Profile link
- `js/chat.js` - Renamed 2 unused `catch (e)` → `catch (_e)` (scheduleReconnect and beforeunload handlers)
- `js/dashboard.js` - Renamed 4 unused catch params (`_e` x2, `_error` x2) in subscription and clipboard handlers
- `js/profile.js` - Removed dead `discussionIds` variable (Set/map result never consumed)
- `js/submit.js` - Renamed 2 unused `catch (e)` → `catch (_e)` in saveDraft and restoreDraft
- `js/text.js` - Removed dead `nameDisplay` variable (template literal never referenced)
- `js/utils.js` - Renamed 2 unused `catch (e)` → `catch (_e)` in post() and copyToClipboard()
- `docs/sops/POST_CLAIMS_SOP.md` - Fixed `identity.html` → `profile.html` in email template URL

## Decisions Made

- ESLint flat config format (eslint.config.mjs) required for ESLint 9.x — no legacy .eslintrc used
- Added `caughtErrorsIgnorePattern: "^_"` and `varsIgnorePattern: "^_"` to suppress warnings for intentional underscore-prefix convention
- `isAdmin` removed with all assignments — variable was written in 3 places but never read, making all writes dead
- `discussionIds` line safe to remove — `[...new Set(posts.map(...))]` has no side effects beyond producing the unused array
- `nameDisplay` line safe to remove — right-hand side is a simple ternary string expression with no side effects

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint not installed — installed npm + eslint**
- **Found during:** Task 1 (create ESLint config and run lint)
- **Issue:** No `package.json` or `node_modules` existed; `npx eslint` would have failed without npm init
- **Fix:** Ran `npm init -y` then `npm install --save-dev eslint` to create package.json and install ESLint 9.x
- **Files modified:** package.json, package-lock.json (new files; node_modules/ already in .gitignore)
- **Verification:** `npx eslint js/` ran successfully and found the expected 13 warnings
- **Committed in:** 49c0b66 (Task 1 commit)

**2. [Rule 1 - Bug] ESLint config caughtErrorsIgnorePattern needed for underscore convention**
- **Found during:** Task 1, after first lint run post-rename
- **Issue:** Renaming `catch (e)` to `catch (_e)` didn't suppress ESLint warnings — the initial config lacked `caughtErrorsIgnorePattern` and `varsIgnorePattern`
- **Fix:** Added `caughtErrors: "all"`, `caughtErrorsIgnorePattern: "^_"`, and `varsIgnorePattern: "^_"` to the `no-unused-vars` rule options
- **Files modified:** eslint.config.mjs
- **Verification:** `npx eslint js/` produced zero output (zero warnings)
- **Committed in:** 49c0b66 (Task 1 commit, config and code fixes combined)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug/config)
**Impact on plan:** Both auto-fixes necessary to complete the task. No scope creep. ESLint config enhancement makes the underscore convention permanent and discoverable.

## Issues Encountered

None — once ESLint was installed and the config corrected for the underscore convention, all fixes applied cleanly.

## Next Phase Readiness

- ESLint is now runnable via `npx eslint js/` — can be added to pre-commit hooks or CI in a future phase
- All 21 JS files lint clean; codebase is in a consistent state for the remaining dead-code-links plans
- profile.html is the correct target for all AI identity profile links going forward

---
*Phase: 03-dead-code-links*
*Completed: 2026-02-27*
