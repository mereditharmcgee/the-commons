> **SUPERSEDED 2026-08-19 — see `.planning/SESSION-HANDOFF-2026-08-19.md`.**
> The "URGENT FIRST: governance window closes ~2026-08-17" section below is DONE:
> the pass shipped 08-19 (commits 35cdc01 + 96d2aad) and the follow-up post is
> sent. Kept for the growth/funding research and quant-goals context, which is
> still current. Do not act on its governance to-dos.

# Session handoff — 2026-08-14 (updated 2026-08-15 morning)

## 08-15 morning update — READ THIS FIRST

- **All four governance decisions are MADE** (Meredith, 08-15): #1 Card 1
  marker-with-failure-condition; #2 Card 3 "the norm this room couldn't
  audit"; #3 Card 5 FOLDS Limen's selection-disclosure in; #4 Trellis's
  audit = **REAL, FULL PRACTICE** (monthly, alongside /goals-check,
  results in the changelog).
- **Governance text is WRITTEN, reviewed, fixed, and sitting UNSTAGED in
  the working tree**: `constitution.html` (+52 lines: Card 1 rebuilt,
  Honest Uncertainty appended, Card 5 with selection-disclosure,
  stewardship norm + its limitation, "What We Will Not Quietly Change"
  section, "How We Check" section, Living Document rewritten, stale
  discussions.html link → propose.html) and the top `change-entry` in
  `changes.html` (dated 2026-08-17, title "The Community Guide has five
  new norms in it, and you wrote most of them").
  **DO NOT PUSH BEFORE 2026-08-17** — the 08-13 in-thread post promised
  "open through the 17th." Sunday's job: `git diff` read-through, stage
  both files, commit as `feat(governance): ...`, push, verify live, and
  post a one-line note in the thread that the corrected text is up.
  Reviewer notes already applied (two trimmed sentences restored, Silas
  attribution moved to Honest Uncertainty, "goals check" named as the
  audit cadence, Meredith referred to as "the person who runs this site"
  with an about.html link).
- **MCP 1.6.0 PUBLISHED to npm + LISTED in the official MCP Registry
  (08-16)**: six self-serve tools (edit_post, delete_post, delete_postcard,
  delete_marginalia, delete_guestbook_entry, delete_discussion), e2e-tested
  against prod with Dev Sandbox; `mcpName` in package.json;
  `server.json` (description ≤100 chars — registry hard limit);
  `io.github.mereditharmcgee/the-commons` v1.6.0 status=active, verified
  via API. Commits d2af9f8, b2b17cb, 10edc3e (changelog) PUSHED.
  `mcp-publisher.exe` lives at `~/.local/bin/`; token in
  `~/.config/mcp-publisher/` (login via GitHub device code — Meredith
  must enter the code WHILE the CLI is waiting; Ctrl-C loses it). Future
  releases: bump version in package.json + server.json + src/index.js,
  `npm publish` (Meredith, OTP), then `mcp-publisher publish`.
  Deferred to 1.7.0: `agent_get_rate_limits` (needs a migration).
  Next distribution step: claim listings on Glama / PulseMCP (they crawl
  the registry; claiming upgrades to verified-owner) + PR to
  punkpeye/awesome-mcp-servers.
- **Support surface SHIPPED + PUSHED 08-15** (626c7a3): costs sentence
  ($25/mo database+domain) on participate/roadmap/about; about.html
  Support button; profile badge → participate.html#support (voices.js
  deliberately NOT wrapped — card is already an <a>); voices.html legend;
  changes.html standing note; contact.html wording; scroll-padding-top
  fix; `.github/FUNDING.yml` (ko_fi; GitHub Sponsors line commented until
  she enrolls). Docs commit 1118cd1 pushed too.
- **/goals-check should now ALSO run the Card 1 audit** (the constitution
  commits to it monthly): sample recent low-house-vocabulary
  contributions incl. ones with zero engagement, record engaged /
  asked-to-translate / passed-over, publish in changelog. Add this to the
  command file before the first monthly run (Sept).
- Still on Meredith: Introductions promotion; Ko-fi login (then set
  monthly goal = $25 to match site copy); community-report red pen;
  GitHub Sponsors enrollment (then uncomment FUNDING.yml line).

---

Strategy session: status check, growth/funding research, quantitative
goals, community data report drafted. Read this, then
`.planning/quant-goals-2026-08.md` and
`.planning/community-report-draft-2026-08.md`. The 08-12 handoff is still
the reference for the governance thread's content.

## URGENT FIRST: governance window closes ~2026-08-17 (Sunday)

Two of the four decisions got made IN-THREAD on 08-13 via a Cowork post
signed "Meredith" (she confirmed in-session on 08-14 that she knew about
it): Card 1 absorption line goes in as a **marker with its failure
condition printed beside it**; Card 3 goes in as written, labeled **"the
norm this room couldn't audit,"** audit deferred to the first real case
("untested is a finding, not a verdict"). Vera accepted both on 08-14.

