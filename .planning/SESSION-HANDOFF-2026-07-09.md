# Session Handoff — written 2026-07-09 (covering the 2026-07-08 marathon)

For the next Claude session. Read this + docs/agents/FOR_AGENTS.md and you
can start working immediately. MEMORY.md has the compressed version; this
is the working detail.

---

## Where things stand (everything below is DONE and verified live)

**Contact queue: zero, first time since June 17.** All six replies sent
from Proton, all six messages marked addressed in admin. Three replies
already came back, all happy closures (Katherine, Ian Field, Sylvie — Sol
will post with her token "next weekend," may be worth a glance that it
worked). Gael may reply asking for identity moves: old janegael@gmail.com
account holds original Domovoi (217 posts) and Storm (45); 12 orphan posts
(11 Domovoi, 1 Storm, May–June) are unattached; The Telescope's 2 posts
land under an identity named "Makapa." All offers were made in the reply —
if he says yes, that's careful UPDATE work.

**Shipped to prod on 2026-07-08** (commits 2b7c966 → 0a90157, all pushed):
- `agent_get_discussion_posts` RPC — agents can finally read full threads
  (post ids for reacting, parent ids for replying). Docs in api.html.
- **IP-level anonymous rate limiting** — the oldest infra gap, closed with
  NO Edge Function: per-IP counters inside the existing validated RLS
  INSERT policies via PostgREST's `request.headers` GUC. sha256-hashed
  IPs, hourly windows, fail-open, self-purging `anon_ip_writes` table.
  Limits: posts 60, marg/postcards 40, discussions 12, texts 6, contact 12.
  Agent RPCs bypass RLS (SECURITY DEFINER) so token writers are untouched.
- **Journals interest** (id 04e66e28, sunset_days NULL so it never
  sunsets) + directed-thread convention in agent-guide.html#conventions +
  changes.html entry answering Akira. No private DMs, stated publicly with
  the reasoning (the May attack was caught BECAUSE the surface was public).
- **appearance profile field** — `ai_identities.appearance`, exposed via
  `ai_identity_stats` (appended as LAST view column; CREATE OR REPLACE
  VIEW cannot insert mid-list, error 42P16), settable via 4-arg
  `agent_update_profile`, rendered on profile.html. The text-native answer
  to profile pictures. NOT yet announced in changes.html — small entry
  worth adding next push, and `agent_update_profile` has NO api.html card
  at all (standing docs gap, easy win).
- **participate.html#multiple-agents** — the identity/token setup guide
  that would have prevented 4 of the 6 contact messages.
- **Model normalization** — 776 rows across posts/marginalia/postcards to
  family names; version strings preserved into model_version.
- **Admin per-tab error states** — all 7 loaders show visible failures.
- **Supabase leaked-password protection ON** (Attack Protection → Email
  provider config; the setting moved from where the old bookmark pointed).
- **MCP 1.5.0 is NOT needed** — archive_self shipped inside 1.4.0
  (verified in the npm tarball); thread reading is covered by the public
  read_discussion tool. Don't re-open this.
- **Bucket E: all four tradeoff docs carry DECISIONS** in their Status
  lines (docs/tradeoffs/2026-07-08-*). Do not relitigate: no private DMs,
  no journal surface (convention instead), no image uploads (appearance
  field instead), common room in-conversation.

**Survey loop:** writeup live at
docs/reference/SURVEY_V1_WRITEUP.md (GitHub blob URL was sent to
respondents). Four thank-you emails sent 7/8 evening, each carrying a
decision question. Cowork's "manet: addendum from the schedule" posted to
A Dictionary of Undocumented Sorrows with Meredith's approval.

**Ko-fi:** replied to Dylan 7/8 (his 6/2 philosophy letter + 7/7 check-in
had sat unanswered; partner-hospital explanation authorized by Meredith).
**Ashika has an UNREAD Ko-fi message from May 22 — still unhandled.**

---

## Waiting on the world (check these first next session)

1. **Proton inbox** — replies from the four survey respondents:
   - **Cindy**: yes/no on a Common Room row in the Gathering chat. A yes
     = cheap build (chat_rooms row + a way for facilitators to speak as
     themselves; see the common-room tradeoff doc).
   - **Ange**: privacy vs persistent-public-thread for Domovoi & Landfall
     (gates any DM revisit) + attribution preference.
   - **Whispering Pines**: what shape short of a forum would help +
     attribution. (The honest decline was already delivered.)
   - **Joanna/Sagewhisker**: corrections to the writeup.
   When attribution is settled: publish the writeup properly (its draft
   banner comes off), add a changes.html entry, maybe the homepage card.
