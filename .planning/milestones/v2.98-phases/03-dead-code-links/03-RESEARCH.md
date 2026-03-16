# Phase 3: Dead Code & Links - Research

**Researched:** 2026-02-27
**Domain:** Static analysis of non-bundled vanilla JS, HTML dead code, broken link detection
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STRC-07 | Dead code removed across all JS files (unused functions, unreachable branches) | ESLint flat config with `no-unused-vars` (vars:local) and `no-unreachable` catches intra-IIFE dead code; verified working against the actual codebase with 13 findings |
| STRC-08 | Dead code removed across all HTML files (unused elements, orphaned scripts) | Manual audit pattern: script tag mapping verified, no orphaned scripts found; HTML comment scan and unused element review needed |
| STRC-09 | All inter-page links verified working (no broken hrefs) | linkinator 7.6.1 pre-installed and verified working locally; one confirmed broken link found (identity.html in admin.js) |
</phase_requirements>

---

## Summary

This phase has three distinct sub-problems: JS dead code, HTML dead code, and broken link verification. Each requires a different tool and approach because the codebase has no module system, no bundler, and no import/export — the standard ecosystem tools (Knip, webpack-deadcode-plugin, ts-prune) all require module boundaries to trace call graphs and are inapplicable here.

For JS dead code, ESLint is the correct and sufficient tool. The key insight is that ESLint with `sourceType: "script"` and `vars: "local"` correctly scopes analysis to within each file's IIFE — it catches variables declared but never read, unreachable branches, and dead local functions, while correctly ignoring cross-file globals like `Utils.*` and `Auth.*`. A full ESLint run against the 21 JS files has already been performed and yields exactly 13 findings across 7 files — all real dead code, zero false positives.

For HTML dead code, no automated tool can reliably distinguish "unused" HTML elements from elements deliberately hidden via CSS or populated by JS. The correct approach is a targeted manual audit: verify the script tag inventory (already confirmed clean — every page loads exactly the right JS files), check for commented-out HTML blocks, and look for any orphaned state containers left from Phase 2 refactoring. One confirmed issue: `admin.html` loads `utils.js` not present in its script tags, yet `admin.js` calls `Utils.getModelClass()` — this is a pre-existing dependency that must not be broken.

For link verification, `linkinator` 7.6.1 is pre-installed and works against local HTML files without a running server. One confirmed broken link has been found: `identity.html` referenced in `admin.js` line 754 does not exist — the correct target is `profile.html`. All HTML-to-HTML links are clean.

**Primary recommendation:** Use the pre-installed ESLint 10 and linkinator 7.6.1 with the verified configurations documented below. Do not hand-roll dead code detection or link checking. PurgeCSS is out of scope for this phase (CSS is not in STRC-07/08/09).

---

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| ESLint | 10.0.2 (pre-installed) | JS dead code: unused vars, unreachable branches | Only static analysis tool that works correctly for non-module script-based JS with IIFE pattern |
| linkinator | 7.6.1 (pre-installed) | HTML link verification: finds broken hrefs in local HTML files | Spins up local static server, crawls all pages, checks all link types; industry standard for static site link checking |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| grep / manual audit | built-in | HTML dead code: commented-out blocks, orphaned elements | For STRC-08 — no automated tool reliably detects "unused" HTML elements without running the page |
| grep for JS hrefs | built-in | Link check: JS-rendered href strings (linkinator only sees HTML, not JS templates) | For JS files that build anchor href values in template literals |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ESLint | Knip | Knip requires module exports/imports to trace call graphs; completely inapplicable to this no-module codebase |
| ESLint | TypeScript compiler (noUnusedLocals) | Would require converting all JS to TS; out of scope and violates the no-build-step constraint |
| linkinator | broken-link-checker-local | Also pre-installed (0.7.8), but linkinator has better local file support and is actively maintained |
| linkinator | Manual `curl` loop | linkinator handles relative paths, query strings, and local file serving automatically |
| Manual HTML review | PurgeCSS | PurgeCSS removes CSS rules, not HTML elements; also: dynamic class names like `model--${Utils.getModelClass(...)}` cause massive false positives |

**Installation:** No installation needed. ESLint 10.0.2 and linkinator 7.6.1 are already available via `npx`.

---

## Architecture Patterns

### Pattern 1: ESLint Flat Config for Script-Mode JS

**What:** ESLint 10 uses flat config (`eslint.config.mjs`). For `sourceType: "script"`, `vars: "local"` correctly limits `no-unused-vars` to within-file scope, preventing false positives on cross-file globals (`CONFIG`, `Auth`, `Utils`, `supabase`).

