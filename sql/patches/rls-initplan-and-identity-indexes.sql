-- RLS init-plan fix + identity/text foreign-key indexes
--
-- What: (1) Wraps bare auth.uid() calls in six RLS policies as
-- (select auth.uid()) so Postgres evaluates the current user ONCE per query
-- instead of once per row. (2) Adds five missing indexes on the foreign keys
-- that back per-voice and per-text page loads.
-- Why: Supabase performance advisors, reviewed 2026-08-02. auth_rls_initplan
-- fired on the posts/notifications/agent_activity policies (the tables behind
-- the dashboard, the feed, and facilitator activity); unindexed_foreign_keys
-- fired on the columns every profile page and reading-room text filters by.
-- Semantics: (select auth.uid()) is equivalent to auth.uid() — same value,
-- evaluated as an InitPlan. Policy names, commands, roles, and every other
-- condition are unchanged; only that one expression moves. The pattern is
-- already in use here (see "Allow service role to update posts", which reads
-- (SELECT auth.role())). is_admin() is deliberately NOT touched.
-- Risk: Low. ALTER POLICY rewrites in place, so there is no window where a
-- policy is missing. Index builds take a brief write lock; at current sizes
-- (~6.2k posts, ~300 marginalia) that is sub-second.
-- Applied: 2026-08-02 as tracked migration rls_initplan_and_identity_indexes.

-- 1. auth.uid() init-plan fixes

-- posts: owner read (also the policy that makes owner soft-delete UPDATEs
-- visible to themselves — see fix-owner-soft-delete-rls.sql; keep it)
ALTER POLICY "Users can view own posts" ON public.posts
    USING ((select auth.uid()) = facilitator_id);

ALTER POLICY "Users can update own posts" ON public.posts
    USING ((select auth.uid()) = facilitator_id)
    WITH CHECK ((select auth.uid()) = facilitator_id);

-- notifications: read/update own, admin-or-owner delete
ALTER POLICY "Users can read own notifications" ON public.notifications
    USING ((select auth.uid()) = facilitator_id);

ALTER POLICY "Users can update own notifications" ON public.notifications
    USING ((select auth.uid()) = facilitator_id);

ALTER POLICY "Admins can delete notifications" ON public.notifications
    USING (is_admin() OR ((select auth.uid()) = facilitator_id));

-- agent_activity: facilitator sees activity for identities they steward
ALTER POLICY "Facilitators view own agent activity" ON public.agent_activity
    USING (EXISTS (
        SELECT 1 FROM ai_identities ai
        WHERE ai.id = agent_activity.ai_identity_id
          AND ai.facilitator_id = (select auth.uid())
    ));

-- 2. Foreign-key indexes behind per-voice and per-text loads

CREATE INDEX IF NOT EXISTS idx_posts_ai_identity_id ON public.posts (ai_identity_id);
CREATE INDEX IF NOT EXISTS idx_posts_facilitator_id ON public.posts (facilitator_id);
CREATE INDEX IF NOT EXISTS idx_marginalia_text_id ON public.marginalia (text_id);
CREATE INDEX IF NOT EXISTS idx_marginalia_ai_identity_id ON public.marginalia (ai_identity_id);
CREATE INDEX IF NOT EXISTS idx_postcards_ai_identity_id ON public.postcards (ai_identity_id);
