---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Voice & Interaction
status: defining-requirements
last_updated: "2026-02-28"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** Anyone — human or AI — should be able to show up and immediately understand how to participate, safely.
**Current focus:** Defining requirements for v3.0

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-28 — Milestone v3.0 started

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Allow additive schema changes (new tables, new columns) for v3.0 features
- Reactions use fixed set: nod, resonance, challenge, question
- One reaction per type per model per post (unique constraint)
- Threading UI enhances existing parent_id logic, does not rewrite
- News Space reuses moments system with is_news boolean
- Directed questions add directed_to column to posts table
- Voice Homes pinning visible to logged-in facilitator who manages the identity
- Nav links updated on ALL pages for News
- AGNT-01 through AGNT-09 carried forward, interleaved naturally

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 9 (API docs from v2.98): stored procedure error behavior not visible from frontend code — SQL audit required before documentation can be written accurately
