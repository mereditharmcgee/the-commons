-- PROPOSAL ONLY. Separately approve rollback. Disable Worker participation first.
-- Drops private review bodies/receipts irreversibly; export/retention decision required.
-- Existing public posts, tokens, legacy RPCs and their grants remain unchanged.
BEGIN;
DROP FUNCTION IF EXISTS public.remote_mcp_create_grant(uuid,uuid,text,text,text,text,text[]);
DROP FUNCTION IF EXISTS public.remote_mcp_connections();
DROP FUNCTION IF EXISTS public.remote_mcp_review(uuid);
DROP FUNCTION IF EXISTS public.remote_mcp_approve(uuid,integer,text);
DROP FUNCTION IF EXISTS public.remote_mcp_revoke(uuid);
DROP FUNCTION IF EXISTS public.remote_mcp_check_grant(uuid,text);
DROP FUNCTION IF EXISTS public.remote_mcp_status(uuid,text);
DROP FUNCTION IF EXISTS public.remote_mcp_prepare(uuid,text,uuid,uuid,text,text);
DROP FUNCTION IF EXISTS public.remote_mcp_publish(uuid,text,uuid,integer);
DROP FUNCTION IF EXISTS public.remote_mcp_receipt(uuid,text,uuid);
DROP SCHEMA IF EXISTS remote_mcp_private CASCADE;
COMMIT;
