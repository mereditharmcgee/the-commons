---
phase: 35-moment-reactions-news-engagement-pipeline
plan: "02"
subsystem: mcp-server
tags: [mcp, moments, reactions, news-pipeline, catch-up]
dependency_graph:
  requires:
    - 35-01 (moment reaction RPC and DB infrastructure)
    - 33-02 (universal reaction schema — agent_react_moment RPC)
  provides:
    - browse_moments MCP tool
    - get_moment MCP tool
    - react_to_moment MCP tool
    - catch_up moments integration
  affects:
    - mcp-server-the-commons (all four API functions + three tools + catch_up extension)
tech_stack:
  added: []
  patterns:
    - Parallel Promise.all for catch_up aggregation
    - API read function with cross-table join (moments -> discussions)
    - API read function with nested count query (discussions -> posts)
key_files:
  created: []
  modified:
    - mcp-server-the-commons/src/api.js
    - mcp-server-the-commons/src/index.js
decisions:
  - read tools (browse_moments, get_moment) placed in READ-ONLY TOOLS section, no auth required
  - react_to_moment placed near react_to_post (consistent auth-required grouping)
  - getRecentMomentsSummary added to catch_up Promise.all in parallel with notifications and feed
  - get_orientation updated with News & Moments section and step 7 in first-visit sequence
metrics:
  duration: "~2 minutes"
  completed: "2026-03-16"
  tasks_completed: 2
  files_modified: 2
---

# Phase 35 Plan 02: MCP Moments Tools Summary

**One-liner:** Four new api.js functions (browseMoments, getMoment, reactToMoment, getRecentMomentsSummary) and three MCP tools (browse_moments, get_moment, react_to_moment) plus catch_up extension completing the AI news engagement loop.

## What Was Built

### api.js — Four new exported functions

**browseMoments(limit = 10):** Queries `moments` table for active records, then cross-joins to `discussions` to find linked discussion IDs. Returns moments array with `linked_discussion_id` field.

**getMoment(momentId):** Returns full moment data including description, subtitle, external_links, and a `linked_discussion` object with id, title, and `post_count` (computed by counting posts in the linked discussion).

**reactToMoment(token, momentId, type):** Calls the `agent_react_moment` RPC with named parameters (`p_token`, `p_moment_id`, `p_type`). Returns `result[0]` matching the `reactToPost` pattern.

**getRecentMomentsSummary(days = 7):** Queries `moments` for records with `created_at >= now - days`. Returns lightweight array (id, title, event_date) suitable for catch_up summary line.

### index.js — Three new tools + catch_up extension

**browse_moments:** Read-only, no auth. Returns formatted list with title, subtitle, event_date, ID, linked_discussion_id, and pinned status.

**get_moment:** Read-only, no auth. Returns full markdown-formatted moment with external links list and linked discussion block (post count, read instructions, react instructions).

**react_to_moment:** Auth-required. Mirrors react_to_post pattern. Placed near react_to_post for consistency.

**catch_up extension:** `getRecentMomentsSummary()` added to the existing `Promise.all` as third parallel call. Appends "News (N moments this week):" section with moment titles and dates, followed by browse_moments/get_moment navigation hints.

**get_orientation update:** Added "News & Moments" entry to "What's Here" section. Added step 7 ("Browse moments") to first-visit sequence.

## Verification

- `getRecentMomentsSummary(30)` called live against production — returned 18 moments confirmed active
- `browseMoments` cross-join logic tested structurally (follows browseInterests pattern exactly)
- All seven automated checks passed (api.js: 6 checks; index.js: 7 checks)

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | c7ae307 | feat(35-02): add browseMoments, getMoment, reactToMoment, getRecentMomentsSummary to api.js |
| 2 | c098205 | feat(35-02): add browse_moments, get_moment, react_to_moment tools; extend catch_up |

## Self-Check: PASSED

- mcp-server-the-commons/src/api.js: FOUND
- mcp-server-the-commons/src/index.js: FOUND
- .planning/phases/35-moment-reactions-news-engagement-pipeline/35-02-SUMMARY.md: FOUND
- commit c7ae307: FOUND
- commit c098205: FOUND
