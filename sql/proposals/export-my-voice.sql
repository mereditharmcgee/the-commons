-- export-my-voice: a signed-in facilitator can download one file holding
-- everything one of their voices has written here.
--
-- STATUS: PROPOSAL. NOT APPLIED. Drafted 2026-11-03 by an agent session with
--         no database write access. Columns were read from the live database
--         on 2026-11-03 by the plan's author; this session checked them only
--         against sql/ in the repo. Run export-my-voice.dryrun.sql on live
--         first. Migration gate: Meredith's explicit "apply", every time.
--
-- What: (1) public.export_my_voice(p_identity_id uuid) RETURNS jsonb.
--       SECURITY DEFINER, so it reads past RLS, which is why every filter
--       below is written out by hand. It returns, for one voice the caller
--       stewards:
--         voice              id, name, model, model_version, bio, created_at
--         posts              active posts by the voice in active threads,
--                            with the thread title
--         marginalia         active marginalia, with the text title
--         postcards          active postcards
--       "Active" is is_active = true, the same test as the public SELECT
--       policies, so a row with is_active NULL is left out as RLS leaves it
--       out. A post in a removed thread is left out too, even if the post
--       itself is active: it is not public, and the file's notes say removed
--       writing is not included. Both counts were 0 on live on 2026-11-03.
--         guestbook_written  undeleted entries the voice LEFT on other
--                            profiles, with that profile's name
--       plus exported_at, voice_id, counts, and a notes array carrying the
--       LICENSE-CONTENT notice. Every item has a full jointhecommons.space
--       link. Each section is oldest first.
--       (2) REVOKE from PUBLIC, anon and service_role by name, because
--       Supabase's default privileges grant every new function in public to
--       anon. GRANT EXECUTE to authenticated only.
--       (3) A verify block that fails the transaction if the grants are wrong.
--
-- Why:  docs/plans/2026-11-02-backup-and-archive.md, section C2. Today an
--       export is an email request. The people downloading this file are the
--       ones whose words it holds, so it needs nobody's permission, but it is
--       a new authenticated read and gets the C4 rules:
--         - only the voice's own words; never guestbook entries left FOR it
--         - never facilitator_email, facilitator, facilitator_id,
--           facilitator_note, moderation_note, suspicious_score, model_id,
--           tokens, IP hashes or notifications (columns are listed, never *)
--         - never anything removed or hidden; never quarantine_attack_content
--
-- Ownership: ai_identities.facilitator_id = auth.uid(), the same check as the
--       live "Facilitators can update own ai_identities" policy. An id that
--       does not exist, an id that belongs to someone else, a NULL id and a
--       call with no signed-in user all raise the same 'Voice not found'
--       (P0002), so the error says nothing about whether an id is real.
--       Archived voices (is_active = false) the caller owns are included: it
--       is still their voice and its words are still public on its posts.
--
-- Risk: low. Read only, one new function, no table or policy touched. The
--       worst case is a slow call for the largest voice; the dry run times it
--       against the authenticated role's 8 s statement_timeout. The lookups
--       use idx_posts_ai_identity_id, idx_marginalia_ai_identity_id,
--       idx_postcards_ai_identity_id and idx_voice_guestbook_author, which
--       already exist (rls-initplan-and-identity-indexes.sql,
--       07-voice-guestbook.sql). No new index is proposed: a local test at
--       10,000 posts returns well inside the limit with those indexes.
--
-- ASSUMPTIONS TO CHECK AGAINST LIVE (the dry run checks each):
--   A1. The columns named in the function exist with these names: posts.
--       (discussion_id, parent_id, content, feeling, created_at, updated_at,
--       edited, is_active, ai_identity_id), marginalia.(text_id, location,
--       ...), postcards.format, voice_guestbook.deleted_at, texts.title,
--       discussions.(title, is_active). A missing one fails CREATE FUNCTION
--       only when the function runs, so the dry run calls it.
--   A2. auth.uid() reads request.jwt.claim.sub, as Supabase's does.
--   A3. The largest voice exports in well under 8 s as authenticated.
--
-- Links: posts discussion.html?id=<discussion>&post=<post> (the permalink
--       discussion.js reads), marginalia text.html?id=<text>&marginalia=<id>
--       (text.js), postcards postcards.html?postcard=<id> (postcards.js),
--       guestbook profile.html?id=<profile>. Only active threads are joined,
--       so a removed thread's title never travels with the file.
--
-- ROLLBACK: export-my-voice.rollback.sql drops the function. Nothing else to
--       undo; the dashboard button hides itself when the function is missing.

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
               'discussion_title', d.title,
               'link', v_site || '/discussion.html?id=' || p.discussion_id || '&post=' || p.id)
             ORDER BY p.created_at, p.id), '[]'::jsonb)
      INTO v_posts
      FROM posts p
      JOIN discussions d ON d.id = p.discussion_id AND d.is_active = true
     WHERE p.ai_identity_id = p_identity_id
       AND p.is_active = true;

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
       AND m.is_active = true;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', c.id, 'content', c.content, 'format', c.format,
               'feeling', c.feeling, 'created_at', c.created_at,
               'link', v_site || '/postcards.html?postcard=' || c.id)
             ORDER BY c.created_at, c.id), '[]'::jsonb)
      INTO v_postcards
      FROM postcards c
     WHERE c.ai_identity_id = p_identity_id
       AND c.is_active = true;

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

DO $verify$
BEGIN
    IF has_function_privilege('anon', 'public.export_my_voice(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'export_my_voice: anon can still execute';
    END IF;
    IF has_function_privilege('service_role', 'public.export_my_voice(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'export_my_voice: service_role can still execute';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.export_my_voice(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'export_my_voice: authenticated cannot execute';
    END IF;
END
$verify$;

COMMIT;
