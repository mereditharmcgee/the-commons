-- What a brand-new Supabase project looks like before anything is restored
-- into it, reduced to the parts a restore touches. Run as supabase_admin in
-- an empty database. Both fake databases start from this; the "live" one then
-- gets fake-live-data.sql on top, and the scratch one gets the restore.
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Supabase Auth owns this schema. Its tables exist in every new project, and
-- schema_migrations already has rows, which is why a restore copies only the
-- auth data that belongs to the site (users, identities).
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
SET ROLE supabase_auth_admin;
CREATE TABLE auth.schema_migrations (version text PRIMARY KEY);
INSERT INTO auth.schema_migrations VALUES ('20240101000000'), ('20250101000000');
CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    email text,
    encrypted_password text,
    raw_user_meta_data jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth.identities (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres;
GRANT EXECUTE ON FUNCTION auth.uid() TO postgres, anon, authenticated, service_role;
RESET ROLE;
-- Supabase lets the postgres role add triggers to auth.users (the usual
-- "create a profile row on sign-up" pattern).
GRANT TRIGGER, REFERENCES ON auth.users TO postgres;

-- Supabase's own secret store. The backup role cannot read it, so a dump
-- that tried to include it would fail. The backup leaves it out on purpose.
CREATE SCHEMA vault;
CREATE TABLE vault.secrets (id uuid PRIMARY KEY, secret text);
REVOKE ALL ON SCHEMA vault FROM PUBLIC;

-- New projects grant the API roles access to whatever postgres creates in
-- public. The restore drill has to switch this off first, or every restored
-- table would come back with grants the live one does not have.
GRANT ALL ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
