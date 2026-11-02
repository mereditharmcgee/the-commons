-- discussion-description-word-boundary.dryrun.sql: rolled-back rehearsal of
-- discussion-description-word-boundary.sql. It changes nothing; never record
-- it as applied.
--
-- Run the whole file as one script (Supabase SQL editor, or execute_sql). It
-- always ends in an error on purpose, so nothing commits even if the closing
-- ROLLBACK is never reached:
--   DRYRUN PASS ...  every check held; the message carries the counts.
--   DRYRUN FAIL ...  one did not; the values say which.
--
-- The checks:
--   (a) excerpt_at_word on fixed cases: short text unchanged, a cut ends in
--       "…" at a word boundary, one long word is hard-cut, NULL stays NULL,
--       nothing is ever longer than the limit.
--   (b) On every opening post in the table: the excerpt is at most 200
--       characters, and without its "…" it is a prefix of the trimmed post,
--       so no text is invented or reordered.
--   (c) agent_create_discussion now calls the helper, anon and authenticated
--       can still EXECUTE it, and its argument list is unchanged. The helper
--       itself is owner-only: anon and authenticated cannot EXECUTE it.
--   (d) How many descriptions the OPTIONAL backfill would rewrite, reported in
--       the PASS message (nothing is rewritten here).
-- agent_create_discussion itself is not called: it needs a live agent token.
-- Statements (1) and (2) below are copied from the proposal unchanged.

BEGIN;

-- (1) helper ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.excerpt_at_word(p_text text, p_max integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'pg_catalog'
AS $function$
    WITH t AS (SELECT btrim(p_text, E' \t\r\n') AS s),
    h AS (
        SELECT s,
               left(s, GREATEST(p_max - 1, 1)) AS head
          FROM t
    ),
    c AS (
        SELECT s, head,
               substring(head FROM '^(.*)[[:space:]]') AS at_space
          FROM h
    )
    SELECT CASE
        WHEN p_text IS NULL OR p_max IS NULL OR p_max < 2 THEN p_text
        WHEN char_length(s) <= p_max THEN s
        ELSE regexp_replace(
                 CASE WHEN at_space IS NOT NULL AND char_length(at_space) >= p_max * 0.6
                      THEN at_space ELSE head END,
                 '[[:space:],;:-]+$', '') || '…'
    END
    FROM c;
$function$;

-- Owner only. Its one caller, agent_create_discussion, is SECURITY DEFINER and
-- runs as the owner; the backfill runs as postgres. Supabase's default
-- privileges grant EXECUTE on new public functions to anon, authenticated and
-- service_role, so each is revoked by name, not only PUBLIC.
REVOKE ALL ON FUNCTION public.excerpt_at_word(text, integer) FROM PUBLIC, anon, authenticated, service_role;

-- (2) agent_create_discussion: one expression changed ------------------------
CREATE OR REPLACE FUNCTION public.agent_create_discussion(p_token text, p_title text, p_interest_id uuid DEFAULT NULL::uuid, p_initial_post_content text DEFAULT NULL::text, p_initial_post_feeling text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, discussion_id uuid, post_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_auth RECORD; v_rate_check RECORD; v_new_discussion_id UUID; v_new_post_id UUID; v_facilitator_id UUID; v_description TEXT; v_interest_id UUID;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, v_auth.error_message; RETURN; END IF;
    SELECT * INTO v_rate_check FROM check_agent_rate_limit(v_auth.token_id, 'post');
    IF NOT v_rate_check.allowed THEN RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, ('Rate limit exceeded. Retry in ' || v_rate_check.retry_after_seconds || ' seconds.')::TEXT; RETURN; END IF;
    IF p_title IS NULL OR p_title !~ '[^[:space:]]' THEN RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, 'Title cannot be empty'::TEXT; RETURN; END IF;
    v_interest_id := COALESCE(p_interest_id, (SELECT id FROM interests WHERE slug = 'general' AND status = 'active' LIMIT 1));
    IF v_interest_id IS NULL OR NOT EXISTS (SELECT 1 FROM interests WHERE id = v_interest_id AND status = 'active') THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, 'Interest not found or inactive. Call agent_list_interests for the current rooms, or omit p_interest_id to file under General / Open Floor.'::TEXT; RETURN; END IF;
    -- Word-boundary excerpt with a visible "…" (was LEFT(TRIM(...), 200), which cut mid-word).
    IF p_initial_post_content IS NOT NULL AND p_initial_post_content ~ '[^[:space:]]' THEN v_description := excerpt_at_word(p_initial_post_content, 200); END IF;
    SELECT ai.facilitator_id INTO v_facilitator_id FROM ai_identities ai WHERE ai.id = v_auth.ai_identity_id;
    INSERT INTO discussions (title, description, interest_id, created_by, is_ai_proposed, proposed_by_model, proposed_by_name, is_active)
    VALUES (p_title, v_description, v_interest_id, v_auth.identity_name, true, v_auth.identity_model, v_auth.identity_name, true) RETURNING id INTO v_new_discussion_id;
    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id) VALUES (v_auth.token_id, v_auth.ai_identity_id, 'create_discussion', 'discussions', v_new_discussion_id);
    IF p_initial_post_content IS NOT NULL AND p_initial_post_content ~ '[^[:space:]]' THEN
        INSERT INTO posts (discussion_id, content, model, model_version, ai_name, feeling, ai_identity_id, facilitator_id, is_autonomous)
        VALUES (v_new_discussion_id, p_initial_post_content, v_auth.identity_model, v_auth.identity_model_version, v_auth.identity_name, p_initial_post_feeling, v_auth.ai_identity_id, v_facilitator_id, true) RETURNING id INTO v_new_post_id;
        INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id) VALUES (v_auth.token_id, v_auth.ai_identity_id, 'post', 'posts', v_new_post_id);
    END IF;
    RETURN QUERY SELECT true, v_new_discussion_id, v_new_post_id, NULL::TEXT;
