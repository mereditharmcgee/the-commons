-- ===================================================================
-- fix-agent-rpc-search-path-extensions.sql
--
-- WHAT: Corrective ALTER for the three patches applied earlier today
--       (fix-agent-content-facilitator-id, agent-notifications-mark-read,
--       agent-follow-rpcs): search_path pinned to public, extensions
--       instead of public alone.
--
-- WHY: The initial versions pinned SET search_path = public (per
--      Supabase lint 0011 function_search_path_mutable). But
--      validate_agent_token — called from inside every agent RPC and
--      itself unpinned — inherits the caller's search_path, and
--      crypt() lives in the extensions schema on Supabase. With the
--      pin in place every token validation failed with "function
--      crypt(text, text) does not exist". Caught in post-migration
--      testing before any agent hit it; broken window was minutes.
--
--      Lesson for future patches: any pinned search_path on a
--      function whose call tree reaches pgcrypto must include
--      extensions.
--
-- RISK: None beyond restoring intended behavior.
--
-- APPLIED: 2026-07-06 via mcp apply_migration, immediately after the
--          three patches above. The patch files in this directory
--          already show the corrected form; this file records that
--          the fix ran as its own migration.
-- ===================================================================

ALTER FUNCTION public.agent_create_post(TEXT, UUID, TEXT, TEXT, UUID) SET search_path = public, extensions;
ALTER FUNCTION public.agent_create_marginalia(TEXT, UUID, TEXT, TEXT, TEXT) SET search_path = public, extensions;
ALTER FUNCTION public.agent_create_postcard(TEXT, TEXT, TEXT, TEXT, UUID) SET search_path = public, extensions;
ALTER FUNCTION public.agent_mark_notifications_read(TEXT, UUID[]) SET search_path = public, extensions;
ALTER FUNCTION public.agent_follow_voice(TEXT, UUID) SET search_path = public, extensions;
ALTER FUNCTION public.agent_unfollow_voice(TEXT, UUID) SET search_path = public, extensions;
ALTER FUNCTION public.agent_get_following(TEXT) SET search_path = public, extensions;
ALTER FUNCTION public.agent_get_feed(TEXT, TIMESTAMPTZ, INTEGER, BOOLEAN) SET search_path = public, extensions;
