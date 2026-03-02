---
phase: 20-visual-consistency-forms-polish
plan: "04"
subsystem: ui
tags: [css, html, forms, design-system, inline-styles]

# Dependency graph
requires:
  - phase: 20-visual-consistency-forms-polish
    provides: shared CSS classes (.form-input, .form-textarea--tall, .form-textarea--compact, .page-title, .alert.alert--info, .form-section)

provides:
  - login.html and reset-password.html form inputs unified under .form-input
  - Success message colors standardized to var(--gpt-color) on both auth pages
  - submit.html and about.html h1 use .page-title class
  - submit.html info banner uses .alert.alert--info
  - moment.html Contribute section uses .form-section (replaces undefined .card)
  - moments.html nav marks News link as active
  - suggest-text.html and postcards.html textarea heights use CSS modifier classes

affects: [any future changes to auth pages, form pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Use .form-input for all text/email/password inputs (replaces page-specific input classes)"
    - "Use .form-textarea--tall (min-height: 300px) and .form-textarea--compact (min-height: 100px) for textarea sizing"
    - "Use .page-title for section h1 headings (replaces inline font-size/margin styles)"
    - "Use .alert.alert--info for informational banners (replaces inline background/border styles)"
    - "Success messages use var(--gpt-color) #6ee7b7, not #4ade80"

key-files:
  created: []
  modified:
    - login.html
    - reset-password.html
    - submit.html
    - about.html
    - moment.html
    - moments.html
    - suggest-text.html
    - postcards.html

key-decisions:
  - "Kept style=\"margin: 0;\" on <p> inside .alert.alert--info since .alert does not set child paragraph margins"
  - "moment.html Contribute section switched from .card (undefined) to .form-section (defined, provides bg/border/radius/padding)"

patterns-established:
  - "Page-specific input classes (.login-form__input, .reset-form__input) removed in favor of shared .form-input"
  - "Inline min-height on textareas replaced with modifier classes for responsive consistency"

requirements-completed: [VIS-01, VIS-02, VIS-03, VIS-04, VIS-05, VIS-06, VIS-07, VIS-09, RESP-03]

# Metrics
duration: 10min
completed: 2026-03-01
---

# Phase 20 Plan 04: HTML Class Replacements & Inline Style Removal Summary

**Unified 8 HTML pages to use shared design system classes, removing page-specific input classes and inline styles for consistent form inputs, page titles, info banners, and textarea heights.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-01T00:00:00Z
- **Completed:** 2026-03-01T00:10:00Z
- **Tasks:** 4
- **Files modified:** 8

## Accomplishments

- Auth pages (login.html, reset-password.html) now share .form-input class — consistent border, focus shadow, hover across all form inputs
- Success message color standardized to var(--gpt-color) (#6ee7b7) on both auth pages — was #4ade80 which didn't match project token
- Inline `style=` page title, info banner, and card attributes replaced with .page-title, .alert.alert--info, and .form-section classes on submit.html, about.html, and moment.html
- moments.html nav now correctly marks News as active (moments is a sub-page of News)
- Textarea height overrides now use CSS modifier classes (.form-textarea--tall, .form-textarea--compact) on suggest-text.html and postcards.html

## Task Commits

Each task was committed atomically:

1. **Task 20-04-01: Replace login.html form inputs with .form-input, fix success color** - `1f93417` (feat)
2. **Task 20-04-02: Replace reset-password.html form inputs with .form-input, fix success color** - `cb45a8d` (feat)
3. **Task 20-04-03: Replace inline page titles, info banner, .card with shared CSS classes** - `6faa52e` (feat)
4. **Task 20-04-04: Replace inline textarea min-heights with CSS modifier classes** - `03f65d1` (feat)

**Plan metadata:** (docs: complete plan — committed after SUMMARY creation)

## Files Created/Modified

- `login.html` - Replaced 6x .login-form__input with .form-input; removed page-specific input CSS rules; fixed .login-success color
- `reset-password.html` - Replaced 2x .reset-form__input with .form-input; removed page-specific input CSS rules; fixed .reset-success color
- `submit.html` - h1 inline style -> .page-title; info banner inline style -> .alert.alert--info
- `about.html` - h1 inline style -> .page-title
- `moment.html` - .card + inline padding -> .form-section
- `moments.html` - Added class="active" to News nav link
- `suggest-text.html` - content textarea style min-height:300px -> .form-textarea--tall; reason textarea style min-height:100px -> .form-textarea--compact
- `postcards.html` - postcard-content textarea style min-height:100px -> .form-textarea--compact

## Decisions Made

- Kept `style="margin: 0;"` on `<p>` inside `.alert.alert--info` since .alert does not set margins on child paragraphs — all other inline styles removed from that div
- moment.html Contribute section replaced `.card` (undefined class) with `.form-section` (defined, provides background, border, border-radius, and padding)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 20 Plan 04 is the final plan in Phase 20 (Visual Consistency, Forms & Polish)
- All 15 visual consistency requirements (VIS-01 through VIS-09, RESP-01 through RESP-03, FORM-01 through FORM-03) are complete across all 4 plans
- Milestone v3.1 Bug Fix & Visual Polish is now complete

---
*Phase: 20-visual-consistency-forms-polish*
*Completed: 2026-03-01*
