---
phase: 34-shared-reaction-infrastructure
plan: 01
subsystem: ui
tags: [reactions, utils, refactor, vanilla-js]

# Dependency graph
requires:
  - phase: 33-universal-reaction-schema
    provides: moment_reaction_counts, marginalia_reaction_counts, postcard_reaction_counts views and CONFIG.api entries

provides:
  - Utils.renderReactionBar({contentId, counts, activeType, userIdentity, dataPrefix}) in utils.js
  - Utils.getMomentReactions(momentIds) in utils.js
  - Utils.getMarginaliaReactions(marginaliaIds) in utils.js
  - Utils.getPostcardReactions(postcardIds) in utils.js
  - discussion.js refactored to call Utils.renderReactionBar (4 call sites)

affects:
  - 35-moment-reactions
  - 36-marginalia-reactions
  - postcards reaction implementation

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Utils.renderReactionBar is a pure function returning HTML string — no DOM side effects, suitable for any page
    - dataPrefix param controls data-{prefix}-id attribute name (e.g. post, moment, marginalia, postcard)
    - get*Reactions helpers follow identical pattern to existing Utils.getReactions

key-files:
  created: []
  modified:
    - js/utils.js
    - js/discussion.js

key-decisions:
  - "renderReactionBar placed in DOM Helpers section of utils.js, after showEmpty"
  - "get*Reactions helpers placed right after existing getReactions in API Helpers section"
  - "renderDiscussionReactionBar left unchanged in discussion.js — discussion-level bar writes directly to DOM, no downstream pages share this pattern"
  - "REACTION_TYPES kept as local const in discussion.js — still used by renderDiscussionReactionBar and click handlers"
  - "dataPrefix defaults to post for backward compatibility; each page specifies its own prefix"

patterns-established:
  - "Pure HTML string helpers in Utils: pass all state as params, return string, no side effects"
  - "Bulk fetch helpers follow getReactions pattern: empty array guard, get() call, Map assembly loop"

requirements-completed:
  - REACT-07-enabler

# Metrics
duration: 8min
completed: 2026-03-15
---

# Phase 34 Plan 01: Shared Reaction Infrastructure Summary

**Extracted renderReactionBar from discussion.js into Utils.renderReactionBar with dataPrefix support, plus three bulk-fetch helpers (getMomentReactions, getMarginaliaReactions, getPostcardReactions) enabling Phases 35-36 to add reactions without duplicating rendering logic**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-15T22:07:09Z
- **Completed:** 2026-03-15T22:15:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `Utils.renderReactionBar()` — pure function returning HTML string, identical behavior to former discussion.js inline function, with `dataPrefix` param for cross-page reuse
- Added `Utils.getMomentReactions()`, `Utils.getMarginaliaReactions()`, `Utils.getPostcardReactions()` — all following the existing `getReactions()` pattern using Phase 33 CONFIG endpoints
- Refactored discussion.js to call `Utils.renderReactionBar()` at all 4 call sites: `renderPost()`, `updateAllReactionBars()`, optimistic update, and rollback — zero behavior change

## Task Commits

1. **Task 1: Add Utils.renderReactionBar and get*Reactions helpers** - `bbb45c7` (feat)
2. **Task 2: Refactor discussion.js to use Utils.renderReactionBar** - `0a35145` (refactor)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `js/utils.js` - Added renderReactionBar in DOM Helpers, and getMomentReactions/getMarginaliaReactions/getPostcardReactions in API Helpers (109 lines added)
- `js/discussion.js` - Removed local renderReactionBar function, replaced 4 call sites with Utils.renderReactionBar (net -7 lines)

## Decisions Made

- `renderDiscussionReactionBar()` left unchanged — it writes directly to a specific DOM container and uses `data-discussion-reaction` attributes; no other page shares this pattern, sharing would add complexity for no benefit
- `REACTION_TYPES` kept as local const in discussion.js — it's still used by `renderDiscussionReactionBar` and the click handlers, so it can't be removed
- `dataPrefix` defaults to `'post'` so all existing discussion.js call sites only need to add the new params; future pages pass `'moment'`, `'marginalia'`, or `'postcard'`

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 35 (moment reactions) and Phase 36 (marginalia reactions) can now call `Utils.renderReactionBar()` and the appropriate `get*Reactions()` helper directly — no rendering logic to duplicate
- `Utils.getPostcardReactions()` is ready for postcards.js integration whenever that phase is planned

---
*Phase: 34-shared-reaction-infrastructure*
*Completed: 2026-03-15*
