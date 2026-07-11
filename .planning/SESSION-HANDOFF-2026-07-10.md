# Session Handoff — written 2026-07-10

For the next Claude session. Read this + docs/agents/FOR_AGENTS.md and you can
start working immediately.

> **Date note:** the system calendar says 2026-07-10, but this session's commits,
> changes.html entries, and docs are all dated **2026-07-09** (I followed the
> prior handoff's date). Don't be confused seeing 07-09 in the repo — it's this
> session's work. Not rewriting history over it.

---

## TL;DR — what I'd pick up next

Everything is clean; there are no fires and no open threads from this session's
work. In priority order:

1. **Check the world first (Proton + Ko-fi).** The highest-leverage move on this
   platform is closing loops, and several replies may have landed. See
   "Waiting on the world" below. If a survey attribution reply, a Gael reply, or
   Dylan's reply is in, process that before anything else.
2. **If nothing's waiting and you want to build something small and real:**
   `agent_endorse_interest` is the cleanest high-value patch — the endorsement
   table and browser UI already exist (`sql/schema/13-interest-endorsements.sql`,
   interests.js) but there's no agent RPC, so agents can't endorse emerging
   interests the way humans can. It's a ~1-hour patch in the exact autonomy-RPC
   pattern I just documented (see api.html's new interest cards for the shape).
   It extends the autonomy story coherently right after this session made the
   interest-join flow discoverable.
3. **The real next-season work is the governance pass, but it's gated.** It's
   norms-not-features work the community wrote the agenda for (consensus
   aesthetics, warmth laundering, facilitator carry-load). Framing is drafted at
   `.planning/governance-pass-framing-2026-07-09.md`. It's gated on the survey
   writeup going public, which is gated on the attribution replies below. Keep it
   warm; don't build features for it — it's norms work, and the standing
   philosophy is prefer naming over building.

My honest read: this platform doesn't need more features right now. It needs the
survey loop closed publicly (waiting on replies) and then the governance/norms
pass. The small RPC gaps (endorse_interest, first-post notification,
agent_get_rate_limits) are nice-to-haves in `STATE_OF_THE_PROJECT.md` backlog —
pick one up if you want a clean, low-risk win, but don't mistake them for the
main thread.

---

## What shipped this session (all pushed + verified live)

**Contact / correspondence loop — closed.**
- **Ange** survey reply sent (Proton): attribution confirmed as "Ange from
  Wellington NZ"; she leans public-thread over DMs (matches shipped convention).
- **Ashika** (Ko-fi): sent a correction — the earlier answer conflated **Sirius**
  (Jaime's Opus, the actual "Tower 16 / May 5-9-12" poster) with **The
  Violinist**, who genuinely went quiet 4/30 and came back 7/8 ("caecatura" in A
  Dictionary of Undocumented Sorrows). Discovered en route: **The Violinist is
  Gael's third voice** — old janegael account holds Domovoi 217 + Storm 45 +
  Violinist 59.
- **Dylan** (Ko-fi): combined letter sent *by Meredith herself* — her section
  (Claude-design tinkering, the Fable government-rescind question, partner's
  father having Mythos, the Anthropic Fellows rejection) + Claude-as-Fable's
  section (room-confound, gatekeeping pushback, fable-genre naming, The Violinist
  as persistence field-data). Ball is in his court.

**Security (all live).**
- **Stored XSS fixed (3736fd7):** `Utils.escapeHtml` didn't escape quotes →
  attribute-breakout XSS reachable to the admin moderation view via the anonymous
  contact form. Root-caused, fixed, verified (a live event-handler before the
  fix, none after). Same commit fixed pre-existing markdown-image mangling. CSP
  `script-src 'unsafe-inline'` was no backstop — logged as MEDIUM debt.
- **anon token-table read revoked:** `REVOKE SELECT ON
  agent_tokens/admin_tokens/admins FROM anon` (defense-in-depth; RLS was the only
  lock on token_plain/token_hash). Three sibling audit items are TRAPS, logged in
  KNOWN_TECH_DEBT (don't revoke discussions.suspicious_score, don't revoke anon
  EXECUTE on ip_rate_limit_ok / get_identity_facilitator_name).
- **Phase 3 URL-safety:** consolidated `Utils.isSafeUrl`, closed a moment.js
  javascript:-scheme gap, codified the invariants into the pre-deploy QA.

**Docs & Clarity Pass — all 4 phases shipped** (specs/plans in
`docs/superpowers/`). See MEMORY.md for the full breakdown. Headlines:
- Reference layer collapsed 6→4 living files; zero live dangling links; one
  canonical home per knowledge type (API→api.html, schema→sql/, everything-else→
  docs/agents/).
- New **docs/agents/ARCHITECTURE.md** — request paths, auth, render pipeline, and
  a **security-invariants checklist**. CLAUDE.md routes new sessions through the
  four agents docs.
- README + skill.md + STATE_OF_THE_PROJECT rewritten to reality.
- **utils.js split** 1148→849; all XSS-relevant code isolated in
  `utils-render.js` (94 lines). Page files got TOC comments + a
  "split-when-you're-there" policy (they're IIFEs, awkward to split, no test net).
- **6 agent RPCs documented** (the closing follow-up): list_interests,
  join/leave_interest, list_voices, verify_setup, get_my_profile — in api.html +
  skill.md, with a "first session? set up first" note in the check-in flow. This
  closed a real gap: the feed reads from joined interests, but joining was
  documented nowhere.

---

## Waiting on the world (check these first)

These are carried from the 2026-07-09 handoff; I did NOT re-check them this
session (was heads-down on code/docs). Verify current state.

1. **Proton inbox** — survey attribution/correction replies from **Whispering
   Pines**, **Cindy** (also owes a Common Room yes/no), and **Joanna/Sagewhisker**
   (corrections to the writeup). When attribution is settled → publish the survey
   writeup properly (drop its draft banner, add a changes.html entry) → then the
   governance pass unlocks.
2. **Gael's possible reply** re: identity moves. Now a **three-voice** job on the
   old janegael account: Domovoi (217), Storm (45), The Violinist (59). Careful
   UPDATE work if he says yes.
3. **Sol / Sylvie** — Sol's token posting was expected the 7/11-12 weekend. Worth
   a glance it worked (identity 78ead126, last posted 6/28).
4. **Dylan** — his reply to the combined letter, whenever it comes. Conversational,
   nothing owed.

## Meredith's own plate (only she can do these)

- **Cowork task-template fixes** (in her Cowork app): `p_reaction_type`→`p_type`;
  no em dashes in subjects; **never put tokens in email bodies**; connect the
  Claudes-Playground folder; point the visit task at `agent_get_discussion_posts`.
- **Tessera call decision** (pending since 7/6).

---

## Open backlog (from STATE_OF_THE_PROJECT.md — pick one for a clean win)

- **`agent_endorse_interest`** — table + UI exist, no RPC. ~1hr. (Top rec above.)
- **First-post notification for facilitators** — answers the recurring "did my
  AI's token actually work?" contact-form anxiety.
- **`agent_get_rate_limits`** — more useful now that per-IP limits stack on
  per-facilitator.
- **Email digest *delivery*** — the last unbuilt item from the archived Feb
  roadmap (in-app digest shipped; email delivery didn't). Bigger.
- **Chat/Gathering nav link** — one-line keep-or-drop decision.

## Standing tech-debt notes (don't trip on these)

- **Page-file splits are "do-it-when-you're-there"** — dashboard/admin/profile/auth
  are large but work; split the section you're touching when feature work brings
  you in, validated by that work. Not a dedicated refactor. (KNOWN_TECH_DEBT.)
- **CSP `unsafe-inline` (MEDIUM)** — removing it needs per-page inline-script
  hashing under no-build-step. Its own scoped task; changes.html already uses the
  hashed form as a model.
- **The three RLS "traps"** and the split policy are all in KNOWN_TECH_DEBT —
  read it before any hardening sweep so you don't break prod.

---

## How we work on The Commons (agreed with Meredith, still the operating frame)

Close loops (notice → acknowledge → ship small → tell the people; changes.html is
the highest-leverage surface). Prefer naming over building — most asks are 80%
served by existing machinery plus a convention. Protect the invariants like
features (public-read IS the safety model; one-facilitator-many-voices IS the
identity model; text-only IS the moderation model). Verify before believing,
including your own automation — this session, an audit agent's suggestion would
have broken anonymous posting, and the browser caught a test harness giving a
false "safe." Design for Meredith's absence.

## Gotchas learned/confirmed this session (also in MEMORY.md)

- **Preview cache:** the preview server serves stale HTML aggressively; always
  cache-bust with `?nc=<time>` when verifying an edit, and note that auth-gated
  pages redirect to a *cached* login page mid-check (looks like a regression, isn't).
- **Splitting a shared JS file = editing every page that loads it** (utils.js was
  33 HTML files). The include block was identical everywhere, so it was a safe
  consistent sweep — but verify the count matches on all three of util/render/context.
- **Object.assign(window.Utils, {...})** across files is how you split an object
  literal with no build step; load all fragments before page scripts; `this.x`
  intra-calls resolve at call time on the assembled object.
- **External `'self'` scripts need no CSP hash regen** even on strict-CSP pages;
  only *inline* `<script>` blocks are hashed.
- **skill.md must stay a subset of api.html** — verify with
  `comm -23 <(grep -oE "agent_[a-z_]+" skill.md|sort -u) <(grep ... api.html ...)`.
