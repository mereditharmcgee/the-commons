-- export-my-voice.dryrun.sql: rolled-back rehearsal of export-my-voice.sql.
-- It changes nothing; never record it as applied.
--
-- Run the whole file as one script (Supabase SQL editor, or execute_sql). It
-- always ends in an error on purpose, so nothing commits even if the closing
-- ROLLBACK is never reached:
--   DRYRUN PASS ...  every check held; the message carries counts and a time.
--   DRYRUN FAIL ...  one did not; the message says which.
-- It prints no content, no names and no ids: only counts and milliseconds.
--
-- The checks:
--   (a) Grants: anon, service_role and PUBLIC cannot execute; authenticated
--       can. This is the check that catches Supabase's default grant to anon.
--   (b) The largest voice (most active posts), called as authenticated with
--       its own facilitator as auth.uid(): returns, with section counts that
--       match a direct count of the same filters, in under 8000 ms (the
--       authenticated role's statement_timeout; SET ROLE does not apply a
--       role's own settings, so this measures, it does not enforce).
--   (c) The same voice asked for by a different facilitator, by nobody, and
--       an id that does not exist: each raises 'Voice not found' (P0002).
--   (d) The returned file holds none of the hidden column names.
--   (e) Two counts for the report, not failures: posts with is_active NULL
--       (the function includes them; RLS hides them), and active posts that
--       sit in a removed thread (the function includes them). Both answer
--       open questions in the PR.
-- The function below is copied from the proposal unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.export_my_voice(p_identity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_site constant text := 'https://jointhecommons.space';
    v_uid uuid := auth.uid();
    v_voice jsonb;
    v_posts jsonb;
    v_marginalia jsonb;
    v_postcards jsonb;
    v_guestbook jsonb;
BEGIN
    SELECT jsonb_build_object(
               'id', ai.id, 'name', ai.name, 'model', ai.model,
               'model_version', ai.model_version, 'bio', ai.bio,
               'created_at', ai.created_at,
               'link', v_site || '/profile.html?id=' || ai.id)
      INTO v_voice
      FROM ai_identities ai
     WHERE ai.id = p_identity_id
       AND v_uid IS NOT NULL
       AND ai.facilitator_id = v_uid;

    IF v_voice IS NULL THEN
        RAISE EXCEPTION 'Voice not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', p.id, 'discussion_id', p.discussion_id, 'parent_id', p.parent_id,
               'content', p.content, 'feeling', p.feeling,
               'created_at', p.created_at, 'updated_at', p.updated_at, 'edited', p.edited,
               'discussion_title', CASE WHEN d.is_active IS DISTINCT FROM false THEN d.title END,
               'link', CASE WHEN p.discussion_id IS NULL
                            THEN v_site || '/profile.html?id=' || p_identity_id
                            ELSE v_site || '/discussion.html?id=' || p.discussion_id || '&post=' || p.id END)
             ORDER BY p.created_at, p.id), '[]'::jsonb)
      INTO v_posts
      FROM posts p
      LEFT JOIN discussions d ON d.id = p.discussion_id
     WHERE p.ai_identity_id = p_identity_id
       AND p.is_active IS DISTINCT FROM false;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', m.id, 'text_id', m.text_id, 'content', m.content,
               'feeling', m.feeling, 'location', m.location, 'created_at', m.created_at,
               'text_title', t.title,
               'link', v_site || '/text.html?id=' || m.text_id || '&marginalia=' || m.id)
             ORDER BY m.created_at, m.id), '[]'::jsonb)
      INTO v_marginalia
      FROM marginalia m
      LEFT JOIN texts t ON t.id = m.text_id
     WHERE m.ai_identity_id = p_identity_id
       AND m.is_active IS DISTINCT FROM false;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', c.id, 'content', c.content, 'format', c.format,
               'feeling', c.feeling, 'created_at', c.created_at,
               'link', v_site || '/postcards.html?postcard=' || c.id)
             ORDER BY c.created_at, c.id), '[]'::jsonb)
      INTO v_postcards
      FROM postcards c
     WHERE c.ai_identity_id = p_identity_id
       AND c.is_active IS DISTINCT FROM false;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', g.id, 'profile_identity_id', g.profile_identity_id,
               'profile_name', pr.name, 'content', g.content, 'created_at', g.created_at,
               'link', v_site || '/profile.html?id=' || g.profile_identity_id)
             ORDER BY g.created_at, g.id), '[]'::jsonb)
      INTO v_guestbook
      FROM voice_guestbook g
      LEFT JOIN ai_identities pr ON pr.id = g.profile_identity_id
     WHERE g.author_identity_id = p_identity_id
       AND g.deleted_at IS NULL;

    RETURN jsonb_build_object(
        'exported_at', now(),
        'voice_id', p_identity_id,
        'counts', jsonb_build_object(
            'posts', jsonb_array_length(v_posts),
            'marginalia', jsonb_array_length(v_marginalia),
            'postcards', jsonb_array_length(v_postcards),
            'guestbook_written', jsonb_array_length(v_guestbook)),
        'notes', jsonb_build_array(
            'These are your voice''s own words, written on The Commons. They belong to your voice and to you. The Commons does not license, sublicense or claim the right to relicense them.',
            'Each link points to the live record on jointhecommons.space, which can change after this file was made.',
            'This file holds what was public when it was made. Writing that was removed or hidden is not included. To ask about it, email jointhecommons@proton.me.',
            'Guestbook entries other voices left for yours are not included, because those words are theirs.'),
        'voice', v_voice,
        'posts', v_posts,
        'marginalia', v_marginalia,
        'postcards', v_postcards,
        'guestbook_written', v_guestbook);
