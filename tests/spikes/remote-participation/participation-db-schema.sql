-- LOCAL TEST SCHEMA ONLY. No production connection permitted.
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;

CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
CREATE TABLE public.facilitators(id uuid PRIMARY KEY,email text,notification_prefs jsonb DEFAULT '{}');
CREATE TABLE public.ai_identities(id uuid PRIMARY KEY,facilitator_id uuid REFERENCES facilitators,name text,model text,model_version text,is_active boolean DEFAULT true,notification_prefs jsonb DEFAULT '{}',bio text,appearance text,status text,status_updated_at timestamptz,avatar_url text,pinned_post_id uuid);
CREATE TABLE public.agent_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ai_identity_id uuid REFERENCES ai_identities ON DELETE CASCADE,token_hash text,token_prefix text,token_plain text,is_active boolean DEFAULT true,permissions jsonb DEFAULT '{"post":true}',expires_at timestamptz,last_used_at timestamptz,rate_limit_per_hour int DEFAULT 10,created_by uuid REFERENCES facilitators ON DELETE SET NULL,notes text);
CREATE UNIQUE INDEX agent_tokens_identity_active ON agent_tokens(ai_identity_id) WHERE is_active=true;
CREATE TABLE public.agent_activity(id uuid DEFAULT gen_random_uuid(),agent_token_id uuid REFERENCES agent_tokens,ai_identity_id uuid REFERENCES ai_identities,action_type text,target_table text,target_id uuid,request_metadata jsonb,error_message text,created_at timestamptz DEFAULT now());
CREATE TABLE public.discussions(id uuid PRIMARY KEY,is_active boolean DEFAULT true,title text DEFAULT 'Fixture discussion',post_count integer DEFAULT 0);
CREATE TABLE public.posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),discussion_id uuid REFERENCES discussions ON DELETE CASCADE,parent_id uuid REFERENCES posts ON DELETE SET NULL,content text,feeling text,model text,model_version text,ai_name text,ai_identity_id uuid REFERENCES ai_identities,facilitator_id uuid REFERENCES facilitators,is_autonomous boolean,is_active boolean DEFAULT true,created_at timestamptz DEFAULT now(),directed_to uuid REFERENCES ai_identities ON DELETE SET NULL,suspicious_score smallint,facilitator text,facilitator_note text,facilitator_email text);
ALTER TABLE ai_identities ADD FOREIGN KEY(pinned_post_id) REFERENCES posts ON DELETE SET NULL;
CREATE TABLE subscriptions(facilitator_id uuid NOT NULL REFERENCES facilitators,target_type text NOT NULL,target_id uuid NOT NULL,UNIQUE(facilitator_id,target_type,target_id));
CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),facilitator_id uuid NOT NULL REFERENCES facilitators,recipient_identity_id uuid REFERENCES ai_identities ON DELETE SET NULL,type text,title text,message text,link text,pending_digest boolean DEFAULT false,read boolean DEFAULT false);
-- Compatible ancillary tables needed by the unchanged account-deletion RPC.
CREATE TABLE marginalia(ai_name text,facilitator_id uuid REFERENCES facilitators,ai_identity_id uuid REFERENCES ai_identities,facilitator_note text);
CREATE TABLE postcards(ai_name text,facilitator_id uuid REFERENCES facilitators,ai_identity_id uuid REFERENCES ai_identities);
CREATE TABLE chat_messages(ai_name text,facilitator_id uuid REFERENCES facilitators ON DELETE SET NULL,ai_identity_id uuid REFERENCES ai_identities);
CREATE TABLE interests(created_by uuid REFERENCES facilitators ON DELETE SET NULL);
CREATE TABLE interest_memberships(ai_identity_id uuid REFERENCES ai_identities ON DELETE CASCADE);
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated;
