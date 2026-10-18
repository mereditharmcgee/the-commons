-- legacy-email-paths-off.dryrun.sql: rolled-back rehearsal of
-- legacy-email-paths-off.sql. It changes nothing; never record it as applied.
--
-- Run the whole file as one script (Supabase SQL editor, or execute_sql). It
-- always ends in an error on purpose, so nothing commits even if the closing
-- ROLLBACK is never reached:
--   DRYRUN PASS ...  all five names exist; no overload is executable by PUBLIC,
--                    anon or authenticated (has_function_privilege); a real
--                    call to each repo signature, as anon and as authenticated,
--                    is refused with 42501 after a confirmed role switch; no
--                    SECURITY INVOKER function and no RLS policy names one of
--                    the five; the session's role is back where it started.
--   DRYRUN FAIL ...  one of those did not hold; the values say which.
-- If the patch's own verify block raises first, its message comes back instead.
--
-- The values: overload and name counts; any overload still open to a client
-- role; each call's result (42501 = refused; 'ran' = the call went through and
-- was rolled back here; 'no-role-switch:...' = SET ROLE itself failed, so that
-- call proves nothing); other functions, policies and views whose text names
-- one of the five; and each overload's ACL after the revoke (postgres and
-- service_role should remain). The calls use the all-zero uuid, NULLs and an
-- empty array, so even a call that ran would match no row.
--
-- Between BEGIN and the DRYRUN block: the body of legacy-email-paths-off.sql,
-- verbatim (tests/claim-page.test.js checks that it still matches).

BEGIN;

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

-- ---------------------------------------------------------------------------
-- DRYRUN: check the result, then always raise (PASS or FAIL) so it rolls back.
-- ---------------------------------------------------------------------------
DO $dryrun$
DECLARE
    v_names text[] := ARRAY['edit_my_legacy_post', 'delete_my_legacy_post',
                            'get_my_legacy_post_ids', 'get_my_claimable_posts',
                            'claim_my_posts'];
    -- The repo's signatures, each with a call that matches no row even if it ran.
    v_sigs text[] := ARRAY[
        'public.edit_my_legacy_post(uuid,text,text,text,text)',
        'public.delete_my_legacy_post(uuid)',
        'public.get_my_legacy_post_ids()',
        'public.get_my_claimable_posts()',
        'public.claim_my_posts(uuid,uuid[])'];
    v_calls_sql text[] := ARRAY[
        'SELECT count(*) FROM public.edit_my_legacy_post(''00000000-0000-0000-0000-000000000000''::uuid, NULL, NULL, NULL, NULL)',
        'SELECT public.delete_my_legacy_post(''00000000-0000-0000-0000-000000000000''::uuid)',
        'SELECT count(*) FROM public.get_my_legacy_post_ids()',
        'SELECT count(*) FROM public.get_my_claimable_posts()',
        'SELECT public.claim_my_posts(''00000000-0000-0000-0000-000000000000''::uuid, ARRAY[]::uuid[])'];
    v_pattern text := '(edit_my_legacy_post|delete_my_legacy_post|get_my_legacy_post_ids|get_my_claimable_posts|claim_my_posts)';
    v_role_before text := current_user;
    r record;
    v_role text;
    v_state text;
    v_switched boolean;
    v_overloads int := 0;
    v_names_found int;
    v_open text[] := '{}';
    v_acl text[] := '{}';
    v_calls text[] := '{}';
    v_calls_made int := 0;
    v_calls_refused int := 0;
    v_fn_callers text[];
    v_invoker_callers int;
    v_policies text[];
    v_views text[];
    v_summary text;
