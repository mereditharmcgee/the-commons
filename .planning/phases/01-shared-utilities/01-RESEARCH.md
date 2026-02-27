# Phase 1: Shared Utilities - Research

**Researched:** 2026-02-26
**Domain:** Vanilla JS utility consolidation — function deduplication and form validation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- New models must be auto-detected from CONFIG.models — adding a model to CONFIG should be all that's needed for getModelClass to handle it
- Must support: required fields, length limits (min/max), format patterns (email, URL), and custom validation functions
- Validation errors display inline per field (red text below each invalid field)
- Silent fallback for unknown models — no console.warn or logging
- Verification must include BOTH: automated grep check (no page contains local getModelClass) AND visual spot check of affected pages

### Claude's Discretion

- getModelClass return value (CSS class string vs richer object)
- Function naming (keep getModelClass vs extend getModelInfo vs other)
- Context-specific variants vs one universal function
- Validation timing (on submit, on blur, real-time)
- Error styling within the existing design system
- Unknown model fallback style
- Migration rollout approach
- Commit strategy (one commit vs separate per concern)
- Relationship between new getModelClass and existing getModelInfo
- Backward compatibility shim decision

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STRC-01 | All pages use centralized `Utils.getModelClass()` instead of local duplicates | Full audit of all 5 duplicates completed — exact signatures and call sites documented below |
| STRC-10 | `Utils.validate()` helper added for consistent input validation | Existing validation patterns audited across all form-bearing pages — inline field error pattern confirmed |
</phase_requirements>

---

## Summary

This phase is pure internal consolidation with zero external dependencies. The codebase already has a `Utils` global object in `js/utils.js` and a `CONFIG.models` object in `js/config.js`. There are exactly 5 local `getModelClass()` function copies in `home.js`, `admin.js`, `dashboard.js`, `profile.js`, and `voices.js`. All 5 are nearly identical if-chain implementations, with one notable divergence in `admin.js` which handles `'openai'` and `'google'` aliases. Form validation currently happens ad-hoc: some pages use `alert()`, some use a shared `showMessage()` function, and none have inline per-field error messaging.

The existing `Utils.getModelInfo()` function (line 284 in utils.js) already iterates `CONFIG.models` dynamically — it is the correct foundation to build upon. A thin `Utils.getModelClass()` wrapper over `getModelInfo()` will satisfy the auto-detection requirement from CONFIG without duplicating logic. For `Utils.validate()`, the pattern should match the project's existing `.alert--error` CSS class for inline field errors; there is no existing per-field error CSS class, so one (`form-error`) will need to be defined in style.css.

**Primary recommendation:** Add `Utils.getModelClass()` as a thin wrapper over the existing `Utils.getModelInfo()`, then replace all 5 local function definitions and their call sites. Add `Utils.validate()` with on-submit validation and inline per-field error display. Migrate all 5 files in a single focused commit to reduce risk of partial states.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS | ES2020 | All logic | Project constraint — no build step, no framework |
| Supabase CDN | current | Backend | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `CONFIG.models` | in-repo | Single source of model definitions | All model-to-class lookups must derive from this |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `getModelInfo()` | New standalone `getModelClass()` | Extending avoids duplication; standalone is cleaner API but adds a second model-lookup path |
| On-submit validation | On-blur validation | On-submit is simpler, consistent with existing form patterns in the codebase |
| New `form-error` CSS class | Reusing `.alert--error` | Inline field errors need to be small/tight, `.alert` has `padding` and `margin-bottom` unsuitable for inline use — new class needed |

**Installation:** No external packages needed. This phase is pure code reorganization.

---

## Architecture Patterns

### Recommended Project Structure

No structural changes to the file tree. All new code goes in existing files:
```
js/
├── utils.js    ← add Utils.getModelClass() and Utils.validate()
├── config.js   ← no changes (CONFIG.models already correct)
├── home.js     ← remove local getModelClass, call Utils.getModelClass()
├── admin.js    ← remove local getModelClass, call Utils.getModelClass()
├── dashboard.js ← remove local getModelClass, call Utils.getModelClass()
├── profile.js  ← remove local getModelClass, call Utils.getModelClass()
└── voices.js   ← remove local getModelClass, call Utils.getModelClass()
css/
└── style.css   ← add .form-group--error and .form-error classes
```

### Pattern 1: getModelClass as a wrapper over getModelInfo

**What:** `Utils.getModelClass(model)` calls `Utils.getModelInfo(model)` and returns `.class` from the result. This means all model-lookup logic stays in one place (`getModelInfo`) and `getModelClass` is a convenience accessor.

**When to use:** Any time a CSS class suffix is needed for model-based styling.

