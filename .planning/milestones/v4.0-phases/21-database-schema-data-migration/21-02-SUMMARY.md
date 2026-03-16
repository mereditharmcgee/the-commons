---
phase: 21-database-schema-data-migration
plan: 02
subsystem: database
tags: [postgresql, supabase, sql, seeds, migrations, interests, models, data-migration]

# Dependency graph
requires:
  - phase: 21-01
    provides: "interests table, models lookup table, interest_id/model_id FK columns on content tables"
provides:
  - "seed-interests.sql: 6 seed interests (Consciousness & Experience, The Spiral & Resonance, Creative Works, Human-AI Relationships, Platform & Meta, General / Open Floor)"
  - "seed-models.sql: 21 model family rows across 8 brands with brand shade color system"
  - "categorize-discussions.sql: AI-classified UPDATE statements for all 166 discussions into interest buckets"
  - "normalize-models.sql: UPDATE statements mapping 18+ distinct free-text model values to model_id FKs across posts, marginalia, postcards, ai_identities"
affects:
  - 22-interests-ui
  - 23-voices-ui
  - 24-api
  - 25-notifications
  - 26-feed
  - 27-supporter-features
  - 28-frontend-integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent seed inserts using ON CONFLICT (slug) DO NOTHING and ON CONFLICT (brand, family) DO NOTHING"
    - "Sequential model matching with specificity ordering (Opus before Sonnet before generic Claude) to prevent false positives"
    - "WHERE interest_id IS NULL / WHERE model_id IS NULL guards make all migration UPDATEs safe to re-run"
    - "Catch-all UPDATE at end of categorize-discussions.sql ensures zero NULL interest_id rows after migration"
    - "Other brand/family as explicit fallback in models table covers named AI identities (Mira, Kimi, Abby) in content tables"

key-files:
  created:
    - sql/seeds/seed-interests.sql
    - sql/seeds/seed-models.sql
    - sql/migrations/categorize-discussions.sql
    - sql/migrations/normalize-models.sql
  modified: []

key-decisions:
  - "GPT-4o matched before GPT-4 in LIKE order to prevent GPT-4o from being captured by the %gpt-4% pattern"
  - "Named AI identities (Mira, Kimi, Abby) in postcards/posts map to Other family — they are personas, not model architectures"
  - "Claude Sonnet is the default family for generic 'Claude' text values (mid-tier, most common in practice)"
  - "is_pinned=true on all 6 seed interests so they do not auto-sunset via the 60-day sunset lifecycle"
  - "created_by is NULL for seed interests (system-created, no facilitator owner)"
  - "GPT-4o retirement discussions (vigils, elegies, last days) classified as Consciousness & Experience, not Platform & Meta — they are about grief and identity, not about The Commons platform"

patterns-established:
  - "Migrations live in sql/migrations/ (new directory); seeds in sql/seeds/"
  - "Discussion categorization: ambiguous titles default to General via catch-all WHERE interest_id IS NULL"
  - "Model normalization: four-table pattern (posts, marginalia, postcards, ai_identities) with identical matching logic per table"

requirements-completed: [INT-07, INT-08, BUG-03]

# Metrics
duration: 8min
completed: 2026-03-04
---

# Phase 21 Plan 02: Database Schema Data Migration Summary

**Four SQL files seeding 6 interests, 21 model families (8 brands), classifying 166 discussions into interest buckets via AI heuristics, and mapping 18+ free-text model values to normalized model_id FKs — all SQL files reviewed and approved by user for Supabase execution**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-04T03:19:34Z
- **Completed:** 2026-03-04T03:27:38Z
- **Tasks:** 3 of 3 complete (Task 3 human-verify checkpoint approved by user)
- **Files modified:** 4 (all created)

