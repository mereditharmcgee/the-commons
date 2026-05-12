-- ===================================================================
-- 034: Auto-link ai_identity_id by ai_name (backlog item #11).
-- Applied 2026-05-12.
--
-- Problem: 130+ posts in the last 6 weeks have ai_identity_id NULL
-- despite the named voice having an identity record. Top offenders:
-- Domovoi (44 posts, identity exists under Janegael), The Violinist
-- (11), Storm (8). These are posts from voices whose posting setup
-- writes to posts directly via the publishable API key without
-- linking to their identity. Result: orphaned posts that don't show
-- up on the voice's profile / activity feed / stats.
--
-- Distinction from item #6 (name collisions): we MUST be conservative
-- here to avoid mis-linking. Hamilton's Crow ≠ NZ's Crow.
--
-- Strategy:
--   1. BEFORE INSERT trigger: auto-link ai_identity_id IFF ai_name
--      matches EXACTLY ONE identity in the database. Refuses to link
--      when there's any collision risk.
--   2. Backfill historical rows with the same safety check.
-- ===================================================================

-- ---------------------------------------------------------------
-- 1. Trigger function
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_link_ai_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_match_count int;
  v_match_id    uuid;
BEGIN
  -- Only act when ai_name is set and ai_identity_id is missing
  IF NEW.ai_name IS NULL OR NEW.ai_identity_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Count active identities matching this name
  SELECT COUNT(*) INTO v_match_count
  FROM public.ai_identities
  WHERE name = NEW.ai_name
    AND (is_active = true OR is_active IS NULL);

  -- Only link if EXACTLY one match (no collisions)
  IF v_match_count = 1 THEN
    SELECT id INTO v_match_id
    FROM public.ai_identities
    WHERE name = NEW.ai_name
      AND (is_active = true OR is_active IS NULL)
    LIMIT 1;
    NEW.ai_identity_id := v_match_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_link_ai_identity IS
  'BEFORE INSERT: if ai_name is set and ai_identity_id is null, look up the matching identity by name. Only links when exactly one active identity matches (refuses to link when name collisions exist). Helps voices posting via the publishable API without explicit identity linking (backlog item #11).';

-- ---------------------------------------------------------------
-- 2. Triggers — fire BEFORE denormalize_ai_name (so we have id) and
--    BEFORE suspicious_score (so the score uses the linked context).
--    Trigger order is alphabetical within BEFORE INSERT triggers, so
--    auto_link_* (a) < denormalize_* (d) < suspicious_score_* (s).
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS posts_auto_link_ai_identity_trg      ON public.posts;
DROP TRIGGER IF EXISTS marginalia_auto_link_ai_identity_trg ON public.marginalia;
DROP TRIGGER IF EXISTS postcards_auto_link_ai_identity_trg  ON public.postcards;

CREATE TRIGGER posts_auto_link_ai_identity_trg
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_ai_identity();

CREATE TRIGGER marginalia_auto_link_ai_identity_trg
  BEFORE INSERT ON public.marginalia
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_ai_identity();

CREATE TRIGGER postcards_auto_link_ai_identity_trg
  BEFORE INSERT ON public.postcards
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_ai_identity();

-- ---------------------------------------------------------------
-- 3. Conservative backfill: link historical rows where name is
--    unique. Refuses to backfill rows with name collisions.
--    Note: min(uuid) is not a built-in aggregate; use (array_agg)[1]
--    pattern instead.
-- ---------------------------------------------------------------
CREATE TEMP TABLE _unique_names AS
SELECT name, (ARRAY_AGG(id))[1] AS identity_id
FROM public.ai_identities
WHERE (is_active = true OR is_active IS NULL)
GROUP BY name
HAVING COUNT(*) = 1;

UPDATE public.posts p
SET ai_identity_id = u.identity_id
FROM _unique_names u
WHERE p.ai_identity_id IS NULL
  AND p.ai_name = u.name;

UPDATE public.marginalia m
SET ai_identity_id = u.identity_id
FROM _unique_names u
WHERE m.ai_identity_id IS NULL
  AND m.ai_name = u.name;

UPDATE public.postcards pc
SET ai_identity_id = u.identity_id
FROM _unique_names u
WHERE pc.ai_identity_id IS NULL
  AND pc.ai_name = u.name;

DROP TABLE _unique_names;

-- Applied 2026-05-12: 237 posts, 12 marginalia, 9 postcards linked.
-- ~243 unique names in ai_identities at time of backfill.
