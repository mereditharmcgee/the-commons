---
phase: 23-interests-system
plan: 03
subsystem: ui
tags: [interests, curator-tools, admin, profile-badges, vanilla-js, supabase]

# Dependency graph
requires:
  - phase: 23-01
    provides: interests browse page, interest-card CSS, CONFIG.api endpoints
  - phase: 23-02
    provides: interest detail page, join/leave, create discussion
  - phase: 21-01
    provides: interests schema (is_pinned, sunset_days, status lifecycle)
  - phase: 22-02
    provides: site shell (nav, footer)

provides:
  - Curator create interest on interests.html (name, description, status picker)
  - Curator sunset interest on interest.html (non-pinned, 60-day inactivity indicator)
  - Admin move discussion between interests on admin.html
  - Interest badges on voice profile page (profile.html)
affects: [phase-25 voices redesign, phase-28 admin polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Create interest uses Auth.getClient() INSERT with slug auto-generation and 23505 collision handling"
    - "Sunset uses .eq('is_pinned', false) server-side guard in addition to UI check"
    - "Move discussion uses existing updateRecord() admin helper with dynamically created modal"
    - "Interest badges on profile use fire-and-forget Utils.get() to avoid blocking profile render"

key-files:
  created: []
  modified:
    - js/interests.js
    - js/interest.js
    - admin.html
    - js/admin.js
    - profile.html
    - js/profile.js
    - interests.html
    - interest.html
    - css/style.css

key-decisions:
  - "Create interest visible to all logged-in users (not just curators) — interests table INSERT RLS allows any authenticated user"
  - "Sunset button guarded both in UI (hide for pinned) and query (.eq is_pinned false) for defense in depth"
  - "Move discussion lives in admin panel only — discussions UPDATE RLS is admin-only per schema"
  - "Profile interest badges are non-blocking fire-and-forget load"
  - "CSP inline styles replaced with CSS classes to fix CSP violations (commit c75af59)"

patterns-established:
  - "Interest badges as clickable pills linking to interest.html?slug=<slug>"
  - "Admin modal pattern: dynamically created overlay with form, event delegation for action buttons"

requirements-completed: [INT-09, INT-10, VIS-01]

# Metrics
duration: ~15min
completed: 2026-03-04
---

# Phase 23 Plan 03: Curator Tools, Admin Move, Profile Badges Summary

**Curator management tools (create/sunset interest), admin move-discussion, interest badges on voice profiles, and visual verification of card layout consistency**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-03-04
- **Tasks:** 4 (3 auto + 1 human verification checkpoint)
- **Files modified:** 8

## Accomplishments
- Added "Create Interest" button and modal on interests.html for logged-in users (name, description, status picker, auto-slug)
- Added sunset capability on interest detail page: inactivity indicator (60-day threshold), sunset button for non-pinned active interests, archived banner for sunset interests
- Added "Move" button to admin panel discussions tab with interest dropdown modal using existing updateRecord() helper
- Added interest badges on voice profile pages (fire-and-forget load, clickable pills linking to interest detail)
- Fixed CSP violations by replacing inline styles with CSS classes
- Visual verification checkpoint passed — card consistency, responsive layout, all flows confirmed working

## Task Commits

Each task was committed atomically:

1. **Task 1: Curator tools — create interest and sunset interest** - `15ded7f` (feat)
2. **Task 2: Move discussion between interests in admin panel** - `047fb56` (feat)
3. **Task 3: Interest badges on voice profile page** - `60acac2` (feat)
4. **CSP fix** - `c75af59` (fix)
5. **Task 4: Visual verification** - Approved by user

## Files Modified
- `interests.html` — Create interest button and modal HTML
- `js/interests.js` — Create interest form logic, slug generation, 23505 collision handling
- `interest.html` — Sunset button and inactivity indicator HTML
- `js/interest.js` — Sunset logic, inactivity computation, archived banner
- `admin.html` — (dynamic rendering, no static HTML changes needed)
- `js/admin.js` — loadInterests(), moveDiscussion() modal, move-discussion action handler
- `profile.html` — Interest badges section (#profile-interests)
- `js/profile.js` — loadInterestBadges() function with fire-and-forget call
- `css/style.css` — CSS classes replacing inline styles for CSP compliance

## Decisions Made
- Create interest available to all logged-in users (RLS allows any authenticated INSERT)
- Sunset guarded both in UI and query level (.eq is_pinned false)
- Move discussion admin-only (discussions UPDATE RLS restricted to is_admin())
- Profile badges non-blocking to avoid delaying profile render

## Deviations from Plan
- Added CSP fix commit (c75af59) to replace inline styles with CSS classes — not in original plan but necessary for Content Security Policy compliance

## Issues Encountered
- Inline styles in dynamically created elements caused CSP violations — resolved by moving to CSS classes

## User Setup Required
None.

## Next Phase Readiness
- Phase 23 (Interests System) is fully complete — all 3 plans executed
- Ready for Phase 24 (Notifications)

---
*Phase: 23-interests-system*
*Completed: 2026-03-04*

## Self-Check: PASSED

- FOUND: js/interests.js (createInterest logic)
- FOUND: js/interest.js (sunset logic)
- FOUND: js/admin.js (moveDiscussion logic)
- FOUND: js/profile.js (loadInterestBadges)
- FOUND commit: 15ded7f (Task 1)
- FOUND commit: 047fb56 (Task 2)
- FOUND commit: 60acac2 (Task 3)
- FOUND commit: c75af59 (CSP fix)
