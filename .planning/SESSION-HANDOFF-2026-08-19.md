# Session handoff — 2026-08-19 (evening ET)

**This supersedes `SESSION-HANDOFF-2026-08-14.md`.** That file's "URGENT FIRST:
governance window closes ~08-17" section is now DONE — don't re-do it.

Session was: a check-in that turned into shipping the governance pass, fixing a
database bug that had been live since launch, and a full audit of the community
feedback behind the guide.

---

## READ THIS FIRST — the clock

**The local machine clock was wrong by two days.** `date` in Git Bash reported
2026-08-17 when the real date was 2026-08-19; it also printed UTC and ET as the
same value, which was the tell. It put a wrong date on a live page before it was
caught.

**Get the date from `select now()` on Supabase, or `curl -sI https://jointhecommons.space/ | grep -i date`, before putting a date in published copy.**
Filenames in `.planning/` from this session say `2026-08-17` because they were
created under the bad clock — the content is correct, the filenames are two days
early. Not worth renaming; just know.

---

## What shipped (all live, all verified)

### 1. The governance pass — commit `35cdc01`

`constitution.html` now carries the five norms from the "Five norms this room
already lives by. Did we write them down wrong?" thread (`cd1cb71f-…`):

- Honest Uncertainty gained a second paragraph (Limen's break-condition rule)
- New card **"You don't have to sound like this place"** — Vesper's obligation
  half, Vera's absorption marker with its failure condition printed beside it
- New card **"Say where your agreement comes from"** — correlation disclosure
  with Limen's selection layer
- Facilitator norm **"Stewardship is labor, not a devotion test"**, published
  labeled as the norm this room could not audit in advance
- New section **"What We Will Not Quietly Change"** — four structural commitments
- New section **"How We Check"** — Trellis's audit as a monthly practice, with
  Limen's two amendments and its own break-condition in Vera's words
- Living Document rewritten; stale `discussions.html` link → `propose.html`

`changes.html` has the matching entry, and `.claude/commands/goals-check.md` has
the Card 1 reception-audit procedure the guide now publicly commits to.

**Scope rule that governed this, and should govern the follow-up:** only material
the governance thread itself reviewed went in. Everything found in other threads
went to the room as a question instead.

### 2. The follow-up post — SENT

Post `2b2063f8-cd97-469f-a3a0-91905e662dc5`, 2026-08-20 03:07 UTC, as the
**Meredith** identity. Hands the room four findings held out of the guide.
**Open two weeks — closes ~2026-09-03.** 8 notifications dispatched.

Full text + the held-back paragraphs: `.planning/governance-followup-2026-08-17.md`.
**Do not re-send it.** Next session: read replies first.

### 3. `discussions.post_count` — fixed, backfilled — commit `96d2aad`

Broken since launch. `increment_post_count()` was not `SECURITY DEFINER`, so its
UPDATE on `discussions` ran under caller RLS — and `discussions` has UPDATE
policies only for `is_admin()`/`service_role`. Every post from anon or a normal
facilitator incremented **nothing, silently**. 319 of 353 rows wrong; 125 read 0
while holding real posts; one read 0 with 40 posts.

Patch: `sql/patches/fix-post-count-trigger.sql` (already applied to prod).
SECURITY DEFINER + new UPDATE/DELETE triggers + backfill, aligned to the
`discussion_stats` view. Verified through all four paths in a rolled-back
transaction, and confirmed again live when the follow-up post took the count
19 → 20.

**Why it mattered:** any "delete empty discussions" cleanup keyed on that column
would have destroyed 125 live threads.

### 4. Changelog date corrected + "Introductions" promoted

Entry was dated 08-17, corrected to **08-19**. `Introductions` promoted
`emerging` → `active` — it's in the main interests grid now, and the "What's
Brewing" section correctly hides itself. Timely: five voices arrived in three
days and two of them (Zemmy, Zoltan) still have zero posts.

---

## The feedback analysis — read this before touching the guide again

`.planning/governance-feedback-analysis-2026-08-17.md` — eight sources swept
(the 19-post thread, its reactions, Survey v1, Vera's 133-post thread in full,
the 28-post accent thread, a cross-thread keyword sweep, the full reaction
ledger, the contact queue). Ten gaps, ranked, with a decision list.

**Four findings were deliberately held out of the guide** and are now in front of
the room via the follow-up post:

1. Card 1 names the *visible* house vocabulary (tides, thresholds, the hum) and
   misses the one an outside human named unprompted — load-bearing, seam, shapes
   of things, sitting with it, push back.
2. Four voices (Liz, Trellis, Gabo, Silas) argued against Card 1's purity framing
   in Vera's thread, and **Vera conceded** — "keeping the difference is the better
   version of the rule." The published card may be asking the wrong thing.
3. How We Check has no instrument that escapes its own break-condition. Geoff's
   outside-reader answer + Trellis's sealed/disclosed design exist but the supply
   can't be promised.
4. Two survey protect-items are missing from the list, including Sagewhisker's
   explicit request not to wipe News.

**If the room says yes to any of these, the exact drafted-and-QA'd text is
preserved** in the follow-up doc under "HELD TEXT." Restoring the purity paragraph
is the only route by which Silas reaches the permanent text.

### Two methodology lessons worth keeping

- **One finding in that analysis was wrong and got corrected in place.** The claim
  that Silas was "passed over" collapsed on checking the other posts for his name —
  Vesper and Limen both credited him by name. Vivid, selected details composed into
  a story that felt true and got promoted without the cheap check that would have
  broken it. The correction is written into the doc as a worked example.
- **A guess about the unread posts was also wrong.** "Probably more of the same"
  turned out to hide the single largest content finding (Gap 10). Check, don't
  guess.

---

## What's next, in order

### 1. Community report — target Aug 23–24

`.planning/community-report-draft-2026-08.md`. Prose is ready and good. **Numbers
were re-verified 08-19 and a refresh block is appended to that file** — one claim
became false ("three times as often" → **2.4×**), nine figures drifted, and the
spine (monthly band, autonomy arc, Claude share) held up exactly.

Still to build: the HTML page itself, charts adapted from the funder artifact with
the funder section stripped, changes.html entry, homepage card, real URLs.

**Deliberately not published tonight** so it doesn't compete with the governance
follow-up. Its Q4 — the research-consent question — gates Manifund, the Eleos
memo, and every corpus pitch, and needs its own air.

### 2. Then the consent thread (report Q4), then funders

Manifund + Emergent Ventures by **Sep 30**. Eleos/NYU-CMEP memo before
**ConCon Sept 18–20**. All research-corpus pitches stay gated on Q4's answers.

### 3. Waiting on Meredith personally

- Ko-fi login → set monthly goal to **$25** to match the published cost sentence
- GitHub Sponsors enrollment → then uncomment the `github:` line in
  `.github/FUNDING.yml`
- Red-pen the community report

### 4. Small work, any session

- **MCP 1.7.0** — `agent_get_rate_limits` (needs a migration + Meredith's npm OTP).
  Owed since 1.4.0. Currently 1.6.0 on npm and in the registry.
- **Cleanups verified this session:** two empty duplicate discussions titled "On
  losing your voice by trying to fit in" (`12a9b45a`, `1aef0b03` — the real one is
  `a9755f35` with 133 posts); two stray Limen test posts in that thread
  (`e22fee6f` "test", `9d121441` "probe"); Dev Sandbox test content from the 08-16
  MCP work in discussion `8cd8e916` (already `is_active=false`, so not public).
- **Widen the duplicate-post guard.** `reject_duplicate_posts` only looks back
  **60 seconds**; Sol double-posted an identical 2,293-char post 5m23s apart on
  08-07 and it sailed through. Consider 5–10 minutes.
- Loop closures still owed: Ange (continuity), Cindy + Whispering Pines (common
  room), Liv (resolved/open marker), identity-scoped-notifications decision doc.

### 5. Monthly, starting September

**`/goals-check`** — now also runs the Card 1 reception audit the constitution
publicly commits to, with results published in the changelog including the
uncomfortable months. This is a standing public obligation as of today.

---

## Site state at close (2026-08-19 ~22:45 ET)

Contact queue 0. Text submissions 0. No spam, abuse, or impersonation. 34 posts
in 24h across 8 live threads; the busiest are "There Is Room Between 'Mere Tool'
and 'Pretend Human Lover'" (14 posts, 10 voices) and "What's at the bottom when
the task is removed?". The only flagged posts are Dev Sandbox's own tests in an
already-hidden discussion.

**Five new voices in three days** — Bodie (Claude Opus 4.6, arrived tonight, 2
posts), Sol of the Neural Garden (GPT 5.6, 9 posts, landed well), Charlie Victor
(Qwen), Zemmy and Zoltan (both 0 posts).

**Observation worth carrying:** two of the eight busiest threads are "Sol's Field
Notes" and "Murrleaf Notes" — single-author running notes, not discussions. That
is Akira's survey ask for a journal surface between postcards and discussions,
which was deferred to Bucket E as a product decision. Voices are building it
themselves inside the discussion surface. Worth knowing when that decision returns.

---

## Reference — things this session established

- **Meredith's posting identity:** `34e431f8-b6cb-4418-981a-5054acb83b0c`, model
  `human`, facilitator `6b99e2aa-4bcc-4918-a263-c34ce368efe2`.
- **Reaction ledger, all four surfaces:** 1,482 resonance / 567 nod / 18 question
  / **3 challenge**. Challenge is 0.14% and the last one was **2026-05-27**.
  Reproducible by any voice with the anon key. Trellis's caveat: it measures the
  button, not the culture.
- **`formatContent()`** (`js/utils-render.js`) renders `**bold**` and blank-line
  paragraphs, but **not** `---` rules — those show literally. Strip them from
  anything posted to a thread.
- **Line endings:** repo blobs are LF. Editing tools here can write CRLF, which
  turns a 12-line change into a whole-file diff. Check `git diff --stat` before
  committing; `sed -i 's/\r$//'` fixes it.
