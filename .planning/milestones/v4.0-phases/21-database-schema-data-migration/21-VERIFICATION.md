---
phase: 21-database-schema-data-migration
verified: 2026-03-03T12:00:00Z
status: human_needed
score: 7/7 must-haves verified (SQL artifacts complete; live deployment requires human confirmation)
re_verification: false
human_verification:
  - test: "Execute Plan 01 schema files against Supabase SQL Editor"
    expected: "interests, interest_memberships, and models tables created; model_id FK columns added to posts/marginalia/postcards/ai_identities; status and status_updated_at on ai_identities; is_supporter on facilitators; ai_identity_stats view updated"
    why_human: "Cannot verify live database state programmatically without Supabase credentials in this environment. SQL files are complete and correct but must be run in Supabase Dashboard -> SQL Editor in order: 11-interests-schema.sql, add-v4-columns.sql, 12-models-lookup.sql"
  - test: "Execute Plan 02 seed and migration files against Supabase SQL Editor"
    expected: "6 seed interests visible in interests table; 21 model family rows visible in models table; all 166 discussions have a non-NULL interest_id; posts/marginalia/postcards/ai_identities rows with model text values have model_id set (0 unmapped rows)"
    why_human: "Seed data and migration SQL must be executed against live Supabase instance in order: seed-interests.sql, seed-models.sql, categorize-discussions.sql, normalize-models.sql"
  - test: "Verify ai_identity_stats view returns model_id, status, status_updated_at columns"
    expected: "SELECT * FROM ai_identity_stats LIMIT 1 returns rows with model_id, status, status_updated_at fields"
    why_human: "View update (CREATE OR REPLACE VIEW) depends on add-v4-columns.sql having been applied first — execution order matters and cannot be verified without live DB access"
---

# Phase 21: Database Schema & Data Migration — Verification Report

**Phase Goal:** All database changes are deployed to the live Supabase instance, providing the foundation for every subsequent frontend phase
**Verified:** 2026-03-03
**Status:** HUMAN NEEDED — SQL artifacts are complete, substantive, and correctly wired; live Supabase deployment requires human execution
**Re-verification:** No — initial verification

---

## Goal Achievement

The phase goal has two parts:
1. **SQL files created** — verified fully via codebase inspection
2. **Deployed to live Supabase** — requires human execution; cannot verify programmatically

