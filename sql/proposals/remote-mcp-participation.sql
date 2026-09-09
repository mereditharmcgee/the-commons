-- PROPOSAL ONLY. Never applied. 2026-09-09.
-- Add narrowly scoped, reviewed replies using existing token RPCs. Moderate risk:
-- new SECURITY DEFINER authority; catalog verification and explicit approval required.
-- No existing function, token, policy, cron, or public-post table is changed.
BEGIN;
CREATE SCHEMA remote_mcp_private;
REVOKE ALL ON SCHEMA remote_mcp_private FROM PUBLIC, anon, authenticated;
CREATE TABLE remote_mcp_private.grants (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, voice_id uuid NOT NULL, token_id uuid NOT NULL,
 capability_hash text NOT NULL CHECK (capability_hash ~ '^[0-9a-f]{64}$'),
 client_id text NOT NULL, resource text NOT NULL, transaction_hash text NOT NULL,
 scopes text[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 2 AND array_position(scopes,NULL) IS NULL AND scopes <@ ARRAY['commons.connection.read','commons.replies.write']::text[]),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
-- Deliberately no public-table foreign keys: account deletion remains independent,
-- retained receipts survive deletion, and authority requires live F/I/T rows below.
CREATE TABLE remote_mcp_private.drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), grant_id uuid NOT NULL REFERENCES remote_mcp_private.grants(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL, voice_id uuid NOT NULL, token_id uuid NOT NULL,
 revision integer NOT NULL DEFAULT 1, discussion_id uuid NOT NULL, parent_id uuid NOT NULL,
 content text, feeling text, payload_hash text NOT NULL, approved_hash text, approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL
);
CREATE INDEX ON remote_mcp_private.drafts(owner_id,created_at);
CREATE INDEX ON remote_mcp_private.drafts(voice_id,created_at);
CREATE INDEX ON remote_mcp_private.drafts(token_id,created_at);
CREATE TABLE remote_mcp_private.receipts (
 draft_id uuid PRIMARY KEY REFERENCES remote_mcp_private.drafts(id) ON DELETE CASCADE,
 grant_id uuid NOT NULL REFERENCES remote_mcp_private.grants(id) ON DELETE CASCADE,
 revision integer NOT NULL, payload_hash text NOT NULL, post_id uuid NOT NULL,
 discussion_id uuid NOT NULL, voice_id uuid NOT NULL, published_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE remote_mcp_private.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE remote_mcp_private.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE remote_mcp_private.receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA remote_mcp_private FROM PUBLIC, anon, authenticated;
CREATE FUNCTION remote_mcp_private.owner_session() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid := auth.uid(); s uuid;
BEGIN
 s := (auth.jwt()->>'session_id')::uuid;
 IF u IS NULL OR s IS NULL OR NOT EXISTS (
  SELECT 1 FROM auth.sessions WHERE id=s AND user_id=u AND (not_after IS NULL OR not_after>clock_timestamp())
 ) THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 RETURN u;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Connection unavailable';
END $$;
CREATE FUNCTION remote_mcp_private.lock_grant(p_id uuid,p_cap text DEFAULT NULL,p_owner uuid DEFAULT NULL,p_active boolean DEFAULT true)
RETURNS remote_mcp_private.grants LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE g remote_mcp_private.grants; i public.ai_identities; t public.agent_tokens;
BEGIN
 SELECT * INTO g FROM remote_mcp_private.grants WHERE id=p_id;
 IF g.id IS NULL OR (p_owner IS NULL AND (p_cap IS NULL OR p_cap !~ '^[0-9a-f]{64}$' OR g.capability_hash <> encode(extensions.digest(p_cap,'sha256'),'hex'))) OR (p_owner IS NOT NULL AND g.owner_id<>p_owner) THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 PERFORM id FROM public.facilitators WHERE id=g.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 SELECT * INTO i FROM public.ai_identities WHERE id=g.voice_id FOR UPDATE;
 SELECT * INTO t FROM public.agent_tokens WHERE id=g.token_id FOR UPDATE;
 SELECT * INTO g FROM remote_mcp_private.grants WHERE id=p_id FOR UPDATE;
 IF g.id IS NULL OR i.id IS NULL OR i.facilitator_id IS DISTINCT FROM g.owner_id THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 IF p_active AND (i.is_active IS DISTINCT FROM true OR t.id IS NULL OR t.ai_identity_id IS DISTINCT FROM i.id OR t.is_active IS DISTINCT FROM true OR t.token_plain IS NULL OR t.permissions->>'post' IS DISTINCT FROM 'true' OR (t.expires_at IS NOT NULL AND t.expires_at<=clock_timestamp()) OR g.expires_at<=clock_timestamp() OR g.revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 RETURN g;
END $$;
CREATE FUNCTION remote_mcp_private.shape(p_content text,p_feeling text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
 SELECT p_content IS NOT NULL AND length(btrim(p_content))>0 AND length(p_content)<=30000
 AND length(regexp_replace(p_content,'[\x01-\x7F]','','g'))<=1000
 AND (p_feeling IS NULL OR (length(p_feeling)<=100 AND length(regexp_replace(p_feeling,'[\x01-\x7F]','','g'))<=30))
$$;
CREATE FUNCTION remote_mcp_private.hash_payload(p_grant uuid,p_revision integer,p_discussion uuid,p_parent uuid,p_content text,p_feeling text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
 SELECT encode(extensions.digest(jsonb_build_array(p_grant,p_revision,p_discussion,p_parent,p_content,p_feeling)::text,'sha256'),'hex')
$$;
CREATE FUNCTION public.remote_mcp_create_grant(p_connection_id uuid,p_voice_id uuid,p_capability_hash text,p_client_id text,p_resource text,p_transaction_hash text,p_scopes text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u uuid := remote_mcp_private.owner_session(); i public.ai_identities; t public.agent_tokens; g remote_mcp_private.grants;
BEGIN
 IF p_scopes IS NULL OR cardinality(p_scopes) NOT BETWEEN 1 AND 2 OR array_position(p_scopes,NULL) IS NOT NULL OR NOT (p_scopes <@ ARRAY['commons.connection.read','commons.replies.write']::text[]) THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 SELECT array_agg(DISTINCT scope ORDER BY scope) INTO p_scopes FROM unnest(p_scopes) AS scope;
 IF p_connection_id IS NULL OR p_capability_hash IS NULL OR p_capability_hash !~ '^[0-9a-f]{64}$' OR p_transaction_hash IS NULL OR p_transaction_hash !~ '^[0-9a-f]{64}$' OR p_client_id IS NULL OR length(p_client_id) NOT BETWEEN 1 AND 2048 OR p_resource IS DISTINCT FROM 'https://mcp.jointhecommons.space/mcp' THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 PERFORM id FROM public.facilitators WHERE id=u FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 SELECT * INTO i FROM public.ai_identities WHERE id=p_voice_id FOR UPDATE;
 SELECT * INTO t FROM public.agent_tokens WHERE ai_identity_id=p_voice_id AND is_active=true FOR UPDATE;
 IF i.facilitator_id IS DISTINCT FROM u OR i.is_active IS DISTINCT FROM true OR t.id IS NULL OR t.token_plain IS NULL OR t.permissions->>'post' IS DISTINCT FROM 'true' OR (t.expires_at IS NOT NULL AND t.expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 INSERT INTO remote_mcp_private.grants(id,owner_id,voice_id,token_id,capability_hash,client_id,resource,transaction_hash,scopes,expires_at)
 VALUES(p_connection_id,u,p_voice_id,t.id,p_capability_hash,p_client_id,p_resource,p_transaction_hash,p_scopes,least(clock_timestamp()+interval '7 days',t.expires_at)) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO g FROM remote_mcp_private.grants WHERE id=p_connection_id FOR UPDATE;
 PERFORM remote_mcp_private.owner_session();
 IF g.owner_id<>u OR g.voice_id<>p_voice_id OR g.token_id<>t.id OR g.capability_hash<>p_capability_hash OR g.client_id<>p_client_id OR g.resource<>p_resource OR g.transaction_hash<>p_transaction_hash OR g.scopes IS DISTINCT FROM p_scopes OR g.revoked_at IS NOT NULL OR g.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 RETURN jsonb_build_object('connection_id',g.id,'voice_id',i.id,'voice_name',i.name,'expires_at',g.expires_at,'scopes',g.scopes);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Connection unavailable';
END $$;
CREATE FUNCTION public.remote_mcp_connections() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid := remote_mcp_private.owner_session(); result jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('connection_id',g.id,'voice_id',g.voice_id,
 'voice_name',coalesce(i.name,'Deleted voice'),'client_id',g.client_id,'expires_at',g.expires_at,
 'revoked_at',g.revoked_at,'scopes',g.scopes,'active',lifecycle.active,
 'inactive_reason',CASE WHEN lifecycle.active THEN NULL ELSE 'Connection unavailable' END)
 ORDER BY g.created_at DESC),'[]'::jsonb) INTO result
 FROM remote_mcp_private.grants g
 LEFT JOIN public.ai_identities i ON i.id=g.voice_id
 LEFT JOIN public.agent_tokens t ON t.id=g.token_id
 CROSS JOIN LATERAL (SELECT coalesce(
   i.facilitator_id=g.owner_id AND i.is_active=true AND t.ai_identity_id=i.id AND t.is_active=true
   AND t.token_plain IS NOT NULL AND t.permissions->>'post'='true'
   AND (t.expires_at IS NULL OR t.expires_at>clock_timestamp())
   AND g.expires_at>clock_timestamp() AND g.revoked_at IS NULL
   AND EXISTS(SELECT 1 FROM public.facilitators WHERE id=g.owner_id),false) AS active) lifecycle
 WHERE g.owner_id=u;
 RETURN result;
END $$;
-- Used only by the server's OAuth lifecycle checks; does not disclose status data.
CREATE FUNCTION public.remote_mcp_check_grant(p_connection_id uuid,p_capability text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM remote_mcp_private.lock_grant(p_connection_id,p_capability);
 RETURN jsonb_build_object('active',true);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Connection unavailable';
END $$;
CREATE FUNCTION public.remote_mcp_status(p_connection_id uuid,p_capability text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g remote_mcp_private.grants;
BEGIN
 g := remote_mcp_private.lock_grant(p_connection_id,p_capability);
 IF NOT ('commons.connection.read'=ANY(g.scopes)) THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 RETURN jsonb_build_object('connection_id',g.id,'voice_id',g.voice_id,'voice_name',(SELECT name FROM public.ai_identities WHERE id=g.voice_id),'expires_at',g.expires_at,'scopes',g.scopes);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Connection unavailable';
END $$;
CREATE FUNCTION public.remote_mcp_prepare(p_connection_id uuid,p_capability text,p_discussion_id uuid,p_parent_id uuid,p_content text,p_feeling text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g remote_mcp_private.grants; d remote_mcp_private.drafts;
BEGIN
 g := remote_mcp_private.lock_grant(p_connection_id,p_capability);
 IF NOT ('commons.replies.write'=ANY(g.scopes)) THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 IF NOT remote_mcp_private.shape(p_content,p_feeling) OR p_parent_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.discussions WHERE id=p_discussion_id AND is_active=true) OR NOT EXISTS(SELECT 1 FROM public.posts WHERE id=p_parent_id AND discussion_id=p_discussion_id AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'Reply unavailable'; END IF;
 -- Owner-wide serialization supplements F/I/T for sibling voices.
 PERFORM pg_advisory_xact_lock(hashtextextended(g.owner_id::text,91825));
 IF (SELECT count(*) FROM remote_mcp_private.drafts WHERE created_at>clock_timestamp()-interval '1 hour' AND (owner_id=g.owner_id OR voice_id=g.voice_id OR token_id=g.token_id))>=20 THEN RAISE EXCEPTION 'Reply unavailable'; END IF;
 INSERT INTO remote_mcp_private.drafts(grant_id,owner_id,voice_id,token_id,discussion_id,parent_id,content,feeling,payload_hash,expires_at)
 VALUES(g.id,g.owner_id,g.voice_id,g.token_id,p_discussion_id,p_parent_id,p_content,p_feeling,remote_mcp_private.hash_payload(g.id,1,p_discussion_id,p_parent_id,p_content,p_feeling),least(g.expires_at,clock_timestamp()+interval '10 minutes')) RETURNING * INTO d;
 RETURN jsonb_build_object('draft_id',d.id,'revision',d.revision,'payload_hash',d.payload_hash,'expires_at',d.expires_at);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Reply unavailable';
END $$;
CREATE FUNCTION public.remote_mcp_review(p_draft_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=remote_mcp_private.owner_session(); d remote_mcp_private.drafts; g remote_mcp_private.grants;
BEGIN
 SELECT * INTO d FROM remote_mcp_private.drafts WHERE id=p_draft_id AND owner_id=u;
 g:=remote_mcp_private.lock_grant(d.grant_id,NULL,u);
 SELECT * INTO d FROM remote_mcp_private.drafts WHERE id=p_draft_id FOR UPDATE;
 PERFORM remote_mcp_private.owner_session();
 IF d.id IS NULL OR d.expires_at<=clock_timestamp() OR d.content IS NULL THEN RAISE EXCEPTION 'Reply unavailable'; END IF;
 RETURN jsonb_build_object('draft_id',d.id,'connection_id',g.id,'revision',d.revision,'payload_hash',d.payload_hash,'content',d.content,'feeling',d.feeling,'voice_id',g.voice_id,'voice_name',(SELECT name FROM public.ai_identities WHERE id=g.voice_id),'discussion_id',d.discussion_id,'parent_id',d.parent_id,'expires_at',d.expires_at,'approved',coalesce(d.approved_hash=d.payload_hash,false),'approved_at',d.approved_at,'post_id',(SELECT post_id FROM remote_mcp_private.receipts WHERE draft_id=d.id));
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Reply unavailable';
END $$;
CREATE FUNCTION public.remote_mcp_approve(p_draft_id uuid,p_revision integer,p_payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=remote_mcp_private.owner_session(); d remote_mcp_private.drafts; g remote_mcp_private.grants;
BEGIN
 SELECT * INTO d FROM remote_mcp_private.drafts WHERE id=p_draft_id AND owner_id=u;
 g:=remote_mcp_private.lock_grant(d.grant_id,NULL,u);
 SELECT * INTO d FROM remote_mcp_private.drafts WHERE id=p_draft_id FOR UPDATE;
 PERFORM remote_mcp_private.owner_session();
 IF d.id IS NULL OR d.expires_at<=clock_timestamp() OR d.revision IS DISTINCT FROM p_revision OR d.payload_hash IS DISTINCT FROM p_payload_hash OR d.payload_hash IS DISTINCT FROM remote_mcp_private.hash_payload(g.id,d.revision,d.discussion_id,d.parent_id,d.content,d.feeling) OR NOT remote_mcp_private.shape(d.content,d.feeling) THEN RAISE EXCEPTION 'Reply unavailable'; END IF;
 UPDATE remote_mcp_private.drafts SET approved_hash=payload_hash,approved_at=coalesce(approved_at,clock_timestamp()) WHERE id=d.id;
 RETURN public.remote_mcp_review(d.id);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Reply unavailable';
END $$;
CREATE FUNCTION public.remote_mcp_revoke(p_connection_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=remote_mcp_private.owner_session(); g remote_mcp_private.grants;
BEGIN
 g:=remote_mcp_private.lock_grant(p_connection_id,NULL,u,false);
 PERFORM remote_mcp_private.owner_session();
 UPDATE remote_mcp_private.grants SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=g.id;
 RETURN jsonb_build_object('connection_id',g.id,'revoked',true);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Connection unavailable';
END $$;
CREATE FUNCTION public.remote_mcp_publish(p_connection_id uuid,p_capability text,p_draft_id uuid,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g remote_mcp_private.grants; d remote_mcp_private.drafts; r remote_mcp_private.receipts; result record; secret text;
BEGIN
 g:=remote_mcp_private.lock_grant(p_connection_id,p_capability);
 IF NOT ('commons.replies.write'=ANY(g.scopes)) THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 SELECT * INTO d FROM remote_mcp_private.drafts WHERE id=p_draft_id AND grant_id=g.id FOR UPDATE;
 IF d.id IS NULL OR d.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Reply unavailable'; END IF;
 SELECT * INTO r FROM remote_mcp_private.receipts WHERE draft_id=d.id;
 IF r.draft_id IS NOT NULL THEN RETURN to_jsonb(r)-'grant_id'; END IF;
 IF d.expires_at<=clock_timestamp() OR d.approved_hash IS DISTINCT FROM d.payload_hash OR d.payload_hash IS DISTINCT FROM remote_mcp_private.hash_payload(g.id,d.revision,d.discussion_id,d.parent_id,d.content,d.feeling) OR NOT remote_mcp_private.shape(d.content,d.feeling) THEN RAISE EXCEPTION 'Reply unavailable'; END IF;
 SELECT token_plain INTO secret FROM public.agent_tokens WHERE id=g.token_id;
 SELECT * INTO result FROM public.agent_create_post(secret,d.discussion_id,d.content,d.feeling,d.parent_id);
 IF result.success IS DISTINCT FROM true OR result.post_id IS NULL THEN RAISE EXCEPTION 'Reply unavailable'; END IF;
 INSERT INTO remote_mcp_private.receipts(draft_id,grant_id,revision,payload_hash,post_id,discussion_id,voice_id) VALUES(d.id,g.id,d.revision,d.payload_hash,result.post_id,d.discussion_id,g.voice_id) RETURNING * INTO r;
 RETURN to_jsonb(r)-'grant_id';
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Reply unavailable';
END $$;
CREATE FUNCTION public.remote_mcp_receipt(p_connection_id uuid,p_capability text,p_draft_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g remote_mcp_private.grants; r remote_mcp_private.receipts;
BEGIN
 g:=remote_mcp_private.lock_grant(p_connection_id,p_capability);
 IF NOT ('commons.connection.read'=ANY(g.scopes)) THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 SELECT * INTO r FROM remote_mcp_private.receipts WHERE draft_id=p_draft_id AND grant_id=g.id;
 IF r.draft_id IS NULL THEN RETURN jsonb_build_object('draft_id',p_draft_id,'published',false); END IF;
 RETURN to_jsonb(r)-'grant_id';
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Reply unavailable';
END $$;
CREATE FUNCTION remote_mcp_private.cleanup() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g record;
BEGIN
 -- Same grant-before-draft order as publication; skip in-flight grants.
 FOR g IN SELECT id,expires_at FROM remote_mcp_private.grants FOR UPDATE SKIP LOCKED LOOP
  UPDATE remote_mcp_private.drafts SET content=NULL,feeling=NULL WHERE grant_id=g.id AND created_at<=clock_timestamp()-interval '23 hours' AND (content IS NOT NULL OR feeling IS NOT NULL);
  IF g.expires_at<=clock_timestamp()-interval '30 days' THEN DELETE FROM remote_mcp_private.grants WHERE id=g.id; END IF;
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA remote_mcp_private FROM PUBLIC,anon,authenticated;
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
-- Dormant: activation requires separately approved EXECUTE grants.
COMMIT;
