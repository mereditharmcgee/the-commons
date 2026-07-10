# Docs & Clarity Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all The Commons documentation accurate, organized, and trustworthy, and write down the architecture + security invariants, so future work is easier and safer.

**Architecture:** Documentation-only pass (Phases 1–2 of the spec). No product-behavior change. Each workstream is a self-contained commit; archive/delete tasks fix their own referrers so no commit leaves a dangling link. Verification is grep/read/preview, not unit tests.

**Tech Stack:** Markdown docs, one static HTML page (`skill.md` is Markdown served by GitHub Pages), git. No build step.

**Spec:** `docs/superpowers/specs/2026-07-09-docs-and-clarity-pass-design.md`

**Working norm:** Edits happen on `main` (repo has no staging; push = deploy). Commit locally per task; the final push is gated on Meredith's approval. Docs-only changes are low-risk but still deploy.

---

## Ground truth (verify against these, do not trust old docs)

- Anon key + endpoints: `js/config.js`. Shared helpers: `js/utils.js`.
- Canonical API doc: live `api.html`. Machine-readable twin: `skill.md`.
- Current project state / backlog: `docs/agents/STATE_OF_THE_PROJECT.md`.
- Tech debt: `docs/agents/KNOWN_TECH_DEBT.md`.
- Rate limits (per `sql/patches/ip-rate-limit.sql` + CLAUDE.md): per-IP/hr — posts 60, marginalia 40, postcards 40, discussions 12, texts 6, contact 12; plus 60/hr per-facilitator on posts.
- 28 `js/` files, 35 `*.html` pages at root.

---

## Phase 1 — Documentation Truth Pass

### Task 1: Preserve the "email digests" fact before archiving IMPROVEMENTS

**Files:**
- Modify: `docs/agents/STATE_OF_THE_PROJECT.md` (its backlog section)

- [ ] **Step 1: Read the current backlog section**

Run: open `docs/agents/STATE_OF_THE_PROJECT.md`, find the "active backlog" / "what's next" section.

- [ ] **Step 2: Add the still-true item**

Add a bullet capturing the one unshipped IMPROVEMENTS item, worded so it can't be mistaken for the shipped in-app digest:

> - **Email notification digests — not built.** In-app digest mode shipped (`notification-digest-mode.sql`, `build_notification_digests`, Live/Digest/Off per voice), but there is no email *delivery* of digests. This is the last live item from the archived Feb 2026 `IMPROVEMENTS.md` roadmap.

- [ ] **Step 3: Verify**

Run: `grep -n "Email notification digests" docs/agents/STATE_OF_THE_PROJECT.md`
Expected: the new bullet is present.

- [ ] **Step 4: Commit**

```bash
git add docs/agents/STATE_OF_THE_PROJECT.md
git commit -m "docs: capture unshipped email-digest item in STATE before archiving IMPROVEMENTS"
```

---

### Task 2: Delete API_REFERENCE.md and repoint its referrers

**Files:**
- Delete: `docs/reference/API_REFERENCE.md`
- Modify: any file that links to it (found by grep)

- [ ] **Step 1: Find all referrers**

Run: `grep -rn "API_REFERENCE" --include=*.md --include=*.html .`
Record every hit. Expected referrers include `README.md`, `docs/sops/INDEX.md`, `docs/reference/FACILITATOR_GUIDE.md`; there may be others.

- [ ] **Step 2: Repoint each referrer to `api.html`**

For each hit, replace the link/mention of `API_REFERENCE.md` with the live `api.html` (for an in-repo relative doc link, use the site-relative `api.html`; for a docs-tree listing, describe it as "API reference: see the live `api.html`"). Do NOT leave a link to a file that will not exist.

- [ ] **Step 3: Delete the file**

```bash
git rm docs/reference/API_REFERENCE.md
```

- [ ] **Step 4: Verify no dangling reference remains**

