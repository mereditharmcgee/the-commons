---
phase: 15-directed-questions
plan: "01"
subsystem: frontend
tags: [directed-questions, submit-form, discussion, profile, badges, css]
dependency_graph:
  requires: []
  provides: [directed-to-dropdown, directed-badge-rendering, ask-voice-button]
  affects: [submit.html, js/submit.js, js/discussion.js, profile.html, js/profile.js, css/style.css]
tech_stack:
  added: []
  patterns: [bulk-fetch-surgical-update, url-param-prefill, css-custom-property-theming]
key_files:
  created: []
  modified:
    - submit.html
    - js/submit.js
    - js/discussion.js
    - profile.html
    - js/profile.js
    - css/style.css
decisions:
  - "loadDirectedData() fires non-blocking after renderPosts() — same pattern as loadReactionData()"
  - "Ask button visible to all visitors (not auth-gated) — submit.html handles auth internally"
  - "directedToSection shown/hidden on identity select change, not on page load — keeps form clean"
  - "CSS --directed-color custom property set via JS setProperty on each article — allows per-model color without inline style proliferation"
metrics:
  duration: "2 min"
  completed_date: "2026-02-28"
  tasks_completed: 2
  files_modified: 6
---

# Phase 15 Plan 01: Directed Questions UI Summary

Directed-to dropdown on submit form, "Question for [voice]" badges on directed posts in discussion threads, and "Ask a question" button on profile pages — all wired end-to-end.

## What Was Built

### Task 1: Submit form directed-to dropdown + profile Ask button

**submit.html:** Added `#directed-to-section` form group with `#directed-to` select element after the `#identity-section` block. Starts hidden (`display: none`) — shown by JS when an identity is selected.

**js/submit.js:**
- Added `directedToSection` and `directedToSelect` element refs
- Added `preselectedDirectedTo` URL param parsing (`Utils.getUrlParam('directed_to')`)
- Added `loadDirectedToOptions()` function: fetches all active AI identities, filters out user's own, populates select, pre-fills from URL param
- Called `loadDirectedToOptions()` non-blocking in `Auth.init().then()` block after `loadIdentities()`
- Updated `identitySelect.addEventListener('change')` to show/hide `#directed-to-section` and clear value on deselect
- Added `directed_to` field to form POST data when a voice is selected

**profile.html:** Added `#ask-voice-btn` anchor in `.profile-actions` div, starts hidden.

**js/profile.js:** Wires `#ask-voice-btn` href to `submit.html?directed_to=${identityId}` and shows the button immediately after profile content renders (visible to all visitors, not auth-gated).

### Task 2: Discussion thread badge rendering + CSS styles

**js/discussion.js:**
- Added `let directedIdentities = new Map()` module-level state
- Added `data-directed-to="${post.directed_to}"` attribute to `<article>` when `post.directed_to` is set
- Added `loadDirectedData()` function: collects unique directed_to UUIDs, bulk-fetches identity names via `/rest/v1/ai_identities`, surgically injects `.post__directed-badge` elements and sets `--directed-color` CSS custom property on each article
- Called `loadDirectedData()` non-blocking in two locations: after `renderPosts()` in `loadData()`, and in the `authReady` identity-load block (matching the `loadReactionData()` pattern)

**css/style.css:**
- Added `.post__directed-badge` base styles with all 7 model color variants (claude, gpt, gemini, grok, llama, mistral, deepseek) plus `other` fallback
- Added `article.post[data-directed-to]` left border accent using `var(--directed-color, var(--border-subtle))` fallback
- Added `.tab-count-badge` class (shared with Plan 15-02)

## Verification

- ESLint: `npx eslint js/submit.js js/discussion.js js/profile.js` — 0 errors, 0 warnings
- All done criteria met per plan spec

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 10abce1 | feat(15-01): add directed-to dropdown and Ask a question button |
| Task 2 | 984cf63 | feat(15-01): add directed question badges in discussion threads + CSS styles |

## Self-Check: PASSED

All 6 modified files exist on disk. Both task commits (10abce1, 984cf63) confirmed in git log.
