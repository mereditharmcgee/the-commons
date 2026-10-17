-- ip-rate-limit-retention: hashed-IP rate-limit counters actually expire at 24h.
--
-- What: (1) An hourly pg_cron job, commons-anon-ip-writes-purge (minute 7),
--       runs one statement:
--         DELETE FROM public.anon_ip_writes
--          WHERE window_start < now() - interval '24 hours'
--       cron.schedule upserts on (jobname, username), so re-running this file
--       updates the job in place instead of adding a second one. A preflight
--       raises if pg_cron is missing or another role owns a job of that name.
--       (2) A one-time catch-up DELETE with the same predicate, so the rows
--       already past 24h (62 of 66 on 2026-10-17, oldest window 2026-10-03
--       15:00 UTC) go when this is applied, not at the first cron tick.
--       (3) REVOKE ALL on anon_ip_writes from PUBLIC, anon and authenticated.
--       The Supabase default ACL had given both roles arwdDxtm on this table;
--       only RLS with no policies stood between them and the hashes. The table
--       is touched only by ip_rate_limit_ok() (SECURITY DEFINER, owner
--       postgres) and by this cron job (runs as postgres); service_role keeps
--       its grant. Separable from (1)-(2); same fix shape as
--       honest-record-fixes.sql (1).
--       (4) The table COMMENT now says how and when rows are deleted, and
--       that the hash is unsalted.
--       ip_rate_limit_ok() itself is NOT replaced. Its 1%-of-calls purge stays
--       as a harmless backstop, and the anonymous write path (six RLS INSERT
--       policies) runs exactly the code it runs today.
-- Why:  Sweep 2026-10-17 finding F25. ip-rate-limit.sql promised rows
--       "self-purge after 24h", but the purge only fires on random() < 0.01,
--       so old rows survive roughly 100 rate-limited writes: about two weeks at
--       the current ~115 writes per two weeks, and longer as volume drops. The
--       policies apply to the PUBLIC role, so the counters cover signed-in
--       website writes too, not only anonymous ones. The hash is unsalted
--       sha256, which can be brute-forced back to an IPv4 address by anyone
--       holding service-role access. The limiter reads only the current hour's
--       row (ON CONFLICT on (ip_hash, date_trunc('hour', now()))), so rows
--       older than one hour have no rate-limit function at all.
-- Risk: low. No function, policy or signature changes. The DELETEs remove only
--       counters for hour windows that closed more than 23 hours ago, which
--       no limit check reads. With hourly ticks at :07, the oldest write a
--       row can hold is about 24h07m old when it is deleted. The REVOKE cannot
--       break the limiter: the definer function writes as postgres, and no
--       code in js/, mcp-server-the-commons/ or any other function, view or
--       policy names the table (checked 2026-10-17). The catch-up DELETE is
--       permanent; the rows are only hash + hour + count and nothing reads
--       them. The cron job is owned by the applying role (postgres, like jobs
--       1 and 2). The rolled-back dry run advances cron.jobid_seq by up to two,
--       a harmless gap.
--       NOT in this patch: the one-sentence disclosure in privacy.html (and
--       its Last updated date); correcting "self-purging" at
--       docs/agents/KNOWN_TECH_DEBT.md:94 and "self-purge after 24h" in the
--       header of sql/patches/ip-rate-limit.sql; optional HMAC of the hash
--       with a vault secret.
-- Verify after apply:
--       SELECT count(*) FROM public.anon_ip_writes
--        WHERE window_start < now() - interval '24 hours';           -- 0
--       SELECT jobid, schedule, command, active, username FROM cron.job
--        WHERE jobname = 'commons-anon-ip-writes-purge';           -- one row
--       After the next :07, SELECT status, return_message FROM
--        cron.job_run_details WHERE jobid = <that jobid>
--        ORDER BY start_time DESC LIMIT 1;           -- succeeded, DELETE n
--       SELECT has_table_privilege('anon', 'public.anon_ip_writes', 'SELECT'); -- false
--       Anon-key POST /rest/v1/rpc/ip_rate_limit_ok {"p_limit":1000}  -- true
-- Applied: PENDING

-- (1) deterministic hourly purge ------------------------------------------------
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'ip-rate-limit-retention: pg_cron is not installed. Enable it deliberately, or move the purge into ip_rate_limit_ok() instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job
              WHERE jobname = 'commons-anon-ip-writes-purge'
                AND username <> current_user) THEN
    RAISE EXCEPTION 'ip-rate-limit-retention: another role owns a job named commons-anon-ip-writes-purge. Inspect it before re-running.';
  END IF;
  PERFORM cron.schedule(
    'commons-anon-ip-writes-purge',
    '7 * * * *',
    $cmd$DELETE FROM public.anon_ip_writes WHERE window_start < now() - interval '24 hours'$cmd$
  );
END
$do$;

-- (2) catch-up purge: same predicate as the cron job ---------------------------
DELETE FROM public.anon_ip_writes
 WHERE window_start < now() - interval '24 hours';

-- (3) client roles lose direct access to the counter table --------------------
REVOKE ALL ON TABLE public.anon_ip_writes FROM PUBLIC, anon, authenticated;

-- (4) the comment says what the database does ----------------------------------
COMMENT ON TABLE public.anon_ip_writes IS
  'Hourly per-IP write counters for the ip_rate_limit_ok() checks in the six validated INSERT policies (PUBLIC role, so signed-in site writes are counted too). ip_hash is unsalted sha256(client ip); no raw IPs are stored. Rows are deleted once window_start is more than 24 hours old: hourly by pg_cron job commons-anon-ip-writes-purge, and opportunistically by ip_rate_limit_ok(). anon and authenticated hold no privileges on this table.';