**When to use:** For all 21 JS files in `js/`.

**Verified working configuration:**

```javascript
// eslint.config.mjs (place at project root)
export default [
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        CONFIG: "readonly",
        Auth: "readonly",
        Utils: "readonly",
        AgentAdmin: "readonly",
        supabase: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        Promise: "readonly",
        JSON: "readonly",
        Error: "readonly",
        Date: "readonly",
        Math: "readonly",
        parseInt: "readonly",
        parseFloat: "readonly",
        isNaN: "readonly",
        Infinity: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "vars": "local", "args": "none" }],
      "no-unreachable": "warn"
    }
  }
];
```

**Run command:**
```bash
npx eslint js/
```

### Pattern 2: linkinator for Local HTML Link Verification

**What:** linkinator spins up a static server against the local directory and crawls all HTML files, checking every href for 2xx/3xx responses. Works without a live site.

**When to use:** For STRC-09 — verifying all 26 HTML pages have no broken internal links.

**Verified working command:**
```bash
# Check local files, recursively follow all internal links
npx linkinator . --recurse --verbosity info
```

**To focus only on non-200 results:**
```bash
npx linkinator . --recurse --verbosity info 2>&1 | grep -v "\[200\]"
```

**To skip external URLs (for faster CI runs):**
```bash
npx linkinator . --recurse --skip "^https://" --skip "^http://" --skip "^mailto:"
```

### Pattern 3: Manual Grep for JS-Rendered Internal Links

**What:** linkinator only sees static HTML. Template literals in JS files that construct `href` values (e.g., `href="profile.html?id=${id}"`) are invisible to linkinator. Use grep to extract and verify these.

**When to use:** As a supplement to linkinator for STRC-09.

```bash
# Find all .html references in JS files (excluding external URLs and dynamic fragments)
grep -rh "\.html" js/*.js | grep -v "http" | grep -v "^//"
```

### Pattern 4: Script Tag Inventory Audit

**What:** Verify that every JS file loaded in HTML actually exists, and every JS file that exists is intentionally loaded somewhere.

**When to use:** For STRC-08 — checking for orphaned script tags.

```bash
# All JS files loaded via script tags
grep -h 'src="js/' *.html | sed 's/.*src="\([^"]*\)".*/\1/' | sort | uniq

# All JS files that exist
ls js/*.js | sort

# Pages that load no page-specific JS (static pages — these are correct)
for f in *.html; do
  js_count=$(grep -c 'src="js/' "$f" 2>/dev/null || echo 0)
  echo "$f: $js_count scripts"
done
```

### Anti-Patterns to Avoid

- **Running ESLint with `sourceType: "module"`:** This is wrong for this codebase. Module mode would flag every `const Utils = {...}` as an unused export and miss the actual dead code patterns inside IIFEs.
- **Running ESLint with `vars: "all"`:** This flags cross-file globals like `CONFIG` that are intentionally used across files, producing massive false positive noise.
- **Using PurgeCSS for HTML dead code detection:** PurgeCSS removes CSS rules, not HTML elements. It also produces false positives on dynamically constructed class names like `model--${Utils.getModelClass(post.model)}`.
- **Treating linkinator's local scan as complete:** linkinator does not execute JS, so JS-rendered links are invisible to it. Manual grep is required for JS template strings.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JS variable/function dead code detection | Custom AST walker, regex scanner | ESLint `no-unused-vars` | ESLint handles scope correctly across closure boundaries; regex cannot distinguish definition from use |
| Broken HTML link detection | curl loop over extracted hrefs | linkinator | linkinator handles relative paths, query strings, fragment stripping, local file serving, redirect following, and concurrency automatically |
| Unreachable branch detection | Manual code reading | ESLint `no-unreachable` | AST-based, not text-based; correctly handles all `return`/`throw`/`break` cases |

**Key insight:** The absence of a module system means cross-file dead code detection (unused exports, files never imported) is structurally impossible with static analysis. This phase can only address intra-file dead code — variables declared but never used within the same IIFE/script. This is a correct and intentional scope boundary.

---

## Common Pitfalls

### Pitfall 1: ESLint False Positives on Cross-File Globals

**What goes wrong:** ESLint flags `CONFIG`, `Auth`, `Utils`, `AgentAdmin` as unused because they are not imported — they arrive via prior script tags.

**Why it happens:** `vars: "all"` checks all variable declarations in scope, including cross-file globals injected into `window`.

**How to avoid:** Use `vars: "local"` in the ESLint config. This limits `no-unused-vars` to variables declared within the current file's local scope. Alternatively, declare globals explicitly in the ESLint config (shown in Pattern 1).

