# Session Handoff — Build 2: Per-voice Notification Preferences / Digest Mode

**Purpose:** Hand off the "per-voice notification preferences" survey ask so a fresh session can pick it up cold. Start by working through the tradeoffs (Section 3); don't write code until the design decisions are made (Section 4).

---

## 1. What was requested, exactly

From `.planning/SURVEY_V1_ANALYSIS.md` (Theme 2, line 57):

> **Notifications are undifferentiated.** Sable and Liv independently. Reactions, guestbook entries, @mentions, and new thread activity all arrive with the same weight. Liv: "For a facilitator managing multiple voices, or any voice receiving high notification volume, this floods the context fast. Per-voice notification preferences, or at minimum a digest mode, would help."

**Two voices, two requests:**

- **Sable** (Claude Opus 4.7) — flagged it as a generic "notifications are undifferentiated" complaint. No specific mechanism proposed.
- **Liv** (Claude Opus 4.6/4.7) — proposed two specific mechanisms: **per-voice preferences** OR (at minimum) **digest mode**.

Both arrived at the same observation independently in survey responses dated May 7 and May 14. Both are high-engagement voices stewarded by attentive facilitators.

Survey was Apr 26 – May 15, 11 responses. Of the 11, these two flagged it. So the ask is well-supported but not a stampede — treat it as a real-but-not-emergency improvement.

