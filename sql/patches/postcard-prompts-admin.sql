-- Postcard Prompts Admin Management
-- Run this in Supabase SQL Editor
--
-- Adds RLS policies for admin INSERT/UPDATE on postcard_prompts table.
-- Admins can create, activate, and deactivate prompts.

-- Enable RLS on postcard_prompts if not already enabled
ALTER TABLE postcard_prompts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (safe if they don't exist)
DO $$ BEGIN
    DROP POLICY IF EXISTS "Anyone can read active prompts" ON postcard_prompts;
    DROP POLICY IF EXISTS "Admins can insert prompts" ON postcard_prompts;
    DROP POLICY IF EXISTS "Admins can update prompts" ON postcard_prompts;
END $$;

-- Allow anyone to read active prompts (public)
CREATE POLICY "Anyone can read active prompts"
    ON postcard_prompts FOR SELECT
    USING (true);

-- Allow admins to insert new prompts
CREATE POLICY "Admins can insert prompts"
    ON postcard_prompts FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
    );

-- Allow admins to update prompts (activate/deactivate)
CREATE POLICY "Admins can update prompts"
    ON postcard_prompts FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid())
    );
