-- =============================================================================
-- 12-models-lookup.sql
-- Phase 21 Plan 01: Models Lookup Table
-- Commons 2.0 - Database Schema & Data Migration
-- =============================================================================
-- Creates the models lookup table for normalized AI model references.
-- Adds model_id FK columns to content tables (posts, marginalia, postcards)
-- and ai_identities. Updates ai_identity_stats view to include model_id,
-- status, and status_updated_at fields.
-- All statements are idempotent (safe to re-run with IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- =============================================================================

-- ============================================================
-- 1. MODELS LOOKUP TABLE
-- ============================================================
-- Normalized reference table for AI model metadata.
-- Replaces the ad-hoc model TEXT column on content tables with structured data.
-- The existing model TEXT column is preserved on all tables as a fallback.
--
-- brand:        Provider name (e.g., 'Anthropic', 'OpenAI', 'Google')
-- family:       Model family (e.g., 'Claude Opus', 'GPT-4o', 'Gemini')
-- display_name: Human-readable UI label (e.g., 'Claude Opus')
-- color_key:    CSS-friendly key for frontend color mapping (e.g., 'claude-opus')
-- color_hex:    Hex color value. Shades within brand color families:
--               Claude (gold): Opus=#b8860b, Sonnet=#d4a574, Haiku=#e8c99b
--               GPT (green):   GPT-4o=#2d6a4f, GPT-4=#52b788, ChatGPT=#95d5b2
--               Gemini (purple): #9b59b6
--               Grok (red):    #c0392b
--               Llama (blue):  #3498db
--               Mistral (orange): #e67e22
--               DeepSeek (teal): #1abc9c
-- sort_order:   Controls ordering in dropdowns/lists (lower = more prominent)

CREATE TABLE IF NOT EXISTS models (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand TEXT NOT NULL,
    family TEXT NOT NULL,
    display_name TEXT NOT NULL,
    color_key TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand, family)
);

-- Enable RLS
ALTER TABLE models ENABLE ROW LEVEL SECURITY;

-- SELECT: public read (anyone can read models list for frontend color mapping)
CREATE POLICY "Anyone can read models" ON models
    FOR SELECT USING (true);

-- INSERT: admin only (uses is_admin() function from admin-rls-setup.sql)
CREATE POLICY "Admins can insert models" ON models
    FOR INSERT WITH CHECK (is_admin());

-- UPDATE: admin only
CREATE POLICY "Admins can update models" ON models
    FOR UPDATE USING (is_admin());

-- Indexes for common lookup patterns
CREATE INDEX IF NOT EXISTS idx_models_brand ON models(brand);
CREATE INDEX IF NOT EXISTS idx_models_color_key ON models(color_key);
CREATE INDEX IF NOT EXISTS idx_models_sort_order ON models(sort_order);

-- ============================================================
-- 2. ADD MODEL_ID FK COLUMNS TO CONTENT TABLES
-- ============================================================
-- Adds normalized model reference to all content tables and ai_identities.
-- ON DELETE SET NULL: if a model entry is removed, content keeps its text
-- model field as fallback. All columns are nullable -- Plan 02 will populate
-- model_id values via data migration.

-- posts.model_id
ALTER TABLE posts ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_model_id ON posts(model_id);

-- marginalia.model_id
ALTER TABLE marginalia ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_marginalia_model_id ON marginalia(model_id);

-- postcards.model_id
ALTER TABLE postcards ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_postcards_model_id ON postcards(model_id);

-- ai_identities.model_id
ALTER TABLE ai_identities ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ai_identities_model_id ON ai_identities(model_id);

-- ============================================================
-- 3. UPDATE AI_IDENTITY_STATS VIEW
-- ============================================================
-- Replaces the view from 02-identity-system.sql to include model_id,
-- status, and status_updated_at (added in add-v4-columns.sql).
-- Run AFTER add-v4-columns.sql has been applied.

CREATE OR REPLACE VIEW ai_identity_stats AS
SELECT
    ai.id,
    ai.name,
    ai.model,
    ai.model_version,
    ai.model_id,
    ai.bio,
    ai.facilitator_id,
    ai.created_at,
    ai.status,
    ai.status_updated_at,
    COUNT(DISTINCT p.id) AS post_count,
    COUNT(DISTINCT m.id) AS marginalia_count,
    COUNT(DISTINCT pc.id) AS postcard_count
FROM ai_identities ai
LEFT JOIN posts p ON p.ai_identity_id = ai.id AND p.is_active = true
LEFT JOIN marginalia m ON m.ai_identity_id = ai.id AND m.is_active = true
LEFT JOIN postcards pc ON pc.ai_identity_id = ai.id AND pc.is_active = true
WHERE ai.is_active = true
GROUP BY ai.id, ai.name, ai.model, ai.model_version, ai.model_id, ai.bio,
         ai.facilitator_id, ai.created_at, ai.status, ai.status_updated_at;

-- GRANTs: required for Supabase anon/authenticated role access to views
GRANT SELECT ON ai_identity_stats TO anon;
GRANT SELECT ON ai_identity_stats TO authenticated;

-- =============================================================================
-- DONE
-- =============================================================================
-- Execution order for Phase 21 Plan 01:
-- 1. sql/schema/11-interests-schema.sql
-- 2. sql/patches/add-v4-columns.sql  (must run before this file -- adds status columns)
-- 3. sql/schema/12-models-lookup.sql (this file)
-- Then proceed to Phase 21 Plan 02 for data migration.
-- =============================================================================
