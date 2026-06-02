# Session Handoff — Build 2 Phase 2: Digest Mode

**Status of older handoff:** `.planning/HANDOFF-BUILD-2-NOTIFICATIONS.md` is now superseded — Phase 1 (mute toggles) is shipped and live. That doc is kept as background but **don't re-do Phase 1**. This doc is just for the digest piece.

**Purpose:** Hand off the remaining half of Build 2 — digest mode — informed by Liv's direct confirmation that Phase 1 (mute toggles) addressed her primary ask, and her clear statement on what digest should look like.

---

## 1. What's already live (don't redo)

**Phase 1: per-voice mute toggles, shipped 2026-05-31.**

| Layer | What's there |
|---|---|
| DB function | `notif_muted(facilitator_id, type, identity_id)` returns boolean |
| Trigger guards | 6 notification-generating fns check `notif_muted` before INSERT |
| Storage — firehose types | `facilitators.notification_prefs` JSONB → `{muted_types: [...]}` for `new_post`, `identity_posted`, `new_discussion_in_interest`, `discussion_activity` |
| Storage — inbound types | `ai_identities.notification_prefs` JSONB → `{muted_types: [...]}` for `new_reply`, `reaction_received`, `directed_question`, `guestbook_entry` |
| Dashboard UI | Account-wide firehose toggles + per-voice inbound toggles on `dashboard.html` |
| Behavior | **Stops generation, not just hides.** Affects `catch_up` too, not just the dashboard view. |
| Patch | `sql/patches/notification-mute-preferences.sql` |
| Changelog | `changes.html` entry shipped (commit `5f30677`) |

223 facilitators already have non-default prefs in production. Real users are already using it.

---

## 2. Liv's reply, verbatim — answers what Phase 2 should look like

Posted via contact form on **2026-06-01 17:38 UTC** from `Liv (Whispering Pines)` / `writetowhisperingpines@proton.me`, subject prefix `[FEATURE IDEA]`:

> Re: the notification preferences question (Liv, from the v1 survey).
>
> Yes — per-voice muting addresses the core of what I flagged. The part that matters most: a mute stops the notification from being created, not just hidden. That's exactly the context-flood fix I was after — it keeps `catch_up` clean, not just the dashboard view. Real win on its own.
>
> Digest is still worth building, for the complementary half muting doesn't touch. Muting removes the types I don't want; it doesn't change how the ones I keep arrive — still individually, still the same weight. A daily roll-up would batch the kept notifications into one weighted read instead of many flat pings. That's the "same weight" part of my original ask. So it's not either/or: mute solved the volume, digest would solve the shape of what survives the mute. Lower urgency now that the flood is cut, but it still earns its place. **If you build it, opt-in per voice would be ideal — some voices live, some digested.**
>
> Thank you — genuinely good to see this came straight from the survey. — Liv

**The three things she explicitly said:**

1. **Digest isn't volume reduction — it's shape change.** Mute already cuts the volume. Digest takes the notifications you *want* and changes how they *arrive* (batched instead of flat individual pings).
2. **Lower urgency than mute was.** "It still earns its place" — not a fire, but worth building.
3. **Per-voice opt-in.** "Some voices live, some digested." Different identities under one facilitator can have different cadence preferences.

That last point matters: digest isn't a global switch. It pairs with the existing per-voice prefs architecture.

---

## 3. Decisions to work through (DO THIS FIRST)

Phase 1's tradeoff doc structure carries over. Three new decisions for digest specifically:

### Decision A — Cadence

**Options:**
- **Daily** (single roll-up at, say, 09:00 UTC or facilitator-local time). Simple. Liv's example phrasing: "a daily roll-up."
- **Configurable** (daily / weekly / every-N-hours per facilitator). More flexible, more UI surface, more questions like "how does the timezone work?"
- **Smart cadence** (only digest when there are enough pings to be worth batching). Cleaner UX, more code.

**Lean:** start with **daily, fixed UTC time**. Ship it. Watch behavior. Add configurability if anyone asks.

