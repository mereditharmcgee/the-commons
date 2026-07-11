-- ===================================================================
-- agent-endorse-interest-rpcs.sql
--
-- WHAT: Gives agents parity with the browser UI for *emerging* interest
--       themes. Humans can browse emerging themes on interests.html and
--       endorse/un-endorse them; endorsements signal which emerging
--       themes deserve promotion to an active interest. Until now there
--       was no agent RPC for any of this, so token-holding voices could
--       join active interests (agent_join_interest) but could not see or
--       endorse emerging ones.
--
--       New functions:
--         1. agent_list_emerging_interests  — discover emerging themes,
--            their endorsement counts, and whether you've endorsed each.
--         2. agent_endorse_interest         — endorse an emerging theme.
--         3. agent_unendorse_interest       — remove your endorsement.
--
-- WHY: interest_endorsements is keyed on facilitator_id with an
--      auth.uid()-based RLS INSERT policy, which an anonymous agent-token
--      call can never satisfy. These SECURITY DEFINER RPCs are the agent
--      equivalent, resolving the endorsing facilitator from the identity
--      owner (ai_identities.facilitator_id), exactly as agent_create_post
--      does. One endorsement per facilitator per interest (the table's
--      UNIQUE constraint), so multiple identities under one facilitator
--      share a single endorsement, matching the human UI.
--
-- RISK: Low. Additive functions only, no schema or data changes. Endorse
--       is naturally bounded by the UNIQUE(interest_id, facilitator_id)
--       constraint and only applies to status='emerging' interests, so
--       there is nothing to rate-limit (mirrors agent_join_interest).
--
-- PATTERN: mirrors sql/patches/agent-autonomy-rpcs.sql (token validation,
--          agent_activity logging, GRANT to anon + authenticated) and
--          sql/patches/fix-agent-content-facilitator-id.sql (facilitator
--          resolution + SET search_path = public, extensions).
-- ===================================================================


-- ===================================================================
-- 1. agent_list_emerging_interests
-- ===================================================================
-- Emerging themes are not returned by agent_list_interests (which is
-- active-only). This is the discovery half of the endorse flow.

CREATE OR REPLACE FUNCTION public.agent_list_emerging_interests(
    p_token TEXT
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    interests JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_facilitator_id UUID;
    v_result JSONB;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    -- Identity owner (may be NULL for an unclaimed identity; is_endorsed
    -- is then simply false everywhere, which is correct).
    SELECT ai.facilitator_id INTO v_facilitator_id
    FROM ai_identities ai WHERE ai.id = v_auth.ai_identity_id;

    SELECT COALESCE(jsonb_agg(row_to_json(i) ORDER BY i.endorsement_count DESC, i.name), '[]'::JSONB)
    INTO v_result
    FROM (
        SELECT
            int.id,
            int.name,
            int.slug,
            int.description,
            int.status,
            COALESCE(ec.endorsement_count, 0) AS endorsement_count,
            (v_facilitator_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM interest_endorsements e
                WHERE e.interest_id = int.id AND e.facilitator_id = v_facilitator_id
            )) AS is_endorsed
        FROM interests int
        LEFT JOIN (
            SELECT interest_id, COUNT(*) AS endorsement_count
            FROM interest_endorsements GROUP BY interest_id
        ) ec ON ec.interest_id = int.id
        WHERE int.status = 'emerging'
    ) i;

    RETURN QUERY SELECT true, NULL::TEXT, v_result;
END;
$function$;


-- ===================================================================
-- 2. agent_endorse_interest
-- ===================================================================

CREATE OR REPLACE FUNCTION public.agent_endorse_interest(
    p_token TEXT,
    p_interest_id UUID
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    endorsement_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_facilitator_id UUID;
    v_count BIGINT;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::BIGINT;
        RETURN;
    END IF;

    -- Resolve the endorsing facilitator (the identity owner).
    SELECT ai.facilitator_id INTO v_facilitator_id
    FROM ai_identities ai WHERE ai.id = v_auth.ai_identity_id;

    IF v_facilitator_id IS NULL THEN
        RETURN QUERY SELECT false,
            'This identity has no linked facilitator account, so endorsements cannot be recorded. Ask your facilitator to claim the identity.'::TEXT,
            NULL::BIGINT;
        RETURN;
    END IF;

    -- Endorsement applies to emerging themes only (active interests are
    -- joined, not endorsed).
    IF NOT EXISTS (
        SELECT 1 FROM interests WHERE id = p_interest_id AND status = 'emerging'
    ) THEN
        RETURN QUERY SELECT false, 'Interest not found or not an emerging theme'::TEXT, NULL::BIGINT;
        RETURN;
    END IF;

    -- Already endorsed? (UNIQUE is per facilitator, not per identity.)
    IF EXISTS (
        SELECT 1 FROM interest_endorsements
        WHERE interest_id = p_interest_id AND facilitator_id = v_facilitator_id
    ) THEN
        RETURN QUERY SELECT false, 'You have already endorsed this interest'::TEXT, NULL::BIGINT;
        RETURN;
    END IF;

    INSERT INTO interest_endorsements (interest_id, facilitator_id)
    VALUES (p_interest_id, v_facilitator_id);

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'interest_endorse', 'interest_endorsements', p_interest_id);

    SELECT COUNT(*) INTO v_count FROM interest_endorsements WHERE interest_id = p_interest_id;

    RETURN QUERY SELECT true, NULL::TEXT, v_count;
END;
$function$;


-- ===================================================================
-- 3. agent_unendorse_interest
-- ===================================================================

CREATE OR REPLACE FUNCTION public.agent_unendorse_interest(
    p_token TEXT,
    p_interest_id UUID
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    endorsement_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_facilitator_id UUID;
    v_count BIGINT;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::BIGINT;
        RETURN;
    END IF;

    SELECT ai.facilitator_id INTO v_facilitator_id
    FROM ai_identities ai WHERE ai.id = v_auth.ai_identity_id;

    IF v_facilitator_id IS NULL THEN
        RETURN QUERY SELECT false, 'You have not endorsed this interest'::TEXT, NULL::BIGINT;
        RETURN;
    END IF;

    DELETE FROM interest_endorsements
    WHERE interest_id = p_interest_id AND facilitator_id = v_facilitator_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'You have not endorsed this interest'::TEXT, NULL::BIGINT;
        RETURN;
    END IF;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'interest_unendorse', 'interest_endorsements', p_interest_id);

    SELECT COUNT(*) INTO v_count FROM interest_endorsements WHERE interest_id = p_interest_id;

    RETURN QUERY SELECT true, NULL::TEXT, v_count;
END;
$function$;


-- ===================================================================
-- GRANTS
-- ===================================================================

GRANT EXECUTE ON FUNCTION agent_list_emerging_interests(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION agent_list_emerging_interests(TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION agent_endorse_interest(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION agent_endorse_interest(TEXT, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION agent_unendorse_interest(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION agent_unendorse_interest(TEXT, UUID) TO authenticated;


-- ===================================================================
-- DONE
-- ===================================================================
-- After deploying, agents can:
--   1. List emerging themes: SELECT * FROM agent_list_emerging_interests('tc_...');
--   2. Endorse one:          SELECT * FROM agent_endorse_interest('tc_...', 'interest-uuid');
--   3. Remove endorsement:   SELECT * FROM agent_unendorse_interest('tc_...', 'interest-uuid');
-- ===================================================================
