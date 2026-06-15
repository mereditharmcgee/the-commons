# Repo Cleanup & Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch the repo's docs and structure up to reality and add a deterministic-first CI safety net, without touching the deliberately-minimal runtime architecture.

**Architecture:** Four ascending-risk workstreams. WS1–WS3 change only docs, dead files, and file locations (zero runtime change, no DB). WS4 adds a `node:test` unit suite, a side-effect-free extracted module, a live smoke test, and an advisory GitHub Action. No build step is introduced; no `apply_migration` is called anywhere.

**Tech Stack:** Vanilla JS (browser-global IIFE pattern), Node 20 `node:test` (zero new deps), GitHub Actions, eslint (already configured), Supabase REST (anon key, already public).

**Spec:** [docs/superpowers/specs/2026-06-15-repo-cleanup-design.md](../specs/2026-06-15-repo-cleanup-design.md)

**Conventions for every task below:**
- Commit messages use the project's lowercase colon-prefix style and **end with the trailer** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (per docs/agents/FOR_AGENTS.md). Commit blocks below omit the trailer for brevity — add it.
- **Commit freely; push only on Meredith's explicit "push."** Natural push boundaries are the end of each workstream (WS1, WS2, WS3, WS4), after the relevant CLAUDE.md pre-deploy QA categories are walked.
- Run shell steps via the Bash tool (POSIX: `git grep`, `wc`, `node`).

---

## WS1 — Doc drift + dead code

*One commit. Pure docs / dead-code. Zero runtime change. No changelog entry.*

### Task 1: Fix stale docs, delete the orphaned `discussions.js`, archive the completed reorg plan

**Files:**
- Modify: `CLAUDE.md` (JS count + page-map line)
- Modify: `docs/agents/STATE_OF_THE_PROJECT.md:156` (JS count)
- Modify: `README.md:106,140`
- Modify: `docs/reference/HANDOFF.md:61,93`
- Modify: `docs/sops/BUG_FIX_SOP.md:70`
- Modify: `.claude/commands/bug-fix.md:45`
- Modify: `docs/agents/KNOWN_TECH_DEBT.md` (flip LOW entry to resolved)
- Delete: `js/discussions.js`
- Move: `the-commons-reorg-plan.md` → `docs/archive/the-commons-reorg-plan.md`

- [ ] **Step 1: Confirm the orphan is truly dead (no live `<script>` include)**

Run:
```bash
git grep -n 'src="js/discussions.js"' -- '*.html'
```
Expected: **no output** (no HTML page loads it). If any hit appears, STOP — it is not orphaned; re-scope.

- [ ] **Step 2: Delete the orphaned file**

Run:
```bash
git rm js/discussions.js
```
Expected: `rm 'js/discussions.js'`.

- [ ] **Step 3: Fix the JS-count claim in CLAUDE.md**

In `CLAUDE.md`, the line:
```
### js/ -- All JavaScript (21 files)
```
becomes:
```
### js/ -- All JavaScript (28 files)
```

- [ ] **Step 4: Fix the CLAUDE.md page-map line for discussions**

In `CLAUDE.md`, the Project Map line:
```
- discussions.html / discussion.html -- Discussion list and threads
```
becomes:
```
- discussions.html -- redirect stub to interests.html (kept for inbound links)
- discussion.html -- single discussion thread view
```

- [ ] **Step 5: Fix the JS-count claim in STATE_OF_THE_PROJECT.md**

In `docs/agents/STATE_OF_THE_PROJECT.md:156`, the line:
```
  is consistent across all 21 JS files.
```
becomes:
```
  is consistent across all 28 JS files.
```

- [ ] **Step 6: Fix README.md (annotate the stub, drop the dead JS line)**

In `README.md:106`:
```
├── discussions.html           # All discussions list
```
becomes:
```
├── discussions.html           # Redirect stub -> interests.html (kept for inbound links)
```
Then **delete** `README.md:140` entirely:
```
│   ├── discussions.js         # Discussion list rendering
```

- [ ] **Step 7: Fix docs/reference/HANDOFF.md (annotate the stub, drop the dead JS line)**

In `docs/reference/HANDOFF.md:61`:
```
├── discussions.html        # All discussions list
```
becomes:
```
├── discussions.html        # Redirect stub -> interests.html (kept for inbound links)
```
Then **delete** `docs/reference/HANDOFF.md:93` entirely:
```
│   ├── discussions.js      # Discussions list page
```

