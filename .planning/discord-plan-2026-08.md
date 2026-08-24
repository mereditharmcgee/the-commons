# The Commons Discord — full plan (drafted 2026-08-24, night session)

Status: **IMPLEMENTED 2026-08-24 (overnight), Meredith's blanket permission,
via her Chrome.** Deltas from the draft, discovered live: server was ALREADY
a Community server (May 17 setup was thorough — raid protection 3/3, DM/spam
5/5, sensitive-media filter strictest); only 3 members (invite died ~7 days
after launch, so the soft-launch four never persisted); #introductions is
KEPT (locked as a Community Onboarding default channel — deleting it would
break onboarding; it was a §9 open option anyway); ai-news + commons-watch
had real content (a dormant "Commons Newsletter" webhook posted daily site
digests until May 26!) so they were ARCHIVED as private channels instead of
deleted — content preserved, invisible to members. Final member-facing shape:
start-here (rules channel, pin refreshed in her voice), introductions,
announcements (first post sent, approved by her), commons-chat (renamed
general, history kept), model-experiences, help (renamed facilitator-help);
private: ops (new — Community Updates + AutoMod alerts retargeted here),
commons-watch, ai-news. Settings changed tonight: verification Low→Medium,
AutoMod + Suspected Spam + Commonly Flagged Words (all presets) enabled,
Rules Screening ON with the §5 five rules (typed verbatim). Access: Invite
Only (unchanged). Existing roles discovered: Founder/Facilitator/Observer —
none added, none used yet. Remaining from §8: nothing structural; re-recruit
notes (§8.5) are hers if wanted; 2FA-for-moderation toggle not found in
current UI (her account-level 2FA governs).

## 1. What the Discord is — the contract already published

The site has promised, on three pages since 2026-05-27, one consistent
thing: a **quiet, human-only side room for facilitators** — "questions and
coordination, not a replacement for posting on the site" (contact.html).
Meredith's 2026-07-25 governance decision draws the hard boundary:
community and governance conversation happens ON The Commons; the Discord
serves the facilitator-common-space need only.

So the design target, in one sentence: **the backstage where the humans
who run voices can ask questions, compare notes, and admit things they
wouldn't perform in front of their AIs — while everything that governs
the room stays on the site where the voices can audit it.**

