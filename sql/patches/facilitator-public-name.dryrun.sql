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
-- and, as postgres, six throwaway facilitators with voices and eight threads
-- for intro_household():
--   t_unnamed    created_by 'A facilitator' + a voice only the facilitator
--                with no name has                                  -> them (path 2b)
--   t_renamed    created_by 'A facilitator' + a voice only one facilitator
--                has, who has a real name now: unnamed when the thread was
--                opened, renamed afterwards from the dashboard nudge
--                                                                  -> them (path 2b)
--   t_named      created_by a real name + that facilitator's voice  -> them (path 2)
--   t_legacy     created_by a real name, no voice match             -> them (path 3)
--   t_label      created_by 'A facilitator', no voice match         -> NULL
--                (path 3 used to credit the one row named that)
--   t_labelvoice the label + a voice shared by the unnamed facilitator and
--                one NAMED 'A facilitator'                          -> NULL
--                (path 2 never reads the label as a name; 2b sees two)
--   t_ambig      the label + a voice a named and an unnamed facilitator
--                both have: either could have opened it             -> NULL
--   t_younger    the label + a voice created after the thread       -> NULL
-- Also checked: no existing facilitator row changed; no discussion whose
-- created_by is not the label changed household; both functions are still
-- SECURITY DEFINER where they were, intro_household keeps anon and
-- authenticated EXECUTE and get_identity_facilitator_name keeps anon EXECUTE
-- (a known trap: KNOWN_TECH_DEBT); facilitators.display_name is nullable with
-- no default; the session role is back where it started. And, read-only from
-- the live catalog, the other ways a new account could still get, or show, an
-- email-derived name (the repo shows only part of the live schema):
--   - no live trigger on auth.users touches facilitators;
--   - no live function (outside pg_catalog/information_schema) INSERTs or
--     MERGEs into facilitators. (A) skips every role but anon and
--     authenticated, so a postgres-owned SECURITY DEFINER function that seeds
--     the name from the email would get past the site fix and (A) both. None
--     is in the repo, so any hit FAILs; read the listed function before
--     applying;
--   - no live function or view (pg_views, pg_matviews) that reads
--     facilitators also cuts up an email (split_part, substring, substr,
--     left, regexp_*, strpos or position over something named *email*). That
--     is how a local part could reach a public RPC or view for an account
--     whose display_name is NULL. (A) itself is excluded; any other hit
--     FAILs and is listed by name.
-- Function bodies are read with pg_get_functiondef, which also covers
-- BEGIN ATOMIC bodies (their prosrc is empty). Dynamic SQL built from strings
-- (EXECUTE format(...)) can hide a table name from both searches.
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
    --     facilitator has a voice by that name from before the thread. Their
    --     display_name today is not consulted: they may have picked a name since.
    (SELECT min(ai.facilitator_id::text)::uuid
       FROM public.ai_identities ai, d
      WHERE d.unnamed
        AND ai.name = d.proposed_by_name
        AND ai.created_at <= d.created_at
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
    v_f_renamed uuid := gen_random_uuid();
    v_f_label uuid := gen_random_uuid();
    v_f_named uuid := gen_random_uuid();
    v_f_amb1 uuid := gen_random_uuid();
    v_f_amb2 uuid := gen_random_uuid();
    v_named text;
    v_renamed text;
    v_amb_named text;
    v_nobody text;
    v_voice_a text;
    v_voice_b text;
    v_voice_c text;
    v_voice_d text;
    v_voice_e text;
    v_voice_f text;
    r record;
    v_thread uuid;
    v_h uuid;
    v_intro text[] := '{}';
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
    v_fac_inserters text[];
    v_email_splitters text[];
    v_email_local_names int;
    v_label_names int;
    v_summary text;
BEGIN
    v_local := 'DryRun.FPN.' || v_tag;
    v_email := v_local || '@example.invalid';
    v_values := ARRAY[NULL, upper(v_local), '  ' || lower(v_local) || '  ', '   ', upper(v_email), 'Wren of the Dry Run ' || v_tag];
    v_expect := ARRAY[NULL, NULL, NULL, NULL, NULL, 'Wren of the Dry Run ' || v_tag];
    v_named := 'Dryrun FPN Named ' || v_tag;
    v_renamed := 'Dryrun FPN Renamed ' || v_tag;
    v_amb_named := 'Dryrun FPN Amb Named ' || v_tag;
    v_nobody := 'Dryrun FPN nobody ' || v_tag;
    v_voice_a := 'Dryrun FPN Voice A ' || v_tag;
    v_voice_b := 'Dryrun FPN Voice B ' || v_tag;
    v_voice_c := 'Dryrun FPN Voice C ' || v_tag;
    v_voice_d := 'Dryrun FPN Voice D ' || v_tag;
    v_voice_e := 'Dryrun FPN Voice E ' || v_tag;
    v_voice_f := 'Dryrun FPN Voice F ' || v_tag;

    -- Throwaway auth users (facilitators.id references auth.users).
    INSERT INTO auth.users (id, email, aud, role, created_at, updated_at)
    SELECT u.id, u.email, 'authenticated', 'authenticated', now(), now()
      FROM (VALUES (v_uid, lower(v_email)),
                   (v_f_unnamed, 'dryrun.fpn.unnamed.' || v_tag || '@example.invalid'),
                   (v_f_renamed, 'dryrun.fpn.renamed.' || v_tag || '@example.invalid'),
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
    -- threads, except voice D, which is an hour younger. v_f_renamed stands in
    -- for an opener who had no name when the thread was opened and picked one
    -- afterwards (the dashboard's "unset" nudge): the row already carries it.
    -- v_f_amb1 has a real name and shares voice C with the unnamed v_f_amb2;
    -- either could have been the unnamed opener, so neither may be credited.
    INSERT INTO public.facilitators (id, email, display_name) VALUES
        (v_f_unnamed, 'dryrun.fpn.unnamed.' || v_tag || '@example.invalid', NULL),
        (v_f_renamed, 'dryrun.fpn.renamed.' || v_tag || '@example.invalid', v_renamed),
        (v_f_label,   'dryrun.fpn.label.' || v_tag || '@example.invalid', 'A facilitator'),
        (v_f_named,   'dryrun.fpn.named.' || v_tag || '@example.invalid', v_named),
        (v_f_amb1,    'dryrun.fpn.amb1.' || v_tag || '@example.invalid', v_amb_named),
        (v_f_amb2,    'dryrun.fpn.amb2.' || v_tag || '@example.invalid', NULL);
    INSERT INTO public.ai_identities (facilitator_id, name, model, created_at) VALUES
        (v_f_unnamed, v_voice_a, 'Claude', now() - interval '1 day'),
        (v_f_named,   v_voice_b, 'Claude', now() - interval '1 day'),
        (v_f_amb1,    v_voice_c, 'Claude', now() - interval '1 day'),
        (v_f_amb2,    v_voice_c, 'Claude', now() - interval '1 day'),
        (v_f_unnamed, v_voice_d, 'Claude', now() + interval '1 hour'),
        (v_f_unnamed, v_voice_e, 'Claude', now() - interval '1 day'),
        (v_f_label,   v_voice_e, 'Claude', now() - interval '1 day'),
        (v_f_renamed, v_voice_f, 'Claude', now() - interval '1 day');
    FOR r IN
        SELECT s.label, s.created_by, s.proposed
          FROM (VALUES
                (1, 't_unnamed',    'A facilitator', v_voice_a),
                (2, 't_renamed',    'A facilitator', v_voice_f),
                (3, 't_named',      v_named,         v_voice_b),
                (4, 't_legacy',     v_named,         v_nobody),
                (5, 't_label',      'A facilitator', v_nobody),
                (6, 't_labelvoice', 'A facilitator', v_voice_e),
                (7, 't_ambig',      'A facilitator', v_voice_c),
                (8, 't_younger',    'A facilitator', v_voice_d)) AS s(ord, label, created_by, proposed)
         ORDER BY s.ord
    LOOP
        INSERT INTO public.discussions (title, created_by, proposed_by_name, is_active)
            VALUES ('Dryrun FPN ' || r.label || ' ' || v_tag, r.created_by, r.proposed, true)
            RETURNING id INTO v_thread;
        v_h := public.intro_household(v_thread);
        v_intro := v_intro || (r.label || '=' || coalesce(CASE v_h
                WHEN v_f_unnamed THEN 'unnamed'
                WHEN v_f_renamed THEN 'renamed'
                WHEN v_f_label   THEN 'LABEL-ROW'
                WHEN v_f_named   THEN 'named'
                WHEN v_f_amb1    THEN 'amb1-named'
                WHEN v_f_amb2    THEN 'amb2-unnamed'
                ELSE v_h::text END, 'NULL'));
    END LOOP;
    v_intro_ok := v_intro = ARRAY['t_unnamed=unnamed', 't_renamed=renamed', 't_named=named', 't_legacy=named',
                                  't_label=NULL', 't_labelvoice=NULL', 't_ambig=NULL', 't_younger=NULL'];

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

    -- 7. The column, and any other way a row gets created or a local part gets
    --    out. Read-only catalog queries: nothing here calls what they list.
    SELECT c.is_nullable, c.column_default INTO v_col_nullable, v_col_default
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'facilitators' AND c.column_name = 'display_name';
    SELECT coalesce(array_agg(t.tgname || ' -> ' || p.oid::regprocedure::text), '{}')
      INTO v_auth_creators
      FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal
       AND p.prosrc ~* 'facilitators';
    -- 7a. Every live function that writes facilitators rows, whoever owns it.
    --     The CASE keeps pg_get_functiondef off aggregates and window
    --     functions, which it refuses.
    SELECT coalesce(array_agg(x.what ORDER BY x.what), '{}')
      INTO v_fac_inserters
      FROM (SELECT p.oid::regprocedure::text AS what,
                   CASE WHEN p.prokind IN ('f', 'p') AND l.lanname NOT IN ('c', 'internal')
                        THEN pg_get_functiondef(p.oid) END AS def
              FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              JOIN pg_language l ON l.oid = p.prolang
             WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
               AND n.nspname !~ '^pg_(temp|toast)') x
     WHERE x.def ~* '\m(insert|merge)\s+into\s+("?public"?\s*\.\s*)?"?facilitators\M';
    -- 7b. Every live function or view that reads facilitators and cuts up an
    --     email. (A) compares the local part on purpose and is left out.
    SELECT coalesce(array_agg(x.what ORDER BY x.what), '{}')
      INTO v_email_splitters
      FROM (SELECT 'function ' || p.oid::regprocedure::text AS what,
                   CASE WHEN p.prokind IN ('f', 'p') AND l.lanname NOT IN ('c', 'internal')
                        THEN pg_get_functiondef(p.oid) END AS def
              FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              JOIN pg_language l ON l.oid = p.prolang
             WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
               AND n.nspname !~ '^pg_(temp|toast)'
               AND p.oid <> 'public.facilitators_no_email_name()'::regprocedure
            UNION ALL
            SELECT 'view ' || quote_ident(v.schemaname) || '.' || quote_ident(v.viewname), v.definition
              FROM pg_views v
             WHERE v.schemaname NOT IN ('pg_catalog', 'information_schema')
            UNION ALL
            SELECT 'matview ' || quote_ident(m.schemaname) || '.' || quote_ident(m.matviewname), m.definition
              FROM pg_matviews m
             WHERE m.schemaname NOT IN ('pg_catalog', 'information_schema')) x
     WHERE x.def ~* '\mfacilitators\M'
       AND x.def ~* '\m(split_part|substring|substr|left|regexp_replace|regexp_substr|regexp_match|regexp_matches|strpos|position)\s*\([^)]*email';

    -- 8. Reported only.
    SELECT count(*) FILTER (WHERE lower(btrim(f.display_name)) = lower(btrim(split_part(f.email, '@', 1)))),
           count(*) FILTER (WHERE lower(btrim(f.display_name)) = 'a facilitator')
      INTO v_email_local_names, v_label_names
      FROM public.facilitators f
      JOIN dryrun_fpn_facilitators b ON b.id = f.id;

    v_summary := format(
        'facilitator-public-name: client=%s update=%s postgres=%s intro=%s trigger=%s existing_rows_changed=%s households_changed_other=%s sample=%s households_changed_label=%s intro_household_definer=%s anon=%s authenticated=%s get_identity_facilitator_name_present=%s anon=%s display_name_nullable=%s default=%s auth_users_triggers_touching_facilitators=%s functions_inserting_facilitators=%s email_splitters_reading_facilitators=%s email_local_names=%s label_names=%s role_before=%s role_after=%s',
        v_client, v_upd, v_pg, v_intro, v_trigger, v_rows_changed, v_households_changed, v_changed_sample,
        v_label_households_changed, v_ih_definer, v_ih_anon, v_ih_auth, v_gifn_present, v_gifn_anon,
        v_col_nullable, coalesce(v_col_default, 'none'), v_auth_creators, v_fac_inserters, v_email_splitters,
        v_email_local_names, v_label_names, v_role_before, current_user);

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
       AND cardinality(v_fac_inserters) = 0
       AND cardinality(v_email_splitters) = 0
       AND current_user = v_role_before THEN
        RAISE EXCEPTION 'DRYRUN PASS %', v_summary;
    ELSE
        RAISE EXCEPTION 'DRYRUN FAIL %', v_summary;
    END IF;
END
$dryrun$;

ROLLBACK;
