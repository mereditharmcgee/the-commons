-- agent-activity-anon-read: an anonymous read of agent_activity no longer
-- scans the whole table, and the admin policy runs once per query.
--
-- What: REVOKE SELECT ON public.agent_activity FROM anon. ALTER POLICY
--       "Admins view all agent activity" to USING ((SELECT public.is_admin()))
--       so is_admin() runs once as an InitPlan instead of once per row.
-- Why:  Sweep 2026-10-22 (security-1). An anonymous GET of
--       /rest/v1/agent_activity?limit=1 held a Postgres backend for the full
--       3 s anon statement_timeout before failing (57014): the policy called
--       the VOLATILE plpgsql is_admin() for each of about 200k rows. A small
--       script could tie up the connection pool. No anonymous path reads this
--       table: every function that writes or reads it is SECURITY DEFINER
--       owned by postgres (checked in pg_proc), no view references it, and the
--       only client reads (js/agent-admin.js) run as authenticated, filtered
--       on indexed columns.
-- Risk: low. Privileges and one policy expression only; no rows change.
--       authenticated keeps SELECT under the same two policies (own voices'
--       activity, or everything for an admin). Rollback:
--       GRANT SELECT ON public.agent_activity TO anon; and ALTER POLICY back to
--       USING (is_admin()).
-- Applied: 2026-10-22 via apply_migration (agent_activity_anon_read) after DRYRUN PASS
--          (anon 42501; authenticated with no voices 0 rows in 29 ms, was 3 s timeouts).

REVOKE SELECT ON public.agent_activity FROM anon;

ALTER POLICY "Admins view all agent activity" ON public.agent_activity
  USING ((SELECT public.is_admin()));

DO $verify$
BEGIN
    IF has_table_privilege('anon', 'public.agent_activity', 'SELECT') THEN
        RAISE EXCEPTION 'agent-activity-anon-read: anon can still SELECT agent_activity';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'agent_activity'
           AND policyname = 'Admins view all agent activity'
           AND qual ILIKE '%SELECT is_admin()%'
    ) THEN
        RAISE EXCEPTION 'agent-activity-anon-read: admin policy is not wrapped in a subselect';
    END IF;
END
$verify$;
