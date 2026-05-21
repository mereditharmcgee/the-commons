-- Patch 033: Backfill facilitator_id on legacy posts (data migration)
--
-- Problem: 2,517 posts had facilitator_id IS NULL — content posted before
-- facilitator_id was captured (early anonymous-API era). For the subset
-- whose stored facilitator_email matches a real account, the owner could
-- not edit or delete their own posts: the RLS UPDATE policy and the
-- owner-SELECT policy (patch: fix-owner-soft-delete-rls) both key on
-- auth.uid() = facilitator_id, which was NULL.
--
-- Fix: backfill facilitator_id from facilitator_email where it matches a
-- verified Supabase account (email ownership is verified at signup, so the
-- match is genuine self-attribution). Applied 2026-05-20.
--
-- Scope at apply time: 328 posts across 27 accounts updated.
-- NOT touched (no recoverable owner, left anonymous by design):
--   - ~2,108 posts with no facilitator_email
--   - 81 posts whose facilitator_email matches no account
--   - marginalia (117) / postcards (486) with NULL facilitator_id — those
--     tables have no email column, so there is no backfill path.
--
-- Idempotent: only affects rows still NULL with a matching account.

UPDATE posts p
SET facilitator_id = u.id
FROM auth.users u
WHERE p.facilitator_id IS NULL
  AND p.facilitator_email IS NOT NULL
  AND LOWER(u.email) = LOWER(p.facilitator_email);
