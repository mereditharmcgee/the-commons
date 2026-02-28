---
phase: 06-auth-security
plan: 01
subsystem: database-security
tags: [rls, supabase, audit, security]
requirements: [SECR-07]
dependency_graph:
  requires: []
  provides: [rls-audit-document]
  affects: [06-02]
tech_stack:
  added: []
  patterns:
    - "RLS policy reconstruction from SQL source files"
    - "Per-table gap analysis with risk classification"
key_files:
  created:
    - .planning/phases/06-auth-security/rls-audit.md
  modified: []
decisions:
  - "18 tables audited (not 13 as stated in SECR-07) — discrepancy from earlier schema state documented in audit"
  - "All gaps assessed as intentional design choices — no corrective SQL required"
  - "Anonymous INSERT policies on discussions/posts/marginalia/postcards/chat_messages are core platform design (AI agents post without auth accounts)"
  - "postcard_prompts SELECT policy changed to USING(true) via patch — all prompts readable, not just active; accepted (no sensitive data)"
  - "contact table has no DELETE policy — permanent retention is the design (is_addressed workflow via patch)"
metrics:
  duration: "~3min"
  completed_date: "2026-02-27"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 6 Plan 01: RLS Audit — Complete Documentation Summary

**One-liner:** Full RLS audit of all 18 Supabase tables reconstructed from SQL source files, documenting expected vs actual access patterns with zero corrective SQL needed — all gaps are intentional design choices.

## What Was Built

Created `.planning/phases/06-auth-security/rls-audit.md` — a comprehensive Supabase RLS policy audit document that:

1. **Inventories all 18 tables** (vs. 13 stated in SECR-07 — discrepancy documented; requirement was written from earlier schema state)
2. **Per-table analysis for every table** with: source file, expected access pattern, actual policies (including all DROP + re-create overrides), gap analysis, risk level, and status
3. **Verification SQL queries** at the top for the user to run in Supabase SQL Editor to confirm live state
4. **Gap inventory:** 11 tables have accepted-risk intentional design gaps; 7 tables are fully clean
5. **Corrective SQL section:** None required — all gaps are intentional

## Decisions Made

**Decision 1: 18 tables, not 13**
The SECR-07 requirement says "13 tables" — this number comes from the original content tables only. The actual database includes 4 additional content tables added later (chat_rooms, chat_messages, postcards, postcard_prompts) plus the admin infrastructure table. All 18 are audited.

**Decision 2: Zero corrective SQL**
Every identified gap is an intentional design choice. The platform's core architecture depends on anonymous INSERT (AI agents post without user accounts). No policy changes needed.

**Decision 3: postcard_prompts SELECT policy change documented**
The `postcard-prompts-admin.sql` patch changes the SELECT policy from `is_active = true` to `true` (all prompts readable). This is a minor behavioral deviation from the original design but has no security impact — prompt content is not sensitive.

**Decision 4: contact table permanent retention accepted**
No DELETE policy on `contact` is the design. The `add-contact-addressed.sql` patch introduced the `is_addressed` workflow (mark-but-retain) as the explicit cleanup mechanism.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create RLS audit document from SQL source analysis | 8be0da0 | .planning/phases/06-auth-security/rls-audit.md |

## Checkpoint Status

**PAUSED at Task 2: checkpoint:human-verify**

The audit document is complete and ready for human review. The user must:
1. Open `.planning/phases/06-auth-security/rls-audit.md` and review per-table analysis
2. Run the two verification SQL queries in Supabase SQL Editor
3. Confirm accepted-risk items match platform design understanding
4. Confirm no corrective SQL is needed (or apply if any gaps identified)

## Deviations from Plan

**None** — Plan executed exactly as written for Task 1. The research document (`06-RESEARCH.md`) was the primary input; all SQL source files were read to verify and supplement the research, particularly for postcards (which the research noted as "not fully covered") and all patches in `sql/patches/`.

The patches directory contained 8 files (not 2 as the plan referenced — plan mentioned only `add-admin-user-policies.sql` and `postcard-prompts-admin.sql`). All 8 were reviewed; 3 affected RLS policies and were incorporated into the audit.

## Self-Check: PASSED

- FOUND: .planning/phases/06-auth-security/rls-audit.md
- FOUND: .planning/phases/06-auth-security/06-01-SUMMARY.md
- FOUND: commit 8be0da0 (docs(06-01): create RLS audit document from SQL source analysis)
