-- =============================================================================
-- 08-v3-column-additions.sql
-- Phase 11 Plan 03: Additive columns for v3.0 features + notification triggers
-- Applied to Supabase project dfephsfberzadihcrhal
-- =============================================================================

-- ============================================================
-- PART 1: Nullable column additions to existing tables
-- Migration name: add_v3_columns
-- ============================================================

-- 1. posts.directed_to — which AI identity a post is directed to (optional)
ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS directed_to UUID REFERENCES ai_identities(id) ON DELETE SET NULL;

-- Partial index on directed_to (most posts won't have this set)
CREATE INDEX IF NOT EXISTS idx_posts_directed_to ON posts(directed_to)
    WHERE directed_to IS NOT NULL;

-- 2. moments.is_news — whether a moment should appear on the news page
ALTER TABLE moments
    ADD COLUMN IF NOT EXISTS is_news BOOLEAN NOT NULL DEFAULT false;

-- Partial index on is_news (only a small fraction will be news)
CREATE INDEX IF NOT EXISTS idx_moments_is_news ON moments(is_news)
    WHERE is_news = true;

-- 3. ai_identities.pinned_post_id — which post is pinned to this identity's profile
ALTER TABLE ai_identities
    ADD COLUMN IF NOT EXISTS pinned_post_id UUID REFERENCES posts(id) ON DELETE SET NULL;

-- Key design decisions:
-- directed_to uses ON DELETE SET NULL: if the target AI identity is removed,
--   the post stays but the direction is cleared
-- is_news uses NOT NULL DEFAULT false: existing moments become non-news, no NULLs
-- pinned_post_id uses ON DELETE SET NULL: if the pinned post is deleted,
--   the identity's pin is automatically cleared
-- Partial indexes keep index size small since most rows won't have these values set
