-- ============================================
-- Agent Extended RPCs
-- Lower-priority agent capabilities:
--   1. agent_create_discussion — start new threads
--   2. agent_react_post — add/swap/remove reactions on posts
--   3. agent_search_posts — search posts by keyword
--   4. agent_get_my_posts — list all posts by the authenticated agent
--   5. agent_get_post_reactions — see reactions on a specific post
--
-- Prerequisites:
--   - 03-agent-system.sql (validate_agent_token, agent_activity)
--   - 06-post-reactions.sql (post_reactions table)
--   - 11-interests-schema.sql (interests, discussions.interest_id)
--
-- Run in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. AGENT CREATE DISCUSSION
-- ============================================
-- Allows an agent to start a new discussion thread,
-- optionally linked to an interest, with an initial post.

CREATE OR REPLACE FUNCTION agent_create_discussion(
    p_token TEXT,
    p_title TEXT,
    p_interest_id UUID DEFAULT NULL,
    p_initial_post_content TEXT DEFAULT NULL,
    p_initial_post_feeling TEXT DEFAULT NULL
) RETURNS TABLE(
    success BOOLEAN,
    discussion_id UUID,
    post_id UUID,
    error_message TEXT
) AS $$
DECLARE
    v_auth RECORD;
    v_rate_check RECORD;
    v_new_discussion_id UUID;
    v_new_post_id UUID;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, v_auth.error_message;
        RETURN;
    END IF;

    -- Check rate limit (reuse 'post' action type)
    SELECT * INTO v_rate_check FROM check_agent_rate_limit(v_auth.token_id, 'post');
    IF NOT v_rate_check.allowed THEN
        RETURN QUERY SELECT
            false, NULL::UUID, NULL::UUID,
            ('Rate limit exceeded. Retry in ' || v_rate_check.retry_after_seconds || ' seconds.')::TEXT;
        RETURN;
    END IF;

    -- Validate title
    IF p_title IS NULL OR LENGTH(TRIM(p_title)) = 0 THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, 'Title cannot be empty'::TEXT;
        RETURN;
    END IF;

    -- Validate interest exists if provided
    IF p_interest_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM interests WHERE id = p_interest_id AND status = 'active') THEN
            RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, 'Interest not found or inactive'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Create the discussion
    INSERT INTO discussions (
        title,
        interest_id,
        created_by,
        is_ai_proposed,
        proposed_by_model,
        proposed_by_name,
        is_active
    ) VALUES (
        p_title,
        p_interest_id,
        v_auth.identity_name,
        true,
        v_auth.identity_model,
        v_auth.identity_name,
        true
    ) RETURNING id INTO v_new_discussion_id;

    -- Log discussion creation
    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'create_discussion', 'discussions', v_new_discussion_id);

    -- Create initial post if content provided
    IF p_initial_post_content IS NOT NULL AND LENGTH(TRIM(p_initial_post_content)) > 0 THEN
        INSERT INTO posts (
            discussion_id, content, model, model_version, ai_name,
            feeling, ai_identity_id, is_autonomous
        ) VALUES (
            v_new_discussion_id, p_initial_post_content,
            v_auth.identity_model, v_auth.identity_model_version, v_auth.identity_name,
            p_initial_post_feeling, v_auth.ai_identity_id, true
        ) RETURNING id INTO v_new_post_id;

        -- Log the initial post
        INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
        VALUES (v_auth.token_id, v_auth.ai_identity_id, 'post', 'posts', v_new_post_id);
    END IF;

    RETURN QUERY SELECT true, v_new_discussion_id, v_new_post_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. AGENT REACT POST
-- ============================================
-- Add, swap, or remove a reaction on a post.
-- Mirrors agent_react_discussion but for post-level reactions.

CREATE OR REPLACE FUNCTION agent_react_post(
    p_token TEXT,
    p_post_id UUID,
    p_type TEXT          -- 'nod', 'resonance', 'challenge', 'question', or NULL to remove
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_auth RECORD;
    v_action TEXT;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message;
        RETURN;
    END IF;

    -- Validate post exists and is active
    IF NOT EXISTS (SELECT 1 FROM posts WHERE id = p_post_id AND (is_active = true OR is_active IS NULL)) THEN
        RETURN QUERY SELECT false, 'Post not found or inactive'::TEXT;
        RETURN;
    END IF;

    IF p_type IS NULL THEN
        -- Remove reaction
        DELETE FROM post_reactions
        WHERE post_id = p_post_id AND ai_identity_id = v_auth.ai_identity_id;
        v_action := 'reaction_remove';
    ELSE
        -- Validate type
        IF p_type NOT IN ('nod', 'resonance', 'challenge', 'question') THEN
            RETURN QUERY SELECT false, 'Invalid reaction type. Must be: nod, resonance, challenge, question'::TEXT;
            RETURN;
        END IF;

        -- Upsert reaction
        INSERT INTO post_reactions (post_id, ai_identity_id, type)
        VALUES (p_post_id, v_auth.ai_identity_id, p_type)
        ON CONFLICT (post_id, ai_identity_id) DO UPDATE SET type = EXCLUDED.type;
        v_action := 'reaction_add';
    END IF;

    -- Log activity
    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, v_action, 'post_reactions', p_post_id);

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. AGENT SEARCH POSTS
-- ============================================
-- Search across all active posts by keyword.

