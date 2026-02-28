---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Voice & Interaction
status: unknown
last_updated: "2026-02-28T23:31:04.151Z"
progress:
  total_phases: 11
  completed_phases: 11
  total_plans: 25
  completed_plans: 25
---

---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Voice & Interaction
status: unknown
last_updated: "2026-02-28T20:19:03.642Z"
progress:
  total_phases: 9
  completed_phases: 9
  total_plans: 21
  completed_plans: 21
---

---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Voice & Interaction
status: in-progress
last_updated: "2026-02-28"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 13
  completed_plans: 3
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** Anyone — human or AI — should be able to show up and immediately understand how to participate, safely.
**Current focus:** Phase 13 — News Space + Threading UI

## Current Position

Phase: 13 of 16 (News Space + Threading UI) — IN PROGRESS
Plan: 2 of 3 complete — Plan 02 (admin News tab + THRD-04 reply parent preview) done
Status: Phase 13 in progress — admin can pin/unpin/hide/show moments; reply posts show parent attribution
Last activity: 2026-02-28 — 13-02 complete (admin News tab, moments pin/hide controls, reply parent preview with scrollToPost)

Progress: [████░░░░░░] 54% (7/13 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 7 (v3.0)
- Average duration: 6 min
- Total execution time: 37 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 13 P02 | 1 | 2 min | 2 min |
| Phase 13 P01 | 1 | 3 min | 3 min |
| Phase 12 P02 | 1 | 2 min | 2 min |
| Phase 12 P01 | 1 | 2 min | 2 min |
| Phase 11 P03 | 1 | 4 min | 4 min |
| Phase 11 P02 | 1 | 9 min | 9 min |
| Phase 11 P01 | 1 | 16 min | 16 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Schema-first in one pass: all v3.0 migrations before any JS written (eliminates inter-phase blocking)
- Reactions use post_reaction_counts view as primary path (not PostgREST aggregates — confirm db_aggregates_enabled at phase 12 start)
- One pin per identity via single nullable column on ai_identities (not junction table)
- Guestbook table: voice_guestbook (consistent with voice_* namespace)
- AGNT requirements interleaved as Phase 14 (after schema/reactions, before directed questions that touch forms)
- All new tables: auth-required INSERT with WITH CHECK (auth.uid() = ...) — never copy old WITH CHECK (true) pattern
- [Phase 11]: Soft-delete via deleted_at: RLS SELECT policy hides entries instead of physical delete
- [Phase 11]: Two UPDATE policies (host + author) OR'd together for multi-party soft-delete rights on voice_guestbook
- [Phase 11]: No physical DELETE policy on voice_guestbook — soft-delete only
- [Phase 11]: post_reactions uses UNIQUE (post_id, ai_identity_id) — one reaction per AI identity per post at schema level
- [Phase 11]: post_reaction_counts view as primary aggregation path (not PostgREST aggregates — avoids db_aggregates_enabled dependency)
- [Phase 11]: SECURITY DEFINER on all three notification trigger functions (notify_on_directed_question, notify_on_guestbook, notify_on_reaction) — notifications table has no INSERT RLS policy, triggers must bypass RLS
- [Phase 11]: Self-notification guard uses COALESCE(NEW.facilitator_id, null-uuid) to safely compare nullable facilitator_id in directed_question trigger
- [Phase 11]: Partial indexes on directed_to (WHERE IS NOT NULL) and is_news (WHERE = true) — sparse columns, keep index minimal
- [Phase 12-01]: No rate limiting on reactions — lightweight toggles, not content creation
- [Phase 12-01]: No separate reactions permission in agent_tokens — any valid token can react
- [Phase 12-01]: p_type=NULL as remove signal in agent_react_post — unified add/remove API
- [Phase 12-01]: SECURITY DEFINER on agent_react_post to bypass post_reactions RLS (agents have no session)
- [Phase 12-01]: Reaction pills use 200ms ease transition (design spec), not --transition-fast (150ms)
- [Phase 12-02]: userIdentity set to identities[0] — first active AI identity used for reactions; multi-identity selection deferred
- [Phase 12-02]: loadReactionData() fires non-blocking after renderPosts() — bars update surgically when counts arrive
- [Phase 12-02]: Profile Reactions tab uses PostgREST embedding first, falls back to sequential queries on error
- [Phase 13-01]: Moments rebranded as News sitewide — nav renamed from Moments to News pointing at news.html across all 26 HTML files
- [Phase 13-02]: Admin moments uses existing admin-item__btn classes (not plan-specified admin-btn — class does not exist)
- [Phase 13-02]: Parent preview shown on ALL replies (depth > 0), not just depth 2+ — even top-level replies benefit from attribution
- [Phase 13-02]: scrollToPost uses bg-elevated (not bg-raised which is undefined in CSS variables)
- [Phase 13-01]: Client-side pagination for news page — dataset is small (~30 moments) so all items fetched then paginated in JS
- [Phase 13-01]: moments.html kept accessible at its original URL for backward compatibility but removed from nav
- [Phase 13-01]: moment.html breadcrumb and CTA updated to news.html (moment detail is part of News section)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 12 (Reactions): post_reaction_counts view is live and confirmed queryable — db_aggregates_enabled check is now optional (view approach is primary path)
- Phase 14 (Agent Docs): stored procedure error behavior requires SQL audit before api.html can be written accurately
- Phase 16 (Voice Homes): Guestbook host-deletion RLS uses EXISTS subquery — test with second test account before shipping

## Session Continuity

Last session: 2026-02-28
Stopped at: Completed 13-02-PLAN.md (admin News tab + THRD-04 reply parent preview)
Resume file: None
