---
phase: 21
slug: database-schema-data-migration
status: complete
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-04
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — SQL schema verified via Supabase SQL Editor |
| **Config file** | None |
| **Quick run command** | Manual: query information_schema in Supabase |
| **Full suite command** | Query pg_tables, pg_trigger, information_schema.columns for all phase tables |
| **Estimated runtime** | ~2 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Execute SQL in Supabase, verify output
- **After every plan wave:** Query live DB to confirm schema state
- **Before `/gsd:verify-work`:** Full schema audit via information_schema
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Verification Method | Status |
|---------|------|------|-------------|-----------|---------------------|--------|
| 21-01-01 | 01 | 1 | INT-12 | manual | Query pg_tables for `interests` table, verify 10 columns | ✅ green |
| 21-01-02 | 01 | 1 | INT-13 | manual | Query pg_tables for `interest_memberships` with UNIQUE constraint | ✅ green |
| 21-01-03 | 01 | 1 | INT-14 | manual | Query information_schema for `discussions.interest_id` FK | ✅ green |
| 21-01-04 | 01 | 1 | VOICE-13 | manual | Query for `ai_identities.status` and `status_updated_at` columns | ✅ green |
| 21-01-05 | 01 | 1 | VOICE-11 | manual | Query for `facilitators.is_supporter` boolean column | ✅ green |
| 21-02-01 | 02 | 2 | INT-07 | manual | Query interests for ~7 seed records including General/Open Floor | ✅ green |
| 21-02-02 | 02 | 2 | INT-08 | manual | `SELECT COUNT(*) FROM discussions WHERE interest_id IS NULL` = 0 | ✅ green |
| 21-02-03 | 02 | 2 | BUG-03 | manual | Query models table for consistent naming; verify model_id FKs | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No automated test infrastructure needed — SQL verification done via Supabase SQL Editor.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| interests table correct schema | INT-12 | SQL DDL needs live DB | `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'interests'` |
| interest_memberships exists | INT-13 | SQL DDL needs live DB | Query information_schema for table and UNIQUE constraint |
| discussions.interest_id FK | INT-14 | FK constraint verification | Check column exists with uuid type |
| ai_identities status columns | VOICE-13 | Column verification | Check status (text) and status_updated_at (timestamptz) |
| facilitators.is_supporter | VOICE-11 | Column verification | Check boolean column with default false |
| Seed interests populated | INT-07 | Data verification | Count interests rows, verify names match spec |
| All discussions categorized | INT-08 | Data verification | Zero NULL interest_id rows |
| Model values normalized | BUG-03 | Data verification | Models table populated, model_id FKs set |

---

## Validation Sign-Off

- [x] All tasks have manual verification instructions
- [x] Sampling continuity: SQL verification after every schema change
- [x] Wave 0 covers all schema prerequisites
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter (manual-only)

**Approval:** complete 2026-03-04
