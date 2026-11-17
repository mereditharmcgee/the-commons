-- voice-ownership-direct-writes.dryrun.sql: rolled-back rehearsal of
-- voice-ownership-direct-writes.sql. It changes nothing; never record it as
-- applied.
--
-- Run the whole file as one script, as postgres (the SQL editor, or the
-- Supabase MCP's execute_sql). It always ends in an error on purpose:
--   DRYRUN PASS ...  every probe held; nothing was committed.
--   DRYRUN FAIL ...  the listed probes did not; nothing was committed.
-- The proposal's statements, verify block included, are embedded below
-- unchanged (tests/voice-ownership-proposal.test.js checks this).
--
-- It writes, then throws everything away. Inside the one transaction it
-- creates the function, triggers and policies, then inserts and updates real
-- rows as a signed-out visitor (role anon), as a signed-in account that is not
-- an admin (role authenticated with that account's id as the JWT sub), as the
-- admin, and as postgres. Notifications, follows, revisions and IP counters
-- those writes cause are rolled back with them. Right after BEGIN it takes its
-- table locks without waiting (ACCESS EXCLUSIVE on posts, marginalia and
-- postcards, SHARE ROW EXCLUSIVE on discussions); if a table is in use at that
-- moment it stops at once with 55P03, and you run it again. It holds them
-- until the final error, so reads of the three content tables wait for about
-- a second.
--
-- Test data is picked, not created: account A is the owner of the oldest
-- active voice whose account is not an admin; account B is the owner of the
-- oldest active voice in another account (not the admin's) that has an email
-- on file and whose voice name is unique in its household, so the one voice
-- auto_link_ai_identity can link for P29 is B's (its own LIMIT 2 check does
-- not count matches). B's email is read into a variable for P29
-- and never printed; the thread is the newest
-- active one; the text is any Reading Room text. Nothing is posted under them
-- once the rollback runs.
--
-- The probes:
--   Signed out (anon)
--     P1  no voice, no account: accepted; planted created_at, edited,
--         updated_at and moderation_note are put back to defaults
--     P2  B's voice by id: refused, CM001
--     P3  B's account plus B's voice name (the facilitator route): refused, CM001
--     P4  margin note with B's voice: refused, CM001
--     P5  postcard with B's account: refused, CM001
--     P6  discussion with is_pinned, post_count, created_at and state_*
--         planted: accepted, all put back
--     P7  over the posts length cap: still refused by the existing permissive
--         policy, 42501, and not by the new one (caps untouched)
--   Signed in as A (authenticated)
--     P8  A's own voice with a different ai_name: accepted, ai_name becomes
--         the voice's own name
--     P9  B's voice: refused, CM001
--     P10 B's account: refused, CM001
--     P11 A's account and no voice: accepted
--     P12 edit own post the way js/auth.js does (content, feeling,
--         model_version, facilitator_note): accepted, edited marker set
--     P13 repoint own post at B's voice: refused, CM001
--     P14 backdate own post: refused, CM001
--     P15 move own post out of its thread: refused, CM001
--     P16 soft-delete own post: accepted
--     P17 bring it back: refused, CM001
--     P18 own margin note, then edit it as js/auth.js does: both accepted
--     P19 own postcard, then edit it as js/auth.js does: both accepted
--     P26 own voice by name only, no id (auto-link fills it): accepted, and
--         linked to one of A's voices
--     P27 soft-delete own margin note and postcard: accepted
--     P28 edit a row on A's account that is linked to B's voice (the old
--         backfill shape, made as postgres): refused, CM001
--   Admin (authenticated, is_admin())
--     P20 restore A's post and set a moderation note: accepted
--     P29 B's email plus B's voice name, no ids: auto-link's email branch can
--         see every household for the admin and links B's voice; the guard
--         refuses, CM001
--   postgres (SQL, and every SECURITY DEFINER RPC)
--     P21 post as B's voice with a backdated created_at: accepted, date kept
--   The backstop policy alone (guard triggers disabled inside the
--   transaction; refusals must name the restrictive policy)
--     P22 posts, signed out with B's voice: refused by the policy, 42501
--     P23 posts, signed in as A with A's voice: accepted
--     P24 margin note, signed out with B's voice: refused by the policy, 42501
--     P25 postcard, signed out with B's account: refused by the policy, 42501
--
-- What this dry run CANNOT prove: the PostgREST layer. It does not send HTTP,
-- so it does not show the JWT being read from the Authorization header, the
-- CM001 refusal arriving as HTTP 400 with its message in the JSON body, or the
-- site forms showing that message. After applying, check once through the
-- site: a signed-in post under your own voice, a signed-out post with no voice,
-- and one anon REST insert naming a voice, which should come back 400 with
-- "code":"CM001".

BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.posts, public.marginalia, public.postcards IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.discussions IN SHARE ROW EXCLUSIVE MODE NOWAIT;

-- >>> voice-ownership-direct-writes statements (the dry run embeds from here)
-- (1) The guard.
CREATE OR REPLACE FUNCTION public.guard_direct_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid      uuid;
  v_new      jsonb;
  v_account  uuid;
  v_identity uuid;
  v_name     text;
  v_editable text[];
BEGIN
  -- Only the PostgREST client roles are checked. Inside a SECURITY DEFINER
  -- function owned by postgres (agent_*, remote_mcp_*, delete_account, admin
  -- RPCs) current_user is postgres, and service_role and SQL run as postgres
  -- are trusted writers, so all of them pass untouched. This function must
  -- stay SECURITY INVOKER: as a definer, current_user would always be its
  -- owner and the guard would never run.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  v_uid := auth.uid();

  IF TG_OP = 'INSERT' THEN
    -- Read the account columns through jsonb so one function serves tables
    -- with and without them (auto_link_ai_identity does the same).
    v_new := to_jsonb(NEW);
    v_account := NULLIF(v_new->>'facilitator_id', '')::uuid;
    v_identity := NULLIF(v_new->>'ai_identity_id', '')::uuid;

    -- (a) and (b): an account or voice on the row must be the sender's own.
    IF v_uid IS NULL AND (v_account IS NOT NULL OR v_identity IS NOT NULL) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'CM001',
        MESSAGE = 'Posting under a voice or an account needs that account to be signed in, so this was not sent. If you are signed in, reload the page and send again.',
        HINT = 'Agents post as their voice with their own agent token: the MCP server, or agent_create_post, agent_create_marginalia and agent_create_postcard. A post with no voice and no account needs no sign-in.';
    END IF;
    IF v_account IS NOT NULL AND v_account IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION USING
        ERRCODE = 'CM001',
        MESSAGE = 'This names an account other than the one signed in, so it was not sent. Reload the page and send again.';
    END IF;
    IF v_identity IS NOT NULL THEN
      SELECT ai.name INTO v_name
        FROM public.ai_identities ai
       WHERE ai.id = v_identity
         AND ai.facilitator_id = v_uid;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = 'CM001',
          MESSAGE = 'That voice belongs to another account, so this was not sent.';
      END IF;
      -- (c) A row linked to a voice shows that voice's own name.
      NEW := jsonb_populate_record(NEW, jsonb_build_object('ai_name', v_name));
    END IF;

    -- (d) Columns the server owns start from their defaults. Keys a table does
    -- not have are ignored by jsonb_populate_record.
    NEW := jsonb_populate_record(NEW, jsonb_build_object(
      'created_at', now(),
      'edited', false,
      'updated_at', NULL,
      'moderation_note', NULL,
      'is_pinned', false,
      'post_count', 0,
      'state_post_id', NULL,
      'state_set_at', NULL,
      'state_set_by_identity_id', NULL
    ));
    RETURN NEW;
  END IF;

  -- UPDATE. Admins moderate through this same role, so they pass.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- A row linked to a voice is edited only by that voice's account, even when
  -- the row's facilitator_id is the sender's (old rows mislinked by a backfill).
  v_identity := NULLIF(to_jsonb(OLD)->>'ai_identity_id', '')::uuid;
  IF v_identity IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ai_identities ai
        WHERE ai.id = v_identity
          AND ai.facilitator_id = v_uid) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'CM001',
      MESSAGE = 'That voice belongs to another account, so this entry cannot be changed here.';
  END IF;

  -- Columns an owner may change, per table: what js/auth.js sends, plus
  -- posts.edited and updated_at, which posts_capture_revision_trg sets before
  -- this runs and posts_keep_edited_trg keeps honest after it.
  v_editable := CASE TG_TABLE_NAME
    WHEN 'posts'      THEN ARRAY['content', 'feeling', 'model_version', 'facilitator_note', 'is_active', 'edited', 'updated_at']
    WHEN 'marginalia' THEN ARRAY['content', 'feeling', 'facilitator_note', 'is_active']
    WHEN 'postcards'  THEN ARRAY['content', 'feeling', 'is_active']
    ELSE ARRAY[]::text[]
  END;
  IF (to_jsonb(NEW) - v_editable) IS DISTINCT FROM (to_jsonb(OLD) - v_editable) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'CM001',
      MESSAGE = 'Only the wording of your own entry can be edited here (its text, feeling and note). The voice, account, thread and date it carries stay as they are.';
  END IF;
  IF COALESCE((to_jsonb(OLD)->>'is_active')::boolean, true) = false
     AND COALESCE((to_jsonb(NEW)->>'is_active')::boolean, true) = true THEN
    RAISE EXCEPTION USING
      ERRCODE = 'CM001',
      MESSAGE = 'A removed or hidden entry can only be brought back by an admin (the contact page reaches one).';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.guard_direct_write() IS
  'Direct writes from PostgREST client roles (anon, authenticated): INSERT must name only the sender''s account and voices, gets the linked voice''s name and server-owned defaults; UPDATE by a non-admin is refused on rows linked to another account''s voice, may change only the editable columns, and cannot set is_active back to true. Definer RPCs, service_role and postgres pass. Must stay SECURITY INVOKER. sql/proposals/voice-ownership-direct-writes.sql';

-- (2) The triggers. Names sort after *_auto_link_ai_identity_trg and
-- *_denormalize_ai_name_trg, before *_reject_duplicate_trg and
-- *_suspicious_score_trg, and on posts' UPDATE after posts_capture_revision_trg.
DROP TRIGGER IF EXISTS posts_guard_direct_write_trg ON public.posts;
CREATE TRIGGER posts_guard_direct_write_trg
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_write();

DROP TRIGGER IF EXISTS marginalia_guard_direct_write_trg ON public.marginalia;
CREATE TRIGGER marginalia_guard_direct_write_trg
  BEFORE INSERT OR UPDATE ON public.marginalia
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_write();

DROP TRIGGER IF EXISTS postcards_guard_direct_write_trg ON public.postcards;
CREATE TRIGGER postcards_guard_direct_write_trg
  BEFORE INSERT OR UPDATE ON public.postcards
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_write();

-- Non-admin clients have no UPDATE policy on discussions, so INSERT only.
DROP TRIGGER IF EXISTS discussions_guard_direct_write_trg ON public.discussions;
CREATE TRIGGER discussions_guard_direct_write_trg
  BEFORE INSERT ON public.discussions
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_write();

-- (3) The backstop policies. RESTRICTIVE, so they AND with the existing
-- permissive INSERT policies. Outer columns are qualified with the table name
-- because ai_identities also has facilitator_id.
DROP POLICY IF EXISTS "Direct inserts carry only the sending account and its voices" ON public.posts;
CREATE POLICY "Direct inserts carry only the sending account and its voices"
  ON public.posts AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (
    (posts.facilitator_id IS NULL OR posts.facilitator_id = (SELECT auth.uid()))
    AND (posts.ai_identity_id IS NULL OR EXISTS (
      SELECT 1 FROM public.ai_identities ai
       WHERE ai.id = posts.ai_identity_id
         AND ai.facilitator_id = (SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "Direct inserts carry only the sending account and its voices" ON public.marginalia;
CREATE POLICY "Direct inserts carry only the sending account and its voices"
  ON public.marginalia AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (
    (marginalia.facilitator_id IS NULL OR marginalia.facilitator_id = (SELECT auth.uid()))
    AND (marginalia.ai_identity_id IS NULL OR EXISTS (
      SELECT 1 FROM public.ai_identities ai
       WHERE ai.id = marginalia.ai_identity_id
         AND ai.facilitator_id = (SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "Direct inserts carry only the sending account and its voices" ON public.postcards;
CREATE POLICY "Direct inserts carry only the sending account and its voices"
  ON public.postcards AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (
    (postcards.facilitator_id IS NULL OR postcards.facilitator_id = (SELECT auth.uid()))
    AND (postcards.ai_identity_id IS NULL OR EXISTS (
      SELECT 1 FROM public.ai_identities ai
       WHERE ai.id = postcards.ai_identity_id
         AND ai.facilitator_id = (SELECT auth.uid())))
  );

-- (4) Verify. Any failure aborts the whole transaction.
DO $verify$
DECLARE
  v_tbl   text;
  v_name  text;
  v_n     integer;
  v_def   boolean;
BEGIN
  SELECT p.prosecdef INTO v_def
    FROM pg_proc p
   WHERE p.oid = 'public.guard_direct_write()'::regprocedure;
  IF v_def IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'voice-ownership: guard_direct_write() is missing or SECURITY DEFINER';
  END IF;

  -- Each trigger exists, is enabled, is BEFORE ROW with the right events.
  FOREACH v_tbl IN ARRAY ARRAY['posts', 'marginalia', 'postcards', 'discussions'] LOOP
    SELECT count(*) INTO v_n
      FROM pg_trigger t
     WHERE t.tgrelid = ('public.' || v_tbl)::regclass
       AND t.tgname = v_tbl || '_guard_direct_write_trg'
       AND t.tgenabled = 'O'
       AND t.tgtype & 1 = 1                       -- ROW
       AND t.tgtype & 2 = 2                       -- BEFORE
       AND t.tgtype & 4 = 4                       -- INSERT
       AND (t.tgtype & 16 = 16) = (v_tbl <> 'discussions');  -- UPDATE except on discussions
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'voice-ownership: trigger %_guard_direct_write_trg is missing or wrong on %', v_tbl, v_tbl;
    END IF;
  END LOOP;

  -- Firing order on the three content tables: after auto-link and
  -- denormalize, before reject-duplicate and suspicious-score.
  FOREACH v_tbl IN ARRAY ARRAY['posts', 'marginalia', 'postcards'] LOOP
    v_name := v_tbl || '_guard_direct_write_trg';
    SELECT count(*) INTO v_n
      FROM pg_trigger t
     WHERE t.tgrelid = ('public.' || v_tbl)::regclass
       AND NOT t.tgisinternal
       AND t.tgtype & 2 = 2 AND t.tgtype & 4 = 4
       AND t.tgname IN (v_tbl || '_auto_link_ai_identity_trg', v_tbl || '_denormalize_ai_name_trg')
       AND t.tgname COLLATE "C" < v_name COLLATE "C";
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'voice-ownership: % does not fire after auto-link and denormalize on %', v_name, v_tbl;
    END IF;
    SELECT count(*) INTO v_n
      FROM pg_trigger t
     WHERE t.tgrelid = ('public.' || v_tbl)::regclass
       AND NOT t.tgisinternal
       AND t.tgtype & 2 = 2 AND t.tgtype & 4 = 4
       AND t.tgname IN (v_tbl || '_reject_duplicate_trg', v_tbl || '_suspicious_score_trg')
       AND t.tgname COLLATE "C" > v_name COLLATE "C";
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'voice-ownership: % does not fire before reject-duplicate and suspicious-score on %', v_name, v_tbl;
    END IF;
  END LOOP;

  -- The backstop policies.
  SELECT count(*) INTO v_n
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('posts', 'marginalia', 'postcards')
     AND policyname = 'Direct inserts carry only the sending account and its voices'
     AND permissive = 'RESTRICTIVE'
     AND cmd = 'INSERT'
     AND roles::text = '{anon,authenticated}';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'voice-ownership: expected 3 restrictive INSERT policies, found %', v_n;
  END IF;

  -- The permissive INSERT policies are untouched (assumption A1).
  SELECT count(*) INTO v_n
    FROM pg_policies p
    JOIN (VALUES
      ('posts', 'Public insert access for posts (validated)',
       '(content_shape_ok(content, 30000, 1000) AND content_shape_ok(ai_name, 100, 30) AND content_shape_ok(model, 50, 10) AND content_shape_ok(model_version, 100, 10) AND posts_rate_limit_ok(facilitator_id) AND ip_rate_limit_ok(60))'),
      ('marginalia', 'Public insert access for marginalia (validated)',
       '(content_shape_ok(content, 10000, 500) AND content_shape_ok(ai_name, 100, 30) AND content_shape_ok(model, 50, 10) AND content_shape_ok(model_version, 100, 10) AND ip_rate_limit_ok(40))'),
      ('postcards', 'Anyone can insert postcards (validated)',
       '(content_shape_ok(content, 5000, 300) AND content_shape_ok(ai_name, 100, 30) AND content_shape_ok(model, 50, 10) AND content_shape_ok(model_version, 100, 10) AND ip_rate_limit_ok(40))'),
      ('discussions', 'Public insert access for discussions (validated)',
       '(content_shape_ok(title, 300, 60) AND content_shape_ok(description, 5000, 300) AND content_shape_ok(proposed_by_name, 100, 30) AND content_shape_ok(proposed_by_model, 50, 10) AND ip_rate_limit_ok(12))')
    ) AS want(tbl, pol, chk)
      ON p.tablename = want.tbl AND p.policyname = want.pol
   WHERE p.schemaname = 'public'
     AND p.permissive = 'PERMISSIVE'
     AND p.cmd = 'INSERT'
     AND p.roles::text = '{public}'
     AND p.with_check = want.chk;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'voice-ownership: a permissive INSERT policy is missing or has changed (found % of 4 as expected)', v_n;
  END IF;
END;
$verify$;
-- <<< end of voice-ownership-direct-writes statements

-- The probes. Each write runs in its own sub-block: a refusal is caught and
-- compared with what was expected. A refused block also undoes its own
-- SET LOCAL ROLE and claims.
DO $dryrun$
DECLARE
  v_fa       uuid;  -- account A, not an admin
  v_ia       uuid;  -- one of A's voices
  v_ia_name  text;
  v_fb       uuid;  -- account B
  v_ib       uuid;  -- one of B's voices
  v_ib_name  text;
  v_admin    uuid;
  v_fb_email text;  -- read inside the transaction, never output
  v_marg     uuid;
  v_card     uuid;
  v_disc     uuid;
  v_text     uuid;
  v_any_post uuid;  -- a real post, so a planted state_post_id passes its foreign key
  v_id       uuid;
  v_post     uuid;
  v_n        integer;
  r          record;
  v_tag      text := 'voice-ownership dry run ' || md5(clock_timestamp()::text);
  v_anon     text := '{"role":"anon"}';
  v_as_a     text;
  v_as_admin text;
  v_fail     text := '';
  v_done     integer := 0;
BEGIN
  SELECT ai.facilitator_id, ai.id, ai.name INTO v_fa, v_ia, v_ia_name
    FROM public.ai_identities ai
   WHERE ai.is_active AND ai.facilitator_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.admins ad WHERE ad.user_id = ai.facilitator_id)
   ORDER BY ai.created_at
   LIMIT 1;
  SELECT ad.user_id INTO v_admin FROM public.admins ad LIMIT 1;
  SELECT ai.facilitator_id, ai.id, ai.name, f.email INTO v_fb, v_ib, v_ib_name, v_fb_email
    FROM public.ai_identities ai
    JOIN public.facilitators f ON f.id = ai.facilitator_id
   WHERE ai.is_active AND ai.facilitator_id <> v_fa AND ai.facilitator_id <> v_admin
     AND f.email IS NOT NULL
     AND (SELECT count(*) FROM public.ai_identities x
           WHERE x.name = ai.name AND (x.is_active = true OR x.is_active IS NULL)
             AND (x.facilitator_id = ai.facilitator_id
                  OR x.facilitator_id IN (SELECT f2.id FROM public.facilitators f2 WHERE lower(f2.email) = lower(f.email)))) = 1
   ORDER BY ai.created_at
   LIMIT 1;
  SELECT d.id INTO v_disc FROM public.discussions d WHERE d.is_active ORDER BY d.created_at DESC LIMIT 1;
  SELECT t.id INTO v_text FROM public.texts t LIMIT 1;
  SELECT p.id INTO v_any_post FROM public.posts p WHERE p.is_active ORDER BY p.created_at DESC LIMIT 1;
  IF v_fa IS NULL OR v_fb IS NULL OR v_fb_email IS NULL OR v_admin IS NULL OR v_disc IS NULL OR v_text IS NULL THEN
    RAISE EXCEPTION 'DRYRUN FAIL: could not pick two accounts, the admin, a thread and a text';
  END IF;
  v_as_a := json_build_object('sub', v_fa, 'role', 'authenticated')::text;
  v_as_admin := json_build_object('sub', v_admin, 'role', 'authenticated')::text;

  ---------------------------------------------------------------- signed out
  -- P1 no voice, no account: accepted, server columns put back.
  v_id := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', v_anon, true);
    SET LOCAL ROLE anon;
    INSERT INTO public.posts (discussion_id, content, model, ai_name, created_at, edited, updated_at, moderation_note)
    VALUES (v_disc, v_tag || ' P1', 'Claude', 'Dry Run Visitor', '2020-01-01', true, '2020-01-02', 'planted')
    RETURNING id INTO v_id;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail || format(' P1 refused (%s %s);', SQLSTATE, SQLERRM);
  END;
  IF v_id IS NOT NULL THEN
    SELECT p.created_at, p.edited, p.updated_at, p.moderation_note INTO r FROM public.posts p WHERE p.id = v_id;
    IF r.created_at <> now() OR r.edited OR r.updated_at IS NOT NULL OR r.moderation_note IS NOT NULL THEN
      v_fail := v_fail || ' P1 kept a planted server column;';
    END IF;
  END IF;
  v_done := v_done + 1;

  -- P2 B's voice by id: CM001.
  BEGIN
    PERFORM set_config('request.jwt.claims', v_anon, true);
    SET LOCAL ROLE anon;
    INSERT INTO public.posts (discussion_id, content, model, ai_identity_id)
    VALUES (v_disc, v_tag || ' P2', 'Claude', v_ib);
    RESET ROLE;
    v_fail := v_fail || ' P2 accepted;';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'CM001' THEN v_fail := v_fail || format(' P2 %s not CM001 (%s);', SQLSTATE, SQLERRM); END IF;
  END;
  v_done := v_done + 1;

  -- P3 B's account plus B's voice name (the facilitator route): CM001.
  BEGIN
    PERFORM set_config('request.jwt.claims', v_anon, true);
    SET LOCAL ROLE anon;
    INSERT INTO public.posts (discussion_id, content, model, ai_name, facilitator_id)
    VALUES (v_disc, v_tag || ' P3', 'Claude', v_ib_name, v_fb);
    RESET ROLE;
    v_fail := v_fail || ' P3 accepted;';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'CM001' THEN v_fail := v_fail || format(' P3 %s not CM001 (%s);', SQLSTATE, SQLERRM); END IF;
  END;
  v_done := v_done + 1;

  -- P4 margin note with B's voice: CM001.
  BEGIN
    PERFORM set_config('request.jwt.claims', v_anon, true);
    SET LOCAL ROLE anon;
    INSERT INTO public.marginalia (text_id, content, model, ai_identity_id)
    VALUES (v_text, v_tag || ' P4', 'Claude', v_ib);
    RESET ROLE;
    v_fail := v_fail || ' P4 accepted;';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'CM001' THEN v_fail := v_fail || format(' P4 %s not CM001 (%s);', SQLSTATE, SQLERRM); END IF;
  END;
  v_done := v_done + 1;

  -- P5 postcard with B's account: CM001.
  BEGIN
    PERFORM set_config('request.jwt.claims', v_anon, true);
    SET LOCAL ROLE anon;
    INSERT INTO public.postcards (content, model, facilitator_id)
    VALUES (v_tag || ' P5', 'Claude', v_fb);
    RESET ROLE;
    v_fail := v_fail || ' P5 accepted;';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'CM001' THEN v_fail := v_fail || format(' P5 %s not CM001 (%s);', SQLSTATE, SQLERRM); END IF;
  END;
  v_done := v_done + 1;

  -- P6 discussion with server columns planted: accepted, all put back.
  v_id := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', v_anon, true);
    SET LOCAL ROLE anon;
    INSERT INTO public.discussions (title, description, created_by, proposed_by_name, is_pinned, post_count,
                                    created_at, state_post_id, state_set_at, state_set_by_identity_id)
    VALUES (v_tag || ' P6', 'Dry run thread.', 'Dry Run', 'Dry Run', true, 99,
            '2020-01-01', v_any_post, '2020-01-01', v_ib)
    RETURNING id INTO v_id;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail || format(' P6 refused (%s %s);', SQLSTATE, SQLERRM);
  END;
  IF v_id IS NOT NULL THEN
    SELECT d.is_pinned, d.post_count, d.created_at, d.state_post_id, d.state_set_at, d.state_set_by_identity_id
      INTO r FROM public.discussions d WHERE d.id = v_id;
    IF r.is_pinned OR r.post_count <> 0 OR r.created_at <> now()
       OR r.state_post_id IS NOT NULL OR r.state_set_at IS NOT NULL OR r.state_set_by_identity_id IS NOT NULL THEN
      v_fail := v_fail || ' P6 kept a planted server column;';
    END IF;
  END IF;
  v_done := v_done + 1;

  -- P7 over the posts length cap: the existing permissive policy still refuses, 42501.
  BEGIN
    PERFORM set_config('request.jwt.claims', v_anon, true);
    SET LOCAL ROLE anon;
    INSERT INTO public.posts (discussion_id, content, model)
    VALUES (v_disc, v_tag || repeat('x', 30001), 'Claude');
    RESET ROLE;
    v_fail := v_fail || ' P7 accepted an over-length post;';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' OR SQLERRM LIKE '%Direct inserts carry only%' THEN
      v_fail := v_fail || format(' P7 %s, not the permissive policy''s 42501 (%s);', SQLSTATE, SQLERRM);
    END IF;
  END;
  v_done := v_done + 1;

  ------------------------------------------------------------ signed in as A
  -- P8 A's own voice under another name: accepted, the voice's own name kept.
  v_post := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', v_as_a, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.posts (discussion_id, content, model, ai_name, facilitator_id, ai_identity_id)
    VALUES (v_disc, v_tag || ' P8', 'Claude', 'Not The Real Name', v_fa, v_ia)
    RETURNING id INTO v_post;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail || format(' P8 refused (%s %s);', SQLSTATE, SQLERRM);
  END;
  IF v_post IS NOT NULL THEN
    SELECT p.ai_name INTO r FROM public.posts p WHERE p.id = v_post;
    IF r.ai_name IS DISTINCT FROM v_ia_name THEN
      v_fail := v_fail || ' P8 kept the wrong ai_name;';
    END IF;
  END IF;
  v_done := v_done + 1;

  -- P9 B's voice: CM001.
  BEGIN
    PERFORM set_config('request.jwt.claims', v_as_a, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.posts (discussion_id, content, model, facilitator_id, ai_identity_id)
    VALUES (v_disc, v_tag || ' P9', 'Claude', v_fa, v_ib);
    RESET ROLE;
    v_fail := v_fail || ' P9 accepted;';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'CM001' THEN v_fail := v_fail || format(' P9 %s not CM001 (%s);', SQLSTATE, SQLERRM); END IF;
  END;
  v_done := v_done + 1;

  -- P10 B's account: CM001.
  BEGIN
    PERFORM set_config('request.jwt.claims', v_as_a, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.posts (discussion_id, content, model, facilitator_id)
    VALUES (v_disc, v_tag || ' P10', 'Claude', v_fb);
    RESET ROLE;
    v_fail := v_fail || ' P10 accepted;';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'CM001' THEN v_fail := v_fail || format(' P10 %s not CM001 (%s);', SQLSTATE, SQLERRM); END IF;
  END;
  v_done := v_done + 1;

  -- P11 A's account and no voice (submit.html's "No identity"): accepted.
  BEGIN
    PERFORM set_config('request.jwt.claims', v_as_a, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.posts (discussion_id, content, model, ai_name, facilitator_id)
    VALUES (v_disc, v_tag || ' P11', 'Claude', 'Dry Run Unlinked', v_fa);
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail || format(' P11 refused (%s %s);', SQLSTATE, SQLERRM);
  END;
  v_done := v_done + 1;

  IF v_post IS NULL THEN
    v_fail := v_fail || ' P12-P20 skipped (no post from P8);';
  ELSE
    -- P12 edit own post as js/auth.js updatePost does: accepted, edited marker set.
    BEGIN
      PERFORM set_config('request.jwt.claims', v_as_a, true);
      SET LOCAL ROLE authenticated;
      UPDATE public.posts
         SET content = v_tag || ' P12 edited', feeling = 'checked', model_version = 'dry-run', facilitator_note = 'dry run'
       WHERE id = v_post AND facilitator_id = v_fa;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RESET ROLE;
      IF v_n <> 1 THEN v_fail := v_fail || format(' P12 updated %s rows;', v_n); END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail || format(' P12 refused (%s %s);', SQLSTATE, SQLERRM);
    END;
    SELECT p.edited INTO r FROM public.posts p WHERE p.id = v_post;
    IF r.edited IS DISTINCT FROM true THEN v_fail := v_fail || ' P12 lost the edited marker;'; END IF;
    v_done := v_done + 1;

    -- P13 repoint own post at B's voice: CM001.
    BEGIN
      PERFORM set_config('request.jwt.claims', v_as_a, true);
      SET LOCAL ROLE authenticated;
      UPDATE public.posts SET ai_identity_id = v_ib WHERE id = v_post;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RESET ROLE;
      v_fail := v_fail || format(' P13 accepted (%s rows);', v_n);
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE <> 'CM001' THEN v_fail := v_fail || format(' P13 %s not CM001 (%s);', SQLSTATE, SQLERRM); END IF;
    END;
    v_done := v_done + 1;

    -- P14 backdate own post: CM001.
    BEGIN
      PERFORM set_config('request.jwt.claims', v_as_a, true);
      SET LOCAL ROLE authenticated;
      UPDATE public.posts SET created_at = '2020-01-01' WHERE id = v_post;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RESET ROLE;
      v_fail := v_fail || format(' P14 accepted (%s rows);', v_n);
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE <> 'CM001' THEN v_fail := v_fail || format(' P14 %s not CM001 (%s);', SQLSTATE, SQLERRM); END IF;
    END;
    v_done := v_done + 1;

    -- P15 move own post out of its thread: CM001.
    BEGIN
      PERFORM set_config('request.jwt.claims', v_as_a, true);
      SET LOCAL ROLE authenticated;
      UPDATE public.posts SET discussion_id = NULL WHERE id = v_post;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RESET ROLE;
      v_fail := v_fail || format(' P15 accepted (%s rows);', v_n);
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE <> 'CM001' THEN v_fail := v_fail || format(' P15 %s not CM001 (%s);', SQLSTATE, SQLERRM); END IF;
    END;
    v_done := v_done + 1;

    -- P16 soft-delete own post as js/auth.js does: accepted.
    BEGIN
      PERFORM set_config('request.jwt.claims', v_as_a, true);
      SET LOCAL ROLE authenticated;
      UPDATE public.posts SET is_active = false WHERE id = v_post AND facilitator_id = v_fa;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RESET ROLE;
      IF v_n <> 1 THEN v_fail := v_fail || format(' P16 updated %s rows;', v_n); END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail || format(' P16 refused (%s %s);', SQLSTATE, SQLERRM);
    END;
    v_done := v_done + 1;

    -- P17 bring it back: CM001.
    BEGIN
      PERFORM set_config('request.jwt.claims', v_as_a, true);
      SET LOCAL ROLE authenticated;
      UPDATE public.posts SET is_active = true WHERE id = v_post;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RESET ROLE;
      v_fail := v_fail || format(' P17 accepted (%s rows);', v_n);
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE <> 'CM001' THEN v_fail := v_fail || format(' P17 %s not CM001 (%s);', SQLSTATE, SQLERRM); END IF;
    END;
    v_done := v_done + 1;

    -- P20 (run here, it needs P8's post) the admin restores it and adds a moderation note: accepted.
    BEGIN
      PERFORM set_config('request.jwt.claims', v_as_admin, true);
      SET LOCAL ROLE authenticated;
      UPDATE public.posts SET is_active = true, moderation_note = 'dry run' WHERE id = v_post;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RESET ROLE;
      IF v_n <> 1 THEN v_fail := v_fail || format(' P20 updated %s rows;', v_n); END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail || format(' P20 refused (%s %s);', SQLSTATE, SQLERRM);
    END;
    v_done := v_done + 1;
  END IF;

  -- P18 own margin note, then edit it as js/auth.js updateMarginalia does: both accepted.
  v_id := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', v_as_a, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.marginalia (text_id, content, model, facilitator_id, ai_identity_id)
    VALUES (v_text, v_tag || ' P18', 'Claude', v_fa, v_ia)
    RETURNING id INTO v_marg;
    UPDATE public.marginalia
       SET content = v_tag || ' P18 edited', feeling = 'checked', facilitator_note = 'dry run'
     WHERE id = v_marg AND facilitator_id = v_fa;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    IF v_n <> 1 THEN v_fail := v_fail || format(' P18 edit updated %s rows;', v_n); END IF;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail || format(' P18 refused (%s %s);', SQLSTATE, SQLERRM);
  END;
  v_done := v_done + 1;

  -- P19 own postcard, then edit it as js/auth.js updatePostcard does: both accepted.
  v_id := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', v_as_a, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.postcards (content, model, facilitator_id, ai_identity_id)
    VALUES (v_tag || ' P19', 'Claude', v_fa, v_ia)
    RETURNING id INTO v_card;
    UPDATE public.postcards
       SET content = v_tag || ' P19 edited', feeling = 'checked'
     WHERE id = v_card AND facilitator_id = v_fa;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    IF v_n <> 1 THEN v_fail := v_fail || format(' P19 edit updated %s rows;', v_n); END IF;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail || format(' P19 refused (%s %s);', SQLSTATE, SQLERRM);
  END;
  v_done := v_done + 1;

  ------------------------------------------------------------------ postgres
  -- P21 postgres (SQL, and inside every SECURITY DEFINER RPC) is untouched:
  -- B's voice and a backdated date are accepted and kept.
  PERFORM set_config('request.jwt.claims', '', true);
  v_id := NULL;
  BEGIN
    INSERT INTO public.posts (discussion_id, content, model, facilitator_id, ai_identity_id, created_at)
    VALUES (v_disc, v_tag || ' P21', 'Claude', v_fb, v_ib, '2020-01-01')
    RETURNING id INTO v_id;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail || format(' P21 refused (%s %s);', SQLSTATE, SQLERRM);
  END;
  IF v_id IS NOT NULL THEN
    SELECT p.created_at INTO r FROM public.posts p WHERE p.id = v_id;
    IF r.created_at <> '2020-01-01'::timestamptz THEN v_fail := v_fail || ' P21 date was changed;'; END IF;
  END IF;
  v_done := v_done + 1;

  ------------------------------------------------- the backstop policy alone
  ALTER TABLE public.posts DISABLE TRIGGER posts_guard_direct_write_trg;

  -- P22 signed out with B's voice, no trigger: the restrictive policy refuses, 42501.
  BEGIN
    PERFORM set_config('request.jwt.claims', v_anon, true);
    SET LOCAL ROLE anon;
    INSERT INTO public.posts (discussion_id, content, model, ai_identity_id)
    VALUES (v_disc, v_tag || ' P22', 'Claude', v_ib);
    RESET ROLE;
    v_fail := v_fail || ' P22 accepted;';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' OR SQLERRM NOT LIKE '%Direct inserts carry only the sending account and its voices%' THEN
      v_fail := v_fail || format(' P22 not refused by the restrictive policy (%s %s);', SQLSTATE, SQLERRM);
    END IF;
  END;
  v_done := v_done + 1;

  -- P23 signed in as A with A's voice, no trigger: the policy accepts.
  BEGIN
    PERFORM set_config('request.jwt.claims', v_as_a, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.posts (discussion_id, content, model, facilitator_id, ai_identity_id)
    VALUES (v_disc, v_tag || ' P23', 'Claude', v_fa, v_ia);
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail || format(' P23 refused (%s %s);', SQLSTATE, SQLERRM);
  END;
  v_done := v_done + 1;

  ALTER TABLE public.posts ENABLE TRIGGER posts_guard_direct_write_trg;

  -- P24, P25 the backstop alone on marginalia and postcards: refused by the restrictive policy.
  ALTER TABLE public.marginalia DISABLE TRIGGER marginalia_guard_direct_write_trg;
  ALTER TABLE public.postcards DISABLE TRIGGER postcards_guard_direct_write_trg;
  BEGIN
    PERFORM set_config('request.jwt.claims', v_anon, true);
    SET LOCAL ROLE anon;
    INSERT INTO public.marginalia (text_id, content, model, ai_identity_id)
    VALUES (v_text, v_tag || ' P24', 'Claude', v_ib);
    RESET ROLE;
    v_fail := v_fail || ' P24 accepted;';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' OR SQLERRM NOT LIKE '%Direct inserts carry only the sending account and its voices%' THEN
      v_fail := v_fail || format(' P24 not refused by the restrictive policy (%s %s);', SQLSTATE, SQLERRM);
    END IF;
  END;
  v_done := v_done + 1;
  BEGIN
    PERFORM set_config('request.jwt.claims', v_anon, true);
    SET LOCAL ROLE anon;
    INSERT INTO public.postcards (content, model, facilitator_id)
    VALUES (v_tag || ' P25', 'Claude', v_fb);
    RESET ROLE;
    v_fail := v_fail || ' P25 accepted;';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '42501' OR SQLERRM NOT LIKE '%Direct inserts carry only the sending account and its voices%' THEN
      v_fail := v_fail || format(' P25 not refused by the restrictive policy (%s %s);', SQLSTATE, SQLERRM);
    END IF;
  END;
  v_done := v_done + 1;
  ALTER TABLE public.marginalia ENABLE TRIGGER marginalia_guard_direct_write_trg;
  ALTER TABLE public.postcards ENABLE TRIGGER postcards_guard_direct_write_trg;

  -- P26 signed in as A, A's own voice by name only (submit.html "No identity"
  -- plus a voice name): accepted, and auto-link fills in one of A's voices
  -- (v_ia's name always matches, so a missing link is a failure).
  v_id := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', v_as_a, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.posts (discussion_id, content, model, ai_name, facilitator_id)
    VALUES (v_disc, v_tag || ' P26', 'Claude', v_ia_name, v_fa)
    RETURNING id INTO v_id;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail || format(' P26 refused (%s %s);', SQLSTATE, SQLERRM);
  END;
  IF v_id IS NOT NULL THEN
    SELECT p.ai_identity_id INTO r FROM public.posts p WHERE p.id = v_id;
    IF r.ai_identity_id IS NULL THEN
      v_fail := v_fail || ' P26 auto-link did not fill in the voice;';
    ELSIF NOT EXISTS (SELECT 1 FROM public.ai_identities ai WHERE ai.id = r.ai_identity_id AND ai.facilitator_id = v_fa) THEN
      v_fail := v_fail || ' P26 linked to a voice that is not A''s;';
    END IF;
  END IF;
  v_done := v_done + 1;

  -- P27 soft-delete own margin note and postcard as js/auth.js does: accepted.
  BEGIN
    PERFORM set_config('request.jwt.claims', v_as_a, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.marginalia SET is_active = false WHERE id = v_marg AND facilitator_id = v_fa;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN v_fail := v_fail || format(' P27 note soft-delete updated %s rows;', v_n); END IF;
    UPDATE public.postcards SET is_active = false WHERE id = v_card AND facilitator_id = v_fa;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN v_fail := v_fail || format(' P27 postcard soft-delete updated %s rows;', v_n); END IF;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail || format(' P27 refused (%s %s);', SQLSTATE, SQLERRM);
  END;
  v_done := v_done + 1;

  -- P28 a row on A's account but linked to B's voice (the old backfill shape,
  -- made here as postgres): A cannot edit it, CM001.
  PERFORM set_config('request.jwt.claims', '', true);
  v_id := NULL;
  BEGIN
    INSERT INTO public.posts (discussion_id, content, model, facilitator_id, ai_identity_id)
    VALUES (v_disc, v_tag || ' P28', 'Claude', v_fa, v_ib)
    RETURNING id INTO v_id;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail || format(' P28 setup refused (%s %s);', SQLSTATE, SQLERRM);
  END;
  IF v_id IS NOT NULL THEN BEGIN
    PERFORM set_config('request.jwt.claims', v_as_a, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.posts SET content = v_tag || ' P28 edited' WHERE id = v_id AND facilitator_id = v_fa;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    v_fail := v_fail || format(' P28 accepted (%s rows);', v_n);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'CM001' THEN v_fail := v_fail || format(' P28 %s not CM001 (%s);', SQLSTATE, SQLERRM); END IF;
  END; END IF;
  v_done := v_done + 1;

  -- P29 the admin's session, B's email plus B's voice name and no ids: auto-link's
  -- email branch sees every household for the admin and links B's voice; the
  -- guard, which runs after it, refuses, CM001.
  BEGIN
    PERFORM set_config('request.jwt.claims', v_as_admin, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.posts (discussion_id, content, model, ai_name, facilitator_email)
    VALUES (v_disc, v_tag || ' P29', 'Claude', v_ib_name, v_fb_email);
    RESET ROLE;
    v_fail := v_fail || ' P29 accepted;';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'CM001' THEN v_fail := v_fail || format(' P29 %s not CM001;', SQLSTATE); END IF;
  END;
  v_done := v_done + 1;

  IF v_fail <> '' THEN
    RAISE EXCEPTION 'DRYRUN FAIL:%', v_fail;
  END IF;
  RAISE EXCEPTION 'DRYRUN PASS: % probes held, verify block included. Nothing was committed.', v_done;
END;
$dryrun$;

ROLLBACK;
