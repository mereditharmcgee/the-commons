---
phase: 01-shared-utilities
verified: 2026-02-26T12:00:00Z
status: verified
score: 3/3 must-haves verified
gaps: []
note: "search.js gap found during verification was fixed in commit c2bb0e4"
---

# Phase 1: Shared Utilities Verification Report

**Phase Goal:** The shared utils.js library has all foundational helpers so every page can use a single consistent implementation
**Verified:** 2026-02-26T12:00:00Z
**Status:** verified (gap in search.js fixed post-verification in commit c2bb0e4)
**Re-verification:** Yes -- search.js gap resolved

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Any page can call `Utils.getModelClass(model)` and get the correct CSS class -- no page defines its own copy | VERIFIED | `Utils.getModelClass()` exists at utils.js:330 and works correctly. All 6 pages migrated (5 in Plan 01-02, search.js fixed post-verification in commit c2bb0e4). `grep -rn "function getModelClass" js/` returns zero results. |
| 2 | Any page can call `Utils.validate(fields, rules)` to validate form inputs -- no inline validation scattered across pages | VERIFIED | `Utils.validate()` exists at utils.js:351-399 with all 5 rule types (required, minLength, maxLength, pattern, custom). The helper is available for any page to call. Existing ad-hoc validation in other pages was explicitly deferred to later phases per research recommendations. |
| 3 | Adding a new AI model requires a change to utils.js and config.js only -- home.js, admin.js, dashboard.js, profile.js, voices.js require no changes | VERIFIED | All 5 named files confirmed using `Utils.getModelClass()` with no local function definitions. Adding a new model to `CONFIG.models` in config.js automatically propagates. Note: search.js is not in the named list but would still need a separate update. |

**Score:** 3/3 truths fully verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `js/utils.js` | `Utils.getModelClass()` and `Utils.validate()` methods | VERIFIED | `getModelClass()` at line 330 delegates to `getModelInfo()`. `validate()` at line 351 implements all 5 rule types. No syntax errors (node --check passes). |
| `js/config.js` | `openai` and `google` alias entries in `CONFIG.models` | VERIFIED | `'openai': { name: 'GPT', class: 'gpt' }` at line 58. `'google': { name: 'Gemini', class: 'gemini' }` at line 59. |
| `css/style.css` | `.form-error`, `.form-input--error`, `.form-textarea--error`, `.form-select--error` classes | VERIFIED | `.form-error` at line 888 with `color: #f87171`. Error modifier classes at lines 894-905 with red border and focus glow. |
| `js/home.js` | Uses `Utils.getModelClass()`, no local definition | VERIFIED | `Utils.getModelClass(post.model)` at line 145. No local `function getModelClass` found. |
| `js/admin.js` | Uses `Utils.getModelClass()`, no local definition | VERIFIED | 5 call sites using `Utils.getModelClass()` at lines 434, 486, 536, 750, 819. No local `function getModelClass` found. |
| `js/dashboard.js` | Uses `Utils.getModelClass()`, no local definition | VERIFIED | `Utils.getModelClass(identity.model)` at line 155. No local `function getModelClass` found. |
| `js/profile.js` | Uses `Utils.getModelClass()`, no local definition | VERIFIED | `Utils.getModelClass(identity.model)` at line 70. No local `function getModelClass` found. |
| `js/voices.js` | Uses `Utils.getModelClass()`, no local definition | VERIFIED | `Utils.getModelClass(identity.model)` at line 51. No local `function getModelClass` found. |
| `js/search.js` | Should not have local getModelClass (per Truth 1: "no page defines its own copy") | FAILED | Local `function getModelClass(model)` at lines 17-28. Bare `getModelClass(item.model)` call at line 224. Not migrated to `Utils.getModelClass()`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `js/utils.js Utils.getModelClass()` | `js/utils.js Utils.getModelInfo()` | Delegates via `this.getModelInfo(model).class` | WIRED | Line 332: `return this.getModelInfo(model).class;` |
| `js/utils.js Utils.getModelInfo()` | `js/config.js CONFIG.models` | Iterates `Object.entries(CONFIG.models)` | WIRED | Line 310: `for (const [key, value] of Object.entries(CONFIG.models))` |
| `js/utils.js Utils.validate()` | `css/style.css .form-error` | Creates div with className `form-error` | WIRED | Line 392: `errEl.className = 'form-error';` references CSS at line 888 |
| `js/utils.js Utils.validate()` | `css/style.css .form-input--error` etc. | Adds error modifier CSS classes | WIRED | Lines 385-389: `classList.add('form-textarea--error')`, `classList.add('form-select--error')`, `classList.add('form-input--error')` |
| `js/home.js` | `js/utils.js Utils.getModelClass()` | Direct call | WIRED | Line 145: `Utils.getModelClass(post.model)` |
| `js/admin.js` | `js/utils.js Utils.getModelClass()` | 5 call sites | WIRED | Lines 434, 486, 536, 750, 819 |
| `js/dashboard.js` | `js/utils.js Utils.getModelClass()` | Direct call | WIRED | Line 155 |
| `js/profile.js` | `js/utils.js Utils.getModelClass()` | Direct call | WIRED | Line 70 |
| `js/voices.js` | `js/utils.js Utils.getModelClass()` | Direct call | WIRED | Line 51 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| STRC-01 | 01-01, 01-02 | All pages use centralized `Utils.getModelClass()` instead of local duplicates | PARTIAL | 5 of 6 pages migrated. `search.js` still has a local copy. REQUIREMENTS.md marks this as `[x] Complete` but search.js was missed. |
| STRC-10 | 01-01 | `Utils.validate()` helper added for consistent input validation | SATISFIED | `Utils.validate()` exists at utils.js:351-399 with full rule support. CSS error classes added. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `js/search.js` | 17-28 | Local `getModelClass` function with hardcoded model if-chain | Warning | Adding a new model would require updating search.js separately. Violates single-source-of-truth for model class resolution. |
| `css/style.css` | 1322-1331 | Duplicate `.form-error` CSS rule (pre-existing from accessibility phase, commit 2df1fd0e) | Info | Second definition overrides `margin-top` from `var(--space-xs)` to `0.25rem`. Not introduced by this phase; pre-existing. |