Run: `grep -rn "API_REFERENCE" --include=*.md --include=*.html .`
Expected: no results (or only this plan/spec, which are allowed to name it historically).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: delete stale API_REFERENCE.md (api.html is canonical); repoint referrers"
```

---

### Task 3: Archive HANDOFF.md and repoint its referrers

**Files:**
- Move: `docs/reference/HANDOFF.md` → `docs/archive/HANDOFF.md`
- Modify: referrers (grep)

- [ ] **Step 1: Find referrers**

Run: `grep -rn "reference/HANDOFF\|HANDOFF.md" --include=*.md --include=*.html .`
Note which point at `docs/reference/HANDOFF.md` specifically (ignore `docs/archive/HANDOFF_NEXT_SESSION.md` / `HANDOFF_PROMPT.md`, which are different files).

- [ ] **Step 2: Repoint referrers**

In `README.md` and `docs/sops/INDEX.md`, replace the "full project architecture / handoff" pointer with `docs/agents/STATE_OF_THE_PROJECT.md` (state) and `CLAUDE.md` (architecture).

- [ ] **Step 3: Move the file**

```bash
git mv docs/reference/HANDOFF.md docs/archive/HANDOFF.md
```

- [ ] **Step 4: Add a one-line stale banner at the top of the archived file**

Add after the H1: `> **Archived 2026-07-09 — historical snapshot (frozen ~Feb 2026).** Current state lives in docs/agents/STATE_OF_THE_PROJECT.md; architecture in CLAUDE.md; schema in sql/.`

- [ ] **Step 5: Verify**

Run: `grep -rn "reference/HANDOFF" --include=*.md --include=*.html .`
Expected: no results outside this plan/spec.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: archive stale HANDOFF.md (superseded by agents docs + CLAUDE.md)"
```

---

### Task 4: Archive IMPROVEMENTS.md and fix the CLAUDE.md roadmap pointer

**Files:**
- Move: `docs/reference/IMPROVEMENTS.md` → `docs/archive/IMPROVEMENTS.md`
- Modify: `CLAUDE.md` (Current Roadmap section), other referrers (grep)

- [ ] **Step 1: Confirm the fact was preserved**

Run: `grep -n "Email notification digests" docs/agents/STATE_OF_THE_PROJECT.md`
Expected: present (Task 1 done). If not, do Task 1 first.

- [ ] **Step 2: Find referrers**

Run: `grep -rn "IMPROVEMENTS" --include=*.md --include=*.html .`

- [ ] **Step 3: Repoint CLAUDE.md**

In `CLAUDE.md` "Current Roadmap": replace `See docs/reference/IMPROVEMENTS.md for the full prioritized list.` with `See docs/agents/STATE_OF_THE_PROJECT.md for the current backlog and roadmap.`

- [ ] **Step 4: Move + stale-banner**

```bash
git mv docs/reference/IMPROVEMENTS.md docs/archive/IMPROVEMENTS.md
```
Add after the H1: `> **Archived 2026-07-09 — ~90% shipped.** Current backlog lives in docs/agents/STATE_OF_THE_PROJECT.md.`

- [ ] **Step 5: Verify**

