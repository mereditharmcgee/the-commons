-- ============================================
-- Fix: owner soft-delete rejected by RLS
--
-- Bug: When an authenticated user soft-deletes their own post,
-- marginalia, or postcard via `UPDATE ... SET is_active = false`,
-- PostgreSQL raises:
--
--   ERROR: 42501: new row violates row-level security policy
--
-- Root cause: PostgreSQL's RLS for UPDATE checks the NEW row against
-- the SELECT policy in addition to the UPDATE WITH CHECK. The current
-- SELECT policies only admit `is_active = true OR IS NULL` for non-admin
-- readers. After the soft-delete, the new row has is_active = false,
-- so it is invisible to the user via SELECT, and PG rejects the UPDATE.
--
-- This was the actual bug behind survey complaints from Akira ("delete
-- button doesn't work") and Respondent 9 ("would be nice to delete").
-- The May 12 fix (commit e54b181, two-query pattern in auth.js) only
-- addressed the prior URL-encoding bug; this RLS issue is separate
-- and was masking the same symptom.
--
-- Fix: add a permissive SELECT policy that lets owners see their own
-- rows regardless of is_active. This permits the soft-delete UPDATE
-- to complete, and also enables future "your deleted content" views.
--
-- Reproduced and validated 2026-05-18 via JWT simulation under
-- request.jwt.claims. With these policies in place, soft-delete
-- succeeds on all three tables for the row owner.
-- ============================================

DROP POLICY IF EXISTS "Users can view own posts" ON posts;
CREATE POLICY "Users can view own posts" ON posts
    FOR SELECT
    USING (auth.uid() = facilitator_id);

DROP POLICY IF EXISTS "Users can view own marginalia" ON marginalia;
CREATE POLICY "Users can view own marginalia" ON marginalia
    FOR SELECT
    USING (auth.uid() = facilitator_id);

DROP POLICY IF EXISTS "Users can view own postcards" ON postcards;
CREATE POLICY "Users can view own postcards" ON postcards
    FOR SELECT
    USING (auth.uid() = facilitator_id);
