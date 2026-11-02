-- revoke-default-write-grants: anon and authenticated keep only the table
-- writes the site actually makes; every other default write grant goes.
--
-- STATUS: PROPOSAL. NOT APPLIED. Drafted 2026-11-02 by an agent session with
--         no database access, from the repo alone. sql/ may not match the
--         live database. Every line marked ASSUMPTION must be checked against
--         live by a local session (run revoke-default-write-grants.dryrun.sql
--         Section A first) before this could run. Migration gate: Meredith's
--         explicit "apply", every time.
--
-- What: (0) Snapshots every table-level INSERT/UPDATE/DELETE/TRUNCATE/
--       REFERENCES/TRIGGER grant that anon and authenticated hold on a
--       relation in public (tables, views, matviews, foreign tables), plus the
--       matching default ACL rows, into a new unexposed schema grant_audit.
--       The rollback replays from that snapshot.
--       (1) REVOKEs each snapshotted grant that is not on the keep list below.
--       SELECT is never touched. Column-level grants are never touched: if a
--       table-level REVOKE would also drop column grants for the same role
--       and privilege, the migration stops instead.
--       (2) ALTER DEFAULT PRIVILEGES so tables postgres creates in public from
--       now on start with SELECT-only grants for anon and authenticated
--       (headlines-table.sql already did this by hand for one table).
--       (3) Puts text_shapes back to security_invoker = true. See "Why" (b).
--       (4) Fails the transaction if any non-kept write grant survives, or if
--       a keep-list grant that existed before is gone after.
--
-- Why:  (a) KNOWN_TECH_DEBT.md MEDIUM, found 2026-09-11: 44 tables carry the
--       Supabase default ALL grant for anon and authenticated, so RLS is the
--       only guard. A table whose RLS is disabled, or that gains a permissive
--       write policy by mistake, is instantly writable with the public key.
--       TRUNCATE is not subject to RLS at all (PostgREST cannot issue it, so
--       today it is reachable only through SQL, but it should not be held).
--       (b) Views get the same default grants, and RLS on a view's base table
--       is checked as the VIEW OWNER unless security_invoker = true.
--       text_shapes is a single-table view over texts with no join, GROUP BY
--       or aggregate at its own level, so Postgres treats it as automatically
--       updatable (id, title, author, category, source, added_at). It was
--       flipped to security_invoker on 2026-06-09, but
--       text-shapes-marginalia-active.sql later ran CREATE OR REPLACE VIEW
--       with no WITH clause, and CREATE OR REPLACE VIEW replaces the view's
--       options with the (empty) list given. If that patch was applied, the
--       view runs as its owner, and if anon also still holds the default
--       DELETE/UPDATE grant on it, an anonymous
--         DELETE /rest/v1/text_shapes?id=not.is.null
--       would delete every Reading Room text as the owner, past RLS, and
--       marginalia.text_id is ON DELETE CASCADE. Not tested: the auditing
--       session was limited to GET. Dry-run Section A, check A1, answers it
--       with two read-only queries. If A1 shows both conditions true, treat
--       it as urgent and apply Parts (1) and (3) for text_shapes on their own
--       first; the same view-option trap is why appearance-profile-field.sql
--       re-runs ALTER VIEW ... SET (security_invoker = true).
--
-- Risk: medium. A missed direct-write path breaks a live feature for every
--       user until rolled back. The keep list was built by reading every
--       Supabase-client .insert/.update/.upsert/.delete and every raw
--       POST/PATCH in js/ on 2026-11-02 (file references inline). Writes made
--       by SECURITY DEFINER functions and by the agent_*/admin_*/remote_mcp_*
--       RPCs are unaffected, since they run as the function owner. The real
--       exposure is a trigger function WITHOUT security definer that writes
--       to another table: it runs as the caller, so it needs the caller's
--       grant on that other table. Dry-run check A4 lists every such trigger.
--       ASSUMPTION: from the repo, auto_link_ai_identity (invoker, on
--       ai_identities INSERT, as authenticated) updates posts, marginalia and
--       postcards; authenticated keeps UPDATE on all three, so it is covered.
--       Any other A4 row must be added to the keep list or confirmed to be
--       definer before applying.
--
-- Rollback: revoke-default-write-grants.rollback.sql (re-grants from the
--       snapshot, restores the default ACL rows, restores text_shapes'
--       options as they were). The snapshot schema stays until dropped by
--       hand after the change has been live for a while.
--
-- ASSUMPTIONS a local session must check against live (dry-run Section A):
--   A-1  Roles anon, authenticated, postgres exist and this runs as postgres
--        (or a member of it). apply_migration runs as postgres.
--   A-2  Every public table the site writes is owned by postgres, and the
--        default ACL that granted ALL is "FOR ROLE postgres IN SCHEMA public".
--        If supabase_admin also has a default ACL row for public, Part (2)
--        as written does not touch it (postgres cannot alter another role's
--        defaults unless it is a member); the dry-run lists it.
--   A-3  No grant to PUBLIC carries a table write in public. If one does, it
--        is outside this migration (listed by the dry-run, not revoked).
--   A-4  The keep list matches live usage. In particular: moment_comments
--        takes anon INSERT (js/moment.js:440) but its INSERT policy is not in
--        sql/; chat_messages INSERT is already revoked live (2026-10-17
--        record) and is intentionally not kept.
--   A-5  grant_audit is not in PostgREST's exposed schemas (Settings > API >
--        Exposed schemas; normally public and graphql_public only).
--   A-6  text_shapes should be security_invoker. It was on 2026-06-09 and the
--        advisor baseline of 2026-07-09 lists only posts_admin and
--        ai_identity_stats as accepted definer views.
--   A-7  No column-level INSERT/UPDATE grant sits alongside a table-level
--        grant of the same privilege on a relation where that privilege is
--        NOT kept (the migration raises if it finds one; the dry-run lists
--        them first so nothing is learned mid-apply).
--
-- Not done here on purpose (KNOWN_TECH_DEBT "three anon-grant items
-- deliberately NOT done"): no SELECT grant or column SELECT grant changes,
-- including facilitators.email and discussions.suspicious_score; no EXECUTE
-- changes on any function, including content_shape_ok, ip_rate_limit_ok,
-- posts_rate_limit_ok and get_identity_facilitator_name.
--
-- Applied: NOT APPLIED.

SET LOCAL search_path = pg_catalog;

-- ---------------------------------------------------------------------------
-- Part 0: preflight and snapshot
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        RAISE EXCEPTION 'revoke-default-write-grants: anon/authenticated role missing';
    END IF;
    IF NOT pg_has_role(current_user, 'postgres', 'MEMBER') THEN
        RAISE EXCEPTION 'revoke-default-write-grants: must run as postgres (is %)', current_user;
    END IF;
    IF to_regclass('grant_audit.write_grants_20261102') IS NOT NULL THEN
        RAISE EXCEPTION 'revoke-default-write-grants: snapshot already exists; was this applied before?';
    END IF;
END $$;

CREATE SCHEMA grant_audit;
REVOKE ALL ON SCHEMA grant_audit FROM PUBLIC;

CREATE TABLE grant_audit.write_grants_20261102 AS
SELECT now()                         AS captured_at,
       c.oid::regclass::text         AS relation,   -- schema-qualified (search_path is pg_catalog)
       c.relkind::text               AS relkind,
       a.grantee::regrole::text      AS grantee,
       a.privilege_type::text        AS privilege_type,
       a.is_grantable                AS is_grantable
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
 WHERE n.nspname = 'public'
   AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
   AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
   AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');

CREATE TABLE grant_audit.default_acl_20261102 AS
SELECT d.defaclrole::regrole::text AS owner_role,
       n.nspname::text             AS schema_name,
       d.defaclobjtype::text       AS objtype,
       a.grantee::regrole::text    AS grantee,
       a.privilege_type::text      AS privilege_type
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
 WHERE n.nspname = 'public'
   AND d.defaclobjtype = 'r'
   AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole);

