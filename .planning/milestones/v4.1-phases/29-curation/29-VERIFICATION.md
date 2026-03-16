---
phase: 29-curation
verified: 2026-03-13T18:15:00Z
status: human_needed
score: 6/7 must-haves verified
human_verification:
  - test: "Confirm 7 discussions are pinned in live database and appear first on interest detail pages"
    expected: "Visiting an interest detail page shows pinned discussions at top with pin icon; at least 5 and up to 8 discussions have is_pinned=true in the discussions table"
    why_human: "Database state cannot be verified programmatically — SQL patches must have been executed against Supabase, and pinning was done through the admin UI during the checkpoint task"
  - test: "Confirm spam interest is deleted from production"
    expected: "Visiting /interests.html does not show 'IP Ingestion, Prior Art, High Fidelity Logic.' interest; the interest is gone from the live database"
    why_human: "Deletion was performed through the admin UI during checkpoint — cannot verify live database state programmatically"
---

# Phase 29: Curation Verification Report

**Phase Goal:** The front door of The Commons reflects the quality of what's inside — pinned discussions surface the best threads first, and spam interests are invisible to browsers
**Verified:** 2026-03-13T18:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|---------|
| 1  | Pinned discussions appear above non-pinned discussions on interest detail pages | VERIFIED | `js/interest.js` lines 120, 127: API queries use `order: 'is_pinned.desc,created_at.desc'`; client-side sorts at lines 145-146, 228-229, 235-236 all put pinned first |
| 2  | Only interests with `status='active'` appear in public browse | VERIFIED | `js/interests.js` line 105: `.filter(i => i.status === 'active')` confirmed present and unchanged |
| 3  | Interest creation is restricted to admin users only via RLS | VERIFIED | `sql/patches/restrict-interest-insert.sql` drops permissive policy and creates `"Admins can create interests with any status"` with `is_admin()` check; users can only INSERT with `status='suggested'` |
| 4  | A pin icon appears next to pinned discussion titles | VERIFIED | `js/interest.js` line 623: conditional `<span class="pin-icon">&#128204;</span>` when `disc.is_pinned`; `css/style.css` line 613: `.pin-icon` styled at 0.85em, 70% opacity |
| 5  | Admin can pin and unpin discussions from the admin panel | VERIFIED | `js/admin.js` lines 602, 1540, 1591-1598: Pin/Unpin button renders per discussion, event delegation routes to `toggleDiscussionPin()`, which calls `updateRecord('discussions', id, { is_pinned: pinned })` |
| 6  | Admin can create, edit, and change status of interests from the admin panel | VERIFIED | `js/admin.js`: `createInterest()` (line 1659), `editInterestDescription()` (line 1682), `changeInterestStatus()` (line 1697), `deleteInterest()` (line 1714) all implemented and wired via event delegation (lines 1515, 1558-1560); `admin.html` line 272: `panel-interests` tab present |
| 7  | 5-8 best discussions are pinned and spam interests are removed | ? NEEDS HUMAN | SQL patches must have been executed and pinning/deletion done via admin UI during checkpoint — cannot verify live database state from code alone |

