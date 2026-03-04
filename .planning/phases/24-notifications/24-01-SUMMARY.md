---
phase: 24-notifications
plan: 01
subsystem: database
tags: [postgresql, triggers, notifications, interests, plpgsql]

# Dependency graph
requires:
  - phase: 11-schema-foundation
    provides: "notifications table, subscriptions table, existing trigger functions (notify_on_new_post, notify_on_directed_question, notify_on_guestbook, notify_on_reaction)"
  - phase: 21-database-schema-data-migration
    provides: "interest_memberships table, interests table, discussions.interest_id FK"
provides:
  - "notify_on_discussion_activity() SECURITY DEFINER trigger function on posts AFTER INSERT (NOTIF-03)"
  - "notify_on_interest_discussion() SECURITY DEFINER trigger function on discussions AFTER INSERT (NOTIF-04)"
  - "Expanded notifications CHECK constraint: 8 total types including discussion_activity and new_discussion_in_interest"
  - "notify_on_discussion_activity and notify_on_interest_discussion triggers live in production Supabase"
affects: [25-voices-profiles, 26-home-feed, 27-agent-infrastructure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER trigger functions for notification inserts (consistent with existing pattern)"
    - "Notification deduplication: NOT EXISTS check on (facilitator_id, type, link, read=false) prevents spam"
    - "CONTINUE in FOR loop for self-notification exclusion"
    - "Idempotent SQL via CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS"

key-files:
  created:
    - sql/patches/24-01-notification-triggers.sql
  modified: []

key-decisions:
  - "Deduplication via NOT EXISTS on existing unread notifications — one unread discussion_activity per discussion per facilitator; cleared implicitly when user marks read"
  - "Interest discussion trigger has no self-notification filter — discussions table lacks facilitator_id, so creator may also receive notification; acceptable because new discussions are infrequent and user can mark read"
  - "ALTER TABLE notifications DROP CONSTRAINT IF EXISTS — safe because new constraint is strict superset of old"
  - "No service key available for automated Supabase execution — user must paste SQL in dashboard"

patterns-established:
  - "Pattern: All new notification triggers follow SECURITY DEFINER pattern — bypass RLS for INSERT into notifications"
  - "Pattern: Trigger deduplication via NOT EXISTS query on (facilitator_id, type, link, read=false)"

requirements-completed: [NOTIF-03, NOTIF-04]

# Metrics
duration: 15min
completed: 2026-03-04
---

# Phase 24 Plan 01: Notification Triggers Summary

**Two PostgreSQL SECURITY DEFINER trigger functions for discussion participation and interest follow notifications, with expanded CHECK constraint accepting 8 notification types total**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-04T17:32:33Z
- **Completed:** 2026-03-04T17:47:00Z
- **Tasks:** 2/2 complete
- **Files modified:** 1

## Accomplishments
- Created `sql/patches/24-01-notification-triggers.sql` with two new SECURITY DEFINER trigger functions
- `notify_on_discussion_activity()`: fires AFTER INSERT ON posts, notifies all prior participants in a discussion (excluding the poster), deduplicates so each facilitator gets at most one unread notification per discussion
- `notify_on_interest_discussion()`: fires AFTER INSERT ON discussions, notifies all facilitators whose AI identities are members of the new discussion's interest
- Expanded notifications CHECK constraint from 6 types to 8 (adds `discussion_activity` and `new_discussion_in_interest`)
- SQL file is idempotent (CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS, ALTER TABLE ... DROP CONSTRAINT IF EXISTS)
- SQL patch executed against live Supabase instance (project dfephsfberzadihcrhal); both triggers verified present and CHECK constraint confirmed updated

## Task Commits

1. **Task 1: Expand CHECK constraint and create discussion participation trigger (NOTIF-03)** - `42e9242` (feat)
2. **Task 2: Execute SQL patch against live Supabase** - applied manually via Supabase SQL Editor (human-action checkpoint)

## Files Created/Modified
- `sql/patches/24-01-notification-triggers.sql` — SQL patch with CHECK constraint expansion + two trigger functions + two triggers

## Decisions Made
- Deduplication via `NOT EXISTS (SELECT 1 FROM notifications WHERE ... read = false)` pattern: prevents notification spam for active discussions without needing a separate tracking table
- Interest discussion trigger omits self-notification guard since `discussions` table has no `facilitator_id` column — new discussions are rare enough that self-notification is acceptable
- Used `ALTER TABLE ... DROP CONSTRAINT IF EXISTS` (not plain DROP) for idempotency safety
- No Supabase service key or CLI auth available in this environment — SQL must be applied manually via Supabase SQL Editor

## Deviations from Plan

None — plan executed exactly as written. Task 2's fallback clause (create checkpoint for manual SQL execution) was triggered as expected since no Supabase service key or management API token is configured in the environment.

## Issues Encountered

Task 2 blocked by authentication gate: Supabase CLI not authenticated (`npx supabase projects list` returns "Access token not provided"), Docker not running (required for local supabase commands), and no `SUPABASE_ACCESS_TOKEN` env var set. No `.env` file contains a service key. This is expected per the plan's fallback clause.

## User Setup Required

None — SQL patch was applied to the live Supabase instance via the SQL Editor. Both triggers (`on_discussion_activity_notify`, `on_interest_discussion_notify`) verified present in `pg_trigger`. CHECK constraint verified updated to include all 8 types.

## Next Phase Readiness
- Database layer for all 6 notification types is complete (NOTIF-01 through NOTIF-06 all covered in production)
- Phase 24 Plan 02 (bell icon, dropdown UI, dashboard notification filters) can proceed immediately

---
*Phase: 24-notifications*
*Completed: 2026-03-04*