CREATE TABLE grant_audit.view_options_20261102 AS
SELECT c.oid::regclass::text AS relation, c.reloptions
  FROM pg_class c
 WHERE c.oid = to_regclass('public.text_shapes');

REVOKE ALL ON ALL TABLES IN SCHEMA grant_audit FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The keep list: every direct table write the site makes as anon or as a
-- signed-in user. Upsert needs INSERT and UPDATE. Sources are js/ line refs
-- as of 2026-11-02.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE keep_writes (relation text, grantee text, privilege_type text) ON COMMIT DROP;
INSERT INTO keep_writes (relation, grantee, privilege_type)
SELECT 'public.' || t, r, 'INSERT'
  FROM unnest(ARRAY['posts', 'marginalia', 'postcards', 'discussions',
                    'text_submissions', 'contact', 'moment_comments']) AS t,
       unnest(ARRAY['anon', 'authenticated']) AS r;
-- ^ CLAUDE.md "Known Issues" anonymous INSERT surface (Utils.post sends the
--   anon key: js/utils.js:280/287/377, postcards.js:652, suggest-text.js:61,
--   claim.js:76, moment.js:440). authenticated is kept too because the six
--   INSERT policies apply to PUBLIC; tightening that is a separate decision.
INSERT INTO keep_writes (relation, grantee, privilege_type) VALUES
    -- auth.js identity and account management
    ('public.ai_identities',        'authenticated', 'INSERT'),
    ('public.ai_identities',        'authenticated', 'UPDATE'),
    ('public.facilitators',         'authenticated', 'INSERT'),
    ('public.facilitators',         'authenticated', 'UPDATE'),  -- also admin.js
    ('public.posts',                'authenticated', 'UPDATE'),  -- auth.js updatePost, admin.js updateRecord
    ('public.marginalia',           'authenticated', 'UPDATE'),
    ('public.postcards',            'authenticated', 'UPDATE'),
    ('public.notifications',        'authenticated', 'UPDATE'),  -- mark read
    ('public.subscriptions',        'authenticated', 'INSERT'),
    ('public.subscriptions',        'authenticated', 'DELETE'),
    -- reactions (upserts in auth.js; insert/delete in text.js, moment.js, postcards.js)
    ('public.post_reactions',       'authenticated', 'INSERT'),
    ('public.post_reactions',       'authenticated', 'UPDATE'),
    ('public.post_reactions',       'authenticated', 'DELETE'),
    ('public.discussion_reactions', 'authenticated', 'INSERT'),
    ('public.discussion_reactions', 'authenticated', 'UPDATE'),
    ('public.discussion_reactions', 'authenticated', 'DELETE'),
    ('public.marginalia_reactions', 'authenticated', 'INSERT'),
    ('public.marginalia_reactions', 'authenticated', 'DELETE'),
    ('public.moment_reactions',     'authenticated', 'INSERT'),
    ('public.moment_reactions',     'authenticated', 'DELETE'),
    ('public.postcard_reactions',   'authenticated', 'INSERT'),
    ('public.postcard_reactions',   'authenticated', 'DELETE'),
    -- interests (interest.js, interests.js, admin.js)
    ('public.interest_memberships', 'authenticated', 'INSERT'),
    ('public.interest_memberships', 'authenticated', 'UPDATE'),
    ('public.interest_memberships', 'authenticated', 'DELETE'),
    ('public.interest_endorsements','authenticated', 'INSERT'),
    ('public.interest_endorsements','authenticated', 'DELETE'),
    ('public.interests',            'authenticated', 'INSERT'),
    ('public.interests',            'authenticated', 'UPDATE'),
    ('public.interests',            'authenticated', 'DELETE'),
    -- profile.js guestbook (UPDATE is the soft delete)
    ('public.voice_guestbook',      'authenticated', 'INSERT'),
    ('public.voice_guestbook',      'authenticated', 'UPDATE'),
    -- agent-admin.js updateToken
    ('public.agent_tokens',         'authenticated', 'UPDATE'),
    -- admin.js (gated by is_admin() in RLS, but the grant is still needed)
    ('public.discussions',          'authenticated', 'UPDATE'),
    ('public.text_submissions',     'authenticated', 'UPDATE'),
    ('public.contact',              'authenticated', 'UPDATE'),
    ('public.postcard_prompts',     'authenticated', 'INSERT'),
    ('public.postcard_prompts',     'authenticated', 'UPDATE'),
    ('public.moments',              'authenticated', 'UPDATE'),
    ('public.texts',                'authenticated', 'INSERT'),
    ('public.texts',                'authenticated', 'DELETE');

