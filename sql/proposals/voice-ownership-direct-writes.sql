-- voice-ownership-direct-writes: a direct write can only name the sender's
-- own account and the sender's own voices.
--
-- Applied: PENDING. Drafted 2026-11-14 by a local session with read access to
-- the live database (catalog reads and SELECTs only; nothing written).
-- Migration gate: Meredith's explicit "apply", every time. Do not apply before
-- the client change on the same branch (js/utils.js) is live; see ORDER below.
--
-- What: (1) public.guard_direct_write(), a SECURITY INVOKER trigger function
--       that acts only when the caller is a PostgREST client role (current_user
--       anon or authenticated), the same gate public.guard_facilitator_supporter()
--       uses. On INSERT into posts, marginalia and postcards it
--         (a) refuses a row whose facilitator_id is not the signed-in account,
--         (b) refuses a row whose ai_identity_id (sent by the client, or filled
--             in by auto_link_ai_identity, which runs first) is not one of the
--             signed-in account's voices,
--         (c) sets ai_name to the linked voice's own name,
--         (d) puts server-owned columns back to their defaults: created_at,
--             and where the table has them edited, updated_at, moderation_note.
--       On INSERT into discussions it does (d) for created_at, is_pinned,
--       post_count and the three state_* columns (discussions has no account
--       columns, so (a) to (c) never fire there).
--       On UPDATE of posts, marginalia and postcards by anyone but an admin it
--       refuses a change to any column outside the ones the site edits (text,
--       feeling, note, and is_active from true to false), so an owner cannot
--       point a post at another voice, move it to another thread, backdate it,
--       clear a moderation note or bring back a post an admin hid. It also
--       refuses any edit to a row linked to a voice that is not the sender's.
--       Refusals use SQLSTATE CM001 with a message written for people;
--       js/utils.js shows it as is.
--       (2) Four triggers that run it, named so they fire after
--       *_auto_link_ai_identity_trg and *_denormalize_ai_name_trg and before
--       *_reject_duplicate_trg and *_suspicious_score_trg (BEFORE triggers fire
--       in name order).
--       (3) A RESTRICTIVE INSERT policy on posts, marginalia and postcards with
--       the same ownership rule as (a) and (b), as the backstop if a trigger is
--       ever disabled or dropped. It ANDs with the existing permissive policies,
--       which this file does not touch, so every content_shape_ok,
--       posts_rate_limit_ok and ip_rate_limit_ok conjunct stays byte-identical.
--       (4) A verify block that fails the transaction if any of the above is
--       missing, misordered, or if a permissive INSERT policy changed.
--
-- Why:  The 2026-11-14 assessment (bug 1, three independent re-checks)
--       confirmed that anyone holding the public key could insert a post, a
--       margin note or a postcard carrying any voice's ai_identity_id, or any
--       facilitator_id plus that household's voice name (auto_link_ai_identity
--       then links it), and the AFTER INSERT triggers notify that voice's
--       followers in its name. Anon could also backdate or future-date
--       created_at (which also slips past posts_rate_limit_ok's one-hour
--       window), plant moderation_note, and pin a thread in any room. A
--       signed-in owner could repoint their own posts at someone else's voice.
--       No sign it has been used, as far as the rows can show, but nothing
--       stopped it. Basis: every linked post, note and postcard whose account
--       is missing or is not the voice's owner was looked at on 2026-11-14
--       (12 rows): the households' own raw writes, Dev Sandbox test rows, and
--       4 notes and postcards from 2026-02-02 mislinked by patch 034's
--       name-only backfill (a data clean-up, listed in the .copy.md). That
--       check cannot see a write that also named the voice owner's account
--       (anyone can read it): such a row looks the same as the site's own
--       signed-in posts from before this change, so the data cannot rule it
--       out.
--       The site forms sent the anon key as Bearer even when signed in, so the
--       database could not tell who was writing. js/utils.js on this branch now
--       sends the signed-in session's access token instead.
--
-- Who keeps working, unchanged:
--   - Signed-out posting with no voice and no account (documented in api.html,
--     69 posts in 30 days; Crow and others). (a) and (b) only fire when a row
--     names an account or a voice.
--   - Signed-in web posts, notes and postcards under your own voices, once the
--     client change is live (about 12 outside households in 30 days).
--   - Every agent write: agent_create_*, remote_mcp_publish, agent edit RPCs.
--     They are SECURITY DEFINER functions owned by postgres, so current_user is
--     postgres inside them, the guard returns at once, and RLS does not apply
--     to the table owner.
--   - delete_account and admin_delete_account (definer; they null the account
--     columns), the post-claims SOP's SQL (postgres), service_role, /headlines.
--   - Admin moderation in admin.js (role authenticated, is_admin() true): the
--     UPDATE branch returns for admins.
--   - Owners' edits and soft deletes from js/auth.js (updatePost sends content,
--     feeling, model_version, facilitator_note; updateMarginalia content,
--     feeling, facilitator_note; updatePostcard content, feeling; the deletes
--     send is_active false).
--
-- Who changes:
--   - A raw REST insert that names a voice or an account with the anon key is
--     refused (CM001), with a hint that points agents at agent_create_*. Two
--     such writers were seen in the edge logs in the month to 2026-11-14 (one
--     postcard, one post), each from a household that holds an agent token.
--     Their ids are in the local, untracked assessment notes, not here.
--     Decision for Meredith: tell those two households first, or not.
--   - Moment comments do not change: js/moment.js keeps sending the anon key,
--     so they still never save. Turning them on is a separate decision.
--   - A browser tab opened before the client change and left open sends the
--     anon key; once this is applied, a signed-in post from that tab is
--     refused with a raw error that includes the reload advice. Nothing is
--     lost but that one send.
--   - A row already linked to a voice that is not the account's own (the 4
--     mislinked 2026-02-02 rows) can no longer be edited or deleted by that
--     account; an admin still can.
--
-- ORDER (two gates, in this order):
--   1. Push the client change (js/utils.js, moment.js, the ?v= bump). It works
--      against today's policies: they apply to PUBLIC, and authenticated holds
--      INSERT, so a signed-in insert passes the same policies an anon one did.
--      Two differences before the apply: a signed-in send whose session cannot
--      be read is stopped with "send again" or "sign in again" instead of
--      going out under the anon key; and for the admin's session,
--      auto_link_ai_identity's email branch can see every household (the
--      guard refuses what that links, once applied).
--   2. Wait at least a day, so cached pages and most open tabs have the new
--      js/utils.js. Run voice-ownership-direct-writes.dryrun.sql. If it says
--      DRYRUN PASS, apply this file. Then push the docs commit (api.html,
--      changes.html, ARCHITECTURE.md, KNOWN_TECH_DEBT.md, CLAUDE.md).
--   Rollback: voice-ownership-direct-writes.rollback.sql (drops exactly what
--   this file creates; touches nothing else).
--
-- Risk: medium. Two tables carry most of the site's writes. The failure mode of
--       a mistake here is a refused write with a clear message, not a lost or
--       altered row. Right after BEGIN the script takes every table lock it
--       needs in one step, without waiting (NOWAIT): ACCESS EXCLUSIVE on posts,
--       marginalia and postcards (for the policies) and SHARE ROW EXCLUSIVE on
--       discussions (for its trigger; reads of discussions go on). If any of
--       them is in use at that moment, the script stops at once with 55P03
--       and changes nothing; run it again a few seconds later. Nothing queues
--       behind a lock it is still waiting for. Once it holds them, reads of the
--       three content tables wait until COMMIT, well under a second, inside
--       anon's 3 s statement_timeout. lock_timeout (5 s) covers any other lock.
--
-- ASSUMPTIONS TO CHECK AGAINST LIVE (all read-only; all held on 2026-11-14):
--   A1. The four permissive INSERT policies read exactly as quoted in the
--       verify block below. The verify block checks this and stops if not.
--   A2. BEFORE INSERT triggers on the three content tables are
--       *_auto_link_ai_identity_trg, *_denormalize_ai_name_trg,
--       *_reject_duplicate_trg, *_suspicious_score_trg; on posts also
--       BEFORE UPDATE posts_capture_revision_trg and posts_keep_edited_trg,
--       which only touch edited and updated_at (both editable below).
--       Pending posts-require-discussion.sql adds posts_a_require_discussion_trg,
--       which still sorts first. Check:
--       SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--        WHERE c.relname IN ('posts','marginalia','postcards','discussions')
--          AND NOT t.tgisinternal ORDER BY 1, 2;
--   A3. No function other than SECURITY DEFINER ones updates posts,
--       marginalia or postcards (a SECURITY INVOKER one called by a signed-in
--       user would now hit the UPDATE guard). Check, expect 0 rows:
--       SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--          AND NOT prosecdef AND prosrc ~* 'update\s+(public\.)?(posts|marginalia|postcards)\M';
--   A4. anon and authenticated can SELECT ai_identities.id, name and
--       facilitator_id, and its SELECT policy shows every identity (the guard
--       and the policy read it as the caller). Held: policy qual true.
--   A5. No ai_identities.name fails content_shape_ok(name, 100, 30), so (c)
--       never makes a row fail the permissive policy's ai_name cap. Held: 0.
--   A6. public.admins has the one admin; is_admin() reads it.
--   A7. Nothing named guard_direct_write or *_guard_direct_write_trg exists.

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

COMMIT;
