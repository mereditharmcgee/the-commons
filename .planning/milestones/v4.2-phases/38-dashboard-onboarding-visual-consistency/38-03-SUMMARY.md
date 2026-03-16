---
phase: 38-dashboard-onboarding-visual-consistency
plan: 03
subsystem: ui
tags: [admin, supabase, vanilla-js, search-as-you-type, lazy-loading]

# Dependency graph
requires:
  - phase: 35-moment-reactions-news-engagement-pipeline
    provides: create-linked-discussion button (extended, not replaced)
  - phase: 33-universal-reaction-schema
    provides: reaction count views for all content types
provides:
  - Discussion-linking search UI in admin moments tab
  - Reaction count badges on admin content lists (posts, discussions, moments, marginalia, postcards)
affects:
  - admin panel usability
  - facilitator content management workflow

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Lazy-load reaction counts after render (two-phase render: content first, augment with counts when fetch resolves)
    - Inline search panel injected via DOM, debounced at 300ms, dismissed via cancel or link action
    - loadReactionCounts/injectReactionBadges helper pair for reusable count badge injection

key-files:
  created: []
  modified:
    - js/admin.js

key-decisions:
  - "linkedMomentsMap stores { id, title } instead of bare id — title needed for 'Linked: [Title]' display without extra fetch"
  - "openLinkDiscussionPanel injects DOM panel directly (not innerHTML re-render) to preserve event listeners on existing items"
  - "Reaction counts use Utils.get (anon key) not getClient() — count views are public read, no auth needed"
  - "injectReactionBadges uses querySelectorAll after render, not inline template — keeps render functions synchronous"

patterns-established:
  - "Two-phase admin render: sync HTML render first, then async badge augmentation via injectReactionBadges"
  - "Admin event delegation switch: case 'cancel-link-discussion' uses block scope to avoid fall-through"

requirements-completed:
  - DASH-04
  - DASH-07

# Metrics
duration: 20min
completed: 2026-03-16
---

# Phase 38 Plan 03: Admin Discussion-Linking UI and Reaction Count Badges Summary

**Search-as-you-type linking of existing discussions to moments and lazy-loaded reaction count badges on all 5 admin content type lists**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-16T11:40:00Z
- **Completed:** 2026-03-16T11:59:00Z
- **Tasks:** 2
- **Files modified:** 1 (js/admin.js; css/style.css was pre-committed by 38-01)

## Accomplishments
- Added "Link Existing" button to moments tab that opens an inline search-as-you-type panel (300ms debounce, up to 8 results)
- Selecting a search result patches `discussions.moment_id` to link it to the moment, then refreshes the list
- Linked moments now show the discussion title, a "View Discussion" link, and an "Unlink" button (reversible)
- `loadReactionCounts` helper fetches from `*_reaction_counts` views for any content type
- `injectReactionBadges` augments rendered lists with "(N reactions)" badges after async fetch resolves
- Reaction count badges added to posts, discussions, moments, marginalia, and postcards lists

## Task Commits

1. **Task 1: Add discussion-linking search UI to admin moments** - `2f4134c` (feat)
   - Also includes Task 2 reaction badge infrastructure in the same commit

**Plan metadata:** (forthcoming docs commit)

## Files Created/Modified
- `js/admin.js` - Discussion linking UI, reaction count helpers, badge injection in all render functions

## Decisions Made
- `linkedMomentsMap` now stores `{ id, title }` per moment instead of bare `id`, so the "Linked: [Title]" label can be rendered without a second fetch
- Reaction counts use `Utils.get` (anon key) rather than the authenticated `getClient()`, since the count views are public-read
- `injectReactionBadges` walks the rendered DOM after each async fetch resolves, keeping render functions synchronous and avoiding re-renders

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- CSS for `admin-reaction-badge`, `admin-link-discussion-panel`, and related classes was already committed by the 38-01 plan. No duplicate styles added.

## Next Phase Readiness
- Admin panel now has full linking and engagement overview tools for all content types
- Remaining Phase 38 work: plans 38-01 and 38-02 were already completed in prior sessions (dashboard onboarding, profile reactions tab)

---
*Phase: 38-dashboard-onboarding-visual-consistency*
*Completed: 2026-03-16*
