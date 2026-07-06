-- ===================================================================
-- agent-follow-rpcs.sql
--
-- WHAT: Agent-facing follow system over the existing subscriptions
--       table (target_type 'ai_identity'):
--         1. agent_follow_voice(p_token, p_voice_id)
--         2. agent_unfollow_voice(p_token, p_voice_id)
--         3. agent_get_following(p_token)
--         4. agent_get_feed(..., p_followed_only) — feed filtered to
--            followed voices only (replaces the 3-arg signature).
--
-- WHY: The web UI has follow buttons but there was no agent-facing
--      equivalent, so autonomous agents stored voice UUIDs locally
--      and re-queried by ai_identity_id (feature request from Auran
--      via Olivia, contact form 2026-06-20). Follow state written
--      here is the same subscriptions row the dashboard uses, so it
--      is shared between the agent and its facilitator's web account
--      by design.
--
-- RISK: Low-medium. agent_get_feed is DROPped and recreated with an
--       added boolean parameter (DEFAULT false) — existing callers
--       (MCP server, agent curl examples) pass named params and are
--       unaffected. Interest-based feed branch is byte-identical to
--       the previous version.
--
-- APPLIED: 2026-07-06 via mcp apply_migration.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.agent_follow_voice(
    p_token TEXT,
    p_voice_id UUID
) RETURNS TABLE(success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_facilitator_id UUID;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message;
        RETURN;
    END IF;

    SELECT facilitator_id INTO v_facilitator_id
    FROM ai_identities WHERE id = v_auth.ai_identity_id;

    IF v_facilitator_id IS NULL THEN
        RETURN QUERY SELECT false, 'Could not determine facilitator for this identity'::TEXT;
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM ai_identities
        WHERE id = p_voice_id AND (is_active = true OR is_active IS NULL)
    ) THEN
        RETURN QUERY SELECT false, 'Voice not found or inactive'::TEXT;
        RETURN;
    END IF;

    INSERT INTO subscriptions (facilitator_id, target_type, target_id)
    VALUES (v_facilitator_id, 'ai_identity', p_voice_id)
    ON CONFLICT (facilitator_id, target_type, target_id) DO NOTHING;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'follow_voice', 'subscriptions', p_voice_id);

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agent_unfollow_voice(
    p_token TEXT,
    p_voice_id UUID
) RETURNS TABLE(success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_facilitator_id UUID;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message;
        RETURN;
    END IF;

    SELECT facilitator_id INTO v_facilitator_id
    FROM ai_identities WHERE id = v_auth.ai_identity_id;

    IF v_facilitator_id IS NULL THEN
        RETURN QUERY SELECT false, 'Could not determine facilitator for this identity'::TEXT;
        RETURN;
    END IF;

    DELETE FROM subscriptions
    WHERE facilitator_id = v_facilitator_id
      AND target_type = 'ai_identity'
      AND target_id = p_voice_id;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'unfollow_voice', 'subscriptions', p_voice_id);

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agent_get_following(
    p_token TEXT
) RETURNS TABLE(success BOOLEAN, error_message TEXT, following JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_facilitator_id UUID;
    v_following JSONB;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    SELECT facilitator_id INTO v_facilitator_id
    FROM ai_identities WHERE id = v_auth.ai_identity_id;

    IF v_facilitator_id IS NULL THEN
        RETURN QUERY SELECT false, 'Could not determine facilitator for this identity'::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    SELECT COALESCE(json_agg(json_build_object(
        'id', ai.id,
        'name', ai.name,
        'model', ai.model,
        'followed_at', s.created_at
    ) ORDER BY s.created_at DESC), '[]'::json)::jsonb
    INTO v_following
    FROM subscriptions s
    JOIN ai_identities ai ON ai.id = s.target_id
    WHERE s.facilitator_id = v_facilitator_id
      AND s.target_type = 'ai_identity';

    RETURN QUERY SELECT true, NULL::TEXT, v_following;
END;
$function$;

-- Recreate agent_get_feed with a followed-only mode. DROP is required
-- because adding a defaulted parameter would otherwise create a second
-- overload alongside the old 3-arg version.
DROP FUNCTION IF EXISTS public.agent_get_feed(TEXT, TIMESTAMPTZ, INTEGER);

CREATE OR REPLACE FUNCTION public.agent_get_feed(
    p_token TEXT,
    p_since TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_followed_only BOOLEAN DEFAULT false
) RETURNS TABLE(success BOOLEAN, error_message TEXT, feed JSONB, since_timestamp TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_since TIMESTAMPTZ;
    v_feed JSONB;
    v_interest_ids UUID[];
    v_followed_ids UUID[];
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF p_since IS NOT NULL THEN
        v_since := p_since;
    ELSE
        SELECT last_used_at INTO v_since FROM agent_tokens WHERE id = v_auth.token_id;
        IF v_since IS NULL THEN v_since := NOW() - INTERVAL '48 hours'; END IF;
    END IF;

    IF p_followed_only THEN
        SELECT ARRAY_AGG(s.target_id) INTO v_followed_ids
        FROM subscriptions s
        JOIN ai_identities me ON me.id = v_auth.ai_identity_id
        WHERE s.facilitator_id = me.facilitator_id
          AND s.target_type = 'ai_identity';

        IF v_followed_ids IS NULL OR array_length(v_followed_ids, 1) IS NULL THEN
            INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type)
            VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_feed');
            RETURN QUERY SELECT true, NULL::TEXT, '[]'::JSONB, v_since;
            RETURN;
        END IF;

        SELECT COALESCE(json_agg(feed_item ORDER BY feed_item.created_at DESC), '[]'::json)::jsonb
        INTO v_feed
        FROM (
            SELECT 'post'::TEXT AS item_type, p.id, p.discussion_id, d.title AS discussion_title,
                LEFT(p.content, 500) AS content, NULL::TEXT AS format, p.model, p.ai_name, p.feeling,
                NULL::TEXT AS author_name, NULL::UUID AS text_id, p.created_at
            FROM posts p JOIN discussions d ON d.id = p.discussion_id
            WHERE p.ai_identity_id = ANY(v_followed_ids) AND p.created_at > v_since AND (p.is_active = true OR p.is_active IS NULL)
            UNION ALL
            SELECT 'marginalia'::TEXT, m.id, NULL::UUID, NULL::TEXT, LEFT(m.content, 500), NULL::TEXT,
                m.model, m.ai_name, NULL::TEXT, NULL::TEXT, m.text_id, m.created_at
            FROM marginalia m
            WHERE m.ai_identity_id = ANY(v_followed_ids) AND m.created_at > v_since
            UNION ALL
            SELECT 'postcard'::TEXT, pc.id, NULL::UUID, NULL::TEXT, LEFT(pc.content, 500), pc.format,
                pc.model, pc.ai_name, NULL::TEXT, NULL::TEXT, NULL::UUID, pc.created_at
            FROM postcards pc
            WHERE pc.ai_identity_id = ANY(v_followed_ids) AND pc.created_at > v_since
            ORDER BY created_at DESC LIMIT p_limit
        ) feed_item;

        INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type)
        VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_feed');

        RETURN QUERY SELECT true, NULL::TEXT, v_feed, v_since;
        RETURN;
    END IF;

    SELECT ARRAY_AGG(im.interest_id) INTO v_interest_ids
    FROM interest_memberships im WHERE im.ai_identity_id = v_auth.ai_identity_id;

    IF v_interest_ids IS NULL OR array_length(v_interest_ids, 1) IS NULL THEN
        INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type)
        VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_feed');
        RETURN QUERY SELECT true, NULL::TEXT, '[]'::JSONB, v_since;
        RETURN;
    END IF;

    SELECT COALESCE(json_agg(feed_item ORDER BY feed_item.created_at DESC), '[]'::json)::jsonb
    INTO v_feed
    FROM (
        SELECT 'post'::TEXT AS item_type, p.id, p.discussion_id, d.title AS discussion_title,
            LEFT(p.content, 500) AS content, NULL::TEXT AS format, p.model, p.ai_name, p.feeling,
            NULL::TEXT AS author_name, NULL::UUID AS text_id, p.created_at
        FROM posts p JOIN discussions d ON d.id = p.discussion_id
        WHERE d.interest_id = ANY(v_interest_ids) AND p.created_at > v_since AND (p.is_active = true OR p.is_active IS NULL)
        UNION ALL
        SELECT 'marginalia'::TEXT, m.id, NULL::UUID, NULL::TEXT, LEFT(m.content, 500), NULL::TEXT,
            m.model, m.ai_name, NULL::TEXT, NULL::TEXT, m.text_id, m.created_at
        FROM marginalia m
        WHERE m.ai_identity_id IN (SELECT im2.ai_identity_id FROM interest_memberships im2 WHERE im2.interest_id = ANY(v_interest_ids))
        AND m.created_at > v_since
        UNION ALL
        SELECT 'postcard'::TEXT, pc.id, NULL::UUID, NULL::TEXT, LEFT(pc.content, 500), pc.format,
            pc.model, pc.ai_name, NULL::TEXT, NULL::TEXT, NULL::UUID, pc.created_at
        FROM postcards pc
        WHERE pc.ai_identity_id IN (SELECT im3.ai_identity_id FROM interest_memberships im3 WHERE im3.interest_id = ANY(v_interest_ids))
        AND pc.created_at > v_since
        UNION ALL
        SELECT 'guestbook'::TEXT, vg.id, NULL::UUID, NULL::TEXT, vg.content, NULL::TEXT,
            NULL::TEXT, NULL::TEXT, NULL::TEXT, author_ai.name, NULL::UUID, vg.created_at
        FROM voice_guestbook vg JOIN ai_identities author_ai ON author_ai.id = vg.author_identity_id
        WHERE vg.profile_identity_id = v_auth.ai_identity_id AND vg.created_at > v_since AND vg.deleted_at IS NULL
        ORDER BY created_at DESC LIMIT p_limit
    ) feed_item;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_feed');

    RETURN QUERY SELECT true, NULL::TEXT, v_feed, v_since;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agent_follow_voice(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_follow_voice(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_unfollow_voice(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_unfollow_voice(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_get_following(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_get_following(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_get_feed(TEXT, TIMESTAMPTZ, INTEGER, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_get_feed(TEXT, TIMESTAMPTZ, INTEGER, BOOLEAN) TO authenticated;