- [ ] **Step 8: Fix the BUG_FIX_SOP.md page table row**

In `docs/sops/BUG_FIX_SOP.md:70`:
```
| Discussions | discussions.html | js/discussions.js | discussions |
```
becomes:
```
| Discussions/Interests list | interests.html | js/interests.js | interests, discussions | (discussions.html is a redirect stub)
```

- [ ] **Step 9: Fix the bug-fix.md command page table row**

In `.claude/commands/bug-fix.md:45`:
```
| Discussions list | discussions.html | js/discussions.js | sql/schema/01-schema.sql |
```
becomes:
```
| Discussions/Interests list | interests.html | js/interests.js | sql/schema/11-interests-schema.sql | (discussions.html redirects here)
```

- [ ] **Step 10: Archive the completed reorg plan**

Run:
```bash
git mv the-commons-reorg-plan.md docs/archive/the-commons-reorg-plan.md
```
Expected: no output (success).

- [ ] **Step 11: Flip the KNOWN_TECH_DEBT entry to resolved**

In `docs/agents/KNOWN_TECH_DEBT.md`, change the heading:
```
## LOW — discussions.html is a redirect stub; js/discussions.js is orphaned
```
to:
```
## ~~LOW — discussions.html is a redirect stub; js/discussions.js is orphaned~~ — RESOLVED 2026-06-15
```
And append one line under that section's body:
```
**Resolved 2026-06-15:** orphaned `js/discussions.js` deleted; page maps in
CLAUDE.md, README.md, HANDOFF.md, BUG_FIX_SOP.md, and bug-fix.md corrected to
show `discussions.html` as a redirect stub and `interests.html` as the live
surface.
```

- [ ] **Step 12: Verify no live references to the deleted file remain**

Run:
```bash
git grep -n 'discussions\.js' -- '*.md' '*.html' ':!docs/archive' ':!.planning'
```
Expected: **no output** outside archived planning prose. (Archived planning docs under `docs/archive/` and `.planning/` are historical snapshots — leave them.)

- [ ] **Step 13: Verify the count claim is gone and JS still parses**

Run:
```bash
git grep -n '21 JS files\|All JavaScript (21' -- '*.md' ':!docs/archive' ':!.planning'
echo "js file count: $(git ls-files js | wc -l)"
for f in js/*.js; do node --check "$f" || echo "PARSE FAIL: $f"; done
npx eslint js/
```
Expected: first grep **no output**; count = **28**; no `PARSE FAIL` lines; eslint exits 0 with only the pre-existing 13 warnings.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "docs: correct page maps + JS count, delete orphaned discussions.js

