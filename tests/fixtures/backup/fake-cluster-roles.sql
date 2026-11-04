-- Roles for the fake cluster used by tests/backup/roundtrip.sh. Run once, as
-- the cluster superuser (supabase_admin), before either fake database is
-- built. These stand in for the roles a Supabase project already has: the
-- backup runs as "postgres", which on Supabase is not a superuser, so it is
-- not one here either.
CREATE ROLE postgres LOGIN CREATEROLE BYPASSRLS PASSWORD 'fake-only-pw-7Qx2';
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT CREATEROLE;
CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'fake-only-pw-authn';
GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role TO postgres;
