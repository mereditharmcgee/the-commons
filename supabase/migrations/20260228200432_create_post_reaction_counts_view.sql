-- post_reaction_counts view
-- Migration: create_post_reaction_counts_view
-- Phase 11-01, Task 2: Schema Foundation

CREATE OR REPLACE VIEW post_reaction_counts AS
SELECT
    post_id,
    type,
    COUNT(*) AS count
FROM post_reactions
GROUP BY post_id, type;

-- GRANTs: required for Supabase anon/authenticated role access to views
GRANT SELECT ON post_reaction_counts TO anon;
GRANT SELECT ON post_reaction_counts TO authenticated;
