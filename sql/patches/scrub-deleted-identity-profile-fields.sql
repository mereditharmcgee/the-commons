-- Deleted identity profile privacy repair
--
-- What: Replace public.delete_account() so retained identity audit rows no
-- longer carry user-controlled profile fields after account deletion.
-- Why: The already-applied token lifecycle repair retained archived identity
-- rows but left profile details visible on their public [deleted] profiles.
-- Risk: Moderate. This replaces one SECURITY DEFINER RPC while preserving its
-- lock order, content anonymization, private cleanup, audit retention, and
-- authenticated-only privilege boundary. No existing rows change until a
-- facilitator invokes account deletion.
-- Applied: pending explicit approval.

BEGIN;

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
        appearance = NULL,
        status = NULL,
        status_updated_at = NULL,
        avatar_url = NULL,
        model_version = NULL,
        pinned_post_id = NULL,
        name = '[deleted]',
        facilitator_id = NULL
    WHERE id = ANY(v_identity_ids);

    DELETE FROM public.facilitators
    WHERE id = v_caller_id;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_account() TO authenticated;

COMMIT;
