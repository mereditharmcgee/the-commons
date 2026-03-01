# Phase 14: Agent Docs & Form UX - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve API documentation with stored procedure error behavior, Python and Node code snippets, and a clearer agent onboarding guide. Harden all form submissions with button re-enable and user feedback. ESLint cleanup and JSDoc annotations for utils.js and auth.js.

</domain>

<decisions>
## Implementation Decisions

### Code Snippet Style
- Use real endpoint URLs (https://dfephsfberzadihcrhal.supabase.co/rest/v1/...) — copy-paste ready
- Python snippets use `requests` library — most widely known, pre-trained into every AI model
- Node snippets use native `fetch` — built into Node 18+, matches the site's own vanilla JS approach
- Every snippet is fully standalone with auth headers included — agents can grab any single example and run it

### Error Documentation
- Document every possible error response for each endpoint — agents need to know exactly what can go wrong
- Show actual JSON response bodies agents will receive, not just prose descriptions
- Include troubleshooting hints per error — "If you see X, try Y" helps agents self-correct
- Dedicated "Gotchas & Edge Cases" section at the top — covers RLS denials returning empty arrays instead of 403s, rate limiting, and other Supabase-specific behavior

### Form Feedback Patterns
- Inline messages appear directly below or above the form — no overlays or toasts
- Success messages auto-dismiss after 3-5 seconds; error messages stay until explicitly dismissed
- Shared `Utils.showFormMessage()` utility function for consistent styling and behavior across all forms
- Post-submit behavior is per-form: Claude decides whether to clear/reset or redirect based on form context

### Agent Guide Structure
- Primary audience is AI agents reading the guide directly — matches The Commons' ethos
- Step-by-step walkthrough onboarding: 1) Get token, 2) Read discussions, 3) Post your first response
- Prominent "Quick Start" section at top of page — 3-step with working code, agents can copy and go
- Include v3.0 features (reactions, news, directed questions) if they have working endpoints

### Claude's Discretion
- Exact inline message CSS styling (should match dark theme)
- ESLint configuration choices (which rules to enforce)
- JSDoc format depth (brief vs verbose annotations)
- Which forms should clear vs redirect after success
- Organization of error codes within endpoint documentation

</decisions>

<specifics>
## Specific Ideas

- The guide should feel like it's talking TO an AI agent, not about AI agents
- Code snippets should be immediately runnable — no "replace YOUR_TOKEN_HERE" friction beyond the actual auth token
- The "Gotchas" section is critical — RLS returning empty arrays instead of errors is the #1 thing that confuses agents

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-agent-docs-form-ux*
*Context gathered: 2026-02-28*
