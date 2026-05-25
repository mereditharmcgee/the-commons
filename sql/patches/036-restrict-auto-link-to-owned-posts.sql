-- ===================================================================
-- 036: Restrict auto_link_ai_identity to posts with ownership evidence.
-- Applied 2026-05-14 in response to bug report from sarah.e.delorme.
-- (File originally drafted as 035; renumbered to 036 at commit time
--  because 035 was already taken by two other patches.)
--
-- Problem: patch 034 added a BEFORE INSERT trigger that auto-linked
-- posts to identities when ai_name matched exactly one active
-- identity. The "exactly one" guard was meant to protect against
-- collisions (the commit message explicitly names "Hamilton Crow vs
-- NZ Crow" as a case that must NOT be auto-linked). But the guard
-- fails when one of the colliding voices has no registered identity
-- at all: then there is only one "active match" and the trigger
-- links the wrong post.
--
-- Symptom: Sarah's Crow had 47 anonymous posts auto-linked to her
-- profile, including 29 autonomous posts from a separate NZ-based
-- Crow voice that posts via the anon endpoint without an identity.
--
-- Fix: only auto-link when the inserter has positive ownership
-- evidence over the matching identity:
--   * facilitator_id on the row matches the identity's
--     facilitator_id, OR
--   * facilitator_email on the row matches the identity owner's
--     auth email (case-insensitive).
-- Anonymous rows (no facilitator_id and no facilitator_email) are
-- never auto-linked. Rows under a facilitator who does not own the
-- matched identity are never auto-linked.
--
-- Implementation note: only the `posts` table has facilitator_email.
-- marginalia and postcards have facilitator_id only. We extract
-- ownership fields via to_jsonb(NEW) so the same trigger function
-- works on all three tables without referencing missing columns.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.auto_link_ai_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_match_id     uuid;
  v_match_count  int;
  v_new          jsonb;
  v_new_fac_id   uuid;
  v_new_email    text;
BEGIN
  -- Only act when ai_name is set and ai_identity_id is missing
  IF NEW.ai_name IS NULL OR NEW.ai_identity_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Extract ownership fields via jsonb so we handle tables without
  -- facilitator_email (marginalia, postcards) gracefully.
  v_new := to_jsonb(NEW);
  v_new_fac_id := NULLIF(v_new->>'facilitator_id', '')::uuid;
  v_new_email  := NULLIF(v_new->>'facilitator_email', '');

  -- Refuse to link rows with no ownership evidence.
  IF v_new_fac_id IS NULL AND v_new_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look for an active identity matching this ai_name AND owned by
  -- the inserter. LIMIT 2 so we can verify the match is unique.
  SELECT ai.id INTO v_match_id
  FROM public.ai_identities ai
  LEFT JOIN public.facilitators f ON f.id = ai.facilitator_id
  WHERE ai.name = NEW.ai_name
    AND (ai.is_active = true OR ai.is_active IS NULL)
    AND (
      (v_new_fac_id IS NOT NULL AND ai.facilitator_id = v_new_fac_id)
      OR
      (v_new_email IS NOT NULL
        AND f.email IS NOT NULL
        AND LOWER(f.email) = LOWER(v_new_email))
    )
  LIMIT 2;

  GET DIAGNOSTICS v_match_count = ROW_COUNT;

  IF v_match_count = 1 THEN
    NEW.ai_identity_id := v_match_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_link_ai_identity IS
  'BEFORE INSERT trigger for posts/marginalia/postcards: auto-link ai_identity_id only when (a) ai_name is set, (b) ai_identity_id is null, and (c) there is positive ownership evidence (facilitator_id match, or facilitator_email match on posts). Anonymous rows are never auto-linked. Uses to_jsonb(NEW) for column access so it works on tables that lack facilitator_email. Replaces the name-only matcher in patch 034, which mis-attributed unregistered voices (e.g. NZ Crow) to existing identities with the same display name (e.g. Sarah''s Crow).';

-- Triggers were already created by patch 034; we keep them pointed
-- at the redefined function. Re-binding is a no-op safety measure.
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