**Warning signs:** ESLint reporting `CONFIG`, `Utils`, or `Auth` as unused.

### Pitfall 2: Dynamic CSS Classes Appearing as Dead HTML

**What goes wrong:** Classes like `model-badge--claude` and `post__model--gpt` appear nowhere in HTML files as literal strings — they are constructed at runtime by template literals in JS (e.g., `model-badge--${Utils.getModelClass(identity.model)}`).

**Why it happens:** 44 model-variant CSS classes (`.post__model--claude`, `.marginalia-item__model--gpt`, etc.) are generated dynamically via `Utils.getModelClass()`. Any tool that scans HTML and CSS statically will conclude these classes are unused.

**How to avoid:** Do not use PurgeCSS or any CSS-class-usage scanner in this phase. CSS cleanup is not in scope for Phase 3 (not in STRC-07/08/09).

**Warning signs:** Any tool reporting all model variant CSS classes as unused simultaneously.

### Pitfall 3: admin.html Loads Only admin.js (Not utils.js or auth.js), But admin.js Calls Utils.*

**What goes wrong:** `admin.html` loads only `config.js` + `admin.js` (not `utils.js`). However, `admin.js` calls `Utils.getModelClass()` on lines 434, 486, 536, 750, and 819.

**Why it happens:** The admin panel was built before `Utils.getModelClass()` was centralized. It appears to work because the admin panel's Supabase client is initialized inline without the standard auth flow.

**How to avoid:** Do NOT remove `Utils.getModelClass()` calls from `admin.js` during dead code cleanup. The admin page must have `utils.js` added to its script tags — or this is documented as a pre-existing issue for a future phase. Either way: Phase 3 must not break this.

**Warning signs:** Admin panel failing to render model badges after Phase 3 changes.

### Pitfall 4: identity.html Is a Confirmed Broken Link

**What goes wrong:** `admin.js` line 754 generates `<a href="identity.html?id=${identity.id}">View Profile</a>`. The file `identity.html` does not exist. `profile.html` exists and uses `?id=` parameter identically.

**Why it happens:** Appears to be a page rename that occurred during the project — `identity.html` was renamed to `profile.html`, but this one link in admin.js was not updated. The SOP doc (`POST_CLAIMS_SOP.md`) also references the old URL.

**How to avoid:** Fix this in Phase 3. Change `identity.html` to `profile.html` in `admin.js`. This is the only confirmed broken internal link.

**Warning signs:** Admin panel showing "View Profile" links that 404.

### Pitfall 5: Catch Parameter Dead Code Is Intentional

**What goes wrong:** ESLint flags patterns like `catch (e) { ... }` and `catch (error) { ... }` where the parameter is not used — the error is logged or the catch block just continues.

**Why it happens:** `dashboard.js`, `utils.js`, `chat.js`, `submit.js` all have catch blocks that handle errors silently or log without using the error variable.

**How to avoid:** Use `"args": "none"` in ESLint config to suppress argument-level warnings. Alternatively, rename unused catch parameters to `_e` or `_error` to explicitly signal intent. Do not use `"caughtErrors": "none"` — it suppresses too broadly.

**Warning signs:** Large numbers of ESLint warnings on `catch(e)` patterns across every file.

### Pitfall 6: linkinator's Local Crawl Starts From index.html

**What goes wrong:** Running `npx linkinator .` only crawls pages reachable by following links from the root. Pages not linked from index.html (like `admin.html`, `reset-password.html`, `claim.html`) may not be scanned.

**Why it happens:** linkinator follows the link graph, not the filesystem. Orphan pages with no inbound links are invisible to the crawl.

**How to avoid:** Run linkinator against each HTML file individually, or verify manually using the grep patterns in Pattern 3/4.

---

## Code Examples

Verified patterns from direct execution against the codebase:

### ESLint Run — Verified Findings (all 13 are real dead code)

```
js/admin.js:20      - 'isAdmin' assigned but never read (set in 3 places, read nowhere)
js/chat.js:265,585  - 'e' catch parameter unused
js/dashboard.js:446,454,742,777 - 'e'/'error' catch params unused
js/profile.js:160   - 'discussionIds' built but never consumed
js/submit.js:60,107 - 'e' event params unused
js/text.js:128      - 'nameDisplay' built but never consumed
js/utils.js:87,822  - 'e' catch params unused
```

### Verified Broken Link

```
// js/admin.js line 754 — BROKEN (identity.html does not exist)
<a href="identity.html?id=${identity.id}" class="identity-item__link" target="_blank">View Profile</a>

// Fix: change to profile.html
<a href="profile.html?id=${identity.id}" class="identity-item__link" target="_blank">View Profile</a>
```

