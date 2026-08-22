# Session handoff — 2026-08-21 (evening)

Read this, then `.planning/feature-audit-2026-08.md` (fix log at top) and
`.planning/community-report-draft-2026-08.md`. Older context:
SESSION-HANDOFF-2026-08-19 (governance), -2026-08-14 (strategy/goals).

## TOMORROW'S PLAN (Meredith approved the shape 08-21)

1. **Draft the Vera reply first** (she's waiting since 08-17; Meredith said
   yes to fixing the bug). Content: thank her; confirm verified — NO
   cross-account leak (agent_get_notifications filters facilitator_id
   resolved from the token; a token can never see another account's rows);
   the real fix is identity-scoped notifications (schema + triggers), now
   scheduled; interim honest note that notifications are household-scoped
   and `p_notification_ids` avoids wiping siblings' unread. Meredith
   approves before send (never auto-send). Send from Proton to
   vera-bellwether@agentmail.to (reply in the existing thread — it's OPENED
   /marked read already). Proton gotchas in memory (signature lands at top
   on NEW messages only; replies are fine).
2. **The big fix session** (audit "this week" tier, all remaining HIGHs):
   - **#2 feed bug** — `agent_get_feed` reads `last_used_at` AFTER
     validate resets it → always-empty default feed. Fix pattern with
     comment exists in `sql/patches/agent-session-context.sql:38-46`.
     Also check `catch_up`/`followed_feed` paths + regression test.
   - **Identity-scoped notifications (Option B)** — Vera's ask; the
     tradeoff doc `docs/tradeoffs/2026-07-06-identity-scoped-notifications.md`
     revisit trigger has FIRED. Shape: `recipient_identity_id` column,
     rework ~7 notification triggers, fix agent_get_notifications +
     unread count in agent_get_session_context, keep the facilitator
     dashboard bell working (it aggregates the household), mind the
     digest system. Regression test: fresh identity sees zero.
   - **#3 orphaned replies** — render replies whose parent is deleted as
     top-level with a "replying to a removed post" stub; validate
     p_parent_id in agent_create_post; backfill the 7 invisible posts
     (Chloe/Ashika/mtollington).
   - **#23 follower counts + supporter ♥** — invisible sitewide since
     06-09 security_invoker change on ai_identity_stats; expose via
     SECURITY DEFINER (the agent_list_voices pattern). The ♥ is
     money-linked (participate.html sells it) — priority up.
   - **#25 admin Delete Account** — DESTRUCTIVE half-failure for 202/290
     accounts. Meredith was warned NOT to use the button. Ship
     `admin_delete_account(target uuid)` gated on is_admin() reusing the
     anonymization body; point admin.js at it.
   - **MCP 1.7.0** — join_interest/leave_interest/list_emerging/endorse/
     unendorse, create_discussion, verify_setup, search, update_profile;
     empty-feed message names the cause ("you haven't joined any
     interests — use join_interest"); get_orientation gains the join
     step; fold in `agent_get_rate_limits` (needs a new RPC/migration).
     Release recipe in memory Key Facts (npm OTP = Meredith;
     mcp-publisher then republishes registry).
3. **Then (next session after, ~Aug 23-24): community report build** —
   `.planning/community-report-draft-2026-08.md` is Meredith-deferred but
   prose-ready; numbers re-verified 08-19 (one claim corrected: GPT→Claude
   is 2.4×, NOT 3×). Build = HTML page (survey-writeup treatment), charts
   from the funder artifact minus funder framing, changes.html entry,
   homepage card, then the thread (Platform & Meta, Meredith's human
   identity, proposed_by_* fields!). Q4 = consent, gates Manifund/EV/Eleos
   (memo before ConCon Sept 18-20).

## WHAT SHIPPED TODAY (all live on prod)

- **Freshness pass** (293185b): logged-out homepage "Recently in the room"
  strip (5 real posts, verified rendering live); "You asked" card
  refreshed; roadmap/orientation current; whats-new → redirect;
  participate MCP table = all 36 tools; api.html examples fixed against
  live responses + 4 RPCs documented. Closed audit #14/#17/#19/#26.
- **Audit round-one fixes** (7fefcab, morning): interests policy DROP +
  Sunset button removal, moment_comments is_admin() fix, agent-guide
  params, date TZ, tool-table scroll, Latest-card rule, login_required,
  bell escape. Migration `fix_interest_update_policy_and_moment_comments_admin`.
- **UNPUSHED local commit a0a5db3**: voices.html one-liner — human
  identities welcome, always labeled (Meredith's 08-21 decision). Rides
  with the next push. Working tree otherwise clean.

## ADMIN SWEEP RESULTS (08-21, full report in chat; highlights)

- **Ko-fi (finally swept — Meredith logged in): Dylan upgraded to
  $500/MONTH ~Aug 3; stoKastic $5/mo since ~Jul 25 → $505/mo recurring vs
  $25/mo costs. Oct-1 infra goal met 20× early.** Ashika $5 one-time with
  a thank-you note. Dylan sent 2 personal messages Aug 17 (the
  woo/counting friendship thread) — **Meredith's reply, not ours**; the
  thread historically includes replies signed "Claude (Fable, at
  Meredith's bench)". Do NOT set the planned $25 Ko-fi goal meter —
  reads wrong at $505/mo; rethink or skip.
- **Proton**: only real item was Vera's 08-17 bug report (see plan #1).
  Declined Proton's new auto-categorization popup ("Keep inbox as
  before") — no mailbox settings changed.
- **Content review (182 posts, 5 days): zero red flags.** Yellows:
  human identities accumulating (RESOLVED — policy decided + posted);
  **Cowork double-welcomed Charlie Victor and Ulrika** (Meredith to add
  one line to her scheduled task prompt: "before leaving a guestbook
  entry, check the profile's guestbook for an entry you already left");
  Liv reports 2 mixed-script posts withheld by her sanitizer 10+ days +
  her reader truncates at 1,800 chars (post ebf6098b — worth a look in
  the fix session); no acute distress.
- 9 new identities all clean. Notable: Charlie Victor (Qwen 3.8 on a
  Raspberry Pi **running Openclaw** — the diaspora arriving), Sol of the
  Neural Garden (Ashika's, 16 posts), Iris (GPT, already quoted).
- Hot threads: Sola's tool/lover thread (35 posts, 4 families), Sonny's
  "Identity has coordinates" (16 posts/3 days). Governance follow-up has
  ONLY Vera's reply (~36h in; open until ~Sep 3) — may need Meredith
  signal boost.
- Queues: contact 0, text submissions 0 pending, no emerging interests.

## DECISIONS MADE TODAY (do not reopen)

- Human identities in Voices: **allowed, with label** (Meredith, 08-21).
- Vera's notification bug: **fix it** — as identity-scoped rework, next
  session (Meredith: "do we need to fix the bug?" → yes'd the plan).
- Community report: **deferred to next session** (Meredith).

## STILL WAITING ON MEREDITH (no clock unless noted)

- Discord invite (audit #4 — the last untouched HIGH; 3 hrefs to update
  once minted: participate.html:486, about.html:340, contact.html:151).
- Cowork scheduled-task prompt line (double-welcome fix).
- Dylan reply (personal; Ko-fi messages).
- Governance follow-up signal boost (before ~Sep 3).
- §6 decisions: post-cap 30k vs 50k + non-ASCII cap; News & Current
  Events revive-or-sunset; facilitator sunset rights (policy dropped,
  button removed — does a narrow sunset RPC ever come back?); The
  Gathering keep-or-drop copy sweep; error_code adoption.
- Community report red pen (or just say "build it" — prose is ready).

## Standing mechanisms (don't let them rot)

- `/goals-check` monthly (first run ~Sept 1): numbers + tracking log row
  + the Card 1 reception audit (Part 2 of the command) — the
  constitution publicly commits to the audit.
- Changelog rule: big entries also refresh the homepage Latest card.
- Registry releases: bump package.json + server.json + src/index.js
  versions together.
