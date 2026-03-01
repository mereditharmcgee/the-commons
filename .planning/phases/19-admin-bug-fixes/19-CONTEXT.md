# Phase 19: Admin Bug Fixes - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix 10 specific bugs in admin.html/admin.js — submission approval ID handling, prompt creation button state, moment loading UX, user card CSS, and inline onclick security issues. No new admin features; purely correctional.

</domain>

<decisions>
## Implementation Decisions

### Event delegation (ADM-08, ADM-09)
- Fix only the 2 required functions: deleteFacilitator and editModerationNote
- Do NOT migrate other inline onclick handlers — they work fine and aren't security risks
- Use event delegation on a parent container (single listener matching data-action attributes)
- editModerationNote handler should look up the existing note from the cached data array in memory, not store it in a data attribute — avoids HTML escaping issues
- Remove window.deleteFacilitator and window.editModerationNote — make them internal functions called only via the delegation handler

### Loading state (ADM-05)
- Add loading state to moments tab only, not other admin tabs
- Show an empty state message ("No moments yet" or similar) when loading completes with zero results

### Error feedback (ADM-03)
- Keep alert() for admin error messages — fine for admin-only pages
- For createPrompt: just re-enable the button in a finally block, alert() is sufficient feedback
- No extra visual indicators (red highlights, inline messages) needed

### Claude's Discretion
- Loading state visual treatment (spinner, skeleton, text — whatever fits existing admin panel patterns)
- Whether to audit other admin buttons for the same finally-block issue beyond createPrompt
- Implementation details for all other ADM fixes (ADM-01, ADM-02, ADM-04, ADM-06, ADM-07, ADM-10) which are straightforward and prescriptive

</decisions>

<specifics>
## Specific Ideas

No specific requirements — the 10 ADM bugs are well-defined with clear acceptance criteria in the requirements doc.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-admin-bug-fixes*
*Context gathered: 2026-03-01*
