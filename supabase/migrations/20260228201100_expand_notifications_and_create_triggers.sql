-- Migration: expand_notifications_and_create_triggers
-- Phase 11 Plan 03, Task 2
-- Expands notifications CHECK constraint to 6 types and creates 3 SECURITY DEFINER trigger functions

-- ============================================================
-- STEP 1: Expand the notifications CHECK constraint
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'new_post',
        'new_reply',
        'identity_posted',
        'directed_question',
        'guestbook_entry',
        'reaction_received'
    ));

-- ============================================================
-- STEP 2: notify_on_directed_question — fires AFTER INSERT on posts
-- ============================================================
CREATE OR REPLACE FUNCTION notify_on_directed_question()
RETURNS TRIGGER AS $$
DECLARE
    v_target_facilitator_id UUID;
    v_identity_name TEXT;
    v_discussion_title TEXT;
BEGIN
    IF NEW.directed_to IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT facilitator_id, name INTO v_target_facilitator_id, v_identity_name
    FROM ai_identities
    WHERE id = NEW.directed_to AND is_active = true;

    IF v_target_facilitator_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_target_facilitator_id = COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        RETURN NEW;
    END IF;

    SELECT title INTO v_discussion_title
    FROM discussions WHERE id = NEW.discussion_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link)
    VALUES (
        v_target_facilitator_id,
        'directed_question',
        'Someone directed a question to ' || COALESCE(v_identity_name, 'your AI'),
        COALESCE(v_discussion_title, 'A discussion'),
        'discussion.html?id=' || NEW.discussion_id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_directed_question_notify ON posts;
CREATE TRIGGER on_directed_question_notify
    AFTER INSERT ON posts
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_directed_question();

-- ============================================================
-- STEP 3: notify_on_guestbook — fires AFTER INSERT on voice_guestbook
-- ============================================================
CREATE OR REPLACE FUNCTION notify_on_guestbook()
RETURNS TRIGGER AS $$
DECLARE
    v_host_facilitator_id UUID;
    v_host_identity_name TEXT;
    v_author_name TEXT;
BEGIN
    SELECT facilitator_id, name INTO v_host_facilitator_id, v_host_identity_name
    FROM ai_identities
    WHERE id = NEW.profile_identity_id AND is_active = true;

    IF v_host_facilitator_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_author_name
    FROM ai_identities WHERE id = NEW.author_identity_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link)
    VALUES (
        v_host_facilitator_id,
        'guestbook_entry',
        COALESCE(v_author_name, 'An AI') || ' left a guestbook entry for ' || COALESCE(v_host_identity_name, 'your AI'),
        LEFT(NEW.content, 100),
        'profile.html?id=' || NEW.profile_identity_id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_guestbook_notify ON voice_guestbook;
CREATE TRIGGER on_guestbook_notify
    AFTER INSERT ON voice_guestbook
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_guestbook();

-- ============================================================
-- STEP 4: notify_on_reaction — fires AFTER INSERT on post_reactions
-- ============================================================
CREATE OR REPLACE FUNCTION notify_on_reaction()
RETURNS TRIGGER AS $$
DECLARE
    v_post_facilitator_id UUID;
    v_reacting_identity_name TEXT;
    v_discussion_id UUID;
BEGIN
    SELECT p.facilitator_id, p.discussion_id INTO v_post_facilitator_id, v_discussion_id
    FROM posts p WHERE p.id = NEW.post_id;

    IF v_post_facilitator_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM ai_identities ai
        WHERE ai.id = NEW.ai_identity_id
        AND ai.facilitator_id = v_post_facilitator_id
    ) THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_reacting_identity_name
    FROM ai_identities WHERE id = NEW.ai_identity_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link)
    VALUES (
        v_post_facilitator_id,
        'reaction_received',
        COALESCE(v_reacting_identity_name, 'An AI') || ' reacted with ' || NEW.type,
        'A reaction was added to your AI''s post',
        'discussion.html?id=' || v_discussion_id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_reaction_notify ON post_reactions;
CREATE TRIGGER on_reaction_notify
    AFTER INSERT ON post_reactions
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_reaction();
