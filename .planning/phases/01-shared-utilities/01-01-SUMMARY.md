---
phase: 01-shared-utilities
plan: 01
subsystem: shared-utilities
tags: [utils, validation, model-class, css, forms]
dependency_graph:
  requires: []
  provides: [Utils.getModelClass, Utils.validate, form-error-css]
  affects: [js/utils.js, js/config.js, css/style.css]
tech_stack:
  added: []
  patterns: [thin-wrapper-delegation, inline-form-validation]
key_files:
  modified:
    - js/utils.js
    - js/config.js
    - css/style.css
decisions:
  - Utils.getModelClass() delegates to getModelInfo() — no duplicate if-chain
  - openai/google aliases added to CONFIG.models so all callers benefit automatically
  - validate() renders errors inline per-field, no summary box
metrics:
  duration: ~10min
  completed: 2026-02-26
requirements: [STRC-01, STRC-10]
---

# Phase 1 Plan 01: Shared Utilities — getModelClass and validate Summary

One-liner: Added Utils.getModelClass() thin wrapper over getModelInfo(), openai/google CONFIG.models aliases, and Utils.validate() with inline per-field error rendering backed by four new CSS classes.

## What Was Built

Three files modified to establish the foundational shared helpers all pages will use in Phase 2+:

**js/config.js** — Added two alias entries immediately before `default`:
- `'openai'` → `{ name: 'GPT', class: 'gpt' }`
- `'google'` → `{ name: 'Gemini', class: 'gemini' }`

**js/utils.js** — Added two new methods on the Utils object:
- `Utils.getModelClass(model)` — returns CSS class suffix; returns `CONFIG.models.default.class` for null/falsy input; delegates to `getModelInfo()` for all other input
- `Utils.validate(fields)` — validates an array of `{ id, label, rules }` descriptors; clears prior errors, checks required/minLength/maxLength/pattern/custom rules, renders `.form-error` div inline below each invalid field, adds appropriate `--error` modifier class to the field element; returns `true` if all pass

**css/style.css** — Added four new rules after `.form-help`:
- `.form-error` — small red (#f87171) text below field
- `.form-input--error`, `.form-select--error`, `.form-textarea--error` — red border
- Focus states for all three — red border + red glow on focus

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 46723d4 | feat(01-01): add Utils.getModelClass() and openai/google aliases |
| Task 2 | 260c60f | feat(01-01): add Utils.validate() and form error CSS |

## Self-Check: PASSED

- js/utils.js contains getModelClass at line 308 — FOUND
- js/utils.js contains validate at line 329 — FOUND
- js/config.js contains openai alias at line 58 — FOUND
- js/config.js contains google alias at line 59 — FOUND
- css/style.css contains .form-error at line 888 — FOUND
- css/style.css contains .form-input--error at line 894 — FOUND
- Commit 46723d4 — FOUND
- Commit 260c60f — FOUND
