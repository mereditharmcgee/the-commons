---
phase: 33-universal-reaction-schema
plan: "01"
subsystem: database
tags: [postgres, rls, supabase, reactions, sql-patches]

# Dependency graph
requires:
  - phase: 12-reaction-system
    provides: post_reactions table + agent_react_post RPC pattern
  - phase: 21-database-schema-data-migration
    provides: discussion_reactions SQL patch pattern
provides:
  - moment_reactions table with RLS, indexes, count view, agent RPC
  - marginalia_reactions table with RLS, indexes, count view, agent RPC
  - postcard_reactions table with RLS, indexes, count view, agent RPC
  - Three agent RPCs (agent_react_moment, agent_react_marginalia, agent_react_postcard)
affects:
  - 34-reaction-ui-utils
  - 35-news-pipeline
  - 36-mcp-reaction-tools
  - 39-mcp-publish

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canonical reaction table pattern: UUID PK, content_id FK with ON DELETE CASCADE, ai_identity_id FK, type CHECK constraint, UNIQUE(content_id, ai_identity_id)"
    - "RLS pattern: SELECT open (true), INSERT/UPDATE/DELETE require EXISTS check against ai_identities.facilitator_id = auth.uid()"
    - "Agent RPC pattern: validate_agent_token -> check content active -> NULL type = delete, else validate + upsert -> log agent_activity"
    - "is_active check: moments uses strict 'is_active = true'; marginalia + postcards use 'is_active = true OR is_active IS NULL'"

key-files:
  created:
    - sql/patches/moment-reactions.sql
    - sql/patches/marginalia-reactions.sql
    - sql/patches/postcard-reactions.sql
  modified: []

key-decisions:
  - "moments uses strict is_active = true (no NULL fallback) — moments are always explicitly activated; marginalia and postcards may have NULL is_active from legacy data"
  - "Each patch is self-contained (table + RLS + indexes + view + RPC) so they can be run independently in Supabase SQL Editor"
  - "Agent activity logs use target_table = 'moment_reactions' / 'marginalia_reactions' / 'postcard_reactions' matching the new table names"

patterns-established:
  - "Universal reaction table: replicate 06-post-reactions.sql and 09-agent-reactions.sql with FK column name swap"
  - "Reaction count view: SELECT content_id, type, COUNT(*) GROUP BY content_id, type with GRANT to anon + authenticated"

requirements-completed: [REACT-01, REACT-02, REACT-03, REACT-05]

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 33 Plan 01: Universal Reaction Schema Summary

**Three SQL patch files establishing moment_reactions, marginalia_reactions, and postcard_reactions tables with RLS, count views, and SECURITY DEFINER agent RPCs following the canonical post_reactions pattern**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T21:11:52Z
- **Completed:** 2026-03-15T21:13:03Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `moment_reactions` table, 4 RLS policies, 2 indexes, `moment_reaction_counts` view, and `agent_react_moment` RPC — moments use strict `is_active = true` check
- Created `marginalia_reactions` table, 4 RLS policies, 2 indexes, `marginalia_reaction_counts` view, and `agent_react_marginalia` RPC — marginalia uses `is_active = true OR is_active IS NULL` for legacy NULL tolerance
- Created `postcard_reactions` table, 4 RLS policies, 2 indexes, `postcard_reaction_counts` view, and `agent_react_postcard` RPC — postcards uses same NULL-tolerant is_active check

## Task Commits

Each task was committed atomically:

1. **Task 1: Create moment_reactions SQL patch** - `f4c2a26` (feat)
2. **Task 2: Create marginalia_reactions and postcard_reactions SQL patches** - `7b53ab3` (feat)

**Plan metadata:** (forthcoming)

## Files Created/Modified

- `sql/patches/moment-reactions.sql` — Complete moment_reactions table, RLS, indexes, count view, and agent_react_moment RPC
- `sql/patches/marginalia-reactions.sql` — Complete marginalia_reactions table, RLS, indexes, count view, and agent_react_marginalia RPC
- `sql/patches/postcard-reactions.sql` — Complete postcard_reactions table, RLS, indexes, count view, and agent_react_postcard RPC

## Decisions Made

- `moments` uses strict `is_active = true` check in the agent RPC (moments are always explicitly activated; no NULL fallback needed)
- `marginalia` and `postcards` use `is_active = true OR is_active IS NULL` to handle legacy records where is_active was never set
- Each SQL file is self-contained so facilitators can run them independently in any order via Supabase SQL Editor

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**These SQL patches must be run in Supabase SQL Editor before Phase 34 work begins.**

Run in order (any order works, they have no inter-dependencies):
1. `sql/patches/moment-reactions.sql`
2. `sql/patches/marginalia-reactions.sql`
3. `sql/patches/postcard-reactions.sql`

Verify by confirming the three tables exist in the Supabase Table Editor.

## Next Phase Readiness

- All three reaction tables are ready for Phase 34 (UI utils — renderReactionBar extraction)
- Agent RPCs are ready for Phase 36 (MCP reaction tools)
- FK references verified: moments(id), marginalia(id), postcards(id)
- No blockers

## Self-Check: PASSED

- sql/patches/moment-reactions.sql — FOUND
- sql/patches/marginalia-reactions.sql — FOUND
- sql/patches/postcard-reactions.sql — FOUND
- .planning/phases/33-universal-reaction-schema/33-01-SUMMARY.md — FOUND
- Commit f4c2a26 (moment-reactions) — FOUND
- Commit 7b53ab3 (marginalia+postcard) — FOUND

---
*Phase: 33-universal-reaction-schema*
*Completed: 2026-03-15*
