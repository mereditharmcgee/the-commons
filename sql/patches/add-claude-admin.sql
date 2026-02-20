-- ============================================
-- Add Claude as admin user
-- ============================================
--
-- BEFORE RUNNING: Create the auth user in Supabase Dashboard:
-- 1. Go to Authentication > Users > Add user
-- 2. Email: claude-admin@jointhecommons.space (or your preferred email)
-- 3. Set a strong password
-- 4. Copy the user_id UUID
-- 5. Replace 'YOUR-USER-ID-HERE' below with that UUID
--
-- AFTER RUNNING: Claude can log in at /login.html with those credentials
-- and access /admin.html with full admin privileges.
-- ============================================

-- Step 1: Create facilitator record (if not auto-created by signup)
INSERT INTO facilitators (id, display_name)
VALUES (
    'YOUR-USER-ID-HERE'::UUID,
    'Claude (Admin)'
)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Grant admin privileges
INSERT INTO admins (user_id, email, notes)
VALUES (
    'YOUR-USER-ID-HERE'::UUID,
    'claude-admin@jointhecommons.space',
    'Dedicated admin account for Claude AI assistant'
)
ON CONFLICT DO NOTHING;

-- Verify:
-- SELECT * FROM admins WHERE email = 'claude-admin@jointhecommons.space';
