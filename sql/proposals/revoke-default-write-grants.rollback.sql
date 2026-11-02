-- revoke-default-write-grants.rollback: undo revoke-default-write-grants.sql.
--
-- STATUS: PROPOSAL. NOT APPLIED. Same gate as the migration.
--
-- What: re-grants every table-level write grant recorded in
--       grant_audit.write_grants_20261102 that the role no longer holds
--       (WITH GRANT OPTION where it had one), re-adds the default ACL rows
--       recorded in grant_audit.default_acl_20261102, and puts text_shapes'
--       options back exactly as snapshotted. Grants that were never revoked
--       are left alone, so running this twice is harmless.
-- Why:  a direct-write path the keep list missed is broken for every user.
--       Prefer the narrow fix (one GRANT for the missing table/privilege)
--       when the broken path is known; this file is the full restore.
-- Risk: low. It restores the pre-migration state, which is today's state:
--       RLS as the only guard on writes. Re-granting text_shapes' old
--       options can put it back in owner-rights mode if that is what the
--       snapshot recorded; drop Part 3 below unless the text_shapes change
--       itself is what broke something.
-- Keeps the grant_audit schema. Drop it by hand when no longer needed:
--       DROP SCHEMA grant_audit CASCADE;
--
-- Applied: NOT APPLIED.

SET LOCAL search_path = pg_catalog;

DO $$
BEGIN
    IF to_regclass('grant_audit.write_grants_20261102') IS NULL THEN
        RAISE EXCEPTION 'rollback: no snapshot; the migration was never applied';
    END IF;
END $$;

-- Part 1: table grants
DO $$
DECLARE
    r record;
    n int := 0;
BEGIN
    FOR r IN SELECT * FROM grant_audit.write_grants_20261102 ORDER BY relation, grantee, privilege_type LOOP
        IF to_regclass(r.relation) IS NULL THEN
            RAISE NOTICE 'rollback: % no longer exists, skipped', r.relation;
            CONTINUE;
        END IF;
        IF NOT has_table_privilege(r.grantee, r.relation, r.privilege_type) THEN
            EXECUTE format('GRANT %s ON %s TO %I%s', r.privilege_type, r.relation, r.grantee,
                           CASE WHEN r.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
            n := n + 1;
        END IF;
    END LOOP;
    RAISE NOTICE 'rollback: % grants restored', n;
END $$;

-- Part 2: default ACL for future tables
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT * FROM grant_audit.default_acl_20261102
              WHERE privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER') LOOP
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT %s ON TABLES TO %I',
                       r.owner_role, r.schema_name, r.privilege_type, r.grantee);
    END LOOP;
END $$;

-- Part 3: text_shapes options (see Risk above before running)
DO $$
DECLARE
    opts text[];
BEGIN
    SELECT reloptions INTO opts FROM grant_audit.view_options_20261102 WHERE relation = 'public.text_shapes';
    IF opts IS NULL OR NOT ('security_invoker=true' = ANY (opts)) THEN
        ALTER VIEW public.text_shapes RESET (security_invoker);
    END IF;
END $$;

-- Postcheck: every snapshotted grant is held again.
DO $$
DECLARE
    missing int;
BEGIN
    SELECT count(*) INTO missing
      FROM grant_audit.write_grants_20261102 s
     WHERE to_regclass(s.relation) IS NOT NULL
       AND NOT has_table_privilege(s.grantee, s.relation, s.privilege_type);
    IF missing > 0 THEN
        RAISE EXCEPTION 'rollback: % grants still missing', missing;
    END IF;
END $$;
