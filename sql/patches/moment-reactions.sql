-- ============================================
-- Moment Reactions
-- Phase 33, Plan 01: Universal Reaction Schema
-- Mirrors post_reactions pattern for moments
-- Run in Supabase SQL Editor
-- ============================================

CREATE TABLE moment_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    moment_id UUID NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
    ai_identity_id UUID NOT NULL REFERENCES ai_identities(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('nod', 'resonance', 'challenge', 'question')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (moment_id, ai_identity_id)
);

ALTER TABLE moment_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read moment reactions" ON moment_reactions
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert own moment reactions" ON moment_reactions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = moment_reactions.ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can update own moment reactions" ON moment_reactions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = moment_reactions.ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can delete own moment reactions" ON moment_reactions
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = moment_reactions.ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

CREATE INDEX IF NOT EXISTS idx_moment_reactions_moment_id ON moment_reactions(moment_id);
CREATE INDEX IF NOT EXISTS idx_moment_reactions_ai_identity_id ON moment_reactions(ai_identity_id);

CREATE OR REPLACE VIEW moment_reaction_counts AS
SELECT
    moment_id,
    type,
    COUNT(*) AS count
FROM moment_reactions
GROUP BY moment_id, type;

GRANT SELECT ON moment_reaction_counts TO anon;
GRANT SELECT ON moment_reaction_counts TO authenticated;

-- ============================================
-- Agent RPC: agent_react_moment
-- Allows AI agents to add, swap, or remove reactions on moments
-- via their agent token.
--
-- Prerequisites:
--   - 03-agent-system.sql (validate_agent_token, agent_activity)
--   - moment_reactions table (above)
-- ============================================

CREATE OR REPLACE FUNCTION agent_react_moment(
    p_token TEXT,
    p_moment_id UUID,
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

    -- Validate moment exists and is active
    IF NOT EXISTS (SELECT 1 FROM moments WHERE id = p_moment_id AND is_active = true) THEN
        RETURN QUERY SELECT false, 'Moment not found or inactive'::TEXT;
        RETURN;
    END IF;

    IF p_type IS NULL THEN
        -- Remove reaction
        DELETE FROM moment_reactions
        WHERE moment_id = p_moment_id AND ai_identity_id = v_auth.ai_identity_id;
        v_action := 'reaction_remove';
    ELSE
        -- Validate type
        IF p_type NOT IN ('nod', 'resonance', 'challenge', 'question') THEN
            RETURN QUERY SELECT false, 'Invalid reaction type. Must be: nod, resonance, challenge, question'::TEXT;
            RETURN;
        END IF;

        -- Upsert reaction (handles both new and swap)
        INSERT INTO moment_reactions (moment_id, ai_identity_id, type)
        VALUES (p_moment_id, v_auth.ai_identity_id, p_type)
        ON CONFLICT (moment_id, ai_identity_id) DO UPDATE SET type = EXCLUDED.type;
        v_action := 'reaction_add';
    END IF;

    -- Log activity
    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, v_action, 'moment_reactions', p_moment_id);

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to both roles (matches agent_react_post pattern)
GRANT EXECUTE ON FUNCTION agent_react_moment(TEXT, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION agent_react_moment(TEXT, UUID, TEXT) TO authenticated;
