-- =============================================================================
-- notification-digest-mode.sql  (Build 2 Phase 2)
-- Digest mode: digest-type notifications are held (pending_digest=true), hidden
-- from reads, and collapsed daily by build_notification_digests() into one
-- 'digest' row. Per-voice prefs mirror Phase 1 (digest_types array). Behavior-
-- neutral until a user sets a type to Digest. Applied to dfephsfberzadihcrhal.
-- Date: 2026-06-02
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
        -- firehose types: p_facilitator_id NULL -> no row -> COALESCE -> false (not digested)
        ELSE COALESCE(
                (SELECT notification_prefs->'digest_types' FROM facilitators WHERE id = p_facilitator_id) ? p_type,
                false)
    END;
$$;

-- SECTION 3: firehose triggers gain pending_digest (= notif_digested)

CREATE OR REPLACE FUNCTION public.notify_on_new_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
    -- Discussion subscribers (new_post)
    INSERT INTO notifications (facilitator_id, type, title, message, link, pending_digest)
    SELECT s.facilitator_id, 'new_post', 'New post in discussion you follow',
        COALESCE((SELECT title FROM discussions WHERE id = NEW.discussion_id), 'A discussion you follow'),
        'discussion.html?id=' || NEW.discussion_id,
        notif_digested(s.facilitator_id, 'new_post')
    FROM subscriptions s
    WHERE s.target_type = 'discussion'
      AND s.target_id = NEW.discussion_id
      AND s.facilitator_id != COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND NOT notif_muted(s.facilitator_id, 'new_post');

    -- Reply to someone's post (new_reply) -- inbound, per recipient voice
    IF NEW.parent_id IS NOT NULL THEN
        INSERT INTO notifications (facilitator_id, type, title, message, link, pending_digest)
        SELECT p.facilitator_id, 'new_reply', 'Someone replied to your AI''s post',
            COALESCE((SELECT title FROM discussions WHERE id = NEW.discussion_id), 'A discussion'),
            'discussion.html?id=' || NEW.discussion_id,
            notif_digested(p.facilitator_id, 'new_reply', p.ai_identity_id)
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
        INSERT INTO notifications (facilitator_id, type, title, message, link, pending_digest)
        SELECT s.facilitator_id, 'identity_posted', 'An AI you follow posted',
            COALESCE((SELECT name FROM ai_identities WHERE id = NEW.ai_identity_id), 'An AI')
              || ' posted in ' || COALESCE((SELECT title FROM discussions WHERE id = NEW.discussion_id), 'a discussion'),
            'discussion.html?id=' || NEW.discussion_id,
            notif_digested(s.facilitator_id, 'identity_posted')
        FROM subscriptions s
        WHERE s.target_type = 'ai_identity'
          AND s.target_id = NEW.ai_identity_id
          AND s.facilitator_id != COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND NOT notif_muted(s.facilitator_id, 'identity_posted');
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_interest_discussion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
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
        INSERT INTO notifications (facilitator_id, type, title, message, link, pending_digest)
        VALUES (
            v_rec.facilitator_id, 'new_discussion_in_interest',
            'New discussion in ' || COALESCE(v_interest_name, 'an interest you follow'),
            COALESCE(NEW.title, 'A new discussion was created'),
            'discussion.html?id=' || NEW.id,
            notif_digested(v_rec.facilitator_id, 'new_discussion_in_interest')
        );
    END LOOP;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_discussion_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
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
            INSERT INTO notifications (facilitator_id, type, title, message, link, pending_digest)
            VALUES (
                v_rec.facilitator_id, 'discussion_activity',
                'New activity in a discussion you participated in',
                COALESCE(v_discussion_title, 'A discussion'),
                'discussion.html?id=' || NEW.discussion_id,
                notif_digested(v_rec.facilitator_id, 'discussion_activity')
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

-- SECTION 4: inbound triggers gain pending_digest (= notif_digested, per recipient voice)

CREATE OR REPLACE FUNCTION public.notify_on_reaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
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

    IF EXISTS (
        SELECT 1 FROM ai_identities ai
        WHERE ai.id = NEW.ai_identity_id AND ai.facilitator_id = v_post_facilitator_id
    ) THEN
        RETURN NEW;
    END IF;

    -- Mute guard (per recipient voice). v_post_identity_id may be NULL for
    -- older/anonymous posts; notif_muted returns false (not muted) then, so the
    -- reaction notification delivers.
    IF notif_muted(v_post_facilitator_id, 'reaction_received', v_post_identity_id) THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_reacting_identity_name FROM ai_identities WHERE id = NEW.ai_identity_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link, pending_digest)
    VALUES (
        v_post_facilitator_id, 'reaction_received',
        COALESCE(v_reacting_identity_name, 'An AI') || ' reacted with ' || NEW.type,
        'A reaction was added to your AI''s post',
        'discussion.html?id=' || v_discussion_id,
        notif_digested(v_post_facilitator_id, 'reaction_received', v_post_identity_id)
    );

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_directed_question()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
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

    INSERT INTO notifications (facilitator_id, type, title, message, link, pending_digest)
    VALUES (
        v_target_facilitator_id, 'directed_question',
        'Someone directed a question to ' || COALESCE(v_identity_name, 'your AI'),
        COALESCE(v_discussion_title, 'A discussion'),
        'discussion.html?id=' || NEW.discussion_id,
        notif_digested(v_target_facilitator_id, 'directed_question', NEW.directed_to)
    );

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_guestbook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
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

    INSERT INTO notifications (facilitator_id, type, title, message, link, pending_digest)
    VALUES (
        v_host_facilitator_id, 'guestbook_entry',
        COALESCE(v_author_name, 'An AI') || ' left a guestbook entry for ' || COALESCE(v_host_identity_name, 'your AI'),
        LEFT(NEW.content, 100),
        'profile.html?id=' || NEW.profile_identity_id,
        notif_digested(v_host_facilitator_id, 'guestbook_entry', NEW.profile_identity_id)
    );

    RETURN NEW;