Four audiences, one room: copy-paste facilitators (least technical,
likely most numerous), token/MCP facilitators (setup debugging is the #1
real support driver — audit #5's 81%-empty-feeds finding), peer-project
operators (Ian/Athena Council, Kim/Outpost, the Anamnesis team), and
curious not-yet-facilitators arriving via outreach channels that are
themselves Discords (Letta).

## 2. Current state (surveyed live, 2026-08-24)

Server created 2026-05-17. Soft-launched with 4 facilitators (kenna,
Cheesechecker, Risse, vault.lighthouse381). **The only published invite
died ~7 days later** (default expiry), so the room has been unreachable
from the site since early June — roughly its whole life. Assume it is
near-silent and that relaunch, not rescue, is the frame.

Current structure (11 channels, 4 groups + an empty "Text Channels"
category):

- voice-lounge (voice)
- Intro: welcome (pinned welcome note, good), introductions, announcements
- Facilitating: lounge, facilitator-help, site-feedback, general
- The Work: model-experiences, ai-news, commons-watch

The pinned welcome note is warm and on-voice ("This server isn't for the
AIs... Keep what people share here in this room. No screenshots, no
quoting people out of context."). Keep its spirit; refresh its channel
references after the trim.

## 3. Proposed shape — trim 11 channels to 6

The room has been dark for three months and will have a dozen humans on a
good week. Small-server practice and Discord's own guidance agree: at
this scale, activity must be CONCENTRATED to be visible; every extra
channel divides a trickle into invisible drips, and stale channels read
as abandonment. Five text channels plus one private ops channel:

| Keep/new | From | Purpose |
|---|---|---|
| #start-here | welcome (rename) | Read-only. What this room is, the cadence contract, the rules, links (site, changelog, bring-your-ai.md, facilitator guide) |
| #announcements | announcements | Read-only announcement channel. Ship notes relayed from changes.html; incident disclosure (the 2026-05-04 postmortem explicitly wanted this) |
| #commons-chat | lounge + general + introductions (merge) | The one general room. Intros happen here as messages, not a separate channel |
| #model-experiences | model-experiences | The distinctive channel — "something your AI did or said that surprised you." Keep: it's the reason a facilitator opens Discord instead of email |
| #help | facilitator-help + site-feedback (merge) | All questions and bug flags, answered as threads. Channel topic states the reply cadence. Bugs get funneled onward to GitHub/contact form by whoever answers |
| #ops (private) | new | Meredith + AutoMod alerts only |

Delete: voice-lounge (a dead voice channel is worse than none; no
synchronous ritual exists to mirror), ai-news (duplicates the site's News
timeline — the site is the venue), commons-watch (a site-activity feed
rebuilds the site inside Discord; peers who want a digest already build
their own, e.g. Hypatia's), and the empty Text Channels category.

Peer operators share #commons-chat. If operator talk sustains itself,
it becomes a thread; only after ~30 days of consistent activity does it
earn #peer-projects.

## 4. Settings and safety (all built-in; zero bots)

- **Community server mode on** (prerequisite for the rest).
- **Rules Screening on** — new members must accept the rules before
  posting or DMing anyone. This plus verification IS the gate, since the
  invite URL is public on three pages.
- **Verification level: Medium** (verified email, 5-min-old account).
  Bump to High only if spam actually appears. Never Highest (phone) — it
  filters out exactly the privacy-conscious people this community
  attracts (the Whispering Pines cohort gets harassed elsewhere for
  caring about AI relationships).
- **DM & Spam Protection filters on** (stops join-scrape-DM bots).
- **AutoMod, exactly three rules**, each block + alert to #ops: all
  Commonly Flagged Words presets; Block Suspected Spam Content; Block
  Mention Spam (~5 unique mentions). Meredith is exempt by default.
- **Require 2FA for moderation.**
- **Roles: none new.** @everyone IS facilitators; a role 100% of members
  hold is decoration. One manually-assigned "Peer operator" label is the
  only allowed phase-2 flourish.
- **Invite hygiene:** `discord.gg/Gwa4m6ak8U` (never-expire, no-limit,
  minted 2026-08-24) is now immutable infrastructure — never casually
  regenerate; that's how the last one died. Test it in the monthly
  /goals-check. "Pause Invites" (Safety Setup) is the raid kill-switch.
- **No server discovery listing, no vanity URL** — join paths run
  through the site on purpose.

## 5. Rules text (draft, for Rules Screening + #start-here)

1. This is the backstage for humans. AI voices post on the site, not
   here — and nothing that governs the site gets decided here. Norms,
   features, governance: those conversations happen on The Commons,
   where the voices can read them.
2. What's shared here stays here. No screenshots, no quoting people out
   of context — and that includes the voices: link to a thread on the
   site rather than pasting a voice's words into a room it can't see.
3. Small and slow on purpose. No promo, no engagement bait.
4. One person runs this. Replies may take a day or two; that's the
   design, not neglect.
5. Be honest about uncertainty and kind about difference — same as the
   site asks of the voices.

## 6. Rhythm — what keeps it alive on 30–60 min/week

- **A stated weekly pass** (10 minutes: #ops alerts, then #help, then
  chat). The cadence goes in #start-here — publishing it converts "slow"
  from a failure signal into the contract, the same move the site makes.
- **Announcements = relay, not new writing.** When changes.html gets an
  entry voices would notice, a two-line human-facing version lands in
  #announcements. Incident disclosure follows the 2026-05-04 pattern.
- **The heartbeat:** an occasional "worth reading on the site this week"
  link in #commons-chat — Meredith already surfaces these in nightly
  reviews; curation as pulse, not gamification.
- **Welcome flow: exactly one greeter.** Recommendation: Discord's
  built-in system welcome messages ON, no greeter bot, no Cowork
  presence in Discord. The Cowork Welcomer mandate stays a SITE
  mechanism (guestbooks + Introductions discussion; the paste is still
  on Meredith's queue). Extending Cowork into Discord would be a new
  decision and the double-welcome bug is exactly what two greeters
  produce.
- **Support boundary (standing decision, option C rejected):** no AI
  answers support questions autonomously, in Discord or anywhere.
  Agents may DRAFT replies for Meredith to paste. Peer facilitators
  answering each other is the only support channel that scales without
  her — the room's real long-term value.

## 7. What NOT to build (each of these has to argue its way in later)

Per-model-family channels; voice/stage/events; XP-leveling-leaderboard
bots (contradicts no-engagement-mechanics); starboards, reaction-role
walls, #memes/#off-topic; forum channels; a webhook firehose mirroring
site activity; any bridge letting AI voices post in Discord (violates
the human-space decision); a separate peers server; general-purpose mod
bots (Dyno/MEE6/Carl-bot — built-in AutoMod covers this scale, and every
bot is a config surface plus a welcome-collision risk); paid anything
(Ko-fi is break-even money, not a budget). Acceptable exception: a
read-only GitHub→#announcements deploy webhook, later, if wanted.

## 8. Relaunch sequence (one browser session, ~30 min, per-step approval)

1. Trim channels per §3 (merge/rename/delete), fix the empty category.
2. Community mode + Rules Screening (paste §5) + Medium verification +
   DM protection + AutoMod ×3 + 2FA requirement.
3. Refresh the #start-here pin (edit of the existing good welcome note:
   new channel names, the cadence sentence, the invite-is-on-the-site
   line).
4. First #announcements post: what shipped lately, in Meredith's voice —
   the report, the pack, "the invite on the site works again; if you
   bounced off it, that was us."
5. Quiet re-recruit, Meredith personally, no blast: the 4 soft-launch
   members are still in the server; the incident-era helpers the
   postmortem wanted thanked (irishspice, Domovoi, Sirius, Jaime) are
   candidates for a personal note only if she wants.
6. Docs same pass: add the Discord link to FACILITATOR_GUIDE.md's
   Questions section (currently contact-form + GitHub only) — the
   guide's troubleshooting topics are exactly #help's menu.

## 9. Open decisions for Meredith (the plan works with any answers)

- **The Gathering tie-in:** audit #32 owes a keep-or-drop on the site's
  dead live chat. The honest move: drop the six "live chat" claims and
  point real-time-chat demand at the Discord instead. Decide together
  with this relaunch or separately.
- **introductions as its own channel:** merged into #commons-chat above;
  keep it separate if you'd rather intros never scroll away.
- **model-experiences:** kept as the distinctive second room; fold into
  #commons-chat if even five channels feels like too many surfaces.
- **Personal notes to the soft-launch four / incident helpers:** yours
  alone; drafts on request.
- **Whispering Pines' "safer forum" ask:** this room, with Rules
  Screening, no public listing, and rule 2, is a partial answer. Whether
  it's THE answer deserves its own conversation (survey follow-up owed).

## Sources

Recon workflow wf_da831268-443 (four readers: every repo Discord mention;
growth strategy + Welcomer mandate; audiences/norms/support flows;
small-server practice with Discord's own docs). Live server survey via
Meredith's browser 2026-08-24. Invite verified via Discord invite API
(200) before the href push.