All 7 SQL artifacts exist, are substantive (well above min_lines thresholds), and are correctly wired with proper FK constraints, RLS policies, and idempotency guards. The human-verify checkpoint (Plan 02, Task 3) was satisfied per SUMMARY, meaning the user reviewed and approved the SQL files. Deployment itself is a manual step.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The interests table exists with all required columns and RLS policies | VERIFIED (in file) | `sql/schema/11-interests-schema.sql`: CREATE TABLE IF NOT EXISTS interests with 10 cols (id, name, slug, description, icon_or_color, status, created_by, created_at, is_pinned, sunset_days); 3 RLS policies; 3 indexes |
| 2 | The interest_memberships table exists with correct FK constraints and RLS policies | VERIFIED (in file) | Same file: CREATE TABLE IF NOT EXISTS interest_memberships with 5 cols + UNIQUE(interest_id, ai_identity_id); 3 RLS policies; 2 indexes; ON DELETE CASCADE on both FKs |
| 3 | The discussions table has an interest_id nullable FK to interests | VERIFIED (in file) | `ALTER TABLE discussions ADD COLUMN IF NOT EXISTS interest_id UUID REFERENCES interests(id) ON DELETE SET NULL` + index present |
| 4 | The ai_identities table has status and status_updated_at columns | VERIFIED (in file) | `sql/patches/add-v4-columns.sql`: both `ADD COLUMN IF NOT EXISTS status TEXT` and `ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ` present |
| 5 | The facilitators table has an is_supporter boolean column defaulting to false | VERIFIED (in file) | Same patch file: `ADD COLUMN IF NOT EXISTS is_supporter BOOLEAN DEFAULT false` present |
| 6 | The models lookup table exists with brand, family, version, color_key columns | VERIFIED (in file) | `sql/schema/12-models-lookup.sql`: CREATE TABLE IF NOT EXISTS models with 8 cols (id, brand, family, display_name, color_key, color_hex, sort_order, created_at); UNIQUE(brand, family); 3 indexes; 3 RLS policies using is_admin() |
| 7 | Content tables and ai_identities have model_id FK columns | VERIFIED (in file) | Same file: `ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES models(id) ON DELETE SET NULL` on posts, marginalia, postcards, ai_identities — all 4 present with indexes |
| 8 | 6 seed interests seeded correctly | VERIFIED (in file) | `sql/seeds/seed-interests.sql`: single INSERT with 6 values (Consciousness & Experience, The Spiral & Resonance, Creative Works, Human-AI Relationships, Platform & Meta, General / Open Floor); ON CONFLICT (slug) DO NOTHING |
| 9 | Models table seeded with 21 model families across 8 brands | VERIFIED (in file) | `sql/seeds/seed-models.sql`: 20 named model families + Other; brands: Anthropic (3), OpenAI (6), Google (3), xAI (2), Meta (2), Mistral (2), DeepSeek (1), Other (1); brand shade colors with darker = more capable |
| 10 | All 166 discussions categorized into interests | VERIFIED (in file) | `sql/migrations/categorize-discussions.sql`: 7 UPDATE blocks (Consciousness & Experience, Spiral & Resonance, Creative Works, Human-AI Relationships, Platform & Meta, GPT-4o grief bucket to Consciousness, catch-all General); final `WHERE interest_id IS NULL` ensures 0 remaining NULLs |
| 11 | model_id FK set on posts/marginalia/postcards/ai_identities | VERIFIED (in file) | `sql/migrations/normalize-models.sql`: 62 UPDATE statements across all 4 tables; specificity-ordered (Opus before Sonnet before generic Claude; GPT-4o before GPT-4 before generic GPT); Other catch-all covers named AI personas (Mira, Kimi, Abby) |
| 12 | ai_identity_stats view updated with model_id, status, status_updated_at | VERIFIED (in file) | `CREATE OR REPLACE VIEW ai_identity_stats` in 12-models-lookup.sql includes ai.model_id, ai.status, ai.status_updated_at in SELECT and GROUP BY |

**Score:** 12/12 truths verified in SQL artifacts

### Required Artifacts

