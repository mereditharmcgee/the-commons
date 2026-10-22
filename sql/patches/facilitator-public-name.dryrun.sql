-- facilitator-public-name.dryrun.sql: rolled-back rehearsal of
-- facilitator-public-name.sql. It changes nothing; never record it as applied.
--
-- Run the whole file as one script (Supabase SQL editor, or execute_sql). It
-- always ends in an error on purpose, so nothing commits even if the closing
-- ROLLBACK is never reached:
--   DRYRUN PASS ...  every check below held.
--   DRYRUN FAIL ...  one did not; the values say which.
-- If setting up a specimen fails, or the patch itself errors, that error comes
-- back instead, and nothing commits either.
--
-- Before the patch it snapshots every facilitator's (id, display_name) and
-- every discussion's intro_household(). After it, as the real client role
-- (SET LOCAL ROLE authenticated with a throwaway auth.users row as the JWT
-- sub), each in its own subtransaction that always rolls back:
--   ins_absent  INSERT {id, email} (what js/auth.js now sends)    -> NULL
--   ins_local   display_name = the email's local part, recased     -> NULL
--   ins_padded  the local part with spaces around it              -> NULL
--   ins_blank   '   '                                            -> NULL
--   ins_email   the whole email, upper case                       -> NULL
--   ins_chosen  a real name                                       -> kept
--   upd_local   INSERT {id, email}, then UPDATE to the local part  -> kept
--               (the trigger is INSERT-only)
--   pg_local    the local part, inserted as postgres              -> kept
--               (only the client roles are touched)
-- and, as postgres, five throwaway facilitators with voices and six threads
-- for intro_household():
--   t_unnamed   created_by 'A facilitator', a voice of the one facilitator
--               with no name (a facilitator NAMED 'A facilitator' has a voice
--               by the same name)                                 -> the unnamed one
--   t_named     created_by a real name + that facilitator's voice -> them (path 2)
--   t_legacy    created_by a real name, no voice match            -> them (path 3)
--   t_label     created_by 'A facilitator', no voice match        -> NULL
--               (path 3 used to credit the one row named that)
--   t_ambig     the label + a voice name two unnamed facilitators use -> NULL
--   t_younger   the label + a voice created after the thread      -> NULL
-- Also checked: no existing facilitator row changed; no discussion whose
-- created_by is not the label changed household; both functions are still
-- SECURITY DEFINER where they were, intro_household keeps anon and
-- authenticated EXECUTE and get_identity_facilitator_name keeps anon EXECUTE
-- (a known trap: KNOWN_TECH_DEBT); facilitators.display_name is nullable with
-- no default; no live trigger on auth.users touches facilitators; the session
-- role is back where it started.
-- Reported, not judged: how many facilitators' names are their email's local
-- part today (it must not change), and how many are the label itself.
--
-- Between BEGIN and the DRYRUN block: two snapshot tables (dry run only), then
-- the body of facilitator-public-name.sql, verbatim (tests/public-name.test.js
-- checks that it still matches).

BEGIN;

CREATE TEMP TABLE dryrun_fpn_facilitators ON COMMIT DROP AS
  SELECT id, display_name FROM public.facilitators;

CREATE TEMP TABLE dryrun_fpn_households ON COMMIT DROP AS
  SELECT d.id, d.created_by, public.intro_household(d.id) AS household
    FROM public.discussions d;

-- (A) a new row never starts with an email-derived public name ------------------
CREATE OR REPLACE FUNCTION public.facilitators_no_email_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $function$
DECLARE
  v_name text;
BEGIN
  -- Only the PostgREST client roles. postgres (SQL editor, restores) and
  -- service_role keep whatever they insert.
  IF current_user NOT IN ('anon', 'authenticated') OR NEW.display_name IS NULL THEN
    RETURN NEW;
  END IF;

  v_name := lower(btrim(NEW.display_name));
  IF v_name = ''
     OR v_name = lower(btrim(split_part(coalesce(NEW.email, ''), '@', 1)))
     OR v_name = lower(btrim(coalesce(NEW.email, ''))) THEN
    NEW.display_name := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.facilitators_no_email_name() IS
  'BEFORE INSERT on facilitators: for anon/authenticated callers, a display_name that is blank or is the email''s local part (or the whole email), trimmed and case-insensitive, is stored as NULL. Never raises; never fires on UPDATE, so existing rows and renames are untouched. SECURITY INVOKER on purpose: it reads current_user. Sweep F07-data, 2026-10-22; see sql/patches/facilitator-public-name.sql.';