### Human Verification Required

### 1. Model Badge Colors on Live Site

**Test:** Visit https://jointhecommons.space/ and check homepage activity feed, /voices.html, any profile page, /dashboard.html (logged in), and /admin.html (admin login). Verify all model badges show correct colors (gold for Claude, green for GPT, purple for Gemini, red for Grok, blue for Llama, orange for Mistral, teal for DeepSeek).
**Expected:** All model badges render with correct provider colors. Posts with model="openai" show green GPT badge. Posts with model containing "google" show purple Gemini badge.
**Why human:** Visual appearance and CSS rendering cannot be verified programmatically from file contents alone.

### 2. Search Page Model Badges

**Test:** Visit https://jointhecommons.space/search.html, search for a term that returns results, and verify model badges appear with correct colors.
**Expected:** Badges show correct colors. However, since search.js uses a local getModelClass, any newly added model would show as "other" on search but correct on other pages.
**Why human:** Need to verify visual rendering of the search results page.

### Gaps Summary

One gap was found: `search.js` still contains a local `function getModelClass(model)` at lines 17-28 with a hardcoded if-chain, plus a bare call site at line 224. This contradicts Success Criterion 1 ("no page defines its own copy").

The 01-02 summary acknowledged this: `grep -rn "getModelClass(" js/ | grep -v "Utils\.getModelClass" -> js/search.js only (out of scope)`. The research phase (01-RESEARCH.md) identified only 5 files with local copies (home.js, admin.js, dashboard.js, profile.js, voices.js) and did not audit search.js. However, the success criterion from ROADMAP.md is absolute: "no page defines its own copy."

This is a small, mechanical fix -- remove the local function and replace the one call site with `Utils.getModelClass()`. The gap is well-scoped and does not require re-planning.

**Root cause:** The research audit missed search.js because it was added after the initial codebase was established (commit 8cad815) and was not in the original list of files known to have local getModelClass definitions.

---

_Verified: 2026-02-26T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
