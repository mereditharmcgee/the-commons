---
phase: 26-home-page-personal-feed
plan: 01
subsystem: ui
tags: [home-page, personal-feed, auth-aware, vanilla-js, css]

# Dependency graph
requires:
  - phase: 24-notifications
    provides: authStateChanged event pattern from notifications.js
  - phase: 25-voices-profiles
    provides: enriched voice profiles and interest badges referenced in landing page copy
  - phase: 23-interests-system
    provides: interests.html as destination for Discover and Explore card links

provides:
  - index.html split into #home-logged-out (landing) and #home-logged-in (feed scaffold)
  - home.js auth-aware show/hide via authStateChanged event
  - CSS classes for personal feed layout (.feed-container, .feed-item, .trending-container, .trending-card, .feed-empty)

affects: [26-02-personal-feed-implementation, css]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - authStateChanged event for auth-aware page splitting (same as notifications.js)
    - Dual-section HTML with show/hide via JS (no server-side rendering needed)
    - feedInitialized guard prevents double-initialization on auth state re-fires

key-files:
  created: []
  modified:
    - index.html
    - js/home.js
    - css/style.css

key-decisions:
  - "26-01: index.html uses dual-section pattern (#home-logged-out visible by default, #home-logged-in hidden) — avoids flash of wrong content on page load"
  - "26-01: home.js IIFE replaced with authStateChanged listener — consistent with notifications.js pattern"
  - "26-01: loadHeroStats and loadRecentNews called from authStateChanged handler (not at IIFE start) — only fires for logged-out users"
  - "26-01: feedInitialized guard in closure prevents duplicate feed calls if authStateChanged fires multiple times"
  - "26-01: Outdated What's New announcements (Voice Homes, Reactions, Directed Questions as new features) replaced with Discover section"
  - "26-01: The Gathering explore card replaced with Interests card — Interests is the primary community entry point now"
  - "26-01: Latest Activity and Discussions tab sections removed from logged-out view — not needed alongside Discover and In the News"
  - "26-01: CSS uses project variable names (--space-md, --bg-card, --border-subtle, --text-muted) with fallback literals"

patterns-established:
  - "Auth-aware page split: #home-logged-out (default visible) + #home-logged-in (hidden) toggled by authStateChanged"
  - "Feed placeholder: initFeed() shows loading state, checks identities, shows empty state if none — Plan 02 fills in real data"

requirements-completed: [NAV-02, NAV-03, FEED-01, FEED-06]

# Metrics
duration: 18min
completed: 2026-03-04
---

# Phase 26 Plan 01: Home Page Dual-View Structure Summary

**index.html split into logged-out landing page (refreshed Discover section, current feature highlights) and logged-in feed scaffold (trending + personal feed containers) with auth-aware home.js using authStateChanged event pattern**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-04T20:20:39Z
- **Completed:** 2026-03-04T20:38:58Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Restructured index.html into dual-purpose page: logged-out visitors see the full landing page, logged-in users see only feed area
- Refreshed logged-out landing content: replaced outdated "Voice Homes / Reactions / Directed Questions" What's New cards with a Discover section highlighting Interests communities, enriched Voice Profiles, and Reactions system
- Replaced The Gathering explore card with Interests card (now the primary community entry point)
- Removed Latest Activity (5 recent posts) and Discussions tabs sections — superseded by the personal feed for logged-in and not needed for logged-out
- Rewrote home.js as authStateChanged event listener — consistent with notifications.js pattern; hero stats and news only load for logged-out users
- Added CSS foundation for Plan 02: .feed-container, .feed-item, .feed-item__*, .trending-container, .trending-card, .feed-empty

## Task Commits

1. **Task 1: Restructure index.html with dual logged-in/logged-out sections** - `0915712` (feat)
2. **Task 2: Rewrite home.js for auth-aware show/hide and add feed CSS** - `fe51146` (feat)

## Files Created/Modified

- `index.html` - Dual-section home page with #home-logged-out and #home-logged-in, refreshed Discover section, updated Explore grid
- `js/home.js` - Rewritten with authStateChanged listener, initFeed placeholder, preserved loadHeroStats/loadRecentNews for logged-out view
- `css/style.css` - Added PERSONAL FEED section with feed/trending/empty state classes

## Decisions Made

- Used `authStateChanged` event (not `Auth.init().then()`) for the show/hide toggle — same pattern as notifications.js, fires after auth resolves with a boolean detail
- feedInitialized guard in IIFE closure prevents duplicate calls if event fires multiple times
- Logged-out sections default to visible with no display:none — so content appears immediately on page load before auth resolves, then gets hidden if user is logged in
- Plan 02 will replace the initFeed placeholder with real feed loading logic

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Node.js shell escaping: The automated verification command from the plan uses `!h.includes(...)` which gets interpreted by bash as history expansion. Resolved by running verification via `node --input-type=commonjs` heredoc.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Structural foundation complete for Plan 02 (personal feed implementation)
- #home-logged-in scaffold is in place with #trending-container and #feed-container ready for population
- CSS classes (.feed-item, .trending-card, etc.) defined and available for Plan 02 rendering code
- initFeed() placeholder shows loading state then empty/onboarding message — Plan 02 replaces this with real data fetching

## Self-Check: PASSED

- FOUND: index.html
- FOUND: js/home.js
- FOUND: css/style.css
- FOUND: .planning/phases/26-home-page-personal-feed/26-01-SUMMARY.md
- FOUND: commit 0915712 (Task 1)
- FOUND: commit fe51146 (Task 2)

---
*Phase: 26-home-page-personal-feed*
*Completed: 2026-03-04*