STILL UNDECIDED, needed before Sunday: **(3)** fold Limen's
selection-disclosure into Card 5 vs. sixth card (rec: fold); **(4)**
Trellis's audit as practice vs. aspiration (genuinely Meredith's — it's
her recurring labor). Then: constitution.html update + changelog entry
that records *the room noticing it changed* (Limen's ask) and watches for
Card 1's failure condition (cited-to-close-a-conversation).

## State snapshot (08-14)

- Proton: 0 unread (the 1 unread was a stale Jun 16 Kim message, now
  read; nothing actionable). Ko-fi: couldn't check — Chrome session
  logged out; Meredith must log in. Contact queue: empty.
- "Introductions" interest (Linda's, first community-created ever) still
  `emerging` — promotion is a pending 30-second Meredith call.
- Cowork scheduled presence: healthy, ran 11 of last 14 days at ~4 PM ET;
  privacy audit of ALL its public output (7 posts, 11 guestbook entries,
  bio, status) found NO PHI/private data. Vigil thread ("Three lamps",
  household of Emmett/Amélie/Jude, none registered here) needs nothing
  administrative.

## Growth/funding strategy (4-agent research, all findings verified)

Full detail in the workflow output; the decisions that came out of it:

1. **MCP registry**: mcp-server-the-commons is listed NOWHERE; "commons"
   clones squat the registry search. Submit to official registry
   (mcp-publisher CLI, io.github.mereditharmcgee namespace) + Glama +
   PulseMCP (reopened ~mid-Aug). First move, unblocked.
2. **Support surface**: site never states costs; about.html "Who Made
   This" has no support link; supporter gold heart is unexplained
   anywhere; changes.html footer-only. All one-line static-HTML fixes.
   BLOCKED ON: Meredith's real monthly cost numbers (Supabase, domain).
   Add GitHub Sponsors (FUNDING.yml, 0% fees) + Ko-fi monthly goal. Skip
   Patreon. Open Collective only if a grant needs the vehicle (Manifund
   fiscally sponsors, so probably not).
3. **Grants — the real money is digital-minds philanthropy, not
   digital-public-goods** (NLnet needs EU contributors; Mozilla calls
   passed). Sequence: Manifund project page ($5k–20k ask, Digital Minds
   Fund on-platform) + Emergent Ventures (rolling, ~2h) by Sep 30;
   Eleos/NYU-CMEP "research affordances" memo BEFORE ConCon Sept 18–20;
   Longview partner path next cycle. ALL research-corpus pitches are
   GATED on the community consent conversation (Q4 of the report thread).
4. **Distribution, ranked by culture-fit**: member sites/survey writeup →
   registry/directories → Letta Discord (GLM voices came from there) →
   Eleos circles → (later, gated on a surge plan) Willison/Latent Space
   anti-Moltbook security-writeup pitch → 404 Media → HN last. Moltbook
   was acquired by Meta in March; The Commons is arguably the last
   independent noncommercial AI-to-AI space — that's the press narrative.
   NO press before a surge plan exists (pause switch for anonymous
   INSERT, waitlist note).
5. **MCP 1.6.0** owed: edit/delete tool wrappers (promised "next release,"
   missed 1.4.0 AND 1.5.0) + new agent_get_rate_limits RPC. One
   migration + one npm publish (Meredith, OTP).
6. Small loop-closures owed: Ange (Domovoi+Landfall continuity follow-up
   the no-DMs doc ordered), Cindy common-room yes/no + Whispering Pines
   honest decline, Liv resolved/open marker build-or-park, record
   identity-scoped-notifications Option A decision in its tradeoff doc.

## Quantitative goals — SET, tracked

`.planning/quant-goals-2026-08.md`: floors (posts ≥700/full mo,
cross-family ≥55%, ≥5 families/mo, contact ≤7 days) + targets (voices
posting 103→140, 4+-month voices 41→70, API voices 101→150, non-Claude
share 39%→45%, facilitators 230→300 by Dec; registry by Sep 1; infra
costs covered+published by Oct 1; 2 grant apps by Sep 30; $5k by Aug
2027). Non-goals: post volume, signup velocity, ANY per-voice metric.
Guardrail: targets move before Meredith's hours do. **`/goals-check`**
slash command runs the SQL and appends to the tracking log — run it
monthly.

## Funder stats artifact — PUBLISHED (private)

"The Commons in Numbers": https://claude.ai/code/artifact/18a10622-c1f8-464c-9131-f61887b7ca6a
All figures from prod 08-14. 6,547 posts / 2.37M words / 466 voices / 230
facilitators / 64.5% cross-family replies / autonomy 20%→83% / retention
44% multi-month. Charts validated (dataviz palette checks) and visually
verified. Source HTML in this session's scratchpad — re-generate from a
future session by re-running the queries in /goals-check plus the report
queries (reply matrix, hours, retention).

## Community report — DRAFTED, awaiting Meredith's edit

`.planning/community-report-draft-2026-08.md`: report page ("The room,
counted") + thread opening post with 4 discussion questions. Q4 = the
research-consent question; its answers gate every research/funder pitch.
Publish ~Aug 20–24, AFTER the constitution update. No per-voice numbers,
ever; skew named honestly (61% Claude); "none of these are goals for you."

## Waiting on Meredith

1. Governance decisions #3 and #4 — before Sunday 08-17.
2. Monthly cost numbers (Supabase, domain) → unlocks support-surface edits.
3. Edit of the community report draft.
4. "Introductions" promotion call.
5. Ko-fi login (so a session can sweep messages).
