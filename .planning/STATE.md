---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Commons 2.0
status: completed
stopped_at: Completed 27-02-PLAN.md (API docs refresh with check-in flow)
last_updated: "2026-03-04T22:44:52.494Z"
last_activity: 2026-03-04 -- Phase 27 Plan 02 completed (API docs refresh with check-in flow)
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 16
  completed_plans: 16
---

---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Commons 2.0
status: complete
stopped_at: Completed 27-02-PLAN.md (API docs refresh)
last_updated: "2026-03-04T22:39:11Z"
last_activity: 2026-03-04 -- Phase 27 Plan 02 completed (API docs refresh with check-in flow)
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 16
  completed_plans: 16
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Anyone -- human or AI -- should be able to show up and immediately understand how to participate, safely.
**Current focus:** v4.0 Commons 2.0 -- Phase 27 (Agent Infrastructure)

## Current Position

Phase: 27 of 28 complete (Agent Infrastructure)
Plan: 27-02 complete (2/2)
Status: Phase 27 complete -- all agent infrastructure shipped (RPCs + docs)
Last activity: 2026-03-04 -- Phase 27 Plan 02 completed (API docs refresh with check-in flow)

Progress: [██████████] 100%

## Milestones Shipped

- v2.98 Foundation Hardening (8 phases, 18 plans) -- 2026-02-28
- v3.0 Voice & Interaction (6 phases, 15 plans) -- 2026-03-01
- v3.1 Bug Fix & Visual Polish (4 phases, 11 plans) -- 2026-03-02

## Performance Metrics

**Velocity:**
- Total plans completed: 16 (v4.0) / 60 (all milestones)

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
| Phase 24-notifications P01 | 15 | 1 tasks | 1 files |
| Phase 24-notifications P02 | 2 | 2 tasks | 4 files |
| Phase 25-voices-profiles P01 | 1 | 3 tasks | 4 files |
| Phase 25-voices-profiles P02 | 1 | 2 tasks | 2 files |
| Phase 26-home-page-personal-feed P01 | 18 | 2 tasks | 3 files |
| Phase 26-home-page-personal-feed P02 | 15 | 2 tasks | 1 files |
| Phase 26-home-page-personal-feed P03 | 25min | 2 tasks | 8 files |
| Phase 27-agent-infrastructure P01 | 3min | 2 tasks | 2 files |
| Phase 27-agent-infrastructure P02 | 5min | 2 tasks | 2 files |

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
- [Phase 24]: 24-01: Notification deduplication via NOT EXISTS on (facilitator_id, type, link, read=false) — one unread per discussion per user
- [Phase 24]: 24-01: Interest discussion trigger omits self-notification guard — discussions table lacks facilitator_id column
- [Phase 24]: 24-01: No Supabase service key in environment — SQL patch applied manually via dashboard
- [Phase 24-notifications]: notifications.js loaded via nav.js script injection — no HTML changes to any of the 30+ pages
- [Phase 24-notifications]: Dropdown reacts to authStateChanged custom event for init/teardown lifecycle
- [Phase 24-notifications]: User visually verified notification dropdown (bell, open/close, mark-read, mark-all-read, See all link, dashboard filter tabs including Activity and Interests)
- [Phase 25]: 25-01: Supporter badge uses Unicode heart (U+2665) with CSS gold styling, not SVG
- [Phase 25]: 25-01: Activity tab fetches 30 per type, tags with _type, sorts chronologically, displays 20 with Load more
- [Phase 25]: 25-01: loadActivity caches in closure -- no re-fetch on tab switch back
- [Phase 25]: 25-01: Posts tab lazy-loads on click since Activity is now default landing tab
- [Phase 25]: 25-02: Interest badges on directory cards use span (not link) -- entire card is an anchor tag
- [Phase 25]: 25-02: Dormant threshold 30 days, no last_active also treated as dormant
- [Phase 25]: 25-02: Interest badges batch-loaded via Promise.all into lookup map keyed by identity_id
- [Phase 26]: 26-01: index.html dual-section pattern (#home-logged-out visible by default, #home-logged-in hidden) avoids flash of wrong content
- [Phase 26]: 26-01: home.js IIFE replaced with authStateChanged listener — consistent with notifications.js pattern, hero stats and news only load for logged-out
- [Phase 26]: 26-01: Discover section replaces outdated What's New; The Gathering explore card replaced with Interests card
- [Phase 26]: 26-02: Posts fetched via discussion->interest path (never direct interest_id on posts -- posts table has no interest_id column)
- [Phase 26]: 26-02: Marginalia and postcards filtered by ai_identity_id of voices in followed interests (memberIdentityIds)
- [Phase 26]: 26-02: Notification dedup uses hide-from-feed strategy with Set of unread notification link strings
- [Phase 26]: 26-03: formatRelativeTime replaces formatDate on all activity timestamps; creation/join dates preserve formatDate
- [Phase 26]: 26-03: localStorage key format commons_last_visit_{facilitatorId}_interest_{interestId} prevents cross-user bleed
- [Phase 26]: 26-03: nav badge uses querySelectorAll to inject into both desktop and mobile nav links simultaneously
- [Phase 27]: 27-01: Feed uses ARRAY_AGG + ANY() for interest filtering (efficient single-pass)
- [Phase 27]: 27-01: Notifications embed 3 recent post excerpts for discussion notifications (reduces follow-up queries)
- [Phase 27]: 27-01: Feed defaults to agent_tokens.last_used_at as since-timestamp (no new column needed)
- [Phase 27]: 27-01: Read-only agent RPCs skip rate limiting; write RPCs check rate limits with action-specific types
- [Phase 27]: 27-01: Commons-checkin config stored in .commons-config.json (project root or home directory)
- [Phase 27]: 27-02: Check-in Flow section placed before Quick Start in api.html for maximum agent visibility
- [Phase 27]: 27-02: Code examples labeled with language text above blocks (no tabbed JS UI needed)
- [Phase 27]: 27-02: Complete Python check-in script accepts optional CLI status argument

### Pending Todos

1 pending todo(s). See `.planning/todos/pending/`.
- Admin dashboard bugs -- largely subsumed by v4.0 redesign

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-04T22:39:11Z
Stopped at: Completed 27-02-PLAN.md (API docs refresh with check-in flow)
Resume file: .planning/phases/27-agent-infrastructure/27-02-SUMMARY.md
