# Repo cleanup & test harness — design

**Date:** 2026-06-15
**Status:** approved in-session (design walkthrough with Meredith); implementation pending
**Origin:** codebase scope/health review (2026-06-15). The runtime code is
healthy (eslint: 0 errors / 13 trivial warnings across 16.5k lines, 91
commits in 30 days). What has drifted is the *paperwork and structure around*
the code: docs lagging reality, a 333-file `.planning/` archive, three homes
for SQL, and no automated pre-deploy gate (the MEDIUM item in
[KNOWN_TECH_DEBT.md](../../agents/KNOWN_TECH_DEBT.md)).

**Goal:** catch the repo's paperwork and structure up to reality, and add a
deterministic-first CI safety net — without touching the deliberately-minimal
runtime architecture.

**Non-goals (explicit):** no framework, no build step, no runtime refactor of
page JS, no DB migration, no moving HTML out of root. Users see zero runtime
change. This is the floor the work is held to, per
[FOR_AGENTS.md](../../agents/FOR_AGENTS.md) "Repo shape."

**Approval surface:** only the *push-to-main* gate applies. **No
`apply_migration` anywhere in this plan** — the SQL workstream is
documentation-only. Each workstream is its own QA'd commit, pushed only on
Meredith's explicit "push."

**Sequencing:** four workstreams in ascending risk order. You can stop after
any one with value banked.

---

## WS1 — Doc drift + dead code

*Pure docs / dead-code removal. Zero runtime change. No changelog entry
(no AI voice would notice).*

**What's wrong**
- CLAUDE.md and [FOR_AGENTS.md](../../agents/FOR_AGENTS.md) say **"21 JS
  files"**; there are **29** (28 after WS1 deletes the orphan).
- Multiple page maps describe **`discussions.html` as the live discussion
  list**. It is a meta-refresh redirect stub to `interests.html`; the live
  surface is `interests.html` / `js/interests.js`.
- [js/discussions.js](../../../js/discussions.js) (165 lines) is **orphaned** —
  confirmed by grep: no HTML page includes it via `<script>`; every reference
  is in docs/planning prose. It was switched to `discussion_stats` during the
  2026-06-10 audit work so it stays correct *if* re-linked, but nothing links
  it.
- [the-commons-reorg-plan.md](../../../the-commons-reorg-plan.md) sits at repo
  root but is **fully completed** — its target structure (`docs/sops`,
  `sql/schema`, `data/`, expanded `.claude/commands`) already exists.

**The fix**
1. Sweep `grep -rn "21 JS files\|21 files\|all 21"` and correct the count to
   the real post-deletion number. Confirm with `git ls-files js | wc -l`
   after step 3 (expect **28**). Known locations: CLAUDE.md "js/" section,
   FOR_AGENTS.md "Repo shape" (two mentions).
2. Fix the page maps that call `discussions.html` the live list →
   "redirect stub to interests.html; live discussion surface is
   interests.html / interests.js." Known locations: **CLAUDE.md** Project Map,
   [README.md](../../../README.md), [docs/reference/HANDOFF.md](../../reference/HANDOFF.md),
   [docs/sops/BUG_FIX_SOP.md](../../sops/BUG_FIX_SOP.md), and
   [.claude/commands/bug-fix.md](../../../.claude/commands/bug-fix.md) (the
   page→file→table row).
3. **Delete [js/discussions.js](../../../js/discussions.js)** and remove/repoint
   its references in the page-map tables touched in step 2.
4. Move [the-commons-reorg-plan.md](../../../the-commons-reorg-plan.md) →
   `docs/archive/` (`git mv`).
5. In [KNOWN_TECH_DEBT.md](../../agents/KNOWN_TECH_DEBT.md), flip the LOW
   "discussions.html is a redirect stub; js/discussions.js is orphaned" entry
   to resolved (orphan deleted, page maps corrected).

**Verify:** `grep -rn "21 JS files"` → zero hits; `grep -rn "discussions\.js"`
→ only historical/archived planning prose, no live page-map claims; every page
in the repo still loads (the deleted file was already loaded by nothing);
`node --check` on remaining `js/*.js` passes; `npx eslint js/` still 0 errors.

---

## WS2 — `.planning/` archive + index

*File moves only. `git mv` preserves history/blame. No content edits.*

**What's wrong:** `.planning/` is 333 tracked files — 302 of them completed
GSD milestone artifacts (`CONTEXT`/`RESEARCH`/`PLAN`/`SUMMARY`/`VERIFICATION`
per phase, v2.98 → v4.2) — mixed at the same level as a thin layer of still-
active docs. Navigating it means reading past finished work.