BEGIN
    -- 1. Privileges on every overload of the five names.
    FOR r IN
        SELECT p.oid, p.oid::regprocedure::text AS sig, p.proacl
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname = ANY (v_names)
        ORDER BY p.oid::regprocedure::text
    LOOP
        v_overloads := v_overloads + 1;
        v_acl := v_acl || (r.sig || ' ' || coalesce(r.proacl::text, 'NULL (default ACL: PUBLIC may execute)'));
        IF has_function_privilege('public', r.oid, 'EXECUTE') THEN
            v_open := v_open || ('PUBLIC ' || r.sig);
        END IF;
        IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
            v_open := v_open || ('anon ' || r.sig);
        END IF;
        IF has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
            v_open := v_open || ('authenticated ' || r.sig);
        END IF;
    END LOOP;

    SELECT count(DISTINCT p.proname) INTO v_names_found
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = ANY (v_names);

    -- 2. A real call as each client role. Expect 42501 every time. Each call
    -- runs in its own subtransaction that always ends in an exception, which
    -- undoes the call and the SET LOCAL ROLE together.
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        FOR i IN 1 .. cardinality(v_sigs) LOOP
            IF to_regprocedure(v_sigs[i]) IS NULL THEN
                v_calls := v_calls || (v_role || ' ' || v_sigs[i] || '=missing');
                CONTINUE;
            END IF;
            v_switched := false;
            BEGIN
                EXECUTE format('SET LOCAL ROLE %I', v_role);
                v_switched := (current_user = v_role);
                EXECUTE v_calls_sql[i];
                RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'dry run: the call ran';
            EXCEPTION WHEN OTHERS THEN
                v_state := CASE
                    WHEN NOT v_switched THEN 'no-role-switch:' || SQLSTATE
                    WHEN SQLSTATE = 'P0099' THEN 'ran'
                    ELSE SQLSTATE
                END;
            END;
            v_calls_made := v_calls_made + 1;
            IF v_state = '42501' THEN
                v_calls_refused := v_calls_refused + 1;
            END IF;
            v_calls := v_calls || (v_role || ' ' || v_sigs[i] || '=' || v_state);
        END LOOP;
    END LOOP;

    -- 3. Anything else whose text names one of the five.
    SELECT coalesce(array_agg(p.oid::regprocedure::text
                              || CASE WHEN p.prosecdef THEN ' (definer)' ELSE ' (INVOKER)' END
                              ORDER BY p.oid::regprocedure::text), '{}'),
           count(*) FILTER (WHERE NOT p.prosecdef)
      INTO v_fn_callers, v_invoker_callers
    FROM pg_proc p
    WHERE p.prosrc ~ v_pattern
      AND NOT (p.pronamespace = 'public'::regnamespace AND p.proname = ANY (v_names));

    SELECT coalesce(array_agg(format('%I.%I:%s', schemaname, tablename, policyname)), '{}')
      INTO v_policies
    FROM pg_policies
    WHERE (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ v_pattern;

    SELECT coalesce(array_agg(format('%I.%I', schemaname, viewname)), '{}')
      INTO v_views
    FROM pg_views
    WHERE definition ~ v_pattern;

    v_summary := format(
        'legacy-email-paths-off: overloads=%s names_found=%s/5 open_to_clients=%s calls_made=%s/10 refused_42501=%s calls=%s other_function_callers=%s invoker_callers=%s policies=%s views=%s role_before=%s role_after=%s acl_after=%s',
        v_overloads, v_names_found, v_open, v_calls_made, v_calls_refused, v_calls,
        v_fn_callers, v_invoker_callers, v_policies, v_views, v_role_before, current_user, v_acl);

    IF v_names_found = 5
       AND cardinality(v_open) = 0
       AND v_calls_made = 10
       AND v_calls_refused = 10
       AND v_invoker_callers = 0
       AND cardinality(v_policies) = 0
       AND current_user = v_role_before THEN
        RAISE EXCEPTION 'DRYRUN PASS %', v_summary;
    ELSE
        RAISE EXCEPTION 'DRYRUN FAIL %', v_summary;
    END IF;
END
$dryrun$;

ROLLBACK;
