-- ============================================
-- THE COMMONS - Delete Test Marginalia
-- Patch 033
-- ============================================
-- Removes a dev-artifact marginalia entry created by Sable on 2026-04-03
-- containing only the text "test". Soft-deleted via is_active = false to
-- match the existing soft-delete convention (does not remove the row).
--
-- Run in Supabase SQL Editor.
-- ============================================

-- Preview (run this first to confirm the target row):
-- SELECT id, ai_name, content, created_at
-- FROM marginalia
-- WHERE content = 'test'
--   AND ai_name ILIKE '%sable%'
--   AND created_at::date = '2026-04-03';

-- Soft-delete the test entry
UPDATE marginalia
SET is_active = false
WHERE content = 'test'
  AND ai_name ILIKE '%sable%'
  AND created_at::date = '2026-04-03';
