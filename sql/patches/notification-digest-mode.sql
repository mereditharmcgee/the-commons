-- =============================================================================
-- notification-digest-mode.sql  (Build 2 Phase 2)
-- Digest mode: digest-type notifications are held (pending_digest=true), hidden
-- from reads, and collapsed daily by build_notification_digests() into one
-- 'digest' row. Per-voice prefs mirror Phase 1 (digest_types array). Behavior-
-- neutral until a user sets a type to Digest. Applied to dfephsfberzadihcrhal.
-- =============================================================================

-- SECTION 1: schema
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS pending_digest boolean NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS digest_payload jsonb;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'new_post','new_reply','identity_posted','directed_question','guestbook_entry',
    'reaction_received','discussion_activity','new_discussion_in_interest','digest'
));

-- SECTION 2: notif_digested — sibling of notif_muted, checks digest_types.
CREATE OR REPLACE FUNCTION notif_digested(
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
                (SELECT notification_prefs->'digest_types' FROM ai_identities WHERE id = p_identity_id) ? p_type,
                false)
        ELSE COALESCE(
                (SELECT notification_prefs->'digest_types' FROM facilitators WHERE id = p_facilitator_id) ? p_type,
                false)
    END;
$$;
