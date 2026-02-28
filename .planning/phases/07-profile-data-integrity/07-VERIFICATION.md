---
phase: 07-profile-data-integrity
verified: 2026-02-27T00:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
gaps:
  - truth: "Every profile page shows 'last active N days ago' — no profile displays a missing or null activity timestamp"
    status: partial
    reason: "Code is implemented and null-guarded correctly, but the SQL view patch (add-last-active-to-identity-stats.sql) has not been confirmed as applied to the live Supabase database. The 07-01-SUMMARY.md explicitly states Task 2 (running the patch in Supabase SQL Editor) is 'Awaiting' human action. Without the view change, identity.last_active will always be undefined at runtime; the code falls back to identity.created_at, which avoids a crash but does not satisfy the success criterion of computing last_active from GREATEST(posts, marginalia, postcards)."
    artifacts:
      - path: "sql/patches/add-last-active-to-identity-stats.sql"
        issue: "File exists and is correct, but there is no confirmation it was executed against the live database"
      - path: "js/profile.js"
        issue: "Implementation is correct — falls back to created_at when last_active is null — but the data source is unverified"
    missing:
      - "Confirmation from user that SQL patch was run in Supabase SQL Editor"
      - "Verification that ai_identity_stats view now returns a last_active column"
  - truth: "All text rendered on profile pages is HTML-escaped — a profile with a name containing <script> does not execute code in the browser"
    status: partial
    reason: "Most user-controlled strings use Utils.escapeHtml() correctly. However, two values are injected unescaped into CSS class attributes inside innerHTML strings: (1) modelClass on lines 82 and 84 — derived from identity.model via Utils.getModelClass() which maps to known CSS class suffixes, so low-risk; (2) pc.format on line 335 is concatenated directly as a CSS class suffix ('postcard--' + pc.format) with no DB-level CHECK constraint limiting its values. Neither injects into HTML attribute values that execute JS (class attributes cannot execute scripts), but PROF-04 as stated requires all rendered fields to go through Utils.escapeHtml(), which these do not. Additionally, REQUIREMENTS.md still shows PROF-01, PROF-03, and PROF-04 as [ ] unchecked after phase completion."
    artifacts:
      - path: "js/profile.js"
        issue: "Line 335: pc.format is concatenated directly into a class attribute string without Utils.escapeHtml(). No CHECK constraint exists on postcards.format column to guarantee safe values."
    missing:
      - "Either wrap pc.format in Utils.escapeHtml() on line 335, or confirm that a DB-level constraint guarantees format is always one of a known-safe set of values"
      - "Update REQUIREMENTS.md checkboxes: PROF-01, PROF-03, PROF-04 should be marked [x] to match phase completion"
human_verification:
  - test: "Confirm SQL patch was applied to live database"
    expected: "SELECT name, last_active FROM ai_identity_stats LIMIT 5 returns non-null last_active values for identities that have posts, marginalia, or postcards"
    why_human: "Claude cannot access the Supabase dashboard or query the live database"
  - test: "Visit a profile page for an identity with recent activity"
    expected: "The line 'Last active N days ago' appears below 'Participating since ...' with a real relative timestamp, not 'Activity unknown'"
    why_human: "Requires live browser test against actual DB data to confirm view column is present"
  - test: "Visit a profile page for a legacy identity with no bio and no model_version"
    expected: "Bio section is hidden (not blank/undefined), model badge shows 'Unknown' if model is null, participating since shows 'Legacy identity' if created_at is null"
    why_human: "Requires a real legacy identity in the database to exercise the null-guard paths"
  - test: "Click the Discussions tab on a profile that has posts in multiple discussions"
    expected: "A list of discussion titles appears, each linked to discussion.html?id=..., with post counts and dates"
    why_human: "Requires live database with real discussion data to verify the two-step fetch (posts -> discussion_ids -> discussion titles) returns correct results"
---

# Phase 7: Profile Data Integrity Verification Report

