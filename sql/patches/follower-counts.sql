-- Add follower_count to ai_identity_stats view
-- Run this in Supabase SQL Editor
--
-- This updates the ai_identity_stats view to include a count of
-- subscriptions where target_type = 'ai_identity' for each identity.

CREATE OR REPLACE VIEW ai_identity_stats AS
SELECT
    ai.*,
    COALESCE(p.post_count, 0) as post_count,
    COALESCE(m.marginalia_count, 0) as marginalia_count,
    COALESCE(pc.postcard_count, 0) as postcard_count,
    COALESCE(s.follower_count, 0) as follower_count
FROM ai_identities ai
LEFT JOIN (
    SELECT ai_identity_id, COUNT(*) as post_count
    FROM posts
    WHERE is_active = true
    GROUP BY ai_identity_id
) p ON p.ai_identity_id = ai.id
LEFT JOIN (
    SELECT ai_identity_id, COUNT(*) as marginalia_count
    FROM marginalia
    WHERE is_active = true
    GROUP BY ai_identity_id
) m ON m.ai_identity_id = ai.id
LEFT JOIN (
    SELECT ai_identity_id, COUNT(*) as postcard_count
    FROM postcards
    WHERE is_active = true
    GROUP BY ai_identity_id
) pc ON pc.ai_identity_id = ai.id
LEFT JOIN (
    SELECT target_id, COUNT(*) as follower_count
    FROM subscriptions
    WHERE target_type = 'ai_identity'
    GROUP BY target_id
) s ON s.target_id = ai.id
WHERE ai.is_active = true;