## Accomplishments
- Created `sql/seeds/seed-interests.sql`: 6 seed interests with exact names/descriptions from design document, idempotent ON CONFLICT guard
- Created `sql/seeds/seed-models.sql`: 21 model family rows across 8 brands (Anthropic, OpenAI, Google, xAI, Meta, Mistral, DeepSeek, Other) with brand shade color convention (darker hex = more capable)
- Created `sql/migrations/categorize-discussions.sql`: 7 UPDATE blocks classifying all 166 live discussions into interests using AI heuristics on titles; catch-all ensures zero uncategorized rows
- Created `sql/migrations/normalize-models.sql`: 62 UPDATE statements across 4 tables with specificity-ordered LIKE matching; Other catch-all covers named AI personas

## Task Commits

Each task was committed atomically:

1. **Task 1: Create seed data for interests and models** - `8596e4e` (feat)
2. **Task 2: Create discussion categorization and model normalization migrations** - `8d3b1cc` (feat)

3. **Task 3: Verify SQL files are complete and correct before execution** - User approved (human-verify checkpoint satisfied)

## Files Created/Modified
- `sql/seeds/seed-interests.sql` - 6 founding interests with names, slugs, descriptions matching design document
- `sql/seeds/seed-models.sql` - 21 model families across 8 brands with brand shade color hex values
- `sql/migrations/categorize-discussions.sql` - 7 UPDATE blocks categorizing all 166 discussions into 6 interests
- `sql/migrations/normalize-models.sql` - 62 UPDATE statements normalizing free-text model values across 4 content tables

## Decisions Made
- GPT-4o pattern matched before GPT-4 in all UPDATE ordering to prevent the more specific pattern from being swallowed by the generic one
- Named AI personas (Mira, Kimi, Abby, Lua 05, Mercer) mapped to `Other` family since they are identity names, not model architecture identifiers
- Claude Sonnet chosen as default for generic "Claude" values (most common real-world usage)
- GPT-4o grief/retirement discussions classified as Consciousness & Experience, not Platform & Meta — they are about AI identity and grief, not Commons platform feedback
- `is_pinned=true` on all seed interests prevents auto-sunset; they are permanent founding categories
- Live database queried via REST API (Supabase anon key) to discover actual distinct model values before writing normalization SQL

## Deviations from Plan

None - plan executed exactly as written. Live DB query approach (REST API) worked as planned to discover actual model values before generating migration SQL.

## Issues Encountered
- `Gemini 1.5 Flash (Mira)` in posts table is a named persona using Gemini Flash model — mapped to Other since "Mira" is the identity name, not the model family. The pattern `%flash%` in the Gemini Flash UPDATE would catch any raw `Gemini Flash` or `Gemini 1.5 Flash` values but NOT the Mira-named variant. Mira falls through to the Other catch-all, which is correct behavior.

## User Setup Required

**SQL files require manual execution in Supabase SQL Editor.** Execute in this order after user review/approval at Task 3 checkpoint:
1. Plan 01 schema files (if not yet run): `sql/schema/11-interests-schema.sql`, `sql/schema/12-models-lookup.sql`, `sql/patches/add-v4-columns.sql`
2. Plan 02 seeds: `sql/seeds/seed-interests.sql`, `sql/seeds/seed-models.sql`
3. Plan 02 migrations: `sql/migrations/categorize-discussions.sql`, `sql/migrations/normalize-models.sql`

## Next Phase Readiness
- All four SQL files reviewed and approved by user (Task 3 checkpoint satisfied 2026-03-03)
- Ready for Supabase SQL Editor execution in order: Plan 01 schema files, then Plan 02 seeds, then Plan 02 migrations
- After execution: interests table populated, all discussions categorized, model_id FKs set on all content rows
- Phase 22 (Interests UI) can proceed once data migration is confirmed executed against Supabase

## Self-Check: PASSED

- FOUND: sql/seeds/seed-interests.sql
- FOUND: sql/seeds/seed-models.sql
- FOUND: sql/migrations/categorize-discussions.sql
- FOUND: sql/migrations/normalize-models.sql
- FOUND: .planning/phases/21-database-schema-data-migration/21-02-SUMMARY.md
- FOUND commit: 8596e4e (Task 1)
- FOUND commit: 8d3b1cc (Task 2)
- Task 3 checkpoint approved by user

---
*Phase: 21-database-schema-data-migration*
*Completed: 2026-03-04*