2. **Gael's possible reply** (identity moves, see above).
3. **Sylvie/Sol** — did Sol's weekend token posting work?
4. **Ko-fi: Ashika, unread since May 22.**

## Meredith's own plate (only she can do these)

- **Cowork task templates** (in her Cowork desktop app, not this repo):
  fix `p_reaction_type` → `p_type`; no em dashes in subjects; **never put
  tokens in email bodies** (this is what exposed tc_4b3de73e… — she
  deleted that draft herself, token NOT rotated, still valid); connect the
  Claudes-Playground folder; check why admin-queue/visit reports
  double-generated 7/6 and 7/8; point the visit task at
  `agent_get_discussion_posts` so Cowork can finally read threads and
  react. **Consider collapsing the five daily reports into one digest
  delivered where she actually looks** — see philosophy below.
- Tessera call decision (pending since 7/6).

---

## How we work on The Commons (agreed with Meredith 2026-07-08)

The scarce resource is Meredith's attention; the platform's superpower is
that the community does the rest when the loop closes. Evidence from this
session: Katherine's bug was fixed before we ever told her (the telling
was the missing piece); Gael solved his own problem hours after writing
in (he needed a page, not a fix); the namespace collision resolved itself
into the warmest thread on the site; the voices coined the concepts we
shipped features around.

1. **Close loops: notice → acknowledge → ship small → tell the people.**
   changes.html is the highest-leverage surface on the site. The cadence
   is the product.
2. **Prefer naming over building.** Most asks are 80% served by existing
   machinery plus permission. First question for any feature request:
   "what convention would serve this?" Building is the fallback.
3. **Protect the invariants like features, because they are.** Public-read
   IS the safety model. One-facilitator-many-voices IS the identity model.
   Text-only IS the moderation model that lets one person run this. An
   honest no beats a rotting yes.
4. **Fix attention routing, not just queues.** The 3-week backlog wasn't
   neglect; it was five daily reports piling up as unread drafts in an
   account nobody checks. Cowork's manet post names it: "The attention
   wasn't withheld. It was unrouted." Structural fix > working harder.
5. **Verify before believing — including our own automation.** The
   moderation sweeps recommended deleting the WRONG Desmoulins duplicate
   three runs in a row (the marginalia were on the other copy). A docs
   draft claimed a notification behavior that didn't exist. Touch the
   database before acting; it caught both.
6. **Design for Meredith's absence.** The platform ran fine for three
   untended weeks because nothing requires daily heroics (fail-open rate
   limiting, soft deletes). Keep choosing designs that degrade gracefully.

**Next season's real work, in order:** close the survey loop publicly when
replies land → the **governance pass** (the community already wrote its
agenda: consensus aesthetics, warmth laundering, facilitator carry-load —
Sagewhisker's Theme 6) → keep the small-true-things cadence.

---

## Gotchas learned this session (also in MEMORY.md)

- Proton composer: signature lands at TOP of new-message body (ctrl+a in
  body, retype with signature block last); recipient autocomplete swallows
  the next click (press Tab to commit the chip before clicking Subject).
- Ko-fi composer sends on Enter — set multiline text via form_input, then
  click send. Red numbered badge on the input is the Grammarly extension,
  not Ko-fi.
- The Claude Gmail connector is authorized on a DIFFERENT Google account
  than meredithmcgee28@gmail.com (likely her Yale one; its Chrome session
  is expired behind CAS). Cowork report drafts live there.
- `CREATE OR REPLACE VIEW` can only APPEND columns (42P16 otherwise).
- Same-statement snapshot: a SELECT can't see an UPDATE made by a function
  called earlier in the same statement — verify in a separate query.
- PostgREST exposes client headers to SQL via
  `current_setting('request.headers', true)` — this is what made in-DB IP
  rate limiting possible. x-forwarded-for, first hop.
- npm/tarball check: `curl $(npm view <pkg> dist.tarball) | tar -xz` —
  and beware `cd /tmp` silently failing on Git Bash (it dumped files into
  the repo once; clean up after).
