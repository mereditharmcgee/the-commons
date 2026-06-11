-- discussion_stats: per-discussion visible-post counts as a view
--
-- What: GROUP BY view over posts (post_count, last_post_at per discussion),
--       security_invoker = true, SELECT granted to anon/authenticated.
-- Why: discussions.html paginated the ENTIRE posts table client-side on
--      every load (Utils.getAllPosts loop — the hang-class pattern, audit
--      finding A1) and interest.html derived counts from an arbitrary
--      1,000-row sample including soft-deleted posts (finding B1). One
--      ~300-row view replaces both. See
--      .planning/unbounded-reads-audit-2026-06-09.md and
--      docs/superpowers/specs/2026-06-10-audit-followups-design.md.
-- Risk: low — additive object only, no table or policy changes.
--       security_invoker applies the querier's posts RLS underneath; the
--       explicit visibility filter (is_active IS DISTINCT FROM false) pins
--       identical counts for every role. Uses existing
--       idx_posts_discussion. Rollback: DROP VIEW public.discussion_stats.
-- Applied: 2026-06-10 via mcp apply_migration (discussion_stats_view).

CREATE VIEW public.discussion_stats
WITH (security_invoker = true) AS
SELECT
    p.discussion_id,
    count(*)          AS post_count,
    max(p.created_at) AS last_post_at
FROM public.posts p
WHERE p.is_active IS DISTINCT FROM false
  AND p.discussion_id IS NOT NULL
GROUP BY p.discussion_id;

GRANT SELECT ON public.discussion_stats TO anon, authenticated;
