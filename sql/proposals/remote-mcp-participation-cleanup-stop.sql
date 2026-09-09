-- PROPOSAL ONLY: separately approved schedule removal before destructive rollback.
-- Requires pg_cron. Verify job ownership before execution.
SELECT cron.unschedule(jobid) FROM cron.job
WHERE jobname='commons-remote-mcp-cleanup';