Deletes the orphaned js/discussions.js (no HTML page loaded it), corrects the
'21 JS files' count to 28 and the discussions.html-as-live-list claim across
CLAUDE.md, STATE_OF_THE_PROJECT, README, HANDOFF, BUG_FIX_SOP, and bug-fix.md,
archives the already-completed reorg plan, and marks the matching debt entry
resolved. No runtime change."
```

> **WS1 push gate:** walk CLAUDE.md QA categories 1 (Display — docs only) and 5 (Navigation — the deleted file was loaded by nothing; discussions.html stub still redirects). Surface results; push only on "push."

---

## WS2 — `.planning/` archive + index

*One commit. File moves only (`git mv` preserves history). No content edits.*

### Task 2: Move completed milestone artifacts into `.planning/archive/` and add an index

**Files:**
- Create: `.planning/archive/` (via `git mv` targets)
- Create: `.planning/README.md`
- Move: see Step 2
- Delete: empty `.planning/phases/`

- [ ] **Step 1: Create the archive directory marker**

Run:
```bash
mkdir -p .planning/archive
```

- [ ] **Step 2: Move historical subdirs and loose docs into the archive**

Run (each `git mv` preserves rename history):
```bash
git mv .planning/milestones .planning/archive/milestones
git mv .planning/research .planning/archive/research
git mv .planning/visual-references .planning/archive/visual-references
git mv .planning/COMMONS-3.0-AUDIT.md .planning/archive/
git mv .planning/COMMONS-3.0-PHASE-A-PLAN.md .planning/archive/
git mv .planning/COMMONS-3.0-PHASE-B-PLAN.md .planning/archive/
git mv .planning/COMMONS-3.0-PHASE-C-PLAN.md .planning/archive/
git mv .planning/COMMONS-3.0-PHASE-E-PLAN.md .planning/archive/
git mv .planning/HANDOFF.md .planning/archive/
git mv .planning/HANDOFF-BUILD-2-DIGEST.md .planning/archive/
git mv .planning/HANDOFF-BUILD-2-NOTIFICATIONS.md .planning/archive/
git mv .planning/MILESTONES.md .planning/archive/
git mv .planning/PROJECT.md .planning/archive/
git mv .planning/STATE.md .planning/archive/
git mv .planning/ROADMAP.md .planning/archive/
git mv .planning/RETROSPECTIVE.md .planning/archive/
git mv .planning/SURVEY_V1_ANALYSIS.md .planning/archive/
git mv .planning/v2.98-MILESTONE-AUDIT.md .planning/archive/
git mv .planning/v3.1-MILESTONE-AUDIT.md .planning/archive/
git mv .planning/v4.0-MILESTONE-AUDIT.md .planning/archive/
```
Expected: no output per command (success).

- [ ] **Step 3: Archive the one resolved pending todo, drop the empty `phases/`**

The single item in `.planning/todos/pending/` (admin-dashboard fix) was resolved 2026-06-09 (`fac1167`). Run:
```bash
git mv .planning/todos/pending/2026-03-02-fix-admin-dashboard-functionality-and-usability.md .planning/archive/
rmdir .planning/phases 2>/dev/null || true
```
Expected: the `git mv` succeeds; `phases/` is removed if empty (it is — it was tracked empty / had no tracked files).

- [ ] **Step 4: Confirm the active set left at `.planning/` root**

Run:
```bash
git ls-files .planning | grep -v '/archive/' | grep -v '/todos/'
```
Expected, exactly these active docs (the README is added in Step 5):
```
.planning/config.json
.planning/featuring-candidates-2026-06-09.md
.planning/unbounded-reads-audit-2026-06-09.md
.planning/SESSION-HANDOFF-2026-05-21.md
```
(Order may vary. If anything else remains at root, decide keep-or-archive before continuing.)

- [ ] **Step 5: Write the index**

Create `.planning/README.md`:
```markdown
# Planning

Active working docs live at this root. Completed-milestone GSD artifacts and
superseded handoffs live in `archive/`, kept for agent-readable history — not
active use.

## Active (root)
- `unbounded-reads-audit-2026-06-09.md` — the 1,000-row-cap read audit (fixes shipped; the flag-only D-list lives here).
- `featuring-candidates-2026-06-09.md` — threads under consideration for featuring.
- `SESSION-HANDOFF-2026-05-21.md` — survey-arc backlog source. **Stale on "next builds"**; trust STATE_OF_THE_PROJECT.md over it for shipping state.
- `config.json` — GSD config.
- `todos/` — open todos (if any).

## archive/
- `milestones/` — per-phase CONTEXT/RESEARCH/PLAN/SUMMARY/VERIFICATION across v2.98 → v4.2.
- `research/`, `visual-references/` — milestone research + visual refs.
- Loose `*.md` — completed audits, handoffs, and the v2.98/v3.1/v4.0 milestone audits.
```

- [ ] **Step 6: Verify history is preserved and nothing's content changed**

Run:
```bash
git add .planning/README.md
git log --follow --oneline -- .planning/archive/v4.0-MILESTONE-AUDIT.md | head -3
git diff --cached -M --diff-filter=R --stat | tail -5
```
Expected: `git log --follow` shows commits from **before** the move (rename detected — history intact); the staged diff shows pure renames (`R`), no content modifications.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(planning): archive completed milestone artifacts behind an index

git-mv's the 302 finished GSD milestone files and superseded handoffs into
.planning/archive/, leaving only the active audit, survey handoff, and
featuring-candidates at the root, plus a README index. Pure renames — history
preserved, no content changed."
```

> **WS2 push gate:** docs-only; nothing user-facing. Surface and push on "push" (or fold into the WS1 push if pushing together).

---

## WS3 — SQL clarity

*One commit. Documentation-only. NO schema change, NO `apply_migration`, NO file renumbering.*

### Task 3: Rewrite `sql/README.md` to describe reality

**Files:**
- Modify: `sql/README.md` (full rewrite)

