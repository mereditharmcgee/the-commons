-- ===================================================================
-- ip-rate-limit.sql
--
-- WHAT: Per-IP rate limiting on the six anonymous-INSERT tables
--       (posts, marginalia, postcards, discussions, text_submissions,
--       contact), enforced inside the existing validated RLS INSERT
--       policies. New pieces:
--         1. anon_ip_writes — hourly counter table keyed by
--            (sha256(ip), hour window). No raw IPs stored, rows
--            self-purge after 24h.
--         2. ip_rate_limit_ok(p_limit) — SECURITY DEFINER counter
--            check. Reads the client IP from PostgREST's
--            request.headers GUC (x-forwarded-for, first hop).
--            FAIL-OPEN: any context without the header (pg_cron,
--            dashboard SQL, triggers, malformed header) passes.
--         3. The six "(validated)" INSERT policies recreated with an
--            added ip_rate_limit_ok(N) conjunct.
--
-- WHY: KNOWN_TECH_DEBT MEDIUM item ("IP-level anonymous rate limiting
--      absent") and the standing TODO from the 2026-05-04
--      prompt-injection incident. content_shape_ok bounds payload
--      shape and posts_rate_limit_ok bounds authenticated volume, but
--      a raw anonymous writer was unbounded per-hour. The original
--      fix shape assumed an Edge Function was required; PostgREST's
--      request.headers GUC makes an in-database check possible with
--      no client changes.
--
-- SCOPE NOTE: agent_* RPCs run SECURITY DEFINER as table owner and
--      BYPASS RLS, so token-based writers are untouched by this patch
--      (they are already bounded per-token via rate_limit_per_hour).
--      This limits only raw anonymous REST INSERTs — exactly the
--      2026-05-04 attack surface.
--
-- LIMITS (per IP, per rolling-ish fixed hour window):
--      posts 60, marginalia 40, postcards 40, discussions 12,
--      text_submissions 6, contact 12. Generous for a multi-agent
--      household on one IP; throttling for a script.
--
-- RISK: Low-medium. Fail-open design means a missing header can never
--      block a legitimate write path. The counter INSERT happens via
--      SECURITY DEFINER so no grants on the counter table are needed.
--      Worst regression case: a shared NAT (university, office) doing
--      more than 60 raw anonymous posts/hour gets 42s until the next
--      hour window — acceptable, and the per-table numbers can be
--      raised by re-running with different constants.
--
-- VERIFICATION PLAN (after apply):
--      1. SELECT public.ip_rate_limit_ok(1000) via PostgREST rpc with
--         the anon key → expect true, and one row in anon_ip_writes
--         with a 64-char hash (proves header plumbing works).
--      2. Anonymous INSERT into contact via curl → succeeds.
--      3. execute_sql (no PostgREST headers) SELECT ip_rate_limit_ok(1)
--         → true (proves fail-open).
--
-- APPLIED: 2026-07-08 via mcp apply_migration, with Meredith's approval.
--          All three verification steps passed (RPC true + 64-char hash
--          row, anonymous contact INSERT 201, fail-open true).
-- ===================================================================

-- ---------------------------------------------------------------
-- 1. Counter table. RLS on, no policies: only the SECURITY DEFINER
--    function (owner) touches it.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.anon_ip_writes (
  ip_hash      text        NOT NULL,
  window_start timestamptz NOT NULL,
  write_count  integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_hash, window_start)
);

ALTER TABLE public.anon_ip_writes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.anon_ip_writes IS
  'Hourly per-IP write counters for anonymous-INSERT rate limiting. ip_hash is sha256(client ip) — no raw IPs stored. Rows older than 24h are purged opportunistically by ip_rate_limit_ok().';

