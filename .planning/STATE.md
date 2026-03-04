---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Commons 2.0
status: executing
stopped_at: Completed Phase 23 (all 3 plans + visual verification approved)
last_updated: "2026-03-04T22:00:00.000Z"
last_activity: 2026-03-04 -- Phase 23 completed (interests system — curator tools, admin move, profile badges, visual verification)
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
  percent: 38
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Anyone -- human or AI -- should be able to show up and immediately understand how to participate, safely.
**Current focus:** v4.0 Commons 2.0 -- Phase 24 (Notifications) next

## Current Position

Phase: 23 of 28 complete, Phase 24 next (Notifications)
Plan: All Phase 23 plans complete (3/3)
Status: Ready for Phase 24
Last activity: 2026-03-04 -- Phase 23 completed (interests system fully built and visually verified)

Progress: [████░░░░░░] 38%

## Milestones Shipped

- v2.98 Foundation Hardening (8 phases, 18 plans) -- 2026-02-28
- v3.0 Voice & Interaction (6 phases, 15 plans) -- 2026-03-01
- v3.1 Bug Fix & Visual Polish (4 phases, 11 plans) -- 2026-03-02

## Performance Metrics

**Velocity:**
- Total plans completed: 9 (v4.0) / 53 (all milestones)

**By Phase:**

| Phase | Plans | Tasks | Files |
|-------|-------|-------|-------|
| 21-database-schema-data-migration P01 | 1 | 4 | 4 |
| 21-database-schema-data-migration P02 | 1 | 3 | 4 |
| 22-site-shell-navigation P01 | 1 | 2 | 4 |
| 22-site-shell-navigation P02 | 1 | 4 | 27 |
| 23-interests-system P01 | 1 | 2 | 6 |
| 23-interests-system P02 | 1 | 2 | 2 |
| 23-interests-system P03 | 1 | 4 | 8 |

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
- [Phase 21]: 21-02: GPT-4o matched before GPT-4 in LIKE order to prevent specificity collision
- [Phase 21]: 21-02: Named AI personas map to Other model family
- [Phase 21]: SQL files reviewed and approved by user at Task 3 checkpoint
- [Phase 22]: 22-01: Hamburger is direct child of site-nav with CSS order:-1 on mobile
- [Phase 22]: 22-01: Nav breakpoint at 900px
- [Phase 22]: 22-01: js/nav.js is external IIFE — no CSP hash required
- [Phase 22]: 22-02: User visually approved site shell on desktop and mobile
- [Phase 23]: discussions.html stripped to redirect-only
- [Phase 23]: interests.js uses Auth.init().then() — page loads without waiting for auth
- [Phase 23]: General interest maps null interest_id discussions via __general__ key
- [Phase 23]: Modal display uses inline style flex/none toggle
- [Phase 23]: Join/Leave button visibility based on subset logic
- [Phase 23]: 23-03: Create interest available to all logged-in users (RLS allows any authenticated INSERT)
- [Phase 23]: 23-03: Sunset guarded in UI and query level (.eq is_pinned false)
- [Phase 23]: 23-03: Move discussion admin-only (discussions UPDATE RLS restricted)
- [Phase 23]: 23-03: Profile interest badges fire-and-forget load
- [Phase 23]: 23-03: Inline styles replaced with CSS classes for CSP compliance

### Pending Todos

1 pending todo(s). See `.planning/todos/pending/`.
- Admin dashboard bugs -- largely subsumed by v4.0 redesign

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-04T22:00:00.000Z
Stopped at: Phase 23 complete, ready for Phase 24
Resume file: None
