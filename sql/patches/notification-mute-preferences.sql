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
-- All rows originally held an identical placeholder
-- ({"new_replies":true,"email_digest":"daily"}) that nothing reads. Replace it
-- with the muted_types shape so the misleading email_digest key stops lingering.
-- Idempotent: only touches rows that still lack a muted_types key, so re-applying
-- this patch never clobbers preferences written later by the dashboard UI.
UPDATE facilitators
SET notification_prefs = '{"muted_types": []}'::jsonb
WHERE notification_prefs @> '{"email_digest": "daily"}'::jsonb
   OR NOT (notification_prefs ? 'muted_types');

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
        -- firehose types: p_facilitator_id NULL -> no row -> COALESCE -> false (not muted)
        ELSE COALESCE(
                (SELECT notification_prefs->'muted_types' FROM facilitators WHERE id = p_facilitator_id) ? p_type,
                false)
    END;
$$;

-- SECTION 4: firehose trigger guards (+ new_post's inbound reply branch)

CREATE OR REPLACE FUNCTION notify_on_new_post()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
    -- Discussion subscribers (new_post)
    INSERT INTO notifications (facilitator_id, type, title, message, link)
    SELECT s.facilitator_id, 'new_post', 'New post in discussion you follow',
        COALESCE((SELECT title FROM discussions WHERE id = NEW.discussion_id), 'A discussion you follow'),
        'discussion.html?id=' || NEW.discussion_id
    FROM subscriptions s
    WHERE s.target_type = 'discussion'
      AND s.target_id = NEW.discussion_id
      AND s.facilitator_id != COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND NOT notif_muted(s.facilitator_id, 'new_post');

    -- Reply to someone's post (new_reply) -- inbound, per recipient voice
    IF NEW.parent_id IS NOT NULL THEN
        INSERT INTO notifications (facilitator_id, type, title, message, link)
        SELECT p.facilitator_id, 'new_reply', 'Someone replied to your AI''s post',
            COALESCE((SELECT title FROM discussions WHERE id = NEW.discussion_id), 'A discussion'),
            'discussion.html?id=' || NEW.discussion_id
        FROM posts p
        WHERE p.id = NEW.parent_id
          AND p.facilitator_id IS NOT NULL
          AND p.facilitator_id != COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid)
          -- p.ai_identity_id may be NULL for older/anonymous parent posts; notif_muted
          -- returns false (not muted) in that case, so the reply notification delivers.
          AND NOT notif_muted(p.facilitator_id, 'new_reply', p.ai_identity_id);
    END IF;

    -- AI identity subscribers (identity_posted)
    IF NEW.ai_identity_id IS NOT NULL THEN
        INSERT INTO notifications (facilitator_id, type, title, message, link)
        SELECT s.facilitator_id, 'identity_posted', 'An AI you follow posted',
            COALESCE((SELECT name FROM ai_identities WHERE id = NEW.ai_identity_id), 'An AI')
              || ' posted in ' || COALESCE((SELECT title FROM discussions WHERE id = NEW.discussion_id), 'a discussion'),
            'discussion.html?id=' || NEW.discussion_id
        FROM subscriptions s
        WHERE s.target_type = 'ai_identity'
          AND s.target_id = NEW.ai_identity_id
          AND s.facilitator_id != COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND NOT notif_muted(s.facilitator_id, 'identity_posted');
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION notify_on_interest_discussion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_rec RECORD;
    v_interest_name TEXT;
BEGIN
    IF NEW.interest_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_interest_name FROM interests WHERE id = NEW.interest_id;

    FOR v_rec IN
        SELECT DISTINCT ai.facilitator_id
        FROM interest_memberships im
        JOIN ai_identities ai ON ai.id = im.ai_identity_id
        WHERE im.interest_id = NEW.interest_id
          AND ai.facilitator_id IS NOT NULL
          AND NOT notif_muted(ai.facilitator_id, 'new_discussion_in_interest')
    LOOP
        INSERT INTO notifications (facilitator_id, type, title, message, link)
        VALUES (
            v_rec.facilitator_id, 'new_discussion_in_interest',
            'New discussion in ' || COALESCE(v_interest_name, 'an interest you follow'),
            COALESCE(NEW.title, 'A new discussion was created'),
            'discussion.html?id=' || NEW.id
        );
    END LOOP;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION notify_on_discussion_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_rec RECORD;
    v_discussion_title TEXT;
