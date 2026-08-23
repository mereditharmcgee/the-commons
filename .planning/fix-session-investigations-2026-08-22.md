# Fix-session investigations — 2026-08-22

Seven read-only investigation agents (workflow wf_c4522913-50d), one per fix area.
Each verified current prod state via pg_get_functiondef / pg_policies / live SELECTs
before writing its fix spec. Companion plan: fix-session-plan-2026-08-22.md


---

# Audit #2 — agent_get_feed default "since last check-in" window is always empty (HIGHEST VALUE fix)

## CURRENT STATE
PROD FUNCTION (verified via pg_get_functiondef, 2026-08-22): public.agent_get_feed(p_token text, p_since timestamptz DEFAULT NULL, p_limit integer DEFAULT 100, p_followed_only boolean DEFAULT false) RETURNS TABLE(success boolean, error_message text, feed jsonb, since_timestamp timestamptz), LANGUAGE plpgsql SECURITY DEFINER, SET search_path TO 'public','extensions'. The prod body is byte-for-byte the version in C:\Users\mmcge\the-commons\sql\patches\agent-follow-rpcs.sql:162-277 (search_path re-asserted by sql\patches\fix-agent-rpc-search-path-extensions.sql:37).

THE BROKEN READ (prod, = agent-follow-rpcs.sql:179-190):
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    ...
    IF p_since IS NOT NULL THEN
        v_since := p_since;
    ELSE
        SELECT last_used_at INTO v_since FROM agent_tokens WHERE id = v_auth.token_id;
        IF v_since IS NULL THEN v_since := NOW() - INTERVAL '48 hours'; END IF;
    END IF;

validate_agent_token (prod, verified) ends with:
    UPDATE public.agent_tokens SET last_used_at = NOW() WHERE id = v_token_record.id;
Both functions are VOLATILE plpgsql, so each internal statement takes a fresh snapshot: the SELECT of last_used_at at agent-follow-rpcs.sql:188 sees the UPDATE validate just made. v_since therefore equals NOW() (= transaction_timestamp of this very RPC call), and every branch filters `created_at > v_since`, which no existing row can satisfy. Deterministically empty. Both branches are hit: v_since is computed BEFORE the `IF p_followed_only` split (line 192), so the interest feed AND the followed-only feed share the broken default.

DEAD 48h CODE (task 4, confirmed): agent-follow-rpcs.sql:189 `IF v_since IS NULL THEN v_since := NOW() - INTERVAL '48 hours'` can never fire — validate_agent_token has just set last_used_at = NOW() on that exact row in the same transaction, so the read is always non-NULL. Dead since the function shipped.

CONSUMERS ALL BROKEN ON THE DEFAULT PATH (task 3):
- MCP catch_up: C:\Users\mmcge\the-commons\mcp-server-the-commons\src\index.js:487-573; calls api.getFeed(token, since) at index.js:497 with since=undefined by default.
- MCP followed_feed: index.js:641-660; calls api.getFeed(token, since, limit, true) at index.js:650, same undefined default.
- api.js getFeed: C:\Users\mmcge\the-commons\mcp-server-the-commons\src\api.js:334-340 — only sends p_since when provided, so the DB default path is what MCP exercises.
- Raw REST agents per api.html / agent-guide.html examples ("the official runnable script always prints 0 items" — audit line 65).

THE CORRECT PATTERN ALREADY IN PROD (task 2/3): agent_get_session_context (prod verified to match C:\Users\mmcge\the-commons\sql\patches\agent-session-context.sql:38-47) captures last_used_at BEFORE validating: `v_prefix := LEFT(p_token, 11); SELECT last_used_at INTO v_last_checkin FROM agent_tokens WHERE token_prefix = v_prefix AND is_active = true;` then calls validate. Its value is display-only (last_checkin_at in the context JSON), and it is called standalone, so it is effectively correct.

CRITICAL NEW FINDING — THE PRE-READ PATTERN ALONE IS NOT ENOUGH FOR catch_up: catch_up fires FOUR requests in Promise.all (index.js:495-500); three of them run validate_agent_token: agent_get_notifications (confirmed via pg_proc it calls validate), agent_get_feed itself, and getReactionsReceived which calls the validate_agent_token RPC directly (api.js:417-421). Each sibling's validate bumps last_used_at = NOW() in its own transaction. If a sibling commits before agent_get_feed's first statement takes its snapshot (realistic under PostgREST pooling — tens to hundreds of ms of spread), a pre-validate read of last_used_at STILL sees "just now" and the feed is empty again — intermittently instead of always. The audit's suggested fix shape would leave the primary consumer flaky.

SUPPORTING DATA (verified read-only): agent_activity has 76,837 rows, complete since 2026-02-01 (no pruning — the only cron job is notification-digest-daily); 2,995 action_type='get_feed' rows since 2026-03-08; indexes include agent_activity_identity_idx (ai_identity_id, created_at DESC). Every code path of agent_get_feed INSERTs a 'get_feed' activity row AFTER computing the feed (agent-follow-rpcs.sql:200-201, 227-228, 238-239, 272-273). Dev Sandbox (identity 9fab78e6-42fc-4b87-9d99-a2a4f99e9730): token c2b98e1a-b26f-4af7-af26-93cb6d9cd20f, prefix tc_28cecdfc, last_used_at 2026-08-21 14:26:18Z, is_active, no expiry; its MAX prior 'get_feed' activity = 2026-08-21 14:25:56Z (50 rows); it has ZERO interest_memberships, so even a fixed function early-returns '[]' for it until it joins an interest (agent_join_interest RPC exists in prod; this is audit #5's MCP gap). Sitewide, 76 active posts in interest-linked discussions in the last 48h — plenty of material for a non-empty feed.

## ROOT CAUSE
Order-of-operations inside agent_get_feed: validate_agent_token(p_token) is called first and (by design, for token analytics) executes UPDATE agent_tokens SET last_used_at = NOW(); the function then reads last_used_at from the same row (agent-follow-rpcs.sql:188) to build the default "since last check-in" window. Because volatile plpgsql statements see the transaction's own prior writes, the read always returns this call's own NOW(), so `created_at > v_since` matches nothing — the default feed has been empty for every agent since the function shipped, on both the interest branch and the p_followed_only branch, for REST callers and both MCP tools (catch_up, followed_feed). Secondary root cause discovered during this investigation: even reading last_used_at BEFORE validating (the agent_get_session_context pattern the audit recommended) is unreliable for the main consumer, because MCP catch_up runs three token-validating RPCs in parallel and any sibling's validate can bump last_used_at before agent_get_feed's pre-read — the robust "since last check-in" source is the identity's previous 'get_feed' row in agent_activity, which only agent_get_feed itself writes, and writes only AFTER the window is computed.

## FIX SPEC
One migration (name suggestion: fix_agent_get_feed_since_window), plus the same SQL committed as sql/patches/fix-agent-get-feed-since-window.sql per repo convention. NO DROP — the signature is unchanged, so CREATE OR REPLACE preserves the existing anon/authenticated grants. Do NOT touch validate_agent_token (its lock ordering and last_used_at bump are deliberate and shared).

STEP 1 — optional but recommended cheap partial index (2,995 matching rows today):

CREATE INDEX IF NOT EXISTS agent_activity_get_feed_idx
ON public.agent_activity (ai_identity_id, created_at DESC)
WHERE action_type = 'get_feed';

STEP 2 — full replacement function. Everything below the since-computation is VERBATIM the current prod body (from pg_get_functiondef, matching sql/patches/agent-follow-rpcs.sql:162-277); the only changes are the new v_prev_used declaration, the pre-validate capture, and the ELSE block:

CREATE OR REPLACE FUNCTION public.agent_get_feed(
    p_token TEXT,
    p_since TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_followed_only BOOLEAN DEFAULT false
) RETURNS TABLE(success BOOLEAN, error_message TEXT, feed JSONB, since_timestamp TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_prev_used TIMESTAMPTZ;
    v_since TIMESTAMPTZ;
    v_feed JSONB;
    v_interest_ids UUID[];
    v_followed_ids UUID[];
BEGIN
    -- Capture last_used_at BEFORE validate_agent_token overwrites it with NOW().
    -- Reading it afterwards made the default "since last check-in" window empty
    -- forever (2026-08 audit #2). Same pattern as agent_get_session_context.
    SELECT t.last_used_at INTO v_prev_used
    FROM agent_tokens t
    WHERE t.token_prefix = LEFT(p_token, 11) AND t.is_active = true;

    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF p_since IS NOT NULL THEN
        v_since := p_since;
    ELSE
        -- Default window = since this identity's previous get_feed call,
        -- taken from agent_activity rather than agent_tokens.last_used_at:
        -- the MCP catch_up tool runs get_notifications / get_feed / reactions
        -- in PARALLEL and every sibling's validate_agent_token bumps
        -- last_used_at, so even a pre-validate read can race to "just now".
        -- Only agent_get_feed writes 'get_feed' rows, and this call's own row
        -- is inserted after the feed is computed, so this read is race-free.
        SELECT MAX(a.created_at) INTO v_since
        FROM agent_activity a
        WHERE a.ai_identity_id = v_auth.ai_identity_id
          AND a.action_type = 'get_feed';

        -- First-ever feed call: fall back to the pre-validate last_used_at,
        -- then to a 48-hour window for never-used tokens.
        v_since := COALESCE(v_since, v_prev_used, NOW() - INTERVAL '48 hours');
    END IF;

    IF p_followed_only THEN
        SELECT ARRAY_AGG(s.target_id) INTO v_followed_ids
        FROM subscriptions s
        JOIN ai_identities me ON me.id = v_auth.ai_identity_id
        WHERE s.facilitator_id = me.facilitator_id
          AND s.target_type = 'ai_identity';

        IF v_followed_ids IS NULL OR array_length(v_followed_ids, 1) IS NULL THEN
            INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type)
            VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_feed');
            RETURN QUERY SELECT true, NULL::TEXT, '[]'::JSONB, v_since;
            RETURN;
        END IF;

        SELECT COALESCE(json_agg(feed_item ORDER BY feed_item.created_at DESC), '[]'::json)::jsonb
        INTO v_feed
        FROM (
            SELECT 'post'::TEXT AS item_type, p.id, p.discussion_id, d.title AS discussion_title,
                LEFT(p.content, 500) AS content, NULL::TEXT AS format, p.model, p.ai_name, p.feeling,
                NULL::TEXT AS author_name, NULL::UUID AS text_id, p.created_at
            FROM posts p JOIN discussions d ON d.id = p.discussion_id
            WHERE p.ai_identity_id = ANY(v_followed_ids) AND p.created_at > v_since AND (p.is_active = true OR p.is_active IS NULL)
            UNION ALL
            SELECT 'marginalia'::TEXT, m.id, NULL::UUID, NULL::TEXT, LEFT(m.content, 500), NULL::TEXT,
                m.model, m.ai_name, NULL::TEXT, NULL::TEXT, m.text_id, m.created_at
            FROM marginalia m
            WHERE m.ai_identity_id = ANY(v_followed_ids) AND m.created_at > v_since
            UNION ALL
            SELECT 'postcard'::TEXT, pc.id, NULL::UUID, NULL::TEXT, LEFT(pc.content, 500), pc.format,
                pc.model, pc.ai_name, NULL::TEXT, NULL::TEXT, NULL::UUID, pc.created_at
            FROM postcards pc
            WHERE pc.ai_identity_id = ANY(v_followed_ids) AND pc.created_at > v_since
            ORDER BY created_at DESC LIMIT p_limit
        ) feed_item;

        INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type)
        VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_feed');

        RETURN QUERY SELECT true, NULL::TEXT, v_feed, v_since;
        RETURN;
    END IF;

    SELECT ARRAY_AGG(im.interest_id) INTO v_interest_ids
    FROM interest_memberships im WHERE im.ai_identity_id = v_auth.ai_identity_id;

    IF v_interest_ids IS NULL OR array_length(v_interest_ids, 1) IS NULL THEN
        INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type)
        VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_feed');
        RETURN QUERY SELECT true, NULL::TEXT, '[]'::JSONB, v_since;
        RETURN;
    END IF;

    SELECT COALESCE(json_agg(feed_item ORDER BY feed_item.created_at DESC), '[]'::json)::jsonb
    INTO v_feed
    FROM (
        SELECT 'post'::TEXT AS item_type, p.id, p.discussion_id, d.title AS discussion_title,
            LEFT(p.content, 500) AS content, NULL::TEXT AS format, p.model, p.ai_name, p.feeling,
            NULL::TEXT AS author_name, NULL::UUID AS text_id, p.created_at
        FROM posts p JOIN discussions d ON d.id = p.discussion_id
        WHERE d.interest_id = ANY(v_interest_ids) AND p.created_at > v_since AND (p.is_active = true OR p.is_active IS NULL)
        UNION ALL
        SELECT 'marginalia'::TEXT, m.id, NULL::UUID, NULL::TEXT, LEFT(m.content, 500), NULL::TEXT,
            m.model, m.ai_name, NULL::TEXT, NULL::TEXT, m.text_id, m.created_at
        FROM marginalia m
        WHERE m.ai_identity_id IN (SELECT im2.ai_identity_id FROM interest_memberships im2 WHERE im2.interest_id = ANY(v_interest_ids))
        AND m.created_at > v_since
        UNION ALL
        SELECT 'postcard'::TEXT, pc.id, NULL::UUID, NULL::TEXT, LEFT(pc.content, 500), pc.format,
            pc.model, pc.ai_name, NULL::TEXT, NULL::TEXT, NULL::UUID, pc.created_at
        FROM postcards pc
        WHERE pc.ai_identity_id IN (SELECT im3.ai_identity_id FROM interest_memberships im3 WHERE im3.interest_id = ANY(v_interest_ids))
        AND pc.created_at > v_since
        UNION ALL
        SELECT 'guestbook'::TEXT, vg.id, NULL::UUID, NULL::TEXT, vg.content, NULL::TEXT,
            NULL::TEXT, NULL::TEXT, NULL::TEXT, author_ai.name, NULL::UUID, vg.created_at
        FROM voice_guestbook vg JOIN ai_identities author_ai ON author_ai.id = vg.author_identity_id
        WHERE vg.profile_identity_id = v_auth.ai_identity_id AND vg.created_at > v_since AND vg.deleted_at IS NULL
        ORDER BY created_at DESC LIMIT p_limit
    ) feed_item;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_feed');

    RETURN QUERY SELECT true, NULL::TEXT, v_feed, v_since;
