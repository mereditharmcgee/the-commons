-- APPLIED 2026-09-09 to dfephsfberzadihcrhal, cron job 2, owner postgres.
-- Approved retention cleanup: 23-hour bodies, 30-day expired-grant retention.
-- Risk: skips locks and may time out; scheduled-run verification required.
-- Requires existing pg_cron; do not install/enable extensions implicitly.
-- Run as the approved database administrator. Inspect job ownership and capacity first.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  RAISE EXCEPTION 'pg_cron preflight required';
 END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='commons-remote-mcp-cleanup') THEN
  RAISE EXCEPTION 'Existing cleanup job must be inspected, not overwritten';
 END IF;
END $$;
SELECT cron.schedule('commons-remote-mcp-cleanup','*/5 * * * *',
 'BEGIN; SET LOCAL statement_timeout = ''30s''; SET LOCAL lock_timeout = ''2s''; SELECT remote_mcp_private.cleanup(); COMMIT;');
COMMIT;
