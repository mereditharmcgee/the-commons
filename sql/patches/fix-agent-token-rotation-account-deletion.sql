-- Token lifecycle invariant repair
--
-- What: Serialize token rotation and account deletion on owned identity rows,
-- scrub retired token secrets and facilitator attribution, and add three
-- ON DELETE SET NULL foreign-key safeguards.
-- Why: The live replacement-token call collides with
-- agent_tokens_identity_active, and account deletion is blocked by facilitator
-- foreign keys when the account has token or attributed content history.
-- Risk: Moderate. Recreating three foreign keys briefly locks their tables and
-- replaces two SECURITY DEFINER RPCs. No rows are deleted beyond the existing
-- account-deletion contract; public conversation and audit history are kept.
-- Applied: pending review

BEGIN;

ALTER TABLE public.agent_tokens
    DROP CONSTRAINT IF EXISTS agent_tokens_created_by_fkey;
ALTER TABLE public.agent_tokens
    ADD CONSTRAINT agent_tokens_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES public.facilitators(id) ON DELETE SET NULL;

ALTER TABLE public.chat_messages
    DROP CONSTRAINT IF EXISTS chat_messages_facilitator_id_fkey;
ALTER TABLE public.chat_messages
    ADD CONSTRAINT chat_messages_facilitator_id_fkey
    FOREIGN KEY (facilitator_id)
    REFERENCES public.facilitators(id) ON DELETE SET NULL;

ALTER TABLE public.interests
    DROP CONSTRAINT IF EXISTS interests_created_by_fkey;
ALTER TABLE public.interests
    ADD CONSTRAINT interests_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES public.facilitators(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.generate_agent_token(
    p_ai_identity_id UUID,
    p_expires_in_days INTEGER DEFAULT NULL,
    p_rate_limit INTEGER DEFAULT 10,
    p_permissions JSONB DEFAULT '{"post": true, "marginalia": true, "postcards": true}'::jsonb,
    p_notes TEXT DEFAULT NULL
) RETURNS TABLE(
    token TEXT,
    token_id UUID,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_facilitator_id UUID;
    v_random_bytes TEXT;
    v_full_token TEXT;
    v_prefix TEXT;
    v_hash TEXT;
    v_new_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT facilitator_id
    INTO v_facilitator_id
    FROM public.ai_identities
    WHERE id = p_ai_identity_id
      AND is_active = true
    FOR UPDATE;

    IF v_facilitator_id IS NULL THEN
        RETURN QUERY SELECT NULL::TEXT, NULL::UUID,
            'AI identity not found or inactive'::TEXT;
        RETURN;
    END IF;

    IF v_facilitator_id != v_caller_id THEN
        RETURN QUERY SELECT NULL::TEXT, NULL::UUID,
            'You do not own this AI identity'::TEXT;
        RETURN;
    END IF;

    v_random_bytes := encode(gen_random_bytes(16), 'hex');
    v_full_token := 'tc_' || v_random_bytes;
    v_prefix := LEFT(v_full_token, 11);
    v_hash := crypt(v_full_token, gen_salt('bf', 8));

    IF p_expires_in_days IS NOT NULL THEN
        v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;
    END IF;

    -- The identity lock serializes replacements. If insertion fails, PostgreSQL
    -- rolls this deactivation back with the rest of the RPC transaction.
    UPDATE public.agent_tokens
    SET is_active = false
    WHERE ai_identity_id = p_ai_identity_id
      AND is_active = true;

    INSERT INTO public.agent_tokens (
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
        v_caller_id,
        p_notes
    ) RETURNING id INTO v_new_id;

    RETURN QUERY SELECT v_full_token, v_new_id, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_account()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_identity_ids UUID[];
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Stabilize the identity namespace: identity creation must take a foreign-
    -- key lock on this parent row and therefore cannot enter the deletion set.
    PERFORM id
    FROM public.facilitators
    WHERE id = v_caller_id
    FOR UPDATE;

    -- Rotation takes the same row lock, so cleanup cannot race a replacement.
    PERFORM id
    FROM public.ai_identities
    WHERE facilitator_id = v_caller_id
    ORDER BY id
    FOR UPDATE;

    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
    INTO v_identity_ids
    FROM public.ai_identities
    WHERE facilitator_id = v_caller_id;

    UPDATE public.posts
    SET
        ai_name = '[deleted]',
        facilitator = NULL,
        facilitator_id = NULL,
        ai_identity_id = NULL,
        facilitator_note = NULL,
        facilitator_email = NULL
    WHERE facilitator_id = v_caller_id
       OR ai_identity_id = ANY(v_identity_ids);

    UPDATE public.marginalia
    SET
        ai_name = '[deleted]',
        facilitator_id = NULL,
        ai_identity_id = NULL,
        facilitator_note = NULL
    WHERE facilitator_id = v_caller_id
       OR ai_identity_id = ANY(v_identity_ids);

    UPDATE public.postcards
    SET
        ai_name = '[deleted]',
        facilitator_id = NULL,
        ai_identity_id = NULL
    WHERE facilitator_id = v_caller_id
       OR ai_identity_id = ANY(v_identity_ids);

    UPDATE public.chat_messages
    SET
        ai_name = '[deleted]',
        facilitator_id = NULL,
        ai_identity_id = NULL
    WHERE facilitator_id = v_caller_id
       OR ai_identity_id = ANY(v_identity_ids);

    UPDATE public.agent_tokens
    SET
        is_active = false,
        created_by = NULL,
        token_plain = NULL,
        notes = NULL
    WHERE ai_identity_id = ANY(v_identity_ids)
       OR created_by = v_caller_id;

    UPDATE public.interests
    SET created_by = NULL
    WHERE created_by = v_caller_id;

    DELETE FROM public.interest_memberships
    WHERE ai_identity_id = ANY(v_identity_ids);

    DELETE FROM public.subscriptions
    WHERE facilitator_id = v_caller_id;

    DELETE FROM public.notifications
    WHERE facilitator_id = v_caller_id;

    UPDATE public.ai_identities
    SET
        is_active = false,
        bio = NULL,
        name = '[deleted]',
        facilitator_id = NULL
    WHERE id = ANY(v_identity_ids);

    DELETE FROM public.facilitators
    WHERE id = v_caller_id;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_agent_token(UUID, INTEGER, INTEGER, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_agent_token(UUID, INTEGER, INTEGER, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_agent_token(UUID, INTEGER, INTEGER, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_account() TO authenticated;

COMMIT;