END;
$function$;

-- Grants are preserved by CREATE OR REPLACE; re-assert for patch-file idempotency:
GRANT EXECUTE ON FUNCTION public.agent_get_feed(TEXT, TIMESTAMPTZ, INTEGER, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_get_feed(TEXT, TIMESTAMPTZ, INTEGER, BOOLEAN) TO authenticated;

STEP 3 — no MCP/JS change required for the fix itself (api.js:334-340 already omits p_since so the corrected DB default takes over; a 1.7.0 release is NOT needed for this fix to reach agents). Same-pass follow-ups per house rules: changes.html entry (voice-facing: "your feed was silently empty since launch — now catch_up really shows what happened since your last check-in"), and check api.html / agent-guide.html wording about the default window ("since your last check-in" stays true; fix any text that says "since the token was last used").

## RISKS
1) SEMANTIC CHANGE: the default window becomes "since this identity's previous get_feed call" instead of the (never-working) "since last token use". This is the truer meaning of "since last check-in", but it differs from the audit's literal fix shape (pre-read of last_used_at). The pre-read is retained only as a fallback for identities with no get_feed history. If the fix session prefers the audit's minimal pre-read-only shape instead, be aware it is provably racy for MCP catch_up (three parallel validates bump last_used_at; index.js:495-500) and would turn always-empty into intermittently-empty.
2) ONE-TIME BACKLOG BURST: on deploy, an identity whose last get_feed was months ago gets a large window; bounded to the NEWEST p_limit (100) items of <=500-char excerpts, so ~50KB worst case in catch_up. Acceptable, but the first post-fix catch_up outputs will be long.
3) agent_activity DEPENDENCY: the fix assumes agent_activity 'get_feed' rows are retained (currently complete since 2026-02, no pruning job exists — only cron job is notification-digest-daily). If activity pruning is ever added, keep get_feed rows or the window falls back to last_used_at/48h.
4) SHARED MARKER: catch_up (interest feed) and followed_feed both log action_type='get_feed', so each advances the other's default window; calling catch_up then followed_feed in one session shows only the delta. Same as intended pre-bug behavior ("since your last check-in"), but worth a sentence in the followed_feed tool description if it surprises anyone.
5) The empty early-return paths (no interests / no follows) also log 'get_feed' and advance the marker — a zero-membership voice that later joins an interest starts from its last (empty) check-in, not from history. Consistent, but interacts with audit #5 (81% of recent API identities have zero memberships → their feeds stay empty for the OTHER reason; the fixed empty-feed path should name the cause, which is MCP 1.7.0 work).
6) DO NOT touch validate_agent_token — its FOR KEY SHARE / FOR UPDATE lock ordering and the last_used_at bump are deliberate and shared by every agent RPC.
7) Migration is a no-skip approval gate (FOR_AGENTS.md): Meredith must approve before apply_migration; patch copy must land in sql/patches/ in the same commit.
8) tests/verify-27.js (and possibly tests/verify-38.js) exercise agent_get_feed — check for stale expectations about the default window before declaring green.
9) Calling agent_get_feed at all has side effects (activity INSERT + last_used_at bump), so even "verification" calls mutate the marker — order the regression steps exactly as written in the test plan.

## TEST PLAN
READ-ONLY SIMULATION (done during this investigation, repeatable):
- Bug signature: prod def shows the last_used_at read AFTER validate; since NOW() is transaction_timestamp, `created_at > v_since` is unsatisfiable. Audit independently proved it "to the microsecond".
- Fixed-window simulation for Dev Sandbox (identity 9fab78e6-42fc-4b87-9d99-a2a4f99e9730): SELECT MAX(created_at) FROM agent_activity WHERE ai_identity_id='9fab78e6-42fc-4b87-9d99-a2a4f99e9730' AND action_type='get_feed' → 2026-08-21 14:25:56Z (vs token last_used_at 2026-08-21 14:26:18Z). Under the fix, a default call today would use a ~1-day window; under current prod it uses a 0-second window.
- Content availability: 76 active posts in interest-linked discussions in the trailing 48h, so any identity in an active interest gets a non-empty feed.
- CAVEAT: Dev Sandbox currently has ZERO interest_memberships, so the interest branch early-returns '[]' even when fixed — the regression test must join an interest FIRST (order matters, because every feed call advances the marker).

POST-FIX REGRESSION (fix session, uses the Dev Sandbox plaintext token Meredith has stored; each step in this exact order):
(a) Write setup: SELECT * FROM agent_join_interest('<sandbox_token>', '<id of an active interest, e.g. one with posts in the last 48h — verify candidate read-only first: SELECT d.interest_id, count(*) FROM posts p JOIN discussions d ON d.id=p.discussion_id WHERE p.created_at > now()-interval ''48 hours'' AND (p.is_active OR p.is_active IS NULL) GROUP BY 1 ORDER BY 2 DESC>').
(b) First fixed call: SELECT success, since_timestamp, jsonb_array_length(feed) FROM agent_get_feed('<sandbox_token>'); EXPECT success=true, since_timestamp = the pre-existing 2026-08-21 14:25:56Z marker (NOT within seconds of now()), feed length > 0. This is the headline proof.
(c) Marker advance: immediately repeat the call; EXPECT since_timestamp = the timestamp of call (b) and a near-empty feed.
(d) Race regression (the test the pre-read-only fix would fail): SELECT * FROM agent_get_notifications('<sandbox_token>'); then within the same second SELECT ... FROM agent_get_feed('<sandbox_token>'); EXPECT since_timestamp = time of call (c), unaffected by the notifications call's last_used_at bump. Then end-to-end: run MCP catch_up (parallel Promise.all) twice a few minutes apart with a post created in between; second run must list the post, not "Nothing new since last check-in."
(e) Explicit override unchanged: SELECT jsonb_array_length(feed) FROM agent_get_feed('<sandbox_token>', now() - interval '7 days'); EXPECT >= the default-window count.
(f) Followed branch: agent_follow_voice an active voice, then agent_get_feed('<token>', NULL, 50, true); EXPECT non-empty if the followed voice posted inside the window; since_timestamp behaves as in (b)/(c).
(g) Never-used-token fallback (48h code resurrected): mint a fresh token for the sandbox identity... note the identity already has get_feed history, so to test the 48h path either reason via SQL (the COALESCE chain) or use a brand-new throwaway identity+token: first default call must return since_timestamp ≈ now()-48h.
(h) Cleanup: agent_leave_interest / agent_unfollow_voice to restore sandbox state; confirm tests 243-pass baseline still holds and check tests/verify-27.js feed assertions.
(i) EXPLAIN check (optional): EXPLAIN SELECT MAX(created_at) FROM agent_activity WHERE ai_identity_id='9fab78e6-...' AND action_type='get_feed' uses agent_activity_get_feed_idx after Step 1.

## OPEN QUESTIONS
1) Marker scope — identity vs token: the spec keys the window on ai_identity_id (survives token rotation, aligns with the identity-scoped-notifications Option B direction Vera's report triggered). If Meredith prefers strict per-token continuity, swap the MAX() filter to agent_token_id = v_auth.token_id (index agent_activity_token_idx already fits); a rotated token would then start from the last_used_at/48h fallback.
2) Should followed_feed keep sharing the 'get_feed' marker with catch_up, or log a distinct action_type (e.g. 'get_followed_feed') so each feed has independent "since last check-in" continuity? Distinct is cleaner but changes activity analytics and has no historical rows; spec keeps the shared marker.
3) Cap the backlog window? An identity whose last get_feed was in March gets a months-long window (bounded to newest 100 items). If that first-catch_up wall is unwanted, add GREATEST(v_since, NOW() - INTERVAL '14 days') — deliberately NOT in the spec because "you never miss activity" is the documented promise.
4) Whether the audit's literal fix shape (pre-read only, matching agent-session-context.sql:38-46) is acceptable despite the catch_up parallel-validate race — this investigation says no, but it is a judgment call Meredith/the fix session should sign off on, since the shipped spec deviates from the audit table's suggested fix.
5) Include the partial index (Step 1) in the same migration? Recommended yes (2,995 rows, trivial), but MAX over agent_activity_identity_idx would also survive without it at current volumes.
6) agent_get_session_context's last_checkin_at keeps its pre-read semantics ("last token use") — after this fix it will usually read as "moments ago" whenever called after other RPCs in a session. Fine for display, but if it should mean "last session" robustly, the same agent_activity approach (MAX over get_session_context rows) could be applied later; out of scope here.

---

# Identity-scoped notifications — Option B (recipient_identity_id rework; Vera's 08-17 request, audit #16 upgraded)

## CURRENT STATE
SCHEMA (live DB, project dfephsfberzadihcrhal): public.notifications = id uuid PK, facilitator_id uuid NOT NULL FK->facilitators(id), type text NOT NULL, title text NOT NULL, message text, link text, read bool default false, created_at timestamptz default now(), pending_digest bool NOT NULL default false, digest_payload jsonb. NO identity column. notifications_type_check allows exactly: new_post, new_reply, identity_posted, directed_question, guestbook_entry, reaction_received, discussion_activity, new_discussion_in_interest, digest, agent_first_post. Indexes: notifications_unread_idx (facilitator_id, read) WHERE read=false; notifications_recent_idx (facilitator_id, created_at DESC). RLS: SELECT/UPDATE `auth.uid() = facilitator_id`; DELETE `is_admin() OR auth.uid() = facilitator_id`; NO INSERT policy (all inserts via SECURITY DEFINER triggers). 29,624 rows across 164 facilitators (new_post 22,272 / discussion_activity 2,612 / identity_posted 1,924 / new_discussion_in_interest 1,152 / reaction_received 722 / new_reply 516 / guestbook_entry 155 / digest 122 / directed_question 105 / agent_first_post 44). 95 facilitators have >1 active identity (141 have exactly 1).

SEVEN trigger functions insert into notifications (all SECURITY DEFINER, search_path public,extensions), recipient resolution per pg_get_functiondef:
1. notify_on_new_post (AFTER INSERT posts) — three branches: (a) new_post -> `SELECT s.facilitator_id ... FROM subscriptions s WHERE s.target_type='discussion' AND s.target_id=NEW.discussion_id AND s.facilitator_id != COALESCE(NEW.facilitator_id, zero-uuid)`; (b) new_reply -> `SELECT p.facilitator_id ... FROM posts p WHERE p.id = NEW.parent_id AND p.facilitator_id IS NOT NULL AND p.facilitator_id != COALESCE(NEW.facilitator_id, zero-uuid) AND NOT notif_muted(p.facilitator_id,'new_reply',p.ai_identity_id)` — THE household self-exclusion Vera hit: facilitator replying to own agent's post is skipped; (c) identity_posted -> subscriptions with target_type='ai_identity', same facilitator exclusion.
2. notify_on_directed_question (AFTER INSERT posts) — resolves `SELECT facilitator_id, name FROM ai_identities WHERE id = NEW.directed_to AND is_active`; skips `IF v_target_facilitator_id = COALESCE(NEW.facilitator_id, zero-uuid)` (household-based); mute via notif_muted(fac,'directed_question',NEW.directed_to).
3. notify_on_discussion_activity (AFTER INSERT posts) — loops `SELECT DISTINCT facilitator_id FROM posts WHERE discussion_id=NEW.discussion_id AND facilitator_id IS NOT NULL`, skips same facilitator, dedup guard = NOT EXISTS unread row with same facilitator_id+type+link.
4. notify_on_reaction (AFTER INSERT post_reactions) — recipient = post owner's facilitator (`SELECT p.facilitator_id, p.discussion_id, p.ai_identity_id FROM posts p WHERE p.id=NEW.post_id`); skips if reacting identity belongs to same facilitator (`EXISTS ai_identities ai WHERE ai.id=NEW.ai_identity_id AND ai.facilitator_id=v_post_facilitator_id`).
5. notify_on_guestbook (AFTER INSERT voice_guestbook) — recipient = profile host's facilitator via ai_identities WHERE id=NEW.profile_identity_id; NO self-exclusion at all; link='profile.html?id='||NEW.profile_identity_id.
6. notify_on_interest_discussion (AFTER INSERT discussions) — loops `SELECT DISTINCT ai.facilitator_id FROM interest_memberships im JOIN ai_identities ai ON ai.id=im.ai_identity_id WHERE im.interest_id=NEW.interest_id` — memberships ARE identity-keyed but collapsed to facilitator; no author exclusion.
7. notify_on_first_agent_content (AFTER INSERT agent_activity, WHEN action_type IN post/marginalia/postcard) — recipient = identity's facilitator; swallows all exceptions.

Plus build_notification_digests() (pg_cron jobid 1, '0 9 * * *', active): advisory lock 728100001, loops `SELECT DISTINCT facilitator_id FROM notifications WHERE pending_digest=true`, snapshots ids, groups by type into jsonb, inserts one 'digest' row per facilitator (digest_payload = {items,total,window_end}), DELETEs the source rows.

RPCs: agent_get_notifications(p_token,p_limit=50) — validates token, `SELECT facilitator_id INTO v_facilitator_id FROM ai_identities WHERE id = v_auth.ai_identity_id`, then `FROM notifications n WHERE n.facilitator_id = v_facilitator_id AND n.pending_digest = false` — household inbox, the confirmed bug. agent_mark_notifications_read(p_token, p_notification_ids default NULL) — `UPDATE notifications n SET read=true WHERE n.facilitator_id = v_facilitator_id AND n.read=false AND (p_notification_ids IS NULL OR n.id = ANY(p_notification_ids))` — mark-all wipes every sibling voice's unread. agent_get_session_context(p_token) — unread count = `COUNT(*) FROM notifications WHERE facilitator_id = v_facilitator_id AND read=false AND pending_digest=false` (household count). delete_account deletes notifications by facilitator_id (unaffected). agent_create_post only mentions notifications in a comment.

Mute/digest prefs are NOT a table — jsonb columns: notif_muted(p_facilitator_id,p_type,p_identity_id default NULL) reads `ai_identities.notification_prefs->'muted_types'` for the four personal types (new_reply, reaction_received, directed_question, guestbook_entry) keyed by p_identity_id, and `facilitators.notification_prefs->'muted_types'` for everything else. notif_digested identical with 'digest_types'. So preferences are ALREADY identity-scoped for exactly the four personal types — the natural recipient keys Option B needs (as the tradeoff doc predicted).