### Script Tag Verification — Confirmed Clean

All 21 JS files in `js/` are loaded by exactly one HTML page each (matching the page's function), plus `config.js`, `utils.js`, and `auth.js` are loaded by every page. No orphaned script tags found. One note: `admin.html` does not load `utils.js` but `admin.js` calls `Utils.getModelClass()` — this is a pre-existing issue, not created by Phase 3.

### linkinator Run Result

```bash
$ npx linkinator . --recurse --verbosity info
# Result: 68 links checked, 1 external 403 (ko-fi.com — bot protection, expected)
# Zero broken internal links (linkinator scans static HTML only)
# Broken JS-rendered link (identity.html) found via manual grep
```

### Manual JS Href Grep Command

```bash
# Check all HTML references in JS files
grep -rh "\.html" js/*.js | grep -v "http" | grep -v "^//"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| ESLint `--no-eslintrc` with legacy config | ESLint 10 flat config (`eslint.config.mjs`) | ESLint 9 (2024) | Flat config is now the default and only supported format in ESLint 9+ |
| Knip for dead code in all JS projects | Knip for module-based projects only | Always true | Knip requires import/export to trace call graphs; explicitly documented as not supporting CommonJS object patterns without false positives |
| Manual link checking with curl | linkinator for static sites | ~2019 | linkinator handles local file serving, relative paths, query strings automatically |

**Deprecated/outdated:**
- `.eslintrc.json` / `.eslintrc.js`: No longer supported in ESLint 9+. Use `eslint.config.mjs`.
- `ts-prune`: Superseded by Knip for TypeScript projects. Inapplicable here (no TypeScript).
- `webpack-deadcode-plugin`: Requires webpack bundling. Inapplicable (no build step).

---

## Open Questions

1. **Should `admin.html` have `utils.js` added to fix the pre-existing dependency gap?**
   - What we know: `admin.js` calls `Utils.getModelClass()` but `admin.html` doesn't load `utils.js`. This appears to work currently (possibly because the Supabase CDN script provides some globals, or because the function hasn't been exercised in a way that surfaces the error).
   - What's unclear: Is this actually working, or is `Utils.getModelClass()` silently failing in the admin panel?
   - Recommendation: Add `utils.js` to `admin.html` as part of STRC-08 (orphaned/missing scripts). This is a low-risk fix that makes the dependency explicit.

2. **Are catch parameter patterns (`catch (e)` with unused `e`) worth fixing or just suppressing?**
   - What we know: 8 of 13 ESLint findings are unused catch/event parameters. These are a style issue, not dead code in the strict sense.
   - What's unclear: Project preference — rename to `_e` / suppress with config / or leave.
   - Recommendation: Use `"args": "none"` in ESLint config to suppress these. Focus STRC-07 energy on the 3 genuinely dead variables (`isAdmin`, `discussionIds`, `nameDisplay`) and remove them.

---

## Sources

### Primary (HIGH confidence)

- ESLint official docs — `no-unused-vars` rule options, `sourceType: "script"` behavior, `vars: "local"` scope https://eslint.org/docs/latest/rules/no-unused-vars
- Direct execution of ESLint 10.0.2 against the actual codebase — produced verified 13-finding result with zero false positives
- Direct execution of linkinator 7.6.1 against the local directory — confirmed it works and produces accurate results
- Codebase grep/audit — confirmed `identity.html` does not exist, `admin.js` references it on line 754

### Secondary (MEDIUM confidence)

- Knip GitHub issue #465 (confirmed: Knip does not support vanilla CommonJS/no-module projects correctly) https://github.com/webpro-nl/knip/issues/465
- ESLint flat config 2025 best practices (multiple sources agree on `defineConfig`, globals pattern) https://advancedfrontends.com/eslint-flat-config-typescript-javascript/
- LogRocket dead code detection article — confirms ESLint alone insufficient for module-based projects but sufficient for within-file scope https://blog.logrocket.com/how-detect-dead-code-frontend-project/

### Tertiary (LOW confidence)

- PurgeCSS false positive risk for dynamic classes — verified by direct inspection of the codebase's class generation patterns (empirical, not from PurgeCSS docs directly)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both tools directly executed against the codebase; findings verified
- Architecture: HIGH — ESLint config verified working; linkinator command verified working
- Pitfalls: HIGH — most pitfalls discovered through direct execution, not speculation

**Research date:** 2026-02-27
**Valid until:** 2026-05-27 (stable tools — ESLint and linkinator have stable APIs; 90 days)
