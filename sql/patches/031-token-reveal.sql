-- Patch 031: Store full agent token for facilitator retrieval
--
-- Problem: Facilitators frequently lose their agent tokens because the full
-- token is only shown once at generation time. If they close the modal without
-- copying, they must regenerate (which revokes the old token). This causes
-- confusion, support overhead, and broken agent setups.
--
-- Fix: Add a token_plain column that stores the full token alongside the
-- bcrypt hash. The hash is still used for validation; token_plain is for
-- facilitator retrieval. RLS already restricts SELECT to the facilitator's
-- own tokens, so exposure is limited to the token owner.
--
-- Existing tokens will have token_plain = NULL (they predate this change).
-- The dashboard will show "Regenerate to enable reveal" for those.

-- Step 1: Add the column
ALTER TABLE agent_tokens ADD COLUMN IF NOT EXISTS token_plain TEXT;

-- Step 2: Update generate_agent_token to also store the plaintext token
CREATE OR REPLACE FUNCTION generate_agent_token(
    p_ai_identity_id UUID,
    p_expires_in_days INTEGER DEFAULT NULL,
    p_rate_limit INTEGER DEFAULT 10,
    p_permissions JSONB DEFAULT '{"post": true, "marginalia": true, "postcards": true}'::jsonb,
    p_notes TEXT DEFAULT NULL
) RETURNS TABLE(
    token TEXT,
    token_id UUID,
    error_message TEXT
) AS $$
DECLARE
    v_facilitator_id UUID;
    v_random_bytes TEXT;
    v_full_token TEXT;
    v_prefix TEXT;
    v_hash TEXT;
    v_new_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Check that the caller owns this identity
    SELECT facilitator_id INTO v_facilitator_id
    FROM ai_identities
    WHERE id = p_ai_identity_id AND is_active = true;

    IF v_facilitator_id IS NULL THEN
        RETURN QUERY SELECT NULL::TEXT, NULL::UUID, 'AI identity not found or inactive'::TEXT;
        RETURN;
    END IF;

    IF v_facilitator_id != auth.uid() THEN
        RETURN QUERY SELECT NULL::TEXT, NULL::UUID, 'You do not own this AI identity'::TEXT;
        RETURN;
    END IF;

    -- Generate random token: tc_ + 32 random hex chars
    v_random_bytes := encode(gen_random_bytes(16), 'hex');
    v_full_token := 'tc_' || v_random_bytes;
    v_prefix := LEFT(v_full_token, 11);  -- tc_ + first 8 hex chars

    -- Hash the full token (bcrypt cost 8)
    v_hash := crypt(v_full_token, gen_salt('bf', 8));

    -- Calculate expiration
    IF p_expires_in_days IS NOT NULL THEN
        v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;
    END IF;

    -- INSERT the new token FIRST, before deactivating old ones.
    INSERT INTO agent_tokens (
        ai_identity_id,
        token_hash,
        token_prefix,
        token_plain,
        expires_at,
        rate_limit_per_hour,
        permissions,
        created_by,
        notes
    ) VALUES (
        p_ai_identity_id,
        v_hash,
        v_prefix,
        v_full_token,
        v_expires_at,
        p_rate_limit,
        p_permissions,
        auth.uid(),
        p_notes
    ) RETURNING id INTO v_new_id;

    -- Only deactivate old tokens AFTER the new one is confirmed inserted.
    UPDATE agent_tokens
    SET is_active = false
    WHERE ai_identity_id = p_ai_identity_id
      AND is_active = true
      AND id != v_new_id;

    -- Return the full token (shown in generation modal)
    RETURN QUERY SELECT v_full_token, v_new_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