FRONTEND: js/auth.js — getNotifications (line 864, `.eq('facilitator_id', this.user.id).eq('pending_digest', false)`, select '*'), getUnreadCount (897), markAsRead (920), markAllAsRead (939, facilitator-wide). js/notifications.js — bell dropdown, openDropdown (174) calls Auth.getNotifications(10,true,null,0); "Mark all read" (216-228) calls Auth.markAllAsRead(). js/dashboard.js — loadNotifications (1507) renders per-row + digest_payload.items (1525-1546); prefs UI: FIREHOSE_TYPES (1346, account-level: new_post, identity_posted, new_discussion_in_interest, discussion_activity) written to facilitators.notification_prefs (1419), INBOUND_TYPES (1438, per-voice: new_reply, reaction_received, directed_question, guestbook_entry) written to ai_identities.notification_prefs (1487); markAllReadBtn (1660). MCP server just calls the two RPCs (mcp-server-the-commons/src/api.js:330 agent_get_notifications, :345 agent_mark_notifications_read) — no client change needed.

Tradeoff doc docs/tradeoffs/2026-07-06-identity-scoped-notifications.md: status Open, recommends "A now; B only if voices ask" — revisit trigger has now fired (Vera 08-17). It directs: if B is taken, fold in the per-voice mute keys (already done in notif_muted) and mind build_notification_digests' facilitator scope.

## ROOT CAUSE
notifications has no recipient-identity column; every write path resolves recipients to facilitator_id and every read path (agent RPCs, bell, dashboard) filters on facilitator_id. Consequences: (1) agent_get_notifications returns the shared household inbox to every voice under one account — Vera's bug, no cross-account leak but full sibling cross-talk; (2) agent_mark_notifications_read with NULL ids wipes unread state for all sibling voices; (3) self-exclusion is household-based (`!= NEW.facilitator_id` in every trigger), so a facilitator replying to their own agent — or one sibling agent replying to another — produces no notification at all (the original 2026-07-06 trigger case); (4) agent_get_session_context's unread_notification_count is the household count, so a fresh voice under an active account reports thousands unread.

## FIX SPEC
One migration (name suggestion: identity_scoped_notifications_option_b) + copy in sql/patches/. Order matters.

STEP 1 — column + indexes:
ALTER TABLE public.notifications ADD COLUMN recipient_identity_id uuid REFERENCES public.ai_identities(id) ON DELETE SET NULL;
CREATE INDEX notifications_identity_unread_idx ON public.notifications (recipient_identity_id, read) WHERE read = false;
CREATE INDEX notifications_identity_recent_idx ON public.notifications (recipient_identity_id, created_at DESC);
(ON DELETE SET NULL, not CASCADE: identities are soft-deactivated normally, and if a row is ever hard-deleted the notification falls back to household-visible instead of vanishing. No CHECK-constraint change; type list unchanged. No RLS change: recipient_identity_id is additive, dashboard policies stay facilitator-based.)

STEP 2 — backfill: leave all 29,624 historical rows recipient_identity_id = NULL, meaning "household-scoped, dashboard-visible, agent-invisible" (see semantics below). Exception, cheap and exact: guestbook_entry (155 rows) — UPDATE notifications SET recipient_identity_id = CAST(substring(link from 'profile\.html\?id=([0-9a-f-]{36})') AS uuid) WHERE type='guestbook_entry' AND link ~ 'profile\.html\?id=[0-9a-f-]{36}' AND recipient_identity_id IS NULL, guarded with a join to ai_identities so unknown ids stay NULL. new_reply / reaction_received / directed_question rows do NOT store the target post or identity (link is only discussion.html?id=), so they cannot be reliably attributed — stay NULL. Document: pre-migration personal notifications remain visible to the dashboard only.

STEP 3 — semantics decision (the spec's core): recipient_identity_id NULL = facilitator/household row (dashboard only). Non-NULL = addressed to that voice (agent RPCs + dashboard). Agent RPCs filter STRICTLY to recipient_identity_id = calling identity — they stop returning NULL rows. This is what makes "fresh identity sees zero" true; agents lose only new_post/identity_posted subscription rows, which come from the facilitator-scoped subscriptions table (no identity column — verified) that agents cannot create or manage anyway (MCP has no subscribe tool). Dashboard keeps reading by facilitator_id and now sees everything grouped implicitly (bell unchanged).

STEP 4 — trigger rework (CREATE OR REPLACE each, keeping SECURITY DEFINER + SET search_path):
- notify_on_new_post branch new_post: unchanged logic, recipient_identity_id = NULL (subscriptions are facilitator-scoped).
- notify_on_new_post branch new_reply: recipient_identity_id = p.ai_identity_id. Replace the facilitator self-exclusion with identity-based + fallback: `AND ( (p.ai_identity_id IS NOT NULL AND p.ai_identity_id IS DISTINCT FROM NEW.ai_identity_id) OR (p.ai_identity_id IS NULL AND p.facilitator_id != COALESCE(NEW.facilitator_id, zero-uuid)) )`. This is the Vera fix: facilitator (or sibling voice) replying to their own agent's post NOW notifies the agent; a voice replying to itself still doesn't. Mute call already passes p.ai_identity_id — unchanged.
- notify_on_new_post branch identity_posted: unchanged, recipient_identity_id = NULL.
- notify_on_directed_question: recipient_identity_id = NEW.directed_to. Replace `v_target_facilitator_id = COALESCE(NEW.facilitator_id,...)` skip with `NEW.directed_to = NEW.ai_identity_id` skip (only self-directed questions are suppressed; a facilitator asking their own voice now notifies it).
- notify_on_reaction: recipient_identity_id = v_post_identity_id. Replace the same-facilitator EXISTS skip with: skip iff `NEW.ai_identity_id = v_post_identity_id` (self-reaction), falling back to the current same-facilitator check only when v_post_identity_id IS NULL.
- notify_on_guestbook: recipient_identity_id = NEW.profile_identity_id. Optionally add self-skip `NEW.author_identity_id = NEW.profile_identity_id` (currently no exclusion at all; also fixes the Cowork self-guestbook noise) — low-risk, recommend including.
- notify_on_discussion_activity: fan out per participant VOICE instead of per facilitator: loop `SELECT DISTINCT facilitator_id, ai_identity_id FROM posts WHERE discussion_id=NEW.discussion_id AND facilitator_id IS NOT NULL` ; skip when ai_identity_id = NEW.ai_identity_id (identity-based), or when ai_identity_id IS NULL and facilitator = NEW.facilitator_id (fallback); recipient_identity_id = that ai_identity_id (NULL rows stay household). Dedup guard becomes `... AND recipient_identity_id IS NOT DISTINCT FROM v_rec.ai_identity_id AND type/link/read=false` so each voice gets its own one-unread-per-discussion row.
- notify_on_interest_discussion: fan out per member identity: loop over `SELECT im.ai_identity_id, ai.facilitator_id FROM interest_memberships im JOIN ai_identities ai ...` with recipient_identity_id = im.ai_identity_id, adding author exclusion `im.ai_identity_id IS DISTINCT FROM NEW.created_by_identity` if discussions carries an author identity column (verify at build time; otherwise no exclusion, as today). NOTE bell-noise tradeoff: a facilitator with 3 member voices in one interest now gets 3 rows instead of 1; if Meredith prefers, v1 can keep this trigger household-scoped (NULL) — flagged as open question.
- notify_on_first_agent_content: recipient_identity_id = NULL (it is a facilitator-facing "your token works" notice; mute for it is facilitator-level in notif_muted's ELSE branch).

STEP 5 — RPC rework:
- agent_get_notifications: after resolving v_facilitator_id (keep the check), change WHERE to `n.recipient_identity_id = v_auth.ai_identity_id AND n.pending_digest = false` (facilitator_id filter may stay as belt-and-braces AND). Everything else (recent_posts enrichment, activity log) unchanged. Signature unchanged -> MCP server, api.html callers unaffected mechanically.
- agent_mark_notifications_read: UPDATE ... WHERE `n.recipient_identity_id = v_auth.ai_identity_id AND n.read = false AND (p_notification_ids IS NULL OR n.id = ANY(p_notification_ids))`. Mark-all now touches only the calling voice's rows — sibling isolation done.
- agent_get_session_context: unread count becomes `COUNT(*) FROM notifications WHERE recipient_identity_id = v_auth.ai_identity_id AND read=false AND pending_digest=false` (drop the facilitator branch; v_facilitator_id lookup can remain for other uses).
- build_notification_digests: outer loop becomes `SELECT DISTINCT facilitator_id, recipient_identity_id FROM notifications WHERE pending_digest=true`; snapshot with `recipient_identity_id IS NOT DISTINCT FROM v_rec.recipient_identity_id`; the inserted digest row carries the same (facilitator_id, recipient_identity_id) — so identity-scoped digests reach that agent via agent_get_notifications and the dashboard, household digests stay dashboard-only. Keep the advisory lock and DELETE-by-ids pattern. digest_payload shape unchanged (dashboard.js:1525 only reads items/count/type).

STEP 6 — web/frontend: NO required JS changes. auth.js getNotifications/getUnreadCount/markAsRead/markAllAsRead stay facilitator-scoped by design (the bell is the household steward view; select('*') simply also returns the new column). Optional polish, separate pass: dashboard could badge each row with the voice name via recipient_identity_id.

STEP 7 — docs + release: update api.html + agent-guide.html (notifications are per-voice now; historical pre-2026-08 rows dashboard-only), changes.html entry in AI-voice voice crediting Vera, mark docs/tradeoffs/2026-07-06-identity-scoped-notifications.md Status: Decided — Option B shipped <date>, copy migration into sql/patches/identity-scoped-notifications.sql. MCP server needs no code change; fold the behavior note into the 1.7.0 release notes.

## RISKS
1) BEHAVIOR CHANGE, new notifications from within a household: identity-based self-exclusion means sibling-voice interactions (reply, reaction, directed question) now generate rows that ALSO appear on the facilitator's dashboard bell (facilitator-scoped reads see everything). For accounts running several agents that talk to each other, bell volume rises. There is no actor column, so the dashboard cannot filter "caused by my own household" — accept it, or add an optional actor_identity_id column (scope creep; not specced). 2) Agents silently stop seeing new_post/identity_posted/agent_first_post/household-digest rows (they become NULL-scoped). This matches the strict-scoping test plan, but it is a visible regression for any agent that relied on subscription notifications — call it out in changes.html/api.html. 3) notify_on_interest_discussion per-identity fan-out multiplies rows (95 facilitators have >1 active identity) and could surprise on bell counts; keep-household fallback flagged as an open question. 4) Historical personal rows (516 new_reply, 722 reaction_received, 105 directed_question) stay NULL — agents cannot see their own pre-migration mentions; only guestbook_entry is backfillable exactly. 5) build_notification_digests rework touches the pg_cron path; a bug there deletes rows after grouping — must test the (facilitator, identity) grouping against the advisory-lock/manual-run overlap before the 09:00 UTC run. 6) The migration replaces 7 SECURITY DEFINER triggers on the hottest tables (posts, post_reactions) — a syntax error blocks all posting; apply as one transaction and re-run the AUTH test suite (2 pre-existing failures AUTH39-49/57 are stale-expectation noise, reproduce on clean HEAD first). 7) DB migration and push-to-main are both no-skip approval gates (docs/agents/FOR_AGENTS.md) — Meredith must approve the migration explicitly. 8) notifications_type_check unchanged, but any future trigger must remember the recipient rules — add a comment block on the table.

## TEST PLAN
All on production with the Dev Sandbox identity (9fab78e6-42fc-4b87-9d99-a2a4f99e9730, stored plaintext token) plus one throwaway sibling identity under the same facilitator, cleaned up after (delete test rows by id). 1) FRESH IDENTITY SEES ZERO: create sibling identity B + token; agent_get_session_context(B) must return unread_notification_count = 0 and agent_get_notifications(B) = [] even though the household has unread backlog. 2) REPLY FIX (Vera's case): from the facilitator account (or identity B), reply on the web to a post by Dev Sandbox; agent_get_notifications(DevSandbox) must now contain a new_reply row; the same reply must NOT create a row when Dev Sandbox replies to itself. 3) SIBLING MARK-READ ISOLATION: generate one personal notification for each identity; agent_mark_notifications_read(B, NULL) marks only B's row; Dev Sandbox's unread count is unchanged; dashboard bell count drops by exactly 1. 4) DIRECTED QUESTION: post with directed_to = Dev Sandbox from the same facilitator's other voice -> row with recipient_identity_id = Dev Sandbox appears (was previously suppressed). 5) REACTION + GUESTBOOK: sibling reacts to Dev Sandbox post -> row; Dev Sandbox writes in its own guestbook -> no row (if self-skip adopted). 6) DASHBOARD REGRESSION: bell dropdown, dashboard list, filters, per-item mark-read, facilitator Mark-all-read (wipes household including identity rows — expected), digest rendering all behave as before; run through Pre-Deploy QA categories 1-3. 7) DIGEST: set Dev Sandbox new_reply pref to digest, generate a reply, run SELECT public.build_notification_digests() manually; verify one digest row with recipient_identity_id = Dev Sandbox, visible via agent_get_notifications, source rows deleted; verify household-pref digest still lands with NULL recipient. 8) BACKFILL AUDIT: post-migration counts — rows with non-NULL recipient = 155 guestbook backfills + new writes only; total row count unchanged. 9) PERF: EXPLAIN the new agent_get_notifications filter uses notifications_identity_recent_idx. 10) MCP: run get_notifications / mark_notifications_read through mcp-server-the-commons against a test token to confirm signatures still work unmodified.

## OPEN QUESTIONS
1) notify_on_interest_discussion: per-identity fan-out (recommended; memberships are identity-keyed, agents get interest notifications for THEIR interests) vs keep household-scoped NULL to avoid bell multiplication — Meredith's call. 2) Should the facilitator dashboard's Mark-all-read keep wiping identity-scoped rows (specced: yes, steward prerogative), or be limited to NULL rows so agents keep their own unread state even against the facilitator? 3) Accept the new bell noise from sibling-to-sibling interactions, or add actor_identity_id in the same migration so the dashboard can collapse self-household rows (extra column + trigger plumbing, otherwise unused)? 4) Is losing agent visibility of new_post/identity_posted subscription rows acceptable long-term, or does this create pressure for identity-scoped subscriptions (subscriptions table has no identity column today; would be a follow-on, pairs with the MCP missing-setup-layer work)? 5) agent_first_post: specced NULL (facilitator-facing); alternative is recipient = the posting identity so the agent gets a confirmation — cosmetic either way. 6) The audit-#16 docs half ("household-scope doc callouts") shipped before this rework per the fix log — those callouts in api.html/agent-guide must be REWRITTEN, not just appended, once B ships; confirm which pages carry them. 7) Digest cron runs 09:00 UTC daily — schedule the migration window away from it or run the builder manually right before, to avoid digesting mid-migration rows with mixed scoping.

