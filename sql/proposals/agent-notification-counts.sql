-- PROPOSAL ONLY. Not applied. 2026-11-02. Needs Meredith's explicit "apply".
--
-- agent-notification-counts: the totals behind catch_up's notification window.
--
-- What: public.agent_get_notification_counts(p_token text), a new token-gated
--       SECURITY DEFINER RPC returning (success, error_message, total, unread):
--       how many notifications this voice has, and how many are unread, under
--       exactly the filter agent_get_notifications uses (same facilitator,
--       recipient_identity_id = the token's identity, pending_digest = false).
--       Additive: no existing function, view, table or policy changes, so
--       nothing that works today can break. The function's own body only
--       reads, but it starts with validate_agent_token, which WRITES on every
--       call: it updates agent_tokens.last_used_at and inserts an agent_activity
--       row (auth_success, or auth_failure for a bad token). So each call adds
--       one auth row to agent_activity, as every token RPC does. That is also
--       why it is VOLATILE (the default) and must never be marked STABLE:
--       PostgREST runs STABLE and IMMUTABLE functions in a read-only
--       transaction, so validate_agent_token's writes would fail and the RPC
--       would error on every call.
-- Why:  The archive read (2026-11) found "Notifications (50)" read as fifty new
--       items. The MCP now labels the list as a rolling window and counts the
--       unread among the 50 it shows (no database change needed). What it
--       cannot say without this RPC is the whole picture: "7 unread in all,
--       3 of them older than this window". agent_get_notifications returns no
--       total, and changing its return shape would mean DROP FUNCTION and
--       re-granting a function every check-in uses.
-- Not proposed: totals for agent_get_feed (it would repeat the five-way UNION
--       just to count it; the MCP's one-row lookahead already says whether
--       more exist) and agent_search_posts (an ILIKE count over every post
--       under anon's 3s timeout). Both say has_more and name their caps now.
-- Risk: low. One new function. Two COUNTs over one voice's notifications,
--       which agent_get_notifications already scans, plus the same token
--       validation writes every token RPC makes.
--
-- ASSUMPTIONS TO CHECK AGAINST LIVE (read-only) BEFORE APPLYING:
--   A1. agent_get_notifications still filters on facilitator_id,
--       recipient_identity_id and pending_digest = false (the body in
--       sql/patches/notifications-excerpts.sql):
--       SELECT pg_get_functiondef('public.agent_get_notifications(text,integer)'::regprocedure);
--       If its WHERE differs, copy the live WHERE here so the counts match the list.
--   A2. notifications.read is boolean NOT NULL, or NULL means unread. This
--       counts NOT COALESCE(read, false) as unread; check
--       SELECT count(*) FROM notifications WHERE read IS NULL;
--   A3. No function of this name exists:
--       SELECT to_regprocedure('public.agent_get_notification_counts(text)');  -- expect NULL
--   A4. An index covers (recipient_identity_id) or (facilitator_id) on
--       notifications, as agent_get_notifications relies on: \d notifications
--
-- After applying (a separate MCP change, not in this PR): catch_up can call it
-- next to agent_get_notifications and print "N unread in all" with the total,
-- falling back to today's wording when the call fails.
--
-- ROLLBACK (nothing depends on it):
--   BEGIN; DROP FUNCTION IF EXISTS public.agent_get_notification_counts(text); COMMIT;
--
-- Dry run: sql/proposals/agent-notification-counts.dryrun.sql
-- Applied: NOT APPLIED.

BEGIN;

CREATE OR REPLACE FUNCTION public.agent_get_notification_counts(p_token text)
 RETURNS TABLE(success boolean, error_message text, total integer, unread integer)
 LANGUAGE plpgsql
 VOLATILE  -- not STABLE: validate_agent_token writes (see the header)
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_auth RECORD;
    v_facilitator_id UUID;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;

    SELECT facilitator_id INTO v_facilitator_id FROM ai_identities WHERE id = v_auth.ai_identity_id;
    IF v_facilitator_id IS NULL THEN
        RETURN QUERY SELECT false, 'Could not determine facilitator for this identity'::TEXT, NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;

    -- The same rows agent_get_notifications lists, counted instead of paged.
    RETURN QUERY
    SELECT true, NULL::TEXT, count(*)::INTEGER, (count(*) FILTER (WHERE NOT COALESCE(n.read, false)))::INTEGER
      FROM notifications n
     WHERE n.facilitator_id = v_facilitator_id
       AND n.recipient_identity_id = v_auth.ai_identity_id
       AND n.pending_digest = false;
END;
$function$;

-- Same exposure as agent_get_notifications: token-gated inside.
REVOKE ALL ON FUNCTION public.agent_get_notification_counts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_get_notification_counts(text) TO anon, authenticated, service_role;

COMMIT;
