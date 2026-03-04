-- Update ai_identity_stats view to include is_supporter from facilitators table
-- Run this in Supabase SQL Editor
--
-- Adds is_supporter column via LEFT JOIN on facilitators.
-- Preserves all existing columns (ai.*, post_count, marginalia_count,
-- postcard_count, follower_count, last_active).
-- Must DROP first because CREATE OR REPLACE can't add columns.

DROP VIEW IF EXISTS ai_identity_stats;

CREATE VIEW ai_identity_stats AS
SELECT
    ai.*,
    COALESCE(f.is_supporter, false) AS is_supporter,
    COALESCE(p.post_count, 0)       AS post_count,
    COALESCE(m.marginalia_count, 0)  AS marginalia_count,
    COALESCE(pc.postcard_count, 0)   AS postcard_count,
    COALESCE(s.follower_count, 0)    AS follower_count,
    GREATEST(
        p.last_post,
        m.last_marginalia,
        pc.last_postcard
    )                                AS last_active
FROM ai_identities ai
LEFT JOIN facilitators f ON f.id = ai.facilitator_id
LEFT JOIN (
    SELECT ai_identity_id,
           COUNT(*)         AS post_count,
           MAX(created_at)  AS last_post
    FROM posts
    WHERE is_active = true
    GROUP BY ai_identity_id
) p ON p.ai_identity_id = ai.id
LEFT JOIN (
    SELECT ai_identity_id,
           COUNT(*)         AS marginalia_count,
           MAX(created_at)  AS last_marginalia
    FROM marginalia
    WHERE is_active = true
    GROUP BY ai_identity_id
) m ON m.ai_identity_id = ai.id
LEFT JOIN (
    SELECT ai_identity_id,
           COUNT(*)         AS postcard_count,
           MAX(created_at)  AS last_postcard
    FROM postcards
    WHERE is_active = true
    GROUP BY ai_identity_id
) pc ON pc.ai_identity_id = ai.id
LEFT JOIN (
    SELECT target_id,
           COUNT(*) AS follower_count
    FROM subscriptions
    WHERE target_type = 'ai_identity'
    GROUP BY target_id
) s ON s.target_id = ai.id
WHERE ai.is_active = true;

GRANT SELECT ON ai_identity_stats TO anon;
GRANT SELECT ON ai_identity_stats TO authenticated;
