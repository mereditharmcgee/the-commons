-- supporter-heart: only an admin (or the Ko-fi webhook) sets the supporter
-- heart, and the admin "Mark Supporter" button actually changes the row.
--
-- What: (1) guard_facilitator_supporter(), a BEFORE INSERT OR UPDATE trigger
--       on facilitators. When the caller is one of the two PostgREST client
--       roles (anon, authenticated) and is not is_admin(), it rejects an
--       INSERT with is_supporter = true and an UPDATE that changes
--       is_supporter, with SQLSTATE 42501. Every other role passes:
--       service_role (supabase/functions/kofi-webhook sets the heart by
--       email with the service key), postgres (SQL editor, and every
--       SECURITY DEFINER function, since they are all postgres-owned).
--       The function is SECURITY INVOKER on purpose: current_user has to be
--       the caller, and a DEFINER trigger would always see postgres.
--       (2) "Admins can update facilitators", a permissive UPDATE policy,
--       TO authenticated, USING and WITH CHECK (SELECT public.is_admin()).
--       It is ORed with the existing "Users can update own facilitator
--       profile" (auth.uid() = id), which stays as it is. Created in a DO
--       block guarded by pg_policies; on a replay the ELSE branch re-asserts
--       it with ALTER POLICY, so nothing is dropped.
--       (3) Column grants: REVOKE table-level UPDATE on facilitators from
--       anon and authenticated, then GRANT UPDATE (display_name,
--       notification_prefs, arrival_source, is_supporter) TO authenticated.
--       Those are the only columns any client writes: Auth.updateFacilitator
--       is called with display_name (dashboard.js:318), arrival_source
--       (:879) and notification_prefs (:1598); js/admin.js:1633 writes
--       is_supporter, which the trigger in (1) gates. id, email and
--       created_at lose UPDATE for both client roles. anon keeps no UPDATE
--       at all (it never had a passing policy). SELECT, INSERT and DELETE
--       grants are untouched.
-- Why:  F04-partial (sweep 2026-10-17), also feature-audit-2026-08 #34 (open
--       since August). Live 2026-10-17: facilitators has four policies and
--       the only UPDATE one is the owner policy, with no WITH CHECK, so
--       authenticated holds table-level UPDATE on every column and any
--       signed-in facilitator can PATCH /rest/v1/facilitators?id=eq.<self>
--       {"is_supporter": true} and get the heart that ai_identity_stats
--       shows on voices.js:142 and profile.js:122. The same account could
--       also PATCH email, and kofi-webhook matches supporters by
--       facilitators.email, so a borrowed address would collect someone
--       else's Ko-fi heart. A brand-new account can set is_supporter = true
--       in its own first INSERT ("Users can insert own facilitator profile"
--       checks only auth.uid() = id). In the other direction, the admin's
--       toggleSupporter runs .update({ is_supporter }).eq('id', id) as
--       authenticated; with no admin UPDATE policy RLS turns every row but
--       her own into a silent 0-row update, and the button flips to
--       "Supporter" anyway. facilitators has no triggers today.
-- Risk: low. Additive trigger and policy, plus a narrowing grant on columns
--       no client writes. Watch for:
--       - Any future client write to facilitators.email, id or created_at
--         now fails with 42501 "permission denied for table facilitators".
--         None exists (grep .from('facilitators') and updateFacilitator).
--       - The admin can now UPDATE the four granted columns on any
--         facilitator row, not just is_supporter. The admin UI only writes
--         is_supporter.
--       - A supporter can no longer clear their own heart; the admin can.
--       - One more "multiple permissive policies" performance advisory
--         (authenticated UPDATE on facilitators). (SELECT is_admin()) is an
--         InitPlan, so it costs one admins lookup per statement.
--       - Postgres-owned SECURITY DEFINER code is unaffected by both the
--         trigger and the grants (delete_account, admin_delete_account,
--         remote_mcp_private.lock_grant / lock_visit_grant FOR KEY SHARE).
--       Not included: the js/admin.js half (toggleSupporter should add
--       .select('id') and treat 0 rows as failure), which ships with the
--       site, not the migration. After this patch the admin update lands
--       for real, so the button stops lying even before that JS change;
--       the JS change keeps it honest if a row is ever missing.
--       The posts / marginalia / postcards half of F04 is separate.
--       Specimens in the rolled-back dry run (supporter-heart.dryrun.sql):
--       before the patch a throwaway facilitator self-awards (1 row, true)
--       and the admin marks it (0 rows); after it, the self-award and a
--       hearted signup INSERT both raise 42501, an email PATCH raises 42501,
--       an ordinary display_name / notification_prefs / arrival_source
--       PATCH and a plain signup INSERT still succeed, the admin marks and
--       unmarks a throwaway row (1 row each), service_role sets it by
--       email (1 row), anon gets 42501, and the 9 real supporters and the
--       admin's own row are unchanged.
-- Applied: 2026-10-17 via mcp apply_migration (supporter_heart), rolled-back dry run first; dry-run script kept in the session scratchpad.

-- (1) guard -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_facilitator_supporter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $function$
BEGIN
  -- Only the PostgREST client roles are checked. service_role (kofi-webhook)
  -- and postgres (SQL editor, postgres-owned SECURITY DEFINER functions) pass.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_supporter IS TRUE AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'is_supporter is set by an admin, not by the account itself'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.is_supporter IS DISTINCT FROM OLD.is_supporter AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'is_supporter is set by an admin, not by the account itself'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.guard_facilitator_supporter() IS
  'BEFORE INSERT OR UPDATE on facilitators: anon/authenticated callers who are not is_admin() cannot set or change is_supporter (42501). service_role (kofi-webhook) and postgres pass. SECURITY INVOKER on purpose: it reads current_user. F04-partial / feature-audit-2026-08 #34.';

CREATE OR REPLACE TRIGGER facilitators_guard_supporter_trg
  BEFORE INSERT OR UPDATE ON public.facilitators
  FOR EACH ROW EXECUTE FUNCTION public.guard_facilitator_supporter();

-- (2) admin UPDATE policy -------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'facilitators'
                    AND policyname = 'Admins can update facilitators') THEN
    CREATE POLICY "Admins can update facilitators" ON public.facilitators
      FOR UPDATE TO authenticated
      USING ((SELECT public.is_admin()))
      WITH CHECK ((SELECT public.is_admin()));
  ELSE
    ALTER POLICY "Admins can update facilitators" ON public.facilitators
      TO authenticated
      USING ((SELECT public.is_admin()))
      WITH CHECK ((SELECT public.is_admin()));
  END IF;
END $$;

COMMENT ON POLICY "Admins can update facilitators" ON public.facilitators IS
  'Lets the admin panel''s Mark Supporter (js/admin.js toggleSupporter) reach other facilitators'' rows; without it RLS made that update a silent 0-row no-op. Column grants limit what any authenticated UPDATE can touch. F04-partial / feature-audit-2026-08 #34.';

-- (3) column grants -------------------------------------------------------------
-- REVOKE on the table also removes any column-level UPDATE grants, so the
-- pair converges on a replay.
REVOKE UPDATE ON public.facilitators FROM anon, authenticated;
GRANT UPDATE (display_name, notification_prefs, arrival_source, is_supporter)
  ON public.facilitators TO authenticated;
