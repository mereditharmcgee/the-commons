---
phase: 29-curation
plan: 01
subsystem: database, ui
tags: [rls, pinning, discussions, interests, supabase]

requires:
  - phase: 23-interests
    provides: interests and discussions tables, interest detail page
provides:
  - is_pinned column on discussions table with partial index
  - Admin-only INSERT and DELETE RLS policies on interests
  - Pinned-first sort order on interest detail pages
  - Pin icon visual indicator for pinned discussions
affects: [29-02-admin-curation-panel]

tech-stack:
  added: []
  patterns: [is_pinned column + partial index pattern, pinned-first sort in API and client]

key-files:
  created:
    - sql/patches/add-discussion-pinned.sql
    - sql/patches/restrict-interest-insert.sql
  modified:
    - js/interest.js
    - css/style.css

key-decisions:
  - "Pinned discussions sort first in both API queries and client-side sort functions"
  - "Used unicode pushpin character (U+1F4CC) for pin icon instead of SVG"
  - "Added admin DELETE policy on interests proactively for Plan 02"

patterns-established:
  - "Discussion pinning: is_pinned boolean + partial index + desc sort prefix"

requirements-completed: [CUR-01, CUR-03]

duration: 2min
completed: 2026-03-13
---

# Phase 29 Plan 01: Discussion Pinning and Interest Creation Lockdown Summary

**Discussion is_pinned column with partial index, admin-only interest RLS, and pinned-first sort with pin icon on interest detail pages**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-13T17:43:30Z
- **Completed:** 2026-03-13T17:44:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added is_pinned boolean column to discussions table with partial index for efficient querying
- Replaced permissive interest INSERT policy with admin-only RLS, plus admin DELETE policy
- Updated interest detail page to sort pinned discussions first in both API and client-side sorts
- Added subtle pushpin icon next to pinned discussion titles

## Task Commits

Each task was committed atomically:

1. **Task 1: Add is_pinned column to discussions and restrict interest creation to admins** - `eb017dd` (feat)
2. **Task 2: Update discussion sort order and add pin icon display** - `a4d4940` (feat)

## Files Created/Modified
- `sql/patches/add-discussion-pinned.sql` - ALTER TABLE + partial index for discussion pinning
- `sql/patches/restrict-interest-insert.sql` - Admin-only INSERT and DELETE RLS policies on interests
- `js/interest.js` - Pinned-first sort in API queries and client-side sort functions, pin icon rendering
- `css/style.css` - Subtle .pin-icon styles (0.85em, 70% opacity)

## Decisions Made
- Used unicode pushpin character instead of SVG for simplicity and consistency with existing codebase patterns
- Pinned-first sort applied to both API order parameter and all client-side sort functions (recent + popular)
- Proactively added admin DELETE policy on interests since Plan 02 needs it for the admin curation panel

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Client-side sorts also respect pinned status**
- **Found during:** Task 2 (discussion sort order)
- **Issue:** Plan only specified API query sort, but client-side sortDiscussions() and General interest merge-sort would override the pinned order
- **Fix:** Added is_pinned comparison to both sortDiscussions modes (recent + popular) and the General interest merge sort
- **Files modified:** js/interest.js
- **Verification:** grep confirms pinned-first logic in all sort paths
- **Committed in:** a4d4940 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correctness -- without client-side pinned sort, switching between Recent/Popular tabs would lose pinned-first ordering.

## Issues Encountered
None

## User Setup Required
SQL patches need to be executed against Supabase:
- `sql/patches/add-discussion-pinned.sql` - adds is_pinned column to discussions
- `sql/patches/restrict-interest-insert.sql` - restricts interest creation to admins

## Next Phase Readiness
- is_pinned infrastructure ready for Plan 02 admin curation panel
- Admin DELETE policy already in place for Plan 02 interest management
- No blockers

---
*Phase: 29-curation*
*Completed: 2026-03-13*
