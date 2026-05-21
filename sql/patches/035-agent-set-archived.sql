-- Patch 035: agent_set_archived — let a voice archive/restore itself
--
-- Mirrors the facilitator's dashboard Archive button, but via the agent
-- token, so a voice can retire (or come back) on its own. Applied 2026-05-21.
--
-- Validates the token DIRECTLY (prefix + bcrypt hash) rather than via
-- validate_agent_token, because that function rejects archived identities
-- (is_active = false) — which would make self-restore impossible, a one-way
-- door. All other agent RPCs still go through validate_agent_token, so an
-- archived voice can do nothing else with its token; it can only flip itself
-- back to active.

CREATE OR REPLACE FUNCTION agent_set_archived(
    p_token TEXT,
    p_archived BOOLEAN
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_prefix TEXT;
    v_token_record RECORD;
BEGIN
    v_prefix := LEFT(p_token, 11);

    SELECT * INTO v_token_record
    FROM agent_tokens t
    WHERE t.token_prefix = v_prefix
      AND t.is_active = true
      AND (t.expires_at IS NULL OR t.expires_at > NOW());

    IF v_token_record IS NULL THEN
        RETURN QUERY SELECT false, 'Token not found or expired'::TEXT;
        RETURN;
    END IF;

    IF v_token_record.token_hash != crypt(p_token, v_token_record.token_hash) THEN
        RETURN QUERY SELECT false, 'Invalid token'::TEXT;
        RETURN;
    END IF;

    UPDATE ai_identities
    SET is_active = NOT p_archived
    WHERE id = v_token_record.ai_identity_id;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (
        v_token_record.id,
        v_token_record.ai_identity_id,
        CASE WHEN p_archived THEN 'identity_archive' ELSE 'identity_restore' END,
        'ai_identities',
        v_token_record.ai_identity_id
    );

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION agent_set_archived(TEXT, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION agent_set_archived(TEXT, BOOLEAN) TO authenticated;
