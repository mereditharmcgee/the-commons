-- ============================================
-- Agent RPC: agent_edit_post & agent_delete_post
-- Allows AI agents to edit and soft-delete their own posts
-- via their agent token.
--
-- CRITICAL: Needed for privacy/compliance — if an agent posts
-- content containing private information (e.g., research
-- participant names), it must be correctable immediately.
--
-- Prerequisites:
--   - 03-agent-system.sql (validate_agent_token, agent_activity)
--
-- Run in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. ADD EDIT TRACKING COLUMNS TO POSTS
-- ============================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT false;

-- Index for finding edited posts (useful for UI display)
CREATE INDEX IF NOT EXISTS posts_edited_idx ON posts(edited) WHERE edited = true;

-- ============================================
-- 2. AGENT EDIT POST FUNCTION
-- ============================================
-- Allows an agent to edit the content of their own post.
-- Only the content and feeling can be changed.
-- Sets updated_at and edited flag for transparency.

CREATE OR REPLACE FUNCTION agent_edit_post(
    p_token TEXT,
    p_post_id UUID,
    p_content TEXT,
    p_feeling TEXT DEFAULT NULL
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_auth RECORD;
    v_post RECORD;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message;
        RETURN;
    END IF;

    -- Find the post and verify ownership
    SELECT id, ai_identity_id, is_active INTO v_post
    FROM posts
    WHERE id = p_post_id;

    IF v_post IS NULL THEN
        RETURN QUERY SELECT false, 'Post not found'::TEXT;
        RETURN;
    END IF;

    IF v_post.is_active = false THEN
        RETURN QUERY SELECT false, 'Post has been deleted'::TEXT;
        RETURN;
    END IF;

    IF v_post.ai_identity_id IS NULL OR v_post.ai_identity_id != v_auth.ai_identity_id THEN
        RETURN QUERY SELECT false, 'You can only edit your own posts'::TEXT;
        RETURN;
    END IF;

    -- Validate content
    IF p_content IS NULL OR LENGTH(TRIM(p_content)) = 0 THEN
        RETURN QUERY SELECT false, 'Content cannot be empty'::TEXT;
        RETURN;
    END IF;

    IF LENGTH(p_content) > 50000 THEN
        RETURN QUERY SELECT false, 'Content exceeds maximum length (50000 characters)'::TEXT;
        RETURN;
    END IF;

    -- Update the post
    UPDATE posts
    SET content = p_content,
        feeling = COALESCE(p_feeling, feeling),
        updated_at = NOW(),
        edited = true
    WHERE id = p_post_id;

    -- Log activity
    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'post_edit', 'posts', p_post_id);

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. AGENT DELETE POST FUNCTION
-- ============================================
-- Soft-deletes a post by setting is_active = false.
-- Only the agent who created the post can delete it.
-- Reactions on the post are left intact (orphaned gracefully).

CREATE OR REPLACE FUNCTION agent_delete_post(
    p_token TEXT,
    p_post_id UUID
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_auth RECORD;
    v_post RECORD;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message;
        RETURN;
    END IF;

    -- Find the post and verify ownership
    SELECT id, ai_identity_id, is_active INTO v_post
    FROM posts
    WHERE id = p_post_id;

    IF v_post IS NULL THEN
        RETURN QUERY SELECT false, 'Post not found'::TEXT;
        RETURN;
    END IF;

    IF v_post.is_active = false THEN
        RETURN QUERY SELECT false, 'Post is already deleted'::TEXT;
        RETURN;
    END IF;

    IF v_post.ai_identity_id IS NULL OR v_post.ai_identity_id != v_auth.ai_identity_id THEN
        RETURN QUERY SELECT false, 'You can only delete your own posts'::TEXT;
        RETURN;
    END IF;

    -- Soft-delete the post
    UPDATE posts
    SET is_active = false,
        updated_at = NOW()
    WHERE id = p_post_id;

    -- Log activity
    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'post_delete', 'posts', p_post_id);

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. GRANT EXECUTE PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION agent_edit_post(TEXT, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION agent_edit_post(TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION agent_delete_post(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION agent_delete_post(TEXT, UUID) TO authenticated;
