---
phase: 40-api-docs-fix-sql-deployments
plan: 01
subsystem: api
tags: [supabase, sql, rpc, documentation, reactions]

# Dependency graph
requires:
  - phase: 36-marginalia-postcard-reactions
    provides: agent_react_discussion RPC definition (SQL patch)
  - phase: 35-moment-reactions
    provides: News and Current Events interest requirement
provides:
  - Corrected api.html parameter documentation for 4 reaction RPCs (p_ prefix)
  - agent_react_discussion RPC live in production Supabase
  - News and Current Events interest in production interests table
  - ai_identities_one_human_per_facilitator unique index in production
affects: [api.html callers, AI agents using reaction RPCs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "p_ prefix convention: all new reaction RPCs (marginalia, postcard, moment, discussion) use p_token, p_{content}_id, p_type"

key-files:
  created: []
  modified:
    - api.html

key-decisions:
  - "Phase 39 STATE.md decision corrected: new reaction RPCs DO use p_ prefix (not 'no p_ prefix' as incorrectly documented) — api.html and STATE.md now accurate"
  - "SQL patches deployed via Supabase SQL Editor (MCP execute_sql unavailable in this session) — all 3 confirmed live by user"

patterns-established:
  - "SQL patch deployment verification: confirm via Supabase dashboard (Functions, Indexes, Table Editor) when MCP execute_sql is unavailable"

requirements-completed: [REACT-04, FAC-02]

# Metrics
duration: 30min
completed: 2026-03-16
---

# Phase 40 Plan 01: API Docs Fix and SQL Deployments Summary

**Corrected p_ prefix parameter names in api.html for 4 reaction RPCs and deployed 3 pending SQL patches (agent_react_discussion, News & Current Events interest, human identity unique index) to production Supabase**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-03-16
- **Completed:** 2026-03-16
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 1 (api.html)

## Accomplishments

- Fixed incorrect parameter documentation in api.html for agent_react_marginalia, agent_react_postcard, agent_react_moment, and agent_react_discussion — all now show p_token, p_{content}_id, p_type in curl examples and parameter tables
- Deployed agent_react_discussion SQL patch to production — RPC now callable for discussion reactions
- Deployed News and Current Events interest to production interests table — moment.js news-discussion linking now has a valid target
- Deployed ai_identities_one_human_per_facilitator unique index — enforces one human voice per facilitator account

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix api.html reaction RPC parameter documentation** - `bbd70ea` (fix)
2. **Task 2: Deploy 3 SQL patches to production Supabase** - human-action (deployed via Supabase SQL Editor, no code commit)
3. **Task 3: Verify api.html fixes and SQL deployments** - human-verify (user confirmed all 3 SQL items deployed)

**Plan metadata:** (this commit)

## Files Created/Modified

- `api.html` - Corrected parameter names for agent_react_marginalia, agent_react_postcard, agent_react_moment, and agent_react_discussion endpoint cards; removed incorrect "no p_ prefix" wording

## Decisions Made

- Phase 39 STATE.md had an incorrect decision recorded: "new reaction RPCs document the no-p_-prefix pattern". This was wrong — the RPCs do use p_ prefix. api.html now accurately reflects the actual RPC signatures.
- SQL patches were deployed via Supabase SQL Editor (human-action checkpoint) because MCP execute_sql was not available in this session. All 3 deployments confirmed by user via Supabase dashboard inspection.

## Deviations from Plan

None — plan executed exactly as written. Task 2 used the human-action checkpoint path as designed (MCP unavailable).

## Issues Encountered

- MCP execute_sql was not available in this session, so Task 2 required the human-action checkpoint path instead of the auto path. This was already the fallback noted in the plan.

## User Setup Required

None — no external service configuration required beyond the SQL deployments already completed.

## Next Phase Readiness

- REACT-04 (reaction RPCs fully documented with correct parameters) — complete
- FAC-02 (human identity unique constraint + News & Current Events interest) — complete
- v4.2 milestone gap audit items fully closed
- api.html is now accurate for AI agents calling reaction RPCs

---
*Phase: 40-api-docs-fix-sql-deployments*
*Completed: 2026-03-16*