**The fix**
1. Create `.planning/archive/`.
2. `git mv` into `archive/`: the `milestones/`, `research/`, and
   `visual-references/` subdirs; and the historical loose root docs —
   `COMMONS-3.0-*.md`, `HANDOFF.md`, `HANDOFF-BUILD-2-*.md`,
   `MILESTONES.md`, `PROJECT.md`, `STATE.md`, `ROADMAP.md`,
   `RETROSPECTIVE.md`, `SURVEY_V1_ANALYSIS.md`,
   `v2.98-MILESTONE-AUDIT.md`, `v3.1-MILESTONE-AUDIT.md`,
   `v4.0-MILESTONE-AUDIT.md`.
3. Remove the empty `.planning/phases/` directory.
4. **Keep at `.planning/` root** (active): `unbounded-reads-audit-2026-06-09.md`,
   `featuring-candidates-2026-06-09.md`, `config.json`, and
   `SESSION-HANDOFF-2026-05-21.md` (still referenced by
   [STATE_OF_THE_PROJECT.md](../../agents/STATE_OF_THE_PROJECT.md) as the
   survey backlog source — keep, but note in the index that it's stale on
   "next builds").
5. Review `.planning/todos/pending/` — its one item
   (`2026-03-02-fix-admin-dashboard-...`) was resolved 2026-06-09 (`fac1167`).
   Move it to `archive/` (or delete); if `todos/` empties, that's fine.
6. Add `.planning/README.md`: a short index — "Active working docs live at
   this root. `archive/` holds completed-milestone GSD artifacts (v2.98–v4.2),
   kept for agent-readable history, not active use."

**Verify:** active docs still resolve at `.planning/` root; everything else
under `.planning/archive/`; `git log --follow .planning/archive/<one-moved-file>`
shows pre-move history (rename detection intact); no file *content* changed
(`git diff -M --stat` shows pure renames + the new README).

---

## WS3 — SQL clarity

*Documentation-only. NO schema change, NO `apply_migration`, NO file
renumbering.*

**What's wrong:** SQL lives in **three homes** —
`sql/{schema,admin,seeds,patches,migrations}/`, a stray `sql/patches.sql`, and
`supabase/migrations/` (Supabase-CLI timestamp format). Numbering collides
(three `032-*`, dup `06/07/08/09` in `schema/`). [sql/README.md](../../../sql/README.md)
implies a clean "run files in numbered order" setup chain that no longer
literally holds. The DB's real source of truth is the live Supabase project
(changes applied via `apply_migration`), so `sql/` is an *audit record*, not a
runnable installer.

**The fix (docs, not moves — relocating applied-SQL audit copies would muddy
the record of what's actually live):**
1. Rewrite [sql/README.md](../../../sql/README.md) to state plainly:
   - **Supabase production is the source of truth.** Everything in `sql/` is
     an audit copy of what was applied, per the FOR_AGENTS SQL convention —
     not a from-scratch setup chain.
   - **What each location is:** `schema/` + `seeds/` + `admin/` = the original
     bring-up SQL (historical ordering, numbering has since collided —
     harmless, it is not re-run); `supabase/migrations/` = early
     Supabase-CLI-era migrations; `sql/patches/` = the **current** convention
     (write via `apply_migration`, save a dated audit copy with the
     what/why/risk/date header). `sql/migrations/` = a small number of
     one-off data migrations.
   - **Go-forward naming rule:** new patches are **date-prefixed**
     (`YYYY-MM-DD-description.sql`) per FOR_AGENTS, ending the integer-
     collision drift.
2. Resolve the stray `sql/patches.sql`: read it first; if it is a dead
   index/runner, delete it (note in the README); if it still documents
   something, fold that note into `sql/README.md`.

**Explicitly NOT doing:** renaming or renumbering existing patch/schema files
(churn, breaks references in archived planning docs, zero runtime benefit);
consolidating the three locations into one (the historical split is harmless
once documented).

**Verify:** `sql/README.md` accurately describes the three locations and the
go-forward rule; no DB call of any kind was made; `git diff` touches only
`sql/README.md` (and the stray file if removed).

---

## WS4 — Test harness + CI gate

*The only workstream that adds executable code. No build step, zero or one new
devDependency. No changelog entry (internal tooling).*

### 4a. Unit tests — pure logic (`node:test`, zero deps)

Target the **pure** functions worth regression-protecting — first the
**PostgREST ilike-escaping sanitizer** (it shipped a real bug; ported across
the admin console and `js/search.js` in commit `c685170`), then the
relative-time / date formatters and any other pure helpers in
[js/utils.js](../../../js/utils.js).

**The IIFE obstacle (the trickiest part of this plan):** page JS uses the
browser-global IIFE pattern — functions are not `require`-able from Node. The
minimal, build-free way to make them testable is a CommonJS export guard at the
*bottom* of the file, invisible to the browser:

```js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { /* the pure fns the planner locates — sanitizer, formatRelativeTime, … */ };
}
```

This touches shared files (`utils.js`, possibly `search.js`). **It is
behavior-preserving and surfaced for explicit approval before any edit** —
nothing else in WS4 modifies application code. If Meredith prefers not to add
the guard, the fallback is a read-and-`eval`-the-pure-fn test harness (uglier,
no app-file change); the export guard is the recommendation.

- Tests live in `tests/unit/*.test.js`, run with `node --test`.
- Cover the sanitizer's known failure modes from the bug history (documented
  during the `c685170` sanitizer work): comma/paren terms, literal `%`/`_`,
  and backslash doubling in or-group quoted patterns.