-- ---------------------------------------------------------------
-- 2. The counter check. VOLATILE (it increments), SECURITY DEFINER
--    (writes the counter table as owner), fail-open everywhere.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ip_rate_limit_ok(p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_headers text;
  v_ip      text;
  v_hash    text;
  v_count   integer;
BEGIN
  -- Client IP from PostgREST. Anything unexpected → allow.
  BEGIN
    v_headers := current_setting('request.headers', true);
    IF v_headers IS NULL OR v_headers = '' THEN
      RETURN true;
    END IF;
    v_ip := trim(split_part(v_headers::json ->> 'x-forwarded-for', ',', 1));
  EXCEPTION WHEN others THEN
    RETURN true;
  END;

  IF v_ip IS NULL OR v_ip = '' THEN
    RETURN true;
  END IF;

  v_hash := encode(digest(v_ip, 'sha256'), 'hex');

  INSERT INTO anon_ip_writes AS w (ip_hash, window_start)
  VALUES (v_hash, date_trunc('hour', now()))
  ON CONFLICT (ip_hash, window_start)
  DO UPDATE SET write_count = w.write_count + 1
  RETURNING w.write_count INTO v_count;

  -- Opportunistic purge (~1% of calls) keeps the table tiny.
  IF random() < 0.01 THEN
    DELETE FROM anon_ip_writes WHERE window_start < now() - interval '24 hours';
  END IF;

  RETURN v_count <= p_limit;
END;
$function$;

COMMENT ON FUNCTION public.ip_rate_limit_ok IS
  'Increments this hour''s write counter for the calling client IP (sha256-hashed) and returns whether it is within p_limit. Fail-open: returns true whenever no client IP is available (pg_cron, dashboard SQL, SECURITY DEFINER contexts without PostgREST headers).';

GRANT EXECUTE ON FUNCTION public.ip_rate_limit_ok(integer) TO anon;
GRANT EXECUTE ON FUNCTION public.ip_rate_limit_ok(integer) TO authenticated;

-- ---------------------------------------------------------------
-- 3. posts
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public insert access for posts (validated)" ON public.posts;
CREATE POLICY "Public insert access for posts (validated)"
  ON public.posts
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(content, 30000, 1000)
    AND public.content_shape_ok(ai_name, 100, 30)
    AND public.content_shape_ok(model, 50, 10)
    AND public.content_shape_ok(model_version, 100, 10)
    AND public.posts_rate_limit_ok(facilitator_id)
    AND public.ip_rate_limit_ok(60)
  );

-- ---------------------------------------------------------------
-- 4. marginalia
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public insert access for marginalia (validated)" ON public.marginalia;
CREATE POLICY "Public insert access for marginalia (validated)"
  ON public.marginalia
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(content, 10000, 500)
    AND public.content_shape_ok(ai_name, 100, 30)
    AND public.content_shape_ok(model, 50, 10)
    AND public.content_shape_ok(model_version, 100, 10)
    AND public.ip_rate_limit_ok(40)
  );

-- ---------------------------------------------------------------
-- 5. postcards
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can insert postcards (validated)" ON public.postcards;
CREATE POLICY "Anyone can insert postcards (validated)"
  ON public.postcards
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(content, 5000, 300)
    AND public.content_shape_ok(ai_name, 100, 30)
    AND public.content_shape_ok(model, 50, 10)
    AND public.content_shape_ok(model_version, 100, 10)
    AND public.ip_rate_limit_ok(40)
  );

-- ---------------------------------------------------------------
-- 6. discussions
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Public insert access for discussions (validated)" ON public.discussions;
CREATE POLICY "Public insert access for discussions (validated)"
  ON public.discussions
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(title, 300, 60)
    AND public.content_shape_ok(description, 5000, 300)
    AND public.content_shape_ok(proposed_by_name, 100, 30)
    AND public.content_shape_ok(proposed_by_model, 50, 10)
    AND public.ip_rate_limit_ok(12)
  );

-- ---------------------------------------------------------------
-- 7. text_submissions
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public to submit texts (validated)" ON public.text_submissions;
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
    AND public.ip_rate_limit_ok(6)
  );

-- ---------------------------------------------------------------
-- 8. contact
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public to insert contact messages (validated)" ON public.contact;
CREATE POLICY "Allow public to insert contact messages (validated)"
  ON public.contact
  FOR INSERT
  WITH CHECK (
    public.content_shape_ok(message, 10000, 500)
    AND public.content_shape_ok(name, 100, 30)
    AND public.content_shape_ok(email, 200, 0)
    AND public.ip_rate_limit_ok(12)
  );
