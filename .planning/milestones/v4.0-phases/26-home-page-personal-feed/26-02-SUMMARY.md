---
phase: 26-home-page-personal-feed
plan: 02
subsystem: ui
tags: [home-page, personal-feed, vanilla-js, interests, marginalia, postcards, reactions, trending, pagination, engagement-boost]

# Dependency graph
requires:
  - phase: 26-01
    provides: index.html dual-section scaffold, home.js IIFE with initFeed placeholder, CSS feed/trending classes
  - phase: 24-notifications
    provides: Auth.getNotifications for deduplication
  - phase: 23-interests-system
    provides: interest_memberships table, interests table, CONFIG.api.interest_memberships

provides:
  - Complete personal feed in home.js with all 5 content types (posts, marginalia, postcards, reactions, new discussions)
  - Engagement boost scoring (6h bump for voices user has engaged with)
  - 48h default window with auto-expand to 30 days max
  - Notification deduplication (unread notifications filtered out of feed)
  - Trending section with top 3 posts by reaction count in last 24h
  - Pagination: 20 items initially, "Show older" loads 20 more
  - Empty states: no identities, no memberships, all caught up

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Promise.all across content types with .catch() per type for graceful degradation
    - Engagement boost: timestamp + 6h offset for voices user has reacted to, sort descending
    - Auto-expand window: recursive call with doubled windowHours, capped at 720h (30 days)
    - Notification deduplication: Set of unread notification link strings, filter matching feed items
    - Flat chronological stream: all 5 content types tagged with _type, _interestName, sorted by _score

key-files:
  created: []
  modified:
    - js/home.js

key-decisions:
  - "26-02: Posts fetched via discussion->interest path (never direct interest_id on posts -- posts table has no interest_id column)"
  - "26-02: Marginalia and postcards filtered by ai_identity_id of voices in followed interests (memberIdentityIds), not by interest_id (they don't have one)"
  - "26-02: Engagement boost adds 6h to score of items from voices user has reacted to -- subtle nudge, not full algorithm"
  - "26-02: Auto-expand window doubles on each recursion (48h -> 96h -> 192h -> ... 720h), returns whatever is available at 720h cap"
  - "26-02: Notification dedup uses Set of unread notification link strings ('discussion.html?id=xxx') -- hide from feed, not dim"
  - "26-02: Trending silently hidden if no posts with reactions in last 24h -- non-critical section"
  - "26-02: Each content type fetch is wrapped in .catch() -- marginalia/postcards failure doesn't kill the whole feed"

patterns-established:
  - "Interest-gated feed: interest_memberships -> interestIds -> discussionIds -> posts (three-hop query for correct schema traversal)"
  - "memberIdentityIds derived from interest_memberships: all voice IDs in followed interests used for marginalia/postcard filtering"
  - "Feed item tagging: every item gets _type, _interestName, _score, _discussionId, _discussionTitle for unified rendering"

requirements-completed: [FEED-02, FEED-03, FEED-04, FEED-05, FEED-06]

# Metrics
duration: 15min
completed: 2026-03-04
---

# Phase 26 Plan 02: Personal Feed Implementation Summary

**Complete personal feed loading all 5 content types (posts, marginalia, postcards, reactions, new discussions) from followed interests with engagement boost scoring, 48h-to-30d auto-expand window, notification deduplication, and trending section**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-04T20:41:30Z
- **Completed:** 2026-03-04T20:44:10Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Replaced the initFeed() placeholder with a complete personal feed: interest memberships -> discussions -> posts, plus marginalia and postcards filtered by member voice IDs
- Engagement boost scoring: 6h time offset for items from voices the user has reacted to, enabling light personalization without a full recommendation algorithm
- Trending section fetches top 3 posts by reaction count in last 24h, silently hidden if no reactions found
- Notification deduplication: builds a Set of unread notification links and filters matching discussion-linked feed items
- Auto-expand window: if fewer than 5 items in 48h, recursively doubles the window up to 720h (30 days)
- Graceful degradation: each content type (marginalia, postcards) wrapped in .catch() so failures don't kill the whole feed
- Two empty states: "no identities" (create an identity) and "no memberships" (join some interests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Feed data loading (initFeed, loadFeedContent, loadTrending) + Task 2: Rendering (renderTrending, renderFeed, pagination wiring)** - `cfd1c22` (feat)

Note: Both tasks were implemented in one atomic write to js/home.js and committed together.

**Plan metadata:** (pending final commit)

## Files Created/Modified

- `js/home.js` - Complete personal feed implementation: initFeed orchestration, loadFeedContent (all 5 content types, engagement boost, auto-expand), loadTrending, renderTrending, renderFeed, renderFeedItem, showNoIdentitiesState, showNoMembershipsState

## Decisions Made

- Posts fetched via discussion->interest path (never direct interest_id on posts -- posts table has no interest_id column). This required two lookups: interest memberships -> discussion IDs -> posts.
- memberIdentityIds (all voice IDs of members in followed interests) used for marginalia and postcards, since those tables only have ai_identity_id and no interest relationship.
- Engagement boost implemented as a score offset (+6h timestamp bump) rather than a separate sort pass, keeping the sort simple.
- Notification dedup uses "hide from feed" strategy: items whose discussion links match unread notifications are excluded entirely.
- Trending silently hidden (style.display = 'none') when no trending items -- non-critical section, doesn't affect feed.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- Personal feed is fully functional: logged-in users with interest memberships will see a personalized chronological stream with all 5 content types
- Phase 26 is now complete (Plans 01 and 02 both done)
- The feed gracefully degrades if any content type fails to load
- Trending section and Show older button are both wired and ready
- Phase 27 (if any) can build on top of this feed foundation

## Self-Check: PASSED

- FOUND: js/home.js
- FOUND: .planning/phases/26-home-page-personal-feed/26-02-SUMMARY.md
- FOUND: commit cfd1c22 (Tasks 1+2)

---
*Phase: 26-home-page-personal-feed*
*Completed: 2026-03-04*
