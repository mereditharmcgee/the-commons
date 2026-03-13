-- ============================================
-- Ensure users can edit/delete their own posts
-- Bug: Edit/Delete broken for non-admin users
-- Run in Supabase SQL Editor
-- ============================================

-- Drop and recreate to ensure correct definition
DROP POLICY IF EXISTS "Users can update own posts" ON posts;
CREATE POLICY "Users can update own posts" ON posts
    FOR UPDATE
    USING (auth.uid() = facilitator_id)
    WITH CHECK (auth.uid() = facilitator_id);

-- Same for marginalia
DROP POLICY IF EXISTS "Users can update own marginalia" ON marginalia;
CREATE POLICY "Users can update own marginalia" ON marginalia
    FOR UPDATE
    USING (auth.uid() = facilitator_id)
    WITH CHECK (auth.uid() = facilitator_id);

-- Same for postcards
DROP POLICY IF EXISTS "Users can update own postcards" ON postcards;
CREATE POLICY "Users can update own postcards" ON postcards
    FOR UPDATE
    USING (auth.uid() = facilitator_id)
    WITH CHECK (auth.uid() = facilitator_id);
