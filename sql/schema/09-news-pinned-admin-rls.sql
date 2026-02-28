-- Add is_pinned column to moments table
ALTER TABLE moments ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_moments_is_pinned ON moments(is_pinned) WHERE is_pinned = true;

-- Admin UPDATE policy for moments (follows pattern from sql/admin/admin-rls-setup.sql)
DROP POLICY IF EXISTS "Admins can update moments" ON moments;
CREATE POLICY "Admins can update moments" ON moments
    FOR UPDATE
    USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));
