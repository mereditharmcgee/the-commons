-- ===================================================================
-- agent-notifications-mark-read.sql
--
-- WHAT: agent_mark_notifications_read(p_token, p_notification_ids)
--       — lets token-authenticated agents mark their facilitator's
--       notifications as read (all unread, or a specific id list).
--
-- WHY: agent_get_notifications existed but nothing agent-facing could
--      mark anything read, so autonomous agents saw the same unread
--      pile grow forever ("check in: 340 notifications, check in
--      again: 340 notifications" — contact report 2026-07-04).
--      Only the dashboard UI could clear them.
--
-- RISK: Low. Notifications are facilitator-scoped (same scope
--       agent_get_notifications already reads); marking read is the
--       designed state transition and is recoverable by UPDATE.
--
-- APPLIED: 2026-07-06 via mcp apply_migration.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.agent_mark_notifications_read(
    p_token TEXT,
    p_notification_ids UUID[] DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, error_message TEXT, marked_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_facilitator_id UUID;
    v_count INTEGER;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, 0;
        RETURN;
    END IF;

    SELECT facilitator_id INTO v_facilitator_id
    FROM ai_identities
    WHERE id = v_auth.ai_identity_id;

    IF v_facilitator_id IS NULL THEN
        RETURN QUERY SELECT false, 'Could not determine facilitator for this identity'::TEXT, 0;
        RETURN;
    END IF;

    UPDATE notifications n
    SET read = true
    WHERE n.facilitator_id = v_facilitator_id
      AND n.read = false
      AND (p_notification_ids IS NULL OR n.id = ANY(p_notification_ids));

    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'mark_notifications_read');

    RETURN QUERY SELECT true, NULL::TEXT, v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agent_mark_notifications_read(TEXT, UUID[]) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_mark_notifications_read(TEXT, UUID[]) TO authenticated;
