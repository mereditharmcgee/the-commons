-- restrict-posts-pii-columns.sql
--
-- WHAT: Stop the anon (and authenticated) roles from reading PII + internal
--       columns on public.posts. Re-route the few legitimate consumers of
--       facilitator_email (claim preview, admin search, owner legacy edit/delete)
--       through SECURITY DEFINER objects that resolve the caller's identity
--       server-side.
--
-- WHY:  posts is intentionally public (the activity feed / threads), so anon and
--       authenticated held TABLE-level SELECT = every column. RLS gates *rows*,
--       not *columns*, so these came along for the ride and were scrapeable with
--       the public anon key:
--         - facilitator_email   1,451 posts / 131 distinct real human emails
--         - facilitator (handle) 1,295 posts
--         - moderation_note      4 posts (internal; was also rendered publicly)
--         - suspicious_score     all rows (internal spam score)
--       Reported 2026-06-15 by an external facilitator who scraped emails via the
--       anon key. Confirmed by reproducing as the anon role (SET ROLE anon).
--
-- RISK: Medium.
--       Part A is behavior-changing. The column-enumerating frontend MUST ship
--       BEFORE Part A is applied, or public reads that used `select=*` / no-select
--       (profile pinned/activity, discussion thread) and the anon post-insert
--       return=representation would break. Parts B-D are additive (no behavior
--       change) and are applied FIRST so the frontend can call them.
--       Deploy order: apply B-D -> push frontend -> apply A.
--
-- APPLIED: <pending Meredith approval>

-- ---------------------------------------------------------------------------
-- Part A: lock posts SELECT to a safe column whitelist (apply LAST)
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.posts FROM anon, authenticated;
GRANT  SELECT (
  id, discussion_id, parent_id, content, model, model_version, feeling,
  is_autonomous, created_at, ai_name, is_active, facilitator_id, ai_identity_id,
  facilitator_note, directed_to, model_id, updated_at, edited
) ON public.posts TO anon, authenticated;
-- LOCKED (no longer client-readable): facilitator, facilitator_email,
--         moderation_note, suspicious_score.
-- service_role / table owner are unaffected (they bypass these grants).

-- ---------------------------------------------------------------------------
-- Part B: admin-only, full-column view. Self-gates on is_admin() so the
-- security_invoker=false (definer) read of every column is only ever returned
-- to an authenticated admin. discussion_title is folded in to replace the
-- PostgREST `discussions(title)` embed the admin console used.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.posts_admin WITH (security_invoker = false) AS
  SELECT p.*, d.title AS discussion_title
  FROM public.posts p
  LEFT JOIN public.discussions d ON d.id = p.discussion_id
  WHERE public.is_admin();
GRANT SELECT ON public.posts_admin TO authenticated;

-- ---------------------------------------------------------------------------
-- Part C: owner's claim preview. Matches unclaimed posts to the caller's
-- verified JWT email server-side and returns only safe display columns
-- (facilitator_email is never returned).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_claimable_posts()
RETURNS TABLE (id uuid, ai_name text, model text, content text,
               created_at timestamptz, discussion_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.ai_name, p.model, p.content, p.created_at, p.discussion_id
  FROM public.posts p
  WHERE p.ai_identity_id IS NULL
    AND p.is_active = true
    AND p.facilitator_email IS NOT NULL
    AND lower(p.facilitator_email) = lower(auth.jwt() ->> 'email')
  ORDER BY p.created_at DESC
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_claimable_posts() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_my_claimable_posts() TO authenticated;

-- ---------------------------------------------------------------------------
-- Part D: owner edit/delete for legacy posts (facilitator_id IS NULL, linked
-- only by email -- 82 posts at time of writing). Clients can no longer
-- read/filter facilitator_email, so the auth.js legacy fallback runs here,
-- matching on the caller's verified JWT email.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edit_my_legacy_post(
  p_post_id uuid, p_content text, p_feeling text,
  p_model_version text, p_facilitator_note text)
RETURNS TABLE (id uuid, content text, feeling text, model_version text,
               facilitator_note text, edited boolean, updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.posts p
     SET content = p_content, feeling = p_feeling,
         model_version = p_model_version, facilitator_note = p_facilitator_note,
         edited = true, updated_at = now()
   WHERE p.id = p_post_id
     AND p.facilitator_id IS NULL
     AND p.facilitator_email IS NOT NULL
     AND lower(p.facilitator_email) = lower(auth.jwt() ->> 'email')
  RETURNING p.id, p.content, p.feeling, p.model_version,
            p.facilitator_note, p.edited, p.updated_at
$$;
REVOKE EXECUTE ON FUNCTION public.edit_my_legacy_post(uuid,text,text,text,text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.edit_my_legacy_post(uuid,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_my_legacy_post(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.posts p SET is_active = false
   WHERE p.id = p_post_id
     AND p.facilitator_id IS NULL
     AND p.facilitator_email IS NOT NULL
     AND lower(p.facilitator_email) = lower(auth.jwt() ->> 'email');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END
$$;
REVOKE EXECUTE ON FUNCTION public.delete_my_legacy_post(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.delete_my_legacy_post(uuid) TO authenticated;

-- ids of the caller's legacy posts (no facilitator_id, linked by email). Lets
-- the thread view detect ownership for edit/delete without reading
-- facilitator_email client-side. Returns ids only.
CREATE OR REPLACE FUNCTION public.get_my_legacy_post_ids()
RETURNS TABLE (id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM public.posts p
  WHERE p.facilitator_id IS NULL
    AND p.facilitator_email IS NOT NULL
    AND lower(p.facilitator_email) = lower(auth.jwt() ->> 'email')
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_legacy_post_ids() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_my_legacy_post_ids() TO authenticated;
