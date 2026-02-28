---
phase: 13-news-space-threading-ui
plan: "01"
subsystem: news-page
tags: [news, moments, navigation, editorial, pagination, homepage]
dependency_graph:
  requires: []
  provides: [news-listing-page, news-nav-link, homepage-news-section, is_pinned-column]
  affects: [all-html-nav, index.html, js/home.js, moments-table]
tech_stack:
  added: []
  patterns: [IIFE-JS, editorial-card-design, client-side-pagination, Utils.get-pattern]
key_files:
  created:
    - news.html
    - js/news.js
    - sql/schema/09-news-pinned-admin-rls.sql
  modified:
    - css/style.css
    - js/home.js
    - index.html
    - moment.html
    - moments.html
    - about.html
    - agent-guide.html
    - api.html
    - chat.html
    - claim.html
    - constitution.html
    - contact.html
    - dashboard.html
    - discussion.html
    - discussions.html
    - login.html
    - participate.html
    - postcards.html
    - profile.html
    - propose.html
    - reading-room.html
    - reset-password.html
    - roadmap.html
    - search.html
    - submit.html
    - suggest-text.html
    - text.html
    - voices.html
decisions:
  - "Moments rebranded as News: nav link renamed from Moments to News pointing at news.html across all 26 HTML files"
  - "Client-side pagination: dataset is small (~30 moments) so all items fetched then paginated in JS for simplicity"
  - "is_pinned migration applied live to Supabase via Management API (confirmed column present)"
  - "moments.html kept accessible at its original URL (backward compatibility) but removed from nav"
  - "moment.html breadcrumb and CTA updated to news.html (moment detail is part of News section)"
metrics:
  duration: "3 min 16 sec"
  completed_date: "2026-02-28"
  tasks_completed: 2
  files_changed: 31
---

# Phase 13 Plan 01: News Page + Nav Rebrand Summary

**One-liner:** Paginated editorial news page (news.html) with is_pinned DB column, homepage "In the News" section, and sitewide nav rebrand from Moments to News across all 26 HTML files.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Database migration + news.html + js/news.js | 34bc6ab | sql/schema/09-news-pinned-admin-rls.sql, news.html, js/news.js, css/style.css |
| 2 | Homepage news section + nav update across all HTML files | 64ea080 | index.html, js/home.js, 25 HTML nav files, moment.html, moments.html |

## What Was Built

### news.html
A new editorial-style news listing page with:
- `<h1>News</h1>` and subtitle "What's happening in and around The Commons"
- `#news-list` container populated by js/news.js
- `#news-pagination` for prev/next controls
- Same CSP, external scripts, and Auth.init() pattern as moments.html
- Nav shows `<a href="news.html" class="active">News</a>`

### js/news.js
IIFE-pattern JS module that:
- Fetches all active moments ordered by `is_pinned.desc,event_date.desc`
- Fetches discussion counts in parallel via `Utils.getDiscussionsByMoment()`
- Renders paginated editorial news cards (10 per page)
- `renderNewsCard()` produces article elements with dateline, headline, deck, excerpt, discussion count, read more link
- Pinned items get `.news-card--pinned` class with gold left border and "Pinned" badge
- Exposes `window.newsPagePrev` and `window.newsPageNext` for pagination buttons

### CSS additions to css/style.css
- `.news-card` and variants (`.news-card--pinned`, `__pin-badge`, `__dateline`, `__headline`, `__deck`, `__excerpt`, `__meta`, `__discussions`, `__readmore`)
- `.news-pagination` and variants
- `.news-feed` and `.news-feed-card` compact cards for homepage

### js/home.js + index.html
- Added `loadRecentNews()` function fetching 3 most recent active moments (pinned first)
- Renders compact `.news-feed-card` items in homepage `#news-feed` container
- Added "In the News" section to index.html between "What's New" and "Latest Activity"
- "All News →" button linking to news.html

### Database (Supabase dfephsfberzadihcrhal)
- `is_pinned BOOLEAN NOT NULL DEFAULT false` column added to `moments` table (confirmed live)
- Partial index `idx_moments_is_pinned` on `moments(is_pinned) WHERE is_pinned = true`
- Admin UPDATE RLS policy on moments table for admin-panel pinning support

### Nav Rebrand (26 HTML files)
All HTML pages now have `<a href="news.html">News</a>` in nav (replacing Moments):
- Standard pages (23): sed batch update
- index.html: updated alongside news section addition
- moment.html: nav + breadcrumb ("← All News") + CTA ("View All News") updated
- moments.html: nav link updated; page remains accessible at its URL for backward compatibility

## Deviations from Plan

None — plan executed exactly as written.

## Requirements Fulfilled

- NEWS-02: Pagination with next/previous controls (10 items per page)
- NEWS-03: Each card shows title, description excerpt, event_date, discussion count
- NEWS-04: Every HTML page nav links to news.html (no Moments link remains)

## Self-Check: PASSED

All created files exist on disk. Both task commits (34bc6ab, 64ea080) confirmed in git history.
