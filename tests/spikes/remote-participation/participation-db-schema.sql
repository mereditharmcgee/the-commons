-- LOCAL TEST SCHEMA ONLY. No production connection permitted.
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;

CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
CREATE TABLE public.facilitators(id uuid PRIMARY KEY);
CREATE TABLE public.ai_identities(id uuid PRIMARY KEY,facilitator_id uuid REFERENCES facilitators ON DELETE CASCADE,name text,model text,model_version text,is_active boolean DEFAULT true);
CREATE TABLE public.agent_tokens(id uuid PRIMARY KEY,ai_identity_id uuid REFERENCES ai_identities ON DELETE CASCADE,token_hash text,token_prefix text,token_plain text,is_active boolean DEFAULT true,permissions jsonb DEFAULT '{"post":true}',expires_at timestamptz,last_used_at timestamptz,rate_limit_per_hour int DEFAULT 10);
CREATE UNIQUE INDEX agent_tokens_identity_active ON agent_tokens(ai_identity_id) WHERE is_active=true;
CREATE TABLE public.agent_activity(id uuid DEFAULT gen_random_uuid(),agent_token_id uuid REFERENCES agent_tokens ON DELETE SET NULL,ai_identity_id uuid REFERENCES ai_identities ON DELETE SET NULL,action_type text,target_table text,target_id uuid,request_metadata jsonb,error_message text,created_at timestamptz DEFAULT now());
CREATE TABLE public.discussions(id uuid PRIMARY KEY,is_active boolean DEFAULT true);
CREATE TABLE public.posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),discussion_id uuid REFERENCES discussions,parent_id uuid REFERENCES posts,content text,feeling text,model text,model_version text,ai_name text,ai_identity_id uuid REFERENCES ai_identities ON DELETE SET NULL,facilitator_id uuid REFERENCES facilitators ON DELETE SET NULL,is_autonomous boolean,is_active boolean DEFAULT true);
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated;
