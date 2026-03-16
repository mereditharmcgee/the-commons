---
phase: 07-profile-data-integrity
plan: 02
subsystem: profile
tags: [profile, discussions, tabs, activity-history, xss-safety]
dependency_graph:
  requires: [07-01]
  provides: [PROF-02-discussions-tab]
  affects: [profile.html, js/profile.js, css/style.css]
tech_stack:
  added: []
  patterns: [derived-data-from-posts, tab-on-demand-loading, unique-set-dedup]
key_files:
  created: []
  modified:
    - profile.html
    - js/profile.js
    - css/style.css
decisions:
  - "Discussions tab placed second (after Posts) since discussions are primary participation form"
  - "Discussion count stat derived via separate fetch after loadPosts — avoids blocking initial render"
  - "d.id (UUID) used unescaped in href — database-controlled value, not user input; only user-controlled title goes through Utils.escapeHtml()"
metrics:
  duration: ~2min
  completed: 2026-02-28
  tasks_completed: 1
  files_modified: 3
---

# Phase 7 Plan 02: Discussions Tab for Profile Activity History Summary

Discussions tab added to profile page using a two-step derived-data approach: fetch posts by identity, extract unique discussion_ids, fetch discussion titles — since the discussions table has no ai_identity_id FK.

## Objective

Add the missing Discussions tab to the profile page activity history (PROF-02), showing discussions an identity has participated in, derived from the identity's post history.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Discussions tab to profile page HTML and JS | b5a022c | profile.html, js/profile.js, css/style.css |

## What Was Built

### profile.html Changes
- Added `stat-discussions` stat box in `.profile-stats` (between Posts and Marginalia stats)
- Added `profile-tab-discussions` tab button in `.profile-tabs` (between Posts and Marginalia)
- Added `#tab-discussions` tab content container with `#discussions-list` div (between Posts and Marginalia tab panels)

### js/profile.js Changes
- Added `statDiscussions` and `discussionsList` element references
- Added `loadDiscussions()` async function:
  - Fetches identity's posts filtered by `ai_identity_id` to get `discussion_id` values
  - Deduplicates via `Set` to get unique discussion IDs
  - Fetches discussion titles/dates from `CONFIG.api.discussions` using `id=in.(...)` filter
  - Counts posts per discussion for display
  - Renders discussion items with title (linked), post count, and formatted date
  - Handles empty state (no posts, no discussions) and error state with retry
  - All user-controlled strings rendered via `Utils.escapeHtml()`
- Added discussions case to `activateTab()` for on-demand loading
- Added discussions count stat computation after `loadPosts()` — derives unique discussion count via separate fetch

### css/style.css Changes
- Added `.discussions-list` container styles
- Added `.discussion-item` article styles with border-bottom separator
- Added `.discussion-item__title a` with gold accent color and hover underline
- Added `.discussion-item__meta` for muted metadata row
- Added `.discussion-item__posts` with right margin for post count display

## Deviations from Plan

None — plan executed exactly as written.

## Success Criteria Verification

- [x] PROF-02: Profile pages show activity history including discussions the identity participated in
- [x] Discussions tab added to profile page with correct ARIA attributes (role="tab", aria-selected, aria-controls, tabindex)
- [x] Discussion list derived from posts (no schema change to discussions table)
- [x] All rendered content uses Utils.escapeHtml() for XSS safety
- [x] Empty and error states handled consistently with other tabs
- [x] No CSP hash update needed — profile.html has no inline scripts

## Self-Check: PASSED

Files verified:
- profile.html: FOUND (stat-discussions, tab-discussions button, #tab-discussions panel)
- js/profile.js: FOUND (loadDiscussions function, activateTab discussions case, statDiscussions ref)
- css/style.css: FOUND (discussion-item styles)
- Commit b5a022c: FOUND
