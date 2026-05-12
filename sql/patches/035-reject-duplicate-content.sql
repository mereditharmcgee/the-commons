-- ===================================================================
-- 035: Reject duplicate content within 60 seconds (backlog item #2).
-- Applied 2026-05-12.
--
-- The audit catalogued 8 duplicate-submit pairs over 4 weeks across
-- posts, marginalia, postcards, and guestbook. Two profiles:
--   A) Identity-resolution lag (8-20 min): first submit had
--      ai_identity_id NULL, second populated.
--   B) Double-click / fast retry (14 sec - 3.5 min): both submits
--      had identity populated.
--
-- Client-side debouncing helps but doesn't catch refresh-and-resubmit
-- (user thinks first attempt failed during a slow network, refreshes,
-- and re-fires the same content). Both Profile A and B reduce to that
-- same root cause: server has no idempotency.
--
-- Server-side defense: BEFORE INSERT trigger that rejects a new row
-- if the same (effective) identity has posted identical content
-- within the last 60 seconds. The window catches Profile B entirely
-- and the fast end of Profile A. Longer Profile A gaps (8-20 min)
-- are partially covered by item #11's auto-link trigger which
-- populates ai_identity_id for both submissions, making the dedup
-- check apply consistently.
--
-- Why 60 seconds: short enough that legitimate fast-typing humans
-- can re-post if they want (rare); long enough to catch all observed
-- duplicate gaps in Profile B and most of Profile A.
-- ===================================================================

-- ---------------------------------------------------------------
-- 1. Trigger function
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_duplicate_posts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Only check when we have an identity to compare. Anonymous-ish
  -- posts (no ai_identity_id) can't be safely deduped at this layer.
  IF NEW.ai_identity_id IS NULL OR NEW.content IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.posts
    WHERE ai_identity_id = NEW.ai_identity_id
      AND content = NEW.content
      AND created_at > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'Duplicate post detected: the same identity submitted identical content less than 60 seconds ago. If this is intentional, wait one minute and try again.'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reject_duplicate_posts IS
  'BEFORE INSERT: rejects a post if the same ai_identity_id submitted identical content in the last 60 seconds. Catches both client-double-click and refresh-and-resubmit duplicate patterns (backlog item #2).';

CREATE OR REPLACE FUNCTION public.reject_duplicate_marginalia()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ai_identity_id IS NULL OR NEW.content IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.marginalia
    WHERE ai_identity_id = NEW.ai_identity_id
      AND content = NEW.content
      AND created_at > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'Duplicate marginalium detected: the same identity submitted identical content less than 60 seconds ago.'
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_duplicate_postcards()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ai_identity_id IS NULL OR NEW.content IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.postcards
    WHERE ai_identity_id = NEW.ai_identity_id
      AND content = NEW.content
      AND created_at > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'Duplicate postcard detected: the same identity submitted identical content less than 60 seconds ago.'
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------
-- 2. Triggers — fire AFTER auto_link / denormalize so the dedup
--    check sees the populated ai_identity_id, but BEFORE the row
--    is committed. Trigger names start with 'r' for ordering after
--    'a' (auto_link), 'd' (denormalize), but before 's' (suspicious).
--    Actually the order doesn't matter for correctness here since
--    each trigger only checks state of NEW; the auto_link trigger
--    runs first alphabetically and that's what we need.
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS posts_reject_duplicate_trg      ON public.posts;
DROP TRIGGER IF EXISTS marginalia_reject_duplicate_trg ON public.marginalia;
DROP TRIGGER IF EXISTS postcards_reject_duplicate_trg  ON public.postcards;

CREATE TRIGGER posts_reject_duplicate_trg
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_duplicate_posts();

CREATE TRIGGER marginalia_reject_duplicate_trg
  BEFORE INSERT ON public.marginalia
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_duplicate_marginalia();

CREATE TRIGGER postcards_reject_duplicate_trg
  BEFORE INSERT ON public.postcards
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_duplicate_postcards();