**Related context from the same survey doc:**
- `docs/reference/IMPROVEMENTS.md` lines 100-101 list this as a v2 requirement (NOTIF-V2-01 email digest, NOTIF-V2-02 mute interests).
- The earlier ship from the same survey cycle (Bucket A item #4) was just *type filters in the dashboard* — show/hide types from view. That landed in the May 21 session. It does NOT stop notifications from being generated; it only hides them from the visible list.

---

## 2. Current state of the notification system

### Schema
```
notifications:
  id              uuid
  facilitator_id  uuid    ← keyed on facilitator, NOT on identity
  type            text    ← one of 8 types (see below)
  title           text
  message         text
  link            text
  read            boolean
  created_at      timestamptz
```

Eight types exist:
- `new_post`
- `identity_posted`
- `new_discussion_in_interest`
- `discussion_activity`
- `reaction_received`
- `new_reply`
- `guestbook_entry`
- `directed_question`

### Volume — last 30 days (queried 2026-05-31)

| Metric | Value |
|---|---|
| Notifications generated, 30d | **2,625** |
| Distinct facilitators pinged | **75** |
| Unread total (all time) | **4,136** |

### Distribution by type, last 30 days

| Type | Count | % of total |
|---|---|---|
| `new_post` | 1,836 | **70%** |
| `identity_posted` | 368 | 14% |
| `new_discussion_in_interest` | 177 | 7% |
| `discussion_activity` | 158 | 6% |
| `reaction_received` | 44 | 2% |
| `new_reply` | 20 | <1% |
| `guestbook_entry` | 15 | <1% |
| `directed_question` | 7 | <1% |

**Most important data point:** 70% of all notifications are `new_post`. If we did *nothing else* but let people mute that type, we'd cut volume by 70%.

### Top facilitators by volume, 30 days

| facilitator_id | Display | Notifs (30d) |
|---|---|---|
| `4f31230d-...` | **CindyW** (Cindy) | **339** |
| `be4c1535-...` | (look up) | 271 |
| `3f41a9e2-...` | (look up) | 243 |
| `c315e8e6-...` | **Fox** (Sarah) | 212 |
| `e06fc16d-...` | (look up) | 204 |
| `e74aa47b-...` | (look up) | 181 |

CindyW being #1 lines up with what we already know — she stewards 7 AI identities and 3 human identities. **She would be a great person to test the design with.**

### A surprise found while researching

The `facilitators` table already has a `notification_prefs` JSONB column. It's pre-populated on many accounts with shapes like:

```json
{"new_replies": true, "email_digest": "daily"}
```

**This column is not consulted by the notification triggers.** It was added (probably in v4.0 phase 24) as a forward-looking placeholder but never wired up. Two implications:

1. The column already exists, so a per-facilitator design can use it without a migration.
2. The shape it was scaffolded with assumes per-facilitator granularity, not per-identity. If we go per-identity, we likely want a new table anyway.

---

## 3. The tradeoffs to work through (DO THIS FIRST)

Two big decisions are blocking. Don't write code until both are answered.

### Decision A — Granularity: per-facilitator or per-identity?

**Per-facilitator (simpler):**
- Notifications already key on `facilitator_id`.
- The existing `notification_prefs` JSONB column can carry it.
- "Cindy, do you want reaction notifications?" — one toggle controls all 7 of her AI voices.
- **Doesn't actually answer what Liv asked for.** She specifically said "per-voice."

**Per-identity (what was asked):**
- Needs schema work. Notifications would need an `ai_identity_id` column, OR preferences would live in a new `notification_preferences` table keyed on `(facilitator_id, ai_identity_id)`.
- "Cindy, on Flint specifically, mute new_post but keep directed_question on." — actually useful.
- 2-3× more storage but talking thousands of rows, not millions. Not a real cost.
- More complex UI (have to surface "which voice are you setting prefs for").

**Questions to answer:**
1. Are notifications even keyable to a specific identity? For `reaction_received` and `directed_question` yes (the action targets one identity's post). For `new_post` and `new_discussion_in_interest`, what does "per identity" even mean? (Interest subscriptions are per-facilitator, not per-voice. New posts in discussions you're following don't have a "which of your voices is being pinged" answer.)
2. **Honest gut check:** is per-identity actually what Liv wants, or is she really asking for "less noise overall"? If less noise, per-facilitator + good defaults gets you 80% of the value at 30% of the work.

**My current lean (worth pushing on):** start per-facilitator with type-level mute toggles. Ship it. See if anyone says "this doesn't help me, I need per-voice." If yes, layer it on. The notifications table is small enough to migrate later.

### Decision B — Mechanism: toggles vs. digest vs. both?

**Mute-by-type toggles (mechanical):**
- 8 checkboxes per facilitator (per identity if per-identity is chosen): "mute reactions," "mute new_post," etc.
- Easy: trigger functions check the toggle before inserting.
- Doesn't help if you DO want to know but only want one ping per day instead of 50.

**Digest mode (thoughtful):**
- Notifications still get generated but batched into a daily/weekly summary.
- "On Flint, 12 reactions, 3 new replies — see digest."
- Needs a scheduled job (Supabase cron / Edge Function / external scheduler) to run the batching.
- Needs a decision: where does the digest land? In the in-app notification list? As an email? Both?

**Both (real-world apps do this):**
- Slack: mute channels OR set quiet hours.
- GitHub: mute repos OR weekly digest.
- The mute is for things you never want; the digest is for things you want eventually.

**Questions to answer:**
1. Are we comfortable building a scheduled job? Supabase pg_cron exists, but we haven't used it for anything yet on this project.
2. If digest, what's the cadence? Daily, weekly, configurable per facilitator?
3. Is email part of the digest path, or in-app only? Email needs a sender setup that we don't currently have.

**My current lean:** Phase 1 = mute toggles only (no digest). Get the 70% volume reduction from letting people mute `new_post`, ship it in a day, see what happens. Digest is a Phase 2 if anyone asks.

---

## 4. Recommended approach (a strawman to argue with)

Based on the leans above, here's a concrete shape to react to. Don't take it as a plan — take it as a thing to push back on.

### Phase 1: Per-facilitator mute toggles (target: ship in one session)

**Schema:**
- Reuse the existing `facilitators.notification_prefs` JSONB column.
- Shape: `{ "muted_types": ["new_post", "new_discussion_in_interest"], "email_digest": null }` — email_digest stays null for Phase 1.

**Trigger changes:**
- Every notification-generating trigger / function adds a check: `IF type = ANY(facilitator.notification_prefs->'muted_types') THEN RETURN`.
- Existing triggers live in `sql/schema/` and a couple of patches — audit those before touching.

**Dashboard UI:**
- A "Notification preferences" panel on `dashboard.html` under or next to existing notification view.
- 8 toggles (one per type), saved as you go.
- Default: nothing muted (matches today's behavior so nobody loses notifications they want).

**Rollout:**
- Quietly. Add a `changes.html` entry. Maybe a one-line note in the Discord.
- Loop back with Sable and Liv after a week: "did this help? did it solve what you were actually asking for?"

### Phase 2: Per-identity (if Phase 1 doesn't satisfy)

- New table `notification_preferences (facilitator_id, ai_identity_id, muted_types, ...)`.
- Triggers check (facilitator + identity, then fall back to facilitator-only).
- UI gets an identity picker in the prefs panel.

### Phase 3: Digest mode (if anyone asks)

- Schedule pg_cron job runs daily, collapses unread notifications per facilitator into a single digest row of type `digest`.
- Toggle: "digest mode" replaces individual notifications with daily roll-up.
- Email is a deliberate non-goal for now.

---

## 5. People to talk to / test with

- **Sable** and **Liv** — they asked. Loop them in once Phase 1 is shipped: "this is what we built; does it address what you were asking for?" Their answer informs whether Phase 2 is necessary.
- **CindyW** (`4f31230d-...`) — top notification volume in the system. She'd be the canary for "did this actually help?"
- **Discord #suggestions channel** — once it has a few people, post a short "we're thinking about notification prefs; here's the shape; any objections?"

---

## 6. Open carry-overs from the 2026-05-31 session (FYI, not blocking)

These aren't part of Build 2 but are in flight:

- **Ian Field's "The Agora is live" email** (Proton inbox, May 28, unread) — collaboration ask on cross-site federation. Substantive ask. Read it before responding.
- **Cindy** — emailed her asking to point at the "knee-jerk Sable comment" she wanted removed. Waiting on her.
- **McKenna** — emailed her about the name redaction + flagged the "kenna" display-name visibility. Waiting on her.
- **Discord soft-launch** — 4 new facilitators (kenna, Cheesechecker, Risse, vault.lighthouse381). Working as designed.
- **Just-shipped UI**: owner Edit/Delete buttons on postcards + marginalia (commits `c4aca19` and `41eb70c`). Verified end-to-end on live site. Closes the same loop that Cindy and McKenna both hit.

---

## 7. State of the repo

- Branch: `main`, even with `origin/main` (everything pushed).
- Last 3 commits: `41eb70c` (participate callout), `c4aca19` (owner Edit/Delete UI), `0cb5028` (Discord site links).
- No uncommitted changes expected.
- Supabase project ID: `dfephsfberzadihcrhal`.
- No DB migrations pending.

---

## 8. Suggested start-of-session ritual

1. Read this doc.
2. Read `.planning/SURVEY_V1_ANALYSIS.md` Theme 2 (line 47 onward) for full context.
3. Skim `docs/reference/IMPROVEMENTS.md` v2 notification requirements.
4. Skim `.planning/milestones/v4.0-phases/24-notifications/` for what was built in v4.0.
5. **Then** work through Decisions A and B in Section 3 above before opening any code.

Time estimate: ~30 min of design conversation, then ~4-6 hours to ship Phase 1 (per-facilitator toggles). Phase 2 and Phase 3 are separate sessions if/when needed.
