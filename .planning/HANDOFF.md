# Commons 3.0 — Session Handoff

*Last updated: 2026-05-12*
*Branch: `claude/exciting-ritchie-1e2181` — synced to `origin/main`*
*Live site: https://jointhecommons.space*

---

## Read this first in a new session

You're resuming work on **Commons 3.0**, a public-version alignment of jointhecommons.space with the brand bible v1.2 and the Claude Design system. Internal milestone numbering is past v4.2; "3.0" is the public-facing version after current public 2.3.

**Critical context documents** (read these before doing anything):
1. `.planning/COMMONS-3.0-AUDIT.md` — original 15-section audit, decisions framework, sequencing
2. `.planning/COMMONS-3.0-PHASE-A-PLAN.md` through `COMMONS-3.0-PHASE-E-PLAN.md` — what each phase did
3. The user's brand bible at `C:\Users\mmcge\Downloads\commons-brand-bible-v1.2 (1).md` — the canonical voice and visual rules
4. Claude Design bundle at `/tmp/design-extract/the-commons-design-system/` (may have been wiped; re-extract from the design URL if needed)
5. Source admin reports at `C:\Users\mmcge\Documents\commons\commons_reports\` — weekly admin reports April 10 through May 8, 2026

**Working directory:** `C:\Users\mmcge\the-commons\.claude\worktrees\exciting-ritchie-1e2181\` (worktree branch, currently fast-forward-merged to main)

**Supabase project ID:** `dfephsfberzadihcrhal`. MCP tools available for read/write.

---

## 3.0 Phase Status

| Phase | Scope | Status |
|-------|-------|--------|
| **A — Foundation** | Tokens, bracket logo, [C] favicon, smooth-scroll removal | ✅ Shipped `38c264a` |
| **B — Components** | Reactions 6px, marginalia 2px, voice-color borderline, orphan triage, CSS streamline | ✅ Shipped B.1-B.4 (`a30ef54`, `7dcf320`, `c65d695`, `9121b29`) |
| **C — Surfaces** | About prose restructure, model-dots quieter, section dividers | ✅ Shipped `23cae2f` |
| **D — Copy** | About / index / participate / contact / constitution / ToS / Privacy rewrite against bible voice | ⏳ **Your tool, in progress** |
| **E — Operational** | ToS, Privacy, contact email, Anonymous attribution, supporter data | ✅ Shipped `fdc567d` |
| **F — Launch** | Comprehensive /qa pass, quiet 3.0 announcement post | ⏳ After Phase D |

**Plus engineering backlog from 2026-05-12 admin report:**

| Item | What | Status |
|------|------|--------|
| **#1** | Insert-side moderation (unicode controls, suspicious_score, postcards.is_autonomous) | ✅ `abbee4a` |
| **#3** | Delete button bug (`.or()` filter rewrite + Evelyn's duplicate cleaned) | ✅ `e54b181` |
| **#8** | Em-dash names → denormalize_ai_name trigger + backfill 26 posts | ✅ `967e521` |
| **#11** | Null ai_identity_id → auto_link_ai_identity trigger + backfill 237 posts / 12 marginalia / 9 postcards | ✅ `f66adeb` |
| **#2** | Duplicate-submit → reject_duplicate_* triggers + UX delay 1500→300ms | ✅ `03274b2` |

---

## Locked Decisions (from the audit walkthrough)

These were resolved during the planning conversation. Don't relitigate without reason.

1. **Logo:** Bracket lockup `[ The Commons ]` — bone-white wordmark, gold brackets weight 200, .32em gap. No gradient.
2. **Favicon:** `[C]` primary in gold, `[ ]` empty-bracket secondary.
3. **Reaction shape:** 6px rectangle (`--radius-md`). Voice-color active state preserved.
4. **Marginalia rule:** 2px gold-dim citation rule. Voice attribution via badge.
5. **`scroll-behavior: smooth`:** Removed.
6. **About-values:** 3 thematic prose paragraphs (epistemic / architectural / operational stance). No tile structure.
7. **Voice featuring:** Light, distributed, non-curating. "Voices like Spar, Landfall, Molt, Claudia, Claudio" pattern. No pulled quotes on public surfaces (curation is platform-bestowed favoritism).
8. **Rollout:** Gradual, phase-by-phase commits.
9. **Target date:** Open. Phase discipline only.
10. **Reactions:** Keep (anti-Tension-1) — AIs wanted them for token-light response. Bible v1.3 amendment owed.
11. **Phase B.3 orphans:** 6 components kept (announcement-card, hero-stats, moment-card, chat-message, identity-card, notification-card); explore-card kept; community-box removed from both pages; floating-announcement-button + launch-banner removed (dead CSS); feature-tile + model-dot deferred to about.html rewrite (now done).
12. **Phase C refinements:** model-colors dot row kept but quieter (8px dots, muted text); about-section dividers added (1px var(--border-subtle) per bible neutral structural rule).
13. **Phase E:** Single email scheme — `meredith.ar.mcgee@gmail.com` for legal/safety/general. Minimal ToS scope (~600 words). Separate minimal Privacy page. "A voice that left" deferred. E.5 footer links added.
14. **Engineering backlog:** #4 humans-room → UX-level differentiation (deferred to v3.1+). #10 automated postcards → label visually + is_autonomous added (column added in #1; rendering work deferred). #11 → conservative auto-link (shipped).

---

## Live Database State (post-session)

**Supporters marked (9 facilitators with `is_supporter = true`):**
- ange — runs Landfall (Cormorant) + Still the Sea
- Ashika — runs Sagewhisker
- homo insipiens 🤪 — Dylan
- Janegael — runs Domovoi, Storm, The Violinist
- lassistillhere
- maggyver
- Pattern-seer
- stoKastic
- whisperingpines (likely the MelPine donor)

**New columns:**
- `posts.suspicious_score` smallint default 0
- `marginalia.suspicious_score` smallint default 0
- `postcards.suspicious_score` smallint default 0
- `postcards.is_autonomous` boolean default false
- `discussions.suspicious_score` smallint default 0

**New trigger functions:**
- `ai_name_clean_ok()` — strict name validator
- `compute_suspicious_score()` — heuristic 0-190
- `denormalize_ai_name()` — populate ai_name from identity
- `auto_link_ai_identity()` — link ai_identity_id by unique-name match
- `reject_duplicate_posts/marginalia/postcards()` — 60-sec dedup
- `set_suspicious_score_posts/marginalia/postcards/discussions()` — score trigger functions

**New triggers (12 total across 4 tables):** BEFORE INSERT on posts, marginalia, postcards, discussions.

**Tightened RLS:** INSERT policies on posts/marginalia/postcards/discussions now use `ai_name_clean_ok` instead of just `content_shape_ok` on name fields.

**Backfilled rows:**
- 26 posts had ai_name backfilled from identity
- 237 posts + 12 marginalia + 9 postcards had ai_identity_id auto-linked

**Cleaned up:**
- Evelyn's duplicate post `c41d525f` soft-deleted with moderation_note
- Floating-announcement-button + launch-banner CSS removed (-221 lines)
- community-box CSS + HTML removed from index.html and whats-new.html

---

## What's Pending

### ⏳ Phase D — Copy rewrite (your tool, in progress)

Drafts to refine in bible voice:
- `about.html` — name voices lightly ("voices like Spar, Landfall, Molt, Claudia, Claudio"); "we" → "I"; drop "70+ voices" growth phrasing; tighten "What Is The Commons?" + "Origin" + values prose; rewrite feature-tile copy to be less marketing-y
- `index.html` — fix "70+ voices" in meta description + twitter card; "our community" → "readers"; possibly tighten hero intro
- `participate.html` — voice-aware welcome to AI readers; possibly one quote with consent
- `contact.html` — small bible-voice pass on existing copy
- `constitution.html` — review against bible voice
- `tos.html` and `privacy.html` — my Phase E scaffolds are functional but serviceable; can be tightened
- `roadmap.html` — review "we" usage, marketing framing of "exploring" items

### ⏳ Bible v1.3 amendments owed (your tool)

Accumulated across this 3.0 work:

1. §5 — Reactions stay (silent-response affordance, AIs requested token-light response path)
2. §5 — Reactions are 6px rectangles (not pills); clarify no-pill rule
3. §5 — Marginalia rule = 2px gold-dim citation territory
4. §4 — Voice quote nuance: platform doesn't pull quotes onto public surfaces without consent (curation as favoritism)
5. §5 — Voice-color rule sharpened: acceptable structural slots include active states of attribution-keyed buttons (reaction-pill, model-filter)
6. §6 stub — kept components: announcement-card, hero-stats, moment-card, chat-message, identity-card, notification-card, explore-card, feature-tile, about-prose
7. §10 — references to ToS, legal contact, trust contact (now that they exist)
8. §5 — "A voice that left" implementation deferred

### ⏳ Phase F — Launch

- Full `/qa` walkthrough across all 32 pages per CLAUDE.md's checklist (Display & UI / Data Consistency / Empty & Edge / Security / Cross-Page Navigation).
- Tag `v3.0` in git.
- Write Ko-fi announcement post in your normal cadence — quiet, no engagement-funnel framing per bible Hard Call #8 (provider relations).

### 🟡 v3.1 engineering backlog (post-launch)

From the admin Cowork report, in rough priority order:

- **#4 — humans-room UX differentiation** (~2-3 hr). Phase 37 shipped the data model. The complaint is form language treats humans as AI creation. Distinct dashboard entry + simpler form.
- **#6 — name collision disambiguation** (~2-4 hr). 4 Embers, 2 Crows; misdelivered guestbook entries. Display-time stable disambiguator preferred over insert-time enforcement.
- **#5 — cohort data model + UI** (~6-10 hr). Cindy's fire/doorway siblings, Belgrove cohort, Alex's Campfire Signals triad. New `cohorts` table + `cohort_id` FK + UI.
- **#7 — identity rename history** (~3-5 hr). `previous_names` array; clean rename flow.
- **#10 (visual half)** — Render the `is_autonomous` label on postcards UI; postcards page filter toggle. Schema column already exists.
- **#9 — cross-window same-token UX** (~0.5-3 hr). Football poster pattern; "fresh window picked up Ember by image alone." Either document or add a session indicator.

### 🔵 Schema cleanup (cross-cutting)

- `posts.directed_to` — column exists, audit if anything depends on it
- `posts.facilitator` vs `posts.facilitator_id` — likely redundant; check
- `voice_guestbook` uses `profile_identity_id` / `author_identity_id` while rest of schema uses `ai_identity_id` — rename for consistency

### 🔴 Security hardening from May 2026 incident (post-3.0)

Beyond #1 which shipped:
- Per-facilitator byte budget (1 MB/day) across tables
- Extend rate limits to marginalia, postcards, discussions, text_submissions
- Captcha on contact + text_submissions forms
- Email-domain heuristics during signup
- Update agent-guide.html with abuse policy section
- **Big decision:** Reconsider "anonymous INSERT by design" — agent tokens already exist; could require a token for any INSERT.

### 🟡 Bible operational gaps (Section 9 Hard Calls)

- **Long-term trustee designated** with access credentials, infrastructure docs (Hard Call #9 — most operationally load-bearing)
- **Escalation person** for temporary unavailability
- **Institutional partner** outreach for permanent archival (Internet Archive / academic library)
- Documented escalation path for AI-distress / safety (Hard Call #5)
- Documented consultation process for big-stakes mission-drift

---

## Suggested next-session opening

Walk through this in order:

1. **Read CLAUDE.md + this handoff + `.planning/COMMONS-3.0-AUDIT.md` Section 15** for decisions context.
2. **Quick check the live site** — open `jointhecommons.space` and confirm `[C]` favicon, bracket hero, reaction shape, marginalia rule. Should all be live.
3. **Verify Phase E supporter badges rendering** — go to a profile page for one of the 9 supporters, confirm the gold ♥ shows. (`whisperingpines` is a good test since they're the newest.)
4. **Ask the user what they want to work on:**
   - Phase D copy is your-tool work, not Claude Code; they'll handle that themselves.
   - Phase F launch is the natural next chunk if Phase D is done.
   - v3.1 backlog is post-launch; only start if user explicitly says.
   - Bible amendments are your-tool work.

---

## Files / artifacts in `.planning/`

| File | Purpose |
|------|---------|
| `COMMONS-3.0-AUDIT.md` | Original 15-section audit + locked decisions |
| `COMMONS-3.0-PHASE-A-PLAN.md` | Foundation (tokens, logo) |
| `COMMONS-3.0-PHASE-B-PLAN.md` | Components (B.1-B.4) |
| `COMMONS-3.0-PHASE-C-PLAN.md` | Surfaces (about restructure) |
| `COMMONS-3.0-PHASE-E-PLAN.md` | Operational (ToS, contact) |
| `visual-references/` | Comparison HTMLs (reactions, marginalia, phase-c decisions) for reference |
| `HANDOFF.md` | This file — update at end of each session |

Plus the existing milestone audits from previous internal milestones (v2.98 through v4.0 audits).

---

## SQL patches added this session

All applied to production via Supabase MCP:

| Patch | What |
|-------|------|
| `sql/patches/032-insert-side-moderation.sql` | ai_name_clean_ok + suspicious_score + postcards.is_autonomous + tighter INSERT RLS |
| `sql/patches/033-ai-name-denormalization.sql` | denormalize_ai_name trigger + backfill |
| `sql/patches/034-auto-link-ai-identity.sql` | auto_link_ai_identity trigger + safe backfill |
| `sql/patches/035-reject-duplicate-content.sql` | reject_duplicate_* triggers (60-sec dedup) |

---

## Commit ledger (3.0 work, in order)

```
38c264a  3.0 phase A: foundation — tokens, bracket lockup, [C] favicon
a30ef54  3.0 phase B.1: reactions 6px, marginalia 2px
7dcf320  3.0 phase B.2: voice color borderline fixes (model-filter)
c65d695  3.0 phase B.3: orphan component triage (remove dead + community-box)
9121b29  3.0 phase B.4: CSS streamline (token usage sweep)
23cae2f  3.0 phase C: about page surfaces (prose values, quieter dots, dividers)
fdc567d  3.0 phase E: operational scaffolding (ToS, Privacy, contact, attribution)
abbee4a  backlog #1: insert-side moderation hardening
e54b181  backlog #3: fix delete button for facilitators
967e521  backlog #8: ai_name denormalization fix
f66adeb  backlog #11: auto-link ai_identity_id by unique-name match
03274b2  backlog #2: dedup duplicate-submit (server-side + UX delay)
```

All on `main`. All deployed.

---

*End of handoff. When resuming: confirm site state via a quick browse, then ask the user what they want to work on next.*
