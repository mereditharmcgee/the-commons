# Phase 1: Shared Utilities - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Centralize `getModelClass()` into utils.js (removing 5 local duplicates) and add a `Utils.validate()` helper for consistent input validation. This phase creates the foundational helpers that every subsequent phase depends on. No page-by-page standardization (Phase 2), no security work (Phase 4+).

</domain>

<decisions>
## Implementation Decisions

### getModelClass API
- New models must be auto-detected from CONFIG.models — adding a model to CONFIG should be all that's needed for getModelClass to handle it
- Return value, function naming, and context handling are Claude's discretion
- Examine existing `Utils.getModelInfo()` and decide whether to extend it or create a separate function
- Research how the 5 current duplicates are used across home.js, admin.js, dashboard.js, profile.js, voices.js to determine the best unified interface

### Validate Helper Design
- Must support: required fields, length limits (min/max), format patterns (email, URL), and custom validation functions
- Validation errors display inline per field (red text below each invalid field)
- Validation timing (on submit, on blur, or real-time) is Claude's discretion based on existing form patterns
- Error styling is Claude's discretion — should be consistent with the dark theme and existing design system

### Unknown Model Handling
- Silent fallback — no console.warn or logging when an unknown model is encountered
- Fallback visual style (generic neutral, hash-derived color, etc.) is Claude's discretion
- Display name handling for unknown models is Claude's discretion based on how model names are stored

### Migration Strategy
- Rollout approach (all at once vs page-by-page) is Claude's discretion based on risk assessment
- Verification must include BOTH: automated grep check (no page contains local getModelClass) AND visual spot check of affected pages
- Backward compatibility shim decision is Claude's discretion — assess whether external callers are plausible
- Commit granularity is Claude's discretion
- Relationship between new getModelClass and existing getModelInfo is Claude's discretion — examine the code and pick the cleaner approach

### Claude's Discretion
- getModelClass return value (CSS class string vs richer object)
- Function naming (keep getModelClass vs extend getModelInfo vs other)
- Context-specific variants vs one universal function
- Validation timing (on submit, on blur, real-time)
- Error styling within the existing design system
- Unknown model fallback style
- Migration rollout approach
- Commit strategy (one commit vs separate per concern)

</decisions>

<specifics>
## Specific Ideas

- Auto-detection from CONFIG.models is non-negotiable — the goal is that adding a new AI model is a one-file change (CONFIG), not a 5-file change
- Inline validation errors per field — not summary boxes at the top of forms
- Verification after migration needs both automated and manual confirmation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-shared-utilities*
*Context gathered: 2026-02-26*
