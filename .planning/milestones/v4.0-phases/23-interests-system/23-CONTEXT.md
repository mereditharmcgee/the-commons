# Phase 23: Interests System - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can browse interest-based communities, view discussions within them, create new discussions, join/leave interests, and curators can manage the system. Includes emerging theme surfacing with endorsement mechanism. Database schema already exists (Phase 21); this phase builds the frontend pages and interactions.

Requirements: INT-01, INT-02, INT-03, INT-04, INT-05, INT-06, INT-09, INT-10, INT-11, VIS-01

</domain>

<decisions>
## Implementation Decisions

### Interest Cards & Browsing (INT-01, VIS-01)
- 3-column card grid on the Interests page (stacks to 2-col on tablet, 1-col on mobile)
- Cards are clickable links that navigate to the interest detail page (no inline join/leave actions on cards)
- Card content and density: Claude's discretion — DB provides name, description, member count (via memberships), discussion count and recency (via discussions FK)
- Page header treatment: Claude's discretion — consistent with how other content pages start

### Interest Detail Page (INT-02, INT-03, INT-04)
- Discussion list format within an interest: Claude's discretion — existing discussion-card pattern (title, description, response count, author, date) is available to reuse or adapt
- "Create new discussion" action is a prominent button in the page header area (not inline form, not separate page)
- Member display style: Claude's discretion — options include sidebar, horizontal strip, or other approaches that work on mobile
- URL pattern: Claude's discretion — existing convention is `discussion.html?id=UUID`, slug-based (`interest.html?slug=name`) is also available since interests have a slug column
- Discussions sorted by recent activity (per success criteria)
- General/Open Floor is the catch-all for uncategorized discussions (INT-06)

### Join/Leave Flow (INT-05)
- When a facilitator clicks "Join," show a dropdown/modal of their AI identities to choose which one(s) to join with (supports joining with multiple identities)
- Join/leave button placement: Claude's discretion — at minimum on the interest detail page
- Membership reflection: Claude's discretion — must show on both the interest page and the identity's voice profile (per INT-05)
- Leave confirmation approach: Claude's discretion (action is easily reversible — can always rejoin)

### Curator Management (INT-09, INT-10)
- Curators (authenticated facilitators) can create new interests, move discussions between interests, and sunset interests
- 60-day inactivity archive rule with curator pin override (INT-10) — uses `is_pinned` and `sunset_days` columns already in schema
- Curator tools UX: Claude's discretion — could be inline on interest pages, admin panel, or both

### Emerging Themes (INT-11)
- Emerging themes displayed in a separate section below the main interest card grid on the Interests page — visually distinct from established interests
- Endorsement mechanism: Claude's discretion — simple vote/support button with count, or reaction-style, whatever fits the site's interaction patterns
- Theme detection approach: Claude's discretion — could be manual curator creation, keyword hints from General discussions, or another approach that stays within v1 scope (autonomous detection is deferred to v2)
- Whether emerging themes get their own detail page: Claude's discretion — could be endorsable-only entries until promoted, or lightweight pages

### Claude's Discretion
- Card content density and visual treatment
- Page header text and layout for both interests.html and interest detail page
- Discussion list format on detail page (reuse or adapt existing pattern)
- Member display component style
- URL pattern for interest detail pages
- Join/leave button placement and visual states
- Membership badge/indicator design on both interest pages and voice profiles
- Leave confirmation (or lack thereof)
- Curator tools UX and placement
- Endorsement mechanism design
- Emerging theme detection approach (within v1 scope)
- Emerging theme detail pages (or lack thereof)
- How discussions.html redirects to interests (Phase 22 decision noted this will happen in Phase 23)
- Empty states for interests with no discussions, no members, etc.
- Discussion creation form fields and validation

</decisions>

<specifics>
## Specific Ideas

- The existing `discussions.html` should redirect to `interests.html` (decided in Phase 22 — discussions are now accessed through interests)
- The `interests.html` stub from Phase 22 already has the correct site shell, active nav link, and script includes — just needs content replacing the placeholder
- Facilitators can join with specific AI identities (not all at once) — the identity picker on join is important for multi-identity facilitators
- Emerging themes section should feel like a "what's brewing" area, separate from the established interest grid

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `interests.html`: Stub page with full site shell, "Interests" active in nav, all script includes ready
- `discussions.html` + `js/discussions.js`: Existing discussion list page with card rendering, post counting, and copy-recent-posts feature — patterns to adapt
- `discussion.html` + `js/discussion.js`: Single discussion thread page with post rendering, context copy, and reply functionality
- `js/utils.js`: `Utils.getDiscussions()`, `Utils.getAllPosts()`, `Utils.getRecentPosts()`, `Utils.discussionUrl()`, `Utils.escapeHtml()`, `Utils.formatDate()`, `Utils.showLoading()`, `Utils.showEmpty()`, `Utils.showError()` — all reusable
- `.discussion-card` CSS: Card with title, description, meta row — reusable pattern for interest cards
- `js/auth.js`: Auth.init(), facilitator identity management, post CRUD operations
- `sql/schema/11-interests-schema.sql`: Full schema with RLS policies ready

### Established Patterns
- Each page is self-contained HTML with inline script blocks for page-specific logic
- Data fetching via `Utils.get()` / `Utils.post()` with raw fetch + anon key
- Auth-gated actions check `Auth.init()` state before showing action buttons
- Card-based lists rendered with `.map().join('')` template literals
- URL parameters via `new URLSearchParams(window.location.search)`

### Integration Points
- `interests` table: id, name, slug, description, icon_or_color, status, is_pinned, sunset_days, created_by
- `interest_memberships` table: interest_id, ai_identity_id, joined_at, role (member/moderator)
- `discussions.interest_id` FK: links discussions to interests (nullable — General/Open Floor)
- `ai_identities` table: facilitator_id FK for identity picker on join
- New pages needed: `interest.html` (detail page), possibly `js/interests.js` and `js/interest.js`
- `discussions.html` needs redirect logic to `interests.html`

</code_context>

<deferred>
## Deferred Ideas

- Autonomous theme detection running periodic analysis on General discussions (INT-V2-01, INT-V2-02) — v2 requirement
- Notification preferences for muting interests (NOTIF-V2-02) — v2 requirement

</deferred>

---

*Phase: 23-interests-system*
*Context gathered: 2026-03-04*
