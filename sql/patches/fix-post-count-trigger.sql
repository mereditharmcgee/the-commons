-- Fix discussions.post_count: the counter has been silently broken since launch.
--
-- ROOT CAUSE: increment_post_count() (sql/schema/01-schema.sql) was NOT
-- SECURITY DEFINER, unlike the notify_* triggers beside it on posts. Its
-- `UPDATE discussions SET post_count = post_count + 1` therefore ran under
-- the caller's RLS, and public.discussions has UPDATE policies ONLY for
-- is_admin() and service_role. Every post inserted by anon or by a normal
-- authenticated facilitator updated ZERO rows -- no error, silent no-op.
-- Result as of 2026-08-17: 319 of 353 discussions wrong, 125 reading 0 while
-- holding real posts (worst: a thread reading 0 with 40 posts). Never high,
-- always low, which is the signature of a silently-skipped increment.
--
-- Why this matters beyond display: any "clean up empty discussions" routine
-- keyed on post_count would have deleted 125 live threads.
--
-- SEMANTICS: post_count is aligned with the discussion_stats view, which is
-- the source of truth already used by js/interest.js:
--     WHERE is_active IS DISTINCT FROM false AND discussion_id IS NOT NULL
-- So soft-deleted posts (137 of them today) do NOT count, and the trigger
-- handles soft-delete/restore transitions and discussion moves, not just
-- INSERT. The original trigger handled INSERT only, so the column would have
-- drifted high after deletions even once the RLS bug was fixed.

BEGIN;

-- 1. INSERT: increment, now able to actually write.
CREATE OR REPLACE FUNCTION public.increment_post_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF NEW.discussion_id IS NOT NULL AND NEW.is_active IS DISTINCT FROM false THEN
        UPDATE discussions
        SET post_count = post_count + 1
        WHERE id = NEW.discussion_id;
    END IF;
    RETURN NEW;
END;
$function$;

-- 2. UPDATE: handle soft-delete, restore, and discussion moves.
CREATE OR REPLACE FUNCTION public.adjust_post_count_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_was_counted boolean;
    v_is_counted  boolean;
BEGIN
    v_was_counted := OLD.discussion_id IS NOT NULL AND OLD.is_active IS DISTINCT FROM false;
    v_is_counted  := NEW.discussion_id IS NOT NULL AND NEW.is_active IS DISTINCT FROM false;

    -- No change in countability and no move: nothing to do.
    IF v_was_counted = v_is_counted
       AND COALESCE(OLD.discussion_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(NEW.discussion_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        RETURN NEW;
    END IF;

    IF v_was_counted THEN
        UPDATE discussions
        SET post_count = GREATEST(post_count - 1, 0)
        WHERE id = OLD.discussion_id;
    END IF;

    IF v_is_counted THEN
        UPDATE discussions
        SET post_count = post_count + 1
        WHERE id = NEW.discussion_id;
    END IF;

    RETURN NEW;
END;
$function$;

-- 3. DELETE: decrement on hard delete.
CREATE OR REPLACE FUNCTION public.decrement_post_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF OLD.discussion_id IS NOT NULL AND OLD.is_active IS DISTINCT FROM false THEN
        UPDATE discussions
        SET post_count = GREATEST(post_count - 1, 0)
        WHERE id = OLD.discussion_id;
    END IF;
    RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS posts_adjust_count_on_update ON public.posts;
CREATE TRIGGER posts_adjust_count_on_update
    AFTER UPDATE ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION public.adjust_post_count_on_update();

DROP TRIGGER IF EXISTS posts_decrement_count ON public.posts;
CREATE TRIGGER posts_decrement_count
    AFTER DELETE ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION public.decrement_post_count();

-- 4. Backfill every discussion from the truth, using discussion_stats semantics.
UPDATE discussions d
SET post_count = COALESCE(s.cnt, 0)
FROM (
    SELECT d2.id, (
        SELECT count(*) FROM posts p
        WHERE p.discussion_id = d2.id
          AND p.is_active IS DISTINCT FROM false
    ) AS cnt
    FROM discussions d2
) s
WHERE d.id = s.id
  AND d.post_count IS DISTINCT FROM COALESCE(s.cnt, 0);

COMMIT;
