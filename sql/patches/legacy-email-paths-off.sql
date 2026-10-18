-- legacy-email-paths-off: the five self-serve RPCs that decide who owns a
-- legacy post by matching the session's email stop being callable.
--
-- What: REVOKE EXECUTE on every overload of public.edit_my_legacy_post,
--       public.delete_my_legacy_post, public.get_my_legacy_post_ids,
--       public.get_my_claimable_posts and public.claim_my_posts FROM PUBLIC,
--       anon, authenticated. The repo's signatures are
--       edit_my_legacy_post(uuid, text, text, text, text),
--       delete_my_legacy_post(uuid), get_my_legacy_post_ids() and
--       get_my_claimable_posts() (restrict-posts-pii-columns.sql, Parts C-D)
--       and claim_my_posts(uuid, uuid[]) (claim_my_posts_rpc.sql). The revoke
--       loops over pg_proc by name, so a live overload the repo does not know
--       about is covered too. Each overload also gets a COMMENT saying why it is
--       off and what re-enabling it would take. Nothing is dropped and no body,
--       signature, owner or search_path changes: postgres (owner) and
--       service_role keep EXECUTE, so an admin can still run one from the SQL
--       editor or re-grant it. A closing DO block fails the migration if any
--       overload of the five is still executable by PUBLIC, anon or
--       authenticated.
-- Why:  Sweep finding F03 (2026-10-17); Meredith's decision 2026-10-18. All
--       five decide ownership of a legacy post (facilitator_id NULL,
--       facilitator_email set) by matching lower(posts.facilitator_email) to
--       auth.jwt() ->> 'email'. Supabase email confirmation is off, and stays
--       off on purpose (the arrival funnel is single-session), so the JWT email
--       is whatever the person typed at signup. Anyone who signed up with a past
--       contributor's address could edit, hide or claim that person's old posts:
--       78 active posts across 36 emails that have no account (checked
--       2026-10-17). Edits leave a revision; hides and claims leave nothing.
--       None of those posts has ever been edited or claimed through these
--       paths, so turning them off costs close to nothing. Legacy owners now
--       send the request form on claim.html and an admin moves the posts by hand
--       (docs/sops/POST_CLAIMS_SOP.md). claim_my_posts is also executable by
--       anon today (harmless: it raises without auth.uid()); revoking from
--       PUBLIC as well as the two roles closes it whichever grant carries it.
-- Risk: low. ACL and comments only; no rows touched. The site stops calling
--       all five in the same change (js/claim.js, js/auth.js, js/discussion.js).
--       If this lands before that JS ships, the old pages degrade without
--       breaking: the thread page's legacy-id lookup gets an error and offers no
--       edit/delete on email-only posts, claim.html shows "Could not load your
--       posts" above the manual form (which still works), and the edit/delete
--       fallback in auth.js shows a permission error instead of changing the
--       post. If the JS ships first, the five stay callable over /rest/v1/rpc
--       until this is applied, so apply it promptly.
--       Callers were NOT checked live: the session that wrote this had no
--       database access. In the repo only those three js files call the five.
--       Run legacy-email-paths-off.dryrun.sql first; it lists every other
--       function, policy and view that names one of them. A SECURITY INVOKER
--       caller or an RLS policy would need its own grant; a SECURITY DEFINER
--       caller owned by postgres is unaffected.
--       Replaying restrict-posts-pii-columns.sql (Parts C-D) or
--       claim_my_posts_rpc.sql re-grants EXECUTE to authenticated: run this
--       file again after any such replay.
--       To re-enable one later, do it only with proof of mailbox control (a
--       magic-link or recovery session, or Confirm email turned on), e.g.
--       GRANT EXECUTE ON FUNCTION public.get_my_claimable_posts() TO authenticated;
-- Applied: PENDING

DO $revoke$
DECLARE
    r record;
    v_names text[] := ARRAY['edit_my_legacy_post', 'delete_my_legacy_post',
                            'get_my_legacy_post_ids', 'get_my_claimable_posts',
                            'claim_my_posts'];
    v_comment text := 'OFF since 2026-10-18 (sweep F03). Self-serve legacy-post path keyed to the session''s email, and signup does not confirm email addresses, so anyone could sign up as a past contributor. EXECUTE revoked from PUBLIC, anon and authenticated; kept so an admin can run it or re-grant it. Re-grant only with proof of mailbox control. Legacy owners use the claim form on claim.html and an admin moves the posts (docs/sops/POST_CLAIMS_SOP.md). See sql/patches/legacy-email-paths-off.sql.';
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname = ANY (v_names)
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
        EXECUTE format('COMMENT ON FUNCTION %s IS %L', r.sig, v_comment);
    END LOOP;
END
$revoke$;

-- Fail loudly if any overload of the five is still reachable by a client role.
-- A name with no overload at all is only a NOTICE: it cannot be called, and the
-- dry run reports the count.
DO $verify$
DECLARE
    r record;
    v_names text[] := ARRAY['edit_my_legacy_post', 'delete_my_legacy_post',
                            'get_my_legacy_post_ids', 'get_my_claimable_posts',
                            'claim_my_posts'];
    v_found int;
BEGIN
    FOR r IN
        SELECT p.oid, p.oid::regprocedure AS sig
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname = ANY (v_names)
    LOOP
        IF has_function_privilege('public', r.oid, 'EXECUTE')
           OR has_function_privilege('anon', r.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
            RAISE EXCEPTION 'legacy-email-paths-off: % is still executable by PUBLIC, anon or authenticated', r.sig;
        END IF;
    END LOOP;

    SELECT count(DISTINCT p.proname) INTO v_found
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = ANY (v_names);
    IF v_found < cardinality(v_names) THEN
        RAISE NOTICE 'legacy-email-paths-off: only % of the % names exist in public', v_found, cardinality(v_names);
    END IF;
END
$verify$;