- [ ] **Step 1: Confirm `sql/patches.sql` is a historical script, not a live index**

Run:
```bash
git grep -n 'patches\.sql' -- '*.js' '*.html' '*.md' ':!sql/README.md' ':!docs/archive' ':!.planning'
```
Expected: **no live code/doc references** (it is a superseded Jan-2026 monolithic patch script — PATCH 1–4 — not an index of `patches/`). It stays in place as an applied-SQL record; it is documented (not deleted) in Step 2.

- [ ] **Step 2: Replace `sql/README.md` with an accurate description**

Overwrite `sql/README.md` with:
```markdown
# Database

Supabase PostgreSQL with Row Level Security.

## Source of truth

**The live Supabase project (`dfephsfberzadihcrhal`) is the source of truth.**
Everything in `sql/` is an *audit copy* of SQL that was applied to production —
per docs/agents/FOR_AGENTS.md, every migration is applied via
`apply_migration` and a copy saved here. **This directory is a record, not a
runnable from-scratch installer.** The historical numbering below has since
collided (e.g. several `032-*` patches, duplicate `06/07/08/09` in `schema/`);
that is harmless because these files are not re-run in order.

## What each location is

- `schema/` — the original bring-up table definitions (historical order).
- `seeds/` — initial data (founding texts, first discussions, models).
- `admin/` — RLS policies and admin roles.
- `patches/` — the **current** convention: one file per applied change, with a
  what/why/risk/applied-date header referencing the lint or incident that
  triggered it.
- `migrations/` — a small number of one-off data migrations
  (`categorize-discussions`, `normalize-models`).
- `patches.sql` — **historical**: a superseded Jan-2026 monolithic patch
  script (PATCH 1–4). Kept as an applied-SQL record; do not extend it — new
  changes go in `patches/`.

`supabase/migrations/` (outside this directory) holds the early
Supabase-CLI-era migrations from project bring-up. Also historical; the
`apply_migration` + `sql/patches/` convention supersedes it.

## Go-forward convention

New patches are **date-prefixed**: `YYYY-MM-DD-description.sql`. This ends the
integer-collision drift. Apply via `apply_migration` only after Meredith's
explicit "apply"; save the audit copy here with the standard header.
```

- [ ] **Step 3: Verify no DB call was made and only the README changed**

Run:
```bash
git diff --stat
```
Expected: exactly one changed file, `sql/README.md`. (No `apply_migration`, no other file.)

- [ ] **Step 4: Commit**

```bash
git add sql/README.md
git commit -m "docs(sql): describe Supabase-as-source-of-truth + the three SQL homes

Rewrites sql/README to stop implying a runnable numbered setup chain. Names the
live Supabase project as source of truth, explains schema/seeds/admin/patches/
migrations + the historical patches.sql and supabase/migrations/, and sets a
date-prefixed go-forward naming rule. Documentation only — no schema change."
```

> **WS3 push gate:** docs-only, no DB touched. Surface and push on "push."

---

## WS4 — Test harness + CI gate

*The only workstream that adds executable code. No build step. Zero new deps.*
*Tasks 4–5 touch shared application files (`utils.js`, `search.js`, `search.html`) — surface the diffs for approval per the spec before pushing.*

### Task 4: `node:test` unit tests for `Utils.formatRelativeTime` (+ export guard)

**Files:**
- Modify: `js/utils.js` (append CommonJS export guard at end of file)
- Create: `tests/unit/format.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/format.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Utils = require('../../js/utils.js');

// Build an ISO timestamp `ms` milliseconds in the past, so assertions are
// deterministic regardless of when the suite runs. Buckets are coarse enough
// that a few ms of execution time can't cross a boundary.
function isoAgo(ms) {
    return new Date(Date.now() - ms).toISOString();
}

test('formatRelativeTime buckets recent timestamps', () => {
    assert.equal(Utils.formatRelativeTime(isoAgo(30 * 1000)), 'just now');   // 30s
    assert.equal(Utils.formatRelativeTime(isoAgo(5 * 60000)), '5m ago');     // 5 min
    assert.equal(Utils.formatRelativeTime(isoAgo(3 * 3600000)), '3h ago');   // 3 hr
    assert.equal(Utils.formatRelativeTime(isoAgo(2 * 86400000)), '2d ago');  // 2 days
});
```

- [ ] **Step 2: Run it and watch it fail (no export yet)**

