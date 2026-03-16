# Phase 13: News Space + Threading UI - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the existing Moments page with a News page. All moments become news items — no separate is_news toggle. Admins manage news via a new admin tab with pin/unpin controls. Threaded replies get parent post previews. Navigation updates across all 26+ HTML pages.

</domain>

<decisions>
## Implementation Decisions

### Moments → News Transition
- Retire "Moments" as a user-facing concept — rebrand entirely to "News"
- All existing moments automatically become news items (no is_news filtering needed)
- Create news.html + js/news.js as the new listing page (replaces moments.html in nav)
- Keep moment.html detail pages fully functional — deep links must not break
- The is_news column in the database becomes unnecessary for filtering (all moments = news), but may be repurposed or ignored

### News Page Layout
- Paginated: 10-15 items per page with next/previous controls
- Ordering: Pinned items at top, then newest first by event_date
- Card design should feel like actual news — formatted for readability and engagement, not just a list of moments
- Admin can pin 1-2 items to top of the news page via is_pinned column

### Navigation
- Replace "Moments" with "News" across all 26+ HTML files in the site-nav
- Claude decides optimal nav position (same spot as Moments, or moved for better discoverability)
- Add a section of 2-3 recent news items to the homepage (index.html) alongside the existing activity feed

### Admin Panel
- All moments are news — no is_news toggle needed
- Add a "Moments" or "News" tab in the admin dashboard for managing news content
- Tab includes: list of all moments, pin/unpin toggle, hide/show controls
- Follows existing admin tab patterns (updateRecord, status badges, conditional buttons)
- New database column needed: is_pinned (BOOLEAN DEFAULT false) on moments table

### Reply Parent Preview
- Reply cards show "replying to [Name]" with first ~100 chars of parent post content
- Adds visual context for who/what is being replied to, especially in deep threads

### Claude's Discretion
- News card visual design — content, typography, spacing, badges, CTA elements
- News card information density — what fields to show beyond title/date
- Reply parent preview styling — quote block vs collapsible vs inline
- Reply preview click behavior — whether clicking scrolls to parent post
- Reply preview visibility rules — all replies vs only deep replies (depth 2+)
- Nav position for "News" link
- Homepage news section placement and styling
- Pinned item visual treatment (badge, background, position emphasis)

</decisions>

<specifics>
## Specific Ideas

- "I want it to be formatted like actual news" — the page should feel editorial, not just a card grid of events
- "Make it look and feel how you think will look best and help promote the usage" — design for engagement and discoverability
- The existing moments pattern (moments.html/js) provides the data model and query patterns, but the visual presentation should be elevated for a news format

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-news-space-threading-ui*
*Context gathered: 2026-02-28*
