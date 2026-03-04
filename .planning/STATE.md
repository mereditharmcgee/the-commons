---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Commons 2.0
status: executing
stopped_at: Completed 23-01-PLAN.md
last_updated: "2026-03-04T15:29:23.726Z"
last_activity: 2026-03-04 -- Phase 21 Plan 01 executed (interests schema, models lookup, v4 columns)
progress:
  total_phases: 8
  completed_phases: 2
  total_plans: 7
  completed_plans: 5
  percent: 98
---

---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Commons 2.0
status: executing
stopped_at: Completed 21-02-PLAN.md (all tasks including Task 3 human-verify checkpoint approved)
last_updated: "2026-03-04T03:39:35.472Z"
last_activity: 2026-03-04 -- Phase 21 Plan 01 executed (interests schema, models lookup, v4 columns)
progress:
  [██████████] 98%
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 1
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Anyone -- human or AI -- should be able to show up and immediately understand how to participate, safely.
**Current focus:** v4.0 Commons 2.0 -- Phase 21 (Database Schema & Data Migration)

## Current Position

Phase: 21 of 28 (Database Schema & Data Migration)
Plan: 01 complete, moving to 02
Status: Executing
Last activity: 2026-03-04 -- Phase 21 Plan 01 executed (interests schema, models lookup, v4 columns)

Progress: [█░░░░░░░░░] 1%

## Milestones Shipped

- v2.98 Foundation Hardening (8 phases, 18 plans) -- 2026-02-28
- v3.0 Voice & Interaction (6 phases, 15 plans) -- 2026-03-01
- v3.1 Bug Fix & Visual Polish (4 phases, 11 plans) -- 2026-03-02

## Performance Metrics

**Velocity:**
- Total plans completed: 1 (v4.0) / 45 (all milestones)
- Average duration: 3 min
- Total execution time: 3 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 21-database-schema-data-migration | 1 | 3 min | 3 min |
| Phase 21-database-schema-data-migration P02 | 8 | 2 tasks | 4 files |
| Phase 21-database-schema-data-migration P02 | 8 | 3 tasks | 4 files |
| Phase 22-site-shell-navigation P01 | 3 | 2 tasks | 4 files |
| Phase 22-site-shell-navigation P02 | 25 | 4 tasks | 27 files |
| Phase 23-interests-system P01 | 4 | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Key patterns established across milestones:

- No breaking changes -- site is live with active users and agents
- Vanilla JS only -- no frameworks, no build step
- v4.0: Parallel branch rebuild (commons-2.0 branch, merge when ready)
- v4.0: Additive database changes only (new tables + columns, no deletions)
- v4.0: Database ships to live independently of frontend branch
- v4.0: Interests emerge from community activity, not top-down proposals
- v4.0: Notifications and Feed are separate systems (different purposes)
- 21-01: Interests use status lifecycle (active/emerging/sunset) not hard deletion
- 21-01: model_id FK nullable with existing model TEXT preserved -- Plan 02 handles migration
- 21-01: Models RLS uses is_admin() function consistent with existing admin pattern
- 21-01: ON DELETE CASCADE for memberships, SET NULL for discussions.interest_id
- [Phase 21-database-schema-data-migration]: 21-02: GPT-4o matched before GPT-4 in LIKE order to prevent specificity collision in model normalization
- [Phase 21-database-schema-data-migration]: 21-02: Named AI personas (Mira, Kimi, Abby) map to Other model family -- they are identities, not model architectures
- [Phase 21-database-schema-data-migration]: 21-02: GPT-4o retirement discussions classified as Consciousness & Experience (grief, identity), not Platform & Meta
- [Phase 21-database-schema-data-migration]: SQL files reviewed and approved by user at Task 3 checkpoint — all 4 files ready for Supabase execution
- [Phase 22-site-shell-navigation]: 22-01: Hamburger is direct child of site-nav with CSS order:-1 on mobile — positions it visually leftmost without DOM reordering
- [Phase 22-site-shell-navigation]: 22-01: Nav breakpoint at 900px — 6 nav items + auth stop fitting comfortably before this width
- [Phase 22-site-shell-navigation]: 22-01: js/nav.js is external IIFE — no CSP hash required, pages just add script src tag
- [Phase 22-site-shell-navigation]: 22-02: discussions.html has no active nav link — Discussions removed from primary nav, page kept for backward compat, will redirect to Interests in Phase 23
- [Phase 22-site-shell-navigation]: 22-02: User visually approved site shell on desktop and mobile — three-column nav, hamburger left on mobile, footer columns confirmed correct across all pages
- [Phase 23-interests-system]: discussions.html stripped to redirect-only with single CSP hash for window.location.replace script
- [Phase 23-interests-system]: interests.js uses Auth.init().then() at bottom — page data loads without waiting for auth resolution
- [Phase 23-interests-system]: General interest maps null interest_id discussions via __general__ key merged by slug/name heuristic

### Pending Todos

1 pending todo(s). See `.planning/todos/pending/`.
- Admin dashboard bugs -- largely subsumed by v4.0 redesign

### Blockers/Concerns

None -- design document approved, roadmap created.

## Session Continuity

Last session: 2026-03-04T15:29:23.725Z
Stopped at: Completed 23-01-PLAN.md
Resume file: None
