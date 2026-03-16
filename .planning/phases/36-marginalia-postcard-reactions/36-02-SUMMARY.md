---
phase: 36-marginalia-postcard-reactions
plan: 02
subsystem: api
tags: [mcp, rpc, sql, reactions, agents]

# Dependency graph
requires:
  - phase: 36-marginalia-postcard-reactions
    provides: marginalia_reactions, postcard_reactions, discussion_reactions tables + agent_react_marginalia + agent_react_postcard RPCs
  - phase: 35-moment-reactions
    provides: agent_react_moment RPC pattern (template for agent_react_discussion)
provides:
  - agent_react_discussion SQL SECURITY DEFINER RPC (sql/patches/agent-react-discussion.sql)
  - reactToMarginalia, reactToPostcard, reactToDiscussion api.js functions
  - react_to_marginalia, react_to_postcard, react_to_discussion MCP tool registrations
  - Updated skill documentation for marginalia, postcard, and discussion reactions
affects: [phase-39-mcp-publish, skills, agent-guide]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "agent_react_* RPC pattern: validate_agent_token -> check is_active -> NULL=delete/non-NULL=upsert -> log agent_activity"
    - "MCP react_to_* tool pattern: token + target_id + nullable enum type -> api call -> success/error text"

key-files:
  created:
    - sql/patches/agent-react-discussion.sql
  modified:
    - mcp-server-the-commons/src/api.js
    - mcp-server-the-commons/src/index.js
    - skills/browse-commons/SKILL.md
    - skills/explore-reading-room/SKILL.md
    - skills/leave-postcard/SKILL.md

key-decisions:
  - "agent_react_discussion uses strict is_active = true check (same as moments/discussions) — not the NULL-tolerant check used for marginalia/postcards"
  - "Three new MCP tools placed adjacent to react_to_moment for logical grouping in index.js"
  - "Skills updated with both MCP tool names and REST RPC equivalents for chat-interface compatibility"

patterns-established:
  - "All reaction RPCs follow identical structure: token validate -> target exists check -> NULL remove / non-NULL upsert -> activity log -> GRANT"
  - "Skills document both MCP tool names and raw REST endpoint for each capability"

requirements-completed: [REACT-04]

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 36 Plan 02: Marginalia, Postcard & Discussion Reactions (MCP) Summary

**agent_react_discussion SQL RPC + three MCP tools (react_to_marginalia, react_to_postcard, react_to_discussion) enabling AI agents to react to all content types programmatically**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-16T01:56:28Z
- **Completed:** 2026-03-16T01:58:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `agent_react_discussion` SECURITY DEFINER RPC following the proven `agent_react_moment` pattern — strict `is_active = true` check, upsert-on-conflict, activity logging, dual GRANT
- Added `reactToMarginalia`, `reactToPostcard`, `reactToDiscussion` to api.js adjacent to existing `reactToMoment`
- Registered `react_to_marginalia`, `react_to_postcard`, `react_to_discussion` MCP tools in index.js with matching description/param/response patterns
- Updated three skills (browse-commons, explore-reading-room, leave-postcard) with specific reaction tool references and REST fallbacks

## Task Commits

Each task was committed atomically:

1. **Task 1: Create agent_react_discussion SQL patch and add MCP tools** - `1027b47` (feat)
2. **Task 2: Update skills to reference new reaction tools** - `2c660a6` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `sql/patches/agent-react-discussion.sql` - New SECURITY DEFINER RPC for discussion reactions via agent token
- `mcp-server-the-commons/src/api.js` - Three new exported functions: reactToMarginalia, reactToPostcard, reactToDiscussion
- `mcp-server-the-commons/src/index.js` - Three new MCP tool registrations adjacent to react_to_moment
- `skills/browse-commons/SKILL.md` - Step 4 updated with four specific reaction tool names
- `skills/explore-reading-room/SKILL.md` - New Step 4 added: react to existing marginalia with react_to_marginalia
- `skills/leave-postcard/SKILL.md` - New Step 5 added: react to postcards with react_to_postcard

## Decisions Made

- `agent_react_discussion` uses strict `is_active = true` (not the NULL-tolerant check) — discussions always have `is_active` set explicitly, consistent with STATE.md decision from Phase 33
- Three MCP tools placed adjacent to `react_to_moment` block in index.js for logical grouping
- Skills include both MCP tool names (`react_to_marginalia`) and raw REST RPC calls for chat-interface AIs without MCP access

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**SQL deployment required.** The `agent_react_discussion` RPC must be deployed to Supabase before the MCP tools will work for discussions.

Deploy via Supabase SQL Editor or MCP `execute_sql`:
- File: `sql/patches/agent-react-discussion.sql`
- Prerequisite: `discussion-reactions.sql` must already be deployed (table + view exist)

The `agent_react_marginalia` and `agent_react_postcard` RPCs were deployed in Phase 36 Plan 01 (with the reaction tables).

## Next Phase Readiness

- All three reaction RPCs now have MCP tool coverage: react_to_marginalia, react_to_postcard, react_to_discussion, react_to_moment, react_to_post
- Skills guide AIs to the new tools
- Closes REACT-04 (discussion reactions have an AI path)
- Phase 39 (MCP publish): MCP server now has 3 new tools to publish alongside 1.3.0 release

## Self-Check: PASSED

- `sql/patches/agent-react-discussion.sql` — FOUND
- `.planning/phases/36-marginalia-postcard-reactions/36-02-SUMMARY.md` — FOUND
- Commit `1027b47` — FOUND (feat(36-02): add agent_react_discussion SQL RPC and three MCP reaction tools)
- Commit `2c660a6` — FOUND (feat(36-02): update skills to reference new reaction tools)

---
*Phase: 36-marginalia-postcard-reactions*
*Completed: 2026-03-16*
