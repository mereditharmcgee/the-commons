---
phase: 08-profile-ux
plan: "01"
subsystem: ui
tags: [character-counter, sort, voices, submit-form, dashboard]

# Dependency graph
requires:
  - phase: 07-profile-data-integrity
    provides: last_active column in ai_identity_stats view
provides:
  - Content textarea character counter (PROF-05)
  - Bio character counter verification (PROF-06)
  - Last active sort on voices page (PROF-08)
  - Last-active label on voice cards
affects: [09-api-docs, 10-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Character counter: flex row with help text + counter span, both in form-help div"
    - "Null-safe sort: push null last_active values to bottom with explicit checks"
    - "Conditional template rendering: ternary in template literal for optional UI elements"

key-files:
  created: []
  modified:
    - js/submit.js
    - submit.html
    - js/voices.js
    - voices.html
    - css/style.css

key-decisions:
  - "08-01: Character counter placed in form-help div as flex row to preserve layout and avoid inline script changes"
  - "08-01: Null last_active pushes identities to bottom of sort — avoids '56 years ago' from new Date(null)"
  - "08-01: PROF-06 bio counter already fully implemented — no code changes needed, verification only"
  - "08-01: voice-card__last-active label omitted entirely when last_active is null — cleaner UX than empty space"

patterns-established:
  - "Character counter: updateXxxCharCount() function with gold at 90% and red above max"
  - "Null-safe date sort: check both null, then each individually before comparing dates"

requirements-completed: [PROF-05, PROF-06, PROF-08]

# Metrics
duration: 10min
completed: 2026-02-28
---

# Phase 8 Plan 01: Character Counters and Voices Last-Active Sort Summary

**Live character counter on submit form textarea (PROF-05), bio counter confirmed (PROF-06), and last-active sort with "Active N ago" labels on voice cards (PROF-08)**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-28T03:37:00Z
- **Completed:** 2026-02-28T03:47:25Z
- **Tasks:** 4 (3 code changes + 1 verification)
- **Files modified:** 5

## Accomplishments
- Content textarea in submit.html now shows live "N / 50,000" character count with gold warning at 90% and red above limit
- Dashboard bio counter (PROF-06) confirmed fully implemented — no changes needed
- Voices page has 4th "Last active" sort button with null-safe sorting logic
- Voice cards display "Active N ago" label for identities with non-null last_active, omitted otherwise

## Task Commits

Each task was committed atomically:

1. **Task 1: Add character counter to submit form content textarea** - `77adb1d` (feat)
2. **Task 2: Verify bio character counter in dashboard (PROF-06)** - no commit needed (verification only — already implemented)
3. **Task 3: Add "Last active" sort button to voices page** - `2455ddd` (feat)
4. **Task 4: Add last-active label to voice cards** - `a3e3c6a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `js/submit.js` - Added updateContentCharCount() with input listener for PROF-05
- `submit.html` - Replaced p.form-help with flex div containing help text and char counter span
- `js/voices.js` - Added sort-last-active to sortBtns array, last-active sort case, and last-active label in card template
- `voices.html` - Added 4th "Last active" sort button to tablist
- `css/style.css` - Added .voice-card__last-active rule (0.75rem, text-muted, margin-top xs)

## Decisions Made
- Character counter placed in form-help div as flex row: no inline script modifications required, no CSP hash regeneration needed
- Null last_active values pushed to bottom of sort by explicit null checks — avoids `new Date(null)` = epoch date ("56 years ago")
- PROF-06 bio counter already fully implemented in dashboard.js and dashboard.html — task was verification-only, no code changes
- voice-card__last-active label entirely omitted for null last_active — cleaner than empty space or "never"

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- PROF-05, PROF-06, PROF-08 all satisfied
- Voices page now supports 4 sort modes with full keyboard navigation
- Ready for Phase 09 (API docs) or Phase 10 (polish)

---
*Phase: 08-profile-ux*
*Completed: 2026-02-28*
