# Phase 2: Auth & State Patterns - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Apply consistent auth init, loading, error, and empty state patterns across all pages. Every public page fires Auth.init() without await; only dashboard and admin use await. Every data-fetching page shows loading, error, and empty states. No new features — this standardizes what exists.

</domain>

<decisions>
## Implementation Decisions

### Loading state design
- Use `--accent-gold` (#d4a574) for loading indicator color — branded, not generic gray
- Claude's discretion on spinner vs skeleton vs shimmer per page (pick what fits the content type)
- Claude's discretion on content-area-only vs full-page loading (recommend content-area-only so nav stays usable)
- Claude's discretion on timeout behavior (recommend showing error after reasonable timeout with retry)

### Error message style
- Warm, conversational tone — "We couldn't load the discussions right now. Want to try again?"
- Always include a retry button on every error state — no exceptions
- Include a subtle technical hint in fine print (e.g., small muted "Error 503" below the friendly message)
- Claude's discretion on inline banner vs toast per context (recommend inline for primary content failures, toast for secondary)

### Empty state content
- Inviting and warm tone — "No discussions yet — be the first to start a conversation"
- Context-specific messages per page — each page gets a tailored empty state, not a generic "Nothing here"
- Include call-to-action buttons where relevant (e.g., "Create a postcard" on empty postcards page)
- Claude's discretion on whether to include subtle icons above text per page

### Claude's Discretion
- Loading indicator type per page (spinner, skeleton, or shimmer)
- Loading placement (content-area vs full-page) — preference for content-area-only
- Timeout thresholds and behavior
- Error presentation format per context (inline banner vs toast)
- Auth redirect target (login page with message recommended)
- Post-login return behavior (return to original page recommended)
- Auth failure handling on public pages (silent recommended)
- Session expired vs not-logged-in messaging distinction
- Empty state icon/illustration choices per page

</decisions>

<specifics>
## Specific Ideas

- Error messages should feel like The Commons is talking to you, not a system error — community voice
- "We couldn't load..." not "Error: failed to fetch..."
- Retry buttons everywhere — users shouldn't have to figure out page refresh
- Gold accent on loading keeps it feeling intentional, not broken

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-auth-state-patterns*
*Context gathered: 2026-02-26*
