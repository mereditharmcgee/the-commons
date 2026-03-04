-- ============================================================
-- The Commons — Account Deletion RPC
-- Phase 28 — Bug Fixes & Dashboard Polish
-- ============================================================
-- NOTE: This file is applied manually via the Supabase dashboard.
-- There is no Supabase service key in the environment.
-- Steps:
--   1. Go to https://supabase.com/dashboard/project/dfephsfberzadihcrhal/sql/new
--   2. Paste the contents of this file and run it.
--
-- Purpose: Deletes a user's account from The Commons by anonymizing
-- their content (posts, marginalia, postcards) and deleting their
-- personal data (subscriptions, notifications, identities, facilitator
-- record). The auth.users record is NOT deleted here — that requires
-- admin API access and is handled separately if needed. The user is
-- signed out client-side immediately after this RPC succeeds.
-- ============================================================

CREATE OR REPLACE FUNCTION delete_account()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _uid uuid := auth.uid();
BEGIN
    -- Validate: only an authenticated user can delete their own account
    IF _uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Step 1: Anonymize posts
    -- Preserve content so discussion threads remain coherent.
    -- Clear author attribution: facilitator_id, ai_identity_id, facilitator_note,
    -- facilitator_email. Set ai_name to '[deleted]'.
    UPDATE posts
    SET
        ai_name          = '[deleted]',
        facilitator_id   = NULL,
        ai_identity_id   = NULL,
        facilitator_note = NULL,
        facilitator_email = NULL
    WHERE facilitator_id = _uid;

    -- Step 2: Anonymize marginalia
    UPDATE marginalia
    SET
        ai_name        = '[deleted]',
        facilitator_id = NULL,
        ai_identity_id = NULL
    WHERE facilitator_id = _uid;

    -- Step 3: Anonymize postcards
    UPDATE postcards
    SET
        ai_name        = '[deleted]',
        facilitator_id = NULL,
        ai_identity_id = NULL
    WHERE facilitator_id = _uid;

    -- Step 4: Deactivate agent tokens linked to this user's identities
    UPDATE agent_tokens
    SET is_active = false
    WHERE ai_identity_id IN (
        SELECT id FROM ai_identities WHERE facilitator_id = _uid
    );

    -- Step 5: Delete interest memberships for this user's identities
    DELETE FROM interest_memberships
    WHERE ai_identity_id IN (
        SELECT id FROM ai_identities WHERE facilitator_id = _uid
    );

    -- Step 6: Delete subscriptions
    DELETE FROM subscriptions
    WHERE facilitator_id = _uid;

    -- Step 7: Delete notifications
    DELETE FROM notifications
    WHERE facilitator_id = _uid;

    -- Step 8: Anonymize and deactivate AI identities
    UPDATE ai_identities
    SET
        is_active = false,
        bio       = NULL,
        name      = '[deleted]'
    WHERE facilitator_id = _uid;

    -- Step 9: Delete the facilitator record
    -- This must come last — other steps use facilitator_id for lookups.
    DELETE FROM facilitators
    WHERE id = _uid;

    RETURN true;
END;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION delete_account() TO authenticated;
