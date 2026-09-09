-- DISPOSABLE LOCAL DATABASE ONLY. Synthetic RPCs, not a migration proposal.
-- Models the checked-in F -> I -> T lifecycle order and shared token budget.
CREATE SCHEMA fixture;
CREATE EXTENSION pgcrypto;
CREATE TABLE fixture.facilitators(id text PRIMARY KEY);
CREATE TABLE fixture.identities(id text PRIMARY KEY, owner_id text REFERENCES fixture.facilitators ON DELETE CASCADE, active boolean NOT NULL DEFAULT true);
CREATE TABLE fixture.tokens(id text PRIMARY KEY, voice_id text REFERENCES fixture.identities ON DELETE CASCADE, secret text NOT NULL, active boolean NOT NULL DEFAULT true, expires timestamptz NOT NULL DEFAULT now()+interval '7 days', uses int NOT NULL DEFAULT 0, allowance int NOT NULL DEFAULT 60);
CREATE TABLE fixture.grants(id text PRIMARY KEY, owner_id text NOT NULL, voice_id text NOT NULL, token_id text NOT NULL, capability_hash bytea NOT NULL, revoked boolean NOT NULL DEFAULT false, expires timestamptz NOT NULL DEFAULT now()+interval '7 days');
CREATE TABLE fixture.parents(id text PRIMARY KEY, discussion_id text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE fixture.drafts(id text PRIMARY KEY, grant_id text NOT NULL, revision int NOT NULL, content text NOT NULL, parent_id text NOT NULL, discussion_id text NOT NULL, approved_hash bytea, expires timestamptz NOT NULL DEFAULT now()+interval '10 minutes');
CREATE TABLE fixture.posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content text NOT NULL, parent_id text NOT NULL, voice_id text NOT NULL);
CREATE TABLE fixture.receipts(draft_id text PRIMARY KEY, revision int NOT NULL, payload_hash bytea NOT NULL, post_id uuid NOT NULL REFERENCES fixture.posts, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE fixture.handoffs(id text PRIMARY KEY, secret_hash bytea NOT NULL, owner_id text NOT NULL, session_nonce text NOT NULL, transaction_id text NOT NULL, client_id text NOT NULL, redirect_uri text NOT NULL, grant_id text NOT NULL, expires timestamptz NOT NULL DEFAULT now()+interval '2 minutes', consumed boolean NOT NULL DEFAULT false);

CREATE FUNCTION fixture.payload_hash(d fixture.drafts) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
 SELECT digest(jsonb_build_array(d.grant_id,d.revision,d.content,d.parent_id,d.discussion_id)::text,'sha256')
$$;

-- Token validation has the same parent-first order as the existing validator.
-- Secret hashing/audit rows are simplified: this is transaction evidence only.
CREATE FUNCTION fixture.validate_agent_token(p_secret text) RETURNS fixture.tokens LANGUAGE plpgsql AS $$
DECLARE candidate fixture.tokens; ident fixture.identities;
BEGIN
 SELECT * INTO candidate FROM fixture.tokens WHERE secret=p_secret;
 SELECT * INTO ident FROM fixture.identities WHERE id=candidate.voice_id;
 PERFORM id FROM fixture.facilitators WHERE id=ident.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'authority unavailable'; END IF;
 SELECT * INTO ident FROM fixture.identities WHERE id=ident.id FOR KEY SHARE;
 SELECT * INTO candidate FROM fixture.tokens WHERE id=candidate.id FOR UPDATE;
 IF NOT candidate.active OR candidate.expires<=clock_timestamp() OR NOT ident.active THEN RAISE EXCEPTION 'authority unavailable'; END IF;
 RETURN candidate;
END $$;

CREATE FUNCTION fixture.agent_create_post(p_secret text,p_content text,p_parent text,p_discussion text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE tok fixture.tokens; result uuid;
BEGIN
 tok:=fixture.validate_agent_token(p_secret);
 IF tok.uses>=tok.allowance THEN RAISE EXCEPTION 'rate limit'; END IF;
 IF NOT EXISTS(SELECT FROM fixture.parents WHERE id=p_parent AND discussion_id=p_discussion AND active) THEN RAISE EXCEPTION 'parent unavailable'; END IF;
 UPDATE fixture.tokens SET uses=uses+1 WHERE id=tok.id;
 INSERT INTO fixture.posts(content,parent_id,voice_id) VALUES(p_content,p_parent,tok.voice_id) RETURNING id INTO result;
 RETURN result;
END $$;

CREATE FUNCTION fixture.publish(p_capability text,p_grant text,p_draft text,p_revision int) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE g fixture.grants; ident fixture.identities; tok fixture.tokens; d fixture.drafts; receipt fixture.receipts; result uuid;
BEGIN
 -- Discovery is not authorization. Re-read authoritative state under locks.
 SELECT * INTO g FROM fixture.grants WHERE id=p_grant;
 IF g.id IS NULL OR g.capability_hash IS DISTINCT FROM digest(p_capability,'sha256') THEN RAISE EXCEPTION 'authority unavailable'; END IF;
 PERFORM id FROM fixture.facilitators WHERE id=g.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'authority unavailable'; END IF;
 SELECT * INTO ident FROM fixture.identities WHERE id=g.voice_id FOR KEY SHARE;
 SELECT * INTO tok FROM fixture.tokens WHERE id=g.token_id FOR UPDATE;
 SELECT * INTO g FROM fixture.grants WHERE id=p_grant FOR UPDATE;
 IF ident.id IS NULL OR NOT ident.active OR ident.owner_id IS DISTINCT FROM g.owner_id OR tok.id IS NULL OR NOT tok.active OR tok.voice_id IS DISTINCT FROM g.voice_id OR tok.expires<=clock_timestamp() OR g.revoked OR g.expires<=clock_timestamp() THEN RAISE EXCEPTION 'authority unavailable'; END IF;
 SELECT * INTO d FROM fixture.drafts WHERE id=p_draft FOR UPDATE;
 IF d.id IS NULL OR d.grant_id IS DISTINCT FROM g.id OR d.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'draft unavailable'; END IF;
 SELECT * INTO receipt FROM fixture.receipts WHERE draft_id=d.id;
 IF FOUND THEN
   IF receipt.revision<>p_revision OR receipt.payload_hash IS DISTINCT FROM fixture.payload_hash(d) THEN RAISE EXCEPTION 'draft unavailable'; END IF;
   RETURN receipt.post_id;
 END IF;
 IF d.expires<=clock_timestamp() OR d.approved_hash IS DISTINCT FROM fixture.payload_hash(d) THEN RAISE EXCEPTION 'approval required'; END IF;
 IF length(trim(d.content))=0 OR length(d.content)>30000 OR length(regexp_replace(d.content,'[[:ascii:]]','','g'))>1000 THEN RAISE EXCEPTION 'content rejected'; END IF;
 result:=fixture.agent_create_post(tok.secret,d.content,d.parent_id,d.discussion_id);
 INSERT INTO fixture.receipts(draft_id,revision,payload_hash,post_id) VALUES(d.id,d.revision,fixture.payload_hash(d),result);
 RETURN result;
END $$;

CREATE FUNCTION fixture.consume_handoff(p_id text,p_secret text,p_owner text,p_session text,p_transaction text,p_client text,p_redirect text,p_grant text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE result text;
BEGIN
 UPDATE fixture.handoffs SET consumed=true
 WHERE id=p_id AND secret_hash=digest(p_secret,'sha256') AND owner_id=p_owner AND session_nonce=p_session AND transaction_id=p_transaction AND client_id=p_client AND redirect_uri=p_redirect AND grant_id=p_grant AND NOT consumed AND expires>clock_timestamp()
 RETURNING grant_id INTO result;
 IF NOT FOUND THEN RAISE EXCEPTION 'handoff unavailable'; END IF;
 RETURN result;
END $$;

-- No untrusted table access; SQL session role tests are independent of owner login.
CREATE ROLE fixture_caller NOLOGIN;
REVOKE ALL ON SCHEMA fixture FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA fixture FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fixture FROM PUBLIC;
GRANT USAGE ON SCHEMA fixture TO fixture_caller;
ALTER FUNCTION fixture.publish(text,text,text,int) SECURITY DEFINER;
ALTER FUNCTION fixture.publish(text,text,text,int) SET search_path=pg_catalog,fixture,public;
GRANT EXECUTE ON FUNCTION fixture.publish(text,text,text,int) TO fixture_caller;
