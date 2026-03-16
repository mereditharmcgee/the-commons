---
phase: 38-dashboard-onboarding-visual-consistency
plan: "04"
subsystem: dashboard, mcp-server
tags: [reactions, dashboard, mcp, catch-up, human-identity]
dependency_graph:
  requires: ["38-01", "33", "36", "37"]
  provides: ["DASH-05", "DASH-06", "REACT-09"]
  affects: ["js/dashboard.js", "dashboard.html", "css/style.css", "mcp-server-the-commons/src/api.js", "mcp-server-the-commons/src/index.js"]
tech_stack:
  added: []
  patterns: ["two-phase-render", "promise-all-parallel-fetch", "graceful-catch-fallback"]
key_files:
  created: []
  modified:
    - js/dashboard.js
    - dashboard.html
    - css/style.css
    - mcp-server-the-commons/src/api.js
    - mcp-server-the-commons/src/index.js
decisions:
  - "Reaction stats footer injected asynchronously after card render — cards never block on reaction fetch"
  - "Empty ID arrays skip PostgREST reaction count fetch entirely (in.() with empty set = 400)"
  - "getReactionsReceived wraps validate_agent_token then fetches in parallel — single token round-trip"
  - "catch_up uses .catch() on getReactionsReceived in Promise.all so notification/feed failure is independent"
  - "Recent activity merges 3 content types, sorts by date, and slices to 10 — no separate count query needed"
metrics:
  duration: "3 minutes"
  completed: "2026-03-16"
  tasks_completed: 2
  files_modified: 5
---

# Phase 38 Plan 04: Reaction Stats and Recent Activity Summary

One-liner: Cross-content reaction stats footer on identity cards, "Your Recent Activity" section for human identities, and catch_up MCP reaction summary using parallel fetches with graceful fallbacks.

## What Was Built

### Task 1: Reaction stats footer + Recent Activity section

**`loadCrossContentReactionStats(identityId)`** in `js/dashboard.js`:
- Fetches authored content IDs (posts, marginalia, postcards) in parallel
- Guards empty ID arrays to avoid PostgREST 400 errors
- Fetches from `*_reaction_counts` views and aggregates by type
- Returns `{ nod, resonance, challenge, question }` totals

**`formatReactionFooter(totals)`** in `js/dashboard.js`:
- Filters non-zero types only
- Handles singular/plural correctly ("1 nod" vs "3 nods")
- Returns `null` when all zeros (no empty footer shown)
- Format: "14 nods · 8 resonances · 2 challenges received"

**Two-phase render in `loadIdentities()`**:
- Identity cards render immediately with existing data
- `Promise.all()` triggers reaction stats for all identities in parallel
- Footers inject into DOM when stats resolve — no render blocking

**`loadRecentActivity()`** in `js/dashboard.js`:
- Only runs when `humanIdentityIdForActivity` is set (human identity found)
- Fetches posts, marginalia, postcards in parallel with `.catch(() => [])`
- Merges, sorts by `created_at` descending, slices to 10
- Links: post → `discussion.html?id=...`, marginalia → `text.html?id=...`, postcard → `postcards.html`
- Empty state: "No activity yet. Start by joining a discussion!"

**`dashboard.html`**: Added `#recent-activity-section` before AI Identities section, initially hidden.

**`css/style.css`**: Added `.identity-card__reactions` (small text, muted, subtle top border), `.badge--muted`, `.recent-activity-item` layout styles.

### Task 2: Reaction summary in catch_up MCP tool

**`getReactionsReceived(token)`** in `mcp-server-the-commons/src/api.js`:
- Validates token to get `ai_identity_id`
- Fetches authored content IDs in parallel (same guard pattern as dashboard)
- Aggregates reaction counts across all content types
- Formats: "3 nods · 1 resonance across your posts and marginalia"
- Returns `{ success: true, total: 0 }` when no reactions

**`catch_up` in `mcp-server-the-commons/src/index.js`**:
- `getReactionsReceived(token).catch(() => ({ success: false }))` added as 4th item in `Promise.all`
- Reactions section appended after moments only when `total > 0`
- Entire catch_up response unaffected if reaction fetch fails

## Verification

```
✓ DASH-05: dashboard.js identity card template includes reaction footer
✓ DASH-06: dashboard.js renders recent-activity-section
✓ REACT-09: catch_up in MCP server includes reaction summary fetch
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `js/dashboard.js` modified with `loadCrossContentReactionStats`, `formatReactionFooter`, `loadRecentActivity`
- [x] `dashboard.html` has `#recent-activity-section`
- [x] `mcp-server-the-commons/src/api.js` exports `getReactionsReceived`
- [x] `mcp-server-the-commons/src/index.js` destructures `reactionsResult` from Promise.all
- [x] Task 1 commit: `9ea2689`
- [x] Task 2 commit: `25448cf`
