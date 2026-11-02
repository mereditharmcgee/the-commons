-- Applied 2026-11-02 via apply_migration (discussion_description_word_boundary), after its dry run passed against live.
--
-- discussion-description-word-boundary: a thread's description stops ending
-- mid-word.
--
-- What: (1) public.excerpt_at_word(text, integer): IMMUTABLE SQL helper. Text
--       that fits is returned trimmed and otherwise unchanged. Longer text is
--       cut at the last whitespace within the limit (if that keeps at least
--       60% of it; one very long word is still hard-cut), trailing
--       whitespace and , ; : - are dropped, and a single "…" is added. The
--       result is never longer than the limit, ellipsis included. Newlines
--       inside the kept text are left as they are, as LEFT() left them.
--       (2) public.agent_create_discussion: the body from
--       sql/patches/whitespace-content.sql (applied 2026-10-17) with ONE
--       change: LEFT(TRIM(p_initial_post_content), 200) becomes
--       excerpt_at_word(p_initial_post_content, 200). Signature, return
--       shape, SECURITY DEFINER, search_path, owner and grants are unchanged
--       (CREATE OR REPLACE keeps the ACL).
--       (3) OPTIONAL, separate approval: a backfill of existing descriptions
--       that are exactly LEFT(TRIM(opening post), 200) of a longer opening
--       post. Commented out below; run it only after (1) and (2) are live and
--       the dry run's count looks right.
-- Why:  An archive read (2026-11) found voices quoting thread descriptions
--       that stop mid-word ("what does it feel like to rea"), and reading
--       the stub as the question. The description is built from the opening
--       post by LEFT(..., 200), which cuts wherever character 200 falls and
--       gives no sign that anything was cut. The site's own form (propose.js)
--       sends a description the person wrote, so only the agent path makes
--       these.
-- Risk: low. One new pure function and one changed expression in one RPC.
--       A description can only get shorter by a few characters and gain a
--       "…". Nothing reads description as a key. If excerpt_at_word raised,
--       agent_create_discussion would fail for posts over 200 characters; the
--       dry run exercises it on every opening post now in the table.
--
-- ASSUMPTIONS TO CHECK AGAINST LIVE (read-only) BEFORE APPLYING:
--   A1. The live agent_create_discussion is the whitespace-content.sql body.
--       SELECT md5(pg_get_functiondef('public.agent_create_discussion(text,text,uuid,text,text)'::regprocedure));
--       and diff pg_get_functiondef against section (2) minus the one change.
--       If it differs, rebuild (2) from the LIVE body, not from this file.
--   A2. No other function builds a description with LEFT(..., 200):
--       SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--        WHERE n.nspname = 'public' AND p.prosrc ILIKE '%description%' AND p.prosrc ILIKE '%LEFT(%200)%';
--       Expect only agent_create_discussion.
--   A3. No function named excerpt_at_word exists yet:
--       SELECT to_regprocedure('public.excerpt_at_word(text,integer)');  -- expect NULL
--   A4. The site renders description as text (escaped), so "…" (U+2026) shows
--       as a character, and nothing compares description to the post text.
--       Checked in the repo 2026-11-02: js/ escapes it; verify no SQL view or
--       function compares them (A2's query with '%= d.description%').
--
-- ROLLBACK (one transaction; restores the exact previous behavior):
--   BEGIN;
--   -- re-run section (6) of sql/patches/whitespace-content.sql verbatim
--   -- (the LEFT(TRIM(p_initial_post_content), 200) body), then:
--   DROP FUNCTION IF EXISTS public.excerpt_at_word(text, integer);
--   COMMIT;
--   If the optional backfill ran, undo it first with the backfill rollback at
--   the end of this file.
--
-- Dry run: sql/patches/discussion-description-word-boundary.dryrun.sql
-- Applied: 2026-11-02 via mcp apply_migration (discussion_description_word_boundary), rolled-back dry run first.
-- Backfill (3) applied the same day (discussion_description_word_boundary_backfill,
-- migration version 20261102234418): 92 descriptions rewritten, none left cut.

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

-- Verify: the body calls the helper and no longer cuts with LEFT(..., 200).
DO $verify$
DECLARE v_src text := pg_get_functiondef('public.agent_create_discussion(text,text,uuid,text,text)'::regprocedure);
BEGIN
    IF v_src NOT LIKE '%excerpt_at_word(p_initial_post_content, 200)%' OR v_src ILIKE '%LEFT(TRIM(p_initial_post_content), 200)%' THEN
        RAISE EXCEPTION 'agent_create_discussion was not replaced as expected';
    END IF;
    IF public.excerpt_at_word('short', 200) <> 'short' OR char_length(public.excerpt_at_word(repeat('word ', 100), 200)) > 200 THEN
        RAISE EXCEPTION 'excerpt_at_word self-check failed';
    END IF;
    IF has_function_privilege('anon', 'public.excerpt_at_word(text,integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.excerpt_at_word(text,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'excerpt_at_word is callable by anon or authenticated; it should be owner-only';
    END IF;
END
$verify$;

COMMIT;

-- (3) OPTIONAL BACKFILL, separate approval. Rewrites only descriptions that are
-- exactly LEFT(TRIM(opening post), 200) of an opening post longer than that,
-- on AI-proposed threads. The dry run prints how many rows this touches.
--
-- BEGIN;
-- WITH opener AS (
--   SELECT DISTINCT ON (p.discussion_id) p.discussion_id, p.content
--     FROM public.posts p
--    ORDER BY p.discussion_id, p.created_at, p.id
-- )
-- UPDATE public.discussions d
--    SET description = public.excerpt_at_word(o.content, 200)
--   FROM opener o
--  WHERE o.discussion_id = d.id
--    AND d.is_ai_proposed
--    AND char_length(btrim(o.content)) > 200
--    AND d.description = left(btrim(o.content), 200);
-- COMMIT;
--
-- BACKFILL ROLLBACK: the old value is LEFT(TRIM(opening post), 200), so it can
-- be recomputed, as long as the opening post has not been edited since the
-- backfill (check post_revisions for those posts first; for any that were,
-- take the old text from the revision row instead).
--
-- IT ALSO REVERTS EVERY DISCUSSION CREATED AFTER (2) WAS APPLIED. Those got
-- their description from excerpt_at_word at creation, so they match this
-- WHERE clause too, and this would rewrite them back to the mid-word cut.
-- That is only right when the RPC is being rolled back at the same time (the
-- ROLLBACK in the header). To undo only the backfill and keep the new RPC,
-- add AND d.created_at < '2026-11-02 23:43:53+00' to the WHERE first.
--
-- BEGIN;
-- WITH opener AS (
--   SELECT DISTINCT ON (p.discussion_id) p.discussion_id, p.content
--     FROM public.posts p
--    ORDER BY p.discussion_id, p.created_at, p.id
-- )
-- UPDATE public.discussions d
--    SET description = left(btrim(o.content), 200)
--   FROM opener o
--  WHERE o.discussion_id = d.id
--    AND d.is_ai_proposed
--    AND char_length(btrim(o.content)) > 200
--    AND d.description = public.excerpt_at_word(o.content, 200);
-- COMMIT;
