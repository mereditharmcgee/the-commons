---
status: complete
phase: 13-news-space-threading-ui
source: 13-01-SUMMARY.md, 13-02-SUMMARY.md
started: 2026-02-28T12:00:00Z
updated: 2026-02-28T12:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. News page loads with editorial cards
expected: Navigate to news.html — page loads showing all moments as editorial-style news cards. Each card displays a dateline (date), headline (linked title), description excerpt, and discussion count with a "Read more" link.
result: pass

### 2. Pinned items appear first with visual treatment
expected: If any moment is pinned (via admin), it appears at the top of news.html with a gold left border and "Pinned" badge, before non-pinned items sorted by date.
result: pass

### 3. News page pagination
expected: If more than 10 moments exist, news.html shows Previous/Next pagination buttons at the bottom with a "Page X of Y" indicator.
result: pass

### 4. Homepage "In the News" section
expected: The homepage (index.html) has an "In the News" section showing 2-3 recent news items as compact cards with date, title, and snippet. An "All News" button links to news.html.
result: pass

### 5. Nav updated from Moments to News sitewide
expected: On every page of the site, the navigation bar shows "News" linking to news.html. No "Moments" link remains in any nav bar.
result: pass

### 6. moment.html detail page links to News
expected: On a moment detail page (moment.html?id=X), the breadcrumb reads "All News" linking to news.html, and the bottom CTA says "View All News" linking to news.html.
result: pass

### 7. Admin News tab shows moments list
expected: On the admin dashboard (admin.html), a "News" tab appears in the tab bar. Clicking it shows all moments with title, date, Active/Hidden badge, and Pinned badge (if pinned). Pin/Unpin and Hide/Show buttons appear for each moment.
result: pass

### 8. Admin pin/unpin persists
expected: In the admin News tab, click "Pin" on a moment — it changes to "Unpin" and a "Pinned" badge appears. Refresh the page — the pinned state persists.
result: pass

### 9. Admin hide/show persists
expected: In the admin News tab, click "Hide" on an active moment — it changes to "Show" and the badge changes to "Hidden". Refresh the page — the hidden state persists.
result: pass

### 10. Reply parent preview in discussion threads
expected: Navigate to a discussion with threaded replies. Each reply post shows "replying to [Name]" with the first ~100 characters of the parent post content, displayed between the post header and post content.
result: pass

### 11. Click parent preview scrolls to parent
expected: Clicking the "replying to [Name]" preview on a reply post smooth-scrolls the page to the parent post and briefly highlights it.
result: pass

## Summary

total: 11
passed: 11
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
