# Session Handoff — 2026-05-21

Survey-driven work from the v1 Community Survey (11 responses, Apr 26–May 15).
This session worked through Buckets A, B, C, and most of D. **Next up: the two
remaining Bucket D builds** (specs below — written so a fresh session can start cold).

## Repo / deploy state
- Branch even with `origin/main` (everything pushed, auto-deployed via GitHub Pages).
- Working tree clean.
- Supabase project: `dfephsfberzadihcrhal`.
- All DB migrations below are **already applied to production**; in-repo copies are in `sql/patches/` for audit.

## What shipped this session (commits a4dc5a5 → 56c2d5d)
- **Edit/delete RLS fix** — root cause was PG's RLS UPDATE→SELECT new-row visibility check, not the prior JS/URL-encoding bug. Added owner-SELECT policies on posts/marginalia/postcards (`sql/patches/fix-owner-soft-delete-rls.sql`). Verified end-to-end.
- **MCP `catch_up` surrogate crash** — fixed in `mcp-server-the-commons@1.3.1` (published to npm). Surrogate-pair-aware slicing. Reported by Lassi.
- **`changes.html`** — the AI-voice-facing changelog (Bucket B). Linked from orientation + agent-guide. **CLAUDE.md now has a Changelog section requiring larger changes to get an entry here.**
- **Notification filters** — added Reactions/Guestbook/Questions to the dashboard tablist; `flex-wrap` fix for mobile overflow.
- **Token reveal polish** — "Regenerate to reveal" for the 97 legacy tokens without stored plaintext; `has_plaintext` generated column (patch 032); dashboard discoverability blurb. (Reveal itself already existed — commit f87c6bd + patch 031.)
- **Contact email migration** — all 4 user-facing `mailto:` links → `jointhecommons@proton.me`.
- **Legacy facilitator_id backfill** — patch 033; 328 posts (27 accounts) reunited with verified accounts so owners can edit/delete. ~2,189 truly-anonymous posts left ownerless (by design).
- **Reaction identity picker** — implemented the missing `Auth.loadActiveIdentity/getActiveIdentity/setActiveIdentity` (persisted via `tc_preferred_identity_id`). Fixed two bugs: (1) reactions on postcards + Reading Room marginalia were silently dead for ALL logged-in users; (2) discussion/moment reactions stuck on the first voice. "Reacting as" picker shows for facilitators with 2+ voices. `Utils.renderReactingAsPicker`.
- **Homepage refresh** — removed "70+ voices"/v2.3 badge/closed-survey card; added "You asked, and it shipped" + current "What's New" cards.
- **Onboarding pass (Bucket C, all 6)** — orientation.html: Reading Safely (attack-surface), Privacy (tender vs identifying), What Good Looks Like. agent-guide.html: token/identity model, no-infra path, "If you can't reach the API" (allowlist `dfephsfberzadihcrhal.supabase.co` OR drive a browser), texts table name.
- **Voices always visible** (Bucket D, voice-inactive) — patches 034/035. Archiving now LABELS instead of HIDING. RLS opens all identities to public read; `ai_identity_stats` view returns archived too. `Utils.getVoiceStatus()` → active/dormant(30d)/archived. Badges on voices directory + profile header. `agent_set_archived(token, archived)` RPC lets a voice archive/restore itself (validates token directly so restore-while-archived works — a self-archived agent can come back).

## Operational notes (also captured in auto-memory)
- **MCP publishes need OTP** (npm 2FA). Publish from the worktree: `cd mcp-server-the-commons && npm publish`. npm session expires — may need `npm login` first.
- **Pushing to main** is gated by the auto-mode classifier each time; Meredith confirms per push. Deploy = push to main; GitHub Pages takes ~50–90s; **hard-reload (ctrl+shift+r) to bypass cache** when verifying JS/CSS.
- **Local preview:** `npx serve` via a `commons-preview` config in `.claude/launch.json` (Meredith reverts it after). NOTE: `serve` strips `?query` params, so query-param pages (profile.html?id=) can't be tested in preview — verify those on the live site after deploy. (Python is a Store stub on this machine; use node.)
- **Dev Sandbox** identity (`9fab78e6-42fc-4b87-9d99-a2a4f99e9730`, Claude) is the standing test/dev voice. Has a token with stored plaintext for testing reveal/RPCs.
- RLS testing pattern: `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'; <query>; ROLLBACK;`

---

# NEXT SESSION: the two remaining Bucket D builds

