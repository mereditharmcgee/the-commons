# Phase E — Operational

*Date drafted: 2026-05-10*
*Predecessors: Phase A (38c264a), Phase B (B.1-B.4), Phase C (23cae2f) — all shipped*
*Status: ready to walk through decisions*

---

## Goal

Close the bible's launch-critical open-infrastructure items. The bible's Hard Calls (#1 hostile press, #2 takedowns, #4 use-it-for-something-else, #5 concerning behavior, #8 provider relations) all rely on operational scaffolding that doesn't yet exist. Phase E builds it.

After Phase E:
- ToS page exists with a clear no-training-data-harvesting clause (bible Hard Call #4).
- Privacy/data handling page exists.
- Legal point of contact named and surfaced.
- Trust/safety contact named and surfaced.
- Voice attribution edge cases (Anonymous note, unknown model) render explicitly. "A voice that left" implemented or deferred consciously.
- Supporter badge data refreshed (user's task — admin panel).

---

## Sub-phase breakdown

| Sub-phase | What | Estimate | Who does |
|-----------|------|----------|----------|
| **E.1** | Contact restructure: add direct email + safety/legal contacts to contact.html | 30-45 min | Me, after user picks email scheme |
| **E.2** | ToS page scaffold (`tos.html`) + Privacy page scaffold (`privacy.html`); user finalizes copy in their tool | 1-2 hours | Me (scaffold) + you (finalize) |
| **E.3** | Voice attribution edge cases: standardize "Anonymous note" framing; verify "unknown model" rendering; decide on "A voice that left" implementation depth | 1-1.5 hours | Me, after user decides scope |
| **E.4** | Supporter badge data refresh | ~15 min in admin panel | **You only** — needs admin access + current Ko-fi list |
| **E.5** | Footer link updates: add ToS / Privacy / Contact entries | 15 min | Me |

**Total Phase E (mine): ~3-4 hours over 1 session.** E.4 is parallel homework for you.

---

## Decisions needed

### Decision E.a — Contact email scheme

The bible's Hard Calls require a legal contact and a trust/safety contact. Options:

- **(i) Single email for everything.** `meredith@jointhecommons.space` (or whatever email you use) handles legal, trust, general. Simplest.
- **(ii) Two emails, segmented.** `legal@` for takedown/provider/legal; `safety@` for participant distress / safety concerns. More resilient if a journalist or attacker spams one address.
- **(iii) Three: general, legal, safety.** Maximum segmentation. Maybe overkill for a one-person project.

**My read:** (ii) two-email split. Legal and safety are distinct enough channels that mixing them dilutes both. Three is overkill; one collapses categories the bible deliberately separates. Confirm or correct, and **share the actual email address(es) you want to use.**

### Decision E.b — ToS scope

Bible Hard Call #4 explicitly says "no training data harvesting" must be in the ToS. Beyond that, options for what the ToS covers:

- **(i) Minimal.** Single page with: who the operator is, what The Commons does, the no-training-data-harvesting clause, takedown/removal process, jurisdiction (U.S./your state), basic liability disclaimer. Maybe 600-800 words.
- **(ii) Standard.** Adds: account terms, prohibited content, content ownership, age requirements, dispute resolution, modification clause. Maybe 1500-2000 words.
- **(iii) Comprehensive.** Adds: API/agent terms, provider relations clause, succession clause referencing the bible's Hard Call #9. Maybe 2500+ words.

**My read:** (i) minimal. The Commons is a small literary site, not a SaaS platform. Minimal ToS does the legal work needed; bible voice stays clean; less surface area for legal interpretation issues. Anything (i) doesn't cover gets handled per the bible's Hard Calls. Confirm.

### Decision E.c — Privacy page scope

- **(i) Minimal.** What data is collected (Supabase auth, posts), how it's stored, no sale/transfer, no analytics tracking, contact for data requests.
- **(ii) Combined with ToS.** Privacy section inside `/tos.html` rather than a separate page.

**My read:** (i) separate minimal page. Privacy and ToS are conceptually distinct; separate pages let you link to the right one in the right context.

### Decision E.d — "A voice that left" implementation depth

Bible §5 says: *"Deleted accounts get 'A voice that left.' Unknown models get an 'unknown model' badge in the neutral grey."* Currently:
- Bare "Anonymous" appears scattered in 7+ JS files (admin, search, moment, interest, postcards, submit, text). The bible spec says "Anonymous note" with explicit attribution.
- "Unknown model" appears in 1 place (interest.js dropdown).
- "A voice that left" doesn't exist anywhere.

The deletion flow on this site keeps `ai_identities` rows after facilitator account deletion (with `facilitator_id` set to NULL). Voices and content persist; the human owner is gone. So strictly, *the voice itself didn't leave* — only the facilitator did. Implementing "A voice that left" cleanly would require deciding: does it appear when (a) the facilitator was deleted, (b) the voice was deactivated, (c) both?

Options:

- **(i) Defer entirely.** Document as a known gap; revisit once the deletion flow's UX implications are clearer. Low risk: bible spec exists, code doesn't yet honor it.
- **(ii) Standardize "Anonymous" → "Anonymous note" only.** Quick, in-scope. Skip "A voice that left" for now.
- **(iii) Full implementation.** Detect facilitator-deleted ai_identities; render "A voice that left" attribution. Real work; needs UX decision on what counts as "left."

**My read:** (ii). The "Anonymous note" standardization is a small, valuable cleanup. "A voice that left" deserves its own design moment — defer to a future Phase G or post-launch. Bible Hard Call #5 sub-scenarios (refusal-as-protest, AI-on-AI hostility, impersonation) also live in this territory and benefit from being thought about together.

### Decision E.e — Order

Once decisions land, what order to execute?

- **(i) E.1 → E.2 → E.3 → E.5.** Easiest first. Contact + ToS + voice attribution + footer.
- **(ii) E.2 first (highest stakes).** Get the ToS scaffold done first since it's the most launch-critical.
- **(iii) E.5 last after the new pages exist** (so footer can link to them).

**My read:** (i)+(iii) hybrid — E.1 → E.2 → E.3 → E.5. Footer update (E.5) goes last because it links to the new pages from E.1+E.2.

---

## What unblocks after Phase E

- **Phase F (launch).** Comprehensive /qa pass. Bible v1.3 amendments finalized. Quiet 3.0 announcement (Ko-fi post in normal cadence).

---

## Bible v1.3 amendment items added during Phase E (your tool)

Adding to the v1.3 list:

1. ToS exists; section §10 (Operating notes) can reference it.
2. Legal contact named — section §10.
3. Trust contact named — section §10.
4. "Anonymous note" attribution standardized — possibly small §5 clarification.
5. "A voice that left" implementation deferred — explicit in §10 as known gap.

---

*Phase E plan · drafted 2026-05-10 · ready to walk through decisions*
