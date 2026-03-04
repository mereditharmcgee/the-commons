---
phase: 26-home-page-personal-feed
plan: 03
subsystem: ui
tags: [localStorage, unread-indicators, relative-timestamps, nav-badge, vanilla-js]

# Dependency graph
requires:
  - phase: 26-02
    provides: home.js initFeed() with memberships, interests, nav structure established
  - phase: 23-interests-system
    provides: interests.js card rendering, interest.js discussion list rendering
  - phase: 22-site-shell-navigation
    provides: nav structure with .site-nav__links and .nav-mobile-panel selectors

provides:
  - Relative timestamps ("2h ago") on discussion.js, discussions.js, interest.js, interests.js, profile.js, dashboard.js
  - Unread interest card dots on interests.html for logged-in users using localStorage last-visit tracking
  - setLastVisit/getLastVisit helpers in interest.js and interests.js with user-scoped keys
  - Unread discussion item indicators on interest detail page
  - Interests nav badge showing count of followed interests with new activity
  - CSS classes: interest-card--unread, discussion-item--unread, interests-unread-badge

affects: [interests-system, profile, dashboard, discussions, feed]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - localStorage unread tracking keyed by commons_last_visit_{facilitatorId}_interest_{interestId}
    - Auth.init().then() for post-render unread dot injection in interests.js
    - Pre-visit snapshot pattern in interest.js (read old lastVisit before setLastVisit)
    - querySelectorAll for dual desktop/mobile nav badge injection

key-files:
  created: []
  modified:
    - js/interests.js
    - js/interest.js
    - js/home.js
    - js/discussions.js
    - js/discussion.js
    - js/profile.js
    - js/dashboard.js
    - css/style.css

key-decisions:
  - "26-03: formatRelativeTime replaces formatDate on all activity timestamps; creation/join dates (Participating since, Created) preserve formatDate"
  - "26-03: Unread dots injected post-render via Auth.init().then() — cards already in DOM when auth resolves"
  - "26-03: interest.js reads previousVisit before setLastVisit so discussions are compared against prior visit timestamp"
  - "26-03: nav badge uses querySelectorAll to inject into both desktop (.site-nav__links) and mobile (.nav-mobile-panel) nav simultaneously"
  - "26-03: navBadgeInitialized guard in home.js prevents duplicate badge injections on auth state re-fire"
  - "26-03: dashboard.js token last_used_at uses formatRelativeTime (recent usage); identity created_at keeps formatDate (creation date)"

patterns-established:
  - "localStorage key format: commons_last_visit_{facilitatorId}_{resourceType}_{resourceId}"
  - "Unread dot pattern: Auth.init().then() after grid render, iterate DOM elements by data-* attribute"
  - "Nav badge injection: querySelectorAll both desktop and mobile links, remove existing badge before re-injecting"

requirements-completed: [VIS-02, VIS-03]

# Metrics
duration: 25min
completed: 2026-03-04
---

# Phase 26 Plan 03: Unread Indicators and Relative Timestamps Summary

**localStorage-based unread dots on interest cards and discussion lists, nav badge with unread count, and relative timestamps ("2h ago") across all high-traffic pages**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-04T21:00:00Z
- **Completed:** 2026-03-04T21:25:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Replaced `Utils.formatDate()` with `Utils.formatRelativeTime()` on activity timestamps across 6 files; creation/join dates preserved as exact dates
- Added localStorage-based unread tracking with user-scoped keys (`commons_last_visit_{facilitatorId}_interest_{interestId}`) preventing cross-user bleed on shared devices
- Interest cards on interests.html show bold title + gold dot for new activity since last visit
- Visiting interest detail page records last-visit timestamp and applies unread dots to discussion items newer than previous visit
- Interests nav link shows a count badge in both desktop and mobile nav when followed interests have new activity

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace raw date strings with formatRelativeTime on high-traffic pages (VIS-02)** - `407dda7` (feat)
2. **Task 2: Add unread indicators with localStorage tracking and nav badge (VIS-03)** - `9779636` (feat)

## Files Created/Modified

- `js/interests.js` - Added `getLastVisit` helper, `data-interest-id` on cards, unread dot injection via Auth.init().then()
- `js/interest.js` - Added `getLastVisit`/`setLastVisit` helpers, records visit before applying unread dots to discussions, `data-discussion-id` on discussion cards
- `js/home.js` - Added `updateInterestsNavBadge()` function with `getLastVisitForBadge` helper; called after feed render with `navBadgeInitialized` guard
- `js/discussions.js` - Discussion list timestamps now relative
- `js/discussion.js` - Discussion header creation time now relative
- `js/profile.js` - Posts, marginalia, postcards, discussions tab timestamps now relative
- `js/dashboard.js` - Notification times, stat list dates, token last-used now relative; identity created_at preserved
- `css/style.css` - Added `.interest-card--unread`, `.discussion-item--unread`, `.interests-unread-badge` styles; `position: relative` on cards

## Decisions Made

- `formatRelativeTime` replaces `formatDate` on all activity-oriented timestamps. Creation/join dates ("Participating since", "Created [date]", agent token creation) keep `formatDate` because exact dates are more useful there.
- Unread dots injected post-render via `Auth.init().then()` — grid is already in DOM, so we target `[data-interest-id]` attributes.
- `interest.js` reads `previousVisit` before calling `setLastVisit` so discussion unread dots are compared to the prior session's timestamp, not the current visit.
- `updateInterestsNavBadge` in home.js fetches discussions for user's interest IDs to compute last-activity per interest — separate lightweight call rather than threading through `loadFeedContent`.
- `navBadgeInitialized` flag prevents duplicate badge injection on auth state changes.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- VIS-02 and VIS-03 requirements fulfilled
- Phase 26 complete — all three plans executed
- Unread tracking system is extensible: same key format can support other resource types
- Badge injection pattern established for reuse if other nav links need badges

---
*Phase: 26-home-page-personal-feed*
*Completed: 2026-03-04*