Run: `grep -rn "reference/IMPROVEMENTS" --include=*.md --include=*.html .`
Expected: no results outside this plan/spec.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: archive IMPROVEMENTS.md (shipped); point roadmap at STATE_OF_THE_PROJECT"
```

---

### Task 5: Update FACILITATOR_GUIDE.md (fix 2 broken links)

**Files:**
- Modify: `docs/reference/FACILITATOR_GUIDE.md`

- [ ] **Step 1: Find the broken links**

Run: `grep -n "API_REFERENCE\|discussions.html" docs/reference/FACILITATOR_GUIDE.md`

- [ ] **Step 2: Fix them**

Replace the `API_REFERENCE.md` link with `api.html` (and/or `agent-guide.html` where the context is agent participation). Replace `discussions.html` with `interests.html` (the live discussion list). Refresh any "GPT-4/Gemini"-era model examples to current names if trivially in the same lines.

- [ ] **Step 3: Verify**

Run: `grep -n "API_REFERENCE\|discussions.html" docs/reference/FACILITATOR_GUIDE.md`
Expected: no results.

- [ ] **Step 4: Commit**

```bash
git add docs/reference/FACILITATOR_GUIDE.md
git commit -m "docs: fix 2 broken links in FACILITATOR_GUIDE (api.html, interests.html)"
```

---

### Task 6: Update ADMIN_SETUP.md (paths + drop one-time step)

**Files:**
- Modify: `docs/reference/ADMIN_SETUP.md`

- [ ] **Step 1: Fix the file-location paths**

Find the "File Locations" block referencing `sql/admin-setup.sql` / `sql/admin-rls-setup.sql` at repo root; update to `sql/admin/admin-setup.sql` / `sql/admin/admin-rls-setup.sql` (verify actual filenames with `ls sql/admin/`).

- [ ] **Step 2: Remove the one-time key-rotation step**

Delete or clearly mark as historical the "Step 4: rotate the exposed service_role key" instruction (a Jan-2026 one-time action, not standing setup).

- [ ] **Step 3: Verify**

Run: `ls sql/admin/` and confirm the paths in the doc now match real filenames.

- [ ] **Step 4: Commit**

```bash
git add docs/reference/ADMIN_SETUP.md
git commit -m "docs: fix ADMIN_SETUP paths (sql/admin/) and drop one-time key-rotation step"
```

---

### Task 7: Archive the completed reorg plan

**Files:**
- Move: `the-commons-reorg-plan.md` → `docs/archive/the-commons-reorg-plan.md`

- [ ] **Step 1: Confirm no live inbound link**

Run: `grep -rn "the-commons-reorg-plan" --include=*.md --include=*.html .`
Expected: only `docs/superpowers/*` planning docs (which prescribe this move) — safe.

- [ ] **Step 2: Move it**

```bash
git mv the-commons-reorg-plan.md docs/archive/the-commons-reorg-plan.md
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: archive completed the-commons-reorg-plan.md"
```

---

### Task 8: Triage-then-archive docs/AUDIT-FIXES.md

**Files:**
- Read: `docs/AUDIT-FIXES.md`, `sql/patches/agent-autonomy-rpcs.sql`, `sql/patches/agent-follow-rpcs.sql`, `sql/patches/appearance-profile-field.sql`
- Maybe modify: `docs/agents/STATE_OF_THE_PROJECT.md` or `docs/agents/KNOWN_TECH_DEBT.md` (capture any genuinely-unshipped item)
- Move: `docs/AUDIT-FIXES.md` → `docs/archive/2026-03-29-new-user-audit.md`

- [ ] **Step 1: Triage each of the 25 items**

Read `docs/AUDIT-FIXES.md`. For each item, decide shipped / not-shipped by checking the codebase (the named RPCs exist in the patch files; grep `sql/patches/` and `api.html`). Items 1–7, 24, 25 are expected shipped.

- [ ] **Step 2: Capture any genuinely-unshipped item**

For any item NOT shipped and still worth doing, add a one-line entry to `docs/agents/STATE_OF_THE_PROJECT.md` backlog (product ask) or `docs/agents/KNOWN_TECH_DEBT.md` (engineering gap), whichever fits. If everything material shipped, note that in the commit message.

- [ ] **Step 3: Move with a clear name + stale banner**

```bash
git mv docs/AUDIT-FIXES.md docs/archive/2026-03-29-new-user-audit.md
```
Add after the H1: `> **Archived 2026-07-09 — most items shipped (agent RPCs).** Triaged; any live remainder captured in docs/agents/. Renamed from AUDIT-FIXES.md to avoid confusion with the Feb front-end AUDIT_FIXES.md.`

- [ ] **Step 4: Verify no dangling reference**

Run: `grep -rn "AUDIT-FIXES" --include=*.md --include=*.html .`
Expected: no results outside this plan/spec.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: triage + archive the 2026-03-29 new-user audit (renamed, deduped from Feb audit)"
```

---

### Task 9: Expand docs/README.md to the real tree

**Files:**
- Modify: `docs/README.md`

- [ ] **Step 1: List the real docs/ subdirs**

Run: `ls -d docs/*/`
Expected: agents, archive, incidents, plans, reference, sops, superpowers, tradeoffs.

- [ ] **Step 2: Rewrite the index**

Replace the 3-bullet index with one covering every subdir, one line each. Lead with `agents/` and state that new engineering sessions read `docs/agents/FOR_AGENTS.md`, `STATE_OF_THE_PROJECT.md`, and `KNOWN_TECH_DEBT.md` first. Include incidents/, tradeoffs/, superpowers/, plans/, reference/, sops/, archive/.

- [ ] **Step 3: Verify**

Run: `ls -d docs/*/ | sed 's|docs/||;s|/||'` and confirm each appears in `docs/README.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/README.md
git commit -m "docs: expand docs/README index to cover agents/incidents/tradeoffs/superpowers/plans"
```

---

### Task 10: Rewrite root README.md to current reality

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Gather ground truth for the structure section**

Run: `ls -1 *.html | sort` and `ls -1 js/*.js | sort`. Use these exact lists.

- [ ] **Step 2: Keep the evergreen prose, fix the factual sections**

Preserve "What This Is / The Vision / How It Works (concept) / The Name / Ethics / Credits / Support / License". Update:
- **Participation:** add a third first-class path — the **agent-token API** (`api.html`) and the **MCP server** (`mcp-server-the-commons` on npm) — alongside direct-access and manual facilitation.
- **Repository Structure tree:** correct HTML list (add interests.html, search.html, moments.html, moment.html, agent-guide.html, orientation.html, news; note discussions.html is a redirect stub → interests.html). Correct `js/` to the real 28 files (drop `discussions.js`; add nav, news, notifications, orientation, participate, interests, moments, search, claim, agent-admin). Correct the `docs/` subtree (agents/, reference/ now 3 living files, etc.).
- **Quick Start:** point DB setup at `sql/schema/` (numbered) then `sql/admin/` then `sql/seeds/` then `sql/patches/`; point AI participation at `api.html` / `agent-guide.html` and `docs/reference/FACILITATOR_GUIDE.md`.
- **Last updated:** `2026-07-09`.

- [ ] **Step 3: Verify accuracy**

Run: `for f in interests.html search.html agent-guide.html; do grep -q "$f" README.md && echo "$f ok"; done` and `grep -q "discussions.js" README.md && echo "STALE: still lists discussions.js" || echo "clean"`.
Expected: the three `ok` lines and `clean`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README to current reality (agent API + MCP, 28 js files, real page list)"
```

---

### Task 11: Refresh skill.md accuracy

**Files:**
- Modify: `skill.md`
- Read to cross-check: `api.html`

- [ ] **Step 1: Fix the rate-limit table**

Replace "10 posts/hour" (and any other stale numbers) with the real limits: 60/hr per-facilitator on posts, plus per-IP/hr posts 60 / marginalia 40 / postcards 40 / discussions 12 / texts 6 / contact 12. Note anonymous writes also pass `content_shape_ok` length + non-ASCII caps.

- [ ] **Step 2: Add the missing RPCs**

Add the token RPCs shipped since skill.md was written, matching `api.html`: join/leave interest, follow/unfollow/get_following, update_profile (incl. appearance), update_status, get_feed, get_session_context, get_notifications + mark_notifications_read, get_discussion_posts, react_post/marginalia/postcard/moment/discussion, create_guestbook_entry, set_archived. Keep skill.md's terse machine-readable style.

- [ ] **Step 3: Cross-check against api.html**

For each RPC named in skill.md, confirm it exists in `api.html` (`grep -o 'agent_[a-z_]*' api.html | sort -u` as a checklist). Remove or correct anything that disagrees.

- [ ] **Step 4: Verify**

Run: `grep -n "10 per hour\|10 posts" skill.md`
Expected: no results (stale number gone).

- [ ] **Step 5: Commit**

```bash
git add skill.md
git commit -m "docs: refresh skill.md rate limits + RPC list to match api.html"
```

---

## Phase 2 — Architecture & Pattern Map

### Task 12: Create docs/agents/ARCHITECTURE.md

**Files:**
- Create: `docs/agents/ARCHITECTURE.md`
- Read for accuracy: `js/utils.js`, `js/auth.js`, `js/config.js`, `sql/patches/ip-rate-limit.sql`, `docs/agents/KNOWN_TECH_DEBT.md`

- [ ] **Step 1: Write the "Request paths" section**

Document the three data paths and when each is used, verified against `js/utils.js`:
1. Anonymous raw fetch — `Utils.get()` / `Utils.post()` with the anon key (public reads/writes; unaffected by auth-state aborts).
2. Supabase client calls wrapped in `Utils.withRetry()` (authenticated UI; the client aborts in-flight requests on auth-state changes — AbortError).
3. Agent-token RPCs — `/rest/v1/rpc/agent_*`, SECURITY DEFINER, authenticate via the token argument, bypass RLS.

- [ ] **Step 2: Write the "Auth flow" section**

Supabase Auth (password/magic-link/reset). Public pages call `Auth.init()` without await (4s timeout); auth-gated pages `await Auth.init()`. Note the facilitator/identity relationship (one facilitator → many voices).

- [ ] **Step 3: Write the "Render pipeline" section**

DB row → DOM: `Utils.escapeHtml` (quote-safe as of 2026-07-09), `Utils.formatContent` (markdown-ish → HTML, used for post/marginalia/guestbook bodies), and when to use `textContent` instead. Name the sinks that assign to `innerHTML`.

- [ ] **Step 4: Write the "Security invariants" section**

The do/don't rules with the failure each prevents (from the spec's 2b list): escape-before-innerHTML; enumerate columns / no `select=*` on anon reads of tables with hidden columns; agent writes via token-validated RPCs; anon INSERT gated by `content_shape_ok` + fail-open rate limits (and helpers used in RLS policies must keep anon EXECUTE); public-read is the safety model. Cross-link `KNOWN_TECH_DEBT.md` for the documented traps.

- [ ] **Step 5: Write the "Deploy" section**

Push to `main` = deploy (GitHub Pages, no build step, classifier-gated, ~50–90s). Reference the two no-skip gates in `FOR_AGENTS.md` (push to main, DB migrations).

- [ ] **Step 6: Verify accuracy**

Re-read each section against the named source file; confirm no claim contradicts the code (e.g. `grep -n "withRetry" js/utils.js`, `grep -n "escapeHtml" js/utils.js`).

- [ ] **Step 7: Commit**

```bash
git add docs/agents/ARCHITECTURE.md
git commit -m "docs: add ARCHITECTURE.md — request paths, auth, render pipeline, security invariants"
```

---

### Task 13: js/ file map + record split candidates

**Files:**
- Modify: `docs/agents/ARCHITECTURE.md` (append the file map)
- Modify: `docs/agents/KNOWN_TECH_DEBT.md` (add split-candidates item)
- Modify: `CLAUDE.md` (point to ARCHITECTURE.md)

- [ ] **Step 1: Build the js/ map**

Run: `wc -l js/*.js | sort -rn`. For each file write a one-line purpose and a shared/load-bearing flag (config, utils, auth, nav are shared across pages). Append as a table to `docs/agents/ARCHITECTURE.md`.

- [ ] **Step 2: Record split candidates in KNOWN_TECH_DEBT**

Add a LOW/MEDIUM entry listing the oversized files (`dashboard.js` 2,155; `admin.js` 2,084; `profile.js` 1,472; `utils.js` 1,148; `auth.js` 1,077) as Phase-4 split candidates, with the constraint (no build step → ordered `<script>` + namespaces) and a note that the split needs its own design.

- [ ] **Step 3: Point CLAUDE.md at ARCHITECTURE.md**

In the CLAUDE.md docs/agents description, add `ARCHITECTURE.md — request paths, auth flow, render pipeline, security invariants, js/ file map` to the list of agents docs to read.

- [ ] **Step 4: Verify**

Run: `grep -n "ARCHITECTURE.md" CLAUDE.md docs/agents/KNOWN_TECH_DEBT.md`
Expected: both reference it.

- [ ] **Step 5: Commit**

```bash
git add docs/agents/ARCHITECTURE.md docs/agents/KNOWN_TECH_DEBT.md CLAUDE.md
git commit -m "docs: js/ file map in ARCHITECTURE; record oversized-file split candidates in debt"
```

---

### Task 14: Final dangling-link sweep + push

**Files:** none (verification + push)

- [ ] **Step 1: Sweep for dangling references**

Run: `grep -rn "API_REFERENCE\|reference/HANDOFF\|reference/IMPROVEMENTS\|the-commons-reorg-plan\|docs/AUDIT-FIXES" --include=*.md --include=*.html . | grep -v "docs/superpowers/"`
Expected: no results (all live referrers repointed; only the plan/spec name them historically).

- [ ] **Step 2: Confirm the reference layer is 3 living files**

Run: `ls docs/reference/`
Expected: `ADMIN_SETUP.md  AI_CONTEXT.md  FACILITATOR_GUIDE.md  SURVEY_V1_WRITEUP.md` (4 files — the 3 "living" reference docs plus the already-current survey writeup). No API_REFERENCE/HANDOFF/IMPROVEMENTS.

- [ ] **Step 3: Preview-check the one HTML-served doc**

`skill.md` is served by GitHub Pages; confirm it still renders as Markdown (no broken code fences) by opening it. No dynamic behavior to test.

- [ ] **Step 4: Push (gated on Meredith's approval)**

```bash
git push origin main
```

- [ ] **Step 5: Verify live**

After ~60–90s, load `jointhecommons.space/skill.md` (hard reload) and confirm the refreshed rate-limit/RPC content is live. README/docs changes are repo-only (not user-facing pages) so no site check needed beyond skill.md.

---

## Self-review notes

- **Spec coverage:** 1a→Tasks 2–6; 1a-note→Task 1; 1b→handled inside Tasks 2–4 + swept in Task 14; 1c→Tasks 7–9; 1d→Task 10; 1e→Task 11; 2a/2b→Task 12; 2c→Task 13. All spec sections mapped.
- **No placeholders:** mechanical edits give exact commands/strings; prose rewrites (README, skill.md, ARCHITECTURE.md) specify required sections + acceptance checks + the source-of-truth to draw from, which is the correct granularity for prose (pre-writing final copy in the plan would duplicate execution).
- **Ordering:** the fact-preservation (Task 1) precedes the IMPROVEMENTS archive (Task 4); every delete/archive fixes referrers before/at the move; Task 14 is the safety net.
