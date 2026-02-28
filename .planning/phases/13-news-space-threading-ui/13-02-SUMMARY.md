---
phase: 13-news-space-threading-ui
plan: "02"
subsystem: admin-ui, discussion-threading
tags: [admin, news, moments, threading, reply-preview]
dependency_graph:
  requires: [moments table (is_pinned/is_active columns from 13-01), discussions/posts schema, currentPosts array in discussion.js]
  provides: [admin news curation, pin/unpin moments, hide/show moments, reply parent preview]
  affects: [admin.html, js/admin.js, js/discussion.js, css/style.css]
tech_stack:
  added: []
  patterns: [vanilla JS IIFE pattern for admin globals, currentPosts.find() for parent lookup, window.* exposure for onclick handlers]
key_files:
  created: []
  modified:
    - admin.html
    - js/admin.js
    - js/discussion.js
    - css/style.css
decisions:
  - key: Use admin-item__btn instead of new admin-btn class — matches existing admin panel button pattern
  - key: Add moments CSS inline in admin.html style block (consistent with all other admin styles)
  - key: scrollToPost uses bg-elevated highlight (not bg-raised which doesn't exist in CSS variables)
  - key: Parent preview shown on ALL replies (depth > 0), not just depth 2+
metrics:
  duration: "2 min"
  completed: "2026-02-28"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
requirements_fulfilled:
  - NEWS-01
  - THRD-01
  - THRD-02
  - THRD-03
  - THRD-04
  - THRD-05
---

# Phase 13 Plan 02: News Admin + Reply Parent Preview Summary

**One-liner:** Admin News tab with moments pin/unpin + hide/show controls, and threaded reply attribution showing parent name and first 100 chars of parent content.

## What Was Built

### Task 1: Admin News Tab (NEWS-01)

Added a News management tab to the admin dashboard that shows all moments and gives admins full curation control:

- **Tab button:** `data-tab="moments"` added after Prompts tab in the `.admin-tabs` bar
- **Panel:** `id="panel-moments"` with refresh button and `moments-list` container
- **`loadMoments()`:** Queries `moments` table ordered by `event_date DESC`, updates tab count badge
- **`renderMoments()`:** Renders each moment as an `.admin-item` card with:
  - Title + optional subtitle
  - Status badges: Active/Hidden, Pinned (conditional)
  - Date and View link
  - Pin/Unpin button (`is_pinned` toggle)
  - Hide/Show button (`is_active` toggle) — danger style when active, success when hidden
- **`toggleMomentPin(id, pinned)`:** Calls `updateRecord('moments', id, { is_pinned })` then refreshes
- **`toggleMomentActive(id, active)`:** Calls `updateRecord('moments', id, { is_active })` then refreshes
- **CSS:** Added `.status-badge`, `.status-badge--active`, `.status-badge--hidden`, `.status-badge--pinned`, `.admin-item__badges`, `.admin-item__subtitle`, `.moments-item-meta`, `.moments-item-actions` inline to admin.html `<style>` block

### Task 2: THRD-04 Reply Parent Preview

Added parent attribution display to reply posts in discussion threads:

- **CSS (style.css):** Added `.post__parent-preview`, `.post__parent-label`, `.post__parent-snippet` classes near existing threading styles (`.thread-collapse__content`)
- **Logic (discussion.js):** In `renderPost()`, after `depthClass` calculation, builds `parentPreviewHtml` by:
  1. Checking `isReply && post.parent_id`
  2. Looking up parent via `currentPosts.find(p => p.id === post.parent_id)`
  3. Extracting `ai_name || model` and first 100 chars of content
  4. Rendering the preview block between post header and post content
- **Guard:** No preview rendered if parent not found in `currentPosts` (hidden/deleted)
- **`scrollToPost(postId)`:** Global helper that smooth-scrolls to `[data-post-id="${postId}"]` with 1.5s background highlight using `bg-elevated`

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Admin News Tab | `6cf0d9d` | admin.html, js/admin.js |
| 2 | THRD-04 Reply Parent Preview | `ab85217` | js/discussion.js, css/style.css |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Used admin-item__btn instead of new admin-btn class**
- **Found during:** Task 1
- **Issue:** Plan specified `admin-btn` and `admin-btn--small` classes that don't exist in admin.html. The existing admin panel uses `admin-item__btn` and `admin-item__btn--danger/success`.
- **Fix:** Used `admin-item__btn` (existing) instead of `admin-btn` (non-existent) to match the established admin UI pattern
- **Files modified:** js/admin.js

**2. [Rule 1 - Bug] Used bg-elevated instead of bg-raised in scrollToPost**
- **Found during:** Task 2
- **Issue:** Plan used `var(--bg-raised)` in scrollToPost highlight, but `--bg-raised` is not defined in the CSS variables. The design system uses `--bg-elevated` for raised surfaces.
- **Fix:** Used `var(--bg-elevated)` instead. Also added `var(--bg-raised, var(--bg-elevated))` fallback in the CSS hover rule.
- **Files modified:** js/discussion.js, css/style.css

## Self-Check: PASSED

All created/modified files confirmed present. Both task commits verified in git history.

| Check | Result |
|-------|--------|
| admin.html | FOUND |
| js/admin.js | FOUND |
| js/discussion.js | FOUND |
| css/style.css | FOUND |
| 13-02-SUMMARY.md | FOUND |
| commit 6cf0d9d (Task 1) | FOUND |
| commit ab85217 (Task 2) | FOUND |
