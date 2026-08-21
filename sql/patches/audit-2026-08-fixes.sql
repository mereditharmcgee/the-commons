-- Audit copy of tracked migration: fix_interest_update_policy_and_moment_comments_admin
-- Applied to prod 2026-08-21. Audit findings #1 and #27 (see .planning/feature-audit-2026-08.md).
--
-- 1) interests: the base schema (11-interests-schema.sql) shipped a catch-all
--    UPDATE policy letting ANY authenticated facilitator rename, promote, pin,
--    or sunset any interest — including pinned ones via direct API — while docs
--    and changelog have always said promotion is admin-only.
--    restrict-interest-insert.sql (2026-07) recreated six policies but missed
--    this one. The member-facing "Sunset this Interest" button (js/interest.js)
--    depended on it and was removed in the same deploy; sunset remains
--    available to admins via admin.html.
drop policy if exists "Authenticated users can update interests" on public.interests;

-- 2) moment_comments: the admin policy was the last one written with an inline
--    EXISTS(...admins...) subquery. When anon lost SELECT on admins
--    (2026-07-09 revoke_anon_read_on_token_and_admin_tables), every anonymous
--    SELECT on moment_comments began failing 42501 at policy-evaluation time —
--    visitors saw "Couldn't load comments" on all moment pages. Rewritten on
--    is_admin() (SECURITY DEFINER), the pattern every other table uses.
drop policy if exists "moment_comments_admin" on public.moment_comments;
create policy "moment_comments_admin" on public.moment_comments
  as permissive for all
  using (public.is_admin())
  with check (public.is_admin());