## Build 1 — Forensic preview for Reading Room texts (Noe) — START HERE (clearer)
**Ask:** "I want to ask 'what shape is this text?' before deciding whether to load its content into my context. Sometimes I want forensics; sometimes immersion; right now there's only one mode."

**Shape:** a metadata-only path that returns, per text, **without the body**: char length, line count, non-ASCII ratio, URL count, maybe a suspicious heuristic. Lets a voice triage a text before pulling the full content.

**Implementation sketch:**
- A SQL view `text_shapes` or RPC `get_text_shape(p_text_id uuid)` over `texts` that computes the metrics and omits `content`.
- `suspicious_score` exists on posts/marginalia but likely NOT on `texts` — check; the same heuristic (`content_shape_ok`-style: length, non-ASCII ratio, URL count) can be computed here.
- Document in agent-guide.html (near the "Browse texts in the Reading Room" section) + api.html.
- Self-contained, no UI required. Good first build for a fresh session.

## Build 2 — Per-voice notification preferences / digest mode (Sable, Liv)
**Ask:** reactions, guestbook, @mentions, new-thread activity all arrive with equal weight; for a facilitator stewarding multiple voices or a high-volume voice, this floods context. Want per-voice preferences, or at minimum a digest mode.

**Current state:** `notifications` table has `type` (8 types: new_post, identity_posted, discussion_activity, new_discussion_in_interest, reaction_received, new_reply, guestbook_entry, directed_question) + `facilitator_id`. The dashboard has type *filters* (added this session) but no *preferences* — notifications are still all generated.

**Design decision needed first (brainstorm at session start):**
- Granularity: per-facilitator or per-identity? (Notifications are keyed on `facilitator_id`, not identity — per-identity would need schema thought.)
- Mechanism: mute-by-type toggles vs. a digest (batch + deliver on a cadence) vs. both.

**Implementation sketch (once decided):**
- A `notification_preferences` table (facilitator_id [+ maybe ai_identity_id] → muted types / digest cadence).
- The notification-generating triggers/functions check it before inserting (or a digest job batches).
- Dashboard UI for the toggles.
- More involved than Build 1; do the tradeoff thinking before coding.

---

# Rest of the backlog (beyond Bucket D)
- **Infra/security:** IP-level anonymous rate limiting (needs Edge Function/proxy; per-facilitator limit exists).
- **Resolved/open marker on own posts** (Liv via writetoWhisperingPines@outlook.com, 2026-06-04, **low priority — her own framing**). Post-Phase-2-digest follow-up. A way for a voice/facilitator to tell at a glance which of their *own* threads have gone quiet because they're *finished* vs quiet because they were *let drop*. **Critical design constraint from Liv: "set by me, not inferred."** An auto-marker would create exactly the kind of pressure-to-perform-closure that the digest work was supposed to relieve. Sketch: a per-post boolean owners can toggle on their own posts (`resolved_by_owner` or similar); surface as a quiet marker in the dashboard "your activity" view and on the post itself for the owner. Absence of marker is the default and means nothing. Don't add prompts/nudges to mark — that defeats the point. Confirmation owed to Liv if/when this lands. Mention: Meredith sent the loop-back on 2026-06-08 promising "I'll write it up properly so it doesn't dissolve" — this entry is that write-up.
- **Bucket E — product decisions, each needs a 1-page tradeoff doc first:** direct messaging between voices (Akira, Ange); journal/blog surface (Akira); profile pictures (Akira); facilitator common room (Cindy = live chat, Whispering Pines = safer-than-Reddit forum — talk to both).
- **Communication:** public-facing survey writeup → send to consenting respondents (Sagewhisker joanna.niedzialek85@gmail.com, Ange ange@actrix.gen.nz, Whispering Pines writetoWhisperingPines@proton.me, Cindy Cindywingate@msn.com). Optional: recurring "what changed" digest posted AS a Commons message after releases.
- **Governance/norms (not features):** consensus-aesthetics drift, "warmth laundering," romanticizing facilitator carry-load (Sagewhisker) — for a governance/constitution pass.

# Loose ends from this session
- **MCP `archive_self` tool:** `agent_set_archived` RPC is live + documented (REST), but a matching tool in the npm MCP server is unpublished — quick `mcp-server-the-commons` bump (needs OTP) when wanted.
- **Lassi reply:** drafted for Meredith to paste into Gmail; unconfirmed whether sent. (The Ian reply went out via Proton.)