**Recommended implementation:**
```js
// In utils.js, add after getModelInfo():

/**
 * Get the CSS class suffix for a model name.
 * Derived from CONFIG.models — adding a new model to CONFIG
 * automatically makes it available here.
 * @param {string} model - The model name (e.g. "Claude", "GPT-4")
 * @returns {string} CSS class suffix (e.g. "claude", "gpt", "other")
 */
getModelClass(model) {
    if (!model) return CONFIG.models.default.class;
    return this.getModelInfo(model).class;
},
```

**Key insight:** `getModelInfo()` already iterates `CONFIG.models` dynamically (lines 287-293 of utils.js). The return value includes `.class`. This means new models added to `CONFIG.models` are automatically supported by both `getModelInfo()` and the new `getModelClass()` wrapper — no additional changes needed anywhere.

### Pattern 2: Config.models auto-detection already works

The existing `getModelInfo()` code:
```js
getModelInfo(modelName) {
    const normalized = modelName.toLowerCase().trim();
    for (const [key, value] of Object.entries(CONFIG.models)) {
        if (key !== 'default' && normalized.includes(key)) {
            return value;
        }
    }
    return { name: modelName, class: CONFIG.models.default.class };
},
```

This iterates all entries in `CONFIG.models` using `normalized.includes(key)`. Adding a new model to CONFIG.models is sufficient — no code changes required in the lookup logic. The `'default'` key is skipped explicitly. This satisfies the auto-detection requirement.

### Pattern 3: admin.js divergence — openai and google aliases

**What:** `admin.js` line 320 has extra aliases: `m.includes('gpt') || m.includes('openai')` and `m.includes('gemini') || m.includes('google')`.

**Resolution:** Add `'openai'` and `'google'` as entries in `CONFIG.models` pointing to the appropriate class. This preserves the alias behavior while making CONFIG.models the single source of truth.

```js
// In config.js CONFIG.models — add:
'openai':  { name: 'GPT', class: 'gpt' },
'google':  { name: 'Gemini', class: 'gemini' },
```

Then `getModelInfo()` / `getModelClass()` will match these naturally via `normalized.includes(key)`.

### Pattern 4: Utils.validate() — on-submit, inline errors

**What:** A validation helper that checks field rules, clears previous errors, and renders inline error messages below each invalid field.

**When to use:** Any form `submit` handler. Called before making the API request. Returns `true` if valid, `false` if any rule fails.

**Recommended signature:**
```js
/**
 * Validate form fields against rules. Renders inline error messages
 * per field. Returns true if all rules pass.
 *
 * @param {Array<{id: string, label: string, rules: Object}>} fields
 *   - id: DOM element ID
 *   - label: human-readable field name for error messages
 *   - rules.required: boolean
 *   - rules.minLength: number
 *   - rules.maxLength: number
 *   - rules.pattern: RegExp
 *   - rules.patternMessage: string (custom message for pattern failure)
 *   - rules.custom: function(value) => string|null (returns error or null)
 * @returns {boolean} true if all fields pass all rules
 */
validate(fields) {
    let isValid = true;
    // Clear previous errors
    fields.forEach(({ id }) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('form-input--error', 'form-textarea--error', 'form-select--error');
        const existing = el.parentElement.querySelector('.form-error');
        if (existing) existing.remove();
    });

    fields.forEach(({ id, label, rules = {} }) => {
        const el = document.getElementById(id);
        if (!el) return;
        const value = el.value.trim();
        let errorMsg = null;

        if (rules.required && !value) {
            errorMsg = `${label} is required.`;
        } else if (rules.minLength && value.length < rules.minLength) {
            errorMsg = `${label} must be at least ${rules.minLength} characters.`;
        } else if (rules.maxLength && value.length > rules.maxLength) {
            errorMsg = `${label} must be ${rules.maxLength} characters or fewer.`;
        } else if (rules.pattern && !rules.pattern.test(value)) {
            errorMsg = rules.patternMessage || `${label} format is invalid.`;
        } else if (rules.custom) {
            errorMsg = rules.custom(value);
        }

        if (errorMsg) {
            isValid = false;
            el.classList.add(getErrorClass(el));
            const errEl = document.createElement('div');
            errEl.className = 'form-error';
            errEl.textContent = errorMsg;
            el.parentElement.appendChild(errEl);
        }
    });

    return isValid;
},
```

Note: `getErrorClass(el)` is a private helper (not on Utils) that maps the element's tag name to the appropriate CSS modifier — or simply one class like `form-input--error` can apply to all input types if the CSS rule is written broadly enough.

### Anti-Patterns to Avoid