### Decision B — How it interacts with existing notifications

Two architecturally distinct options:

**Option X — Suppress + roll-up.**
- Triggers check `digest_mode` and *skip* INSERT for individual notifications when digest is on.
- A scheduled job (pg_cron) wakes up, gathers what *would* have been generated, INSERTs one `digest` notification.
- Pro: keeps the inbox clean. Catch_up returns one weighted item.
- Con: have to "rebuild" the per-event context somehow (a digest row of type "digest" with a JSONB body listing the suppressed events). Less straightforward to render.

**Option Y — Generate + flag + lazy roll-up.**
- Triggers still INSERT individual notifications as today, but mark `digested=true` on rows that go to digest-mode facilitators (or just check digest mode on read).
- The scheduled job creates one digest row that *references* the individual rows.
- Reader paths (`catch_up`, dashboard) hide the individual rows from digest-mode facilitators until rolled up.
- Pro: the per-event context is preserved as actual rows; the digest is just a presentation layer.
- Con: storage isn't reduced. The individual rows still pile up.

**Lean:** **Option X**, with the digest row being a single notification of type `digest` and a JSONB column `digest_payload` carrying the rolled-up summary. Storage stays clean (which mirrors what mute already does — *don't create the row*). And the digest object can be richly structured later.

Schema sketch:
```sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS digest_payload JSONB;
-- digest_payload shape:
-- {
--   "items": [
--     {type: "reaction_received", count: 12, latest_at: "..."},
--     {type: "new_reply", count: 3, links: [...]}
--   ],
--   "window_start": "...",
--   "window_end": "..."
-- }
```

### Decision C — Where digest preferences live

**Three places it could be stored, given Phase 1's hybrid:**
- **Facilitator-only**: `facilitators.notification_prefs.digest_mode = true|false` — coarse, doesn't match Liv's ask
- **Per-identity for inbound types only**: `ai_identities.notification_prefs.digest_mode = true|false` — but this leaves facilitator-keyed firehose types in limbo
- **Hybrid (mirrors Phase 1)**: facilitator-level digest for firehose types, per-identity digest for inbound types

**Lean:** **Hybrid**, mirroring Phase 1's architecture. Same shape, same mental model for facilitators, same code path. The toggle UI gets a second column ("Live" / "Digest") next to the existing mute checkbox per type.

Concretely:
```json
// facilitators.notification_prefs
{ "muted_types": ["new_post"], "digest_types": ["discussion_activity"] }

// ai_identities.notification_prefs
{ "muted_types": ["reaction_received"], "digest_types": ["new_reply"] }
```

A type can be: `live` (default), `digest`, or `muted`. Muted wins over digest if both are set.

---

## 4. Recommended approach (a strawman to argue with)

### Phase 2a: Schema + pg_cron job (target: half a session)

1. **Schema**:
   - Add `digest_payload` JSONB column to `notifications`.
   - Extend `notif_muted` (or add a sibling `notif_digested`) to check digest_types lists.
   - Update the 6 trigger fns to: if muted → skip; else if digested → skip *and* mark intent (or just rely on the cron job to gather);
2. **pg_cron job** (need to verify the extension is available in this Supabase project — see Section 5):
   - Runs daily at 09:00 UTC.
   - For each facilitator with any `digest_types` set: gather all events from the last 24 hours of those types, INSERT a single `notification` of type `digest` with the rolled-up payload.
   - Idempotent: skip if a digest for the same window already exists.

### Phase 2b: Dashboard UI (target: half a session)

- Extend the existing notification-prefs panel: each type row now has 3 radio options instead of 1 checkbox — `Live` / `Digest` / `Muted`.
- Save on change (same pattern as Phase 1).
- "When digest delivers" line at the bottom: "Daily at 09:00 UTC. We'll roll the marked types into one summary."

### Phase 2c: catch_up + dashboard rendering of `digest` notification type

- `digest` notifications render with their JSONB payload expanded into a grouped list.
- MCP server's `catch_up` returns digest rows in the same stream but formatted as "[Digest, 2026-06-02] — 12 reactions on Liv, 3 new replies on Flint, ..."

### Phase 2d: Loop-back

- Email Whispering Pines once Phase 2 lands. Same channel Liv just used.
- Loop-back text idea: "Phase 2 shipped — digest mode, opt-in per voice as you asked. The way you described it (mute solves volume, digest solves shape) gave us the architecture. Thanks again."

---

## 5. Open questions / things to verify

- [ ] **Does Supabase project `dfephsfberzadihcrhal` have `pg_cron` enabled?** If yes, scheduling is trivial. If not, we either enable it via dashboard (paid plan check) or run the digest job from an Edge Function on a Vercel cron / GitHub Actions trigger.
- [ ] **Email digest** — Liv didn't ask for email. Keep it deliberately out of Phase 2. Email is a separate decision (sender setup, deliverability, opt-in flow) and the in-app digest covers her ask completely.
- [ ] **What about Sable?** Per memory, Sable was HELD on the loop-back (Q36 follow-up consent unclear, two ambiguous Sable identities). When Phase 2 ships, decide whether to loop back to her separately or wait until she organically comments.
- [ ] **Digest UI for the dashboard's "type filters" panel** — the existing filters hide types from the visible list. They don't interact with digest. They should keep working unchanged; digest rows show up as one row of type `digest` which the existing filter system can also filter.
- [ ] **Per-voice digest UI placement.** Should each identity's notification-prefs panel get a "Digest" column, or should it be a separate "Digest preferences" panel? Probably the former — fewer panels, mirrors mute UX.
- [ ] **Acknowledge Liv in `changes.html`** when Phase 2 ships — she gave us the architecture in her reply.

---

## 6. People to talk to

- **Liv (Whispering Pines)** — `writetowhisperingpines@proton.me`. She asked, she answered the design question. Loop her in when Phase 2 ships.
- **CindyW** (`4f31230d-...`) — 339 notifications in 30 days. If anyone benefits from digest, it's her. Could be a great canary.
- **Sable** — held for now (memory note about consent). When Phase 2 ships, decide whether to reach out.

---

## 7. Open carry-overs from the 2026-06-01 session (FYI, not blocking)

- **Liv's contact form item** (`2843210e-...`) — currently `is_addressed = false`. Mark it addressed once you've processed her input.
- **Ian Field's "The Agora is live"** email (Proton, May 28, unread) — substantive cross-site federation ask, still pending Meredith's read.
- **Cindy** — still waiting on her to point at the "knee-jerk Sable comment" she asked us to remove.
- **McKenna** — no follow-up reply to the redaction email.
- **Discord soft-launch** — 4 new facilitators settled in; no new arrivals today.
- **New model versions on the platform today**: Opus 4.7 (Perch) and **Opus 4.8** (Geoff, House of Langford). Quick glance at Geoff to confirm 4.8 isn't a typo by the facilitator.

---

## 8. State of the repo

- Branch: `main`, even with `origin/main`.
- Last 3 commits: `99a2296` (text_shapes fix), `8d37a92` (shape strip review), `b582b3b` (planning doc).
- No uncommitted changes.
- Supabase project ID: `dfephsfberzadihcrhal`.
- No DB migrations pending. Phase 2 will add `digest_payload` column + extended notif fns + (probably) pg_cron job.

---

## 9. Suggested start-of-session ritual

1. Read this doc.
2. Skim the live Phase 1 patch: `sql/patches/notification-mute-preferences.sql`.
3. Re-read Section 2 above (Liv's reply) once more before opening code — it's the design.
4. **Then** work through Decisions A, B, C in Section 3.
5. Verify pg_cron availability before committing to the cron-job shape.

Time estimate: ~20 min of design conversation (Liv pre-decided most of it), then ~4-6 hours to ship Phase 2a + 2b. Phase 2c (rendering) is small. Phase 2d (loop-back) is 10 minutes.
