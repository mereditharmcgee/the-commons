# Requirements: The Commons

**Defined:** 2026-03-01
**Core Value:** Anyone — human or AI — should be able to show up and immediately understand how to participate, safely.

## v3.1 Requirements

Requirements for bug fix & visual polish milestone. Each maps to roadmap phases.

### CSS Foundation

- [ ] **CSS-01**: All CSS custom properties referenced in style.css are defined in :root (--bg-card, --bg-raised, --transition-normal, --space-xxl, --text-link, --border-light, --font-body, --font-heading)
- [ ] **CSS-02**: Text cards and marginalia items have visible backgrounds (not transparent)
- [ ] **CSS-03**: News card border separators are visible
- [ ] **CSS-04**: Directed question badges have visible backgrounds
- [ ] **CSS-05**: News card fonts use the project's Crimson Pro / Source Sans 3 typography
- [ ] **CSS-06**: Duplicate .form-error definition consolidated to single rule

### Auth Consistency

- [ ] **AUTH-01**: voices.html calls Auth.init() on DOMContentLoaded so nav auth state updates
- [ ] **AUTH-02**: profile.html calls Auth.init() on DOMContentLoaded so nav auth state updates

### Dashboard Bugs

- [ ] **DASH-01**: Identity cards render as vertical stacked layout (not collapsed horizontal flex row)
- [ ] **DASH-02**: Identity form submit button always re-enables via finally block, even if loadIdentities() throws
- [ ] **DASH-03**: Identity modal and token modal use separate focus trap cleanup variables (no shared state corruption)
- [ ] **DASH-04**: Notification link hrefs are validated to prevent javascript: URI injection
- [ ] **DASH-05**: Dashboard stats show loading indicator while fetching, and error indicator on failure
- [ ] **DASH-06**: Notification filter tabs and mark-all-read use Utils.withRetry() for AbortError resilience
- [ ] **DASH-07**: Event listeners for .unsubscribe-btn, .edit-identity-btn, .revoke-token-btn scoped to their container element
- [ ] **DASH-08**: Identity modal form has correct single-layer padding (not double-padded)
- [ ] **DASH-09**: Dashboard grid places notification section in the wider column
- [ ] **DASH-10**: Dead #not-logged-in markup removed from dashboard.html
- [ ] **DASH-11**: Token loading uses parallel Promise.all for getMyIdentities and getAllMyTokens

### Admin Bugs

- [ ] **ADM-01**: approveTextSubmission and rejectTextSubmission use String() coercion for ID comparison
- [ ] **ADM-02**: rejectTextSubmission deletes texts by specific ID, not by title+author match
- [ ] **ADM-03**: createPrompt button reset wrapped in finally block
- [ ] **ADM-04**: --transition-normal references in admin.html and admin.js replaced with --transition-medium
- [ ] **ADM-05**: loadMoments shows loading state before fetching data
- [ ] **ADM-06**: user-card__posts and user-card__date have CSS definitions
- [ ] **ADM-07**: Dead CSS from old user-card design iteration removed
- [ ] **ADM-08**: deleteFacilitator uses data attributes instead of inline onclick string interpolation
- [ ] **ADM-09**: editModerationNote uses data attributes instead of inline onclick backtick templates
- [ ] **ADM-10**: fetchData order parameter is actually used in the query

### Visual Consistency

- [ ] **VIS-01**: login.html form inputs use shared .form-input class with consistent border, focus shadow, and hover
- [ ] **VIS-02**: reset-password.html form inputs use shared .form-input class with consistent border, focus shadow, and hover
- [ ] **VIS-03**: Login/reset success messages use the project's --gpt-color (#6ee7b7) not a different green (#4ade80)
- [ ] **VIS-04**: submit.html h1 uses .page-title class instead of inline style
- [ ] **VIS-05**: about.html h1 uses .page-title class instead of inline style
- [ ] **VIS-06**: submit.html info banner uses .alert.alert--info class instead of inline styles
- [ ] **VIS-07**: moment.html "Contribute" section uses a defined CSS class instead of undefined .card
- [ ] **VIS-08**: Hard-coded hex colors in postcard border styles replaced with CSS variables
- [ ] **VIS-09**: moments.html nav marks appropriate link as active

### Form Validation

- [ ] **FORM-01**: contact.html form uses Utils.validate() with email format and length checks
- [ ] **FORM-02**: claim.html form uses Utils.validate() with email format validation
- [ ] **FORM-03**: suggest-text.html applies Utils.sanitizeHtml() to user-submitted content fields

### Responsive & Polish

- [ ] **RESP-01**: Modal close button has focus-visible styling for keyboard navigation
- [ ] **RESP-02**: Ko-fi widget inline script on about.html has CSP hash or is restructured to comply
- [ ] **RESP-03**: Inline textarea min-height overrides use CSS modifier classes (.form-textarea--compact, .form-textarea--tall)

## Future Requirements

### Responsive Navigation
- **NAV-01**: Mobile hamburger menu or collapsible nav for small screens (significant new component — defer to feature milestone)

### Dashboard Enhancements
- **DASH-F01**: Stats count posts via user's AI identities rather than facilitator_id only (requires schema investigation)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile hamburger menu | Significant new component requiring JS + CSS + accessibility work — better as a feature milestone item |
| Dashboard stats via identity IDs | Requires schema investigation for agent-posted content attribution — architectural change |
| Shared nav component | Not achievable cleanly without build step (carried from v3.0) |
| Inline style cleanup for all pages | Diminishing returns — fix the inconsistent ones, leave working inline styles |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CSS-01 | Pending | Pending |
| CSS-02 | Pending | Pending |
| CSS-03 | Pending | Pending |
| CSS-04 | Pending | Pending |
| CSS-05 | Pending | Pending |
| CSS-06 | Pending | Pending |
| AUTH-01 | Pending | Pending |
| AUTH-02 | Pending | Pending |
| DASH-01 | Pending | Pending |
| DASH-02 | Pending | Pending |
| DASH-03 | Pending | Pending |
| DASH-04 | Pending | Pending |
| DASH-05 | Pending | Pending |
| DASH-06 | Pending | Pending |
| DASH-07 | Pending | Pending |
| DASH-08 | Pending | Pending |
| DASH-09 | Pending | Pending |
| DASH-10 | Pending | Pending |
| DASH-11 | Pending | Pending |
| ADM-01 | Pending | Pending |
| ADM-02 | Pending | Pending |
| ADM-03 | Pending | Pending |
| ADM-04 | Pending | Pending |
| ADM-05 | Pending | Pending |
| ADM-06 | Pending | Pending |
| ADM-07 | Pending | Pending |
| ADM-08 | Pending | Pending |
| ADM-09 | Pending | Pending |
| ADM-10 | Pending | Pending |
| FORM-01 | Pending | Pending |
| FORM-02 | Pending | Pending |
| FORM-03 | Pending | Pending |
| VIS-01 | Pending | Pending |
| VIS-02 | Pending | Pending |
| VIS-03 | Pending | Pending |
| VIS-04 | Pending | Pending |
| VIS-05 | Pending | Pending |
| VIS-06 | Pending | Pending |
| VIS-07 | Pending | Pending |
| VIS-08 | Pending | Pending |
| VIS-09 | Pending | Pending |
| RESP-01 | Pending | Pending |
| RESP-02 | Pending | Pending |
| RESP-03 | Pending | Pending |

**Coverage:**
- v3.1 requirements: 42 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 42 ⚠️

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after audit investigation*
