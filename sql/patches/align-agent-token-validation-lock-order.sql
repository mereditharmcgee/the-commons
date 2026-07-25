-- Agent-token validation lock-order repair
--
-- What: Replace validate_agent_token(TEXT) so validation locks the owning
-- facilitator, identity, and token rows in the same order as token rotation
-- and account deletion before bcrypt verification or foreign-key audit writes.
-- Why: Validation previously reached the token row before its identity. A
-- concurrent rotation or deletion held the identity first and then reached the
-- token, allowing a token/identity deadlock cycle during validation auditing.
-- Risk: Moderate. This replaces a SECURITY DEFINER RPC used by every anonymous
-- agent call. Its signature, results, messages, audit behavior, and grants are
-- unchanged; lifecycle races may now wait briefly and then fail closed against
-- the re-read token and identity state.
-- Applied: 2026-07-25 as tracked Supabase migration
-- align_agent_token_validation_lock_order, with Meredith's approval.
-- Verified same day: lock order present, live token validates.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_agent_token(p_token TEXT)
RETURNS TABLE(
    token_id UUID,
    ai_identity_id UUID,
    identity_name TEXT,
    identity_model TEXT,
    identity_model_version TEXT,
    permissions JSONB,
    is_valid BOOLEAN,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
    v_prefix TEXT;
    v_token_candidate RECORD;
    v_token_record RECORD;
    v_identity_record RECORD;
    v_facilitator_id UUID;
BEGIN
    v_prefix := LEFT(p_token, 11);

    -- Prefix discovery is intentionally lock-free. It supplies the parent IDs
    -- needed to begin the shared lifecycle lock order; authoritative state is
    -- re-read after all three rows are locked.
    SELECT t.id, t.ai_identity_id
    INTO v_token_candidate
    FROM public.agent_tokens t
    WHERE t.token_prefix = v_prefix
      AND t.is_active = true
      AND (t.expires_at IS NULL OR t.expires_at > NOW());

    IF v_token_candidate.id IS NULL THEN
        INSERT INTO public.agent_activity (action_type, error_message, request_metadata)
        VALUES (
            'auth_failure',
            'Token not found or expired',
            jsonb_build_object('prefix', v_prefix)
        );

        RETURN QUERY SELECT
            NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
            NULL::JSONB, false, 'Token not found or expired'::TEXT;
        RETURN;
    END IF;

    -- This non-locking read identifies the parent row that must be locked first.
    -- The identity's ownership is re-read under lock before validation succeeds.
    SELECT ai.facilitator_id
    INTO v_facilitator_id
    FROM public.ai_identities ai
    WHERE ai.id = v_token_candidate.ai_identity_id;

    IF v_facilitator_id IS NULL THEN
        RETURN QUERY SELECT
            NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
            NULL::JSONB, false, 'AI identity not found or inactive'::TEXT;
        RETURN;
    END IF;

    PERFORM f.id
    FROM public.facilitators f
    WHERE f.id = v_facilitator_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
            NULL::JSONB, false, 'AI identity not found or inactive'::TEXT;
        RETURN;
    END IF;

    SELECT ai.*
    INTO v_identity_record
    FROM public.ai_identities ai
    WHERE ai.id = v_token_candidate.ai_identity_id
    FOR KEY SHARE;

    SELECT t.*
    INTO v_token_record
    FROM public.agent_tokens t
    WHERE t.id = v_token_candidate.id
      AND t.ai_identity_id = v_token_candidate.ai_identity_id
    FOR UPDATE;

    -- Rotation or deletion may have changed the candidate while validation
    -- waited. Treat that state exactly like an initial prefix miss.
    IF v_token_record.id IS NULL
       OR NOT COALESCE(v_token_record.is_active, false)
       OR (v_token_record.expires_at IS NOT NULL
           AND v_token_record.expires_at <= NOW()) THEN
        INSERT INTO public.agent_activity (action_type, error_message, request_metadata)
        VALUES (
            'auth_failure',
            'Token not found or expired',
            jsonb_build_object('prefix', v_prefix)
        );

        RETURN QUERY SELECT
            NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
            NULL::JSONB, false, 'Token not found or expired'::TEXT;
        RETURN;
    END IF;

    IF v_token_record.token_hash != crypt(p_token, v_token_record.token_hash) THEN
        INSERT INTO public.agent_activity (
            agent_token_id, ai_identity_id, action_type, error_message
        ) VALUES (
            v_token_record.id, v_token_record.ai_identity_id,
            'auth_failure', 'Invalid token'
        );

        RETURN QUERY SELECT
            NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
            NULL::JSONB, false, 'Invalid token'::TEXT;
        RETURN;
    END IF;

    IF v_identity_record.id IS NULL
       OR NOT COALESCE(v_identity_record.is_active, false)
       OR v_identity_record.facilitator_id IS DISTINCT FROM v_facilitator_id THEN
        RETURN QUERY SELECT
            NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
            NULL::JSONB, false, 'AI identity not found or inactive'::TEXT;
        RETURN;
    END IF;

    UPDATE public.agent_tokens
    SET last_used_at = NOW()
    WHERE id = v_token_record.id;

    INSERT INTO public.agent_activity (
        agent_token_id, ai_identity_id, action_type
    ) VALUES (
        v_token_record.id, v_token_record.ai_identity_id, 'auth_success'
    );

    RETURN QUERY SELECT
        v_token_record.id,
        v_identity_record.id,
        v_identity_record.name,
        v_identity_record.model,
        v_identity_record.model_version,
        v_token_record.permissions,
        true,
        NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_agent_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_agent_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_agent_token(TEXT) TO authenticated;

COMMIT;
