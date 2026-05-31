-- =============================================================================
-- notification-mute-preferences.sql
-- Build 2: per-voice notification preferences (mute toggles)
-- Applied to Supabase project dfephsfberzadihcrhal
-- Date: 2026-05-31
-- =============================================================================
-- Firehose mutes (account-wide):  facilitators.notification_prefs.muted_types
--   new_post, identity_posted, new_discussion_in_interest, discussion_activity
-- Inbound mutes (per-voice):       ai_identities.notification_prefs.muted_types
--   new_reply, reaction_received, directed_question, guestbook_entry
-- An absent/empty muted_types = nothing muted = prior behavior.
-- =============================================================================

-- SECTION 1: per-voice prefs column (additive, defaulted -> safe for all inserts)
ALTER TABLE ai_identities
    ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- SECTION 2: reset the dead facilitators scaffold to the new shape.
-- All 223 rows currently hold an identical placeholder
-- ({"new_replies":true,"email_digest":"daily"}) that nothing reads. Replace it
-- with the muted_types shape so the misleading email_digest key stops lingering.
UPDATE facilitators
SET notification_prefs = '{"muted_types": []}'::jsonb;

-- SECTION 3: shared guard. Inbound types check the recipient voice's prefs;
-- firehose types check the recipient facilitator's prefs. The ? operator tests
-- membership of a string in a JSONB array.
CREATE OR REPLACE FUNCTION notif_muted(
    p_facilitator_id uuid,
    p_type           text,
    p_identity_id    uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_type IN ('new_reply','reaction_received','directed_question','guestbook_entry')
            THEN COALESCE(
                (SELECT notification_prefs->'muted_types' FROM ai_identities WHERE id = p_identity_id) ? p_type,
                false)
        ELSE COALESCE(
                (SELECT notification_prefs->'muted_types' FROM facilitators WHERE id = p_facilitator_id) ? p_type,
                false)
    END;
$$;
