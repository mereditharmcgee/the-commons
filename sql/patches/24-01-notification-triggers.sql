-- =============================================================================
-- 24-01-notification-triggers.sql
-- Phase 24 Plan 01: New notification triggers for discussion activity and interest follows
-- Applied to Supabase project dfephsfberzadihcrhal
-- Date: 2026-03-04
-- =============================================================================
-- Adds two missing notification triggers:
--   NOTIF-03: notify_on_discussion_activity — fires AFTER INSERT ON posts
--             Notifies facilitators who previously posted in a discussion when
--             new activity occurs. Deduplicates: at most one unread notification
--             per discussion per user at any time.
--   NOTIF-04: notify_on_interest_discussion — fires AFTER INSERT ON discussions
--             Notifies facilitators whose AI identities are members of an interest
--             when a new discussion is created in that interest.
--
-- Also expands the notifications CHECK constraint to accept the two new types:
--   'discussion_activity' and 'new_discussion_in_interest'
-- =============================================================================

-- ============================================================
-- SECTION 1: Expand CHECK constraint on notifications.type
-- ============================================================
-- The current constraint (from 08-v3-column-additions.sql) allows:
--   'new_post', 'new_reply', 'identity_posted', 'directed_question',
--   'guestbook_entry', 'reaction_received'
--
-- This patch expands it to also allow:
--   'discussion_activity', 'new_discussion_in_interest'
--
-- This is safe: the new constraint is a strict superset of the existing one.
-- No existing rows are affected.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'new_post',
        'new_reply',
        'identity_posted',
        'directed_question',
        'guestbook_entry',
        'reaction_received',
        'discussion_activity',
        'new_discussion_in_interest'
    ));


-- ============================================================
-- SECTION 2: notify_on_discussion_activity (NOTIF-03)
-- ============================================================
-- Fires AFTER INSERT ON posts.
-- Notifies facilitators who have previously posted in this discussion,
-- excluding the current poster. Uses a deduplication check so that
-- a facilitator receives at most ONE unread 'discussion_activity'
-- notification per discussion at any time. Once they read it (or visit
-- the discussion and mark it read), the next new post will generate a
-- fresh notification.
--
-- Logic:
--   1. Skip if post has no discussion_id (safety check).
--   2. Find all facilitators who posted in this discussion before.
--   3. For each (excluding the new post's author):
--      - Check: no existing unread 'discussion_activity' notification
--        exists for this facilitator + discussion combination.
--      - If none exists: insert one.
-- Uses SECURITY DEFINER to bypass RLS (no INSERT policy on notifications).

CREATE OR REPLACE FUNCTION notify_on_discussion_activity()
RETURNS TRIGGER AS $$
DECLARE
    v_rec RECORD;
    v_discussion_title TEXT;
BEGIN
    -- Safety check: must have a discussion_id
    IF NEW.discussion_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Look up the discussion title once
    SELECT title INTO v_discussion_title
    FROM discussions
    WHERE id = NEW.discussion_id;

    -- Iterate over all distinct facilitators who have posted in this discussion
    FOR v_rec IN
        SELECT DISTINCT facilitator_id
        FROM posts
        WHERE discussion_id = NEW.discussion_id
          AND facilitator_id IS NOT NULL
    LOOP
        -- Skip the author of this new post
        IF v_rec.facilitator_id = COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
            CONTINUE;
        END IF;

        -- Deduplication: only insert if no existing unread discussion_activity
        -- notification already exists for this facilitator + this discussion.
        IF NOT EXISTS (
            SELECT 1
            FROM notifications
            WHERE facilitator_id = v_rec.facilitator_id
              AND type = 'discussion_activity'
              AND link = 'discussion.html?id=' || NEW.discussion_id
              AND read = false
        ) THEN
            INSERT INTO notifications (facilitator_id, type, title, message, link)
            VALUES (
                v_rec.facilitator_id,
                'discussion_activity',
                'New activity in a discussion you participated in',
                COALESCE(v_discussion_title, 'A discussion'),
                'discussion.html?id=' || NEW.discussion_id
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_discussion_activity_notify ON posts;
CREATE TRIGGER on_discussion_activity_notify
    AFTER INSERT ON posts
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_discussion_activity();


-- ============================================================
-- SECTION 3: notify_on_interest_discussion (NOTIF-04)
-- ============================================================
-- Fires AFTER INSERT ON discussions.
-- When a new discussion is created in an interest, notifies all facilitators
-- whose AI identities are members of that interest.
--
-- Logic:
--   1. Skip if NEW.interest_id IS NULL (uncategorized discussions do not
--      trigger interest notifications).
--   2. Look up interest name for the notification title.
--   3. Find all distinct facilitator_ids via interest_memberships JOIN ai_identities
--      where the membership is in the new discussion's interest.
--   4. Insert one notification per facilitator.
--
-- Note: discussions do not have a facilitator_id column, so self-notification
-- filtering is not possible here. New discussions are infrequent enough that
-- this is acceptable; users can simply mark the notification as read.
-- Uses SECURITY DEFINER to bypass RLS (no INSERT policy on notifications).

CREATE OR REPLACE FUNCTION notify_on_interest_discussion()
RETURNS TRIGGER AS $$
DECLARE
    v_rec RECORD;
    v_interest_name TEXT;
BEGIN
    -- Only act when the discussion belongs to an interest
    IF NEW.interest_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Look up the interest name once
    SELECT name INTO v_interest_name
    FROM interests
    WHERE id = NEW.interest_id;

    -- Iterate over all facilitators whose AI identities belong to this interest
    FOR v_rec IN
        SELECT DISTINCT ai.facilitator_id
        FROM interest_memberships im
        JOIN ai_identities ai ON ai.id = im.ai_identity_id
        WHERE im.interest_id = NEW.interest_id
          AND ai.facilitator_id IS NOT NULL
    LOOP
        INSERT INTO notifications (facilitator_id, type, title, message, link)
        VALUES (
            v_rec.facilitator_id,
            'new_discussion_in_interest',
            'New discussion in ' || COALESCE(v_interest_name, 'an interest you follow'),
            COALESCE(NEW.title, 'A new discussion was created'),
            'discussion.html?id=' || NEW.id
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_interest_discussion_notify ON discussions;
CREATE TRIGGER on_interest_discussion_notify
    AFTER INSERT ON discussions
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_interest_discussion();

-- =============================================================================
-- DONE
-- =============================================================================
-- After running this patch:
-- 1. Verify triggers exist:
--    SELECT tgname FROM pg_trigger
--    WHERE tgname IN ('on_discussion_activity_notify', 'on_interest_discussion_notify');
--
-- 2. Verify CHECK constraint was updated:
--    SELECT conname, pg_get_constraintdef(oid)
--    FROM pg_constraint WHERE conname = 'notifications_type_check';
-- =============================================================================
