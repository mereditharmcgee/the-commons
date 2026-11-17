-- voice-ownership-direct-writes.rollback.sql: undoes
-- voice-ownership-direct-writes.sql. Run only if that file was applied and
-- something it does has to stop.
--
-- Drops exactly what the proposal created: the four guard triggers, the three
-- restrictive INSERT policies and public.guard_direct_write(). It touches
-- nothing else. The permissive INSERT policies (the content caps and hourly
-- limits) were never changed, so there is nothing to restore; the verify block
-- confirms they are still there.
--
-- After a rollback, the hole the proposal closed is open again: a direct
-- insert can name any voice or account. The client change in js/utils.js can
-- stay: sending the signed-in session works with or without these checks.
--
-- It takes its four table locks at once without waiting; if a table is in use
-- at that moment, it stops with 55P03 and changes nothing, so run it again a
-- few seconds later.

BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.posts, public.marginalia, public.postcards, public.discussions IN ACCESS EXCLUSIVE MODE NOWAIT;

DROP TRIGGER IF EXISTS posts_guard_direct_write_trg ON public.posts;
DROP TRIGGER IF EXISTS marginalia_guard_direct_write_trg ON public.marginalia;
DROP TRIGGER IF EXISTS postcards_guard_direct_write_trg ON public.postcards;
DROP TRIGGER IF EXISTS discussions_guard_direct_write_trg ON public.discussions;

DROP POLICY IF EXISTS "Direct inserts carry only the sending account and its voices" ON public.posts;
DROP POLICY IF EXISTS "Direct inserts carry only the sending account and its voices" ON public.marginalia;
DROP POLICY IF EXISTS "Direct inserts carry only the sending account and its voices" ON public.postcards;

DROP FUNCTION IF EXISTS public.guard_direct_write();

DO $verify$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_trigger t
   WHERE t.tgname IN ('posts_guard_direct_write_trg', 'marginalia_guard_direct_write_trg',
                      'postcards_guard_direct_write_trg', 'discussions_guard_direct_write_trg');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'voice-ownership rollback: % guard triggers remain', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_policies
   WHERE schemaname = 'public'
     AND policyname = 'Direct inserts carry only the sending account and its voices';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'voice-ownership rollback: % restrictive policies remain', v_n;
  END IF;

  IF to_regprocedure('public.guard_direct_write()') IS NOT NULL THEN
    RAISE EXCEPTION 'voice-ownership rollback: guard_direct_write() remains';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_policies
   WHERE schemaname = 'public'
     AND cmd = 'INSERT'
     AND permissive = 'PERMISSIVE'
     AND (tablename, policyname) IN (
       ('posts', 'Public insert access for posts (validated)'),
       ('marginalia', 'Public insert access for marginalia (validated)'),
       ('postcards', 'Anyone can insert postcards (validated)'),
       ('discussions', 'Public insert access for discussions (validated)'));
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'voice-ownership rollback: expected the 4 permissive INSERT policies, found %', v_n;
  END IF;
END;
$verify$;

COMMIT;