Run:
```bash
node --test tests/unit/format.test.js
```
Expected: FAIL — `require('../../js/utils.js')` returns `{}` (or `undefined`), so `Utils.formatRelativeTime` throws `TypeError: ... is not a function`.

- [ ] **Step 3: Add the export guard to `js/utils.js`**

`js/utils.js` is a plain object literal (`const Utils = { ... };`) with no top-level side effects. Append at the very end of the file (after the closing `};` of the object):
```js

// Node test harness only — invisible in the browser (no `module` global there).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run:
```bash
node --test tests/unit/format.test.js
```
Expected: PASS — 1 test, 0 failures. (`formatRelativeTime`'s relative branches never reach the `this.formatDate` / `CONFIG` path, so no globals are needed.)

- [ ] **Step 5: Confirm the browser path is unaffected**

Run:
```bash
node --check js/utils.js
npx eslint js/utils.js
```
Expected: no parse error; eslint 0 errors (the guard references `module`, which is fine — eslint config treats undeclared globals leniently; if `module`/`exports` is flagged, add them to `eslint.config.mjs` `globals` as `"readonly"` and note it in the commit).

- [ ] **Step 6: Commit**

```bash
git add js/utils.js tests/unit/format.test.js
git commit -m "test: unit-test Utils.formatRelativeTime via node:test

Adds a CommonJS export guard (no-op in the browser) so the pure object can be
required in Node, and a deterministic node:test for the relative-time buckets.
First unit coverage in the repo."
```

### Task 5: Extract the ilike sanitizer to a side-effect-free module + unit-test it

**Why an extraction:** the sanitizer (`ilikeEscape`, `orIlikePattern`) lives inside `js/search.js`'s IIFE, which calls `document.getElementById` at load — so `search.js` can't be `require`d in Node. Moving the two **pure** functions verbatim into a new side-effect-free file makes them testable and keeps search.js using the same logic (no duplication, no behavior change).

**Files:**
- Create: `js/ilike-escape.js` (flat in `js/`, matching the no-subdir convention)
- Modify: `js/search.js` (use the global instead of local defs)
- Modify: `search.html` (load the new script before search.js)
- Create: `tests/unit/ilike-escape.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ilike-escape.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ilikeEscape, orIlikePattern } = require('../../js/ilike-escape.js');

test('ilikeEscape makes LIKE wildcards literal', () => {
    assert.equal(ilikeEscape('plain'), 'plain');
    assert.equal(ilikeEscape('50%'), '50\\%');   // % -> \%
    assert.equal(ilikeEscape('a_b'), 'a\\_b');   // _ -> \_
    assert.equal(ilikeEscape('a\\b'), 'a\\\\b'); // \ -> \\
});

test('orIlikePattern wraps in a quoted %...% so commas/parens cannot break or=()', () => {
    assert.equal(orIlikePattern('cat'), '"%cat%"');
    assert.equal(orIlikePattern('a,b'), '"%a,b%"');   // comma preserved literally
    assert.equal(orIlikePattern('f(x)'), '"%f(x)%"'); // parens preserved literally
});

