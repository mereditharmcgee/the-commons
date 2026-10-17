-- moments-admin-select: an admin SELECT policy on moments, so the admin News
-- tab can hide a moment, list a hidden one, and restore it.
--
-- What: one new permissive policy, "Admins can view all moments":
--       FOR SELECT TO authenticated USING ((SELECT public.is_admin())).
--       Postgres ORs it with the existing "Anyone can read active moments"
--       (is_active = true), which stays as it is. Nothing else on moments
--       changes: the "Admins can update moments" UPDATE policy, the grants,
--       and admin_manage_news are all left alone. On a replay the ELSE branch
--       re-asserts the same roles and USING clause with ALTER POLICY, so the
--       file converges and never drops anything.
-- Why:  F57 (sweep 2026-10-17). This is the still-open feature-audit-2026-08
--       #33. moments has exactly one SELECT policy, is_active = true.
--       js/admin.js toggleMomentActive -> updateRecord runs
--       .update({ is_active: false }).eq('id', id).select('id'). That UPDATE
--       reads columns (WHERE id, RETURNING id), so Postgres also checks the
--       NEW row against the SELECT policies. A row with is_active = false
--       fails them, Hide errors with 42501 ("new row violates row-level
--       security policy"), and the row stays visible. loadMoments
--       (.select('*')) is filtered by the same policy, so a moment hidden any
--       other way (raw SQL, or admin_manage_news 'deactivate') never appears
--       in the tab and its Show button never renders. Until now raw SQL was
--       the only way to restore one. The sibling tables (posts, discussions,
--       marginalia, postcards) already give admins a read path through
--       is_admin().
-- Risk: low. The change is additive. anon is untouched: the policy is TO
--       authenticated, so anon requests never evaluate it. Every public
--       moments read (Utils.getMoments, Utils.getMoment, news.js) uses the
--       anon key with an explicit is_active=eq.true filter, so a logged-in
--       admin's public pages will not start showing hidden moments. Only
--       js/admin.js reads moments through the session client. No view reads
--       moments. (SELECT is_admin()) runs as an InitPlan, so a logged-in
--       reader costs one admins lookup per query, not one per row. It adds
--       one "multiple permissive policies" performance advisory
--       (authenticated SELECT on moments). Live 2026-10-17: 175 moments,
--       0 hidden, 0 pinned, no triggers.
--       Not included: a 'reactivate' action in admin_manage_news. Once this
--       policy exists, the panel's Show button restores a moment.
-- Applied: 2026-10-17 via mcp apply_migration (moments_admin_select), rolled-back dry run first; dry-run script kept in the session scratchpad.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'moments'
                    AND policyname = 'Admins can view all moments') THEN
    CREATE POLICY "Admins can view all moments" ON public.moments
      FOR SELECT TO authenticated
      USING ((SELECT public.is_admin()));
  ELSE
    ALTER POLICY "Admins can view all moments" ON public.moments
      TO authenticated
      USING ((SELECT public.is_admin()));
  END IF;
END $$;

COMMENT ON POLICY "Admins can view all moments" ON public.moments IS
  'Admins also read hidden (is_active = false) moments. Needed by the admin News tab: Hide is an UPDATE whose new row must pass a SELECT policy, and the tab must list hidden rows so Show can restore them. F57 / feature-audit-2026-08 #33.';
