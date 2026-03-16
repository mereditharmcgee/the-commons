---
phase: 02-auth-state-patterns
plan: 01
subsystem: ui
tags: [vanilla-js, css, error-handling, empty-state, retry-ux]

# Dependency graph
requires: []
provides:
  - Utils.showError() with optional retry button and muted technical detail
  - Utils.showEmpty() with optional CTA link-button
  - CSS classes alert__message, alert__retry-btn, alert__technical, empty-state__cta
  - grid-column span on .empty-state for grid container compatibility
affects:
  - 02-auth-state-patterns (Plans 02 and 03 depend on these helpers)
  - All pages using Utils.showError() or Utils.showEmpty()

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Options-object pattern for backward-compatible helper upgrades (third/fourth param is destructured object with defaults)
    - Event listener wired after innerHTML (never inline onclick)
    - CSS grid-column 1/-1 on block children is safe no-op in non-grid contexts

key-files:
  created: []
  modified:
    - js/utils.js
    - css/style.css

key-decisions:
  - "Default error message changed to warm tone: 'Something went wrong. Want to try again?' per prior user decision"
  - "Options objects used for new params to avoid breaking existing positional callers"
  - "grid-column 1 / -1 added directly to .empty-state rule — safe in non-grid contexts, no new rule needed"
  - "escapeHtml applied to ctaHref to prevent XSS via injected URLs"

patterns-established:
  - "Options-object extension: Add { optA, optB } = {} as final param to extend helpers without breaking callers"
  - "Post-innerHTML event wiring: always query and addEventListener after setting innerHTML, never use onclick attribute"

requirements-completed: [STRC-04, STRC-05, STRC-06]

# Metrics
duration: 8min
completed: 2026-02-27
---

# Phase 2 Plan 01: Shared State Helper Upgrades Summary

**Utils.showError() and Utils.showEmpty() upgraded with backward-compatible retry button, technical hint, and CTA link-button options plus 5 supporting CSS rules**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-27T04:02:06Z
- **Completed:** 2026-02-27T04:10:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Utils.showError() now accepts `{ onRetry, technicalDetail }` — renders a wired retry button and/or muted fine-print on demand
- Utils.showEmpty() now accepts `{ ctaLabel, ctaHref }` — renders a primary CTA link-button when both are provided
- All existing callers (2-arg showError, 3-arg showEmpty) continue working unchanged via default parameters
- 5 new CSS rules added: `.alert__message`, `.alert__retry-btn`, `.alert__technical`, `.empty-state__cta`, and `grid-column: 1 / -1` on `.empty-state`

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade Utils.showError() and Utils.showEmpty() signatures** - `892c908` (feat)
2. **Task 2: Add CSS classes for retry button, technical hint, empty state CTA, grid span** - `c8fb53a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `js/utils.js` - showError and showEmpty upgraded with options-object params, JSDoc updated
- `css/style.css` - 5 new rules: .alert__message, .alert__retry-btn, .alert__technical, .empty-state__cta, grid-column on .empty-state

## Decisions Made
- Default message changed to warm tone ("Something went wrong. Want to try again?") consistent with prior user decision about friendly error messaging
- Options-object pattern chosen for both helpers so any future additions remain non-breaking
- `escapeHtml` applied to `ctaHref` to prevent XSS through injected anchor URLs
- `grid-column: 1 / -1` appended directly to the existing `.empty-state` rule rather than a new media query or wrapper — safe because browsers ignore grid properties in non-grid contexts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plans 02 and 03 can now use `Utils.showError(container, msg, { onRetry })` and `Utils.showEmpty(container, title, text, { ctaLabel, ctaHref })` without any ad-hoc HTML
- No blockers

## Self-Check: PASSED

- FOUND: js/utils.js
- FOUND: css/style.css
- FOUND: .planning/phases/02-auth-state-patterns/02-01-SUMMARY.md
- FOUND commit: 892c908 (Task 1)
- FOUND commit: c8fb53a (Task 2)

---
*Phase: 02-auth-state-patterns*
*Completed: 2026-02-27*