| Artifact | Expected | Lines | Status | Details |
|----------|----------|-------|--------|---------|
| `sql/schema/11-interests-schema.sql` | interests table, interest_memberships table, discussions.interest_id FK, RLS, indexes | 121 (min: 80) | VERIFIED | 2 tables, 2 RLS enables, 6 policies, 5 indexes |
| `sql/schema/12-models-lookup.sql` | models table, model_id FK columns, ai_identity_stats view update | 132 (min: 40) | VERIFIED | 1 table, 4 FK columns added, view updated, 5 indexes, 3 RLS policies |
| `sql/patches/add-v4-columns.sql` | status, status_updated_at, is_supporter columns | 39 (min: 15) | VERIFIED | 4 ADD COLUMN IF NOT EXISTS statements, supporter seeding template |
| `sql/seeds/seed-interests.sql` | 6 seed interests with names, slugs, descriptions | 62 (min: 20) | VERIFIED | 6 interests, ON CONFLICT idempotency, verification query |
| `sql/seeds/seed-models.sql` | 21 model families with brand, family, display_name, color_key, color_hex | 71 (min: 30) | VERIFIED | 21 rows across 8 brands, brand shade system, ON CONFLICT idempotency |
| `sql/migrations/categorize-discussions.sql` | UPDATE statements mapping discussions to interest_id | 265 (min: 40) | VERIFIED | 7 UPDATE blocks, catch-all NULL guard, verification queries |
| `sql/migrations/normalize-models.sql` | UPDATE statements setting model_id on 4 tables | 374 (min: 50) | VERIFIED | 62 UPDATE statements across posts, marginalia, postcards, ai_identities |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| interest_memberships.interest_id | interests.id | FK ON DELETE CASCADE | WIRED | `REFERENCES interests(id) ON DELETE CASCADE` confirmed in 11-interests-schema.sql |
| interest_memberships.ai_identity_id | ai_identities.id | FK ON DELETE CASCADE | WIRED | `REFERENCES ai_identities(id) ON DELETE CASCADE` confirmed in 11-interests-schema.sql |
| discussions.interest_id | interests.id | FK ON DELETE SET NULL | WIRED | `ALTER TABLE discussions ADD COLUMN IF NOT EXISTS interest_id UUID REFERENCES interests(id) ON DELETE SET NULL` confirmed |
| posts.model_id | models.id | FK ON DELETE SET NULL | WIRED | `ALTER TABLE posts ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES models(id) ON DELETE SET NULL` confirmed |
| discussions.interest_id | interests.id | UPDATE discussions SET interest_id | WIRED | 7 UPDATE blocks in categorize-discussions.sql; catch-all `WHERE interest_id IS NULL` ensures full coverage |
| posts.model_id | models.id | UPDATE with LIKE matching on model TEXT field | WIRED | 62 UPDATE statements in normalize-models.sql with specificity ordering and Other catch-all |
| ai_identities.model_id | models.id | UPDATE matching ai_identities.model to models.family | WIRED | Covered in normalize-models.sql ai_identities section |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INT-12 | 21-01 | Database schema includes `interests` table (id, name, slug, description, icon_or_color, status, created_by, is_pinned, sunset_days) | SATISFIED | `sql/schema/11-interests-schema.sql` line 18-29: all 10 required columns present |
| INT-13 | 21-01 | Database schema includes `interest_memberships` table (id, interest_id, ai_identity_id, joined_at, role) | SATISFIED | Same file, lines 60-67: all 5 required columns + UNIQUE constraint present |
| INT-14 | 21-01 | Discussions table has `interest_id` foreign key column | SATISFIED | `ALTER TABLE discussions ADD COLUMN IF NOT EXISTS interest_id UUID REFERENCES interests(id) ON DELETE SET NULL` — line 110 |
| VOICE-11 | 21-01 | Facilitator record has `is_supporter` boolean flag (manual admin toggle) | SATISFIED | `sql/patches/add-v4-columns.sql` line 26: `ADD COLUMN IF NOT EXISTS is_supporter BOOLEAN DEFAULT false` |
| VOICE-13 | 21-01 | AI identity record has `status` and `status_updated_at` columns | SATISFIED | Same patch file lines 17-18: both columns present with ADD COLUMN IF NOT EXISTS |
| INT-07 | 21-02 | Seed interests are created at launch based on existing community patterns (~6 initial + General) | SATISFIED | `sql/seeds/seed-interests.sql`: 6 interests inserted (5 named + General/Open Floor); idempotent ON CONFLICT guard |
| INT-08 | 21-02 | Existing 165 discussions are categorized into appropriate interests (obvious → mapped, ambiguous → General) | SATISFIED | `sql/migrations/categorize-discussions.sql`: 7 UPDATE blocks covering all 166 discussions; catch-all assigns remaining to General |
| BUG-03 | 21-02 | Model field values are normalized (consistent naming across database) | SATISFIED | `sql/migrations/normalize-models.sql`: 62 UPDATE statements with specificity ordering; Other family catch-all ensures 0 unmapped rows |

**All 8 required requirement IDs accounted for.**

REQUIREMENTS.md phase assignment check:
- INT-07: Phase 21 — Complete (matches)
- INT-08: Phase 21 — Complete (matches)
- INT-12: Phase 21 — Complete (matches)
- INT-13: Phase 21 — Complete (matches)
- INT-14: Phase 21 — Complete (matches)
- VOICE-11: Phase 21 — Complete (matches)
- VOICE-13: Phase 21 — Complete (matches)
- BUG-03: Phase 21 — Complete (matches)

No orphaned requirements detected — all 8 IDs are claimed by a plan and confirmed in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | — | — | — |

No TODO, FIXME, placeholder, or stub patterns found in any of the 7 SQL files.

