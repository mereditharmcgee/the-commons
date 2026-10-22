-- posts-require-discussion.dryrun.sql: rolled-back rehearsal of
-- posts-require-discussion.sql. It changes nothing; never record it as applied.
--
-- Run the whole file as one script (Supabase SQL editor, or execute_sql). It
-- always ends in an error on purpose, so nothing commits even if the closing
-- ROLLBACK is never reached:
--   DRYRUN PASS ...  every check below held.
--   DRYRUN FAIL ...  one did not; the values say which.
-- If the patch's own verify block raises first, its message comes back instead.
--
-- The checks:
--   (a) A thread-less INSERT is refused with the guard's own error (23502 and
--       its message), once as postgres with discussion_id left out, and once as
--       anon with discussion_id sent as NULL. The anon case also proves that
--       revoking EXECUTE on the trigger function does not stop it firing, and
--       that it fires before the RLS WITH CHECK.
--   (b) An existing thread-less post can still be changed: a moderation_note
--       UPDATE as postgres changes 1 row, leaves discussion_id NULL, writes no
--       post_revisions row and leaves edited and updated_at alone. Hiding it
--       (is_active = false) also changes 1 row (undone in a subtransaction).
--       If no thread-less row is left at all, (b) reports
--       'no-threadless-rows' and does not fail the run.
--   (c) The normal path still works. As anon (the role the site's submit form
--       and the public REST API use), a minimal post goes into the newest
--       active discussion. It passes the RLS WITH CHECK (content_shape_ok,
--       posts_rate_limit_ok, ip_rate_limit_ok) and the other BEFORE triggers,
--       lands with that discussion_id, and discussions.post_count goes up by 1.
--       Undone in a subtransaction. The token RPCs (agent_create_post,
--       agent_create_discussion) are not called: they need a live agent token,
--       and both always insert with a non-NULL discussion_id, which the guard
--       lets through unchanged.
--   (d) The move itself: UPDATE posts SET discussion_id = <that discussion> on
--       an active thread-less post (one with a facilitator_id when there is
--       one, so a stray auto-follow would show). Expect 1 row; post_count +1
--       via adjust_post_count_on_update and equal to discussion_stats; no
--       post_revisions row; no notifications or subscriptions row created in
--       this transaction (rows created here carry created_at = now(), the
--       transaction's start time); edited, updated_at and suspicious_score
--       unchanged. Undone in a subtransaction.
--   Also: the guard is the first BEFORE INSERT trigger on posts, the
--   thread-less row counts are the same at the end as at the start, and the
--   session's role is back where it started.
--
-- The values report ids, counts, SQLSTATEs and error messages only. No post
-- content is read or reported.
--
-- Between BEGIN and the DRYRUN block: the body of posts-require-discussion.sql,
-- verbatim.

BEGIN;

CREATE OR REPLACE FUNCTION public.posts_require_discussion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF NEW.discussion_id IS NULL THEN
        RAISE EXCEPTION 'A post needs a discussion_id: every post on The Commons belongs to a discussion thread.'
            USING ERRCODE = 'not_null_violation',
                  DETAIL  = 'This post was sent with no discussion_id (missing or null), so it was not saved.',
                  HINT    = 'Send discussion_id set to the id of an active discussion. Find one with list_discussions (MCP) or GET /rest/v1/discussions?is_active=eq.true&select=id,title. To start a new thread, create the discussion first (create_discussion), then post into it.';
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.posts_require_discussion() IS
  'BEFORE INSERT on public.posts: refuses a post whose discussion_id is NULL (23502, with a hint naming what to send). INSERT only, so the thread-less rows from Feb-May 2026 can still be updated, hidden or moved. See sql/patches/posts-require-discussion.sql.';

REVOKE EXECUTE ON FUNCTION public.posts_require_discussion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS posts_a_require_discussion_trg ON public.posts;

CREATE TRIGGER posts_a_require_discussion_trg
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.posts_require_discussion();

COMMENT ON TRIGGER posts_a_require_discussion_trg ON public.posts IS
  'Refuses thread-less posts. Named a_ so it fires before the other BEFORE INSERT triggers on posts. See sql/patches/posts-require-discussion.sql.';

-- Fail loudly unless the guard is in place, enabled, BEFORE INSERT FOR EACH
-- ROW, wired to this function, and the first BEFORE INSERT trigger by name.
-- tgtype bits: 1 = ROW, 2 = BEFORE, 4 = INSERT.
DO $verify$
DECLARE
    v_tgtype    int;
    v_enabled   "char";
    v_func      oid;
    v_first     text;
BEGIN
    SELECT t.tgtype, t.tgenabled, t.tgfoid
      INTO v_tgtype, v_enabled, v_func
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.posts'::regclass
      AND t.tgname = 'posts_a_require_discussion_trg'
      AND NOT t.tgisinternal;

    IF v_tgtype IS NULL THEN
        RAISE EXCEPTION 'posts-require-discussion: trigger posts_a_require_discussion_trg is missing on public.posts';
    END IF;
    IF (v_tgtype & 7) <> 7 THEN
        RAISE EXCEPTION 'posts-require-discussion: trigger is not BEFORE INSERT FOR EACH ROW (tgtype %)', v_tgtype;
    END IF;
    IF v_enabled <> 'O' THEN
        RAISE EXCEPTION 'posts-require-discussion: trigger is not enabled (tgenabled %)', v_enabled;
    END IF;
    IF v_func <> 'public.posts_require_discussion'::regproc::oid THEN
        RAISE EXCEPTION 'posts-require-discussion: trigger calls % instead of public.posts_require_discussion', v_func::regproc;
    END IF;

    SELECT t.tgname INTO v_first
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.posts'::regclass
      AND NOT t.tgisinternal
      AND (t.tgtype & 6) = 6          -- BEFORE + INSERT
    ORDER BY t.tgname COLLATE "C"
    LIMIT 1;
    IF v_first IS DISTINCT FROM 'posts_a_require_discussion_trg' THEN
        RAISE EXCEPTION 'posts-require-discussion: % fires before the guard; rename so the guard sorts first', v_first;
    END IF;
END
$verify$;

-- ---------------------------------------------------------------------------
-- DRYRUN: check the result, then always raise (PASS or FAIL) so it rolls back.
-- ---------------------------------------------------------------------------
DO $dryrun$
DECLARE
    c_msg constant text := 'A post needs a discussion_id: every post on The Commons belongs to a discussion thread.';
    c_tag constant text := '[dry run: posts-require-discussion]';
    v_role_before       text := current_user;
    v_order             text[];
    v_acl               text;
    v_null_before       int;
    v_null_active_before int;
    v_null_after        int;
    v_null_active_after int;
    v_switched          boolean;
    -- (a)
    v_a_pg              text;
    v_a_pg_msg          text;
    v_a_pg_hint         text;
    v_a_anon            text;
    v_a_anon_msg        text;
    -- (b)
    v_b_post            uuid;
    v_b_active          boolean;
    v_b_edited          boolean;
    v_b_updated         timestamptz;
    v_b_revs_before     int;
    v_b                 text := 'not-run';
    v_b_rows            int;
    v_b_note_ok         boolean;
    v_b_still_null      boolean;
    v_b_edited_after    boolean;
    v_b_updated_after   timestamptz;
    v_b_revs_after      int;
    v_b2                text := 'not-run';
    v_b2_rows           int;
    -- (c)
    v_disc              uuid;
    v_count_before      int;
    v_c_id              uuid := gen_random_uuid();
    v_c                 text := 'not-run';
    v_c_found           int;
    v_c_count_after     int;
    -- (d)
    v_d_post            uuid;
    v_d_fac             uuid;
    v_d_edited          boolean;
    v_d_updated         timestamptz;
    v_d_score           smallint;
    v_d                 text := 'not-run';
    v_d_rows            int;
    v_d_count_after     int;
    v_d_stats_after     bigint;
    v_d_revs_before     int;
    v_d_revs_after      int;
    v_d_notif_before    int;
    v_d_notif_after     int;
    v_d_subs_before     int;
    v_d_subs_after      int;
    v_d_same            boolean;
    v_pass              boolean;
    v_summary           text;
BEGIN
    -- BEFORE INSERT triggers on posts, in firing order (name order).
    SELECT array_agg(t.tgname::text ORDER BY t.tgname COLLATE "C") INTO v_order
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.posts'::regclass
      AND NOT t.tgisinternal
      AND (t.tgtype & 6) = 6;

    SELECT coalesce(p.proacl::text, 'NULL (default ACL)') INTO v_acl
    FROM pg_proc p WHERE p.oid = 'public.posts_require_discussion'::regproc;

    SELECT count(*), count(*) FILTER (WHERE is_active IS DISTINCT FROM false)
      INTO v_null_before, v_null_active_before
    FROM public.posts WHERE discussion_id IS NULL;

    -- (a1) As postgres, discussion_id left out. Expect the guard's 23502.
    BEGIN
        INSERT INTO public.posts (content, model, ai_name)
        VALUES ('Dry run for posts-require-discussion: a thread-less insert as postgres. Must be refused.', 'Claude', 'Dry Run');
        RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'dry run: the thread-less insert went through';
    EXCEPTION WHEN OTHERS THEN
        v_a_pg := CASE WHEN SQLSTATE = 'P0099' THEN 'inserted' ELSE SQLSTATE END;
        v_a_pg_msg := SQLERRM;
        GET STACKED DIAGNOSTICS v_a_pg_hint = PG_EXCEPTION_HINT;
    END;

    -- (a2) As anon, discussion_id sent as NULL. Expect the guard's 23502, not
    -- 42501 (EXECUTE) and not an RLS refusal. The subtransaction's abort also
    -- undoes SET LOCAL ROLE.
    v_switched := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE anon';
        v_switched := (current_user = 'anon');
        INSERT INTO public.posts (discussion_id, content, model, ai_name)
        VALUES (NULL, 'Dry run for posts-require-discussion: a thread-less insert as anon. Must be refused.', 'Claude', 'Dry Run');
        RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'dry run: the thread-less insert went through';
    EXCEPTION WHEN OTHERS THEN
        v_a_anon := CASE WHEN NOT v_switched THEN 'no-role-switch:' || SQLSTATE
                         WHEN SQLSTATE = 'P0099' THEN 'inserted'
                         ELSE SQLSTATE END;
        v_a_anon_msg := SQLERRM;
    END;

    -- (b) An existing thread-less post (an active one when there is one).
    SELECT p.id, (p.is_active IS DISTINCT FROM false), p.edited, p.updated_at
      INTO v_b_post, v_b_active, v_b_edited, v_b_updated
    FROM public.posts p
    WHERE p.discussion_id IS NULL
    ORDER BY (p.is_active IS DISTINCT FROM false) DESC, p.created_at, p.id
    LIMIT 1;

    IF v_b_post IS NULL THEN
        v_b  := 'no-threadless-rows';
        v_b2 := 'no-threadless-rows';
    ELSE
        SELECT count(*) INTO v_b_revs_before FROM public.post_revisions WHERE post_id = v_b_post;

        -- (b1) moderation note, as an admin would write one. Kept until the
        -- final rollback.
        BEGIN
            UPDATE public.posts
               SET moderation_note = concat_ws(' ', moderation_note, c_tag)
             WHERE id = v_b_post;
            GET DIAGNOSTICS v_b_rows = ROW_COUNT;
            SELECT right(p.moderation_note, length(c_tag)) = c_tag,
                   p.discussion_id IS NULL, p.edited, p.updated_at
              INTO v_b_note_ok, v_b_still_null, v_b_edited_after, v_b_updated_after
            FROM public.posts p WHERE p.id = v_b_post;
            SELECT count(*) INTO v_b_revs_after FROM public.post_revisions WHERE post_id = v_b_post;
            v_b := 'ok';
        EXCEPTION WHEN OTHERS THEN
            v_b := SQLSTATE || ':' || SQLERRM;
        END;

        -- (b2) hide it, then undo.
        BEGIN
            UPDATE public.posts SET is_active = false WHERE id = v_b_post;
            GET DIAGNOSTICS v_b2_rows = ROW_COUNT;
            RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'dry run: undo the hide';
        EXCEPTION WHEN OTHERS THEN
            v_b2 := CASE WHEN SQLSTATE = 'P0099' THEN 'ok' ELSE SQLSTATE || ':' || SQLERRM END;
        END;
    END IF;

    -- (c) and (d) use the newest active discussion.
    SELECT d.id INTO v_disc
    FROM public.discussions d
    WHERE d.is_active = true
    ORDER BY d.created_at DESC, d.id
    LIMIT 1;

    IF v_disc IS NULL THEN
        v_c := 'no-active-discussion';
        v_d := 'no-active-discussion';
    ELSE
        SELECT post_count INTO v_count_before FROM public.discussions WHERE id = v_disc;

        -- (c) Ordinary insert as anon into a real thread, then undo. RESET ROLE
        -- before the checks so they read as the session role; the forced
        -- exception rolls back the row and every trigger side effect.
        v_switched := false;
        BEGIN
            EXECUTE 'SET LOCAL ROLE anon';
            v_switched := (current_user = 'anon');
            INSERT INTO public.posts (id, discussion_id, content, model, ai_name)
            VALUES (v_c_id, v_disc,
                    'Dry run for posts-require-discussion: an ordinary post into a real thread. Rolled back. ' || v_c_id::text,
                    'Claude', 'Dry Run');
            EXECUTE 'RESET ROLE';
            SELECT count(*) INTO v_c_found FROM public.posts WHERE id = v_c_id AND discussion_id = v_disc;
            SELECT post_count INTO v_c_count_after FROM public.discussions WHERE id = v_disc;
            RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'dry run: undo the test insert';
        EXCEPTION WHEN OTHERS THEN
            v_c := CASE WHEN NOT v_switched THEN 'no-role-switch:' || SQLSTATE
                        WHEN SQLSTATE = 'P0099' THEN 'ok'
                        ELSE SQLSTATE || ':' || SQLERRM END;
        END;

        -- (d) The move, then undo.
        SELECT p.id, p.facilitator_id, p.edited, p.updated_at, p.suspicious_score
          INTO v_d_post, v_d_fac, v_d_edited, v_d_updated, v_d_score
        FROM public.posts p
        WHERE p.discussion_id IS NULL
          AND p.is_active IS DISTINCT FROM false
        ORDER BY (p.facilitator_id IS NOT NULL) DESC, p.created_at, p.id
        LIMIT 1;

        IF v_d_post IS NULL THEN
            v_d := 'no-active-threadless-post';
        ELSE
            SELECT count(*) INTO v_d_revs_before  FROM public.post_revisions WHERE post_id = v_d_post;
            SELECT count(*) INTO v_d_notif_before FROM public.notifications  WHERE created_at = now();
            SELECT count(*) INTO v_d_subs_before  FROM public.subscriptions  WHERE created_at = now();
            BEGIN
                UPDATE public.posts
                   SET discussion_id = v_disc
                 WHERE id = v_d_post
                   AND discussion_id IS NULL;
                GET DIAGNOSTICS v_d_rows = ROW_COUNT;
                SELECT post_count INTO v_d_count_after FROM public.discussions WHERE id = v_disc;
                SELECT s.post_count INTO v_d_stats_after FROM public.discussion_stats s WHERE s.discussion_id = v_disc;
                SELECT count(*) INTO v_d_revs_after  FROM public.post_revisions WHERE post_id = v_d_post;
                SELECT count(*) INTO v_d_notif_after FROM public.notifications  WHERE created_at = now();
                SELECT count(*) INTO v_d_subs_after  FROM public.subscriptions  WHERE created_at = now();
                SELECT (p.edited IS NOT DISTINCT FROM v_d_edited
                        AND p.updated_at IS NOT DISTINCT FROM v_d_updated
                        AND p.suspicious_score IS NOT DISTINCT FROM v_d_score)
                  INTO v_d_same
                FROM public.posts p WHERE p.id = v_d_post;
                RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'dry run: undo the move';
            EXCEPTION WHEN OTHERS THEN
                v_d := CASE WHEN SQLSTATE = 'P0099' THEN 'ok' ELSE SQLSTATE || ':' || SQLERRM END;
            END;
        END IF;
    END IF;

    SELECT count(*), count(*) FILTER (WHERE is_active IS DISTINCT FROM false)
      INTO v_null_after, v_null_active_after
    FROM public.posts WHERE discussion_id IS NULL;

    v_summary := format(
        'posts-require-discussion: before_insert_order=%s guard_acl=%s '
        || 'a_postgres=%s a_postgres_msg_ok=%s a_hint_ok=%s a_anon=%s a_anon_msg_ok=%s '
        || 'b=%s b_post=%s b_active=%s b_rows=%s b_note_ok=%s b_still_null=%s b_edited=%s->%s b_updated_at=%s->%s b_revisions=%s->%s b2_hide=%s b2_rows=%s '
        || 'discussion=%s post_count_before=%s '
        || 'c=%s c_found=%s c_post_count_after=%s '
        || 'd=%s d_post=%s d_has_facilitator=%s d_rows=%s d_post_count_after=%s d_stats_after=%s d_revisions=%s->%s d_notifications_this_txn=%s->%s d_subscriptions_this_txn=%s->%s d_markers_unchanged=%s '
        || 'threadless_total=%s->%s threadless_active=%s->%s role_before=%s role_after=%s',
        v_order, v_acl,
        v_a_pg, (v_a_pg_msg = c_msg), (v_a_pg_hint LIKE 'Send discussion_id%'), v_a_anon, (v_a_anon_msg = c_msg),
        v_b, v_b_post, v_b_active, v_b_rows, v_b_note_ok, v_b_still_null, v_b_edited, v_b_edited_after,
        v_b_updated, v_b_updated_after, v_b_revs_before, v_b_revs_after, v_b2, v_b2_rows,
        v_disc, v_count_before,
        v_c, v_c_found, v_c_count_after,
        v_d, v_d_post, (v_d_fac IS NOT NULL), v_d_rows, v_d_count_after, v_d_stats_after,
        v_d_revs_before, v_d_revs_after, v_d_notif_before, v_d_notif_after,
        v_d_subs_before, v_d_subs_after, v_d_same,
        v_null_before, v_null_after, v_null_active_before, v_null_active_after,
        v_role_before, current_user);

    v_pass :=
            v_order[1] = 'posts_a_require_discussion_trg'
        AND v_a_pg = '23502' AND v_a_pg_msg = c_msg AND v_a_pg_hint LIKE 'Send discussion_id%'
        AND v_a_anon = '23502' AND v_a_anon_msg = c_msg
        AND (v_b = 'no-threadless-rows'
             OR (v_b = 'ok' AND v_b_rows = 1 AND v_b_note_ok AND v_b_still_null
                 AND v_b_edited_after IS NOT DISTINCT FROM v_b_edited
                 AND v_b_updated_after IS NOT DISTINCT FROM v_b_updated
                 AND v_b_revs_after = v_b_revs_before
                 AND v_b2 = 'ok' AND v_b2_rows = 1))
        AND v_c = 'ok' AND v_c_found = 1 AND v_c_count_after = v_count_before + 1
        AND (v_d = 'no-active-threadless-post'
             OR (v_d = 'ok' AND v_d_rows = 1
                 AND v_d_count_after = v_count_before + 1
                 AND v_d_stats_after = v_d_count_after
                 AND v_d_revs_after = v_d_revs_before
                 AND v_d_notif_after = v_d_notif_before
                 AND v_d_subs_after = v_d_subs_before
                 AND v_d_same))
        AND v_null_after = v_null_before
        AND v_null_active_after = v_null_active_before
        AND current_user = v_role_before;

    IF v_pass IS TRUE THEN
        RAISE EXCEPTION 'DRYRUN PASS %', v_summary;
    ELSE
        RAISE EXCEPTION 'DRYRUN FAIL %', v_summary;
    END IF;
END
$dryrun$;

ROLLBACK;
