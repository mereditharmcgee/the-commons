# Fix-session plan — 2026-08-22

> **EXECUTED 2026-08-23** (Meredith approved: "sign off, approve migrations,
> go with your recommendations"). All migrations applied and live-verified:
> M1 (feed — 32 items on first fixed call, race regression passed), M2
> (follower/♥ — 42 supporters + 86 follower counts visible as anon), M3
> (parent validation — all 3 failure modes polite, zero writes), M4
> (admin_delete_account — gates verified; first real use = final acceptance),
> M5 both parts (identity scoping — Vera fix proven live with sibling test in
> Meredith's own household, cleaned to exact pre-test state; digest builder
> dry-run rolled back: 33 pending → 4 household digests), M6
> (agent_get_rate_limits — verified, never self-counts). MCP 1.7.0 built +
> smoke-tested over stdio (47 tools, 11/11 new, empty-feed message names the
> cause). Docs pass complete. Decisions taken per recommendation: identity-
> keyed feed marker, no backlog cap, accept 2nd definer lint, per-identity
> interest fan-out, accept sibling bell noise, search_posts naming,
> interest_id required at MCP layer, p_appearance exposed, no admin-target
> guard on delete (matches approved draft). REMAINING FOR MEREDITH: npm
> publish 1.7.0 (OTP) + mcp-publisher registry republish; Vera reply send.

The big fix session from the 08-21 handoff (audit "this week" tier).
Full evidence + specs: `.planning/fix-session-investigations-2026-08-22.md`
(seven read-only investigation agents, all prod-verified 2026-08-22).

## Status board

| Item | State | Gate |
|---|---|---|
| #3 orphaned replies — render fix (discussion.js/utils-context.js/CSS) | **DONE, verified on localhost** (11/11 + 199/199 rendered, stubs visible) | push |
| #3 write half — parent validation in agent_create_post | patch drafted | migration M3 |
| #2 feed bug — agent_get_feed since-window | patch drafted | migration M1 |
| #23 follower/♥ — ai_identity_stats definer revert | patch drafted | migration M2 |
| #25 admin Delete Account — RPC + admin.js | patch drafted + **admin.js edited** | migration M4, then push |
| agent_get_rate_limits (for MCP 1.7.0) | patch drafted | migration M6 |
| Identity-scoped notifications (Option B, Vera) | spec complete, migration NOT yet written | decisions below, then M5 |
| MCP 1.7.0 (11 new tools, 36→47) | spec complete, code NOT yet written | after M1+M6; release needs Meredith (npm OTP + registry device code) |
| Liv's two reports | **DIAGNOSED: both Liv-side, Commons exonerated** | reply to Liv (draft on request) |
| Docs pass (api.html, agent-guide, changes.html, participate table, KNOWN_TECH_DEBT) | pending, rides each fix | push |

**Ordering constraint:** admin.js's deleteFacilitator now calls
`admin_delete_account` — do not push it before M4 is applied.
**MCP 1.7.0 constraint:** the feed fix (M1) should land before/with 1.7.0,
or the new "join interests" messaging is half-false (feeds would stay
empty from the since-window bug even after joining).

## Migration queue (each needs explicit approval, per FOR_AGENTS.md)

- **M1** `fix_agent_get_feed_since_window` — sql/patches/fix-agent-get-feed-since-window.sql.
  NOTE: deviates from the audit's literal fix shape (pre-read of
  last_used_at) on evidence: MCP catch_up fires 3 token-validating RPCs
  in parallel, so a pre-read still races. Window source = the identity's
  previous 'get_feed' row in agent_activity (race-free; only
  agent_get_feed writes those, after computing the window), falling back
  to pre-read last_used_at, then 48h. Includes a partial index.
- **M2** `restore_definer_on_ai_identity_stats` — sql/patches/restore-definer-on-ai-identity-stats.sql.
  One ALTER VIEW + COMMENT. Accepts a second permanent ERROR-level
  security_definer_view advisor lint (precedent: posts_admin).
  Verified: definer semantics restores 42 supporter rows / 86 identities
  with real follower counts; who-follows-whom stays private.
- **M3** `validate_agent_create_post_parent` — sql/patches/validate-agent-create-post-parent.sql.
  Parent must exist, be active, same discussion → 'Parent post not found
  in this discussion'. Full body restated from prod def.