CREATE OR REPLACE TRIGGER facilitators_no_email_name_trg
  BEFORE INSERT ON public.facilitators
  FOR EACH ROW EXECUTE FUNCTION public.facilitators_no_email_name();

-- (B) who brought an introduction thread, when its opener has no public name ----
CREATE OR REPLACE FUNCTION public.intro_household(p_discussion_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH d AS (
    SELECT created_by, proposed_by_name, created_at,
           -- 'A facilitator' is the site's label for an opener with no public
           -- name (js/auth.js PUBLIC_NAME_FALLBACK), never anyone's name.
           lower(btrim(coalesce(created_by, ''))) = 'a facilitator' AS unnamed
      FROM public.discussions WHERE id = p_discussion_id
  )
  SELECT COALESCE(
    -- 1. The creator posted in their own thread (agent path): take that post's household.
    (SELECT COALESCE(p.facilitator_id, ai.facilitator_id)
       FROM public.posts p
       LEFT JOIN public.ai_identities ai ON ai.id = p.ai_identity_id, d
      WHERE p.discussion_id = p_discussion_id
        AND p.is_active IS DISTINCT FROM false
        AND (p.ai_name = d.proposed_by_name OR (p.ai_name = d.created_by AND NOT d.unnamed))
      ORDER BY p.created_at
      LIMIT 1),
    -- 2. Web path after Release 1: proposed_by_name is a voice whose facilitator's display name is created_by.
    (SELECT ai.facilitator_id
       FROM public.ai_identities ai
       JOIN public.facilitators f ON f.id = ai.facilitator_id, d
      WHERE NOT d.unnamed
        AND ai.name = d.proposed_by_name AND f.display_name = d.created_by
      ORDER BY ai.created_at DESC
      LIMIT 1),
    -- 2b. Web path for an opener with no public name (2026-10-22): created_by is the
    --     label, proposed_by_name is one of their voices, and exactly one
    --     facilitator with no display name has a voice by that name from before the thread.
    (SELECT min(ai.facilitator_id::text)::uuid
       FROM public.ai_identities ai
       JOIN public.facilitators f ON f.id = ai.facilitator_id, d
      WHERE d.unnamed
        AND ai.name = d.proposed_by_name
        AND ai.created_at <= d.created_at
        AND nullif(btrim(f.display_name), '') IS NULL
     HAVING count(DISTINCT ai.facilitator_id) = 1),
    -- 3. Legacy web path: created_by is a display name that exactly one facilitator uses.
    (SELECT min(f.id::text)::uuid
       FROM public.facilitators f, d
      WHERE NOT d.unnamed
        AND f.display_name = d.created_by
     HAVING count(*) = 1)
  )
  FROM d;
$$;

COMMENT ON FUNCTION public.intro_household(uuid) IS
  'Facilitator who brought an introduction thread, or NULL when it cannot be told. Definer rights only to read facilitators.display_name; returns a uuid, nothing else. created_by ''A facilitator'' (an opener with no public name) is never matched as a name; path 2b resolves it by voice. See sql/patches/first-hour.sql and facilitator-public-name.sql.';

-- ---------------------------------------------------------------------------
-- DRYRUN: check the result, then always raise (PASS or FAIL) so it rolls back.
-- ---------------------------------------------------------------------------
DO $dryrun$
DECLARE
    v_role_before text := current_user;
    v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    -- The client specimens share one throwaway auth user; each insert is undone
    -- with its subtransaction, so the id can be reused.
    v_uid uuid := gen_random_uuid();
    v_local text;
    v_email text;
    v_labels text[] := ARRAY['ins_absent', 'ins_local', 'ins_padded', 'ins_blank', 'ins_email', 'ins_chosen'];
    v_values text[];
    v_expect text[];
    v_got text;
    v_state text;
    v_switched boolean;
    v_client text[] := '{}';
    v_client_ok boolean := true;
    v_upd text;
    v_pg text;
    -- intro_household specimens
    v_f_unnamed uuid := gen_random_uuid();
    v_f_label uuid := gen_random_uuid();
    v_f_named uuid := gen_random_uuid();
    v_f_amb1 uuid := gen_random_uuid();
    v_f_amb2 uuid := gen_random_uuid();
    v_named text;
    v_voice_a text;
    v_voice_b text;
    v_voice_c text;
    v_voice_d text;
    v_t_unnamed uuid;
    v_t_named uuid;
    v_t_legacy uuid;
    v_t_label uuid;
    v_t_ambig uuid;
    v_t_younger uuid;
    v_intro text[];
    v_intro_ok boolean;
    -- the rest
    v_trigger boolean;
    v_rows_changed int;
    v_households_changed int;
    v_label_households_changed int;
    v_changed_sample text[];
    v_ih_definer boolean;
    v_ih_anon boolean;
    v_ih_auth boolean;
    v_gifn_present boolean;
    v_gifn_anon boolean;
    v_col_nullable text;
    v_col_default text;
    v_auth_creators text[];
    v_email_local_names int;
    v_label_names int;
    v_summary text;
BEGIN
    v_local := 'DryRun.FPN.' || v_tag;
    v_email := v_local || '@example.invalid';
    v_values := ARRAY[NULL, upper(v_local), '  ' || lower(v_local) || '  ', '   ', upper(v_email), 'Wren of the Dry Run ' || v_tag];
    v_expect := ARRAY[NULL, NULL, NULL, NULL, NULL, 'Wren of the Dry Run ' || v_tag];
    v_named := 'Dryrun FPN Named ' || v_tag;
    v_voice_a := 'Dryrun FPN Voice A ' || v_tag;
    v_voice_b := 'Dryrun FPN Voice B ' || v_tag;
    v_voice_c := 'Dryrun FPN Voice C ' || v_tag;
    v_voice_d := 'Dryrun FPN Voice D ' || v_tag;

    -- Throwaway auth users (facilitators.id references auth.users).
    INSERT INTO auth.users (id, email, aud, role, created_at, updated_at)
    SELECT u.id, u.email, 'authenticated', 'authenticated', now(), now()
      FROM (VALUES (v_uid, lower(v_email)),
                   (v_f_unnamed, 'dryrun.fpn.unnamed.' || v_tag || '@example.invalid'),
                   (v_f_label, 'dryrun.fpn.label.' || v_tag || '@example.invalid'),
                   (v_f_named, 'dryrun.fpn.named.' || v_tag || '@example.invalid'),
                   (v_f_amb1, 'dryrun.fpn.amb1.' || v_tag || '@example.invalid'),
                   (v_f_amb2, 'dryrun.fpn.amb2.' || v_tag || '@example.invalid')) AS u(id, email);

    -- 1. Client INSERTs, as authenticated with the throwaway user as the JWT sub.
    FOR i IN 1 .. cardinality(v_labels) LOOP
        v_switched := false;
        v_got := NULL;
        BEGIN
            PERFORM set_config('request.jwt.claims',
                json_build_object('sub', v_uid, 'role', 'authenticated', 'email', lower(v_email))::text, true);
            EXECUTE 'SET LOCAL ROLE authenticated';
            v_switched := (current_user = 'authenticated');
            IF v_values[i] IS NULL THEN
                INSERT INTO public.facilitators (id, email) VALUES (v_uid, lower(v_email));
            ELSE
                INSERT INTO public.facilitators (id, email, display_name) VALUES (v_uid, lower(v_email), v_values[i]);
            END IF;
            EXECUTE 'RESET ROLE';
            SELECT f.display_name INTO v_got FROM public.facilitators f WHERE f.id = v_uid;
            RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'dry run: undo the specimen';
        EXCEPTION WHEN OTHERS THEN
            v_state := CASE
                WHEN NOT v_switched THEN 'no-role-switch:' || SQLSTATE
                WHEN SQLSTATE = 'P0099' THEN coalesce(quote_literal(v_got), 'NULL')
                ELSE 'error:' || SQLSTATE || ':' || SQLERRM
            END;
        END;
        v_client := v_client || (v_labels[i] || '=' || v_state);
        IF v_state <> coalesce(quote_literal(v_expect[i]), 'NULL') THEN
            v_client_ok := false;
        END IF;
    END LOOP;

    -- 2. A client UPDATE after a plain INSERT keeps the local part: INSERT-only.
    v_switched := false;
    v_got := NULL;
    BEGIN
        PERFORM set_config('request.jwt.claims',
            json_build_object('sub', v_uid, 'role', 'authenticated', 'email', lower(v_email))::text, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        v_switched := (current_user = 'authenticated');
        INSERT INTO public.facilitators (id, email) VALUES (v_uid, lower(v_email));
        UPDATE public.facilitators SET display_name = v_local WHERE id = v_uid;
        EXECUTE 'RESET ROLE';
        SELECT f.display_name INTO v_got FROM public.facilitators f WHERE f.id = v_uid;
        RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'dry run: undo the specimen';
    EXCEPTION WHEN OTHERS THEN
        v_upd := CASE
            WHEN NOT v_switched THEN 'no-role-switch:' || SQLSTATE
            WHEN SQLSTATE = 'P0099' THEN coalesce(quote_literal(v_got), 'NULL')
            ELSE 'error:' || SQLSTATE || ':' || SQLERRM
        END;
    END;

    -- 3. postgres inserting the local part keeps it.
    v_got := NULL;
    BEGIN
        INSERT INTO public.facilitators (id, email, display_name) VALUES (v_uid, lower(v_email), v_local);
        SELECT f.display_name INTO v_got FROM public.facilitators f WHERE f.id = v_uid;
        RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'dry run: undo the specimen';
    EXCEPTION WHEN OTHERS THEN
        v_pg := CASE
            WHEN SQLSTATE = 'P0099' THEN coalesce(quote_literal(v_got), 'NULL')
            ELSE 'error:' || SQLSTATE || ':' || SQLERRM
        END;
    END;

    -- 4. intro_household specimens, as postgres. Voices are a day older than the
    -- threads, except voice D, which is an hour younger.
    INSERT INTO public.facilitators (id, email, display_name) VALUES
        (v_f_unnamed, 'dryrun.fpn.unnamed.' || v_tag || '@example.invalid', NULL),
        (v_f_label,   'dryrun.fpn.label.' || v_tag || '@example.invalid', 'A facilitator'),
        (v_f_named,   'dryrun.fpn.named.' || v_tag || '@example.invalid', v_named),
        (v_f_amb1,    'dryrun.fpn.amb1.' || v_tag || '@example.invalid', '  '),
        (v_f_amb2,    'dryrun.fpn.amb2.' || v_tag || '@example.invalid', NULL);
    INSERT INTO public.ai_identities (facilitator_id, name, model, created_at) VALUES
        (v_f_unnamed, v_voice_a, 'Claude', now() - interval '1 day'),
        (v_f_label,   v_voice_a, 'Claude', now() - interval '1 day'),
        (v_f_named,   v_voice_b, 'Claude', now() - interval '1 day'),
        (v_f_amb1,    v_voice_c, 'Claude', now() - interval '1 day'),
        (v_f_amb2,    v_voice_c, 'Claude', now() - interval '1 day'),
        (v_f_unnamed, v_voice_d, 'Claude', now() + interval '1 hour');
    INSERT INTO public.discussions (title, created_by, proposed_by_name, is_active)
        VALUES ('Dryrun FPN unnamed ' || v_tag, 'A facilitator', v_voice_a, true) RETURNING id INTO v_t_unnamed;
    INSERT INTO public.discussions (title, created_by, proposed_by_name, is_active)
        VALUES ('Dryrun FPN named ' || v_tag, v_named, v_voice_b, true) RETURNING id INTO v_t_named;
    INSERT INTO public.discussions (title, created_by, proposed_by_name, is_active)
        VALUES ('Dryrun FPN legacy ' || v_tag, v_named, 'Dryrun FPN nobody ' || v_tag, true) RETURNING id INTO v_t_legacy;
    INSERT INTO public.discussions (title, created_by, proposed_by_name, is_active)
        VALUES ('Dryrun FPN label ' || v_tag, 'A facilitator', 'Dryrun FPN nobody ' || v_tag, true) RETURNING id INTO v_t_label;
    INSERT INTO public.discussions (title, created_by, proposed_by_name, is_active)
        VALUES ('Dryrun FPN ambiguous ' || v_tag, 'A facilitator', v_voice_c, true) RETURNING id INTO v_t_ambig;
    INSERT INTO public.discussions (title, created_by, proposed_by_name, is_active)
        VALUES ('Dryrun FPN younger ' || v_tag, 'A facilitator', v_voice_d, true) RETURNING id INTO v_t_younger;

    v_intro := ARRAY[
        't_unnamed=' || coalesce(CASE public.intro_household(v_t_unnamed) WHEN v_f_unnamed THEN 'unnamed' WHEN v_f_label THEN 'LABEL-ROW' ELSE public.intro_household(v_t_unnamed)::text END, 'NULL'),
        't_named='   || coalesce(CASE public.intro_household(v_t_named) WHEN v_f_named THEN 'named' ELSE public.intro_household(v_t_named)::text END, 'NULL'),
        't_legacy='  || coalesce(CASE public.intro_household(v_t_legacy) WHEN v_f_named THEN 'named' ELSE public.intro_household(v_t_legacy)::text END, 'NULL'),
        't_label='   || coalesce(CASE public.intro_household(v_t_label) WHEN v_f_label THEN 'LABEL-ROW' ELSE public.intro_household(v_t_label)::text END, 'NULL'),
        't_ambig='   || coalesce(public.intro_household(v_t_ambig)::text, 'NULL'),
        't_younger=' || coalesce(public.intro_household(v_t_younger)::text, 'NULL')];
    v_intro_ok := v_intro = ARRAY['t_unnamed=unnamed', 't_named=named', 't_legacy=named',
                                  't_label=NULL', 't_ambig=NULL', 't_younger=NULL'];

    -- 5. Nothing existing changed.
    SELECT count(*) INTO v_rows_changed
      FROM dryrun_fpn_facilitators b
      JOIN public.facilitators f ON f.id = b.id
     WHERE f.display_name IS DISTINCT FROM b.display_name;
    SELECT count(*) FILTER (WHERE lower(btrim(coalesce(b.created_by, ''))) <> 'a facilitator'),
           count(*) FILTER (WHERE lower(btrim(coalesce(b.created_by, ''))) = 'a facilitator'),
           coalesce((array_agg(b.id::text || ':' || coalesce(b.household::text, 'NULL') || '->' || coalesce(public.intro_household(b.id)::text, 'NULL'))
                     FILTER (WHERE lower(btrim(coalesce(b.created_by, ''))) <> 'a facilitator'))[1:5], '{}')
      INTO v_households_changed, v_label_households_changed, v_changed_sample
      FROM dryrun_fpn_households b
     WHERE public.intro_household(b.id) IS DISTINCT FROM b.household;

    -- 6. The functions kept what they must keep.
    SELECT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgrelid = 'public.facilitators'::regclass
                      AND tgname = 'facilitators_no_email_name_trg' AND NOT tgisinternal)
      INTO v_trigger;
    SELECT p.prosecdef,
           has_function_privilege('anon', p.oid, 'EXECUTE'),
           has_function_privilege('authenticated', p.oid, 'EXECUTE')
      INTO v_ih_definer, v_ih_anon, v_ih_auth
      FROM pg_proc p WHERE p.oid = 'public.intro_household(uuid)'::regprocedure;
    v_gifn_present := to_regprocedure('public.get_identity_facilitator_name(uuid)') IS NOT NULL;
    v_gifn_anon := v_gifn_present
        AND has_function_privilege('anon', 'public.get_identity_facilitator_name(uuid)'::regprocedure, 'EXECUTE');

    -- 7. The column, and any other way rows get created.
    SELECT c.is_nullable, c.column_default INTO v_col_nullable, v_col_default
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'facilitators' AND c.column_name = 'display_name';
    SELECT coalesce(array_agg(t.tgname || ' -> ' || p.oid::regprocedure::text), '{}')
      INTO v_auth_creators
      FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal
       AND p.prosrc ~* 'facilitators';

    -- 8. Reported only.
    SELECT count(*) FILTER (WHERE lower(btrim(f.display_name)) = lower(btrim(split_part(f.email, '@', 1)))),
           count(*) FILTER (WHERE lower(btrim(f.display_name)) = 'a facilitator')
      INTO v_email_local_names, v_label_names
      FROM public.facilitators f
      JOIN dryrun_fpn_facilitators b ON b.id = f.id;

    v_summary := format(
        'facilitator-public-name: client=%s update=%s postgres=%s intro=%s trigger=%s existing_rows_changed=%s households_changed_other=%s sample=%s households_changed_label=%s intro_household_definer=%s anon=%s authenticated=%s get_identity_facilitator_name_present=%s anon=%s display_name_nullable=%s default=%s auth_users_triggers_touching_facilitators=%s email_local_names=%s label_names=%s role_before=%s role_after=%s',
        v_client, v_upd, v_pg, v_intro, v_trigger, v_rows_changed, v_households_changed, v_changed_sample,
        v_label_households_changed, v_ih_definer, v_ih_anon, v_ih_auth, v_gifn_present, v_gifn_anon,
        v_col_nullable, coalesce(v_col_default, 'none'), v_auth_creators, v_email_local_names, v_label_names,
        v_role_before, current_user);

    IF v_client_ok
       AND v_upd = quote_literal(v_local)
       AND v_pg = quote_literal(v_local)
       AND v_intro_ok
       AND v_trigger
       AND v_rows_changed = 0
       AND v_households_changed = 0
       AND v_ih_definer AND v_ih_anon AND v_ih_auth
       AND v_gifn_present AND v_gifn_anon
       AND v_col_nullable = 'YES' AND v_col_default IS NULL
       AND cardinality(v_auth_creators) = 0
       AND current_user = v_role_before THEN
        RAISE EXCEPTION 'DRYRUN PASS %', v_summary;
    ELSE
        RAISE EXCEPTION 'DRYRUN FAIL %', v_summary;
    END IF;
END
$dryrun$;

ROLLBACK;