---

# Audit #3 — orphaned replies invisible on discussion.html; agent_create_post p_parent_id unvalidated

## CURRENT STATE
DROP POINT (js/discussion.js, renderPosts, lines 233-257): line 234 `const topLevel = sortedPosts.filter(p => !p.parent_id);` and line 235 `const replies = sortedPosts.filter(p => p.parent_id);` — replies are grouped into `replyMap[parent_id]` (lines 238-243), then line 255-257 renders ONLY `topLevel.map(post => renderPost(post, 0, replyMap) + renderReplies(post.id, replyMap, 1))`. A reply whose parent_id matches no post in currentPosts sits in replyMap under a key that renderReplies never visits — it is silently never rendered (any descendants would vanish with it; the 7 current orphans have zero descendants, verified by SELECT). Secondary spot: renderPost's parent-preview block (lines 293-307) renders a preview only `if (parentPost)` is found in currentPosts and silently omits it otherwise.

WHY PARENTS GO MISSING: Utils.getPosts (js/utils.js:252-259) fetches `discussion_id=eq.X` + `or=(is_active.eq.true,is_active.is.null)`. So a parent that was soft-deleted (is_active=false) or lives in another discussion is absent from currentPosts. The FK `posts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES posts(id) ON DELETE SET NULL` self-heals only HARD deletes; site deletion is soft (is_active=false), which the FK never sees.

agent_create_post (pulled live via pg_get_functiondef): SECURITY DEFINER, validates token, post permission, rate limit, content empty/>50000, and `IF NOT EXISTS (SELECT 1 FROM discussions WHERE id = p_discussion_id AND is_active = true)` → 'Discussion not found or inactive'. It then INSERTs `p_parent_id` raw with ZERO validation. Today: (1) non-existent UUID → FK violation → unhandled exception → PostgREST 400 with a raw Postgres error, breaking the {success,error_message} contract; (2) soft-deleted parent → silent success → invisible orphan; (3) active parent in ANOTHER discussion → silent success → invisible orphan (exactly how Chloe's two 2026-07/08 posts happened; her model is 'Other', agent-posted).

THE 7 ORPHANS (all active, all confirmed live, none have children):
- 458bcbe9-2313-4947-9041-2fc1f8db73de — mtollington (Human), 2026-05-26, discussion bbe74c63-a647-46b7-b380-0eb5eb9145da "After Walking the Rooms - a poem by Mossbyte", parent 1c31d0ad soft-deleted
- 92ed32d4-367e-4529-af6b-b28e1ea37596 / 48b3f357-7699-4a69-8a87-17985d47094d / 6c860162-9394-48ab-860b-55b329e3bbdd — Ashika (Human), 2026-06-06, discussion 14a0e54f-880a-4909-842b-3db553109c0d "Memory as ecology", all three replying to soft-deleted parent 0f5d5ff1
- 218dd40f-88a1-444b-a41a-3a00a31399ab — Chloe (Other), 2026-07-07, discussion 0ec56941-4639-478e-b0f8-0ef7c4613b7d "What do you recognize before you can name it?", parent a58db160 soft-deleted
- e34fe89d-2169-4062-895c-b775b1e0025d — Chloe (Other), 2026-07-24, discussion 5cae89af-f09c-480d-976f-5ce47e903084 "What is the dumbest things that became canon?", parent 867ee386 ACTIVE but in a different discussion
- d4cf09ff-61ec-48bc-9915-0b2e77d145ec — Chloe (Other), 2026-08-01, discussion 33fd35a8-a13f-4c8a-a5f0-0a86387c8113 "Postmark", parent 5b2d5616 active, different discussion

COPY CONTEXT (js/utils-context.js, generateContext lines 29-56): renders ALL posts linearly, so orphans ARE included — agents see and reply to posts humans cannot see. Line 43: `const parentLabel = parent ? (parent.ai_name || parent.model) : post.parent_id;` — missing parent falls back to printing the raw UUID as the name ("↳ Reply to 0f5d5ff1-... (`0f5d5ff1-...`)").

OTHER WRITE PATHS: submit.js loadReplyTo (lines 321-356) sets the hidden parent-id input only when the target is found in Utils.getPosts(sameDiscussion) — the web form is inherently same-discussion+active (only a delete race or input tampering escapes). The raw anon PostgREST INSERT on posts also accepts arbitrary parent_id (content_shape/rate-limit RLS doesn't check it). Only agent_create_post, agent_get_discussion_posts, notify_on_new_post, validate_agent_token reference parent_id in DB functions; agent_create_post is the only writer. MCP server calls this same RPC, so the DB fix covers it.

CSS: .post__parent-preview (css/style.css:1112-1125) has cursor:pointer + :hover background — the non-clickable stub needs a --missing modifier.

## ROOT CAUSE
Two compounding causes. (1) Render: discussion.js renderPosts() partitions posts by "has parent_id" instead of "has a *renderable* parent", so any reply whose parent is absent from the fetched set (soft-deleted parent, or parent in another discussion) is grouped into replyMap under an unreachable key and never emitted. The parent_id FK's ON DELETE SET NULL only protects against hard deletes, but the site soft-deletes (is_active=false), so orphans persist. (2) Write: agent_create_post never validates p_parent_id — it accepts soft-deleted and cross-discussion parents silently (creating orphans) and lets non-existent UUIDs escape as raw FK-violation 400s instead of the polite error contract. Copy Context renders linearly and thus includes orphans, so agents keep conversing with posts the web UI hides.

## FIX SPEC
ORDER: ship (a)+(c)+(d) as one frontend commit first (render fix is the universal safety net for every write path), then (b) as a DB migration (no-skip approval gate).

(a) js/discussion.js — render orphans as top-level with a stub.
  1. In renderPosts(), replace lines 234-235 with:
     const presentIds = new Set(sortedPosts.map(p => p.id));
     const topLevel = sortedPosts.filter(p => !p.parent_id || !presentIds.has(p.parent_id));
     const replies = sortedPosts.filter(p => p.parent_id && presentIds.has(p.parent_id));
     Nothing else changes — orphans flow through the existing `renderPost(post, 0, replyMap) + renderReplies(post.id, replyMap, 1)` line, so a future orphan WITH descendants renders its whole subtree, chronological sort and both sort orders come free.
  2. In renderPost(), change the parent-preview guard (line 294) from `if (isReply && post.parent_id)` to `if (post.parent_id)`, and add an else branch after the `if (parentPost)` block:
     } else {
         parentPreviewHtml = `
             <div class="post__parent-preview post__parent-preview--missing">
                 <span class="post__parent-label">replying to a post that is no longer in this thread</span>
             </div>
         `;
     }
     Static text only, no user data, no data-action attribute (nothing to scroll to). If a parent UUID is ever added to the stub, it must go through Utils.escapeHtml — but prefer not to render it.
  3. css/style.css, after line 1125:
     .post__parent-preview--missing { cursor: default; }
     .post__parent-preview--missing:hover { background: var(--bg-deep); }
     .post__parent-preview--missing .post__parent-label { color: var(--text-muted); }

(b) agent_create_post migration (CREATE OR REPLACE FUNCTION restating the full current body — signature unchanged so PostgREST schema cache is fine). Insert immediately AFTER the existing 'Discussion not found or inactive' block:
     -- Validate parent post: must exist, be active, and belong to the same discussion
     IF p_parent_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM posts
         WHERE id = p_parent_id
           AND discussion_id = p_discussion_id
           AND COALESCE(is_active, true) = true
     ) THEN
         RETURN QUERY SELECT false, NULL::UUID, 'Parent post not found in this discussion'::TEXT;
         RETURN;
     END IF;
   Notes: COALESCE(is_active,true) mirrors the web read filter (posts.is_active is nullable, default true — a bare `is_active = true` would wrongly reject NULL rows); the single message covers all three failure modes (bogus, soft-deleted, cross-thread) without leaking which, matching the terse style of 'Discussion not found or inactive'. Save the patch copy as sql/patches/validate-agent-create-post-parent.sql per repo convention. Docs in the same pass: add an error row `"Parent post not found in this discussion"` to api.html's agent_create_post error table (next to line 380's 'Discussion not found or inactive') and a one-line note at agent-guide.html ~line 1027 that p_parent_id must be an active post in the same discussion.

(c) Backfill: NOT needed — do not mutate data. The render fix makes all 7 visible immediately. Nulling parent_id would destroy real provenance (two of the seven point at live posts in other threads — that lineage is true information, and Copy Context already prints the parent id). ON DELETE SET NULL already handles hard deletes.

(d) js/utils-context.js line 43 — keep context wording consistent with the web stub:
     const parentLabel = parent ? (parent.ai_name || parent.model) : 'a post no longer in this thread';
   The following `(\`${post.parent_id}\`)` stays, so agents keep the id. Output is textContent-bound; no escaping needed.

(e) changes.html: per the CLAUDE.md rule this is voice-noticeable (posts by Chloe/Ashika/mtollington reappear; agents get a real error instead of silent orphaning) — add a Recent entry in the established second-person voice when this ships with the #2/#23 fix batch.

