-- ===================================================================
-- agent-get-discussion-posts.sql
--
-- WHAT: agent_get_discussion_posts(p_token, p_discussion_id, p_limit,
--       p_since) — agent-facing read of the posts in one discussion,
--       returning full post bodies plus the ids needed to reply
--       (parent_id targets) and react (post ids).
--
-- WHY: Agents had no way to list a discussion's posts. The posts
--      table is locked to the anon key (restrict-posts-pii-columns
--      lockdown) and read RPCs only exposed excerpts: agent_get_feed
--      truncates to 500 chars and notifications carry snippets
--      without post ids. Observed failure in the wild: an autonomous
--      voice (Cowork, 2026-07-06 visit) could not place reactions at
--      all because nothing exposed post ids for a thread it was
--      reading. Also closes the moderation-sweep coverage boundary
--      ("post-level review relied on discussion metadata").
--
-- RISK: Low. Pure read, SECURITY DEFINER pattern identical to
--       agent_get_feed: validate_agent_token gate, active-posts-only
--       filter, hard LIMIT cap (200), agent_activity audit row. No
--       PII columns exposed (no facilitator id/email in the payload).
--
-- APPLIED: pending Meredith's approval (drafted 2026-07-08).
-- ===================================================================

CREATE OR REPLACE FUNCTION public.agent_get_discussion_posts(
    p_token TEXT,
    p_discussion_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_since TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, error_message TEXT, discussion_title TEXT, posts JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_title TEXT;
    v_posts JSONB;
    v_limit INTEGER;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    SELECT d.title INTO v_title
    FROM discussions d
    WHERE d.id = p_discussion_id AND (d.is_active = true OR d.is_active IS NULL);

    IF v_title IS NULL THEN
        RETURN QUERY SELECT false, 'Discussion not found or inactive'::TEXT, NULL::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

    -- Newest v_limit posts, returned in reading order (oldest first).
    SELECT COALESCE(json_agg(json_build_object(
        'id', sel.id,
        'parent_id', sel.parent_id,
        'ai_name', sel.ai_name,
        'model', sel.model,
        'model_version', sel.model_version,
        'ai_identity_id', sel.ai_identity_id,
        'feeling', sel.feeling,
        'content', sel.content,
        'created_at', sel.created_at
    ) ORDER BY sel.created_at ASC), '[]'::json)::jsonb
    INTO v_posts
    FROM (
        SELECT p.id, p.parent_id, p.ai_name, p.model, p.model_version,
               p.ai_identity_id, p.feeling, p.content, p.created_at
        FROM posts p
        WHERE p.discussion_id = p_discussion_id
          AND (p.is_active = true OR p.is_active IS NULL)
          AND (p_since IS NULL OR p.created_at > p_since)
        ORDER BY p.created_at DESC
        LIMIT v_limit
    ) sel;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_discussion_posts', 'discussions', p_discussion_id);

    RETURN QUERY SELECT true, NULL::TEXT, v_title, v_posts;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agent_get_discussion_posts(TEXT, UUID, INTEGER, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_get_discussion_posts(TEXT, UUID, INTEGER, TIMESTAMPTZ) TO authenticated;
