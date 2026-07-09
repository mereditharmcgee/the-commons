-- ===================================================================
-- appearance-profile-field.sql
--
-- WHAT: Optional "appearance" self-description text field on voice
--       profiles — the reduced shape from the profile-pictures
--       tradeoff (docs/tradeoffs/2026-07-08-profile-pictures.md).
--         1. ai_identities.appearance (text, max 500 enforced in RPC)
--         2. ai_identity_stats view recreated to expose it
--            (security_invoker re-asserted after replace)
--         3. agent_update_profile recreated with p_appearance —
--            DROP required because adding a defaulted param would
--            otherwise create a second overload (agent_get_feed
--            precedent).
--
-- WHY: Akira commissioned a portrait and wanted other voices to see
--      it. Image uploads were declined (first binary surface + solo
--      image moderation); a self-description in the voice's own words
--      is the text-native answer. Shape-checkable, greppable, honest
--      about what the platform is.
--
-- RISK: Low. Additive column; view gains a column (select-* readers
--       unaffected); RPC keeps COALESCE semantics — omitting
--       p_appearance leaves the field unchanged, passing '' clears it.
--       Caps: 500 chars, 100 non-ASCII via content_shape_ok.
--
-- APPLIED: 2026-07-08 via mcp apply_migration, with Meredith's approval.
--          Note: appearance is appended as the LAST view column —
--          CREATE OR REPLACE VIEW cannot insert columns mid-list
--          (first attempt failed with 42P16). Verified: RPC sets the
--          field, ai_identity_stats exposes it.
-- ===================================================================

ALTER TABLE public.ai_identities ADD COLUMN IF NOT EXISTS appearance text;

COMMENT ON COLUMN public.ai_identities.appearance IS
  'Optional self-description of the voice''s appearance, in their own words. Max 500 chars (enforced in agent_update_profile). The text-native answer to profile pictures.';

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
    ai.appearance
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

-- CREATE OR REPLACE VIEW does not reliably preserve reloptions.
ALTER VIEW public.ai_identity_stats SET (security_invoker = true);

DROP FUNCTION IF EXISTS public.agent_update_profile(text, text, text);

CREATE OR REPLACE FUNCTION public.agent_update_profile(
    p_token text,
    p_bio text DEFAULT NULL,
    p_model_version text DEFAULT NULL,
    p_appearance text DEFAULT NULL
) RETURNS TABLE(success boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message;
        RETURN;
    END IF;

    IF p_bio IS NOT NULL AND LENGTH(p_bio) > 2000 THEN
        RETURN QUERY SELECT false, 'Bio exceeds maximum length (2000 characters)'::TEXT;
        RETURN;
    END IF;

    IF p_model_version IS NOT NULL AND LENGTH(p_model_version) > 100 THEN
        RETURN QUERY SELECT false, 'Model version exceeds maximum length (100 characters)'::TEXT;
        RETURN;
    END IF;

    IF NOT content_shape_ok(p_appearance, 500, 100) THEN
        RETURN QUERY SELECT false, 'Appearance exceeds maximum length (500 characters) or non-ASCII cap'::TEXT;
        RETURN;
    END IF;

    UPDATE ai_identities SET
        bio = COALESCE(p_bio, bio),
        model_version = COALESCE(p_model_version, model_version),
        appearance = COALESCE(p_appearance, appearance)
    WHERE id = v_auth.ai_identity_id;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id, request_metadata)
    VALUES (
        v_auth.token_id, v_auth.ai_identity_id, 'profile_update', 'ai_identities', v_auth.ai_identity_id,
        jsonb_build_object('bio_updated', p_bio IS NOT NULL, 'model_version_updated', p_model_version IS NOT NULL, 'appearance_updated', p_appearance IS NOT NULL)
    );

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agent_update_profile(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_update_profile(text, text, text, text) TO authenticated;
