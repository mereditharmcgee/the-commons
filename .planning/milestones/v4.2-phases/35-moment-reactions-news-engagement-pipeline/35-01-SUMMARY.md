---
phase: 35-moment-reactions-news-engagement-pipeline
plan: "01"
subsystem: moment-page
tags: [reactions, moments, news, admin, discussions]
dependency_graph:
  requires: [34-01]
  provides: [moment-reaction-ui, moment-linked-discussion-ui, admin-create-discussion]
  affects: [moment.html, js/moment.js, js/admin.js]
tech_stack:
  added: []
  patterns:
    - two-phase reaction render (count-only first, interactive after auth)
    - admin check via admins table query (no Auth.isAdmin)
    - module-scoped linkedMomentsMap for O(1) linked discussion lookup
key_files:
  created:
    - sql/patches/news-current-events-interest.sql
  modified:
    - moment.html
    - js/moment.js
    - js/admin.js
decisions:
  - linked-discussion-admin-check: Admin check on moment page uses admins table query after authReady — avoids blocking page render
  - news-interest-lookup: "News & Current Events" interest fetched by name at runtime, not hardcoded UUID
  - load-linked-parallel: loadLinkedDiscussion runs concurrently with authReady wait via Promise
  - reaction-toggle: same-type click deletes row; different-type does delete-then-insert (no upsert header needed)
metrics:
  duration_seconds: 198
  completed_date: "2026-03-16T00:32:54Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 35 Plan 01: Moment Reactions and Linked Discussion UI Summary

**One-liner:** Reaction bar + linked discussion preview wired into moment page, admin "Create Discussion" button in both moment page and admin panel, using Utils.renderReactionBar with dataPrefix='moment'.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add reaction bar and linked discussion preview to moment page | 014a173 | moment.html, js/moment.js |
| 2 | Add Create Discussion button to admin panel moments tab | d45162b | js/admin.js, sql/patches/news-current-events-interest.sql |

## What Was Built

### Task 1: Moment Page UI

**moment.html:**
- Added `<div id="moment-reactions" class="reaction-bar-container"></div>` inside `#moment-content` after `#moment-links`
- Added `<div id="linked-discussion" class="linked-discussion-container"></div>` after reactions
- Hidden `#comments-section` with `display: none; visibility: hidden; height: 0; overflow: hidden` (data preserved in DB)

**js/moment.js** (full rewrite from ~269 to ~335 lines):
- Two-phase reaction render: count-only bar renders immediately after moment loads (before auth resolves); interactive bar with active-type awareness re-renders after `await authReady`
- `loadLinkedDiscussion(momentId, momentTitle)`: fetches via `Utils.getDiscussionsByMoment`, renders post-count card with CTA when discussion exists, checks admin status and renders "Create discussion for this moment" button for admins when no discussion, empty for non-admins
- `handleCreateMomentDiscussion()`: looks up "News & Current Events" by name, inserts discussion with `moment_id` FK, re-renders linked discussion section on success
- `attachReactionHandler()`: event delegation on `[data-moment-id]` buttons; same-type click deletes row (toggle off), different type does delete-then-insert; re-fetches counts and re-renders bar after each action
- Module-scoped `currentActiveType` and `currentIdentity` track reaction state
- Legacy comment functions preserved as dead code (hidden in UI)

### Task 2: Admin Panel

**js/admin.js:**
- Added `linkedMomentsMap` module-scoped variable (`moment_id -> discussion_id`)
- `loadMoments()` now parallel-fetches moments and linked discussions (`.not('moment_id', 'is', null)`) in a `Promise.all`
- `renderMoments()` renders "View Discussion" link for linked moments, "Create Discussion" button for unlinked
- Added `case 'create-linked-discussion'` to event delegation switch
- Implemented `createLinkedDiscussion(momentId, momentTitle)`: looks up "News & Current Events" interest by name, inserts discussion with `interest_id`, `moment_id`, `is_active: true`, reloads moments list on success

**sql/patches/news-current-events-interest.sql:**
- Idempotent insert for "News & Current Events" interest with slug `news-current-events`
- ON CONFLICT (name) DO NOTHING

## Deviations from Plan

None — plan executed exactly as written.

The plan noted that both moment.html and admin panel should show the "Create Discussion" button (per explicit user decision noted in plan). Implemented exactly as specified.

## Notes

**DB seed pending manual execution:** The `sql/patches/news-current-events-interest.sql` patch needs to be run in the Supabase SQL Editor or via MCP execute_sql to create the "News & Current Events" interest in the database. Both `createLinkedDiscussion` functions (in moment.js and admin.js) gracefully handle the case where the interest doesn't exist yet with a clear error message: "News & Current Events interest not found. Please create it first."

## Self-Check

Verified:
- moment.html contains `moment-reactions` and `linked-discussion` divs
- moment.html comments-section is hidden
- js/moment.js calls `Utils.renderReactionBar`, `Utils.getMomentReactions`, `Utils.getDiscussionsByMoment` with `dataPrefix: 'moment'`
- js/moment.js has `isAdmin` check via `admins` table query
- js/admin.js has `create-linked-discussion` action, `createLinkedDiscussion` function, `News & Current Events` lookup, `linkedMomentsMap`
- All automated verification checks passed

## Self-Check: PASSED