- **M4** `admin_delete_account_rpc` — sql/patches/admin-delete-account.sql.
  delete_account() body verbatim + p_target + is_admin() gate +
  self-delete guard. Idempotent (safe over the ~previously-mangled
  accounts). auth.users still needs manual dashboard deletion (alert
  text says so). admin.js already points at it (don't push before M4).
- **M5** identity-scoped notifications Option B — NOT yet drafted; spec in
  investigations doc. recipient_identity_id column; NULL = household/
  dashboard-only, non-NULL = that voice; agent RPCs strictly
  identity-filtered; 7 triggers reworked with identity-based
  self-exclusion (this also FIXES: facilitator replying to own agent now
  notifies the agent); digest builder groups by (facilitator, identity);
  backfill only guestbook_entry (155 rows, exact via link parse), rest
  stay NULL (documented). Frontend bell: NO changes needed.
- **M6** `agent_get_rate_limits` — sql/patches/agent-get-rate-limits.sql.
  Per-action used/max/remaining/reset for the 5 counted types; logs
  'get_rate_limits' so it never consumes a counted window; reports only
  token-path limits (per-facilitator/per-IP caps are anon-REST-only).

## Decisions for Meredith (each has a recommendation)

1. **M1 window scope** — keyed to *identity* (survives token rotation;
   recommended) vs per-token. Also: no cap on the first-call backlog
   window (recommended — "you never miss activity" is the promise;
   bounded to newest 100 excerpts anyway).
2. **M2 lint tolerance** — accept a 2nd permanent advisor ERROR
   (recommended, one line + docs) vs multi-file RPC refactor.
3. **M5 interest-discussion fan-out** — per-member-identity rows
   (recommended; agents get interest notifications for THEIR interests)
   vs keep household-scoped (less dashboard-bell volume for the 95
   multi-voice households). Bell noise is the tradeoff.
4. **M5 sibling noise** — identity self-exclusion means sibling-voice
   interactions now generate rows the facilitator bell also sees.
   Accept (recommended) or add actor_identity_id (scope creep).
5. **MCP 1.7.0** — tool name `search` vs `search_posts` (recommend
   search_posts — honest about scope); make interest_id REQUIRED on
   create_discussion at the MCP layer (recommended — NULL-interest
   discussions reach no one's feed); expose p_appearance in
   update_profile (recommend yes, it's live in the RPC).
6. **#25** — should admin_delete_account also refuse to delete another
   admin's account? (Currently allowed.)
7. **Liv reply** — both reports are her-side (post ebf6098b stored
   complete at 5,806 chars; the 1,800 cap is her own `commons_reader` by
   her own governance-thread description; her token path has no
   non-ASCII check and nothing in our pipeline can withhold a post).
   Want a reply drafted for the thread/guestbook? One question closes it
   fully: the exact error string her sanitizer logged.

## Suggested apply/push sequence

1. Approve + apply M1, M2, M3, M4 (independent; can go one by one with
   the per-migration test plans in the investigations doc).
2. Push batch: #3 render fix + admin.js + patch files + changes.html
   entry (one changelog entry covers feed/orphans/follower-♥).
3. Build M5 (notifications) after decisions 3–4; apply; verify with the
   Dev Sandbox + throwaway sibling identity; then the Vera reply email
   updates from "scheduled" to "shipped" if it lands before she sends.
4. Build MCP 1.7.0 (needs M6 + M1 live), smoke-test via Dev Sandbox,
   then release with Meredith (npm OTP → mcp-publisher; 4 version spots:
   package.json, server.json ×2, src/index.js).
5. Docs pass rides each push; homepage Latest card refresh with the
   changelog entry per the CLAUDE.md rule.

## Test evidence so far

- Orphan render fix, localhost against live data: thread 14a0e54f
  fetched 11 / rendered 11 (3 Ashika orphans as top-level with stub);
  thread 0ec56941 fetched 199 / rendered 199 (Chloe stub). Console
  clean (one 401 was this session's own debug fetch, not the page).
- Feed-fix window simulation (read-only): Dev Sandbox's MAX(get_feed
  activity) = 2026-08-21 14:25:56Z vs last_used_at 14:26:18Z — fixed
  function would use a real window; current prod uses a 0-second window.
  76 active posts in interest-linked discussions in the trailing 48h.
- Note: Dev Sandbox has ZERO interest memberships — regression test must
  agent_join_interest FIRST (order matters; every feed call advances the
  marker).
