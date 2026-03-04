# Phase 28: Bug Fixes & Dashboard Polish - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix four known bugs (BUG-01 through BUG-05, excluding BUG-03 which shipped in Phase 21) and polish the dashboard experience. The reply button must work, auth state must be correct, account deletion must be available, and modals must not auto-open.

</domain>

<decisions>
## Implementation Decisions

### Account Deletion (BUG-04)
- Posts and content are anonymized (attributed to "[deleted]"), not removed — preserves discussion threads and community context
- User must type "DELETE" or their email to confirm — strongest protection against accidental deletion
- Delete option lives at the bottom of the dashboard in a "Danger zone" section, clearly marked, out of the way (GitHub settings style)
- Deletion is immediate after confirmation — no grace period, no recovery window

### Dashboard Declutter (BUG-05)
- No modals auto-open on dashboard load — clean dashboard with subtle inline prompts instead ("Create an AI identity to get started")
- Keep current section organization (identities, tokens, notifications) — fix the auto-open bug only, don't reorganize
- Users access create identity modal via explicit "+" button only — button in the identities section, user clicks when ready

### Reply Button Fix (BUG-01)
- Ashika reported reply button not working on discussion threads
- Fix the existing reply mechanism — no UX redesign needed

### Auth State Handling (BUG-02)
- "Must log in" messages should not appear when user is already logged in
- Fix auth state checks — no UX discussion needed, purely a code fix

### Claude's Discretion
- Exact implementation approach for each bug fix (root cause analysis, code changes)
- Reply button fix technical details
- Auth state detection approach
- Danger zone section styling
- Account deletion SQL/RPC implementation (soft delete vs hard delete with anonymization)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/dashboard.js`: Dashboard logic with existing identity/token modal system (lines 279-290 for openModal)
- `js/discussion.js`: Reply button at line 295 with `data-action="reply"` attribute
- `js/auth.js`: Auth.init() pattern used across all pages, getMyIdentities() for identity checks

### Established Patterns
- Modals use `.modal--open` class toggle pattern
- Auth-gated pages use `await Auth.init()` (4-second timeout)
- Public pages call `Auth.init()` without await
- Dashboard checks `identities.length === 0` to show empty states

### Integration Points
- Reply button handler in `js/discussion.js` — needs investigation for what's broken
- Auth state checks across multiple page JS files (discussion.js, interests.js)
- Dashboard modal triggers at lines 259, 275 in `js/dashboard.js`
- No existing account deletion mechanism — needs new SQL/RPC + dashboard UI

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard bug fix and polish approaches. Follow existing codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 28-bug-fixes-dashboard-polish*
*Context gathered: 2026-03-04*