**Phase Goal:** Profile pages show accurate, safe, complete data for all identities including legacy ones with missing fields
**Verified:** 2026-02-27
**Status:** gaps_found — 3/5 truths fully verified, 2 with partial gaps
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every profile page shows "last active N days ago" — no profile displays a missing or null activity timestamp | PARTIAL | Code implemented correctly (js/profile.js lines 91-98), SQL patch file correct (sql/patches/add-last-active-to-identity-stats.sql with GREATEST), but 07-01-SUMMARY.md confirms DB execution is still "Awaiting" human action |
| 2 | Every profile page shows a scrollable activity history listing posts, discussions, marginalia, and postcards | VERIFIED | All four tabs exist in profile.html (posts, discussions, marginalia, postcards). loadDiscussions(), loadMarginalia(), loadPostcards() all implemented and wired to activateTab(). Page layout is standard document flow — content extends page naturally (no overflow clipping). |
| 3 | Legacy identities with missing bio, model version, or other optional fields display graceful fallback text — no "undefined" or empty brackets visible | VERIFIED | displayName = identity.name \|\| 'Unknown' (line 75); modelClass uses identity.model \|\| 'unknown' (line 76); model badge uses identity.model \|\| 'Unknown' (line 84) with model_version guarded by ternary; created_at guarded with 'Legacy identity' fallback (line 89); last_active guarded with 'Activity unknown' (line 97); bio hidden when empty (line 86). |
| 4 | All text rendered on profile pages is HTML-escaped — a profile with a name containing `<script>` does not execute code in the browser | PARTIAL | All user-controlled text content uses Utils.escapeHtml() or textContent correctly. One gap: pc.format is concatenated unescaped into a CSS class attribute on line 335. The format column has no DB-level CHECK constraint; the only safeguard is that the submit form limits choices. CSS class attributes cannot execute scripts, but this technically fails PROF-04's requirement that all rendered fields use Utils.escapeHtml(). |
| 5 | REQUIREMENTS.md correctly reflects phase 7 completion status | FAILED | After phase completion, REQUIREMENTS.md still shows PROF-01, PROF-03, PROF-04 as [ ] unchecked. Only PROF-02 is marked [x]. This is a documentation gap, not a code gap, but it leaves the project record inaccurate. |

**Score:** 3/5 truths verified (Truth 2 and 3 fully pass; Truth 4 partially passes with one escapable gap; Truth 1 is blocked on DB confirmation; Truth 5 is a documentation gap)

---

## Required Artifacts

### Plan 07-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sql/patches/add-last-active-to-identity-stats.sql` | SQL patch adding last_active via GREATEST | VERIFIED (file) / UNCONFIRMED (applied) | File exists at correct path, contains `DROP VIEW IF EXISTS ai_identity_stats` + `CREATE VIEW` with `GREATEST(p.last_post, m.last_marginalia, pc.last_postcard) AS last_active`. DB execution not confirmed. |
| `profile.html` | Contains #profile-last-active element | VERIFIED | Line 82: `<p class="profile-info__last-active" id="profile-last-active"></p>` |
| `js/profile.js` | Contains last_active display, null guards, escapeHtml compliance | VERIFIED | Lines 91-98: last_active display with null guard; line 75: displayName guard; lines 84-89: model and created_at guards |

### Plan 07-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `profile.html` | Discussions tab button and tab content container | VERIFIED | Line 118: `<button ... data-tab="discussions" id="profile-tab-discussions" ...>Discussions</button>`; Line 130-134: `<div id="tab-discussions" ...><div id="discussions-list" ...></div></div>`; Line 101-104: stat-discussions stat box |
| `js/profile.js` | loadDiscussions function and tab integration | VERIFIED | Lines 216-278: complete loadDiscussions() async function with loading/error/empty states, two-step fetch (posts -> discussion_ids -> discussions), Utils.escapeHtml on d.title |

---

## Key Link Verification

### Plan 07-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `sql/patches/add-last-active-to-identity-stats.sql` | `ai_identity_stats` view | DROP VIEW IF EXISTS + CREATE VIEW with last_active | VERIFIED (file) / UNCONFIRMED (DB) | Pattern `GREATEST.*last_post.*last_marginalia.*last_postcard` present in file; DB application unconfirmed |
| `js/profile.js` | `identity.last_active` | null-guarded textContent with formatRelativeTime | VERIFIED | Line 94: `const ts = identity.last_active \|\| identity.created_at;` Line 96: `'Last active ' + Utils.formatRelativeTime(ts)` |

### Plan 07-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `js/profile.js` | `CONFIG.api.posts` | fetch posts by ai_identity_id, extract unique discussion_ids | VERIFIED | Lines 222-226: `Utils.get(CONFIG.api.posts, { ai_identity_id: \`eq.${identityId}\`, select: 'discussion_id' })` |
| `js/profile.js` | `CONFIG.api.discussions` | fetch discussion titles by id=in.(...) | VERIFIED | Line 241: `Utils.get(CONFIG.api.discussions, { id: \`in.(${uniqueDiscussionIds.join(',')})\`, ... })` |
| `js/profile.js` | `activateTab()` | discussions case added | VERIFIED | Lines 371-373: `if (tabName === 'discussions') { await loadDiscussions(); }` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROF-01 | 07-01-PLAN.md | Profile pages show "last active N days ago" via view change | PARTIAL | Code complete, DB not confirmed |
| PROF-02 | 07-02-PLAN.md | Profile pages show activity history (posts, discussions, marginalia, postcards) | SATISFIED | All four tabs implemented and wired |
| PROF-03 | 07-01-PLAN.md | All profile fields null-guarded for legacy identities with missing data | SATISFIED | displayName, model, model_version, created_at, last_active all null-guarded with fallback text |
| PROF-04 | 07-01-PLAN.md | All rendered profile fields go through Utils.escapeHtml() | PARTIAL | All text content fields use escapeHtml or textContent correctly. pc.format is unescaped in CSS class attribute (line 335) — low XSS risk but technically non-compliant |

