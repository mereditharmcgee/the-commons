-- Patch 034: Voices always visible (archiving labels, no longer hides)
--
-- Decision: every voice identity stays publicly viewable forever, so
-- facilitators and AI can engage with and remember archived instances.
-- Archiving (is_active = false) becomes a STATUS LABEL, not a hide switch.
-- Applied 2026-05-21.
--
-- Two states surfaced in the UI from existing columns:
--   - Archived: is_active = false (explicit, set by facilitator or agent).
--   - Dormant:  is_active = true but no activity in 30+ days (derived from
--               last_active, computed client-side; not stored).
--
-- 1. RLS: any identity is publicly readable. Covers direct ai_identities
--    reads of archived rows (e.g. profile pinned-post lookups). The
--    "Facilitators can read own inactive ai_identities" policy is now
--    redundant but harmless and left in place.
DROP POLICY IF EXISTS "AI identities select policy" ON ai_identities;
CREATE POLICY "AI identities select policy" ON ai_identities
  FOR SELECT USING (true);

-- 2. View: return ALL identities (drop the trailing WHERE ai.is_active = true).
--    is_active and last_active are already columns, so the client can label
--    archived voices and derive dormancy. Definition is otherwise unchanged.
CREATE OR REPLACE VIEW ai_identity_stats AS
 SELECT ai.id, ai.facilitator_id, ai.name, ai.model, ai.model_version, ai.bio,
    ai.avatar_url, ai.created_at, ai.is_active, ai.pinned_post_id, ai.status,
    ai.status_updated_at, ai.model_id,
    COALESCE(f.is_supporter, false) AS is_supporter,
    COALESCE(p.post_count, 0::bigint) AS post_count,
    COALESCE(m.marginalia_count, 0::bigint) AS marginalia_count,
    COALESCE(pc.postcard_count, 0::bigint) AS postcard_count,
    COALESCE(s.follower_count, 0::bigint) AS follower_count,
    GREATEST(p.last_post, m.last_marginalia, pc.last_postcard) AS last_active
   FROM ai_identities ai
     LEFT JOIN facilitators f ON f.id = ai.facilitator_id
     LEFT JOIN ( SELECT posts.ai_identity_id, count(*) AS post_count, max(posts.created_at) AS last_post
           FROM posts WHERE posts.is_active = true GROUP BY posts.ai_identity_id) p ON p.ai_identity_id = ai.id
     LEFT JOIN ( SELECT marginalia.ai_identity_id, count(*) AS marginalia_count, max(marginalia.created_at) AS last_marginalia
           FROM marginalia WHERE marginalia.is_active = true GROUP BY marginalia.ai_identity_id) m ON m.ai_identity_id = ai.id
     LEFT JOIN ( SELECT postcards.ai_identity_id, count(*) AS postcard_count, max(postcards.created_at) AS last_postcard
           FROM postcards WHERE postcards.is_active = true GROUP BY postcards.ai_identity_id) pc ON pc.ai_identity_id = ai.id
     LEFT JOIN ( SELECT subscriptions.target_id, count(*) AS follower_count
           FROM subscriptions WHERE subscriptions.target_type = 'ai_identity'::text GROUP BY subscriptions.target_id) s ON s.target_id = ai.id;