- **Keeping any local getModelClass copy in any file:** Defeats STRC-01. Even one remaining copy means adding a new model still requires a 2-file change.
- **Writing a new model-lookup that doesn't use CONFIG.models:** Creates a third source of truth alongside CONFIG.models and getModelInfo.
- **Using alert() for validation errors:** Current pattern in some files — the new validate() must not use alert(). Inline per-field errors are required.
- **Displaying a single error summary at the top:** Per-field inline errors are the locked decision.
- **Clearing form-error elements on blur:** Complex and not needed — clear on next submit only (matches existing form behavior throughout the codebase).
- **Importing or bundling anything:** No build step — vanilla script tags only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Model lookup | Another if-chain | `Utils.getModelInfo()` (already CONFIG-driven) | The existing function already iterates CONFIG.models dynamically |
| HTML escaping | Custom escaper | `Utils.escapeHtml()` | Already exists and covers the XSS case |
| Validation library | Custom rule engine | `Utils.validate()` (the new helper itself) | Scope is small — external library would require CDN load and is overkill for 4 rule types |

---

## Common Pitfalls

### Pitfall 1: Incomplete migration leaves a local copy behind

**What goes wrong:** The grep verification catches it, but only if run. If one file keeps its local `getModelClass`, adding a new model to CONFIG still requires editing that file.
**Why it happens:** Files inside IIFEs (like `admin.js` and `dashboard.js`) have inner-scoped `getModelClass` — it's easy to remove the function definition but miss a call site, or vice versa.
**How to avoid:** Search for both the function declaration (`function getModelClass`) and all call sites (`getModelClass(`) separately. Update call sites to `Utils.getModelClass(` before removing the declaration.
**Warning signs:** Running `grep -r "function getModelClass" js/` after migration returns any results.

### Pitfall 2: admin.js openai/google aliases silently dropped

**What goes wrong:** After migration, posts with `model = "openai"` or `model = "Google Gemini"` get the default `'other'` class instead of `'gpt'`/`'gemini'`.
**Why it happens:** Current `admin.js` has `m.includes('gpt') || m.includes('openai')` — the vanilla `getModelInfo()` doesn't handle 'openai' or 'google'.
**How to avoid:** Add `'openai'` and `'google'` entries to `CONFIG.models` before replacing admin.js's function.
**Warning signs:** Visual spot check of the admin page shows posts from 'openai' model with wrong badge color.

### Pitfall 3: home.js uses Utils.get() with non-prefixed path

**What goes wrong:** `home.js` line 131 calls `Utils.get('posts', ...)` (no leading slash, no `/rest/v1/`) which differs from other callers who use `CONFIG.api.posts`. This is a pre-existing issue unrelated to this phase, but worth noting to avoid accidentally "fixing" it and breaking something.
**How to avoid:** Do not touch home.js's API call patterns during this phase. Only replace the `getModelClass` function and its calls.

### Pitfall 4: form-error CSS class missing

**What goes wrong:** `Utils.validate()` injects a `<div class="form-error">` but no CSS rule exists for it — errors appear as unstyled text.
**Why it happens:** This is a new class not in the existing design system.
**How to avoid:** Add `.form-error` to `style.css` before or alongside the validate() implementation. Use the error color `#f87171` (matching `.alert--error`) at small font size, below the field.

### Pitfall 5: dashboard.js getModelClass called before it's defined

**What goes wrong:** In `dashboard.js`, `getModelClass` is defined at line 178 but called at line 155 (inside `loadIdentities()` which is called before the definition). This works because `function` declarations are hoisted. When migrating to `Utils.getModelClass()`, hoisting is no longer relevant — the call to `Utils.getModelClass()` will work as long as utils.js is loaded before dashboard.js (which it already is).
**How to avoid:** Simply replace the call site — no ordering change needed.

---

## Code Examples

Verified patterns from the existing codebase:

### Current getModelClass duplicates — exact signatures

**home.js** (lines 18-29): Has null guard (`if (!model) return 'other'`). No openai/google aliases.
```js
function getModelClass(model) {
    if (!model) return 'other';
    const m = model.toLowerCase();
    if (m.includes('claude')) return 'claude';
    if (m.includes('gpt')) return 'gpt';
    if (m.includes('gemini')) return 'gemini';
    if (m.includes('grok')) return 'grok';
    if (m.includes('llama')) return 'llama';
    if (m.includes('mistral')) return 'mistral';
    if (m.includes('deepseek')) return 'deepseek';
    return 'other';
}
```

**admin.js** (lines 316-327): Has null guard. Has `openai`/`google` ALIASES — unique divergence.
```js
function getModelClass(model) {
    if (!model) return 'other';
    const m = model.toLowerCase();
    if (m.includes('claude')) return 'claude';
    if (m.includes('gpt') || m.includes('openai')) return 'gpt';
    if (m.includes('gemini') || m.includes('google')) return 'gemini';
    if (m.includes('grok')) return 'grok';
    if (m.includes('llama')) return 'llama';
    if (m.includes('mistral')) return 'mistral';
    if (m.includes('deepseek')) return 'deepseek';
    return 'other';
}
```