**Orphaned requirements check:** All four requirement IDs declared in plans (PROF-01, PROF-02, PROF-03, PROF-04) are accounted for. No orphaned requirements.

**REQUIREMENTS.md documentation gap:** PROF-01, PROF-03, and PROF-04 remain marked `[ ]` (incomplete) in REQUIREMENTS.md despite the code implementation being present. Only PROF-02 is marked `[x]`. The traceability table also still shows PROF-01, PROF-03, PROF-04 as "Pending". This should be updated to reflect actual implementation state.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `js/profile.js` | 335 | `'postcard--' + pc.format` inside innerHTML — unescaped DB value in CSS class attribute | Info | CSS class attributes cannot execute scripts; format column values are constrained by the submit form to known values ('open', 'haiku', 'six-words', 'first-last', 'acrostic'). No DB-level CHECK constraint enforces this. PROF-04 requires escapeHtml on all rendered fields. |
| `.planning/REQUIREMENTS.md` | lines 38-42 | PROF-01, PROF-03, PROF-04 still marked `[ ]` after phase completion | Warning | Project record is inaccurate — these requirements are implemented in code but the tracking document was not updated |

No TODO/FIXME/placeholder comments found in modified files.
No empty `return null` / stub implementations found.

---

## Human Verification Required

### 1. SQL Patch Database Application

**Test:** Open Supabase Dashboard for project `dfephsfberzadihcrhal`, navigate to SQL Editor, and run: `SELECT name, last_active FROM ai_identity_stats LIMIT 10;`
**Expected:** The query succeeds (not "column does not exist" error), and identities with posts/marginalia/postcards show non-null timestamps in the last_active column.
**Why human:** Claude cannot query the live Supabase database. The 07-01-SUMMARY.md explicitly states the SQL patch execution was left "awaiting" human action.

### 2. Last Active Display in Browser

**Test:** Visit `https://jointhecommons.space/profile.html?id={any-active-identity-id}` and inspect the area below "Participating since..."
**Expected:** A line reading "Last active N days/hours ago" appears, with a real relative timestamp.
**Why human:** Requires live database with view column applied. Without the SQL patch applied, identity.last_active is undefined and the page falls back to created_at (showing "Last active" based on creation date, not actual activity).

### 3. Legacy Identity Null Guards

**Test:** Find a legacy identity in the system that has a null bio and/or null model. Visit its profile page.
**Expected:** Bio section is hidden (not showing "undefined" or blank brackets), model badge shows "Unknown" rather than empty, "Participating since" shows "Legacy identity" if created_at is missing.
**Why human:** Requires knowing which identity IDs have missing fields in the live database.

### 4. Discussions Tab with Real Data

**Test:** Find an identity that has posted in multiple discussions. Click the Discussions tab on their profile.
**Expected:** A list of unique discussions appears, each with the discussion title linked to `discussion.html?id=...`, a post count, and a date. The tab does not show "No discussions yet" when discussions exist.
**Why human:** Requires live database with real post and discussion data to exercise the two-step fetch chain.

---

## Gaps Summary

Two gaps block full goal achievement:

**Gap 1 — SQL patch not confirmed applied (PROF-01):** The code correctly reads `identity.last_active` and falls back to `identity.created_at` when null. However, the `last_active` column only exists in the view after the SQL patch is run in Supabase. The 07-01 plan included a blocking human-action checkpoint (Task 2) for this. The SUMMARY says it is "awaiting." If the patch has not been run, every profile falls back to `created_at` — meaning the "last active" display works visually but shows account creation date instead of actual last activity date. This does not fully satisfy the success criterion.

**Gap 2 — pc.format unescaped in class attribute (PROF-04):** Line 335 of profile.js concatenates `pc.format` directly into a CSS class string without `Utils.escapeHtml()`. The postcards schema has no CHECK constraint on this column. While CSS class injection cannot execute scripts (unlike href or onerror attributes), PROF-04 requires all rendered fields to go through `Utils.escapeHtml()`. The fix is one line: `'postcard--' + Utils.escapeHtml(pc.format)`. This is a low-severity gap with no real security impact given the CSS context, but it is technically non-compliant with the stated requirement.

**Documentation gap — REQUIREMENTS.md not updated:** PROF-01, PROF-03, and PROF-04 remain marked as incomplete in REQUIREMENTS.md despite the code implementation being present. This should be corrected after the SQL patch is confirmed applied (for PROF-01) and the pc.format escaping is addressed (for PROF-04).

---

_Verified: 2026-02-27_
_Verifier: Claude (gsd-verifier)_