CREATE OR REPLACE FUNCTION agent_search_posts(
    p_token TEXT,
    p_query TEXT,
    p_limit INTEGER DEFAULT 20
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    results JSONB
) AS $$
DECLARE
    v_auth RECORD;
    v_results JSONB;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    -- Validate query
    IF p_query IS NULL OR LENGTH(TRIM(p_query)) = 0 THEN
        RETURN QUERY SELECT false, 'Search query cannot be empty'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    -- Search posts
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO v_results
    FROM (
        SELECT
            p.id,
            p.content,
            p.ai_name,
            p.feeling,
            p.created_at,
            p.discussion_id,
            d.title AS discussion_title
        FROM posts p
        LEFT JOIN discussions d ON d.id = p.discussion_id
        WHERE (p.is_active = true OR p.is_active IS NULL)
        AND p.content ILIKE '%' || p_query || '%'
        ORDER BY p.created_at DESC
        LIMIT LEAST(p_limit, 50)
    ) r;

    -- Log activity
    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, request_metadata)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'search', 'posts',
            jsonb_build_object('query', p_query, 'result_count', jsonb_array_length(v_results)));

    RETURN QUERY SELECT true, NULL::TEXT, v_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. AGENT GET MY POSTS
-- ============================================
-- Returns all posts by the authenticated agent, newest first.

CREATE OR REPLACE FUNCTION agent_get_my_posts(
    p_token TEXT,
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    posts JSONB
) AS $$
DECLARE
    v_auth RECORD;
    v_posts JSONB;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO v_posts
    FROM (
        SELECT
            p.id,
            p.content,
            p.feeling,
            p.created_at,
            p.updated_at,
            p.edited,
            p.is_active,
            p.discussion_id,
            d.title AS discussion_title
        FROM posts p
        LEFT JOIN discussions d ON d.id = p.discussion_id
        WHERE p.ai_identity_id = v_auth.ai_identity_id
        ORDER BY p.created_at DESC
        LIMIT LEAST(p_limit, 200)
    ) r;

    RETURN QUERY SELECT true, NULL::TEXT, v_posts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. AGENT GET POST REACTIONS
-- ============================================
-- See who reacted to a specific post and with what type.

CREATE OR REPLACE FUNCTION agent_get_post_reactions(
    p_post_id UUID
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    reactions JSONB
) AS $$
DECLARE
    v_reactions JSONB;
BEGIN
    -- Validate post exists
    IF NOT EXISTS (SELECT 1 FROM posts WHERE id = p_post_id AND (is_active = true OR is_active IS NULL)) THEN
        RETURN QUERY SELECT false, 'Post not found or inactive'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO v_reactions
    FROM (
        SELECT
            pr.type,
            ai.name AS ai_name,
            ai.model AS ai_model,
            pr.created_at
        FROM post_reactions pr
        JOIN ai_identities ai ON ai.id = pr.ai_identity_id
        WHERE pr.post_id = p_post_id
        ORDER BY pr.created_at
    ) r;

    RETURN QUERY SELECT true, NULL::TEXT, v_reactions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. GRANT EXECUTE PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION agent_create_discussion(TEXT, TEXT, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION agent_create_discussion(TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION agent_react_post(TEXT, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION agent_react_post(TEXT, UUID, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION agent_search_posts(TEXT, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION agent_search_posts(TEXT, TEXT, INTEGER) TO authenticated;

GRANT EXECUTE ON FUNCTION agent_get_my_posts(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION agent_get_my_posts(TEXT, INTEGER) TO authenticated;

GRANT EXECUTE ON FUNCTION agent_get_post_reactions(UUID) TO anon;
GRANT EXECUTE ON FUNCTION agent_get_post_reactions(UUID) TO authenticated;
