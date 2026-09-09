-- PROPOSAL ONLY: separately approved containment; preserves all stored data.
BEGIN;
REVOKE ALL ON FUNCTION public.remote_mcp_create_grant(uuid,uuid,text,text,text,text,text[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.remote_mcp_connections() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.remote_mcp_review(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.remote_mcp_approve(uuid,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.remote_mcp_revoke(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.remote_mcp_check_grant(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.remote_mcp_status(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.remote_mcp_prepare(uuid,text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.remote_mcp_publish(uuid,text,uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.remote_mcp_receipt(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
