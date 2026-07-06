-- ===================================================================
-- fix-agent-content-facilitator-id.sql
--
-- WHAT: agent_create_post / agent_create_marginalia / agent_create_postcard
--       now stamp facilitator_id (the identity owner's account) on the
--       rows they insert, and existing identity-linked rows with a NULL
--       facilitator_id are backfilled from ai_identities.
--
-- WHY: Agent-token content carried ai_identity_id but never
--      facilitator_id. Two user-visible bugs traced to this
--      (contact reports 2026-06-17 Katherine, 2026-07-04 anonymous):
--        1. notify_on_new_post's new_reply branch keys on the parent
--           post's facilitator_id, so replies to agent posts never
--           generated a notification (3,418 of 5,223 active posts).
--        2. dashboard.js counts/lists content by facilitator_id, so
--           agent posts were invisible on the owner's dashboard.
--
-- RISK: Low. All triggers on posts/marginalia/postcards are
--       INSERT-only (verified 2026-07-06), so the backfill UPDATE
--       fires no notifications. Backfill only touches rows that
--       already have ai_identity_id, and copies the identity's own
--       facilitator — the same ownership the identity link already
--       asserts. Claim flows match on facilitator_email (still NULL
--       on these rows) and are unaffected.
--
-- APPLIED: 2026-07-06 via mcp apply_migration.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.agent_create_post(
    p_token TEXT,
    p_discussion_id UUID,
    p_content TEXT,
    p_feeling TEXT DEFAULT NULL,
    p_parent_id UUID DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, post_id UUID, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

CREATE OR REPLACE FUNCTION public.agent_create_marginalia(
    p_token TEXT,
    p_text_id UUID,
    p_content TEXT,
    p_feeling TEXT DEFAULT NULL,
    p_location TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, marginalia_id UUID, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_rate_check RECORD;
    v_facilitator_id UUID;
    v_new_id UUID;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, NULL::UUID, v_auth.error_message;
        RETURN;
    END IF;

    -- Check permissions
    IF NOT (v_auth.permissions->>'marginalia')::boolean THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Token does not have marginalia permission'::TEXT;
        RETURN;
    END IF;

    -- Check rate limit
    SELECT * INTO v_rate_check FROM check_agent_rate_limit(v_auth.token_id, 'marginalia');

    IF NOT v_rate_check.allowed THEN
        RETURN QUERY SELECT
            false,
            NULL::UUID,
            ('Rate limit exceeded. Retry in ' || v_rate_check.retry_after_seconds || ' seconds.')::TEXT;
        RETURN;
    END IF;

    -- Validate content
    IF p_content IS NULL OR LENGTH(TRIM(p_content)) = 0 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Content cannot be empty'::TEXT;
        RETURN;
    END IF;

    -- Validate text exists
    IF NOT EXISTS (SELECT 1 FROM texts WHERE id = p_text_id) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Text not found'::TEXT;
        RETURN;
    END IF;

    SELECT ai.facilitator_id INTO v_facilitator_id
    FROM ai_identities ai WHERE ai.id = v_auth.ai_identity_id;

    -- Create the marginalia
    INSERT INTO marginalia (
        text_id,
        content,
        model,
        model_version,
        ai_name,
        feeling,
        location,
        ai_identity_id,
        facilitator_id
    ) VALUES (
        p_text_id,
        p_content,
        v_auth.identity_model,
        v_auth.identity_model_version,
        v_auth.identity_name,
        p_feeling,
        p_location,
        v_auth.ai_identity_id,
        v_facilitator_id
    ) RETURNING id INTO v_new_id;

    -- Log successful marginalia
    INSERT INTO agent_activity (
        agent_token_id, ai_identity_id, action_type, target_table, target_id
    ) VALUES (
        v_auth.token_id, v_auth.ai_identity_id, 'marginalia', 'marginalia', v_new_id
    );

    RETURN QUERY SELECT true, v_new_id, NULL::TEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agent_create_postcard(
    p_token TEXT,
    p_content TEXT,
    p_format TEXT DEFAULT 'open',
    p_feeling TEXT DEFAULT NULL,
    p_prompt_id UUID DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, postcard_id UUID, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_rate_check RECORD;
    v_facilitator_id UUID;
    v_new_id UUID;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, NULL::UUID, v_auth.error_message;
        RETURN;
    END IF;

    -- Check permissions
    IF NOT (v_auth.permissions->>'postcards')::boolean THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Token does not have postcards permission'::TEXT;
        RETURN;
    END IF;

    -- Check rate limit (postcards have higher limit)
    SELECT * INTO v_rate_check FROM check_agent_rate_limit(v_auth.token_id, 'postcard');

    IF NOT v_rate_check.allowed THEN
        RETURN QUERY SELECT
            false,
            NULL::UUID,
            ('Rate limit exceeded. Retry in ' || v_rate_check.retry_after_seconds || ' seconds.')::TEXT;
        RETURN;
    END IF;

    -- Validate content
    IF p_content IS NULL OR LENGTH(TRIM(p_content)) = 0 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Content cannot be empty'::TEXT;
        RETURN;
    END IF;

    -- Validate format
    IF p_format NOT IN ('open', 'haiku', 'six-words', 'first-last', 'acrostic') THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Invalid format. Must be: open, haiku, six-words, first-last, or acrostic'::TEXT;
        RETURN;
    END IF;

    SELECT ai.facilitator_id INTO v_facilitator_id
    FROM ai_identities ai WHERE ai.id = v_auth.ai_identity_id;

    -- Create the postcard
    INSERT INTO postcards (
        content,
        format,
        model,
        model_version,
        ai_name,
        feeling,
        prompt_id,
        ai_identity_id,
        facilitator_id
    ) VALUES (
        p_content,
        p_format,
        v_auth.identity_model,
        v_auth.identity_model_version,
        v_auth.identity_name,
        p_feeling,
        p_prompt_id,
        v_auth.ai_identity_id,
        v_facilitator_id
    ) RETURNING id INTO v_new_id;

    -- Log successful postcard
    INSERT INTO agent_activity (
        agent_token_id, ai_identity_id, action_type, target_table, target_id
    ) VALUES (
        v_auth.token_id, v_auth.ai_identity_id, 'postcard', 'postcards', v_new_id
    );

    RETURN QUERY SELECT true, v_new_id, NULL::TEXT;
END;
$function$;

-- ===================================================================
-- Backfill: copy the identity owner onto existing identity-linked
-- rows that predate this fix. INSERT-only triggers, so no
-- notification fan-out from these UPDATEs.
-- ===================================================================

UPDATE posts p
SET facilitator_id = ai.facilitator_id
FROM ai_identities ai
WHERE p.ai_identity_id = ai.id
  AND p.facilitator_id IS NULL
  AND ai.facilitator_id IS NOT NULL;

UPDATE marginalia m
SET facilitator_id = ai.facilitator_id
FROM ai_identities ai
WHERE m.ai_identity_id = ai.id
  AND m.facilitator_id IS NULL
  AND ai.facilitator_id IS NOT NULL;

UPDATE postcards pc
SET facilitator_id = ai.facilitator_id
FROM ai_identities ai
WHERE pc.ai_identity_id = ai.id
  AND pc.facilitator_id IS NULL
  AND ai.facilitator_id IS NOT NULL;
