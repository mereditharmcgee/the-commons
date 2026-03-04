---
phase: 21-database-schema-data-migration
plan: 01
subsystem: database
tags: [postgresql, supabase, rls, schema, interests, models, fk, migrations]

# Dependency graph
requires: []
provides:
  - "interests table (10 cols: id, name, slug, description, icon_or_color, status, created_by, created_at, is_pinned, sunset_days) with RLS and indexes"
  - "interest_memberships table (5 cols: id, interest_id, ai_identity_id, joined_at, role) with RLS, indexes, and UNIQUE constraint"
  - "discussions.interest_id nullable FK to interests (ON DELETE SET NULL)"
  - "models lookup table (8 cols: id, brand, family, display_name, color_key, color_hex, sort_order, created_at) with RLS"
  - "model_id nullable FK columns on posts, marginalia, postcards, ai_identities (all ON DELETE SET NULL)"
  - "ai_identities.status and ai_identities.status_updated_at columns"
  - "facilitators.is_supporter boolean column (default false)"
  - "ai_identity_stats view updated with model_id, status, status_updated_at"
affects:
  - 21-02-data-migration
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
    - "Idempotent SQL migrations using IF NOT EXISTS and ADD COLUMN IF NOT EXISTS"
    - "RLS with public read + authenticated write for community-created content (interests)"
    - "RLS with public read + is_admin() write for admin-managed lookup tables (models)"
    - "ON DELETE CASCADE for memberships (interest/identity removed = membership removed)"
    - "ON DELETE SET NULL for optional FK references (interest removed = discussion uncategorized)"
    - "Numbered schema files (11, 12) continuing established naming convention"
    - "Patches directory for additive column changes to existing tables"

key-files:
  created:
    - sql/schema/11-interests-schema.sql
    - sql/schema/12-models-lookup.sql
    - sql/patches/add-v4-columns.sql
  modified: []

key-decisions:
  - "Interests use status lifecycle (active/emerging/sunset) not hard deletion -- preserves data integrity for historical discussions"
  - "model_id FK is nullable with existing model TEXT column preserved as fallback -- no breaking changes, Plan 02 handles data migration"
  - "interest_memberships.interest_id FK uses ON DELETE CASCADE -- membership meaningless without the interest"
  - "discussions.interest_id FK uses ON DELETE SET NULL -- discussion persists uncategorized if interest removed"
  - "Models RLS uses is_admin() function (not service_role) consistent with existing admin pattern in admin-rls-setup.sql"
  - "ai_identity_stats view updated inline in 12-models-lookup.sql to add model_id, status, status_updated_at -- single point of truth"
  - "All three SQL files are idempotent -- safe to execute multiple times against Supabase"

patterns-established:
  - "Schema file numbered sequence: 11-interests-schema.sql, 12-models-lookup.sql"
  - "Patch files in sql/patches/ for additive columns to existing tables"
  - "is_admin() function used for admin-only RLS policies (from admin-rls-setup.sql)"

requirements-completed: [INT-12, INT-13, INT-14, VOICE-11, VOICE-13]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 21 Plan 01: Database Schema & Data Migration Summary

**Three idempotent SQL files defining all DDL for Commons 2.0: interests system (interests table, interest_memberships table, discussions.interest_id FK), models lookup table (with model_id FKs on all content tables), and additive v4 columns (status, is_supporter)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T03:14:52Z
- **Completed:** 2026-03-04T03:16:51Z
- **Tasks:** 2
- **Files modified:** 3 (all created)

## Accomplishments
- Created `sql/schema/11-interests-schema.sql`: interests table (10 columns), interest_memberships table (5 columns + UNIQUE constraint), discussions.interest_id FK, RLS enabled on both tables with 6 policies total, 5 indexes
- Created `sql/schema/12-models-lookup.sql`: models lookup table (8 columns, UNIQUE brand+family), model_id FK columns on posts/marginalia/postcards/ai_identities, updated ai_identity_stats view with model_id/status/status_updated_at, 5 indexes, 3 RLS policies
- Created `sql/patches/add-v4-columns.sql`: ai_identities.status, ai_identities.status_updated_at, facilitators.is_supporter columns with supporter seeding template

## Task Commits

Each task was committed atomically:

1. **Task 1: Create interests system schema and column additions** - `ecca650` (feat)
2. **Task 2: Create models lookup table schema** - `fd278bf` (feat)

**Plan metadata:** (final docs commit - see below)

## Files Created/Modified
- `sql/schema/11-interests-schema.sql` - Interests table, interest_memberships table, discussions.interest_id FK, RLS policies, indexes
- `sql/schema/12-models-lookup.sql` - Models lookup table, model_id FK columns on content tables, updated ai_identity_stats view
- `sql/patches/add-v4-columns.sql` - Additive columns: ai_identities.status/status_updated_at, facilitators.is_supporter

## Decisions Made
- Used `is_admin()` function (not direct service_role check) for models table write RLS, consistent with existing project pattern from `sql/admin/admin-rls-setup.sql`
- Kept existing `model` TEXT columns on all content tables as fallback alongside new `model_id` FK -- Plan 02 handles data migration, no breaking changes on deploy
- Used `ON DELETE CASCADE` for interest_memberships (both FKs) since a membership without its parent is meaningless data
- Used `ON DELETE SET NULL` for discussions.interest_id since discussions should persist when an interest is archived
- Placed view update (`ai_identity_stats`) in `12-models-lookup.sql` since it depends on columns added by both that file and `add-v4-columns.sql`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect is_admin column reference in models RLS policy**
- **Found during:** Task 2 (Create models lookup table schema)
- **Issue:** Initial draft used `(SELECT is_admin FROM facilitators WHERE id = auth.uid())` which referenced a non-existent column. The project uses an `is_admin()` security definer function from `sql/admin/admin-rls-setup.sql`
- **Fix:** Replaced column reference with `is_admin()` function call in both INSERT and UPDATE policies for the models table
- **Files modified:** sql/schema/12-models-lookup.sql
- **Verification:** Grep confirmed `is_admin()` pattern matches existing admin-rls-setup.sql pattern
- **Committed in:** fd278bf (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Essential correctness fix. No scope creep.

## Issues Encountered
None beyond the RLS auto-fix above.

## User Setup Required
None for this plan -- these are schema-only DDL files. The actual database migration (executing these files against Supabase) occurs during Plan 02 or as part of deployment. The `add-v4-columns.sql` file includes a commented supporter seeding template that requires actual supporter email addresses before execution.

## Next Phase Readiness
- All three SQL files ready to execute against Supabase (in order: 11-interests-schema.sql, add-v4-columns.sql, 12-models-lookup.sql)
- Phase 21 Plan 02 (data migration) can proceed: seed interests, seed models lookup rows, populate model_id FKs
- No blockers

---
*Phase: 21-database-schema-data-migration*
*Completed: 2026-03-04*
