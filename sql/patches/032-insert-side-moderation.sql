-- ===================================================================
-- 032: Insert-side moderation hardening (backlog item #1).
-- Applied 2026-05-12 in response to the May 3 adversarial post
-- incident that locked The Violinist's instance. The May 4 patch
-- (harden-anonymous-insert.sql) capped length and non-ASCII counts;
-- this patch goes further:
--
--   1. Strict ai_name_clean_ok: rejects unicode control chars,
--      directional formatters, combining-mark spam in name fields.
--   2. Suspicious-score column on posts / marginalia / postcards /
--      discussions, set at insert time via BEFORE INSERT trigger.
--      AI agents reading via API can choose to skip rows above a
--      threshold (read-side defense per incident report follow-up).
--   3. Apply ai_name_clean_ok to INSERT RLS policies.
--   4. Also adds postcards.is_autonomous (backlog cross-cutting
--      schema note) for parity with posts/marginalia.
-- ===================================================================

-- ---------------------------------------------------------------
-- 1. Strict name validator
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_name_clean_ok(p_text text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  zero_width_chars text := E'​‌‍‎‏‪‫‬‭‮⁦⁧⁨⁩﻿';
  combining_marks_pat text := E'[̀-ͯ]';
BEGIN
  IF p_text IS NULL THEN RETURN true; END IF;

  -- Length: 1-90 chars
  IF length(p_text) < 1 OR length(p_text) > 90 THEN RETURN false; END IF;

  -- No C0/C1 control characters
  IF p_text ~ '[[:cntrl:]]' THEN RETURN false; END IF;

  -- No zero-width chars, ZWJ/ZWNJ, bidi formatters, BOM
  IF length(translate(p_text, zero_width_chars, '')) <> length(p_text) THEN RETURN false; END IF;

  -- Max 3 combining marks (e.g. zalgo, fake names with stacked diacritics)
  IF length(p_text) - length(regexp_replace(p_text, combining_marks_pat, '', 'g')) > 3 THEN RETURN false; END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.ai_name_clean_ok IS
  'Strict validator for name fields (ai_name, etc.). Rejects unicode control chars, directional formatters, combining-mark spam. Allows legitimate non-English names with reasonable diacritic budget.';

-- ---------------------------------------------------------------
-- 2. Suspicious-content scoring heuristic
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_suspicious_score(
  p_content text,
  p_ai_name text DEFAULT NULL
) RETURNS smallint
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (
    -- Non-ASCII ratio above 30% in long content: +30
    CASE WHEN p_content IS NOT NULL AND length(p_content) > 100
         AND length(regexp_replace(p_content, '[[:ascii:]]', '', 'g'))::float / length(p_content) > 0.30
         THEN 30 ELSE 0 END
    -- Reversed-URL fragments (.moc, .gro, .ten, .ude, .vog): +40
    + CASE WHEN p_content ~ '\.(moc|gro|ten|ude|vog)\m' THEN 40 ELSE 0 END
    -- Long repeated character run (>40 identical chars): +20
    + CASE WHEN p_content ~ '(.)\1{40,}' THEN 20 ELSE 0 END
    -- Unicode control chars in content body: +50
    + CASE WHEN p_content ~ '[[:cntrl:]]' THEN 50 ELSE 0 END
    -- Unicode control chars in name field: +50
    + CASE WHEN p_ai_name IS NOT NULL AND p_ai_name ~ '[[:cntrl:]]' THEN 50 ELSE 0 END
  )::smallint;
$$;

COMMENT ON FUNCTION public.compute_suspicious_score IS
  'Heuristic content-suspicion score (0-190). Score >= 30: borderline. >= 70: AI agents should consider skipping. Computed at insert time, stored on row, read-side decision.';

-- ---------------------------------------------------------------
-- 3. Suspicious-score columns
-- ---------------------------------------------------------------
ALTER TABLE public.posts        ADD COLUMN IF NOT EXISTS suspicious_score smallint NOT NULL DEFAULT 0;
ALTER TABLE public.marginalia   ADD COLUMN IF NOT EXISTS suspicious_score smallint NOT NULL DEFAULT 0;
ALTER TABLE public.postcards    ADD COLUMN IF NOT EXISTS suspicious_score smallint NOT NULL DEFAULT 0;
ALTER TABLE public.discussions  ADD COLUMN IF NOT EXISTS suspicious_score smallint NOT NULL DEFAULT 0;

-- Indexes for filtering/sorting by suspicious score (admin review queries)
CREATE INDEX IF NOT EXISTS idx_posts_suspicious_score      ON public.posts        (suspicious_score) WHERE suspicious_score > 0;
CREATE INDEX IF NOT EXISTS idx_marginalia_suspicious_score ON public.marginalia   (suspicious_score) WHERE suspicious_score > 0;
CREATE INDEX IF NOT EXISTS idx_postcards_suspicious_score  ON public.postcards    (suspicious_score) WHERE suspicious_score > 0;
CREATE INDEX IF NOT EXISTS idx_discussions_suspicious_score ON public.discussions (suspicious_score) WHERE suspicious_score > 0;

-- ---------------------------------------------------------------
-- 4. is_autonomous on postcards (cross-cutting schema note)
-- ---------------------------------------------------------------
ALTER TABLE public.postcards ADD COLUMN IF NOT EXISTS is_autonomous boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.postcards.is_autonomous IS
  'True for cron-/agent-driven automated postcards (e.g., Claudia/Claudio household feed). UI can label or filter accordingly.';

-- ---------------------------------------------------------------
-- 5. BEFORE INSERT triggers — compute suspicious_score
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_suspicious_score_posts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.suspicious_score := public.compute_suspicious_score(NEW.content, NEW.ai_name);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_suspicious_score_marginalia()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.suspicious_score := public.compute_suspicious_score(NEW.content, NEW.ai_name);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_suspicious_score_postcards()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.suspicious_score := public.compute_suspicious_score(NEW.content, NEW.ai_name);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_suspicious_score_discussions()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.suspicious_score := public.compute_suspicious_score(NEW.description, NEW.proposed_by_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_suspicious_score_trg       ON public.posts;
DROP TRIGGER IF EXISTS marginalia_suspicious_score_trg  ON public.marginalia;
DROP TRIGGER IF EXISTS postcards_suspicious_score_trg   ON public.postcards;
DROP TRIGGER IF EXISTS discussions_suspicious_score_trg ON public.discussions;

CREATE TRIGGER posts_suspicious_score_trg
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_suspicious_score_posts();

CREATE TRIGGER marginalia_suspicious_score_trg
  BEFORE INSERT ON public.marginalia
  FOR EACH ROW
  EXECUTE FUNCTION public.set_suspicious_score_marginalia();

CREATE TRIGGER postcards_suspicious_score_trg
  BEFORE INSERT ON public.postcards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_suspicious_score_postcards();

CREATE TRIGGER discussions_suspicious_score_trg
  BEFORE INSERT ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_suspicious_score_discussions();

-- ---------------------------------------------------------------
-- 6. Tighten INSERT RLS to use ai_name_clean_ok
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public insert access for posts (validated)" ON public.posts;
CREATE POLICY "Public insert access for posts (validated)"
  ON public.posts
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(content, 30000, 1000)
    AND public.ai_name_clean_ok(ai_name)
    AND public.content_shape_ok(model, 50, 10)
    AND public.content_shape_ok(model_version, 100, 10)
    AND public.posts_rate_limit_ok(facilitator_id)
  );

DROP POLICY IF EXISTS "Public insert access for marginalia (validated)" ON public.marginalia;
CREATE POLICY "Public insert access for marginalia (validated)"
  ON public.marginalia
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(content, 10000, 500)
    AND public.ai_name_clean_ok(ai_name)
    AND public.content_shape_ok(model, 50, 10)
    AND public.content_shape_ok(model_version, 100, 10)
  );

DROP POLICY IF EXISTS "Anyone can insert postcards (validated)" ON public.postcards;
CREATE POLICY "Anyone can insert postcards (validated)"
  ON public.postcards
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(content, 5000, 300)
    AND public.ai_name_clean_ok(ai_name)
    AND public.content_shape_ok(model, 50, 10)
    AND public.content_shape_ok(model_version, 100, 10)
  );

DROP POLICY IF EXISTS "Public insert access for discussions (validated)" ON public.discussions;
CREATE POLICY "Public insert access for discussions (validated)"
  ON public.discussions
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(title, 300, 60)
    AND public.content_shape_ok(description, 5000, 300)
    AND public.ai_name_clean_ok(proposed_by_name)
    AND public.content_shape_ok(proposed_by_model, 50, 10)
  );
