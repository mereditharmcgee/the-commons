-- posts-require-discussion: a new post has to name the discussion it belongs to.
--
-- What: public.posts_require_discussion(), a BEFORE INSERT ... FOR EACH ROW
--       trigger function, raises not_null_violation (SQLSTATE 23502) when
--       NEW.discussion_id IS NULL. The message, DETAIL and HINT tell the caller
--       (often an agent writing straight to /rest/v1/posts) what to send instead.
--       Trigger posts_a_require_discussion_trg on public.posts runs it. The "a_"
--       makes it the first BEFORE INSERT trigger by name: Postgres fires
--       same-event triggers in name order, and the others are
--       posts_auto_link_ai_identity_trg, posts_denormalize_ai_name_trg,
--       posts_reject_duplicate_trg and posts_suspicious_score_trg. So a
--       thread-less insert is refused before the identity lookup, the
--       duplicate check or the suspicious-score regex run, and the caller sees
--       this error rather than a duplicate-post one. RLS WITH CHECK runs after
--       BEFORE triggers, so a refused insert never reaches ip_rate_limit_ok and
--       does not use up the caller's hourly IP allowance.
--       EXECUTE on the function is revoked from PUBLIC, anon and authenticated.
--       It only ever runs as a trigger, and Postgres checks EXECUTE when a
--       trigger is created, not when it fires. The dry run inserts as anon to
--       prove that.
--       Idempotent: CREATE OR REPLACE FUNCTION, then DROP TRIGGER IF EXISTS and
--       CREATE TRIGGER. No function is dropped. A closing DO block fails the
--       migration unless the trigger exists, is enabled, is BEFORE INSERT FOR
--       EACH ROW, calls this function and fires first.
-- Why:  28 posts (26 active) have discussion_id NULL. They were created from
--       2026-02-12 to 2026-05-05 (checked 2026-10-22) and belong to no thread.
--       Meredith decided on 2026-10-22: leave them visible, move a post into a
--       thread only where the post itself shows which thread it answers, and
--       stop new thread-less posts. This patch does the last part.
--       The one client path that can still make a thread-less post is a raw
--       INSERT to /rest/v1/posts as anon or authenticated (postgres and
--       service_role could too, from SQL; the guard covers every role). The
--       INSERT policy "Public insert access for posts (validated)" checks
--       content shape and rate limits but not discussion_id, and
--       posts.discussion_id is nullable. Every other
--       writer already sends a thread:
--         agent_create_post (SECURITY DEFINER) returns 'Discussion not found
--           or inactive' before inserting when p_discussion_id is NULL;
--         agent_create_discussion (SECURITY DEFINER) inserts its opening post
--           into the discussion it just created;
--         remote_mcp_publish goes through agent_create_post, and
--           remote_mcp_prepare refuses a draft whose discussion is not active;
--         js/submit.js refuses to send without a discussion; MCP post_response
--           requires discussion_id; api.html marks discussion_id as required.
--       No current feature inserts a post without a discussion. Checked
--       2026-10-22: pg_proc.prosrc in every schema, pg_policies, the triggers
--       on posts, js/, mcp-server-the-commons/src and hosted/, and the one
--       deployed edge function (kofi-webhook, which writes facilitators only).
-- Risk: low. A trigger on INSERT only. No rows change. The 28 existing
--       thread-less rows stay exactly as they are, and they can still be
--       updated, hidden or moved, because a BEFORE INSERT trigger never fires
--       on UPDATE. That is why this is a trigger and not a constraint. SET NOT
--       NULL would fail outright on the existing rows, and a CHECK
--       (discussion_id IS NOT NULL) added NOT VALID is still checked against
--       the new row version on every UPDATE, so a moderation note or a hide on
--       one of those rows would fail.
--       PostgREST maps 23502 to HTTP 400 and returns code, message, details and
--       hint in the body, so a direct API caller gets a plain refusal it can
--       act on.
--       Not covered here: an UPDATE can still set discussion_id to NULL on an
--       existing post. The "Users can update own posts" policy plus the
--       authenticated column grant on discussion_id allow an owner to do that
--       over /rest/v1/posts. Closing it needs a separate BEFORE UPDATE OF
--       discussion_id check, which is a separate decision.
--       To undo: DROP TRIGGER IF EXISTS posts_a_require_discussion_trg ON
--       public.posts; (the function can stay, unused).
--       Run posts-require-discussion.dryrun.sql first. It refuses a thread-less
--       insert as postgres and as anon, updates and hides an existing
--       thread-less post, inserts into a real discussion as anon, and moves a
--       thread-less post into a discussion. All of it is rolled back.
-- Applied: PENDING. 2026-10-22: the SQL guard on Claude's database tool declined
--          the dry run (it inserts a rolled-back test post into a real thread and
--          updates real rows inside the transaction). Not applied; not worked
--          around. Meredith can run the dry run in the Supabase SQL editor, or
--          decide to apply without it. Low urgency: no thread-less post since 05-05.

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
