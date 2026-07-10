# Phase 4 — utils.js split + navigability pass — Design

**Date:** 2026-07-09
**Status:** Approved. Part of the Docs & Clarity Pass
([2026-07-09-docs-and-clarity-pass-design.md](2026-07-09-docs-and-clarity-pass-design.md));
this is the Phase 4 sub-project design that phase deferred.

## Goal

Reduce the maintainability + safety cost of the oversized shared file `utils.js`
(1,148 lines, a grab-bag of unrelated concerns) by splitting it along concern
lines — crucially isolating all XSS-relevant rendering code into one small,
auditable file. Improve navigability of the other four big files without
touching their runtime. Record page-file structural splits as tracked,
do-it-when-you're-there debt rather than a risky big-bang.

## Why utils.js specifically (not "the five biggest files")

The five oversized files are not equal. Four (dashboard/admin/profile/auth) are
mostly one-concern-per-page code that happens to be long. `utils.js` is a
grab-bag: fetch wrappers, retry, HTML escaping, `formatContent`, `sanitizeHtml`,
`isSafeUrl`, URL builders, date formatters, DOM helpers, copy-context
generators. The 2026-07-09 stored XSS lived here precisely because the
security-sensitive rendering code is buried among fetch helpers and formatters.
utils.js is also the *easiest* to split (a plain object literal, vs the IIFEs'
shared private state) and the highest-leverage (loaded on 33 pages). So it is
the correct first and only structural split in this phase.

## The split (3 files)

`utils.js` is `const Utils = { … }` (line 5) then `window.Utils = Utils` (1172).
Split into three files, each attaching to the same global via
`Object.assign(window.Utils = window.Utils || {}, { … })`:

- **`js/utils.js`** (stays, ~830 lines) — the foundation. HTTP (`withRetry`,
  `get`, `post`, `getCount`, the reaction/discussion/text/moment fetchers,
  `createPost`/`createMarginalia`), formatters (`formatDate`,
  `formatRelativeTime`, `getModelInfo`, `getModelClass`, `readingTimeLabel`,
  `validate`), URL helpers (`getUrlParam`, `discussionUrl`), DOM/UI helpers
  (`show`/`hide`/`showLoading`/`showError`/`showEmpty`/`renderReactionBar`/
  `getVoiceStatus`/`renderReactingAsPicker`/`announce`/`showFormMessage`/
  `copyToClipboard`). Keeps the name so the `config.js → utils.js` include order
  is unchanged; new tags are *added after* it.
- **`js/utils-render.js`** (new, ~90 lines) — **the security file.**
  `escapeHtml`, `formatContent`, `sanitizeHtml`, `isSafeUrl`. Every
  XSS-relevant line in one place. `formatContent`→`this.escapeHtml` and
  `sanitizeHtml`→`this.escapeHtml` resolve fine at call time on the assembled
  `Utils`.
- **`js/utils-context.js`** (new, ~230 lines) — the copy-context generators
  `generateContext`, `generateTextContext`, `generateRecentPostsContext`.
  Self-contained; call other Utils methods via `this.*` at call time.

### Mechanism (no build step)

No ES modules. Each of the two new files is:

```js
(function () {
  Object.assign(window.Utils = window.Utils || {}, {
    escapeHtml(text) { … },
    // …
  });
})();
```

`utils.js` keeps `const Utils = { … }; window.Utils = Utils;` as-is (minus the
moved methods). Because every method is only *invoked* from page code (which
loads last) or from other Utils methods (also at call time), the only ordering
requirement is: **all three utils files load before any page script.** The three
are mutually order-independent (no method runs at load).

### The 33-page include sweep

Every page that loads utils.js (33 of them) has the identical block:

```
<script src="js/config.js"></script>
<script src="js/utils.js"></script>
```

Replace, on every one of those 33 pages, the single `utils.js` line with:

```
<script src="js/utils.js"></script>
<script src="js/utils-render.js"></script>
<script src="js/utils-context.js"></script>
```

Consistent find→replace; one pattern. This is the crux risk (33 live files, no
test net) — mitigated by the include-block uniformity and the verification below.

## Navigability pass (other four files, comments only)

Add a table-of-contents comment block at the top of `dashboard.js`, `admin.js`,
`profile.js`, `auth.js` listing the major sections with line ranges, so each is
easy to hold in context. No code moves. Zero runtime risk. (These files already
have `// =====` section dividers; the TOC just indexes them.)

## Debt note

Record in `KNOWN_TECH_DEBT.md`: page-file structural splits (dashboard/admin/
profile, and auth) are **do-it-when-you're-there** — split organically the next
time feature work takes you into the file, validated by that work's own testing,
rather than a dedicated big-bang refactor of working code with no test net.

## Out of scope

- Splitting the IIFE page files now (deferred to opportunistic, per the debt note).
- Splitting `auth.js` (cohesive; gets the navigability TOC + opportunistic split).
- Any behavior change. This is pure reorganization + comments.

## Verification plan

1. `node --check` on utils.js, utils-render.js, utils-context.js.
2. Grep-assert all 33 pages now include `utils-render.js` and `utils-context.js`
   in order immediately after `utils.js` (count === 33 for each).
3. Grep-assert no method was dropped or duplicated: the union of method names
   across the three files equals the original utils.js method set (no
   double-definitions of the same key).
4. Preview load-test a spread — `index.html` (normal), `dashboard.html` (auth),
   `admin.html` (loads utils without auth.js — the structural odd-one-out), and a
   static page — asserting `Utils.get`, `Utils.escapeHtml`, `Utils.formatContent`,
   `Utils.generateContext`, `Utils.isSafeUrl` all resolve to functions and the
   console is error-free. Exercise `formatContent` with the known XSS payload to
   confirm the render code still neutralizes it post-move.

## Success criteria

- utils.js < ~850 lines; all four XSS helpers live in `utils-render.js`.
- Every page still has a working `Utils` (all methods resolve); no page regresses.
- The two new files and the 33-page sweep are one coherent, reviewable change.
- Deploys via the push gate; page-file splits recorded as debt.
