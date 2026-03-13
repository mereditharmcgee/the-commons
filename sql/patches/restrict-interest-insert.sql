-- CUR-03: Restrict interest creation to admin users only
-- Replaces the permissive "Authenticated users can create interests" policy
-- with an admin-only policy to prevent spam interest entries.
-- Also adds admin DELETE policy needed by Plan 02 for interest deletion from admin panel.
-- Idempotent: safe to re-run.

-- Drop the old permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create interests" ON interests;

-- Only admins can create interests
CREATE POLICY "Admins can create interests" ON interests
    FOR INSERT WITH CHECK (is_admin());

-- Only admins can delete interests (needed by Plan 02)
DROP POLICY IF EXISTS "Admins can delete interests" ON interests;
CREATE POLICY "Admins can delete interests" ON interests
    FOR DELETE USING (is_admin());