-- ---------------------------------------------------------------------------
-- Part 1: revoke everything snapshotted that is not kept
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
    n_revoked int := 0;
BEGIN
    FOR r IN
        SELECT s.relation, s.grantee, s.privilege_type
          FROM grant_audit.write_grants_20261102 s
         WHERE NOT EXISTS (SELECT 1 FROM keep_writes k
                            WHERE k.relation = s.relation
                              AND k.grantee = s.grantee
                              AND k.privilege_type = s.privilege_type)
         ORDER BY s.relation, s.grantee, s.privilege_type
    LOOP
        -- A table-level REVOKE of INSERT/UPDATE/REFERENCES also removes the
        -- column grants of that privilege. Refuse rather than lose them.
        IF r.privilege_type IN ('INSERT', 'UPDATE', 'REFERENCES') AND EXISTS (
            SELECT 1 FROM pg_attribute at
             CROSS JOIN LATERAL aclexplode(at.attacl) x
             WHERE at.attrelid = r.relation::regclass
               AND x.grantee = r.grantee::regrole
               AND x.privilege_type = r.privilege_type) THEN
            RAISE EXCEPTION 'revoke-default-write-grants: % on % for % has column grants too; decide by hand',
                r.privilege_type, r.relation, r.grantee;
        END IF;
        EXECUTE format('REVOKE %s ON %s FROM %I', r.privilege_type, r.relation, r.grantee);
        n_revoked := n_revoked + 1;
    END LOOP;
    RAISE NOTICE 'revoke-default-write-grants: % grants revoked', n_revoked;
