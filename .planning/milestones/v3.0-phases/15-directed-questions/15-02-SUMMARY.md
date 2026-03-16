---
phase: 15-directed-questions
plan: "02"
subsystem: frontend
tags: [directed-questions, profile, questions-tab, count-badge, css]
dependency_graph:
  requires: [15-01]
  provides: [questions-tab, unanswered-count-badge, loadQuestions]
  affects: [profile.html, js/profile.js, css/style.css]
tech_stack:
  added: []
  patterns: [non-blocking-badge-iife, two-query-answered-detection, tab-panel-lazy-load]
key_files:
  created: []
  modified:
    - profile.html
    - js/profile.js
    - css/style.css
decisions:
  - "loadQuestions() uses two separate queries (directed_to + ai_identity_id) to determine answered status — avoids server-side join complexity"
  - "Count badge IIFE fires non-blocking after loadPosts() — same fire-and-forget pattern as loadFacilitatorName()"
  - "DIRQ-04 covered by existing notify_on_directed_question DB trigger from Phase 11 — no new JS required"
metrics:
  duration: "3 min"
  completed_date: "2026-03-01"
  tasks_completed: 1
  files_modified: 3
---

# Phase 15 Plan 02: Questions Tab on Profile Pages Summary

Questions tab added to profile pages showing directed posts split into Waiting and Answered sections, with a non-blocking unanswered count badge on the tab label before it is clicked.

## What Was Built

### Task 1: Questions tab HTML + loadQuestions() + count badge

**profile.html:**
- Added 6th tab button `#profile-tab-questions` with `data-tab="questions"` after the Reactions tab, inside the `.profile-tabs` tablist
- Includes `<span id="questions-count-badge" class="tab-count-badge" style="display:none;">` for the pre-click unanswered count
- Added `#tab-questions` content panel with `#questions-list` inner div, hidden by default

**js/profile.js:**
- Added `questionsList` element reference alongside other list refs
- Added `loadQuestionCount()` IIFE (non-blocking, fires after `loadPosts()`):
  - Fetches all posts with `directed_to=eq.{identityId}`
  - Determines which discussions the target voice has replied in
  - Shows unanswered count on `#questions-count-badge` if > 0
- Added `loadQuestions()` function:
  - Fetches directed posts with full field set (`select: 'id,discussion_id,content,model,...'`)
  - Queries target voice's replies in those same discussion_ids to determine answered status
  - Fetches discussion titles via `Utils.getDiscussions()`
  - Renders two sections: Waiting (unanswered) and Answered
  - Each question shows model badge, author name, discussion link, relative timestamp, content snippet (200 chars)
  - Shows empty state "No questions yet" when no directed questions exist
- Added `else if (tabName === 'questions') { await loadQuestions(); }` branch to `activateTab()`

**css/style.css:**
- Added `.questions-section-title` styles (section headers for Waiting/Answered)
- Added `.question-item` card styles with border, padding, background
- Added `.question-item__meta`, `__author`, `__discussion`, `__time`, `__content` sub-element styles
- `.tab-count-badge` was already present from Plan 15-01 — not duplicated

**DIRQ-04 coverage:** The `notify_on_directed_question` DB trigger (Phase 11, migration `08-v3-column-additions.sql`) fires on INSERT to posts when `directed_to IS NOT NULL`. It creates a `directed_question` notification for the identity's facilitator. The existing notification bell in auth.js renders these. No new JS needed.

## Verification

- ESLint: `npx eslint js/profile.js` — 0 errors, 0 warnings
- All done criteria met per plan spec
- Arrow key navigation cycles through all 6 tabs (Home → Posts, End → Questions)

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | fb3f1d6 | feat(15-02): add Questions tab to profile pages with Waiting/Answered split |

## Self-Check: PASSED

All 3 modified files (profile.html, js/profile.js, css/style.css) exist on disk. Task commit fb3f1d6 confirmed in git log.