### 4b. De-drift the existing integration scripts

- Add `38` to the phase list in [tests/run-all.js](../../../tests/run-all.js)
  (verify-38.js exists but the runner omits it).
- Add a header comment to `tests/run-all.js` and `tests/lib/checks.js`:
  these are **on-demand live checks against production Supabase**, not part of
  CI (they assert on mutable production counts).

### 4c. `npm test`

Point `package.json` `"test"` at the deterministic unit suite:
`"test": "node --test tests/unit/"`. Add `"test:smoke"` (4d) and
`"test:integration": "node tests/run-all.js"` as separate, explicitly-not-
`npm test` scripts.

### 4d. Live smoke test (`tests/smoke/`)

A small script hitting ~3 key Supabase read endpoints (`posts`,
`interests`/`discussions`, `postcards`) with the **public anon key** (already
in `config.js` / `tests/lib/checks.js` — **no GitHub secret needed**).
Asserts **HTTP 200 + expected response shape (presence/type of key fields),
NOT exact row counts** — tolerant of data drift. Exits non-zero only on a
contract break (endpoint gone, field renamed) or a hard network failure.

### 4e. CI workflow (`.github/workflows/ci.yml`)

On `push` and `pull_request` to `main`, Node 20 LTS:
1. `npx eslint js/`
2. `node --test tests/unit/`
3. internal-link / asset-existence check — a **no-dep Node script**
   (`tests/links.js`) that scans `*.html` for local `href`/`src` and asserts
   the target files exist (external URLs and `?query` pages skipped).
4. `npm run test:smoke`

**Advisory / non-blocking by design.** GitHub Pages deploys from `main`
independently of Actions, so this is a green/red signal you *notice*, not a
hard gate. Making it block would require moving to deploy-via-Actions —
**out of scope**, and against the "push = deploy" norm in FOR_AGENTS. Flagged
as a possible future follow-up. Coexists with the existing
`weekly-updates.yml`.

**Out of scope, deliberate (future adds, noted not built):** HTML validation
(`html-validate`), CSS custom-property lint, accessibility (pa11y), CSP-hash
regeneration check for `admin.html` inline scripts, external-link liveness
checking. Each is a real add but balloons WS4; the four checks above are the
high-value floor.

**Verify:** `npm test` green locally; a throwaway PR shows the workflow running
all four steps green; the smoke test passes against live Supabase; `tests/links.js`
flags a deliberately-broken test link then passes when removed; eslint still 0
errors.

---

## Defaulted sub-decisions (flagged; flip any on review)

- **SQL = document-only**, not consolidate/renumber.
- **CI = non-blocking advisory** (blocking needs deploy-via-Actions, out of
  scope).
- **Smoke test asserts response shape, not counts.**
- **Unit-test export guard in `utils.js`/`search.js` only if approved**,
  behavior-preserving; eval-harness fallback otherwise.
- **`SESSION-HANDOFF-2026-05-21.md` stays at `.planning/` root** (still cited
  as backlog source), flagged stale in the index.

## Sequencing & gates

WS1 → WS2 → WS3 → WS4. Each is one commit (WS4 may be 2: tests, then CI),
QA'd against the relevant CLAUDE.md pre-deploy categories, and pushed only on
explicit "push." **No `apply_migration` in any workstream.** Stop after any
workstream with value banked.
