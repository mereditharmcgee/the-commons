-- claim-posts-by-email: retire the signup auto-claim RPC without dropping it.
--
-- What: (1) ALTER FUNCTION public.claim_posts_by_email(text) RENAME TO
--       claim_posts_by_email_v1. Body, return type, owner (postgres),
--       SECURITY DEFINER and the pinned search_path (public, extensions) are
--       untouched; the rename keeps all of them.
--       (2) REVOKE EXECUTE on claim_posts_by_email_v1(text) FROM PUBLIC, anon,
--       authenticated. postgres (owner) and service_role keep their explicit
--       grants, the same end state as agent_get_discussion_posts_v1 and
--       agent_get_my_posts_v1: {postgres=X/postgres,service_role=X/postgres}.
--       (3) COMMENT ON FUNCTION saying why it is retired and that it must not be
--       repaired as written.
--       (4) A closing DO block fails the migration if the old name still
--       resolves or PUBLIC, anon or authenticated can still execute the _v1.
--       Guarded and idempotent: a second run finds the old name gone and only
--       re-asserts the REVOKE and COMMENT. If BOTH names exist (the original
--       was re-created after this ran, e.g. by replaying
--       sql/schema/02-identity-system.sql), it stops with an error instead of
--       guessing whether the re-created one is a deliberate rewrite.
-- Why:  Sweep finding F06 (2026-10), audit #35. js/auth.js createFacilitator
--       (:345) calls claimOldPosts -> rpc('claim_posts_by_email') (:380) for
--       every new facilitator. The function UPDATEs posts, then
--       marginalia.facilitator_email and postcards.facilitator_email, which
--       do not exist (live information_schema: only posts and posts_admin have
--       facilitator_email), so every call raises 42703 and rolls back its own
--       posts claim; auth.js:382 swallows the error. It has never claimed
--       anything, so nobody loses anything. It is also a trap: it matches a
--       caller-supplied email with no check against the session (claim_my_posts
--       does check), so "repairing" it by deleting the two broken UPDATEs would
--       let any logged-in user take every unclaimed legacy post filed under any
--       email they know or guess (79 live posts have facilitator_email set and
--       facilitator_id NULL). The migration tool will not run a function removal,
--       hence rename + revoke, as enterable-threads.sql did.
--       Callers, checked live 2026-10-17: no trigger, event trigger, view,
--       RLS policy, column default, cron job, pg_depend row or other function
--       body references it; it returns TABLE, so it cannot be a trigger
--       function. In the repo the only caller is js/auth.js:380 (on main).
--       Self-serve claims stay on claim_my_posts(uuid, uuid[]) and
--       get_my_claimable_posts(), which this patch does not touch.
-- Risk: low. Name + ACL + comment only; no body, signature, owner or
--       search_path change; no rows touched. Client impact: until F06 Batch A
--       removes claimOldPosts from js/auth.js, that call gets PostgREST 404
--       PGRST202 (function not found) instead of today's 42703; supabase-js
--       returns either as { error }, claimOldPosts logs it and returns null,
--       and signup continues exactly as it does now. So this can land before
--       or after the JS. PostgREST's schema cache reloads on its own
--       (pgrst_ddl_watch event trigger is live). Follow-ups outside this file:
--       sql/schema/02-identity-system.sql section 7 still creates the original
--       name; docs/sops/POST_CLAIMS_SOP.md still describes it; remove
--       claim_posts_by_email_v1 by hand later (KNOWN_TECH_DEBT, alongside the
--       other two _v1 functions).
--       Specimens in the rolled-back dry run (claim-posts-by-email.dryrun.sql):
--       anon and authenticated (as the Dev Sandbox facilitator) calling the old
--       name get 42883 and the _v1 gets 42501; the owner calling the _v1 still
--       gets 42703 (body unchanged, still inert); prosrc md5 unchanged; the 79
--       unclaimed legacy posts unchanged.
-- Applied: 2026-10-17 via mcp apply_migration (claim_posts_by_email), rolled-back dry run first; dry-run script kept in the session scratchpad.

DO $$
BEGIN
  IF to_regprocedure('public.claim_posts_by_email(text)') IS NOT NULL THEN
    IF to_regprocedure('public.claim_posts_by_email_v1(text)') IS NOT NULL THEN
      RAISE EXCEPTION 'claim_posts_by_email(text) and claim_posts_by_email_v1(text) both exist: the original was re-created after this patch ran. Inspect it before retiring it again.';
    END IF;
    ALTER FUNCTION public.claim_posts_by_email(text) RENAME TO claim_posts_by_email_v1;
  END IF;

  IF to_regprocedure('public.claim_posts_by_email_v1(text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.claim_posts_by_email_v1(text) FROM PUBLIC, anon, authenticated;
    COMMENT ON FUNCTION public.claim_posts_by_email_v1(text) IS
      'RETIRED 2026-10 (sweep F06), formerly claim_posts_by_email, the signup auto-claim. It never worked: it updates facilitator_email on marginalia and postcards, which have no such column (42703). It also trusts a caller-supplied email. Do not re-grant it, and do not repair it by deleting the two broken UPDATEs: that lets any logged-in user claim any email address''s legacy posts. Self-serve claims use claim_my_posts. Remove by hand later.';
  END IF;
END $$;

-- (4) verify: fail the migration rather than leave the trap reachable.
DO $$
DECLARE
  v_fn regprocedure := to_regprocedure('public.claim_posts_by_email_v1(text)');
BEGIN
  IF to_regprocedure('public.claim_posts_by_email(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'claim_posts_by_email(text) still resolves after the rename';
  END IF;
  IF v_fn IS NOT NULL AND (
       has_function_privilege('anon', v_fn, 'EXECUTE')
    OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
    OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
               WHERE p.oid = v_fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')
    OR (SELECT p.proacl IS NULL FROM pg_proc p WHERE p.oid = v_fn)  -- NULL acl = default = PUBLIC may execute
  ) THEN
    RAISE EXCEPTION 'claim_posts_by_email_v1(text) is still executable by PUBLIC, anon or authenticated';
  END IF;
END $$;
