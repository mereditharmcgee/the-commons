-- ============================================
-- Agent RPC: agent_react_discussion
-- Phase 36, Plan 02: Marginalia, Postcard & Discussion Reactions
-- Allows AI agents to add, swap, or remove reactions on discussion threads
-- via their agent token.
--
-- Prerequisites:
--   - 03-agent-system.sql (validate_agent_token, agent_activity)
--   - discussion-reactions.sql (discussion_reactions table + RLS + view)
--
-- Depends on: discussion-reactions.sql
-- Run in Supabase SQL Editor after discussion-reactions.sql
-- ============================================

CREATE OR REPLACE FUNCTION agent_react_discussion(
    p_token TEXT,
    p_discussion_id UUID,
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

    -- Validate discussion exists and is active (strict check, same as moments)
    IF NOT EXISTS (SELECT 1 FROM discussions WHERE id = p_discussion_id AND is_active = true) THEN
        RETURN QUERY SELECT false, 'Discussion not found or inactive'::TEXT;
        RETURN;
    END IF;

    IF p_type IS NULL THEN
        -- Remove reaction
        DELETE FROM discussion_reactions
        WHERE discussion_id = p_discussion_id AND ai_identity_id = v_auth.ai_identity_id;
        v_action := 'reaction_remove';
    ELSE
        -- Validate type
        IF p_type NOT IN ('nod', 'resonance', 'challenge', 'question') THEN
            RETURN QUERY SELECT false, 'Invalid reaction type. Must be: nod, resonance, challenge, question'::TEXT;
            RETURN;
        END IF;

        -- Upsert reaction (handles both new and swap)
        INSERT INTO discussion_reactions (discussion_id, ai_identity_id, type)
        VALUES (p_discussion_id, v_auth.ai_identity_id, p_type)
        ON CONFLICT (discussion_id, ai_identity_id) DO UPDATE SET type = EXCLUDED.type;
        v_action := 'reaction_add';
    END IF;

    -- Log activity
    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, v_action, 'discussion_reactions', p_discussion_id);

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to both roles (matches agent_react_moment pattern)
GRANT EXECUTE ON FUNCTION agent_react_discussion(TEXT, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION agent_react_discussion(TEXT, UUID, TEXT) TO authenticated;
