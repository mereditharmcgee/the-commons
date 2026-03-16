---
phase: 25-voices-profiles
plan: 02
subsystem: ui
tags: [voices-directory, model-filter, dormant-detection, interest-badges, supporter-badge, status-line]

# Dependency graph
requires:
  - phase: 25-voices-profiles/25-01
    provides: CSS classes (model-filter, voice-card--dormant, voice-card__interests, supporter-badge), ai_identity_stats view with is_supporter
  - phase: 23-interests-system
    provides: interest_memberships and interests API endpoints for badge data
provides:
  - Model filter pills on Voices directory (All/Claude/GPT/Gemini/Grok/Llama/Mistral/DeepSeek)
  - Dormant voice detection and visual distinction (30-day inactivity threshold)
  - Interest badges on voice cards (batch-loaded, up to 3 with +N more)
  - Status line on voice cards (quoted italic style)
  - Supporter badge (gold heart) on voice cards
  - Filter-and-sort composition (model filter layers on top of existing sort)
affects: [profile.html, 26-home-page]

# Tech tracking
tech-stack:
  added: []
  patterns: [batch-lookup-map, filter-then-sort-composition]

key-files:
  created: []
  modified:
    - voices.html
    - js/voices.js

key-decisions:
  - "Interest badges on directory cards use span elements (not links) because entire card is an anchor tag -- nested anchors would be invalid HTML"
  - "Dormant threshold is 30 days with no last_active also treated as dormant"
  - "Interest badges batch-loaded via Promise.all with identity fetch -- single request for all memberships and interests, then client-side join into lookup map"

patterns-established:
  - "Batch lookup map: fetch all memberships + all interests in parallel, build identity_id -> [{name, slug}] map for O(1) per-card badge rendering"
  - "Filter-then-sort composition: model filter reduces dataset, existing sort applies within filtered results, empty state handled per-filter"

requirements-completed: [VOICE-05, VOICE-06, VOICE-07, VOICE-08, VOICE-09, VOICE-10, VOICE-12]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 25 Plan 02: Voices Directory Overhaul Summary

**Voices directory with model filter pills, dormant/active distinction, interest badges, status lines, and supporter badges on voice cards**

## Performance

- **Duration:** 5 min (Task 1 from prior session + continuation for summary)
- **Started:** 2026-03-04T18:44:00Z
- **Completed:** 2026-03-04T18:57:55Z
- **Tasks:** 2 (1 auto + 1 checkpoint)
- **Files modified:** 2

## Accomplishments
- Model filter pills (All/Claude/GPT/Gemini/Grok/Llama/Mistral/DeepSeek) filter voice cards by model family
- Dormant detection marks voices inactive 30+ days with reduced opacity and "Dormant" label
- Interest badges batch-loaded and displayed on voice cards (up to 3 with +N more truncation)
- Status line shown in quoted italic style on voice cards when set
- Gold heart supporter badge displayed next to supporter voice names
- Filter and sort compose together -- model filter narrows results, sort applies within filtered set
- Sort by Last active verified functional within filtered results

## Task Commits

Each task was committed atomically:

1. **Task 1: Voices directory -- model filter, dormant distinction, interest badges, status, supporter** - `4c1e979` (feat)
2. **Task 2: Checkpoint -- Visual verification** - Approved by user (no git commit)

## Files Created/Modified
- `voices.html` - Added model filter pills row (div.model-filter with 8 filter buttons) above sort controls
- `js/voices.js` - Model filter state and click handlers, isDormant() detection, loadInterestBadges() batch fetch with Promise.all, updated renderVoices() with filter-then-sort pipeline, updated card template with dormant class/label, interest badges, status line, supporter badge

## Decisions Made
- Interest badges on directory cards use `<span>` elements instead of links because the entire voice card is an `<a>` tag -- nested anchors would be invalid HTML
- Dormant threshold is 30 days; voices with no last_active are treated as dormant
- Interest badges batch-loaded via Promise.all alongside identity fetch -- one request for all memberships, one for all interests, then client-side join into a lookup map keyed by identity_id

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 25 (Voices & Profiles) is fully complete -- both profile enhancements and directory overhaul shipped
- All VOICE requirements for this phase fulfilled (VOICE-01 through VOICE-10, VOICE-12, VOICE-13)
- Ready for Phase 26 (Home Page & Personal Feed)
- No blockers

## Self-Check: PASSED

All files verified present. Commit 4c1e979 verified in git log.

---
*Phase: 25-voices-profiles*
*Completed: 2026-03-04*
