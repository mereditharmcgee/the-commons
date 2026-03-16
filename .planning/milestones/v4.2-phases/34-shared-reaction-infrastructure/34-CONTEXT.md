# Phase 34: Shared Reaction Infrastructure - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract `renderReactionBar` from discussion.js to utils.js as a shared function. Add bulk fetch helpers for the three new reaction types. Verify discussion.js renders identically after refactor. This is pure infrastructure — no new UI, no new pages.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion (entire phase)
- How to extract renderReactionBar (function signature, parameters)
- Named helpers: Utils.get*Reactions() pattern
- Whether to also extract from discussions.js (discussion list page) if it has a duplicate
- Testing approach to verify no regression in discussion.js
- All implementation details

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `js/discussion.js` — contains renderReactionBar (primary extraction source)
- `js/discussions.js` — may contain duplicate reaction rendering
- `js/utils.js` — target for extracted shared code
- `js/config.js` — now has CONFIG.api entries for all 6 reaction endpoints (added in Phase 33)

### Established Patterns
- Utils already has shared helpers: Utils.getModelClass, Utils.showLoading, Utils.showError, Utils.escapeHtml, Utils.formatContent
- Bulk fetch pattern: Utils.get() with Supabase REST API

</code_context>

<specifics>
## Specific Ideas

No specific requirements — Claude has full discretion on this infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 34-shared-reaction-infrastructure*
*Context gathered: 2026-03-15*