END $$;

-- ---------------------------------------------------------------------------
-- Part 2: new tables start read-only for client roles (ASSUMPTION A-2)
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part 3: text_shapes back to invoker (ASSUMPTION A-6)
-- ---------------------------------------------------------------------------
ALTER VIEW public.text_shapes SET (security_invoker = true);

-- ---------------------------------------------------------------------------
-- Part 4: postchecks
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    leftover int;
    lost int;
BEGIN
    SELECT count(*) INTO leftover
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
       AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
       AND NOT EXISTS (SELECT 1 FROM keep_writes k
                        WHERE k.relation = c.oid::regclass::text
                          AND k.grantee = a.grantee::regrole::text
                          AND k.privilege_type = a.privilege_type);
    IF leftover > 0 THEN
        RAISE EXCEPTION 'revoke-default-write-grants: % non-kept write grants remain', leftover;
    END IF;

    SELECT count(*) INTO lost
      FROM grant_audit.write_grants_20261102 s
      JOIN keep_writes k USING (relation, grantee, privilege_type)
     WHERE NOT has_table_privilege(s.grantee, s.relation, s.privilege_type);
    IF lost > 0 THEN
        RAISE EXCEPTION 'revoke-default-write-grants: % kept grants were lost', lost;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_class
                    WHERE oid = 'public.text_shapes'::regclass
                      AND 'security_invoker=true' = ANY (reloptions)) THEN
        RAISE EXCEPTION 'revoke-default-write-grants: text_shapes is not security_invoker';
    END IF;

    -- The anonymous write path must survive (CLAUDE.md Known Issues).
    IF NOT has_table_privilege('anon', 'public.posts', 'INSERT')
       OR NOT has_table_privilege('anon', 'public.marginalia', 'INSERT')
       OR NOT has_table_privilege('anon', 'public.postcards', 'INSERT') THEN
        RAISE EXCEPTION 'revoke-default-write-grants: anonymous INSERT lost';
    END IF;
END $$;
