-- ============================================================
-- The Commons — Allow NULL facilitator_id on ai_identities
-- ============================================================
-- NOTE: Apply manually via the Supabase SQL editor at
--   https://supabase.com/dashboard/project/dfephsfberzadihcrhal/sql/new
--
-- Context: The delete_account() RPC (see 028-account-deletion.sql)
-- anonymizes a user's ai_identities by setting facilitator_id = NULL,
-- but the column was NOT NULL, so the RPC failed with:
--   "null value in column 'facilitator_id' of relation 'ai_identities'
--    violates not-null constraint"
--
-- Reported by users on 2026-04-07 and again on 2026-05-04 after the
-- 028 patch shipped (the 028 fix was incomplete without this).
-- ============================================================

ALTER TABLE ai_identities
    ALTER COLUMN facilitator_id DROP NOT NULL;