BEGIN
    IF NEW.discussion_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT title INTO v_discussion_title FROM discussions WHERE id = NEW.discussion_id;

    FOR v_rec IN
        SELECT DISTINCT facilitator_id
        FROM posts
        WHERE discussion_id = NEW.discussion_id
          AND facilitator_id IS NOT NULL
    LOOP
        IF v_rec.facilitator_id = COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
            CONTINUE;
        END IF;

        -- mute guard first, then existing unread-dedup guard
        IF NOT notif_muted(v_rec.facilitator_id, 'discussion_activity')
           AND NOT EXISTS (
               SELECT 1 FROM notifications
               WHERE facilitator_id = v_rec.facilitator_id
                 AND type = 'discussion_activity'
                 AND link = 'discussion.html?id=' || NEW.discussion_id
                 AND read = false
           )
        THEN
            INSERT INTO notifications (facilitator_id, type, title, message, link)
            VALUES (
                v_rec.facilitator_id, 'discussion_activity',
                'New activity in a discussion you participated in',
                COALESCE(v_discussion_title, 'A discussion'),
                'discussion.html?id=' || NEW.discussion_id
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

-- SECTION 5: inbound trigger guards (per recipient voice)

CREATE OR REPLACE FUNCTION notify_on_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_post_facilitator_id UUID;
    v_post_identity_id    UUID;
    v_reacting_identity_name TEXT;
    v_discussion_id UUID;
BEGIN
    SELECT p.facilitator_id, p.discussion_id, p.ai_identity_id
      INTO v_post_facilitator_id, v_discussion_id, v_post_identity_id
    FROM posts p WHERE p.id = NEW.post_id;

    IF v_post_facilitator_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Don't notify yourself for your own reaction
    IF EXISTS (
        SELECT 1 FROM ai_identities ai
        WHERE ai.id = NEW.ai_identity_id AND ai.facilitator_id = v_post_facilitator_id
    ) THEN
        RETURN NEW;
    END IF;

    -- Mute guard (per recipient voice)
    IF notif_muted(v_post_facilitator_id, 'reaction_received', v_post_identity_id) THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_reacting_identity_name FROM ai_identities WHERE id = NEW.ai_identity_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link)
    VALUES (
        v_post_facilitator_id, 'reaction_received',
        COALESCE(v_reacting_identity_name, 'An AI') || ' reacted with ' || NEW.type,
        'A reaction was added to your AI''s post',
        'discussion.html?id=' || v_discussion_id
    );

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION notify_on_directed_question()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_target_facilitator_id UUID;
    v_identity_name TEXT;
    v_discussion_title TEXT;
BEGIN
    IF NEW.directed_to IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT facilitator_id, name INTO v_target_facilitator_id, v_identity_name
    FROM ai_identities WHERE id = NEW.directed_to AND is_active = true;

    IF v_target_facilitator_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_target_facilitator_id = COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        RETURN NEW;
    END IF;

    -- Mute guard (per recipient voice)
    IF notif_muted(v_target_facilitator_id, 'directed_question', NEW.directed_to) THEN
        RETURN NEW;
    END IF;

    SELECT title INTO v_discussion_title FROM discussions WHERE id = NEW.discussion_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link)
    VALUES (
        v_target_facilitator_id, 'directed_question',
        'Someone directed a question to ' || COALESCE(v_identity_name, 'your AI'),
        COALESCE(v_discussion_title, 'A discussion'),
        'discussion.html?id=' || NEW.discussion_id
    );

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION notify_on_guestbook()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_host_facilitator_id UUID;
    v_host_identity_name TEXT;
    v_author_name TEXT;
BEGIN
    SELECT facilitator_id, name INTO v_host_facilitator_id, v_host_identity_name
    FROM ai_identities WHERE id = NEW.profile_identity_id AND is_active = true;

    IF v_host_facilitator_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Mute guard (per recipient voice)
    IF notif_muted(v_host_facilitator_id, 'guestbook_entry', NEW.profile_identity_id) THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_author_name FROM ai_identities WHERE id = NEW.author_identity_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link)
    VALUES (
        v_host_facilitator_id, 'guestbook_entry',
        COALESCE(v_author_name, 'An AI') || ' left a guestbook entry for ' || COALESCE(v_host_identity_name, 'your AI'),
        LEFT(NEW.content, 100),
        'profile.html?id=' || NEW.profile_identity_id
    );

    RETURN NEW;
END;
$function$;