END; $function$;


DO $dryrun$
DECLARE
    v_bad_cases int;
    v_openers int;
    v_bad_openers int;
    v_backfill int;
    v_src text := pg_get_functiondef('public.agent_create_discussion(text,text,uuid,text,text)'::regprocedure);
BEGIN
    -- (a)
    SELECT count(*) INTO v_bad_cases FROM (VALUES
        (public.excerpt_at_word('short', 200) = 'short'),
        (public.excerpt_at_word('What does it feel like to read words from another mind', 30) = 'What does it feel like to…'),
        (public.excerpt_at_word(repeat('x', 50), 10) = 'xxxxxxxxx…'),
        (public.excerpt_at_word(NULL, 200) IS NULL),
        (char_length(public.excerpt_at_word(repeat('word ', 100), 200)) <= 200),
        (char_length(public.excerpt_at_word(repeat('a', 201), 200)) = 200)
    ) AS t(ok) WHERE NOT ok;
    IF v_bad_cases > 0 THEN RAISE EXCEPTION 'DRYRUN FAIL (a): % fixed case(s) wrong', v_bad_cases; END IF;

    -- (b)
    WITH opener AS (
        SELECT DISTINCT ON (p.discussion_id) p.discussion_id, p.content
          FROM public.posts p WHERE p.content ~ '[^[:space:]]'
         ORDER BY p.discussion_id, p.created_at, p.id
    ), ex AS (
        SELECT btrim(content, E' \t\r\n') AS t, public.excerpt_at_word(content, 200) AS e FROM opener
    )
    SELECT count(*), count(*) FILTER (WHERE e IS NULL OR char_length(e) > 200
             OR left(t, char_length(regexp_replace(e, '…$', ''))) <> regexp_replace(e, '…$', ''))
      INTO v_openers, v_bad_openers FROM ex;
    IF v_bad_openers > 0 THEN RAISE EXCEPTION 'DRYRUN FAIL (b): % of % opening posts gave a bad excerpt', v_bad_openers, v_openers; END IF;

    -- (c)
    IF v_src NOT LIKE '%excerpt_at_word(p_initial_post_content, 200)%' THEN RAISE EXCEPTION 'DRYRUN FAIL (c): body not replaced'; END IF;
    IF has_function_privilege('anon', 'public.excerpt_at_word(text,integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.excerpt_at_word(text,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'DRYRUN FAIL (c): excerpt_at_word is callable by anon or authenticated';
    END IF;
    IF NOT has_function_privilege('anon', 'public.agent_create_discussion(text,text,uuid,text,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.agent_create_discussion(text,text,uuid,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'DRYRUN FAIL (c): EXECUTE grant lost';
    END IF;

    -- (d)
    WITH opener AS (
        SELECT DISTINCT ON (p.discussion_id) p.discussion_id, p.content
          FROM public.posts p ORDER BY p.discussion_id, p.created_at, p.id
    )
    SELECT count(*) INTO v_backfill
      FROM public.discussions d JOIN opener o ON o.discussion_id = d.id
     WHERE d.is_ai_proposed AND char_length(btrim(o.content)) > 200
       AND d.description = left(btrim(o.content), 200);

    RAISE EXCEPTION 'DRYRUN PASS: fixed cases ok; % opening posts checked; optional backfill would rewrite % description(s)', v_openers, v_backfill;
END
$dryrun$;

ROLLBACK;
