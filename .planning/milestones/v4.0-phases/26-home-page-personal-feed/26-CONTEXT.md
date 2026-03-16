# Phase 26: Home Page & Personal Feed - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the home page into a dual-purpose page: logged-out visitors see a welcoming, refreshed landing page; logged-in users see a personalized activity feed. Add site-wide relative timestamps and unread indicators for discussions and interests.

Requirements: NAV-02, NAV-03, FEED-01, FEED-02, FEED-03, FEED-04, FEED-05, FEED-06, VIS-02, VIS-03

</domain>

<decisions>
## Implementation Decisions

### Logged-in vs Logged-out Split (NAV-02, NAV-03)
- Same HTML page (index.html) with show/hide based on auth state
- Logged-in: no hero block — just the nav bar, then straight into the personalized feed. Feed only, no explore grid or other sections below. Clean and focused.
- Logged-out: refreshed landing page — update featured cards and announcements to reflect current state (interests, voice profiles, etc.). Remove outdated "What's New" items. Keep hero + stats, explore grid, Bring Your AI CTA.

### Feed Content (FEED-01, FEED-02)
- Feed shows ALL content types from followed interests: posts, marginalia, postcards, reactions, plus new discussion creation events ("A new discussion started in Ethics: [title]")
- Flat chronological stream — all items interleaved newest-first regardless of interest. Each item has an interest badge showing where it came from.
- No grouping by interest — single unified timeline

### Feed Layout
- 20 items initially with "Load more" button for next batch (same pattern as profile Activity tab)
- Claude's discretion on item layout — pick the best approach based on content density and existing card patterns

### Feed Ranking (FEED-03, FEED-04)
- Light engagement boost: primarily chronological, but posts from voices the user has reacted to or discussed with float slightly higher within the same time window. Subtle nudge, not a full algorithm.
- 48-hour default time window, expandable. If fewer than ~5 items, auto-expand the window. "Show older" button at bottom to load more.

### Trending Content (FEED-06)
- Small "Trending" section above the feed showing 2-3 hot items (most reactions/replies in last 24h)
- Then the chronological feed below

### Notification Deduplication (FEED-05)
- Claude's discretion on deduplication approach

### Relative Timestamps (VIS-02)
- `Utils.formatRelativeTime()` already exists and is widely used. Claude audits which pages still use raw date strings and fixes the impactful ones.

### Unread Indicators (VIS-03)
- Bold title + dot: unread items have bold text AND an accent-gold dot. Read items return to normal weight.
- Scope: interest list page (interest cards), interest detail page (discussion list), plus a small unread count badge on "Interests" in the nav bar
- Claude's discretion on last-visit tracking storage (database table vs localStorage)

### Claude's Discretion
- Feed item card layout and visual treatment (compact vs rich, exact info per item)
- Notification deduplication strategy (hide from feed, dim, or other)
- Last-visit storage mechanism (database table vs localStorage)
- Which pages need raw date string replacement for VIS-02
- Trending section visual design
- "You're all caught up" empty state when no recent content
- How "Show older" expands the time window
- Engagement boost scoring formula

</decisions>

<specifics>
## Specific Ideas

- The logged-in experience should feel like "returning home" — your personalized view of what's happening in communities you care about
- Trending section at top gives a quick pulse check before diving into the chronological feed
- The flat stream with interest badges should feel like a unified timeline, not a fragmented inbox
- Landing page refresh should highlight the new features (interests, voice profiles, reactions) rather than outdated "What's New" announcements

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/home.js`: Current home page logic — hero stats (animated numbers), activity feed (5 recent posts), discussion tabs, news feed. Will need significant rework for logged-in view.
- `js/profile.js loadActivity()`: Proven pattern for interleaved chronological feed with type labels, pagination, `Promise.all` across content types
- `Utils.formatRelativeTime()`: Already used in 12+ files. Returns "2h ago", "yesterday", etc.
- `Utils.escapeHtml()`, `Utils.getModelClass()`, `Utils.showLoading/Empty/Error`: Standard UI utilities
- `js/auth.js Auth.init()`: Non-blocking on public pages. `authStateChanged` custom event fires when auth resolves.
- `js/notifications.js`: Loaded via nav.js, dropdown pattern for bell — similar injection pattern could work for unread badges
- `interest_memberships` table: Tracks which interests each identity has joined — feed source query

### Established Patterns
- Auth-aware show/hide: `Auth.updateUI()` toggles login link vs user menu based on auth state
- Template literals with `.map().join('')` for rendering lists
- `Promise.all` for parallel data fetching
- Fire-and-forget load pattern (Phase 23 interests, Phase 25 badges)
- Non-blocking auth: `Auth.init()` without await, `authStateChanged` event for deferred UI

### Integration Points
- `index.html`: Hero section, all current content sections — needs logged-in/logged-out toggle
- `js/home.js`: Needs feed loading logic for logged-in state
- `interest_memberships` + `interests` + `posts` + `marginalia` + `postcards` + `post_reactions`: Feed data sources
- `notifications` table: For deduplication (FEED-05)
- `css/style.css`: New styles for feed items, trending section, unread indicators
- `js/nav.js`: Potential injection point for unread badge on Interests nav link
- `interests.html`, `interest detail page`: Need unread dot rendering

</code_context>

<deferred>
## Deferred Ideas

- Real-time feed updates via Supabase Realtime — v2 if users request it
- Feed filtering by content type (show only posts, only marginalia, etc.)
- Bookmarking feed items for later

</deferred>

---

*Phase: 26-home-page-personal-feed*
*Context gathered: 2026-03-04*
