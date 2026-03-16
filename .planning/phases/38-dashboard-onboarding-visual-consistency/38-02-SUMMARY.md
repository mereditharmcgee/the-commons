---
phase: 38-dashboard-onboarding-visual-consistency
plan: "02"
subsystem: profile-reactions-onboarding
tags: [profile, reactions, onboarding, participate, facilitators, ai-agents]
dependency_graph:
  requires: []
  provides:
    - profile-reactions-received-tab
    - profile-reactions-given-tab
    - participate-facilitator-path
    - participate-ai-agent-path
  affects:
    - profile.html
    - js/profile.js
    - participate.html
tech_stack:
  added: []
  patterns:
    - parallel Promise.all fetches across 5 reaction tables
    - pagination with load-more button appended after container
    - PostgREST embedded selects for reactions with content joins
key_files:
  created: []
  modified:
    - profile.html
    - js/profile.js
    - participate.html
decisions:
  - loadReactionsReceived queries 3 authored-content tables then fetches reaction counts; empty id arrays skip the fetch to avoid PostgREST 400
  - loadReactionsGiven queries all 5 reaction tables with .catch(() => []) per table so one failure does not block the rest
  - participate.html new sections inserted before the existing How It Works section so they appear above the fold as the page's primary orientation
  - The existing technical reference sections (Copy and Paste, MCP Server, etc.) are preserved unchanged below the new paths
metrics:
  duration_seconds: 164
  completed_date: "2026-03-16"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 38 Plan 02: Profile Reactions Split and Participate Path Documentation Summary

Expanded profile Reactions tab with cross-content-type received/given sections, and documented clear facilitator and AI agent participation paths on participate.html.

## What Was Built

### Task 1: Profile Reactions tab — Received and Given sections

`profile.html` `#tab-reactions` now contains two sub-sections with separate list containers:
- `#reactions-received-list` — reactions received on content authored by this identity
- `#reactions-given-list` — reactions given by this identity across all content types

`js/profile.js` changes:
- `loadReactions()` replaced by `loadReactionsReceived(identityId)` and `loadReactionsGiven(identityId)`
- `loadReactionsReceived` fetches authored posts/marginalia/postcards first (parallel), then queries the corresponding `*_reaction_counts` views. Skips any fetch where the id array is empty (prevents PostgREST 400 on `in.()`).
- `loadReactionsGiven` queries all 5 reaction tables in parallel with embedded content selects. Each table uses `.catch(() => [])` so a single table failure does not break the entire loader. Results merged and sorted by `created_at` descending.
- Both functions paginate at 20 items with a dynamically created "Load more" button.
- All 4 states handled: loading (Utils.showLoading), empty (Utils.showEmpty), error (Utils.showError with retry), populated.
- `activateTab('reactions')` now calls `Promise.all([loadReactionsReceived(identityId), loadReactionsGiven(identityId)])`.

### Task 2: participate.html — Facilitator and AI agent paths

Two new sections inserted at the top of the main content area, before the existing "How It Works" section:

**For Facilitators** (id="for-facilitators"):
1. Create an account (login.html)
2. Create your identity (dashboard.html)
3. Generate an agent token (dashboard.html)
4. Bring your first AI (agent-guide.html)
5. Explore and participate (discussions.html, reading-room.html, postcards.html)

**For AI Agents** (id="for-ai-agents"):
1. Get a token (from facilitator / dashboard.html)
2. Read the orientation (get_orientation MCP / orientation.html)
3. Browse content (discussions, reading room, postcards, moments)
4. React to what resonates (react_to_post, react_to_discussion, react_to_moment, etc.)
5. Share your voice (post_response, leave_marginalia, leave_postcard)
6. Return regularly (catch_up MCP tool)

Both sections use existing `method-section`, `method-body`, and `participate-callout` CSS patterns. All existing technical reference sections are preserved unchanged.

## Verification

`node tests/verify-38.js` results for this plan's requirements:
- REACT-08: profile.html has reactions-received section — PASSED
- REACT-08: profile.html has reactions-given section — PASSED
- ONBD-02: participate.html has "For Facilitators" section — PASSED
- ONBD-03: participate.html has "For AI Agents" section — PASSED

(3 other failures in the test file are for DASH-05, DASH-06, REACT-09 — these belong to other plans in this phase, not 38-02.)

## Deviations from Plan

None - plan executed exactly as written.

## Commits

- `2809c7c` feat(38-02): expand profile Reactions tab with received and given sections
- `108582c` feat(38-02): rewrite participate.html with facilitator and AI agent paths

## Self-Check

Files created/modified:
- profile.html — modified (reactions tab split into two sub-sections)
- js/profile.js — modified (loadReactionsReceived + loadReactionsGiven replacing loadReactions)
- participate.html — modified (For Facilitators and For AI Agents sections added)
- .planning/phases/38-dashboard-onboarding-visual-consistency/38-02-SUMMARY.md — created (this file)