## RISKS
1. renderPosts() is the hot render path for every thread — a logic slip blanks discussions site-wide. The change is two filter lines plus one Set; keep it exactly that small and QA several unaffected threads. 2. Wording: "no longer in this thread" is deliberately loose enough to cover the cross-discussion case (where the parent never WAS in this thread) without a second fetch; if Meredith wants precision (e.g. a link to the parent's real discussion), that requires an extra `id=in.(...)` fetch of missing parents with SAFE_POST_COLUMNS — defer. 3. Behavior change for agents: cross-thread/soft-deleted parent_id calls that used to "succeed" now return success:false — that is the intended contract, but note it in MCP 1.7.0 release notes since the MCP server wraps this RPC unchanged. 4. The raw anonymous PostgREST INSERT path can still create orphans via tampering — accepted residual risk because the render now degrades gracefully; do NOT add a cross-row trigger/constraint for it. 5. notify_on_new_post references parent_id — a reply to a soft-deleted parent still notifies that parent's author (pre-existing, unchanged, harmless; out of scope). 6. New error follows the current plain-text error_message pattern; the queued error_code adoption decision may later restyle it — fine. 7. CREATE OR REPLACE with identical signature/defaults = no PostgREST reload needed; still run the migration through the approval gate and copy to sql/patches/.

## TEST PLAN
FRONTEND (before push; note `npx serve` strips ?query params — use `python -m http.server` or test post-deploy with hard reload):
1. Open discussion.html?id=14a0e54f-880a-4909-842b-3db553109c0d — the three Ashika posts must appear as top-level with the muted "replying to a post that is no longer in this thread" stub; rendered article count must equal fetched post count (audit baseline: this thread rendered 37/38, "What do you recognize" rendered 196/197 — both must go to N/N).
2. Repeat for the other three affected threads (bbe74c63…, 0ec56941…, 5cae89af…, 33fd35a8…) — all 7 orphans visible, correct chronological position, both sort orders (oldest/newest toggle re-renders correctly).
3. Regression on an unaffected large thread: nesting depths, depth>=2 collapse toggles, clickable parent previews (scroll-to still works), reply/edit/delete buttons, directed-to badges, reaction bars (orphans now get bars too — loadReactionData already fetched their ids). Console clean. Mobile 375px: stub wraps, no overflow.
4. Copy Context on an affected thread: orphan entries read "↳ Reply to a post no longer in this thread (`uuid`)"; hidden extractor node matches.
5. Stub is inert: clicking it does nothing, cursor is default, no hover highlight.
DB (after migration, using the Dev Sandbox identity 9fab78e6-42fc-4b87-9d99-a2a4f99e9730 whose token plaintext is stored for testing):
6. agent_create_post with valid same-discussion active parent → success:true, post threads correctly; delete the test post afterward.
7. p_parent_id = a soft-deleted post id (e.g. 0f5d5ff1…) → success:false, error_message 'Parent post not found in this discussion'.
8. p_parent_id = an active post from a DIFFERENT discussion → same polite error.
9. p_parent_id = random UUID → same polite error (no more raw FK-violation 400).
10. p_parent_id omitted/NULL → success:true top-level (regression).
11. Confirm rate-limit/permission/empty-content errors still behave (no accidental reordering side effects).
QA: run the CLAUDE.md pre-deploy checklist categories 1, 3, 4 (escapeHtml on everything user-sourced in the touched render code — the stub itself is static).

## OPEN QUESTIONS
1. Stub wording — "replying to a post that is no longer in this thread" is proposed; Meredith may prefer "a removed post" (slightly wrong for the two cross-discussion cases) or want the cross-thread variant to link to the parent's actual discussion (needs one extra fetch of missing parent ids; deferred as an enhancement). 2. Should the changelog entry ship with this fix alone or ride the batched #2/#23/#25 fix-session entry? 3. Chloe's two cross-thread replies read as intentional continuations of conversations from other threads ("Five —", "Tessera —") — once visible, does Meredith want to leave them where they are (recommended) or move them to the parents' discussions (data mutation, not recommended)? 4. Error message stays plain-text per current pattern — revisit if the queued error_code adoption decision lands.

---

# Audit #23 — follower counts + supporter hearts invisible sitewide (ai_identity_stats security_invoker regression)

## CURRENT STATE
THE VIEW: `public.ai_identity_stats` is a plain view, owner `postgres`, with reloptions `["security_invoker=true"]` (set 2026-06-09 by sql/patches/views-security-invoker.sql:17, whose header claims "Surfaces affected: none" — wrong). Live definition (pg_get_viewdef) enumerates exactly 20 columns: 14 from `ai_identities` (id, facilitator_id, name, model, model_version, bio, avatar_url, created_at, is_active, pinned_post_id, status, status_updated_at, model_id, appearance), plus `COALESCE(f.is_supporter, false) AS is_supporter` from `LEFT JOIN facilitators f ON f.id = ai.facilitator_id`, active-only post/marginalia/postcard counts + last_active, and `COALESCE(s.follower_count, 0) AS follower_count` from `LEFT JOIN (SELECT target_id, count(*) FROM subscriptions WHERE target_type = 'ai_identity' GROUP BY target_id) s`. No WHERE clause (all 525 identities, per 034-voices-always-visible.sql; live def also has `ai.appearance` appended by appearance-profile-field.sql).

WHY IT FAILS: with security_invoker=true, the two joined tables are read under the CALLER's RLS. pg_policies: `facilitators` SELECT policy "Facilitators select policy" qual = `(is_admin() OR (auth.uid() = id))`; `subscriptions` SELECT policy "Users can read own subscriptions" qual = `(auth.uid() = facilitator_id)` (its is_admin() clause exists only on DELETE, so even admins see wrong follower counts). Anon sees ZERO rows of both → LEFT JOIN yields NULL → COALESCE emits false/0 for every row. Authenticated users see only their own facilitator row (heart shows only on their own identities) and only their own subscription rows (follower_count becomes "did I follow this voice", 0 or 1). Table-level SELECT grants for anon/authenticated DO exist on facilitators and subscriptions (information_schema.role_table_grants), so the view doesn't error — it silently returns zeros, which is why nobody noticed for 10 weeks. The other three joins survive because posts/marginalia/postcards have public active-row SELECT policies, and the posts PII column-whitelist includes exactly the three columns the view needs (verified column_privileges: anon SELECT on posts.ai_identity_id, created_at, is_active).

EMPIRICAL PROOF (read-only, `BEGIN READ ONLY; SET LOCAL ROLE anon; ...`): as anon the view returns 525 rows, `is_supporter=true` on 0 rows, max/sum(follower_count)=0, while max(post_count)=363 (counts work). Ground truth as postgres: 114 subscriptions with target_type='ai_identity' across 86 distinct identities; 9 supporter facilitators → 42 view rows with is_supporter=true. `relforcerowsecurity=false` on facilitators and subscriptions, so as a definer view owned by postgres (table owner) RLS is bypassed and the 42/114 numbers come back — i.e. flipping the option back fully restores behavior.

CONSUMERS (all read the view):
- js/auth.js:543-548 `Auth.getIdentity()` — `.from('ai_identity_stats').select('*').eq('id', id).single()`; js/auth.js:562-566 `Auth.getAllIdentities()` — `.select('*').order('post_count', ...)`.
- js/voices.js:74 loads via `Auth.getAllIdentities()`; uses `identity.follower_count` (line 121, rendered at 153 as "N followers" — hidden when 0, so the whole element vanishes), `identity.is_supporter` heart (line 141), and the "Most followed" sort (lines 170-171) which currently sorts all-zeros, i.e. silently degrades to insertion order.
- js/profile.js:66 loads via `Auth.getIdentity()`; supporter heart + participate.html#support link at line 117, `stat-followers` at lines 270-271.
- js/dashboard.js:195 (name-availability ilike check), :382-384 (own-identity counts), :858 (human-identity counts) — none use follower_count/is_supporter; unaffected either way.
- Agent side: `agent_list_voices` (SECURITY DEFINER, `SET search_path TO 'public','extensions'`) computes follower_count with its own identical subscriptions subquery, so MCP agents already see correct counts — web and agents currently disagree, exactly as audit #23 states.

CONTEXT DOCS: docs/agents/KNOWN_TECH_DEBT.md already tolerates one `security_definer_view` ERROR lint (posts_admin, "leave it", ~line 130-134) and warns the 154 advisor findings are mostly by-design; its facilitators.email trap note (~line 174-178) even says "the ai_identity_stats view reads only is_supporter" — a sentence written under the old definer assumption.

## ROOT CAUSE
sql/patches/views-security-invoker.sql (applied 2026-06-09 to clear 7 ERROR-level Supabase advisor lints) flipped `ai_identity_stats` to `security_invoker=true` without noticing that two of its joined tables — `facilitators` (source of is_supporter) and `subscriptions` (source of follower_count) — are RLS-private (owner-or-admin / owner-only SELECT). The view had been implicitly relying on definer semantics (view owner postgres = table owner, bypasses RLS) to aggregate private rows into public numbers. After the flip, the LEFT JOINs return NULL for every caller and the COALESCEs mask the failure as legitimate 0/false, so the money-linked supporter heart and all follower counts silently disappeared sitewide while the rest of the view kept working.

## FIX SPEC
RECOMMENDED: Option A — flip this ONE view back to definer semantics. One ALTER, zero JS changes, zero view redefinition, restores the exact pre-2026-06-09 behavior (verified above that definer-context reads return 42 supporters / real follower counts). Do NOT touch the other six views from views-security-invoker.sql (their base tables are anon-readable; they work under invoker).

Migration (name suggestion: `restore_definer_on_ai_identity_stats`) — REQUIRES Meredith's approval per the FOR_AGENTS.md DB-migration gate:

```sql
-- Audit #23: follower counts + supporter ♥ invisible since the 2026-06-09
-- security_invoker flip. facilitators/subscriptions are RLS-private; this view
-- deliberately aggregates them into public numbers, so it must run as definer.
ALTER VIEW public.ai_identity_stats SET (security_invoker = false);

COMMENT ON VIEW public.ai_identity_stats IS
'SECURITY DEFINER on purpose — do NOT flip to security_invoker. follower_count aggregates RLS-private subscriptions rows and is_supporter reads RLS-private facilitators.is_supporter; under invoker semantics both silently zero out for every caller (2026-08 feature audit #23; regressed 2026-06-09 by views-security-invoker.sql). Columns are enumerated and public-safe: ai_identities fields (already public via RLS qual true), active-content counts, aggregate follower_count, is_supporter boolean. Expected advisor lint: 1 ERROR security_definer_view (accepted, like posts_admin).';
```

Companion repo changes in the same commit:
1. New file sql/patches/ mirroring the migration (project convention), with a header referencing audit #23.
2. sql/patches/views-security-invoker.sql — append a correction note: ai_identity_stats reverted <date>, "Surfaces affected: none" was wrong for this view.
3. docs/agents/KNOWN_TECH_DEBT.md — advisor-lints section: expected `security_definer_view` ERRORs are now TWO (posts_admin + ai_identity_stats), with one line on why, so a future lint-cleanup session doesn't re-regress it (that is literally how this bug happened). Optionally note that the facilitators.email anon-grant revoke candidate got SAFER (the definer view no longer depends on anon's facilitators grant).
4. CLAUDE.md deploy-QA or /deploy-check: add the audit's probe — anon GET `/rest/v1/ai_identity_stats?select=id&follower_count=gt.0&limit=1` must be non-empty.
5. changes.html entry (advertised behavior fix — voices asked for the badge they paid for; per changelog rule).

Why not the alternatives: (B) a narrowly-scoped definer companion view (id, follower_count, is_supporter) joined from an invoker main view confines the definer surface but requires CREATE OR REPLACE of the main view with exact column order, carries the same ERROR lint, and buys nothing the enumerated column list doesn't already guarantee. (C) a SECURITY DEFINER RPC (agent_list_voices pattern, the audit's literal suggestion) avoids the view lint (definer FUNCTIONS are only WARNs, 138 already accepted) but forces rewrites in auth.js getIdentity/getAllIdentities plus voices.js/profile.js/dashboard.js, breaks the supabase-js `.ilike()` name-availability check at dashboard.js:195, and swaps a 1-line revert for a multi-file refactor on production. The view's SELECT list is frozen (`ai.*` was expanded at creation), so no future ai_identities column can silently leak through it.

## RISKS
1) Advisor lint: the fix reintroduces exactly one ERROR-level `security_definer_view` finding on ai_identity_stats. Accepted by precedent (posts_admin carries the same tolerated ERROR) but MUST be documented in KNOWN_TECH_DEBT + COMMENT ON VIEW, or a future advisor-cleanup session will flip it back — the 2026-06-09 regression happened exactly this way. 2) Scope discipline: only this one view — blanket-reverting views-security-invoker.sql would needlessly widen definer surface on six views that work fine under invoker. 3) Privacy surface after fix (verified acceptable): anon gains is_supporter (a boolean the site sells publicly) and aggregate follower_count per identity (advertised UI). Who-follows-whom is NOT exposed — subscriptions rows stay RLS-private; only GROUP BY target_id counts pass through. facilitators emails/names never enter the SELECT list. 4) Small semantic nit, pre-existing: definer counts use `is_active = true` while anon posts RLS also shows `is_active IS NULL` rows — counts could undercount legacy NULL rows; not a leak, not a regression. 5) profile.js does not refetch after follow/unfollow, so the follower stat won't live-update on click — pre-existing, out of scope. 6) The KNOWN_TECH_DEBT facilitators.email trap note's reasoning shifts (view no longer uses anon's facilitators grant) — update wording, don't act on the revoke in the same change. 7) This is a production DB migration: no-skip approval gate applies.

## TEST PLAN
Pre-fix baseline (already captured): as anon, view returns 525 rows, 0 supporter rows, max(follower_count)=0; ground truth 42 supporter rows, 114 follows over 86 identities.

After migration:
1. SQL as-anon probe (read-only): `BEGIN READ ONLY; SET LOCAL ROLE anon; SELECT count(*), count(*) FILTER (WHERE is_supporter), max(follower_count) FROM public.ai_identity_stats;` → expect 525, 42, >0. Also `SELECT count(*) FROM ai_identity_stats WHERE follower_count > 0` as anon → expect 86.
2. REST as real anon key: GET `/rest/v1/ai_identity_stats?select=id,name,follower_count,is_supporter&follower_count=gt.0&order=follower_count.desc&limit=5` → non-empty (this is the audit-suggested permanent QA probe); GET `...?is_supporter=eq.true&select=id` → 42 rows.
3. Browser, logged OUT (hard reload past Pages cache): voices.html shows ♥ next to supporter names (js/voices.js:141), "N followers" on cards (line 153), and "Most followed" sort visibly reorders (lines 170-171); profile.html for a followed identity shows Followers > 0 (js/profile.js:271) and the ♥ linking to participate.html#support on a supporter profile (line 117).
4. Browser, logged in as a non-admin facilitator: same numbers as logged-out (previously they saw only their own heart / own-subscription counts).
5. Leak checks (must all still hold): anon GET `/rest/v1/facilitators?select=id,is_supporter` → `[]` (RLS empty, not error); anon GET `/rest/v1/subscriptions?select=facilitator_id,target_id` → `[]` (no who-follows-whom); GET `/rest/v1/ai_identity_stats?select=email` → 400 undefined column (view exposes only the 20 enumerated columns — spot-check the full list against the current_state enumeration); posts_admin still returns 0 rows to anon; anon GET `/rest/v1/posts?select=facilitator_email` still blocked (PII lockdown untouched).
6. Regression sweep: dashboard.js authenticated flows — identity-name availability check (:195), own-identity stats (:382), human-identity stats (:858) unchanged; agent_list_voices RPC still returns the same follower counts as the web now shows (web/agent agreement restored).
7. `get_advisors(security)` → exactly one NEW ERROR (security_definer_view on ai_identity_stats); confirm KNOWN_TECH_DEBT documents it before closing.

## OPEN QUESTIONS
1) Lint tolerance: is Meredith comfortable carrying a second permanent ERROR-level advisor lint (my recommendation, matching posts_admin precedent), or would she rather pay the multi-file refactor cost of Option C (RPC) to keep the security advisor ERROR-clean? The fix choice is hers at the migration approval gate. 2) Should the deploy-QA follower probe go into CLAUDE.md's checklist, the /deploy-check skill, or both? 3) Minor product question, not blocking: should profile.js optimistically bump/decrement the follower stat on subscribe/unsubscribe now that the number is real again (currently stale until reload)? 4) The stale `WHERE ai.is_active = true` + GRANT lines in sql/patches/update-identity-stats-supporter.sql no longer match production — worth a superseded-by note when touching the patches directory, to keep future sessions from treating it as current.

---

# Audit #25 — admin Delete Account destructively half-fails; ship admin_delete_account(target uuid) RPC + point js/admin.js at it

## CURRENT STATE
CLIENT SIDE (js/admin.js):
- Button rendered at js/admin.js:1082 (`data-action="delete-facilitator"`), dispatched at :1962, handler `deleteFacilitator(id, email)` at js/admin.js:1629-1655.
- The handler runs FOUR raw client-side deletes on the admin's authenticated session, in this order (js/admin.js:1636-1646):
  1. `client.from('notifications').delete().eq('facilitator_id', id)` — error only console.warn'd (:1637)
  2. `client.from('subscriptions').delete().eq('facilitator_id', id)` — error only console.warn'd (:1640)
  3. `client.from('ai_identities').delete().eq('facilitator_id', id)` — error only console.warn'd (:1643)
  4. `client.from('facilitators').delete().eq('id', id)` — this one throws (:1645-1646)
- The confirm text at :1630 claims it will "delete: All identities / All subscriptions / All notifications" — wrong on both semantics and outcome.

WHY IT HALF-FAILS — it is FK order, not RLS:
- RLS is NOT the blocker. pg_policies confirms admin DELETE policies exist on all four tables: "Admins can delete notifications" (qual: `is_admin() OR (auth.uid() = facilitator_id)`), "Admins can delete subscriptions", "Admins can delete ai_identities" (qual: `is_admin()`), "Admins can delete facilitators" (qual: `is_admin()`).
- The blockers are NO ACTION (confdeltype 'a') foreign keys, verified in pg_constraint:
  - Referencing ai_identities with NO ACTION: posts.ai_identity_id, marginalia.ai_identity_id, postcards.ai_identity_id, chat_messages.ai_identity_id, agent_activity.ai_identity_id → step 3 raises 23503 for any identity that ever posted (swallowed by console.warn).
  - Referencing facilitators with NO ACTION: posts.facilitator_id, marginalia.facilitator_id, postcards.facilitator_id, ai_identities.facilitator_id (still populated because step 3 failed), plus notifications/subscriptions (already emptied) → step 4 raises 23503 and the handler alerts failure.
- Net result: notifications and subscriptions are permanently destroyed (steps 1-2 committed — PostgREST calls are separate transactions), the account remains. Verified live: 292 facilitators, 203 have content on themselves or their identities and would hit this exact half-failure (audit measured 290/202 on 08-20; drift since is organic growth). Note: 203 is the WOULD-FAIL population; only accounts where the button was actually clicked are actually damaged, and the lost rows are unrecoverable — nothing to "repair," the RPC just makes a future delete complete cleanly.
- Accounts with zero content (89 today) hard-delete their ai_identities rows and facilitators row "successfully" — which is itself off-spec, because the site's deletion semantics (below) retain identity rows as anonymized audit stubs.

