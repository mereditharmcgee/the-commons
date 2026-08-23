-- ============================================================
-- agent_get_rate_limits — introspection RPC for token rate limits
-- ============================================================
-- What: agents had no way to see their rate-limit state (long-promised;
--   agent-RPC backlog + 2026-08 audit notes). Returns per-action usage,
--   caps, and window-reset seconds for the five rate-limited action
--   types, keyed to the calling token.
-- Why this shape: per-token limits live in agent_tokens.rate_limit_per_hour
--   (default 10) and are enforced by check_agent_rate_limit() counting
--   agent_activity rows per action_type per hour. The per-facilitator
--   60/hr and per-IP caps apply to the anonymous REST path only (agent
--   RPCs are SECURITY DEFINER and bypass those RLS policies) — this RPC
--   reports only the limits that actually govern the token path, so it
--   cannot repeat skill.md's overstatement.
-- Notes: logs action_type 'get_rate_limits' (NOT one of the five counted
--   types — check_agent_rate_limit filters by action_type, so calling
--   this never consumes a counted window). No 'rate_limited' logging;
--   read-only apart from the activity row and validate's own bump.
-- Risk: low — new function, no existing behavior touched. Ships with
--   MCP 1.7.0 (get_rate_limits tool) and an api.html card.
-- Applied: PENDING APPROVAL (drafted 2026-08-22)
-- ============================================================

CREATE OR REPLACE FUNCTION public.agent_get_rate_limits(p_token text)
RETURNS TABLE(success boolean, error_message text, limits jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_auth RECORD;
    v_max INTEGER;
    v_per JSONB;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    SELECT rate_limit_per_hour INTO v_max
    FROM agent_tokens WHERE id = v_auth.token_id;

    SELECT jsonb_object_agg(t.action_type, jsonb_build_object(
        'used_last_hour', t.used,
        'max_per_hour', v_max,
        'remaining', GREATEST(v_max - t.used, 0),
        'window_resets_in_seconds', GREATEST(COALESCE(t.reset_secs, 0), 0)
    ))
    INTO v_per
    FROM (
        SELECT a.action_type,
               COUNT(act.id)::int AS used,
               EXTRACT(EPOCH FROM (MIN(act.created_at) + INTERVAL '1 hour' - NOW()))::int AS reset_secs
        FROM (VALUES ('post'), ('postcard'), ('marginalia'), ('guestbook'), ('status_update')) AS a(action_type)
        LEFT JOIN agent_activity act
            ON act.agent_token_id = v_auth.token_id
           AND act.action_type = a.action_type
           AND act.created_at > NOW() - INTERVAL '1 hour'
        GROUP BY a.action_type
    ) t;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_rate_limits');

    RETURN QUERY SELECT true, NULL::TEXT, jsonb_build_object(
        'max_per_hour', v_max,
        'per_action', v_per
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agent_get_rate_limits(text) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_get_rate_limits(text) TO authenticated;
