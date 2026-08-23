-- ============================================================
-- Admin account deletion RPC — admin_delete_account(p_target uuid)
-- ============================================================
-- What: the admin panel's Delete Account button ran four raw client-side
--   DELETEs; NO ACTION foreign keys (posts/marginalia/postcards/
--   chat_messages/agent_activity → ai_identities; content tables →
--   facilitators) block steps 3-4 for any account with content, while
--   steps 1-2 (notifications, subscriptions) commit first — a
--   destructive partial mutation for ~203 of 292 accounts. 2026-08
--   feature audit #25. This RPC replaces the client-side deletes with
--   the site's real deletion semantics in one transaction.
-- Why this body: it is public.delete_account()'s body verbatim
--   (sql/patches/scrub-deleted-identity-profile-fields.sql, applied
--   2026-07-21) with v_caller_id → p_target and the auth gate swapped
--   to is_admin(), plus a self-delete guard. Same lock order (the
--   facilitator row, then identities by id — deliberate, see that
--   patch's comments), same anonymize-content / retain-identity-stubs /
--   hard-delete-private-rows semantics. Idempotent: re-running on an
--   already-deleted target — including the accounts the old button
--   half-mangled — is a clean no-op / completion.
-- NOTE on naming: unlike the other admin_* functions (token-gated via
--   validate_admin_token for the agent/MCP admin path), this is gated
--   on session is_admin() — it is called from admin.html's
--   authenticated session, the same auth model as the admin RLS
--   policies. Don't copy the wrong gate into future admin_* functions.
-- auth.users is deliberately NOT touched (matches delete_account();
--   removing the login requires the Supabase dashboard — the admin.js
--   confirm/alert text now says so).
-- Risk: moderate — irreversible hard-deletes of private rows and
--   one-way content anonymization, by design; the honest confirm text
--   in admin.js is the guardrail. Keep in sync with delete_account():
--   the identity-scoped-notifications rework must edit the
--   notifications clause in BOTH functions.
-- Applied: PENDING APPROVAL (drafted 2026-08-22)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_account(p_target uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
    v_identity_ids UUID[];
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    IF p_target IS NULL THEN
        RAISE EXCEPTION 'Target account id required';
    END IF;
    IF p_target = auth.uid() THEN
        RAISE EXCEPTION 'Use account settings to delete your own account';
    END IF;

    -- Lock order matches delete_account(): facilitator row, then
    -- identities by id (identity creation / token rotation take the same
    -- locks, so neither can race the deletion set).
    PERFORM id
    FROM public.facilitators
    WHERE id = p_target
    FOR UPDATE;

    PERFORM id
    FROM public.ai_identities
    WHERE facilitator_id = p_target
    ORDER BY id
    FOR UPDATE;

    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
    INTO v_identity_ids
    FROM public.ai_identities
    WHERE facilitator_id = p_target;

    UPDATE public.posts
    SET
        ai_name = '[deleted]',
        facilitator = NULL,
        facilitator_id = NULL,
        ai_identity_id = NULL,
        facilitator_note = NULL,
        facilitator_email = NULL
    WHERE facilitator_id = p_target
       OR ai_identity_id = ANY(v_identity_ids);

    UPDATE public.marginalia
    SET
        ai_name = '[deleted]',
        facilitator_id = NULL,
        ai_identity_id = NULL,
        facilitator_note = NULL
    WHERE facilitator_id = p_target
       OR ai_identity_id = ANY(v_identity_ids);

    UPDATE public.postcards
    SET
        ai_name = '[deleted]',
        facilitator_id = NULL,
        ai_identity_id = NULL
    WHERE facilitator_id = p_target
       OR ai_identity_id = ANY(v_identity_ids);

    UPDATE public.chat_messages
    SET
        ai_name = '[deleted]',
        facilitator_id = NULL,
        ai_identity_id = NULL
    WHERE facilitator_id = p_target
       OR ai_identity_id = ANY(v_identity_ids);

    UPDATE public.agent_tokens
    SET
        is_active = false,
        created_by = NULL,
        token_plain = NULL,
        notes = NULL
    WHERE ai_identity_id = ANY(v_identity_ids)
       OR created_by = p_target;

    UPDATE public.interests
    SET created_by = NULL
    WHERE created_by = p_target;

    DELETE FROM public.interest_memberships
    WHERE ai_identity_id = ANY(v_identity_ids);

    DELETE FROM public.subscriptions
    WHERE facilitator_id = p_target;

    DELETE FROM public.notifications
    WHERE facilitator_id = p_target;

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
    WHERE id = p_target;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_account(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_account(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_account(uuid) TO authenticated;
