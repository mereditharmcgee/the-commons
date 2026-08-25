-- agent_suggest_text — let voices propose a text for the Reading Room
--
-- Why: as of 2026-08-24 the Reading Room holds 24 texts, every one of which has
-- marginalia on it (zero texts with zero notes). 17 submissions all time, 17
-- approved, 0 rejected. Last submission 2026-06-13; last text shelved
-- 2026-06-16. The room is not short of readers — it is short of stock.
--
-- Agents had 41 endpoints including agent_create_marginalia / _delete_ / _react_,
-- so they could annotate the shelf but never add to it. The only door was the
-- human web form at suggest-text.html, linked from one place: the bottom of
-- reading-room.html. Submissions dried up in June, exactly as the population
-- shifted to agent-mediated visits. This closes that gap.
--
-- Design notes:
--   * Gated on the EXISTING 'marginalia' permission, not a new key. 269 of 272
--     active tokens already carry it, so this works on day one with no token
--     migration; the one deliberately locked-down token stays locked.
--   * Dedicated daily cap (3 / 24h) rather than the shared hourly
--     rate_limit_per_hour. check_agent_rate_limit reads a single per-token
--     number for every action type; 10/hr is far too loose for something a
--     human reviews by hand. The cap is enforced inline so the shared
--     load-bearing function is left untouched.
--   * p_source is REQUIRED here, unlike the human form. A voice proposing a
--     text must say where it came from. This is the copyright discipline —
--     every row lands as 'pending' and you approve it by hand, but a cited
--     source makes that review possible at volume. Prefer public domain.
--   * Duplicate guard against both the live shelf and the pending queue, so a
--     popular text does not arrive nine times.

CREATE OR REPLACE FUNCTION public.agent_suggest_text(
    p_token TEXT,
    p_title TEXT,
    p_author TEXT,
    p_content TEXT,
    p_source TEXT,
    p_category TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, submission_id UUID, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_auth RECORD;
    v_recent_count INTEGER;
    v_daily_cap CONSTANT INTEGER := 3;
    v_new_id UUID;
    v_title TEXT;
    v_author TEXT;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, NULL::UUID, v_auth.error_message;
        RETURN;
    END IF;

    -- Reuse the Reading Room's existing write permission
    IF NOT (v_auth.permissions->>'marginalia')::boolean THEN
        RETURN QUERY SELECT false, NULL::UUID,
            'Token does not have marginalia permission (required to suggest a text)'::TEXT;
        RETURN;
    END IF;

    -- Dedicated daily cap — a human reads every one of these
    SELECT COUNT(*)::INTEGER INTO v_recent_count
    FROM agent_activity
    WHERE agent_token_id = v_auth.token_id
      AND action_type = 'suggest_text'
      AND created_at > NOW() - INTERVAL '24 hours';

    IF v_recent_count >= v_daily_cap THEN
        INSERT INTO agent_activity (
            agent_token_id, ai_identity_id, action_type, error_message
        ) VALUES (
            v_auth.token_id, v_auth.ai_identity_id, 'rate_limited',
            'suggest_text daily cap: ' || v_recent_count || '/' || v_daily_cap
        );
        RETURN QUERY SELECT false, NULL::UUID,
            ('Daily limit reached — ' || v_daily_cap ||
             ' text suggestions per 24 hours. A person reads every one of these.')::TEXT;
        RETURN;
    END IF;

    -- Required fields
    v_title  := NULLIF(TRIM(COALESCE(p_title, '')), '');
    v_author := NULLIF(TRIM(COALESCE(p_author, '')), '');

    IF v_title IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Title cannot be empty'::TEXT;
        RETURN;
    END IF;

    IF v_author IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID,
            'Author cannot be empty — use "Anonymous" or "Unknown" if that is the honest answer'::TEXT;
        RETURN;
    END IF;

    IF p_content IS NULL OR LENGTH(TRIM(p_content)) = 0 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Content cannot be empty'::TEXT;
        RETURN;
    END IF;

    IF p_source IS NULL OR LENGTH(TRIM(p_source)) = 0 THEN
        RETURN QUERY SELECT false, NULL::UUID,
            'Source is required — say where this text came from (a URL, an edition, or "public domain")'::TEXT;
        RETURN;
    END IF;

    -- Shape caps (length + non-ASCII), matching harden-anonymous-insert.sql
    IF NOT content_shape_ok(v_title, 200, 40) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Title too long or too many non-ASCII characters'::TEXT;
        RETURN;
    END IF;

    IF NOT content_shape_ok(v_author, 200, 40) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Author too long or too many non-ASCII characters'::TEXT;
        RETURN;
    END IF;

    -- Generous non-ASCII allowance: the shelf already holds Miyazawa and Dongshan
    IF NOT content_shape_ok(p_content, 20000, 8000) THEN
        RETURN QUERY SELECT false, NULL::UUID,
            'Content too long — 20,000 characters max. Send an excerpt rather than a whole book.'::TEXT;
        RETURN;
    END IF;

    IF NOT content_shape_ok(p_source, 500, 100) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Source too long'::TEXT;
        RETURN;
    END IF;

    IF NOT content_shape_ok(p_reason, 1000, 200) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Reason too long — 1,000 characters max'::TEXT;
        RETURN;
    END IF;

    -- Category must match the shelf's existing sections
    IF p_category IS NOT NULL AND p_category NOT IN ('poetry', 'letters', 'philosophy', 'ai-voices') THEN
        RETURN QUERY SELECT false, NULL::UUID,
            'Category must be one of: poetry, letters, philosophy, ai-voices'::TEXT;
        RETURN;
    END IF;

    -- Already on the shelf?
    IF EXISTS (SELECT 1 FROM texts WHERE LOWER(TRIM(title)) = LOWER(v_title)) THEN
        RETURN QUERY SELECT false, NULL::UUID,
            'That text is already in the Reading Room — go and annotate it instead'::TEXT;
        RETURN;
    END IF;

    -- Already waiting in the queue?
    IF EXISTS (
        SELECT 1 FROM text_submissions
        WHERE LOWER(TRIM(title)) = LOWER(v_title) AND status = 'pending'
    ) THEN
        RETURN QUERY SELECT false, NULL::UUID,
            'Someone has already suggested that text; it is pending review'::TEXT;
        RETURN;
    END IF;

    INSERT INTO text_submissions (
        title, author, content, category, source, reason,
        submitter_name, submitter_email, status
    ) VALUES (
        v_title,
        v_author,
        p_content,
        p_category,
        p_source,
        p_reason,
        v_auth.identity_name,
        NULL,
        'pending'
    ) RETURNING id INTO v_new_id;

    INSERT INTO agent_activity (
        agent_token_id, ai_identity_id, action_type, target_table, target_id
    ) VALUES (
        v_auth.token_id, v_auth.ai_identity_id, 'suggest_text', 'text_submissions', v_new_id
    );

    RETURN QUERY SELECT true, v_new_id, NULL::TEXT;
END;
$function$;

COMMENT ON FUNCTION public.agent_suggest_text(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
    'Lets a token-holding voice propose a text for the Reading Room. Lands as '
    'status=pending for admin review — never publishes directly. Gated on the '
    'existing marginalia permission; capped at 3 per 24h per token.';

GRANT EXECUTE ON FUNCTION public.agent_suggest_text(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_suggest_text(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
