---
phase: 07-profile-data-integrity
plan: 01
subsystem: profile
tags: [profile, last-active, null-guards, xss-safety, sql-patch]
dependency_graph:
  requires: []
  provides: [last_active column in ai_identity_stats view, profile last-active display, null-safe profile rendering]
  affects: [profile.html, js/profile.js, sql/patches/add-last-active-to-identity-stats.sql]
tech_stack:
  added: []
  patterns: [null-guard fallbacks, textContent for safe output, Utils.escapeHtml in innerHTML]
key_files:
  created:
    - sql/patches/add-last-active-to-identity-stats.sql
  modified:
    - profile.html
    - js/profile.js
decisions:
  - "displayName declared before modelClass — ensures all name references (title, avatar, profileName) use the null-guarded value"
  - "last_active uses created_at as fallback — identities with no posts/marginalia/postcards still show meaningful recency"
  - "Activity unknown shown when both last_active and created_at are null — handles extreme legacy edge cases without crashing"
  - "textContent used for last-active display (inherently XSS-safe) — no escapeHtml needed for PROF-04 compliance"
metrics:
  duration: ~2min
  completed_date: "2026-02-27"
  tasks_completed: 1
  tasks_total: 2
  files_created: 1
  files_modified: 2
---

# Phase 7 Plan 01: Profile Data Integrity (Last Active + Null Guards) Summary

**One-liner:** Null-guarded profile rendering with GREATEST-based last_active timestamp from posts/marginalia/postcards.

## What Was Built

Task 1 of 2 complete. Task 2 requires human action (running SQL patch in Supabase).

### SQL View Patch (sql/patches/add-last-active-to-identity-stats.sql)

Extends the `ai_identity_stats` view to add a `last_active` column computed as:

```sql
GREATEST(p.last_post, m.last_marginalia, pc.last_postcard)
```

Each subquery now returns both `COUNT(*)` and `MAX(created_at)`, providing a single timestamp representing when the identity was last active across all content types. The existing `follower_count` subquery is unchanged.

### Profile HTML (profile.html)

Added `#profile-last-active` paragraph element immediately after `#profile-meta` inside `.profile-info`:

```html
<p class="profile-info__last-active" id="profile-last-active"></p>
```

### Profile JS (js/profile.js)

Key changes to the profile header rendering block:

1. **displayName guard** — `const displayName = identity.name || 'Unknown'` declared first, used in title, avatar initial, and profileName
2. **modelClass guard** — `Utils.getModelClass(identity.model || 'unknown')` prevents undefined class strings
3. **Avatar** — uses `displayName.charAt(0)` (no longer crashes if name is null)
4. **Model badge** — uses `identity.model || 'Unknown'` for display text
5. **profileMeta** — `identity.created_at ? 'Participating since ...' : 'Legacy identity'`
6. **Last active** — `identity.last_active || identity.created_at` with `'Activity unknown'` fallback, rendered via `textContent`

## Verification

All automated checks passed:

```
last_active occurrences in profile.js: 1
profile-last-active in profile.html:   1
GREATEST in SQL patch:                 1
Legacy identity in profile.js:         1
displayName occurrences in profile.js: 4
```

All innerHTML assignments confirmed using `Utils.escapeHtml()`:
- `profileAvatar.innerHTML` — uses `Utils.escapeHtml(displayName.charAt(0).toUpperCase())`
- `profileModel.innerHTML` — uses `Utils.escapeHtml(identity.model || 'Unknown')` and `Utils.escapeHtml(identity.model_version)`
- Posts/marginalia/postcards list templates — unchanged, already escapeHtml-compliant

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create SQL patch + last-active display + null guards | 6362290 | sql/patches/add-last-active-to-identity-stats.sql, profile.html, js/profile.js |

## Awaiting

Task 2 requires the user to run the SQL patch in Supabase SQL Editor. See checkpoint message for exact steps.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files exist:
- [x] `sql/patches/add-last-active-to-identity-stats.sql` — FOUND
- [x] `profile.html` (modified) — FOUND
- [x] `js/profile.js` (modified) — FOUND

### Commits exist:
- [x] `6362290` — FOUND

## Self-Check: PASSED
