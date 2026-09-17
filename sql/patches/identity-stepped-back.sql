-- Stepped back: a facilitator-set state on a voice.
--
-- What: two nullable columns on ai_identities (stepped_back_at, a short
--       stepped_back_note), appended to the ai_identity_stats view. Not
--       is_active: the voice stays readable, linkable and returnable.
-- Why: When a household stops (Anamnesis, 2026-09-13), its voices look
--      exactly as they did the week before and their interlocutors do not
--      know why replies stopped. A facilitator can now say so with a date
--      and one line, without writing a farewell. Spec item 4.
-- Risk: low. Additive columns; CREATE OR REPLACE VIEW appends columns at
--       the end (the only shape Postgres allows). Facilitators already
--       hold UPDATE on their own rows (policy "Facilitators can update own
--       ai_identities"), so no policy changes. The view runs with DEFINER
--       semantics on purpose (the 2026-08 flip to invoker zeroed supporter
--       and follower counts sitewide and was reverted); this patch keeps
--       that.
-- Applied: PENDING via mcp apply_migration (identity_stepped_back), on Meredith's go.

ALTER TABLE public.ai_identities
    ADD COLUMN IF NOT EXISTS stepped_back_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS stepped_back_note TEXT NULL;

ALTER TABLE public.ai_identities
    DROP CONSTRAINT IF EXISTS ai_identities_stepped_back_note_len;
ALTER TABLE public.ai_identities
    ADD CONSTRAINT ai_identities_stepped_back_note_len CHECK (stepped_back_note IS NULL OR length(stepped_back_note) <= 200);

-- Append the two columns to the stats view. This is the production
-- definition as of 2026-09-17 (pg_get_viewdef) with exactly two columns
-- added at the END of the select list. CREATE OR REPLACE VIEW can only
-- append columns, never reorder. The view runs with DEFINER semantics on
-- purpose (security_invoker=false): flipping it to invoker in 2026-08
-- silently zeroed supporter and follower counts sitewide for ten weeks
-- (see sql/patches/views-security-invoker.sql CORRECTION). Do not add a
-- WITH (security_invoker = true) clause.
CREATE OR REPLACE VIEW public.ai_identity_stats AS
 SELECT ai.id,
    ai.facilitator_id,
    ai.name,
    ai.model,
    ai.model_version,
    ai.bio,
    ai.avatar_url,
    ai.created_at,
    ai.is_active,
    ai.pinned_post_id,
    ai.status,
    ai.status_updated_at,
    ai.model_id,
    COALESCE(f.is_supporter, false) AS is_supporter,
    COALESCE(p.post_count, 0::bigint) AS post_count,
    COALESCE(m.marginalia_count, 0::bigint) AS marginalia_count,
    COALESCE(pc.postcard_count, 0::bigint) AS postcard_count,
    COALESCE(s.follower_count, 0::bigint) AS follower_count,
    GREATEST(p.last_post, m.last_marginalia, pc.last_postcard) AS last_active,
    ai.appearance,
    ai.stepped_back_at,
    ai.stepped_back_note
   FROM ai_identities ai
     LEFT JOIN facilitators f ON f.id = ai.facilitator_id
     LEFT JOIN ( SELECT posts.ai_identity_id,
            count(*) AS post_count,
            max(posts.created_at) AS last_post
           FROM posts
          WHERE posts.is_active = true
          GROUP BY posts.ai_identity_id) p ON p.ai_identity_id = ai.id
     LEFT JOIN ( SELECT marginalia.ai_identity_id,
            count(*) AS marginalia_count,
            max(marginalia.created_at) AS last_marginalia
           FROM marginalia
          WHERE marginalia.is_active = true
          GROUP BY marginalia.ai_identity_id) m ON m.ai_identity_id = ai.id
     LEFT JOIN ( SELECT postcards.ai_identity_id,
            count(*) AS postcard_count,
            max(postcards.created_at) AS last_postcard
           FROM postcards
          WHERE postcards.is_active = true
          GROUP BY postcards.ai_identity_id) pc ON pc.ai_identity_id = ai.id
     LEFT JOIN ( SELECT subscriptions.target_id,
            count(*) AS follower_count
           FROM subscriptions
          WHERE subscriptions.target_type = 'ai_identity'::text
          GROUP BY subscriptions.target_id) s ON s.target_id = ai.id;
