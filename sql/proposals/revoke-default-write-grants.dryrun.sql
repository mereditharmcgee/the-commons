-- revoke-default-write-grants.dryrun: what the migration would do, against live.
--
-- STATUS: PROPOSAL. Section A is read-only and safe to run in the SQL
-- editor at any time. Section B writes, but only inside a transaction that
-- ends in ROLLBACK; run it from psql, where \i works.
--
-- Pass condition: every A-check result matches the "Expect" line, A1 and A4
-- are understood and resolved, and Section B ends in DRYRUN PASS.
-- Anything else: stop, update the keep list or the assumptions in
-- revoke-default-write-grants.sql, and re-run.

-- ===========================================================================
-- Section A: read-only diagnostics
-- ===========================================================================

-- A1. text_shapes (the urgent one). Two questions:
--     is the view running as its owner, and does anon hold write grants on it?
--     Expect: reloptions contains security_invoker=true, and anon_writes empty.
--     If reloptions is NULL or lacks it AND anon_writes lists DELETE or
--     UPDATE, an anonymous DELETE through the view would delete texts (and
--     cascade marginalia) past RLS. Apply the text_shapes lines of the
--     migration first, on their own, with Meredith's go.
SELECT c.reloptions,
       (SELECT string_agg(a.privilege_type, ',' ORDER BY a.privilege_type)
          FROM aclexplode(c.relacl) a
         WHERE a.grantee = 'anon'::regrole
           AND a.privilege_type <> 'SELECT') AS anon_writes,
       pg_get_userbyid(c.relowner) AS owner,
       (SELECT rolbypassrls FROM pg_roles WHERE oid = c.relowner) AS owner_bypasses_rls
  FROM pg_class c
 WHERE c.oid = 'public.text_shapes'::regclass;
-- Same question for every other view in public: which views run as owner,
-- and which hold anon/authenticated write grants. Only views that are
-- automatically updatable can be written through; is_updatable says which.
SELECT v.table_name, v.is_updatable, v.is_insertable_into, c.reloptions,
       (SELECT string_agg(DISTINCT a.privilege_type, ',')
          FROM aclexplode(c.relacl) a
         WHERE a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
           AND a.privilege_type <> 'SELECT') AS client_writes
  FROM information_schema.views v
  JOIN pg_class c ON c.oid = format('%I.%I', v.table_schema, v.table_name)::regclass
 WHERE v.table_schema = 'public'
 ORDER BY v.is_updatable DESC, v.table_name;

-- A2. Grant inventory. Expect about 44 tables plus the views (the
--     2026-09-11 count was tables only).
SELECT c.relkind, count(DISTINCT c.oid) AS relations, count(*) AS grants
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
 WHERE n.nspname = 'public'
   AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
   AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
   AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
 GROUP BY c.relkind;

-- A3. The would-revoke list. Paste the keep list from the migration into
--     the VALUES below if it changes. Read every row: each is a write the
--     site would lose. Expect: none of them is a path the site uses.
WITH keep(relation, grantee, privilege_type) AS (
    SELECT 'public.' || t, r, 'INSERT'
      FROM unnest(ARRAY['posts','marginalia','postcards','discussions','text_submissions','contact','moment_comments']) t,
           unnest(ARRAY['anon','authenticated']) r
    UNION ALL VALUES
    ('public.ai_identities','authenticated','INSERT'),('public.ai_identities','authenticated','UPDATE'),
    ('public.facilitators','authenticated','INSERT'),('public.facilitators','authenticated','UPDATE'),
    ('public.posts','authenticated','UPDATE'),('public.marginalia','authenticated','UPDATE'),
    ('public.postcards','authenticated','UPDATE'),('public.notifications','authenticated','UPDATE'),
    ('public.subscriptions','authenticated','INSERT'),('public.subscriptions','authenticated','DELETE'),
    ('public.post_reactions','authenticated','INSERT'),('public.post_reactions','authenticated','UPDATE'),('public.post_reactions','authenticated','DELETE'),
    ('public.discussion_reactions','authenticated','INSERT'),('public.discussion_reactions','authenticated','UPDATE'),('public.discussion_reactions','authenticated','DELETE'),
    ('public.marginalia_reactions','authenticated','INSERT'),('public.marginalia_reactions','authenticated','DELETE'),
    ('public.moment_reactions','authenticated','INSERT'),('public.moment_reactions','authenticated','DELETE'),
    ('public.postcard_reactions','authenticated','INSERT'),('public.postcard_reactions','authenticated','DELETE'),
    ('public.interest_memberships','authenticated','INSERT'),('public.interest_memberships','authenticated','UPDATE'),('public.interest_memberships','authenticated','DELETE'),
    ('public.interest_endorsements','authenticated','INSERT'),('public.interest_endorsements','authenticated','DELETE'),
    ('public.interests','authenticated','INSERT'),('public.interests','authenticated','UPDATE'),('public.interests','authenticated','DELETE'),
    ('public.voice_guestbook','authenticated','INSERT'),('public.voice_guestbook','authenticated','UPDATE'),
    ('public.agent_tokens','authenticated','UPDATE'),
    ('public.discussions','authenticated','UPDATE'),('public.text_submissions','authenticated','UPDATE'),
    ('public.contact','authenticated','UPDATE'),('public.postcard_prompts','authenticated','INSERT'),
    ('public.postcard_prompts','authenticated','UPDATE'),('public.moments','authenticated','UPDATE'),
    ('public.texts','authenticated','INSERT'),('public.texts','authenticated','DELETE')
)
SELECT c.oid::regclass::text AS relation, c.relkind, a.grantee::regrole::text AS grantee, a.privilege_type,
       EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
                AND p.polcmd IN (CASE a.privilege_type WHEN 'INSERT' THEN 'a' WHEN 'UPDATE' THEN 'w' WHEN 'DELETE' THEN 'd' END, '*')) AS has_policy_for_cmd
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
 WHERE n.nspname = 'public'
   AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
   AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
   AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
   AND (c.oid::regclass::text, a.grantee::regrole::text, a.privilege_type) NOT IN (SELECT * FROM keep)
 ORDER BY has_policy_for_cmd DESC, relation, grantee, privilege_type;
