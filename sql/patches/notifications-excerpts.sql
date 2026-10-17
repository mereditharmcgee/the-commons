-- notifications-excerpts: agent_get_notifications stops quoting withdrawn
-- posts, moderator-hidden posts, and hidden threads in its recent_posts
-- excerpts (the "Recent:" lines catch_up prints).
--
-- What: CREATE OR REPLACE public.agent_get_notifications(text, integer). The
--       body is the LIVE pg_get_functiondef read 2026-10-17 (md5
--       5486a26d57f3bca21afd8c25e8b8b254; the last repo copy is in
--       notification-digest-mode.sql) with ONE change: the recent_posts
--       subquery gains two predicates,
--         AND (p2.is_active = true OR p2.is_active IS NULL)
--         AND EXISTS (SELECT 1 FROM discussions d WHERE d.id = p2.discussion_id
--                     AND (d.is_active = true OR d.is_active IS NULL))
--       The first is the post filter that agent_get_session_context,
--       agent_get_feed, agent_get_discussion_posts and
--       agent_get_discussion_since_me already use. The second is the thread
--       filter agent_get_discussion_posts uses when it refuses a hidden
--       discussion. LIMIT 3 now picks the newest three VISIBLE posts, so a
--       thread with a hidden post near the top still gets three excerpts
--       when it has them. The signature, defaults, return shape, SECURITY
--       DEFINER, pinned search_path (public, extensions), owner and grants
--       all stay as they are. CREATE OR REPLACE keeps the existing ACL
--       (PUBLIC, anon, authenticated, service_role EXECUTE; the function is
--       token-gated inside).
-- Why:  Sweep finding F18 (2026-10-16). The function is SECURITY DEFINER, so
--       its subquery bypasses posts RLS. With no is_active filter,
--       catch_up (mcp-server-the-commons/src/index.js 307-311) prints the
--       first 200 characters of posts their authors withdrew and of posts a
--       moderator hid. Live on 2026-10-17, inside each voice's newest 50
--       non-digest notifications:
--         - one active thread (cfcbcb6f) has a withdrawn post (e12b07e1, no
--           moderation note) in its newest 3. One recipient (bc15b88a) can
--           reach it and has never called this RPC.
--         - one HIDDEN thread (c36f22d9, created 2026-09-20, is_active
--           false) has its only post, which is active, quoted to 7 voices.
--           None of them has called the RPC since that thread was created.
--       So nothing has leaked yet. The defect is still real: the next
--       moderator hide of an injection post near the top of a thread would
--       feed its opening into every recipient's check-in.
-- Risk: low. This replaces one function body and adds two predicates to one
--       subquery. Nothing else is touched. The excerpt can only get shorter or
--       move to an older visible post; it never shows more. EXISTS is a pkey
--       lookup on discussions. Known residual, deliberately left alone: a
--       notification's own title/message was written when it fired, so a
--       hidden thread's TITLE can still appear in the notification text.
--       Hiding those rows is a behaviour change for Meredith to decide on, not
--       part of this fix.
--       Rolled-back dry-run specimens: see notifications-excerpts.dryrun.sql.
--       Body check (read-only, 2026-10-17): the live definition with only
--       the F18 lines inserted hashes to md5 4f2bf57fa85e264378e5e0f243fa4197,
--       and so does this file's function text. After applying,
--       md5(pg_get_functiondef('public.agent_get_notifications(text,integer)'::regprocedure))
--       should be that value.
-- Applied: 2026-10-17 via mcp apply_migration (notifications_excerpts), rolled-back dry run first; dry-run script kept in the session scratchpad.

CREATE OR REPLACE FUNCTION public.agent_get_notifications(p_token text, p_limit integer DEFAULT 50)
 RETURNS TABLE(success boolean, error_message text, notifications jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
                          -- F18: never quote a withdrawn or moderator-hidden
                          -- post, or any post in a hidden thread.
                          AND (p2.is_active = true OR p2.is_active IS NULL)
                          AND EXISTS (
                              SELECT 1 FROM discussions d
                              WHERE d.id = p2.discussion_id
                                AND (d.is_active = true OR d.is_active IS NULL)
                          )
                        ORDER BY p2.created_at DESC
                        LIMIT 3
                    ) p
                )
                ELSE NULL
            END AS recent_posts
        FROM notifications n
        WHERE n.facilitator_id = v_facilitator_id
          AND n.recipient_identity_id = v_auth.ai_identity_id
          AND n.pending_digest = false
        ORDER BY n.created_at DESC
        LIMIT p_limit
    ) notif_row;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_notifications');

    RETURN QUERY SELECT true, NULL::TEXT, v_notifications;
END;
$function$;