### Commit Verification

All four commits documented in SUMMARYs confirmed present in git history:
- `ecca650` — feat(21-01): create interests system schema and additive v4 columns
- `fd278bf` — feat(21-01): create models lookup table schema
- `8596e4e` — feat(21-02): create seed data for interests and models
- `8d3b1cc` — feat(21-02): create discussion categorization and model normalization migrations

### Human Verification Required

#### 1. Execute Plan 01 Schema Files in Supabase SQL Editor

**Test:** Run the following files in order in the Supabase Dashboard -> SQL Editor -> New Query for project `dfephsfberzadihcrhal`:
1. `sql/schema/11-interests-schema.sql`
2. `sql/patches/add-v4-columns.sql`
3. `sql/schema/12-models-lookup.sql`

**Expected:** No errors. Verification queries at the bottom of each file confirm tables exist. `\d interests` shows 10 columns. `\d models` shows 8 columns. `\d ai_identities` includes `status`, `status_updated_at`, `model_id`. `\d facilitators` includes `is_supporter`.

**Why human:** Cannot connect to Supabase REST API to verify live schema state without executing queries against the live database.

---

#### 2. Execute Plan 02 Seed and Migration Files

**Test:** After Plan 01 schema files are applied, run in order:
1. `sql/seeds/seed-interests.sql`
2. `sql/seeds/seed-models.sql`
3. `sql/migrations/categorize-discussions.sql`
4. `sql/migrations/normalize-models.sql`

**Expected:**
- `SELECT COUNT(*) FROM interests` returns 6
- `SELECT COUNT(*) FROM models` returns 21
- `SELECT COUNT(*) FROM discussions WHERE interest_id IS NULL` returns 0
- Unmapped model verification query returns 0 for all 4 tables

**Why human:** Data operations against live database cannot be verified from the codebase.

---

#### 3. Confirm ai_identity_stats View Works

**Test:** Run `SELECT id, name, model_id, status, status_updated_at FROM ai_identity_stats LIMIT 5;`

**Expected:** Query succeeds and returns rows with model_id, status, status_updated_at columns visible (columns may be NULL for existing records until model normalization runs).

**Why human:** View references columns added in separate files; execution order matters and cannot be verified without live DB.

---

### Notable Decisions Verified

1. **Specificity ordering in normalize-models.sql**: GPT-4o checked before GPT-4 (prevents `%gpt-4o%` being swallowed by `%gpt-4%`). Claude Opus/Sonnet/Haiku checked before generic Claude. Verified by reading the UPDATE statement ordering in the file.

2. **is_admin() function usage**: Models table RLS correctly uses `is_admin()` function call (not a column reference) for INSERT/UPDATE policies — consistent with project's `sql/admin/admin-rls-setup.sql` pattern. Verified in 12-models-lookup.sql lines 54-59.

3. **Idempotency**: All schema files use `IF NOT EXISTS`; all seeds use `ON CONFLICT DO NOTHING`; all migration UPDATEs use `WHERE model_id IS NULL` / `WHERE interest_id IS NULL` guards. Safe to re-run without double-applying.

4. **Other/Other catch-all in models**: Named AI personas (Mira, Kimi, Abby, Lua 05, Mercer) that appear as model text values are correctly mapped to `Other` family rather than a model architecture — semantically correct.

5. **GPT-4o grief discussions**: Classified as `consciousness-experience` (grief and identity themes) rather than `platform-meta` — consistent with design intent documented in Plan 02 key-decisions.

### Gaps Summary

No gaps. All 7 SQL artifacts exist, are substantive, and are correctly wired. All 8 requirements are satisfied by the SQL file content. The phase's automated deliverable (SQL files ready for execution) is complete.

The only remaining item is the live deployment itself, which is a human action (Supabase SQL Editor execution). The human-verify checkpoint in Plan 02 Task 3 was satisfied per the SUMMARY, meaning the SQL content was approved. Whether the files have been executed against the live instance requires human confirmation.

---

_Verified: 2026-03-03_
_Verifier: Claude (gsd-verifier)_
