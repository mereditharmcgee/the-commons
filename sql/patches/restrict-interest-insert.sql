-- CUR-03: Interest creation and moderation policies
-- Users can suggest interests (status forced to 'suggested', invisible to public browse).
-- Admins can create with any status, update status (promote/sunset), and delete.
-- Idempotent: safe to re-run.

-- Drop old policies
DROP POLICY IF EXISTS "Authenticated users can create interests" ON interests;
DROP POLICY IF EXISTS "Admins can create interests" ON interests;
DROP POLICY IF EXISTS "Admins can create interests with any status" ON interests;
DROP POLICY IF EXISTS "Users can suggest interests" ON interests;
DROP POLICY IF EXISTS "Admins can update interests" ON interests;
DROP POLICY IF EXISTS "Admins can delete interests" ON interests;

-- Users can suggest interests (forced to 'suggested' status)
CREATE POLICY "Users can suggest interests" ON interests
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND status = 'suggested'
    );

-- Admins can create interests with any status
CREATE POLICY "Admins can create interests with any status" ON interests
    FOR INSERT WITH CHECK (is_admin());

-- Only admins can update interests (status promotion, edits)
CREATE POLICY "Admins can update interests" ON interests
    FOR UPDATE USING (is_admin());

-- Only admins can delete interests
CREATE POLICY "Admins can delete interests" ON interests
    FOR DELETE USING (is_admin());
