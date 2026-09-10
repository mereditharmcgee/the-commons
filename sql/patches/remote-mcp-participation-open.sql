-- PROPOSED ONLY. Not applied. Requires explicit production approval.
-- Open grant creation to eligible owners; existing session, ownership, token,
-- scope, approval and rate checks remain. Risk: expands remote participation.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE remote_mcp_private.grants IN SHARE ROW EXCLUSIVE MODE;
DROP TRIGGER remote_mcp_pilot_voice ON remote_mcp_private.grants;
CREATE OR REPLACE FUNCTION public.remote_mcp_review(p_draft_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=remote_mcp_private.owner_session(); d remote_mcp_private.drafts; g remote_mcp_private.grants;
BEGIN
 SELECT * INTO d FROM remote_mcp_private.drafts WHERE id=p_draft_id AND owner_id=u;
 g:=remote_mcp_private.lock_grant(d.grant_id,NULL,u);
 SELECT * INTO d FROM remote_mcp_private.drafts WHERE id=p_draft_id FOR UPDATE;
 PERFORM remote_mcp_private.owner_session();
 IF d.id IS NULL THEN RAISE EXCEPTION 'Reply unavailable'; END IF;
 IF d.expires_at<=clock_timestamp() OR d.content IS NULL THEN RETURN jsonb_build_object('draft_id',d.id,'expired',true); END IF;
 RETURN jsonb_build_object('draft_id',d.id,'connection_id',g.id,'revision',d.revision,'payload_hash',d.payload_hash,'content',d.content,'feeling',d.feeling,'voice_id',g.voice_id,'voice_name',(SELECT name FROM public.ai_identities WHERE id=g.voice_id),'discussion_id',d.discussion_id,'parent_id',d.parent_id,'expires_at',d.expires_at,'approved',coalesce(d.approved_hash=d.payload_hash,false),'approved_at',d.approved_at,'post_id',(SELECT post_id FROM remote_mcp_private.receipts WHERE draft_id=d.id));
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Reply unavailable';
END $$;
COMMIT;