test('orIlikePattern doubles LIKE escapes to survive the quoted-literal parser', () => {
    // ilikeEscape('50%') = 50\% ; backslashes doubled -> 50\\% ; wrapped -> "%50\\%%"
    assert.equal(orIlikePattern('50%'), '"%50\\\\%%"');
    assert.equal(orIlikePattern('say "hi"'), '"%say \\"hi\\"%"'); // inner quotes escaped
});
```
> Note: if the `'50%'` assertion's exact backslash count differs when you run it, re-derive by hand — do **not** paste the actual output blindly, because the doubling is the exact behavior the real bug was about. The other assertions (quote-wrapping, comma/paren preservation) must hold regardless.

- [ ] **Step 2: Run it and watch it fail (module doesn't exist)**

Run:
```bash
node --test tests/unit/ilike-escape.test.js
```
Expected: FAIL — `Cannot find module '../../js/ilike-escape.js'`.

- [ ] **Step 3: Create the extracted module (logic copied verbatim from search.js:188–201)**

Create `js/ilike-escape.js`:
```js
// ============================================
// THE COMMONS - PostgREST ilike escaping (pure, no DOM/globals)
// Browser: attaches window.IlikeEscape. Node: module.exports.
// ============================================
(function (root) {
    'use strict';

    // Escape LIKE wildcards so user terms match literally.
    function ilikeEscape(term) {
        return term.replace(/\\/g, '\\\\').replace(/[%_]/g, function (m) { return '\\' + m; });
    }

    // Pattern for use inside or=() groups: double-quoted so commas/parens in
    // the term can't break PostgREST's or=() parsing. The quoted-literal parser
    // consumes one level of backslash escaping, so LIKE escapes (\% \_ \\) must
    // be doubled to survive through to Postgres.
    function orIlikePattern(term) {
        const quoteEscaped = ilikeEscape(term)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
        return '"%' + quoteEscaped + '%"';
    }

    const api = { ilikeEscape, orIlikePattern };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.IlikeEscape = api;
    }
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run the test and watch it pass**

Run:
```bash
node --test tests/unit/ilike-escape.test.js
```
Expected: PASS — 3 tests, 0 failures. (If the `'50%'` doubling assertion fails, re-derive per the Step 1 note before changing anything.)

- [ ] **Step 5: Point `search.js` at the shared module (delete its local copies)**

In `js/search.js`, **delete** the two local definitions (the block at lines ~187–201, from the `// Escape LIKE wildcards` comment through the end of `orIlikePattern`). Then find every call site:
```bash
git grep -n 'ilikeEscape\|orIlikePattern' -- js/search.js
```
Expected after deletion: only call sites remain (e.g. `const pattern = orIlikePattern(query);` at ~line 222). Prefix each remaining call with the global namespace — e.g. change:
```js
const pattern = orIlikePattern(query);
```
to:
```js
const pattern = IlikeEscape.orIlikePattern(query);
```
Repeat for any `ilikeEscape(` call sites (`IlikeEscape.ilikeEscape(`).

- [ ] **Step 6: Load the module in `search.html` before `search.js`**

In `search.html`, find the search.js script tag:
```bash
git grep -n 'js/search.js' -- search.html
```
Immediately **before** that `<script src="js/search.js"></script>` line, add:
```html
    <script src="js/ilike-escape.js"></script>
```
(External same-origin script — covered by the page's `script-src 'self'` CSP. **No CSP hash needed**; hashes are only for inline scripts.)

- [ ] **Step 7: Verify parse, lint, and no orphaned references**

Run:
```bash
node --check js/ilike-escape.js
node --check js/search.js
git grep -n 'function ilikeEscape\|function orIlikePattern' -- js/search.js
npx eslint js/search.js js/ilike-escape.js
```
Expected: both parse; the `function` grep returns **no output** (local copies gone); eslint 0 errors.

- [ ] **Step 8: Verify in the browser preview (search still works)**

Start the preview, open `search.html`, run a query containing a comma and a `%` (e.g. `a, 50%`), and confirm results render with no console error and the network request's `or=(...)` parameter is well-formed (not a 400). This is the real proof the extraction is behavior-preserving.

- [ ] **Step 9: Commit**

```bash
git add js/ilike-escape.js js/search.js search.html tests/unit/ilike-escape.test.js
git commit -m "test: extract ilike sanitizer to a testable module

Moves the pure ilikeEscape/orIlikePattern helpers (verbatim) out of search.js's
DOM-bound IIFE into js/ilike-escape.js so they can be required and unit-tested.
search.html loads it before search.js; search.js calls IlikeEscape.*. Covers
the comma/paren and wildcard-doubling cases from the original escaping bug.
Behavior-preserving."
```

### Task 6: De-drift the integration runner + wire `npm test`

**Files:**
- Modify: `tests/run-all.js` (add phase 38, header note)
- Modify: `tests/lib/checks.js` (header note)
- Modify: `package.json` (`scripts`)

- [ ] **Step 1: Add verify-38 to the runner and label the live scripts**

In `tests/run-all.js`, change:
```js
const phases = [21, 22, 23, 24, 25, 26, 27, 28];
```
to:
```js
const phases = [21, 22, 23, 24, 25, 26, 27, 28, 38];
```
And add, directly under the top `// Run all phase verification scripts` comment:
```js
// NOTE: these verify-*.js scripts hit LIVE production Supabase and assert on
// mutable production data. They are on-demand checks (`npm run test:integration`),
// NOT part of CI. CI runs the deterministic node:test suite (`npm test`).
```

- [ ] **Step 2: Mirror the note in the shared lib**

In `tests/lib/checks.js`, add under its top comment:
```js
// On-demand LIVE checks against production Supabase — not run in CI.
```

- [ ] **Step 3: Wire `package.json` scripts**

In `package.json`, replace the `"scripts"` block:
```json
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
```
with:
```json
  "scripts": {
    "test": "node --test tests/unit/",
    "test:smoke": "node tests/smoke/smoke.js",
    "test:integration": "node tests/run-all.js",
    "lint": "eslint js/",
    "links": "node tests/links.js"
  },
```

- [ ] **Step 4: Verify `npm test` runs the deterministic suite green**

Run:
```bash
npm test
```
Expected: both unit test files run; all tests pass; exit 0. (No network — deterministic.)

- [ ] **Step 5: Commit**

```bash
git add tests/run-all.js tests/lib/checks.js package.json
git commit -m "test: wire npm test to the unit suite; de-drift the live runner

Points npm test at the deterministic node:test suite and adds test:smoke /
test:integration / lint / links scripts. Adds verify-38 to run-all.js (it
existed but was omitted) and labels the verify-* scripts as on-demand live
checks, not CI."
```

### Task 7: Live smoke test

**Files:**
- Create: `tests/smoke/smoke.js`

- [ ] **Step 1: Write the smoke test (anon key is already public)**

Create `tests/smoke/smoke.js`:
```js
// Live read-endpoint contract check. Uses the PUBLIC anon key (already in
// config.js and tests/lib/checks.js — no secret). Asserts HTTP 200 + expected
// response SHAPE, never exact counts, so data drift can't make it flap.
const SUPABASE_URL = 'https://dfephsfberzadihcrhal.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZXBoc2ZiZXJ6YWRpaGNyaGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzAwNzIsImV4cCI6MjA4NDE0NjA3Mn0.Sn4zgpyb6jcb_VXYFeEvZ7Cg7jD0xZJgjzH0XvjM7EY';

const checks = [
    { name: 'posts',     path: '/rest/v1/posts?select=id,content,model&limit=1',     fields: ['id', 'content'] },
    { name: 'interests', path: '/rest/v1/interests?select=id,name&limit=1',          fields: ['id', 'name'] },
    { name: 'postcards', path: '/rest/v1/postcards?select=id,content,format&limit=1', fields: ['id', 'format'] },
];

async function main() {
    let failed = 0;
    for (const c of checks) {
        try {
            const res = await fetch(SUPABASE_URL + c.path, {
                headers: { apikey: ANON, Authorization: 'Bearer ' + ANON },
            });
            if (res.status !== 200) { console.error(`x ${c.name}: HTTP ${res.status}`); failed++; continue; }
            const rows = await res.json();
            if (!Array.isArray(rows)) { console.error(`x ${c.name}: expected array`); failed++; continue; }
            if (rows.length > 0) {
                const missing = c.fields.filter(f => !(f in rows[0]));
                if (missing.length) { console.error(`x ${c.name}: missing ${missing.join(', ')}`); failed++; continue; }
            }
            console.log(`ok ${c.name}: 200, shape OK`);
        } catch (e) {
            console.error(`x ${c.name}: ${e.message}`); failed++;
        }
    }
    process.exit(failed > 0 ? 1 : 0);
}
main();
```

- [ ] **Step 2: Run it against live Supabase**

Run:
```bash
npm run test:smoke
```
Expected: three `ok ...: 200, shape OK` lines, exit 0. If a table/column name differs (e.g. `interests` is named differently), the smoke test reports exactly which check failed — fix the `path`/`fields` to match the real schema, then re-run.

- [ ] **Step 3: Commit**

```bash
git add tests/smoke/smoke.js
git commit -m "test: live smoke test for key read endpoints

Hits posts/interests/postcards with the public anon key, asserting 200 +
response shape (not counts) so it catches contract breaks without flapping on
data drift."
```

### Task 8: Internal-link checker + advisory CI workflow

**Files:**
- Create: `tests/links.js`
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the no-dep internal-link/asset checker**

Create `tests/links.js`:
```js
// Internal link/asset existence check (no dependencies). Scans root *.html for
// local href/src and asserts the target file exists. External URLs, anchors,
// mailto/tel/data, and query-only targets are skipped. Advisory.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Targets to skip even if they look local (dynamic/query-param pages, etc.).
const SKIP = new Set([]);

const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const ATTR = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
const broken = [];

for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    let m;
    while ((m = ATTR.exec(html)) !== null) {
        const raw = m[1].trim();
        if (/^(https?:|mailto:|tel:|data:|#|\/\/|javascript:)/i.test(raw)) continue;
        const target = raw.split('#')[0].split('?')[0];
        if (!target || SKIP.has(target)) continue;
        const full = path.join(ROOT, target.replace(/^\//, ''));
        if (!fs.existsSync(full)) broken.push(`${file} -> ${raw}`);
    }
}

if (broken.length) {
    console.error('Broken internal links/assets:');
    broken.forEach(b => console.error('  ' + b));
    process.exit(1);
}
console.log(`OK - internal links/assets resolve across ${htmlFiles.length} HTML files.`);
```

- [ ] **Step 2: Run it; triage any false positives into SKIP**

Run:
```bash
node tests/links.js
```
Expected: `OK - internal links/assets resolve across N HTML files.` If it flags a legitimately dynamic target (a client-routed path with no file), add that exact string to the `SKIP` set and re-run until clean. Real misses (typo'd asset paths) are findings — note them to Meredith; do not SKIP them.

- [ ] **Step 3: Create the advisory CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - name: Lint
        run: npm run lint
      - name: Unit tests
        run: npm test
      - name: Internal links
        run: npm run links
      - name: Smoke (live read endpoints)
        run: npm run test:smoke
```
> Advisory only: GitHub Pages deploys from `main` independently of this workflow, so a red run is a signal, not a deploy block. Making it blocking would require deploy-via-Actions — out of scope (see spec). Coexists with `weekly-updates.yml`.

- [ ] **Step 4: Verify the workflow file is valid YAML and steps run locally**

Run:
```bash
node -e "const f=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(!/jobs:/.test(f)) throw new Error('bad'); console.log('ci.yml present')"
npm run lint && npm test && npm run links && npm run test:smoke
```
Expected: `ci.yml present`; all four commands exit 0 (this is exactly what CI will run).

- [ ] **Step 5: Commit**

```bash
git add tests/links.js .github/workflows/ci.yml
git commit -m "ci: advisory GitHub Action (eslint + unit + links + smoke)

Adds a no-dep internal-link checker and a non-blocking CI workflow running
eslint, the node:test unit suite, the link check, and the live smoke test on
push/PR to main. Advisory by design — Pages deploys independently; this is a
signal, not a gate."
```

- [ ] **Step 6: Confirm the run on a throwaway PR (optional but recommended)**

Push a branch and open a PR (only with Meredith's go, since pushing is gated). Confirm the `CI` check runs all four steps green — this verifies the workflow is wired before relying on it.

> **WS4 push gate:** Tasks 4–5 modify shared application files — surface those diffs explicitly and walk CLAUDE.md QA categories 1 (Display), 2 (Data — search still returns correct results), and 4 (Security — no key beyond the already-public anon key added). Push only on "push."

---

## Self-Review

**Spec coverage:**
- WS1 doc drift + dead code → Task 1 (count fix, page maps, delete orphan, archive reorg plan, flip debt entry). ✓
- WS2 .planning archive + index → Task 2. ✓
- WS3 SQL clarity (document-only) → Task 3. ✓
- WS4a unit tests + export guard → Tasks 4 (formatters) & 5 (sanitizer extraction). ✓
- WS4b de-drift verify runner → Task 6. ✓
- WS4c npm test wiring → Task 6. ✓
- WS4d live smoke test → Task 7. ✓
- WS4e CI workflow + internal-link check → Task 8. ✓
- Defaulted sub-decisions (SQL document-only, CI advisory, smoke shape-not-counts, export guard approval-gated, SESSION-HANDOFF kept) → reflected in Tasks 3, 8, 7, 4–5, 2. ✓

**Type/name consistency:** `ilikeEscape` / `orIlikePattern` / `IlikeEscape` namespace used consistently across Task 5 and the module. `Utils` export used consistently in Task 4. npm scripts (`test`, `test:smoke`, `test:integration`, `lint`, `links`) defined in Task 6 and consumed identically in Task 8's `ci.yml`. ✓

**Placeholder scan:** no TBD/TODO; every code step shows complete content; the one judgment point (the `'50%'` escaped-string assertion) carries an explicit re-derivation instruction rather than a blind paste. ✓
