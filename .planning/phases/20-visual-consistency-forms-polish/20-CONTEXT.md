# Phase 20: Visual Consistency, Forms & Polish - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Make all remaining pages use shared CSS classes, validated forms, and proper keyboard/CSP behavior. Replace inline styles with existing shared classes (.form-input, .page-title, .alert--info), add form validation to contact/claim/suggest-text, fix modal keyboard accessibility, and handle Ko-fi CSP compliance. No new features — purely consistency and polish.

</domain>

<decisions>
## Implementation Decisions

### Form validation feedback (FORM-01, FORM-02, FORM-03)
- Inline error messages below the invalid field (red text, matches existing .form-input--error class)
- Validate on submit only, not on blur — avoids premature error messages while user is still filling in
- suggest-text.html sanitization happens silently — strip dangerous HTML without notifying the user
- Submit buttons should disable during submission and re-enable on success/error to prevent double-clicks

### Postcard border colors (VIS-08)
- Map hard-coded hex colors to existing model color variables (--claude-color, --gpt-color, etc.)
- Postcards show which AI wrote them, so borders should match the model identity system
- Fallback for unrecognized models: use --text-muted (neutral gray)

### Ko-fi CSP compliance (RESP-02)
- Prepare the Ko-fi script to be CSP-ready but do NOT add a full CSP header/meta tag yet
- Adding a complete CSP policy is a bigger task that could break other things — out of scope for this phase

### Modal keyboard behavior (RESP-01)
- Use the same focus-visible ring style as the rest of the site (outline: 2px solid var(--accent-gold), outline-offset)
- Do NOT trap focus inside modals — keep the fix minimal, just add focus-visible styling to close buttons
- Auto-focus the close button when a modal opens so keyboard users can immediately dismiss it
- Escape key should close modals (if not already implemented)

### Claude's Discretion
- Visual treatment for Ko-fi script restructuring (hash vs external file — whichever is more maintainable)
- Exact .form-input--error styling details beyond the existing class
- Implementation approach for VIS-01 through VIS-07 and VIS-09 (straightforward class replacements)
- Textarea modifier class naming for RESP-03 (.form-textarea--compact, .form-textarea--tall)

</decisions>

<specifics>
## Specific Ideas

- Form validation should use the existing Utils.validate() pattern where available
- Utils.sanitizeHtml() already exists for FORM-03 content sanitization
- .page-title class exists at css/style.css line 1560 — use it for VIS-04 and VIS-05
- .alert--info class exists at css/style.css line 1259 — use it for VIS-06
- Existing focus-visible selectors in css/style.css lines 1509-1526 show the established ring pattern

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 20-visual-consistency-forms-polish*
*Context gathered: 2026-03-01*