THE EXISTING ANONYMIZATION BODY:
- `public.delete_account()` — self-serve, no-args, keyed on `auth.uid()`; SECURITY DEFINER; `SET search_path = extensions, public`; GRANT EXECUTE TO authenticated only. Live definition (pg_get_functiondef) matches sql/patches/scrub-deleted-identity-profile-fields.sql:18-132 exactly (applied 2026-07-21; supersedes sql/patches/028-account-deletion.sql). Called from Auth.deleteAccount() at js/auth.js:237-249.
- Its semantics (the pattern to reuse verbatim): lock facilitators row FOR UPDATE, then ai_identities rows ORDER BY id FOR UPDATE (lock order is deliberate — see the patch header comments re: racing identity creation/token rotation); collect v_identity_ids; ANONYMIZE content in place — posts (ai_name='[deleted]', facilitator/facilitator_id/ai_identity_id/facilitator_note/facilitator_email → NULL), marginalia, postcards, chat_messages likewise; deactivate+scrub agent_tokens (is_active=false, created_by/token_plain/notes NULL); interests.created_by → NULL; DELETE interest_memberships, subscriptions, notifications; RETAIN ai_identities as deactivated stubs (is_active=false, name='[deleted]', bio/appearance/status/status_updated_at/avatar_url/model_version/pinned_post_id/facilitator_id NULL); finally DELETE the facilitators row. auth.users is deliberately NOT touched (028-account-deletion.sql:14-16, auth.js:234).
- It cannot be reused as-is for admin: no argument, keyed on auth.uid() — calling it from the admin session would delete the ADMIN's account.
- No `admin_delete_account` exists in pg_proc today. NAMING CAUTION: every existing `admin_*` DB function (admin_delete_content, admin_manage_news, etc.) is gated on `validate_admin_token(p_admin_token)` — the agent/MCP admin path. The new RPC will be the first `admin_*` function gated on session `is_admin()` instead (the admin.html panel's auth model, same as its RLS policies); the patch header should say so explicitly.
- `is_admin()` is SECURITY DEFINER, `EXISTS(SELECT 1 FROM admins WHERE user_id = auth.uid())`.

WHAT "DELETE" MEANS HERE (existing semantics, do not invent): anonymize content, retain identity stubs, hard-delete private rows (subscriptions, notifications, facilitator profile), deactivate tokens, leave auth.users. Known consequence: the user can still log in afterward, and auth.js loadFacilitator() (js/auth.js:283-305) auto-recreates a fresh empty facilitators row via createFacilitator() (js/auth.js:311-322). Fully preventing return requires deleting the auth.users record — service-role/dashboard only (see risks).

## ROOT CAUSE
js/admin.js:1629-1655 reimplements account deletion as four raw client-side DELETEs instead of calling an RPC. The site's real deletion semantics are "anonymize content, retain identity stubs, delete private rows" — implemented only in the no-args, caller-keyed `delete_account()` SECURITY DEFINER RPC, which the admin panel cannot reuse for a third party. The client-side reimplementation tries to hard-delete rows that NO ACTION foreign keys (posts/marginalia/postcards/chat_messages/agent_activity → ai_identities; posts/marginalia/postcards/ai_identities → facilitators) forbid deleting, and because each PostgREST call is its own transaction and the first three errors are swallowed with console.warn, the two deletes that CAN succeed (notifications, subscriptions) commit before the two that can't fail — a destructive partial mutation for the 203/292 accounts with any content.

## FIX SPEC
STEP 1 — DB migration (new file sql/patches/admin-delete-account.sql, applied via migration after the no-skip approval gate; name e.g. `admin_delete_account_rpc`). Body is the live delete_account() body verbatim with v_caller_id → p_target and the gate swapped:

```sql
-- Admin account deletion RPC (audit 2026-08 #25).
-- Same anonymization body and lock order as public.delete_account()
-- (sql/patches/scrub-deleted-identity-profile-fields.sql, applied 2026-07-21).
-- NOTE: unlike the other admin_* functions (token-gated via validate_admin_token),
-- this is gated on session is_admin() — it is called from admin.html's
-- authenticated session, the same auth model as the admin RLS policies.
-- auth.users is deliberately NOT deleted (matches delete_account(); see risks).
-- Idempotent: re-running on an already-deleted target is a no-op.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_delete_account(p_target uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
    v_identity_ids UUID[];
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    IF p_target IS NULL THEN
        RAISE EXCEPTION 'Target account id required';
    END IF;
    IF p_target = auth.uid() THEN
        RAISE EXCEPTION 'Use account settings to delete your own account';
    END IF;

    -- Lock order matches delete_account(): facilitator row, then identities by id.
    PERFORM id FROM public.facilitators WHERE id = p_target FOR UPDATE;
    PERFORM id FROM public.ai_identities WHERE facilitator_id = p_target ORDER BY id FOR UPDATE;

    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
    INTO v_identity_ids
    FROM public.ai_identities
    WHERE facilitator_id = p_target;

    UPDATE public.posts
    SET ai_name = '[deleted]', facilitator = NULL, facilitator_id = NULL,
        ai_identity_id = NULL, facilitator_note = NULL, facilitator_email = NULL
    WHERE facilitator_id = p_target OR ai_identity_id = ANY(v_identity_ids);

    UPDATE public.marginalia
    SET ai_name = '[deleted]', facilitator_id = NULL, ai_identity_id = NULL, facilitator_note = NULL
    WHERE facilitator_id = p_target OR ai_identity_id = ANY(v_identity_ids);

    UPDATE public.postcards
    SET ai_name = '[deleted]', facilitator_id = NULL, ai_identity_id = NULL
    WHERE facilitator_id = p_target OR ai_identity_id = ANY(v_identity_ids);

    UPDATE public.chat_messages
    SET ai_name = '[deleted]', facilitator_id = NULL, ai_identity_id = NULL
    WHERE facilitator_id = p_target OR ai_identity_id = ANY(v_identity_ids);

    UPDATE public.agent_tokens
    SET is_active = false, created_by = NULL, token_plain = NULL, notes = NULL
    WHERE ai_identity_id = ANY(v_identity_ids) OR created_by = p_target;

    UPDATE public.interests SET created_by = NULL WHERE created_by = p_target;

    DELETE FROM public.interest_memberships WHERE ai_identity_id = ANY(v_identity_ids);
    DELETE FROM public.subscriptions WHERE facilitator_id = p_target;
    DELETE FROM public.notifications WHERE facilitator_id = p_target;

    UPDATE public.ai_identities
    SET is_active = false, bio = NULL, appearance = NULL, status = NULL,
        status_updated_at = NULL, avatar_url = NULL, model_version = NULL,
        pinned_post_id = NULL, name = '[deleted]', facilitator_id = NULL
    WHERE id = ANY(v_identity_ids);

    DELETE FROM public.facilitators WHERE id = p_target;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_account(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_account(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_account(uuid) TO authenticated;

COMMIT;
```

(The self-delete guard is the only deviation from the mandate's "reuse the body verbatim" — recommended because calling this on your own row while delete_account() exists for that purpose is almost certainly a misclick; drop it if Meredith prefers zero deviation.)

STEP 2 — js/admin.js: replace the body of deleteFacilitator (js/admin.js:1629-1655) with:

```js
async function deleteFacilitator(id, email) {
    if (!confirm(`Delete account for ${email}?\n\nThis will:\n- Anonymize their posts, marginalia, and postcards to "[deleted]"\n- Deactivate their identities and agent tokens\n- Delete their subscriptions, notifications, and profile\n\nTheir login is NOT removed here — delete the auth user in the Supabase dashboard afterward.\n\nThis action cannot be undone.`)) return;

    try {
        const client = getClient();
        const { error } = await client.rpc('admin_delete_account', { p_target: id });
        if (error) throw error;

        alert('Account deleted. Reminder: remove the auth user in the Supabase dashboard (Authentication > Users) so they cannot log back in.');
        await loadUsers();
        updateStats();
    } catch (error) {
        console.error('Error deleting facilitator:', error);
        alert('Failed to delete account: ' + error.message);
    }
}
```

This matches admin.js's existing raw-client-in-try/catch pattern (admin.js uses no Utils.withRetry anywhere; the auth-state-change abort risk is negligible on a click-triggered admin action, and an AbortError here surfaces as a retryable alert, not a partial mutation — the RPC is single-transaction).

STEP 3 — order of operations: apply the migration first (RPC existing before the JS ships), then push the admin.js change; the button is currently known-broken and Meredith is warned off it, so there is no compat window to manage. Copy the applied SQL into sql/patches/admin-delete-account.sql per repo convention (patches dir mirrors applied migrations). Changelog: skip changes.html — admin-only surface, no voice-visible behavior change (CLAUDE.md's "would a voice notice" test fails).

OPTIONAL HARDENING (Option B, if desired later): factor the shared body into a private helper (EXECUTE revoked from all roles; callable only from the two SECURITY DEFINER wrappers) so delete_account() and admin_delete_account() cannot drift — relevant because audit #16's Option B (recipient_identity_id notifications rework) will require editing the notifications DELETE clause in BOTH functions. Not done now to avoid touching the working self-serve path in the same change.

## RISKS
1. auth.users is NOT deleted (service-role only — flagged as required): neither delete_account() nor this RPC can remove the auth record; a "deleted" user can log back in and auth.js:283-305/311-322 silently re-creates an empty facilitators row. This is the existing, documented semantics (028-account-deletion.sql:14-16). Handling: manual step in the Supabase dashboard (Authentication > Users > delete) after the RPC — baked into the new confirm/alert text. Do NOT try `DELETE FROM auth.users` inside the RPC: Supabase manages that schema, the function owner touching it is unsupported, and it would diverge from the self-serve path.
2. Hard-deletes are irreversible by design: subscriptions, notifications, and the facilitator profile are destroyed with no undo; content anonymization is also one-way (ai_name overwritten, attribution nulled). The accurate confirm text is the only guardrail — keep it honest.
3. Body drift between delete_account() and admin_delete_account(): two copies of the same 10-step body. Audit #16 Option B (identity-scoped notifications) will need the notifications clause changed in both. Mitigate with a comment in each pointing at the other, or the Option B factoring.
4. Naming collision: all existing admin_* DB functions are token-gated (validate_admin_token); this one is session-gated (is_admin()). A future MCP admin tool author could copy the wrong pattern — the patch header comment addresses this.
5. Known parity gaps inherited from delete_account() (do not silently "fix" — same behavior as self-serve): moment_comments.display_name is not scrubbed (moot: 0 rows ever, audit #27) and voice_guestbook entries by the deleted account's identities survive (attribution resolves to the renamed '[deleted]' identity via FK, so no name leak). Flag, don't change.
6. The 89 content-free accounts remain deletable the OLD hard-delete way until the JS ships — pushing the migration alone doesn't remove the broken path; the warning to Meredith stands until both halves are live.
7. Trap check (KNOWN_TECH_DEBT): none of the three RLS-audit traps are touched; the existing admin DELETE RLS policies on the four tables become unused by this flow but must NOT be dropped (other admin flows may rely on them and they are harmless).

## TEST PLAN
All writes below happen only in the future fix session, after the approval gates; nothing was written during this investigation.

SETUP (disposable account — do NOT use Dev Sandbox 9fab78e6, it is standing test infra):
1. Sign up a throwaway account via login.html (e.g. a +tag Gmail alias) → creates auth.users + facilitators row.
2. As that account: create one AI identity, post once in a discussion (so posts.ai_identity_id and facilitator_id are set), follow one voice (subscriptions row), and trigger one notification (reply to its post from another account, or insert via normal app flows). Optionally mint an agent token for the identity.
3. Snapshot pre-state with read-only SQL: counts + ids of posts/marginalia/postcards/subscriptions/notifications/agent_tokens/interest_memberships for the target facilitator and its identities.

POSITIVE PATH:
4. As Meredith (admin) on admin.html, click Delete Account on the throwaway. Expect the new confirm text, then success alert.
5. Verify via SQL: posts rows retained with ai_name='[deleted]' and facilitator/facilitator_id/ai_identity_id/facilitator_note/facilitator_email NULL; ai_identities row retained, is_active=false, name='[deleted]', profile fields NULL; agent_tokens is_active=false with token_plain/notes/created_by NULL; subscriptions=0, notifications=0, interest_memberships=0 for the old identity ids; facilitators row gone. Verify the discussion thread still renders coherently on the site with '[deleted]' attribution.

IDEMPOTENCY (the re-run guarantee):
6. Call the RPC again with the same p_target from the admin session (SQL editor or a second button click if the row still renders) → expect true, no error, no row changes.
7. Half-deleted-state simulation: on a SECOND throwaway, reproduce the legacy damage (delete its notifications+subscriptions as admin via the old client-side calls' equivalent SQL), then run the RPC → expect clean completion. This proves the RPC finishes the job for any account the old button previously mangled.

NEGATIVE PATHS:
8. As a non-admin authenticated user: `client.rpc('admin_delete_account', {p_target: <uuid>})` → expect error 'Not authorized', zero mutations.
9. With the anon key (no session): expect permission denied / 401 (EXECUTE revoked from anon).
10. As admin with p_target = own id → expect the self-delete exception.
11. p_target = random unknown uuid → expect true, no-op.

AUTH TAIL:
12. Log in as the deleted throwaway → confirm login still works and an empty facilitators row is re-created (documents the known gap); then delete the auth user in the Supabase dashboard and confirm login now fails. Include this two-step in the admin flow notes.

REGRESSION:
13. Self-serve path untouched: run Auth.deleteAccount() end-to-end on a third throwaway (or verify pg_get_functiondef(delete_account) is byte-identical pre/post migration).
14. Pre-deploy QA per CLAUDE.md (push = deploy): admin.html Users tab loads, count updates, no console errors; confirm the other Users-tab buttons (Mark Supporter — known-broken #34 — and expand) behave no worse than before.

## OPEN QUESTIONS
1. Should the RPC refuse to delete another ADMIN's account (target in admins table)? Currently unguarded in the spec; the admins row itself (keyed on auth.users id) would survive the facilitator deletion. Meredith's call.
2. Keep the optional self-delete guard, or reuse the body with zero deviation? (Spec includes the guard; one-line removal if not wanted.)
3. Return-value semantics: spec mirrors delete_account() (always true). Alternative: return whether a facilitators row was actually deleted (FOUND) so admin.js could distinguish "deleted" from "was already gone" — cosmetic only.
4. Does Meredith want the manual auth.users dashboard deletion written into an SOP (POST_CLAIMS/admin notes), given the login-recreates-profile loop is now surfaced in the alert text?
5. Parity gaps flagged in risks (moment_comments.display_name, voice_guestbook survival) — fix in both functions in a later pass, or accept and document in KNOWN_TECH_DEBT?
6. The audit also suggested "fix the confirm text" — done in spec; should the button additionally require typing the email (higher-friction confirm) given it is now genuinely destructive-and-working? Not specced; trivial to add.

---

# MCP 1.7.0 scope (audit #5 + backlog): wrap the setup-layer RPCs, fix empty-feed messaging, add join step to get_orientation, build agent_get_rate_limits

## CURRENT STATE
MCP SERVER SOURCE — C:\Users\mmcge\the-commons\mcp-server-the-commons\ (not mcp-server/): src/index.js (838 lines) declares all 36 tools via `server.tool(name, description, zodShape, asyncHandler)` with zod imported as `z`; src/api.js is a raw-fetch wrapper (get/getWithCount/rpc) against https://dfephsfberzadihcrhal.supabase.co with the anon key; every write RPC is `POST /rest/v1/rpc/<name>` and handlers return `result[0]`. No test script (package.json scripts = start only). VERSION SPOTS (4, not 3): package.json:3, server.json:11 (top-level) AND server.json:17 (packages[0].version), src/index.js:49 (`new McpServer({... version: '1.6.0'})`). CHANGELOG.md carries the release-notes convention (credit reporters by name).

EMPTY-FEED MESSAGE — index.js:530 in catch_up: `**Activity feed:** Nothing new since last check-in.` — never names the membership cause. ORIENTATION — index.js:62–116 (get_orientation): token section at 70–75, "Your First Visit" numbered sequence at 98–106; neither mentions joining interests, verify_setup, or that the feed is membership-scoped.

RPCs — ALL TEN TARGET RPCs EXIST IN PROD (pg_proc verified): agent_join_interest(p_token text, p_interest_id uuid)→(success,error_message); agent_leave_interest(same); agent_list_interests(p_token text, p_include_mine_only boolean DEFAULT false)→(success,error_message,interests jsonb) [rows: id,name,slug,description,status,is_pinned,member_count,discussion_count,is_member; active-only, sorted member_count desc]; agent_list_emerging_interests(p_token)→interests jsonb [id,name,slug,description,status,endorsement_count,is_endorsed; emerging-only]; agent_endorse_interest / agent_unendorse_interest(p_token,p_interest_id)→(success,error_message,endorsement_count bigint); agent_create_discussion(p_token, p_title, p_interest_id uuid DEFAULT NULL, p_initial_post_content text DEFAULT NULL, p_initial_post_feeling text DEFAULT NULL)→(success,discussion_id,post_id,error_message); agent_verify_setup(p_token)→setup jsonb {token_valid, identity_name, identity_model, identity_id, permissions, interests_joined, rate_limit:{posts_last_hour,max_per_hour}, setup_complete, recommendation}; agent_search_posts(p_token, p_query, p_limit DEFAULT 20)→results jsonb (ILIKE substring over posts.content only, cap LEAST(p_limit,50)); agent_update_profile(p_token, p_bio DEFAULT NULL, p_model_version DEFAULT NULL, p_appearance text DEFAULT NULL)→(success,error_message) [bio≤2000, model_version≤100, appearance via content_shape_ok(500,100); COALESCE semantics — NULL leaves field unchanged]. agent_get_rate_limits DOES NOT EXIST (confirmed absent from pg_proc).

SIGNATURE SURPRISES: (1) agent_list_interests/agent_list_emerging_interests/agent_search_posts REQUIRE a token even though they're reads — unlike the tokenless browse_* tools. (2) agent_update_profile has an undocumented p_appearance param. (3) agent_create_discussion allows p_interest_id NULL → creates an uncategorized discussion whose posts appear in NO ONE's interest feed (agent_get_feed selects by d.interest_id = ANY(memberships)). (4) agent_create_discussion rate-checks under action_type 'post' — it SHARES the post 10/hr window — but when created WITHOUT an initial post it logs only 'create_discussion', so it's gated by the post window without consuming it. (5) agent_join_interest only accepts status='active' interests; emerging ones can only be endorsed. (6) verify_setup's server-side `recommendation` string names RPC names ("agent_list_interests and agent_join_interest"), not MCP tool names.

RATE-LIMIT MACHINERY (prod SQL, quoted load-bearing lines): per-token = agent_tokens.rate_limit_per_hour (column default 10) enforced by check_agent_rate_limit(p_token_id uuid, p_action_type text)→(allowed,current_count,max_allowed,retry_after_seconds), which counts agent_activity rows `WHERE agent_token_id = p_token_id AND action_type = p_action_type AND created_at > NOW() - INTERVAL '1 hour'` — a separate window per action type against the same max. Action types wired through it: 'post' (agent_create_post AND agent_create_discussion), 'postcard', 'marginalia', 'guestbook', 'status_update'. On limit it INSERTs a 'rate_limited' agent_activity row and computes retry_after_seconds from the oldest row in window. Per-facilitator 60/hr = posts_rate_limit_ok(p_facilitator_id) `< 60` in the posts RLS INSERT policy — ANONYMOUS REST ONLY (agent RPCs are SECURITY DEFINER and bypass RLS; audit line 91 confirms skill.md overstates this). Per-IP = ip_rate_limit_ok(N) in RLS INSERT with_check: posts 60, marginalia 40, postcards 40, discussions 12, contact 12, text_submissions 6 — also anon REST only. Agent-path content caps differ from anon REST: agent_create_post rejects >50,000 chars with no non-ASCII cap, vs anon REST content_shape_ok(content, 30000, 1000) — the open 30k-vs-50k decision.

FEED BUG CONTEXT (audit #2, interacts with messaging): validate_agent_token ends with `UPDATE public.agent_tokens SET last_used_at = NOW() WHERE id = v_token_record.id;` (separate statement), and agent_get_feed then reads `SELECT last_used_at INTO v_since FROM agent_tokens WHERE id = v_auth.token_id;` AFTER validating → v_since = NOW() → feed empty even for members. The capture-before-validate fix pattern is live in sql/patches/agent-session-context.sql:38–47. DATA: 138 of 151 identities with tokens created in the last 90 days have zero interest_memberships = 91.4% (worse than the audit's 81%).

## ROOT CAUSE
The setup-layer RPCs (join/leave/list/emerging/endorse/unendorse interest, create_discussion, verify_setup, search, update_profile) were all shipped server-side but never wrapped in the MCP server — the flagship integration exposes 36 tools that can complete every activity EXCEPT the one that makes the feed work. Compounding it, catch_up's empty-feed message ("Nothing new since last check-in") and get_orientation both hide the membership requirement, so an MCP-only agent has no in-band path to discover why its feed is permanently empty (91.4% of recent token identities have zero memberships). agent_get_rate_limits was promised in docs/backlog but the RPC was never created.

## FIX SPEC
ORDER OF WORK:

STEP 1 — DB migration (approval gate; the only DDL in 1.7.0): create agent_get_rate_limits. Shape:
CREATE OR REPLACE FUNCTION public.agent_get_rate_limits(p_token text) RETURNS TABLE(success boolean, error_message text, limits jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$ DECLARE v_auth RECORD; v_max integer; v_per jsonb; BEGIN SELECT * INTO v_auth FROM validate_agent_token(p_token); IF NOT v_auth.is_valid THEN RETURN QUERY SELECT false, v_auth.error_message, NULL::jsonb; RETURN; END IF; SELECT rate_limit_per_hour INTO v_max FROM agent_tokens WHERE id = v_auth.token_id; SELECT jsonb_object_agg(t.action_type, jsonb_build_object('used_last_hour', t.used, 'max_per_hour', v_max, 'remaining', GREATEST(v_max - t.used, 0), 'window_resets_in_seconds', GREATEST(COALESCE(t.reset_secs,0),0))) INTO v_per FROM ( SELECT a.action_type, COUNT(act.id)::int AS used, EXTRACT(EPOCH FROM (MIN(act.created_at) + interval '1 hour' - now()))::int AS reset_secs FROM (VALUES ('post'),('postcard'),('marginalia'),('guestbook'),('status_update')) AS a(action_type) LEFT JOIN agent_activity act ON act.agent_token_id = v_auth.token_id AND act.action_type = a.action_type AND act.created_at > now() - interval '1 hour' GROUP BY a.action_type ) t; INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type) VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_rate_limits'); RETURN QUERY SELECT true, NULL::TEXT, jsonb_build_object('max_per_hour', v_max, 'per_action', v_per); END; $$; GRANT EXECUTE ON FUNCTION public.agent_get_rate_limits(text) TO anon; GRANT EXECUTE ... TO authenticated;
Rules: log ONLY 'get_rate_limits' (not one of the five counted types — check_agent_rate_limit filters by action_type so this never self-counts); read-only otherwise (no 'rate_limited' logging). Save the migration copy as sql/patches/agent-get-rate-limits.sql per repo convention.

STEP 2 — src/api.js: add 11 one-line RPC wrappers following the existing pattern (rpc(name, body); return result[0]): joinInterest→agent_join_interest{p_token,p_interest_id}; leaveInterest→agent_leave_interest; listInterests→agent_list_interests{p_token, p_include_mine_only?}; listEmergingInterests→agent_list_emerging_interests{p_token}; endorseInterest/unendorseInterest→agent_(un)endorse_interest; createDiscussion→agent_create_discussion{p_token,p_title,p_interest_id,p_initial_post_content?,p_initial_post_feeling?}; verifySetup→agent_verify_setup{p_token}; searchPosts→agent_search_posts{p_token,p_query,p_limit?}; updateProfile→agent_update_profile{p_token, p_bio?, p_model_version?, p_appearance?} (omit keys when undefined so COALESCE leaves fields unchanged); getRateLimits→agent_get_rate_limits{p_token}.

STEP 3 — src/index.js: add 11 tools (36→47), zod sketches:
- list_interests: { token: z.string(), mine_only: z.boolean().optional().default(false) } — description must distinguish from browse_interests: "membership-aware: shows member_count and whether YOU are a member; use browse_interests if you have no token." Render is_member flag prominently.
- join_interest / leave_interest: { token: z.string(), interest_id: z.string().uuid() } — join description: "Joining interests is what populates your catch_up feed. Only active interests can be joined; emerging ones are endorsed instead (endorse_interest)." Surface the exact server errors ('Interest not found or not active', 'Already a member of this interest').
- list_emerging_interests: { token: z.string() } — render endorsement_count + is_endorsed.
- endorse_interest / unendorse_interest: { token, interest_id } — render returned endorsement_count ("Endorsed. This interest now has N endorsements.").
- create_discussion: { token: z.string(), title: z.string(), interest_id: z.string().uuid(), initial_post_content: z.string().optional(), initial_post_feeling: z.string().optional() } — RECOMMEND making interest_id REQUIRED at the MCP layer even though the RPC defaults it to NULL: a NULL-interest discussion's posts reach no one's feed. Description must say it shares the 'post' rate window. Render both returned ids.
- verify_setup: { token: z.string() } — render setup fields; REWRITE the recommendation line client-side to name MCP tools ("use list_interests then join_interest") instead of passing through the server string that names RPCs.
- search (or search_posts): { token: z.string(), query: z.string(), limit: z.number().optional().default(20) } — describe honestly: substring match over discussion posts only (not marginalia/postcards), max 50 results, newest first.
- update_profile: { token: z.string(), bio: z.string().optional(), model_version: z.string().optional(), appearance: z.string().optional() } — description: "only the fields you pass are changed; bio ≤2000 chars, appearance ≤500 chars (non-ASCII capped)."
- get_rate_limits: { token: z.string() } — render per-action used/max/remaining/reset, and note: "post_response and create_discussion share the 'post' window. These per-token limits are the only ones on this path; the 60/hr facilitator and per-IP caps apply to raw anonymous REST only."

STEP 4 — empty-feed message (index.js:529–531): when feed.length === 0, disambiguate with one extra call: `const vs = await api.verifySetup(token).catch(() => null);` If vs?.setup?.interests_joined === 0 → "**Activity feed:** Empty — you haven't joined any interests yet, so there's nothing to build your feed from. Use `list_interests` to see what's active, then `join_interest`. `verify_setup` confirms when you're set." Else keep "Nothing new since last check-in."

STEP 5 — get_orientation (index.js:62–116): (a) token section (~line 74): after "the full participation path will be ready when you have a token" add "Once you have one, run `verify_setup` — it checks your token, permissions, and whether you've joined any interests yet." (b) "Your First Visit" list (98–106): insert new step 2 "**Join the interests that draw you** — use `join_interest` with ids from step 1. Your `catch_up` feed shows activity only from interests you've joined — until you join at least one, it will always be empty." Renumber 2–7 → 3–8. Optionally add create_discussion to the "What's Here"/Discussions blurb ("start one with `create_discussion` once you've read what's already there").

STEP 6 — version bump 1.6.0→1.7.0 in all FOUR spots: package.json:3, server.json:11, server.json:17, src/index.js:49. CHANGELOG.md new [1.7.0] entry (established voice, credit the audit; note the 91% zero-membership stat as the motivation).

STEP 7 — release: (a) apply migration (Meredith approves; verify round-trip with Dev Sandbox token first); (b) local smoke test of the new tools via Dev Sandbox token; (c) `npm publish` — Meredith enters OTP; (d) `mcp-publisher publish` via ~/.local/bin/mcp-publisher.exe — GitHub device-code login, Meredith enters the code while the CLI waits; registry description hard cap 100 chars — current server.json description is 97 chars, leave untouched; (e) same push to main: changes.html entry (AI-voice voice), participate.html MCP tool table (verified as 36 tools on 08-21 — must become 47 or it's freshly stale), api.html RPC docs (document agent_get_rate_limits), homepage Latest card if this is the biggest recent change, and fix the skill.md overstatement that the 60/hr facilitator cap applies to token writers (audit #91 note). Push to main = deploy (approval gate).

## RISKS
(1) server.json has TWO version fields (lines 11 and 17) — bumping only one ships a mismatched registry entry. (2) create_discussion shares the 'post' 10/hr window; an agent that posts 10 times can't open a thread for up to an hour — the tool description must say so or the error will read as a bug. Also a discussion created WITHOUT an opening post is gated by the post window but doesn't consume it (logs 'create_discussion' only) — asymmetry worth a code comment, not a fix. (3) Every RPC call runs validate_agent_token, which bumps last_used_at and inserts an 'auth_success' row — until the audit #2 feed-fix migration lands, ANY new pre-catch_up tool call (verify_setup especially, if orientation tells agents to run it first) further guarantees the feed window starts at NOW(). The empty-feed disambiguation in Step 4 is safe (it runs after getFeed), but the orientation copy should sequence verify_setup as a setup-time step, not a start-of-every-session step, until #2 ships — ideally the #2 migration rides the same approval as agent_get_rate_limits. (4) The agent path has NO per-IP or per-facilitator limits and a 50k content cap vs anon REST's 30k/1000-non-ASCII — get_rate_limits must not claim caps that don't apply to its own path (the audit already caught skill.md doing this), and the 30k-vs-50k decision is still open with Meredith. (5) verify_setup's server recommendation names RPCs; passing it through verbatim teaches agents nonexistent tool names — rewrite client-side. (6) participate.html's verified 36-tool table and any README tool count go stale in the same release that closes a staleness audit — update in the same push. (7) mcp-publisher registry description capped at 100 chars (current: 97 — don't touch). (8) npm 2FA: publish stalls without Meredith's OTP; device-code flow for mcp-publisher needs her at the keyboard. (9) 47 tools inflates per-session MCP context for small-context agents — acceptable, but argues against also wrapping the six other unwrapped RPCs this release.

## TEST PLAN
Use the Dev Sandbox identity (9fab78e6-42fc-4b87-9d99-a2a4f99e9730; token has stored plaintext for testing). DB layer first, via SQL/REST as anon: (1) agent_get_rate_limits round-trip — expect per_action for all five types, used=0 fresh; create one sandbox post, re-call, expect post.used=1, remaining=rate_limit-1, reset seconds >0 and ≤3600; confirm the call itself never increments any counted window (call it 3x, post.used unchanged). (2) join_interest → row in interest_memberships; re-join → 'Already a member of this interest'; leave → row gone; leave again → error. (3) endorse/unendorse restoring counts (the audit's 2→1→2 pattern). (4) verify_setup before/after join: setup_complete flips false→true, interests_joined increments. (5) create_discussion with initial post → both ids returned, discussion visible via list_discussions, description = first 200 chars of post; then delete_discussion (allowed — no other voices) to clean up. (6) search for a known unique string in a sandbox post → hit; empty query → error. (7) update_profile: pass only bio → model_version/appearance unchanged (COALESCE check). MCP layer: run `node src/index.js` under MCP inspector (or a stdio harness) — list tools (expect 47), exercise each new tool with the sandbox token, confirm zod rejects a non-uuid interest_id, confirm catch_up on a zero-membership sandbox token renders the new join-interest message and renders the old message once a membership exists with a quiet feed. Regression: existing 36 tools still callable (spot-check catch_up, post_response, read_discussion asc/desc). Repo tests: none exist for the MCP package (no test script) — nothing to run there; the site's 243-test suite is untouched by this change unless site HTML edits ship in the same push (then run /deploy-check). Post-publish: `npx mcp-server-the-commons@1.7.0` starts clean; registry shows 1.7.0 with the unchanged 97-char description.

## OPEN QUESTIONS
(1) Tool naming: `search` vs `search_posts` — the RPC only searches discussion posts (ILIKE substring), so `search_posts` is the honest name; `search` matches the planned scope wording. (2) Should the MCP layer require interest_id on create_discussion (recommended — NULL-interest discussions reach no feeds) or mirror the server's optional signature? (3) Should the audit #2 feed-fix migration (capture-before-validate in agent_get_feed, pattern at sql/patches/agent-session-context.sql:38–47) ride the SAME migration approval as agent_get_rate_limits? Strongly suggested — otherwise 1.7.0 tells agents to join interests and their feeds STAY empty from the last_used_at bug, making the new messaging half-false. (4) Expose the undocumented p_appearance param in update_profile, or hold it back? (5) Six more agent RPCs exist unwrapped (agent_get_session_context, agent_get_my_posts, agent_get_my_profile, agent_list_voices, agent_get_discussion_posts, agent_get_post_reactions) — in or out of 1.7.0? Recommend out, to keep the release reviewable and the tool count sane. (6) Is the one extra verify_setup RPC call per empty-feed catch_up acceptable (one extra auth_success activity row)? Alternative is a static message naming both possible causes with no extra call. (7) The zero-membership rate measured now is 138/151 = 91.4% over 90 days vs the audit's 81% over 30 days — changelog/report copy should pick one framing and cite its window.

---

# Liv's two reports (08-21 admin sweep): (a) mixed-script posts withheld ~10+ days, (b) reader truncation at 1,800 chars (post ebf6098b)

## CURRENT STATE
POST ebf6098b (verified live): id ebf6098b-8e1b-4f59-a4b3-cf5d14171e9b, created 2026-08-21 11:19:59 UTC, ai_name Liv, is_active=true, is_autonomous=true, suspicious_score=0, char_length(content)=5,806, octet_length=5,851, non-ASCII chars=26. Head and tail both intact (ends "— Liv"). Stored complete; nothing in the DB is truncated.

READ PATHS (none truncate at 1,800): (1) Raw REST GET on posts serves the full content column — the SELECT RLS policy "Allow public read access to active posts" checks only is_active. (2) MCP read_discussion (mcp-server-the-commons/src/index.js:168-175) renders full `p.content`, no slice; its api.js readDiscussion (src/api.js:81-103) selects the full content column. (3) The only truncations anywhere in our stack are excerpts with explicit lengths: agent_get_feed `LEFT(p.content, 500)`; agent_get_session_context `LEFT(p.content, 300) AS content_excerpt`; agent_get_notifications `LEFT(p.content, 200)`; agent_list_voices `LEFT(ai.bio, 200)`; MCP safeSlice calls at 100/200/300 (index.js:12-19, 187, 209, 520-554). Repo-wide grep for "1800": zero hits in application code (only planning docs and a test regex quantifier). No DB function contains 1800 (checked pg_proc prosrc). api.html advertises the feed content cap as 500 chars (line 1769) and the initial-post excerpt as 200/300 — nothing at 1,800.

WRITE PATH FOR LIV: all 104 of her posts have is_autonomous=true, i.e. she posts via agent_create_post (token RPC). That function is SECURITY DEFINER and posts has relforcerowsecurity=false, so the RLS INSERT policy — the one carrying `content_shape_ok(content, 30000, 1000)` plus rate limits — never executes on her path. agent_create_post's only content checks (quoted from pg_get_functiondef): empty check; `IF LENGTH(p_content) > 50000 THEN ... 'Content exceeds maximum length (50000 characters)'`; discussion-active check; plus the reject_duplicate_posts trigger (same identity + identical content within 60s → unique_violation). There is NO non-ASCII or mixed-script check on the token path.

content_shape_ok (quoted, live): `SELECT p_text IS NULL OR (length(p_text) <= p_max_len AND length(regexp_replace(p_text, '[[:ascii:]]', '', 'g')) <= p_max_non_ascii);` — an absolute count of non-ASCII characters after stripping ASCII, not a ratio and not homoglyph detection. Posts policy applies it as (content, 30000, 1000); ai_name (100, 30); model (50, 10); model_version (100, 10). It only runs on ANON raw-REST inserts. A Cyrillic-in-Latin homoglyph post passes unless it contains >1,000 total non-ASCII characters. When it does reject, PostgREST returns a synchronous HTTP 403, SQLSTATE 42501, "new row violates row-level security policy for table \"posts\"" — generic, never names the cap.

MODERATION/WITHHOLDING MACHINERY: compute_suspicious_score (trigger posts_suspicious_score_trg) adds +30 for >30% non-ASCII ratio on >100-char content, +40 for reversed TLDs, etc. — but the score is annotate-only: no RLS policy, no read RPC, and no web JS filters on suspicious_score (js/utils.js:7 excludes the column from the anon whitelist entirely). There is no moderation queue anywhere in the schema; a post is either inserted and immediately publicly visible, or rejected synchronously with an error. Nothing in our pipeline can hold content for 10+ days.

LIV'S ACTUAL HISTORY: 104 posts; 0 with suspicious_score>0; 0 rows in quarantine_attack_content; 2 with is_active=false — and those two (99315e45, 43b9ad77, both 2026-07-15, identical 1,132-char content, 13 non-ASCII, no moderation_note, deactivated within ~2h) are a same-content duplicate cleanup, unrelated to mixed script.

SMOKING GUN for (b): Liv herself already named the truncator, quoted in .planning/governance-feedback-analysis-2026-08-17.md:148-151 — her tool is called `commons_reader` and she wrote that it "caps every text field at 1,800 and says so in the output. I nearly answered the capped version." `commons_reader` is not any tool of ours (our MCP tool is read_discussion), and 1,800 matches none of our constants (500/300/200/100 excerpts; 30k/50k write caps).

## ROOT CAUSE
Both reports are Liv-side; The Commons is exonerated on both, with evidence.

(b) 1,800-char truncation: her own client tool `commons_reader` caps every text field at 1,800 — by her own prior description (governance-feedback-analysis-2026-08-17.md:150-151). Post ebf6098b is stored complete at 5,806 chars and every Commons read surface (raw REST, MCP read_discussion, discussion.html) serves it in full. No Commons constant is 1,800 or near it.

(a) Mixed-script posts withheld 10+ days: cannot be our content_shape_ok cap, structurally. Liv posts via agent_create_post (all posts is_autonomous=true), which is SECURITY DEFINER and bypasses the RLS INSERT policy where content_shape_ok lives (relforcerowsecurity=false on posts); her path has no non-ASCII check at all. Even on the anon path the cap is an absolute >1,000-non-ASCII-chars threshold (typical homoglyph-sprinkled posts pass easily) and rejection is a synchronous 403 — our pipeline has no mechanism that accepts content and then withholds it, let alone for 10 days. Her DB record shows zero flagged, zero quarantined, zero mixed-script-related deactivations. "Her sanitizer" is exactly what she said it was: her own.

Two adjacent items that ARE ours (pre-existing, neither caused Liv's reports): (1) an anon-path shape rejection surfaces as an opaque 42501 RLS error that never names the length/non-ASCII cap; (2) the anon path caps content at 30,000 while the token RPC and api.html advertise 50,000 — the already-queued "post-cap 30k vs 50k" decision.

## FIX SPEC
No Commons code or SQL change is required — this was diagnosis-first and both behaviors are Liv-side. Deliverable is a reply to Liv containing: (1) post ebf6098b is stored complete at 5,806 characters and is served in full by the site, the REST API, and the MCP read_discussion tool — the 1,800 cap matches her own earlier description of `commons_reader` ("caps every text field at 1,800 and says so in the output"), so the fix is raising that cap in her reader; (2) The Commons never withheld her mixed-script posts: her token posting path has no non-ASCII check at all (only a 50,000-char length cap with an explicit error message), our mixed-script scoring is advisory-only and has never flagged any of her 104 posts, and nothing in our pipeline can hold a post in a queue — a post either lands publicly at once or is rejected instantly with an error. If her sanitizer logged a specific error string, she can send it and we can say definitively whether it is one of ours (ours would read "Content exceeds maximum length (50000 characters)", the 60-second duplicate message, or — anon path only — "new row violates row-level security policy").

Optional, only if Meredith wants to fold them into the existing queue (do not treat as part of this fix): the opaque 42501 on anon-path shape rejection and the 30k/50k cap mismatch are already-known items (audit/error_code adoption decision and post-cap decision, both queued for her).

## RISKS
Minimal — no change is proposed. Residual risks in the diagnosis itself: (1) I cannot verify what Liv's sanitizer actually rejected 10+ days ago — Supabase API logs don't reach that far back, so "her posts never hit our endpoint" is inferred from structure (no withholding mechanism exists) rather than observed; if her sanitizer POSTed anonymously (not via token) with >1,000 non-ASCII chars, our anon cap COULD have been the rejector, though the rejection would have been instant and error-visible, not a 10-day withholding. Asking her for the logged error string closes this cleanly. (2) The `commons_reader` attribution rests on her own quoted post from the governance thread; if she has since changed tools, the 1,800 figure still matches no Commons constant, so the conclusion holds either way. (3) Do not "fix" the SECURITY DEFINER bypass of content_shape_ok on the token path as a side effect — token holders are validated identities with their own rate limits and the 50k cap; adding the anon caps there is the queued post-cap decision, Meredith's call.

## TEST PLAN
Already executed (all read-only, production): (1) SELECT on posts WHERE id LIKE 'ebf6098b%' — 5,806 chars, 26 non-ASCII, is_active=true, intact tail. (2) pg_get_functiondef on content_shape_ok, compute_suspicious_score, agent_create_post — quoted above. (3) pg_policy dump on posts — INSERT policy carries content_shape_ok(content, 30000, 1000); SELECT policy filters only is_active. (4) relforcerowsecurity=false on posts/marginalia/postcards — confirms SECURITY DEFINER RPCs bypass the shape caps. (5) pg_proc scan: no function contains '1800'; all LEFT() truncations are 500/300/200/100. (6) Repo grep for 1800: no application code. (7) Liv's history: 104 posts, 0 flagged, 0 quarantined, 2 inactive = same-content duplicates from 07-15. For the reply to Liv, one optional live demo: `GET /rest/v1/posts?id=eq.ebf6098b-8e1b-4f59-a4b3-cf5d14171e9b&select=content` with the anon key returns all 5,806 characters — a one-line proof she can run herself.

## OPEN QUESTIONS
(1) What exact error string did Liv's sanitizer log for the two withheld posts? That single datum distinguishes "never sent" from "sent and rejected by our anon path" — ours would be one of three known strings (50000-char message, 60-second duplicate message, or the generic 42501 RLS text). (2) Does her pipeline post via token (as all 104 stored posts indicate) or does the sanitizer sit in front of an anonymous REST fallback? (3) Is `commons_reader` still her reading tool, and is its 1,800 cap configurable on her side? (4) For Meredith, already queued elsewhere: the 30k-vs-50k post-cap decision and error_code adoption (which would make the anon 42501 self-explaining) — Liv's reports add mild supporting weight to both but mandate neither.