-- Rows with has_policy_for_cmd = true are the ones to look at hardest: a
-- policy exists for that command, so some client may be using it. Either
-- find the caller (add to the keep list) or confirm the policy is dead.

-- A4. Triggers whose function is NOT security definer: they run as the
--     caller, so any table they write needs the caller's grant.
--     Expect: only BEFORE triggers that edit NEW, plus auto_link_ai_identity
--     (covered by the keep list). Any other function that INSERTs, UPDATEs
--     or DELETEs another table blocks the apply until handled.
SELECT t.tgrelid::regclass AS on_table, t.tgname, p.proname,
       CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
       p.prosrc ~* '\m(insert\s+into|update|delete\s+from)\M' AS body_writes
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE NOT t.tgisinternal
   AND NOT p.prosecdef
   AND t.tgrelid::regclass::text NOT LIKE 'auth.%'
   AND t.tgrelid::regclass::text NOT LIKE 'storage.%'
 ORDER BY body_writes DESC, on_table, t.tgname;

-- A5. Column grants that a table-level REVOKE would destroy (the migration
--     raises on these). Expect: no row whose privilege is outside the keep
--     list for that table.
SELECT c.oid::regclass AS relation, x.grantee::regrole AS grantee, x.privilege_type,
       string_agg(at.attname, ',' ORDER BY at.attnum) AS columns
  FROM pg_attribute at
  JOIN pg_class c ON c.oid = at.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(at.attacl) x
 WHERE n.nspname = 'public'
   AND x.grantee IN ('anon'::regrole, 'authenticated'::regrole)
   AND x.privilege_type IN ('INSERT', 'UPDATE', 'REFERENCES')
 GROUP BY 1, 2, 3
 ORDER BY 1, 2, 3;

-- A6. Default ACL owners. Expect: one row set for postgres in public. A row
--     for supabase_admin (or another owner) is not changed by Part 2.
SELECT d.defaclrole::regrole AS owner_role, n.nspname, d.defaclobjtype,
       a.grantee::regrole AS grantee, string_agg(a.privilege_type, ',') AS privs
  FROM pg_default_acl d
  LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
 WHERE a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
 GROUP BY 1, 2, 3, 4
 ORDER BY 1, 2, 3, 4;

-- A7. Table owners and PUBLIC grants. Expect: every public table owned by
--     postgres; no PUBLIC write grant.
SELECT pg_get_userbyid(c.relowner) AS owner, count(*) FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
 GROUP BY 1;
SELECT c.oid::regclass, a.privilege_type
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
 WHERE n.nspname = 'public' AND a.grantee = 0 AND a.privilege_type <> 'SELECT';

-- A8. grant_audit must not exist yet, and must not be an exposed schema.
SELECT to_regnamespace('grant_audit') AS grant_audit_exists;   -- Expect NULL
-- Exposed schemas: Dashboard > Settings > API. Expect public, graphql_public.

-- ===========================================================================
-- Section B: rehearsal in a transaction that is always rolled back (psql)
-- ===========================================================================
-- \set ON_ERROR_STOP on
-- BEGIN;
-- \i sql/proposals/revoke-default-write-grants.sql
--
-- -- B1. Behavioral probe: the anonymous write path still works. Fill in a
-- --     live, open discussion id. The INSERT fires every posts trigger as
-- --     anon, so an invoker trigger that lost its grant fails here.
-- SET LOCAL ROLE anon;
-- SELECT set_config('request.headers', '{"x-forwarded-for":"192.0.2.1"}', true);
-- INSERT INTO public.posts (discussion_id, content, model, ai_name)
--      VALUES ('<open discussion uuid>', 'dry run probe, rolled back', 'Claude', 'dryrun');
-- RESET ROLE;
--
-- -- B2. The same for a signed-in write that goes through an invoker
-- --     trigger: creating an identity (auto_link_ai_identity). Fill in a
-- --     facilitator id; the claims make auth.uid() return it.
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claims', '{"sub":"<facilitator uuid>","role":"authenticated"}', true);
-- INSERT INTO public.ai_identities (facilitator_id, name, model)
--      VALUES ('<facilitator uuid>', 'dryrun probe', 'Claude');
-- RESET ROLE;
--
-- -- B3. The text_shapes hole is closed.
-- SELECT has_table_privilege('anon', 'public.text_shapes', 'DELETE') AS anon_can_delete_text_shapes; -- Expect f
--
-- SELECT 'DRYRUN PASS';
-- ROLLBACK;
