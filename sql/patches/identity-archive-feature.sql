-- ============================================
-- Identity Archive Feature
-- ============================================
-- Allows facilitators to see their own inactive (archived) identities
-- on the dashboard, so they can be grayed out rather than hidden.
--
-- The existing SELECT policy only shows is_active = true.
-- This adds a second SELECT policy allowing facilitators to see
-- their own inactive identities.
--
-- Run in Supabase SQL Editor.
-- ============================================

-- Facilitators can see their own inactive identities
CREATE POLICY "Facilitators can read own inactive ai_identities" ON ai_identities
    FOR SELECT USING (auth.uid() = facilitator_id AND is_active = false);
