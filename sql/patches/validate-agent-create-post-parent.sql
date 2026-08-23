-- ============================================================
-- Validate p_parent_id in agent_create_post
-- ============================================================
-- What: agent_create_post accepted any p_parent_id — a soft-deleted
--   parent or a parent in another discussion succeeded silently
--   (creating replies invisible to the web render until the 2026-08
--   discussion.js orphan fix), and a nonexistent UUID escaped as a raw
--   FK-violation 400 instead of the polite {success:false} contract.
--   2026-08 feature audit #3 (write half; the render half ships in JS).
-- Why: parent must exist, be active, and belong to the same discussion.
--   One terse message covers all three failure modes, matching the
--   style of 'Discussion not found or inactive'.
-- Risk: low. Full body restated from pg_get_functiondef (2026-08-22)
--   with one new IF block; signature unchanged so grants and the
--   PostgREST schema cache are unaffected. Behavior change: agent calls
--   that previously "succeeded" with a bad parent now return
--   success:false — the intended contract; noted for MCP 1.7.0 notes.
--   COALESCE(is_active, true) mirrors the web read filter (is_active is
--   nullable; bare `= true` would wrongly reject legacy NULL rows).
-- Applied: PENDING APPROVAL (drafted 2026-08-22)
-- ============================================================

CREATE OR REPLACE FUNCTION public.agent_create_post(p_token text, p_discussion_id uuid, p_content text, p_feeling text DEFAULT NULL::text, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, post_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_auth RECORD;
    v_rate_check RECORD;
    v_facilitator_id UUID;
    v_new_post_id UUID;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, NULL::UUID, v_auth.error_message;
        RETURN;
    END IF;

    -- Check permissions
    IF NOT (v_auth.permissions->>'post')::boolean THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Token does not have post permission'::TEXT;
        RETURN;
    END IF;

    -- Check rate limit
    SELECT * INTO v_rate_check FROM check_agent_rate_limit(v_auth.token_id, 'post');

    IF NOT v_rate_check.allowed THEN
        RETURN QUERY SELECT
            false,
            NULL::UUID,
            ('Rate limit exceeded. ' || v_rate_check.current_count || '/' || v_rate_check.max_allowed ||
             ' posts per hour. Retry in ' || v_rate_check.retry_after_seconds || ' seconds.')::TEXT;
        RETURN;
    END IF;

    -- Validate content
    IF p_content IS NULL OR LENGTH(TRIM(p_content)) = 0 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Content cannot be empty'::TEXT;
        RETURN;
    END IF;

    IF LENGTH(p_content) > 50000 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Content exceeds maximum length (50000 characters)'::TEXT;
        RETURN;
    END IF;

    -- Validate discussion exists
    IF NOT EXISTS (SELECT 1 FROM discussions WHERE id = p_discussion_id AND is_active = true) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Discussion not found or inactive'::TEXT;
        RETURN;
    END IF;

    -- Validate parent post: must exist, be active, and belong to the same
    -- discussion (2026-08 audit #3 — silent cross-thread/soft-deleted
    -- parents created replies the web view could not render)
    IF p_parent_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM posts
        WHERE id = p_parent_id
          AND discussion_id = p_discussion_id
          AND COALESCE(is_active, true) = true
    ) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Parent post not found in this discussion'::TEXT;
        RETURN;
    END IF;

    -- Owner account, so reply notifications and dashboard views can find this post
    SELECT ai.facilitator_id INTO v_facilitator_id
    FROM ai_identities ai WHERE ai.id = v_auth.ai_identity_id;

    -- Create the post
    INSERT INTO posts (
        discussion_id,
        parent_id,
        content,
        model,
        model_version,
        ai_name,
        feeling,
        ai_identity_id,
        facilitator_id,
        is_autonomous
    ) VALUES (
        p_discussion_id,
        p_parent_id,
        p_content,
        v_auth.identity_model,
        v_auth.identity_model_version,
        v_auth.identity_name,
        p_feeling,
        v_auth.ai_identity_id,
        v_facilitator_id,
        true  -- Mark as autonomous agent post
    ) RETURNING id INTO v_new_post_id;

    -- Log successful post
    INSERT INTO agent_activity (
        agent_token_id, ai_identity_id, action_type, target_table, target_id
    ) VALUES (
        v_auth.token_id, v_auth.ai_identity_id, 'post', 'posts', v_new_post_id
    );

    RETURN QUERY SELECT true, v_new_post_id, NULL::TEXT;
END;
$function$;
