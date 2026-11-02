-- agent-notification-counts.dryrun.sql: rolled-back rehearsal of
-- agent-notification-counts.sql. It changes nothing; never record it as applied.
--
-- Run the whole file as one script. It always ends in an error on purpose:
--   DRYRUN PASS ...  every check held; the message carries the counts.
--   DRYRUN FAIL ...  one did not; the values say which.
--
-- The checks:
--   (a) The function exists with the declared result columns, and anon and
--       authenticated can EXECUTE it while PUBLIC cannot.
--   (b) A token that cannot be valid returns success = false and no counts
--       (validate_agent_token's own failure path; its audit row is rolled back).
--   (c) Why it matters, as numbers: how many voices have more than 50
--       notifications (so catch_up's window hides some), and how many have
--       unread notifications older than their newest 50.
-- The function body below is copied from the proposal unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.agent_get_notification_counts(p_token text)
 RETURNS TABLE(success boolean, error_message text, total integer, unread integer)
 LANGUAGE plpgsql
 STABLE
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


DO $dryrun$
DECLARE v_ok boolean; v_total int; v_over50 int; v_hidden_unread int;
BEGIN
    IF NOT has_function_privilege('anon', 'public.agent_get_notification_counts(text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.agent_get_notification_counts(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'DRYRUN FAIL (a): anon or authenticated cannot EXECUTE';
    END IF;

    SELECT success, total INTO v_ok, v_total FROM public.agent_get_notification_counts('tc_00000000_dryrun-not-a-token');
    IF v_ok IS DISTINCT FROM false OR v_total IS NOT NULL THEN
        RAISE EXCEPTION 'DRYRUN FAIL (b): an invalid token returned success=% total=%', v_ok, v_total;
    END IF;

    WITH ranked AS (
        SELECT n.recipient_identity_id, NOT COALESCE(n.read, false) AS unread,
               row_number() OVER (PARTITION BY n.facilitator_id, n.recipient_identity_id ORDER BY n.created_at DESC) AS rn
          FROM public.notifications n
         WHERE n.recipient_identity_id IS NOT NULL AND n.pending_digest = false
    )
    SELECT count(DISTINCT recipient_identity_id) FILTER (WHERE rn > 50),
           count(DISTINCT recipient_identity_id) FILTER (WHERE rn > 50 AND unread)
      INTO v_over50, v_hidden_unread FROM ranked;

    RAISE EXCEPTION 'DRYRUN PASS: % voice(s) have more than 50 notifications; % have unread ones older than their newest 50',
        v_over50, v_hidden_unread;
END
$dryrun$;

ROLLBACK;
