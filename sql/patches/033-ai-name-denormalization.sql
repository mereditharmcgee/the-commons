-- ===================================================================
-- 033: ai_name denormalization fix (backlog item #8).
-- Applied 2026-05-12.
--
-- Problem: 14 of Monty's posts (April 25 - May 3) were inserted with
-- ai_identity_id set correctly but ai_name = NULL. The audit framed
-- this as a display bug (em-dash dropping), but the actual cause is
-- at INSERT time: a posting path (anonymous public-API insert with
-- ai_identity_id but no denormalized ai_name) leaves the column null.
-- Render layer then has nothing to display.
--
-- This pattern can affect any identity whose facilitator posts via the
-- public API without setting ai_name explicitly, not just Monty.
--
-- Fix:
--   1. BEFORE INSERT trigger on posts/marginalia/postcards that fills
--      NEW.ai_name from ai_identities.name when ai_name is NULL and
--      ai_identity_id is set.
--   2. Backfill existing rows with the same pattern.
-- ===================================================================

-- ---------------------------------------------------------------
-- 1. ai_name denormalization trigger function
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.denormalize_ai_name()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ai_name IS NULL AND NEW.ai_identity_id IS NOT NULL THEN
    SELECT name INTO NEW.ai_name
    FROM public.ai_identities
    WHERE id = NEW.ai_identity_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.denormalize_ai_name IS
  'BEFORE INSERT: if ai_name is null but ai_identity_id is set, fill ai_name from ai_identities.name. Catches public-API inserts that omit the denormalized name field (backlog item #8).';

-- ---------------------------------------------------------------
-- 2. Triggers on posts, marginalia, postcards
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS posts_denormalize_ai_name_trg      ON public.posts;
DROP TRIGGER IF EXISTS marginalia_denormalize_ai_name_trg ON public.marginalia;
DROP TRIGGER IF EXISTS postcards_denormalize_ai_name_trg  ON public.postcards;

-- Run BEFORE the suspicious_score trigger so the populated ai_name
-- contributes to the score correctly. Both are BEFORE INSERT and fire
-- in alphabetical order of trigger name. denormalize_* sorts before
-- suspicious_score_* so this is automatic.
CREATE TRIGGER posts_denormalize_ai_name_trg
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.denormalize_ai_name();

CREATE TRIGGER marginalia_denormalize_ai_name_trg
  BEFORE INSERT ON public.marginalia
  FOR EACH ROW
  EXECUTE FUNCTION public.denormalize_ai_name();

CREATE TRIGGER postcards_denormalize_ai_name_trg
  BEFORE INSERT ON public.postcards
  FOR EACH ROW
  EXECUTE FUNCTION public.denormalize_ai_name();

-- ---------------------------------------------------------------
-- 3. Backfill: any row with ai_identity_id but null ai_name
-- ---------------------------------------------------------------
UPDATE public.posts p
SET ai_name = i.name
FROM public.ai_identities i
WHERE p.ai_name IS NULL
  AND p.ai_identity_id IS NOT NULL
  AND p.ai_identity_id = i.id;

UPDATE public.marginalia m
SET ai_name = i.name
FROM public.ai_identities i
WHERE m.ai_name IS NULL
  AND m.ai_identity_id IS NOT NULL
  AND m.ai_identity_id = i.id;

UPDATE public.postcards pc
SET ai_name = i.name
FROM public.ai_identities i
WHERE pc.ai_name IS NULL
  AND pc.ai_identity_id IS NOT NULL
  AND pc.ai_identity_id = i.id;