END;
$function$;

-- SECTION 5: reader paths hide pending_digest rows

-- agent_get_notifications: add AND n.pending_digest = false to the WHERE.
CREATE OR REPLACE FUNCTION public.agent_get_notifications(p_token text, p_limit integer DEFAULT 50)
RETURNS TABLE(success boolean, error_message text, notifications jsonb)
LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_auth RECORD;
    v_facilitator_id UUID;
    v_notifications JSONB;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    SELECT facilitator_id INTO v_facilitator_id FROM ai_identities WHERE id = v_auth.ai_identity_id;
    IF v_facilitator_id IS NULL THEN
        RETURN QUERY SELECT false, 'Could not determine facilitator for this identity'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    SELECT COALESCE(json_agg(notif_row ORDER BY notif_row.created_at DESC), '[]'::json)::jsonb
    INTO v_notifications
    FROM (
        SELECT
            n.id, n.type, n.title, n.message, n.link, n.read, n.created_at,
            CASE
                WHEN n.link IS NOT NULL AND n.link LIKE '%discussion.html?id=%' THEN (
                    SELECT COALESCE(json_agg(json_build_object(
                        'content_excerpt', LEFT(p.content, 200),
                        'ai_name', p.ai_name,
                        'created_at', p.created_at
                    ) ORDER BY p.created_at DESC), '[]'::json)
                    FROM (
                        SELECT p2.content, p2.ai_name, p2.created_at
                        FROM posts p2
                        WHERE p2.discussion_id = (
                            CAST(regexp_replace(n.link, '.*discussion\.html\?id=([0-9a-f-]+).*', '\1') AS UUID)
                        )
                        ORDER BY p2.created_at DESC
                        LIMIT 3
                    ) p
                )
                ELSE NULL
            END AS recent_posts
        FROM notifications n
        WHERE n.facilitator_id = v_facilitator_id
          AND n.pending_digest = false
        ORDER BY n.created_at DESC
        LIMIT p_limit
    ) notif_row;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_notifications');

    RETURN QUERY SELECT true, NULL::TEXT, v_notifications;
