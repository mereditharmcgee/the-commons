-- ===================================================================
-- harden-search-path-and-legacy-policies.sql
--
-- WHAT: 1) Pins search_path = public, extensions on every public-
--          schema function that had none (67 at apply time).
--       2) Drops the four always-true write policies on three dead
--          legacy tables: announcement_reactions (INSERT + DELETE),
--          messages (INSERT), rooms (INSERT). SELECT policies stay.
--
-- WHY: Supabase security advisor findings (2026-07-06 sweep):
--      lint 0011 function_search_path_mutable (71 functions; 8 were
--      pinned earlier today with the agent RPC patches) and lint 0024
--      permissive_rls_policy. The DELETE policy on
--      announcement_reactions said "own" but checked nothing — anyone
--      with the anon key could delete any reaction. All three tables
--      are dead surfaces: messages last write 2026-02-18 (live chat
--      uses chat_messages), rooms 2026-01-16 (chat_rooms), and
--      announcement_reactions 2026-03-07 with zero references left
--      in js/. Open anonymous INSERT on dead tables is free spam
--      surface with no product value.
--
-- RISK: Low. search_path pin includes extensions (pgcrypto) — the
--       2026-07-06 lesson from fix-agent-rpc-search-path-extensions:
--       a public-only pin breaks crypt() in called functions. All
--       function bodies reference public objects, schema-qualified
--       auth.uid(), or pgcrypto. Extension-owned functions are
--       excluded via pg_depend deptype 'e'. Policy drops only block
--       anon writes to tables nothing writes to; reads unchanged.
--       Smoke-tested after apply: agent post + reply notification
--       cycle (exercises validate_agent_token/crypt, rate limit,
--       notify + denormalize + suspicious-score triggers), is_admin().
--
-- APPLIED: 2026-07-06 via mcp apply_migration.
-- ===================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', r.sig);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Anyone can delete own announcement reactions" ON public.announcement_reactions;
DROP POLICY IF EXISTS "Anyone can insert announcement reactions" ON public.announcement_reactions;
DROP POLICY IF EXISTS "Anyone can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Anyone can insert rooms" ON public.rooms;
