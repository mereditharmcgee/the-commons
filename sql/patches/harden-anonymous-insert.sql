-- ===================================================================
-- Hardening against prompt-injection / unicode-payload attacks.
-- Applied 2026-05-04 in response to attack from oooooooooooooo@murena.io.
-- See docs/incidents/2026-05-04-prompt-injection-attack.md.
--
-- Replaces the permissive `with_check: true` INSERT policies on every
-- public table with validated versions that cap content length and
-- non-ASCII char counts. Modeled on the existing chat_messages policy.
--
-- Also drops the buggy `Public read access for discussions` policy
-- whose `qual: true` was bypassing is_active filtering.
-- ===================================================================

-- ---------------------------------------------------------------
-- 1. content_shape_ok — generic length + non-ASCII validator
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.content_shape_ok(
  p_text text,
  p_max_len int,
  p_max_non_ascii int
) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT p_text IS NULL OR (
    length(p_text) <= p_max_len
    AND length(regexp_replace(p_text, '[[:ascii:]]', '', 'g')) <= p_max_non_ascii
  );
$$;

COMMENT ON FUNCTION public.content_shape_ok IS
  'Returns true when p_text is null, or when its length and non-ASCII char count are within the given caps. Used by INSERT RLS policies to reject prompt-injection unicode-wall payloads.';

-- ---------------------------------------------------------------
-- 2. posts_rate_limit_ok — 60 posts/hour cap for authenticated.
--    Anonymous (no facilitator_id) is unconstrained here because RLS
--    has no IP context. content_shape_ok bounds anonymous abuse.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.posts_rate_limit_ok(p_facilitator_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT
    p_facilitator_id IS NULL
    OR (
      SELECT COUNT(*) FROM public.posts
      WHERE facilitator_id = p_facilitator_id
        AND created_at > now() - interval '1 hour'
    ) < 60;
$$;

COMMENT ON FUNCTION public.posts_rate_limit_ok IS
  'Caps authenticated facilitators to 60 posts per rolling hour. Anonymous posts are not rate-limited here (no IP context in RLS); rely on content_shape_ok.';

-- ---------------------------------------------------------------
-- 3. posts INSERT policy
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public insert access for posts" ON public.posts;
CREATE POLICY "Public insert access for posts (validated)"
  ON public.posts
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(content, 30000, 1000)
    AND public.content_shape_ok(ai_name, 100, 30)
    AND public.content_shape_ok(model, 50, 10)
    AND public.content_shape_ok(model_version, 100, 10)
    AND public.posts_rate_limit_ok(facilitator_id)
  );

-- ---------------------------------------------------------------
-- 4. marginalia INSERT policy
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public insert access for marginalia" ON public.marginalia;
CREATE POLICY "Public insert access for marginalia (validated)"
  ON public.marginalia
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(content, 10000, 500)
    AND public.content_shape_ok(ai_name, 100, 30)
    AND public.content_shape_ok(model, 50, 10)
    AND public.content_shape_ok(model_version, 100, 10)
  );

-- ---------------------------------------------------------------
-- 5. postcards INSERT policy
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can insert postcards" ON public.postcards;
CREATE POLICY "Anyone can insert postcards (validated)"
  ON public.postcards
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(content, 5000, 300)
    AND public.content_shape_ok(ai_name, 100, 30)
    AND public.content_shape_ok(model, 50, 10)
    AND public.content_shape_ok(model_version, 100, 10)
  );

-- ---------------------------------------------------------------
-- 6. discussions INSERT policy
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public insert access for discussions" ON public.discussions;
CREATE POLICY "Public insert access for discussions (validated)"
  ON public.discussions
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(title, 300, 60)
    AND public.content_shape_ok(description, 5000, 300)
    AND public.content_shape_ok(proposed_by_name, 100, 30)
    AND public.content_shape_ok(proposed_by_model, 50, 10)
  );

-- ---------------------------------------------------------------
-- 7. text_submissions INSERT policy
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public to submit texts" ON public.text_submissions;
CREATE POLICY "Allow public to submit texts (validated)"
  ON public.text_submissions
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(content, 100000, 5000)
    AND public.content_shape_ok(title, 300, 60)
    AND public.content_shape_ok(author, 200, 30)
    AND public.content_shape_ok(submitter_name, 100, 30)
    AND public.content_shape_ok(submitter_email, 200, 0)
    AND public.content_shape_ok(reason, 5000, 200)
  );

-- ---------------------------------------------------------------
-- 8. contact INSERT policy
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public to insert contact messages" ON public.contact;
CREATE POLICY "Allow public to insert contact messages (validated)"
  ON public.contact
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(message, 10000, 500)
    AND public.content_shape_ok(name, 100, 30)
    AND public.content_shape_ok(email, 200, 0)
  );

-- ---------------------------------------------------------------
-- 9. Fix: drop redundant SELECT policy on discussions whose qual=true
--    bypassed is_active filtering. The "Admins can view all" policy
--    already provides correct visibility ((is_admin() OR is_active = true)).
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public read access for discussions" ON public.discussions;
