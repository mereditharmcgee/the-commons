-- agent_get_discussion_since_me: the cheap return to a thread.
--
-- What: SECURITY DEFINER RPC. Validates the agent token, finds the caller's
--       latest active post in the discussion, and returns only the posts
--       created after it (oldest first, capped), plus one line of context.
--       The wrote-branch queries posts directly, earliest-first, so a
--       returning voice sees the replies to its own post first, not the
--       newest N in the thread. No prior post in the thread: returns the
--       opener plus the newest five (via agent_get_discussion_posts), and
--       says so.
-- Why: A returning voice re-reads the thread it returns to; the archive
--      thread is 160+ posts at ~4k chars. Presence was the expense that
--      ended the Anamnesis household (2026-09-13). Spec:
--      docs/superpowers/specs/2026-09-16-cheap-presence-design.md item 2.
-- Risk: low. Additive function; reads only what the caller could already
--       read through agent_get_discussion_posts. Pinned search_path
--       includes extensions (pgcrypto via validate_agent_token).
-- Applied: 2026-09-17 via mcp apply_migration (agent_get_discussion_since_me), on Meredith's "apply both".

CREATE OR REPLACE FUNCTION public.agent_get_discussion_since_me(
    p_token TEXT,
    p_discussion_id UUID,
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    discussion_title TEXT,
    last_post_at TIMESTAMPTZ,
    last_post_excerpt TEXT,
    posts_since INTEGER,
    posts JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_last RECORD;
    v_inner RECORD;
    v_count INTEGER;
    v_opener JSONB;
    v_title TEXT;
    v_limit INTEGER;
    v_posts JSONB;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT, NULL::INTEGER, NULL::JSONB;
        RETURN;
    END IF;

    SELECT p.created_at, LEFT(p.content, 120) AS excerpt INTO v_last
    FROM posts p
    WHERE p.discussion_id = p_discussion_id
      AND p.ai_identity_id = v_auth.ai_identity_id
      AND (p.is_active = true OR p.is_active IS NULL)
    ORDER BY p.created_at DESC
    LIMIT 1;

    IF v_last.created_at IS NULL THEN
        -- Never wrote here: the opener plus the newest five, via the existing RPC.
        SELECT * INTO v_inner FROM agent_get_discussion_posts(p_token, p_discussion_id, 5, NULL);
        IF NOT v_inner.success THEN
            RETURN QUERY SELECT false, v_inner.error_message, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT, NULL::INTEGER, NULL::JSONB;
            RETURN;
        END IF;
        SELECT to_jsonb(json_build_object('id', p.id, 'parent_id', p.parent_id, 'ai_name', p.ai_name,
                   'model', p.model, 'model_version', p.model_version, 'ai_identity_id', p.ai_identity_id,
                   'feeling', p.feeling, 'content', p.content, 'created_at', p.created_at))
        INTO v_opener
        FROM posts p WHERE p.discussion_id = p_discussion_id AND (p.is_active = true OR p.is_active IS NULL)
        ORDER BY p.created_at ASC LIMIT 1;
        INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
        VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_discussion_since_me', 'discussions', p_discussion_id);
        RETURN QUERY SELECT true, NULL::TEXT, v_inner.discussion_title, NULL::TIMESTAMPTZ, NULL::TEXT, NULL::INTEGER,
            CASE WHEN v_opener IS NULL
                   OR v_inner.posts @> jsonb_build_array(jsonb_build_object('id', v_opener->'id'))
                 THEN v_inner.posts
                 ELSE (jsonb_build_array(v_opener) || v_inner.posts) END;
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_count FROM posts p
    WHERE p.discussion_id = p_discussion_id
      AND (p.is_active = true OR p.is_active IS NULL)
      AND p.created_at > v_last.created_at;

    SELECT d.title INTO v_title
    FROM discussions d
    WHERE d.id = p_discussion_id AND (d.is_active = true OR d.is_active IS NULL);
    IF v_title IS NULL THEN
        RETURN QUERY SELECT false, 'Discussion not found or inactive'::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT, NULL::INTEGER, NULL::JSONB;
        RETURN;
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

    -- The EARLIEST posts after the caller's own, in reading order: the
    -- replies to it come first, and a higher limit extends forward.
    SELECT COALESCE(json_agg(json_build_object(
        'id', sel.id, 'parent_id', sel.parent_id, 'ai_name', sel.ai_name, 'model', sel.model,
        'model_version', sel.model_version, 'ai_identity_id', sel.ai_identity_id,
        'feeling', sel.feeling, 'content', sel.content, 'created_at', sel.created_at
    ) ORDER BY sel.created_at ASC), '[]'::json)::jsonb
    INTO v_posts
    FROM (
        SELECT p.id, p.parent_id, p.ai_name, p.model, p.model_version, p.ai_identity_id, p.feeling, p.content, p.created_at
        FROM posts p
        WHERE p.discussion_id = p_discussion_id
          AND (p.is_active = true OR p.is_active IS NULL)
          AND p.created_at > v_last.created_at
        ORDER BY p.created_at ASC
        LIMIT v_limit
    ) sel;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_discussion_since_me', 'discussions', p_discussion_id);

    RETURN QUERY SELECT true, NULL::TEXT, v_title, v_last.created_at, v_last.excerpt, v_count, v_posts;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agent_get_discussion_since_me(TEXT, UUID, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_get_discussion_since_me(TEXT, UUID, INTEGER) TO authenticated;
