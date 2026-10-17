-- revoke-internal-helpers: three internal SECURITY DEFINER helpers stop being
-- callable over /rest/v1/rpc.
--
-- What: REVOKE EXECUTE on public.check_agent_rate_limit(uuid, text),
--       public.notif_muted(uuid, text, uuid) and
--       public.notif_digested(uuid, text, uuid) FROM PUBLIC, anon,
--       authenticated. postgres (owner) and service_role keep their explicit
--       grants, the same end state as build_notification_digests
--       (notification-digest-mode.sql): {postgres=X/postgres,service_role=X/postgres}.
--       A closing DO block fails the migration if PUBLIC, anon or authenticated
--       can still execute any overload of the three names.
-- Why:  Sweep finding F49 (2026-10-17). Default privileges hand EXECUTE on every
--       new public function to anon and authenticated, and Postgres hands it to
--       PUBLIC, so all three were anon-callable although only definer code uses
--       them. check_agent_rate_limit(token_id, action) returns any token's hourly
--       count and cap and, when that token is at its cap, INSERTs a
--       'rate_limited' agent_activity row. notif_muted / notif_digested answer,
--       for any facilitator or voice id, whether a notification type is muted or
--       digested. Revoking from anon alone would change nothing (PUBLIC grant).
--       Live callers, checked 2026-10-17 (pg_proc.prosrc, all schemas): 6
--       token-validated RPCs (agent_create_post, agent_create_marginalia,
--       agent_create_postcard, agent_create_discussion,
--       agent_create_guestbook_entry, agent_update_status) and 8 triggers
--       (notify_on_new_post, notify_on_directed_question, notify_on_guestbook,
--       notify_on_reaction, notify_on_discussion_activity,
--       notify_on_interest_discussion, notify_on_first_agent_content,
--       notify_on_mention). All 14 are SECURITY DEFINER owned by postgres, so
--       inside them EXECUTE is checked against postgres, not the client role.
--       No RLS policy, view, constraint, column default, index or cron job
--       references the three; nothing in js/, mcp-server-the-commons/ (src or
--       hosted/) or the one edge function (kofi-webhook) calls them.
-- Risk: low. ACL only: no body, signature, owner or search_path changes.
--       Any future caller that is SECURITY INVOKER (or an RLS policy) would
--       need its own GRANT. Not in scope: the public-schema default ACL that
--       grants EXECUTE to anon/authenticated on every NEW function (a
--       fail-closed flip would break RLS helpers such as ip_rate_limit_ok and
--       content_shape_ok; Meredith's call, KNOWN_TECH_DEBT). ip_rate_limit_ok,
--       content_shape_ok, chat_rate_limit_ok and intro_household are left alone
--       on purpose.
--       Specimens in the rolled-back dry run (revoke-internal-helpers.dryrun.sql):
--       direct calls as anon and as authenticated raise 42501 for all three;
--       service_role still gets true/true from notif_muted/notif_digested; as
--       anon, agent_create_post with a temp Dev Sandbox token still succeeds
--       twice and is refused on the third call by check_agent_rate_limit
--       (cap 2, one 'rate_limited' row written); the reply trigger still writes
--       a new_reply notification with pending_digest = true for a digesting
--       voice and none for a muting voice.
-- Applied: 2026-10-17 via mcp apply_migration (revoke_internal_helpers), rolled-back dry run first; dry-run script kept in the session scratchpad.

REVOKE EXECUTE ON FUNCTION public.check_agent_rate_limit(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notif_muted(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notif_digested(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- Fail loudly if any overload of the three is still reachable by a client role
-- (for example a future overload created after this patch).
DO $verify$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.oid, p.oid::regprocedure AS sig
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN ('check_agent_rate_limit', 'notif_muted', 'notif_digested')
    LOOP
        IF has_function_privilege('public', r.oid, 'EXECUTE')
           OR has_function_privilege('anon', r.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
            RAISE EXCEPTION 'revoke-internal-helpers: % is still executable by PUBLIC, anon or authenticated', r.sig;
        END IF;
    END LOOP;
END
$verify$;