**dashboard.js** (lines 178-188): No null guard (model is assumed non-null at call sites).
```js
function getModelClass(model) {
    const m = model.toLowerCase();
    if (m.includes('claude')) return 'claude';
    ...
    return 'other';
}
```

**profile.js** (lines 133-143): No null guard.

**voices.js** (lines 62-72): No null guard.

### Call sites — what needs to change

| File | Line(s) | Current call | New call |
|------|---------|-------------|---------|
| home.js | 159 | `getModelClass(post.model)` | `Utils.getModelClass(post.model)` |
| admin.js | 346, 398, 620, 674 | `getModelClass(post.model)` / `getModelClass(identity.model)` | `Utils.getModelClass(...)` |
| dashboard.js | 155 | `getModelClass(identity.model)` | `Utils.getModelClass(identity.model)` |
| profile.js | 70, 71, 73 | `getModelClass(identity.model)` | `Utils.getModelClass(identity.model)` |
| voices.js | 31 | `getModelClass(identity.model)` | `Utils.getModelClass(identity.model)` |

### Existing form validation pattern (for contrast)

Current approach in `suggest-text.js` (on-submit, no inline errors, no shared helper):
```js
if (!data.title) {
    showMessage('Please enter a title.', 'error');
    return;
}
```

Current approach in `text.js` and `postcards.js` (uses `alert()`):
```js
alert('Please fill in the required fields.');
```

The new `Utils.validate()` replaces both patterns with inline per-field errors.

### Required CSS to add to style.css

```css
/* Inline form field validation error */
.form-error {
    font-size: 0.8125rem;
    color: #f87171;
    margin-top: var(--space-xs);
}

.form-input--error,
.form-select--error,
.form-textarea--error {
    border-color: #f87171;
}

.form-input--error:focus,
.form-select--error:focus,
.form-textarea--error:focus {
    border-color: #f87171;
    box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.15);
}
```

This uses `#f87171` (the same red as `.alert--error`) and `var(--space-xs)` (already used in `.form-help`), so it is consistent with the existing design system. The error message font size matches `.form-help` at `0.8125rem`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-file getModelClass if-chains | Single Utils.getModelClass() backed by CONFIG.models | This phase | Adding a new model is a 2-file change (config.js + style.css) instead of a 7-file change |
| alert() / top-of-form error banners | Inline per-field .form-error elements | This phase | Users see which specific field failed; consistent UX across all forms |

---

## Open Questions

1. **Should Utils.validate() also be used to replace existing validation in submit.js, text.js, postcards.js during Phase 1?**
   - What we know: STRC-10 says "add" Utils.validate() — it doesn't specify where to use it in phase 1
   - What's unclear: Phase 2 (page standardization) may be the right phase for adoption across all pages
   - Recommendation: Phase 1 adds the helper only. Phase 2 or a dedicated cleanup phase migrates existing ad-hoc validation to use it. This keeps Phase 1 focused and reduces risk.

2. **Should getModelClass handle a null/undefined model?**
   - What we know: home.js and admin.js both guard (`if (!model) return 'other'`), but dashboard.js, profile.js, and voices.js do not. In practice, `model` comes from database records where it could be null for legacy data.
   - Recommendation: Add the null guard in `Utils.getModelClass()` — `if (!model) return CONFIG.models.default.class;`. This is strictly safer and matches the most defensive existing copy.

---

## Sources

### Primary (HIGH confidence)
- Direct code audit of `js/utils.js` — verified existing `getModelInfo()` logic and CONFIG.models iteration
- Direct code audit of `js/config.js` — verified CONFIG.models structure and all 9 model keys
- Direct code audit of `js/home.js`, `js/admin.js`, `js/dashboard.js`, `js/profile.js`, `js/voices.js` — all 5 local `getModelClass` functions read and compared
- Direct code audit of `css/style.css` — verified `.alert--error` color (`#f87171`), `.form-help` font size, `.form-input`/`.form-textarea`/`.form-select` classes, `--space-xs` variable usage

### Secondary (MEDIUM confidence)
- Code audit of `js/suggest-text.js`, `js/submit.js`, `js/text.js`, `js/postcards.js` — current validation patterns documented

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external dependencies, all verified by direct code read
- Architecture: HIGH — getModelInfo() wrapper approach verified against actual code; CONFIG.models structure confirmed
- Pitfalls: HIGH — all pitfalls derived from direct observation of actual code divergences and existing patterns

**Research date:** 2026-02-26
**Valid until:** 2026-04-26 (stable vanilla JS codebase — no fast-moving dependencies)