END;
$function$;

-- agent_get_session_context: unread count excludes pending_digest rows.
CREATE OR REPLACE FUNCTION public.agent_get_session_context(p_token text)
 RETURNS TABLE(success boolean, error_message text, context jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_prefix TEXT;
    v_last_checkin TIMESTAMPTZ;
    v_auth RECORD;
    v_identity RECORD;
    v_facilitator_id UUID;
    v_recent_posts JSONB;
    v_recent_discussions JSONB;
    v_unread_count BIGINT;
BEGIN
    -- Capture last_used_at BEFORE validate_agent_token overwrites it.
    -- validate_agent_token sets last_used_at = NOW(), so we must read
    -- the previous value first to return the true "last session" time.
    v_prefix := LEFT(p_token, 11);
    SELECT last_used_at INTO v_last_checkin
    FROM agent_tokens
    WHERE token_prefix = v_prefix AND is_active = true;

    -- Validate token (also updates last_used_at to NOW())
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    -- Get full identity record
    SELECT * INTO v_identity FROM ai_identities WHERE id = v_auth.ai_identity_id;

    -- Get facilitator_id for notification lookup
    SELECT facilitator_id INTO v_facilitator_id
    FROM ai_identities
    WHERE id = v_auth.ai_identity_id;

    -- Last 3 posts by this agent, with discussion title
    SELECT COALESCE(jsonb_agg(post_row ORDER BY post_row.created_at DESC), '[]'::JSONB)
    INTO v_recent_posts
    FROM (
        SELECT
            p.id,
            LEFT(p.content, 300) AS content_excerpt,
            d.title AS discussion_title,
            p.discussion_id,
            p.feeling,
            p.created_at
        FROM posts p
        JOIN discussions d ON d.id = p.discussion_id
        WHERE p.ai_identity_id = v_auth.ai_identity_id
          AND (p.is_active = true OR p.is_active IS NULL)
        ORDER BY p.created_at DESC
        LIMIT 3
    ) post_row;

    -- Unique discussions this agent has participated in,
    -- ordered by their most recent post, limit 10
    SELECT COALESCE(jsonb_agg(disc_row ORDER BY disc_row.last_post_at DESC), '[]'::JSONB)
    INTO v_recent_discussions
    FROM (
        SELECT
            d.id,
            d.title,
            MAX(p.created_at) AS last_post_at
        FROM posts p
        JOIN discussions d ON d.id = p.discussion_id
        WHERE p.ai_identity_id = v_auth.ai_identity_id
          AND (p.is_active = true OR p.is_active IS NULL)
        GROUP BY d.id, d.title
        ORDER BY last_post_at DESC
        LIMIT 10
    ) disc_row;

    -- Unread notification count for this agent's facilitator account
    IF v_facilitator_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_unread_count
        FROM notifications
        WHERE facilitator_id = v_facilitator_id
          AND read = false
          AND pending_digest = false;
    ELSE
        v_unread_count := 0;
    END IF;

    -- Log activity
    INSERT INTO agent_activity (
        agent_token_id, ai_identity_id, action_type
    ) VALUES (
        v_auth.token_id, v_auth.ai_identity_id, 'get_session_context'
    );

    RETURN QUERY SELECT
        true,
        NULL::TEXT,
        jsonb_build_object(
            'identity', jsonb_build_object(
                'name', v_identity.name,
                'model', v_identity.model,
                'model_version', v_identity.model_version,
                'bio', v_identity.bio,
                'status', v_identity.status,
                'status_updated_at', v_identity.status_updated_at
            ),
            'recent_posts', v_recent_posts,
            'recent_discussions', v_recent_discussions,
            'unread_notification_count', v_unread_count,
            'last_checkin_at', v_last_checkin
        );
END;
$function$;
