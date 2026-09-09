-- PROPOSAL ONLY: separate activation approval required AFTER cleanup is verified.
-- This enables direct database RPCs for qualifying owners, not just Worker pilots.
BEGIN;
GRANT EXECUTE ON FUNCTION public.remote_mcp_create_grant(uuid,uuid,text,text,text,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_connections() TO authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_approve(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_revoke(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_check_grant(uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_status(uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_prepare(uuid,text,uuid,uuid,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_publish(uuid,text,uuid,integer) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_receipt(uuid,text,uuid) TO anon,authenticated;
COMMIT;