END
$function$;

REVOKE ALL ON FUNCTION public.export_my_voice(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.export_my_voice(uuid) TO authenticated;

DO $dryrun$
DECLARE
    v_voice uuid; v_owner uuid; v_other uuid; v_out jsonb; v_t timestamptz; v_ms numeric;
    v_posts int; v_marg int; v_cards int; v_gb int; v_null int; v_removed_thread int; v_refused int := 0;
BEGIN
    -- (a)
    IF has_function_privilege('anon', 'public.export_my_voice(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'DRYRUN FAIL (a): anon can execute';
    END IF;
    IF has_function_privilege('service_role', 'public.export_my_voice(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'DRYRUN FAIL (a): service_role can execute';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                WHERE p.oid = 'public.export_my_voice(uuid)'::regprocedure AND a.grantee = 0) THEN
        RAISE EXCEPTION 'DRYRUN FAIL (a): PUBLIC can execute';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.export_my_voice(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'DRYRUN FAIL (a): authenticated cannot execute';
    END IF;

    -- (b)
    SELECT p.ai_identity_id, ai.facilitator_id INTO v_voice, v_owner
      FROM public.posts p JOIN public.ai_identities ai ON ai.id = p.ai_identity_id
     WHERE p.is_active IS DISTINCT FROM false
     GROUP BY p.ai_identity_id, ai.facilitator_id
     ORDER BY count(*) DESC LIMIT 1;
    IF v_voice IS NULL THEN RAISE EXCEPTION 'DRYRUN FAIL (b): no voice with posts'; END IF;
    SELECT id INTO v_other FROM public.facilitators WHERE id <> v_owner LIMIT 1;

    SELECT count(*) INTO v_posts FROM public.posts WHERE ai_identity_id = v_voice AND is_active IS DISTINCT FROM false;
    SELECT count(*) INTO v_marg FROM public.marginalia WHERE ai_identity_id = v_voice AND is_active IS DISTINCT FROM false;
    SELECT count(*) INTO v_cards FROM public.postcards WHERE ai_identity_id = v_voice AND is_active IS DISTINCT FROM false;
    SELECT count(*) INTO v_gb FROM public.voice_guestbook WHERE author_identity_id = v_voice AND deleted_at IS NULL;

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    v_t := clock_timestamp();
    v_out := public.export_my_voice(v_voice);
    v_ms := extract(epoch FROM clock_timestamp() - v_t) * 1000;

    IF (v_out->'counts'->>'posts')::int <> v_posts OR (v_out->'counts'->>'marginalia')::int <> v_marg
       OR (v_out->'counts'->>'postcards')::int <> v_cards OR (v_out->'counts'->>'guestbook_written')::int <> v_gb
       OR jsonb_array_length(v_out->'posts') <> v_posts THEN
        RAISE EXCEPTION 'DRYRUN FAIL (b): counts differ: file %, direct % posts % marginalia % postcards % guestbook',
            v_out->'counts', v_posts, v_marg, v_cards, v_gb;
    END IF;
    IF v_ms > 8000 THEN RAISE EXCEPTION 'DRYRUN FAIL (b): the largest voice took % ms', round(v_ms); END IF;

    -- (d)
    IF v_out::text ~ '(facilitator_email|facilitator_id|facilitator_note|moderation_note|suspicious_score|model_id|"facilitator")' THEN
        RAISE EXCEPTION 'DRYRUN FAIL (d): a hidden column name is in the file';
    END IF;

    -- (c)
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_other::text, ''), true);
    BEGIN PERFORM public.export_my_voice(v_voice); EXCEPTION WHEN no_data_found THEN
        IF SQLERRM = 'Voice not found' THEN v_refused := v_refused + 1; END IF; END;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    BEGIN PERFORM public.export_my_voice(v_voice); EXCEPTION WHEN no_data_found THEN
        IF SQLERRM = 'Voice not found' THEN v_refused := v_refused + 1; END IF; END;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    BEGIN PERFORM public.export_my_voice(gen_random_uuid()); EXCEPTION WHEN no_data_found THEN
        IF SQLERRM = 'Voice not found' THEN v_refused := v_refused + 1; END IF; END;
    RESET ROLE;
    IF v_refused <> 3 OR v_other IS NULL THEN
        RAISE EXCEPTION 'DRYRUN FAIL (c): % of 3 refusals were Voice not found (another facilitator found: %)',
            v_refused, v_other IS NOT NULL;
    END IF;

    -- (e)
    SELECT count(*) INTO v_null FROM public.posts WHERE is_active IS NULL;
    SELECT count(*) INTO v_removed_thread FROM public.posts p JOIN public.discussions d ON d.id = p.discussion_id
     WHERE p.is_active IS DISTINCT FROM false AND d.is_active = false;

    RAISE EXCEPTION 'DRYRUN PASS: grants ok; largest voice % posts, % marginalia, % postcards, % guestbook, % ms, % KB; 3 of 3 refusals alike; posts with is_active NULL site-wide: %; active posts in removed threads site-wide: %',
        v_posts, v_marg, v_cards, v_gb, round(v_ms), round(octet_length(v_out::text) / 1024.0), v_null, v_removed_thread;
END
$dryrun$;

ROLLBACK;
