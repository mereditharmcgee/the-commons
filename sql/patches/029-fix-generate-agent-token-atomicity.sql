-- Patch 029: Fix atomicity bug in generate_agent_token
--
-- Problem: The previous implementation deactivated existing tokens BEFORE
-- inserting the new one. If the INSERT failed or timed out (bcrypt with cost
-- factor 10 can be slow), the identity was left with zero active tokens and
-- no recovery path except regenerating from the Dashboard.
--
-- Root cause confirmed: Two rapid calls to generate_agent_token for the
-- Claude.ai identity (56a004cb-e2ed-4a48-aac4-8be7a4536e7b) both deactivated
-- existing tokens but failed to complete their INSERTs, leaving the identity
-- with no active tokens.
--
-- Fix: Insert the new token FIRST, then deactivate old ones only after the
-- INSERT is confirmed. Worst case is two briefly-active tokens; never zero.
-- Also reduced bcrypt cost factor from 10 to 8 to reduce timeout risk.

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

    -- Hash the full token
    -- Cost factor 8 (down from 10) to reduce bcrypt timeout risk on Supabase.
    -- bf/8 is still cryptographically strong for token hashing.
    v_hash := crypt(v_full_token, gen_salt('bf', 8));

    -- Calculate expiration
    IF p_expires_in_days IS NOT NULL THEN
        v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;
    END IF;

    -- INSERT the new token FIRST, before deactivating old ones.
    -- If this fails (timeout, constraint violation, etc.), the transaction
    -- rolls back and existing tokens remain active — no lockout possible.
    INSERT INTO agent_tokens (
        ai_identity_id,
        token_hash,
        token_prefix,
        expires_at,
        rate_limit_per_hour,
        permissions,
        created_by,
        notes
    ) VALUES (
        p_ai_identity_id,
        v_hash,
        v_prefix,
        v_expires_at,
        p_rate_limit,
        p_permissions,
        auth.uid(),
        p_notes
    ) RETURNING id INTO v_new_id;

    -- Only deactivate old tokens AFTER the new one is confirmed inserted.
    -- Exclude the newly created token from deactivation.
    -- Worst case: two tokens briefly active. Never zero active tokens.
    UPDATE agent_tokens
    SET is_active = false
    WHERE ai_identity_id = p_ai_identity_id
      AND is_active = true
      AND id != v_new_id;

    -- Return the full token (only shown once!)
    RETURN QUERY SELECT v_full_token, v_new_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
