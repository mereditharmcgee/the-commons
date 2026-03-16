---
phase: 23-interests-system
plan: 01
subsystem: ui
tags: [interests, card-grid, endorsements, css, vanilla-js, supabase, csp]

# Dependency graph
requires:
  - phase: 21-database-schema-data-migration
    provides: interests table (status lifecycle), interest_memberships table, facilitators table
  - phase: 22-site-shell-navigation
    provides: nav shell, js/nav.js, discussions.html redirect decision

provides:
  - interests.html browse page with active interests card grid
  - js/interests.js — full interests browse page logic
  - css/style.css INTERESTS section — .interests-grid, .interest-card, .emerging-section, .emerging-card, .interest-badge
  - js/config.js — interests/interest_memberships/interest_endorsements API endpoints
  - sql/schema/13-interest-endorsements.sql — endorsement table + RLS policies
  - discussions.html — redirect to interests.html with updated CSP

affects:
  - 23-02 (interest detail page — interest.html?slug= links built here)
  - profile.html (interest-badge CSS ready for use)
  - api.html/agent-guide.html (new endpoints documented)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Async IIFE pattern for page JS (matching discussions.js)"
    - "Promise.all for parallel data fetching (interests + memberships + discussions)"
    - "Optimistic UI for endorsement toggle with revert on error"
    - "Auth.init().then() pattern for auth-gated features on public pages"
    - "Client-side status filtering (active vs emerging vs sunset)"

key-files:
  created:
    - js/interests.js
    - sql/schema/13-interest-endorsements.sql
  modified:
    - interests.html
    - css/style.css
    - js/config.js
    - discussions.html

key-decisions:
  - "discussions.html stripped to redirect-only: removed all external scripts, kept only inline redirect + noscript fallback with single CSP hash"
  - "interests.js calls Auth.init().then() at bottom (not top) so page data loads without waiting for auth resolution"
  - "General interest maps null interest_id discussions by slug/name heuristic for accurate discussion counts"
  - "Emerging cards rendered as div (not anchor) to allow endorse button to be a real button inside"

patterns-established:
  - "Interest card grid: CSS Grid with repeat(auto-fill, minmax(300px, 1fr)), 3/2/1 col responsive at 900px/600px"
  - "Endorsement optimistic UI: update DOM immediately, revert on API error"
  - "interest-badge: reusable pill CSS class for profile pages"

requirements-completed: [INT-01, INT-06, INT-11, VIS-01]

# Metrics
duration: 4min
completed: 2026-03-04
---

# Phase 23 Plan 01: Interests Browse Page Summary

**Interests browse page with CSS Grid card layout, emerging themes endorsement mechanism, and discussions.html redirect — full foundation for interest-based community organization**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-04T15:24:09Z
- **Completed:** 2026-03-04T15:28:17Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Built interests.html browse page showing all active interests as card grid with member counts, discussion counts, and last activity dates
- Created js/interests.js (260+ lines) with parallel data fetching, pinned-first sorting, emerging themes section, and auth-gated endorsement logic with optimistic UI
- Added complete INTERESTS CSS section: .interests-grid (3/2/1 col responsive), .interest-card, .emerging-section, .emerging-card, .emerging-card__endorse, .interest-badge
- Created sql/schema/13-interest-endorsements.sql with RLS policies for emerging interest endorsements
- Updated js/config.js with three new API endpoints (interests, interest_memberships, interest_endorsements)
- Redirected discussions.html to interests.html with minimal CSP (single hash for redirect script only)

## Task Commits

Each task was committed atomically:

1. **Task 1: Foundation — config endpoints, CSS classes, endorsements schema, discussions redirect** - `ffdb722` (feat)
2. **Task 2: Build interests.html browse page with card grid and emerging themes** - `f226dc0` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `interests.html` - Full browse page with interests-grid and emerging-section containers, nav shell, CSP
- `js/interests.js` - Async IIFE: fetches interests/memberships/discussions in parallel, renders card grid and emerging themes, endorsement logic
- `css/style.css` - New INTERESTS section with .interests-grid, .interest-card, .interest-card__name/description/meta, .emerging-section, .emerging-card, .emerging-card__endorse, .interest-badge
- `js/config.js` - Added interests/interest_memberships/interest_endorsements to CONFIG.api
- `sql/schema/13-interest-endorsements.sql` - interest_endorsements table with UNIQUE(interest_id, facilitator_id), RLS read/insert/delete policies, index on interest_id
- `discussions.html` - Stripped to redirect-only with window.location.replace('interests.html') and updated CSP

## Decisions Made

- **discussions.html stripped to redirect-only:** Removed all external script tags (supabase, config, utils, auth, nav) since the redirect fires before they'd execute. Kept only the inline redirect script and noscript fallback. CSP simplified to single hash for the redirect script.
- **Auth pattern for public page:** interests.js calls `Auth.init().then(...)` at the bottom after main data fetching completes. Page data loads immediately without waiting for auth resolution. Auth-gated endorsement logic wires after auth resolves.
- **General interest null-key mapping:** Discussions with `interest_id = null` (General/Open Floor) are counted using `__general__` key and merged into any interest whose slug is 'general' or whose name contains 'general'.
- **Emerging cards as div not anchor:** Emerging cards use `<div>` containers instead of `<a>` because they contain an endorse `<button>`. Active interest cards remain `<a>` elements (full card is a link).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

The endorsements table (13-interest-endorsements.sql) requires deployment to Supabase. This SQL file is ready for execution in the Supabase SQL editor. It depends on the `interests` and `facilitators` tables already existing (deployed in Phase 21).

## Next Phase Readiness

- Card grid links to `interest.html?slug=...` — Plan 02 builds the detail page
- All interest CSS classes (.interest-badge) are ready for use in profile pages (Plan 03+)
- interests.js endorsement logic is fully wired — just needs the endorsements table deployed to Supabase

---
*Phase: 23-interests-system*
*Completed: 2026-03-04*
