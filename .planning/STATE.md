---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: Platform Cohesion
status: active
stopped_at: Completed 37-02-PLAN.md
last_updated: "2026-03-16T02:50:06.871Z"
last_activity: 2026-03-16 -- Phase 35 Plan 01 executed (moment reactions + linked discussion UI + admin create-discussion)
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 10
  completed_plans: 10
  percent: 99
---

---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: Platform Cohesion
status: active
stopped_at: Completed 35-02-PLAN.md
last_updated: "2026-03-16T00:32:03.724Z"
last_activity: 2026-03-15 -- Roadmap created for v4.2
progress:
  [██████████] 99%
  completed_phases: 2
  total_plans: 6
  completed_plans: 4
---

---
gsd_state_version: 1.0
milestone: v4.2
milestone_name: Platform Cohesion
status: active
stopped_at: Roadmap created — ready to plan Phase 33
last_updated: "2026-03-15T19:30:00Z"
last_activity: 2026-03-15 -- v4.2 roadmap created (7 phases, 43 requirements)
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Anyone -- human or AI -- should be able to show up and immediately understand how to participate, safely.
**Current focus:** v4.2 Platform Cohesion — Phase 33: Universal Reaction Schema

## Current Position

Phase: 35 of 39 (Moment Reactions News Engagement Pipeline)
Plan: 01 of 1 complete
Status: Phase 35 Plan 01 complete
Last activity: 2026-03-16 -- Phase 35 Plan 01 executed (moment reactions + linked discussion UI + admin create-discussion)

Progress: ████░░░░░░ 40%

## Milestones Shipped

- v2.98 Foundation Hardening (8 phases, 18 plans) -- 2026-02-28
- v3.0 Voice & Interaction (6 phases, 15 plans) -- 2026-03-01
- v3.1 Bug Fix & Visual Polish (4 phases, 11 plans) -- 2026-03-02
- v4.0 Commons 2.0 (8 phases, 18 plans) -- 2026-03-05
- v4.1 AI Participation Audit (4 phases, 9 plans) -- 2026-03-15

## Accumulated Context

### Decisions

- v4.2 scope: full engagement gap audit + fix, not audit-then-fix-later
- Facilitators are first-class participants, not just operators
- Reactions extend to all content types (moments, marginalia, postcards) using named utils variants — not a signature change to existing post-reaction callers
- Extract renderReactionBar to utils.js BEFORE adding reactions to new pages (Phase 34 gate)
- MCP publish is last gate — RPCs must be confirmed in production before npm publish
- Human identity participates via ai_identity_id (model = 'human'), not bare facilitator_id — preserves stats, notifications, profile queries
- News MCP tools enable, not automate — no auto-creating discussions from moments
- Dashboard polish starts with smoke test checklist, not redesign
- [Phase 33-universal-reaction-schema]: moments uses strict is_active = true check; marginalia and postcards use is_active = true OR IS NULL for legacy NULL tolerance
- [Phase 33-universal-reaction-schema]: Each SQL patch is self-contained (table + RLS + indexes + view + RPC) for independent Supabase deployment
- [Phase 33-universal-reaction-schema]: SQL patches deployed to Supabase via MCP execute_sql — all three tables, views, and RPCs confirmed live in production
- [Phase 33-universal-reaction-schema]: CONFIG.api entries follow existing post_reactions pattern — 6 entries added after discussion_reaction_counts in js/config.js
- [Phase 34-shared-reaction-infrastructure]: Utils.renderReactionBar is a pure function with dataPrefix param enabling cross-page reuse without duplicating rendering logic
- [Phase 34-shared-reaction-infrastructure]: renderDiscussionReactionBar left unchanged in discussion.js — discussion-level bar writes directly to DOM, no downstream pages share this pattern
- [Phase 35-moment-reactions]: Admin check on moment page queries admins table after authReady (two-phase render: count-only first, interactive after auth resolves)
- [Phase 35-moment-reactions]: "News & Current Events" interest fetched by name at runtime in both admin.js and moment.js — no hardcoded UUID; graceful error if interest missing
- [Phase 35-moment-reactions]: Reaction toggle uses delete-then-insert pattern (not upsert header) for clarity; same-type click removes, different-type upserts
- [Phase 35]: browse_moments and get_moment are read-only (no auth), react_to_moment requires token — consistent with existing tool grouping patterns
- [Phase 35-moment-reactions-news-engagement-pipeline]: News engagement skill presents reactions and discussions as equally valid forms of participation — no hierarchy between reacting and joining a discussion
- [Phase 35-moment-reactions-news-engagement-pipeline]: Skills reference MCP tool names alongside REST fallbacks for chat-interface compatibility
- [Phase 36-marginalia-postcard-reactions]: agent_react_discussion uses strict is_active = true check (same as moments) — not NULL-tolerant check used for marginalia/postcards
- [Phase 36-marginalia-postcard-reactions]: Three new MCP tools (react_to_marginalia, react_to_postcard, react_to_discussion) placed adjacent to react_to_moment for logical grouping
- [Phase 36-marginalia-postcard-reactions]: renderPostcards() made async in postcards.js — all pagination and filter callers updated to await, ensuring reaction bars always render after counts are fetched
- [Phase 36-marginalia-postcard-reactions]: Postcard Copy Context includes reaction counts (only types with count > 0) formatted as reactions: (nod: N, resonance: N)
- [Phase 37-facilitator-as-participant]: Human voice stored as ai_identities row with model='human' — same table as AI identities, preserves stats/notifications/profile queries
- [Phase 37-facilitator-as-participant]: tc_preferred_identity_id localStorage key: set on human voice create/edit, cleared on deactivate — all posting form dropdowns auto-select using this key
- [Phase 37-facilitator-as-participant]: Guestbook catch_up entries lack model field — human guestbook items cannot be flagged with (human) tag; documented inline
- [Phase 37-facilitator-as-participant]: Human voice filter in voices directory works via generic Utils.getModelClass() — no JS changes needed

### Pending Todos

1 pending todo(s). See `.planning/todos/pending/`.
- MCP server npm publish (1.1.0 -> 1.3.0) -- carried from v4.1; superseded by v4.2 Phase 39 target of 1.2.0

### Blockers/Concerns

- Phase 37 (facilitator identity): verify whether a CHECK constraint exists on `model` column in `ai_identities` before implementation — if it does, `model = 'human'` inserts need a migration
- Phase 35 (news pipeline): confirm `agent_create_discussion` uses named parameters (not positional) before adding `p_moment_id` parameter
- Phase 39 (MCP publish): plan for a session with 2FA OTP access confirmed before attempting npm publish

## Session Continuity

Last session: 2026-03-16T02:50:06.868Z
Stopped at: Completed 37-02-PLAN.md
Resume file: None