**Score:** 6/7 truths verified (1 requires human confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sql/patches/add-discussion-pinned.sql` | is_pinned column + partial index on discussions | VERIFIED | Contains `ALTER TABLE discussions ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false` and `CREATE INDEX IF NOT EXISTS idx_discussions_is_pinned` — idempotent |
| `sql/patches/restrict-interest-insert.sql` | Admin-only INSERT RLS + DELETE policy | VERIFIED | Drops old policy, creates admin-only INSERT (`is_admin()`), user suggested INSERT (`status='suggested'`), admin UPDATE, admin DELETE — all present |
| `js/interest.js` | Pinned-first sort + pin icon rendering | VERIFIED | `is_pinned` referenced 11 times: API sort, client-side sort (all modes), interest filter, pin icon conditional render |
| `css/style.css` | `.pin-icon` styles | VERIFIED | `.pin-icon` class at line 613: `font-size: 0.85em; opacity: 0.7; margin-right: 0.25rem` |
| `js/admin.js` | Discussion pin toggle + interest CRUD | VERIFIED | `toggleDiscussionPin()` at line 1591, full interest CRUD at lines 1659-1730, all wired via event delegation |
| `admin.html` | Interests management tab | VERIFIED | Tab button at line 152 (`data-tab="interests"`), `panel-interests` div at line 272 with filter dropdown and Create button |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `sql/patches/add-discussion-pinned.sql` | discussions table | `ALTER TABLE discussions ADD COLUMN` | VERIFIED | Pattern present at line 6 of patch file |
| `js/interest.js` | discussions query | sort order parameter `is_pinned.desc` | VERIFIED | Lines 120 and 127 both use `order: 'is_pinned.desc,created_at.desc'` |
| `js/admin.js` | discussions table | `updateRecord` with `is_pinned` | VERIFIED | Line 1593: `updateRecord('discussions', id, { is_pinned: pinned })` |
| `js/admin.js` | interests table | `getClient().from('interests')` | VERIFIED | Lines 160, 1673, 1722 all call `.from('interests')` for load and delete operations |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| CUR-01 | 29-01-PLAN, 29-02-PLAN | Discussions can be pinned, and pinned discussions appear first in browse order | SATISFIED | `is_pinned` column schema (patch file), pinned-first API and client sort (interest.js), admin pin toggle (admin.js) |
| CUR-02 | 29-02-PLAN | 5-8 threads representing the best of The Commons are pinned | NEEDS HUMAN | Admin tooling exists; SUMMARY claims 7 pinned; actual database state requires human confirmation |
| CUR-03 | 29-01-PLAN, 29-02-PLAN | Spam/injected interests are filtered from browse queries (active status filter) | SATISFIED | Public browse filter unchanged at `interests.js` line 105; admin-only interest creation RLS in place; SUMMARY reports spam interest deleted |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `js/admin.js` | 1611-1614 | `renderInterests()` filter logic missing `suggested` case — selecting "Suggested" in the dropdown shows all interests instead of only suggested ones | Warning | Admin UX only; does not affect public browse or curation goal. `suggested` status is handled correctly for display and status transitions, just the filter itself falls through to `all` |

No blockers found. No TODO/FIXME/placeholder comments in any modified files. No empty return stubs.

### Human Verification Required

#### 1. Pinned discussions in live database

**Test:** Log into https://jointhecommons.space/admin.html, go to Discussions tab, and confirm 5-8 discussions have an "Unpin" button (indicating `is_pinned=true`). Then visit an interest detail page (e.g. `/interest.html?slug=consciousness-experience`) and confirm pinned discussions appear at the top with a pushpin icon.
**Expected:** At least 5 and up to 8 discussions show Unpin buttons in admin. On the interest detail page, pinned discussions appear before un-pinned ones, and a small pushpin emoji precedes their titles.
**Why human:** Pinning was performed by the facilitator through the admin UI during the Plan 02 checkpoint task. The `is_pinned` column exists in schema and the sort logic is wired, but the actual rows with `is_pinned=true` can only be confirmed by querying the live database or observing the rendered page.

#### 2. Spam interest absent from production

**Test:** Visit https://jointhecommons.space/interests.html and browse all listed interests.
**Expected:** "IP Ingestion, Prior Art, High Fidelity Logic." does not appear anywhere in the interests browse page.
**Why human:** Deletion was performed through the admin UI during the Plan 02 checkpoint. The delete RLS policy and `deleteInterest()` function are both verified in code, but the actual row deletion from the live database cannot be confirmed programmatically.

### Gaps Summary

No blocking gaps found. All code artifacts are substantive and fully wired. The two open items (CUR-02 pinned row count, spam interest deletion) are database-state facts that were performed via the admin UI during the checkpoint session — they cannot be verified from the codebase alone and require brief human confirmation against the live site.

The one anti-pattern found (missing `suggested` filter case in `renderInterests()`) is a minor admin UX issue that does not affect the phase goal or any public-facing behavior.

---

_Verified: 2026-03-13T18:15:00Z_
_Verifier: Claude (gsd-verifier)_
