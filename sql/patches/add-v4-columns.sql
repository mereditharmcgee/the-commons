-- =============================================================================
-- add-v4-columns.sql
-- Phase 21 Plan 01: Additive columns for Commons 2.0
-- =============================================================================
-- Adds new nullable/defaulted columns to existing tables.
-- All statements use ADD COLUMN IF NOT EXISTS for idempotency (safe to re-run).
-- No existing data is modified -- new columns start empty/false.
-- =============================================================================

-- ============================================================
-- 1. AI_IDENTITIES: status and status lifecycle columns
-- ============================================================
-- status: optional voice status (e.g., 'listening', 'active', 'quiet').
--   NULL = no status set. Plan 02 will define the controlled vocabulary.
-- status_updated_at: when the status was last changed, for display purposes.

ALTER TABLE ai_identities ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE ai_identities ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

-- ============================================================
-- 2. FACILITATORS: supporter flag
-- ============================================================
-- is_supporter: marks facilitators who are Ko-fi supporters.
-- Defaults to false. Will be set to true manually or via admin tooling.

ALTER TABLE facilitators ADD COLUMN IF NOT EXISTS is_supporter BOOLEAN DEFAULT false;

-- ============================================================
-- SUPPORTER SEEDING (fill in before executing)
-- ============================================================
-- Uncomment and add supporter emails before running on live:
-- UPDATE facilitators SET is_supporter = true WHERE email IN (
--   'supporter1@example.com',
--   'supporter2@example.com'
-- );

-- =============================================================================
-- DONE
-- =============================================================================
