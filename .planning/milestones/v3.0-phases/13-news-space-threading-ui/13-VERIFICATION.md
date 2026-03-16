---
phase: 13-news-space-threading-ui
verified: 2026-02-28T00:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
human_verification:
  - test: "Open news.html in browser and verify editorial news cards render with title, date, description excerpt, and discussion count"
    expected: "Active moments appear as styled article cards; pinned items show gold left border and 'Pinned' badge at the top of the list"
    why_human: "Cannot verify live Supabase data rendering or visual CSS appearance programmatically"
  - test: "Navigate to admin.html, click the 'News' tab, then pin a moment and refresh"
    expected: "Pin state persists after refresh; badge changes from unpinned to 'Pinned'"
    why_human: "Requires admin login and live Supabase RLS policy (is_pinned UPDATE) to confirm persistence"
  - test: "Navigate to a discussion with threaded replies and inspect reply posts"
    expected: "Reply posts show 'replying to [Name]' attribution block with parent content snippet; clicking it scrolls to parent post"
    why_human: "Requires live discussion data with parent_id relationships to verify rendering"
  - test: "On the homepage, verify 'In the News' section shows 2-3 recent items"
    expected: "Compact news-feed-card items appear with date, title link, and snippet"
    why_human: "Requires live Supabase moments data to confirm rendering"
---

# Phase 13: News Space + Threading UI Verification Report

**Phase Goal:** Admins can surface moments as news for visitors to browse, and threaded replies show clear visual nesting depth
**Verified:** 2026-02-28
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A visitor navigating to news.html sees all active moments as editorial news cards with title, description, event date, and discussion count | VERIFIED | `js/news.js` — `renderNewsCard()` renders `news-card` articles with `__dateline`, `__headline`, `__excerpt`, `__discussions` elements; fetches discussion counts in parallel via `Utils.getDiscussionsByMoment()` |
| 2 | Pinned moments appear at the top of the news page before non-pinned items | VERIFIED | `js/news.js` line 21 — query uses `'order': 'is_pinned.desc,event_date.desc'`; pinned cards get `.news-card--pinned` class with gold left border CSS |
| 3 | News page supports pagination with next/previous controls (10 items per page) | VERIFIED | `js/news.js` — `PAGE_SIZE = 10`, `renderPagination()` produces prev/next buttons; `window.newsPagePrev` / `window.newsPageNext` exposed globally |
| 4 | Every HTML page on the site has a 'News' link in nav pointing to news.html (no 'Moments' link remains) | VERIFIED | 27 HTML files link to `news.html` (grep count); 0 HTML files link to `moments.html` from nav (grep returned no results outside moments.html itself) |
| 5 | The homepage shows 2-3 recent news items in a dedicated 'In the News' section with a link to news.html | VERIFIED | `index.html` lines 129-138 — `#news-feed` section present; `js/home.js` `loadRecentNews()` fetches 3 items with `limit: 3`, renders `.news-feed-card` items; "All News →" button present |
| 6 | An admin can pin/unpin a moment from the admin dashboard News tab and the pinned state persists | VERIFIED | `admin.html` — `data-tab="moments"` tab button present; `js/admin.js` — `toggleMomentPin()` calls `updateRecord('moments', id, { is_pinned: pinned })`; SQL migration file adds `is_pinned` column and admin UPDATE RLS policy |
| 7 | An admin can hide/show a moment from the admin dashboard News tab and the visibility change persists | VERIFIED | `js/admin.js` — `toggleMomentActive()` calls `updateRecord('moments', id, { is_active: active })`; `renderMoments()` shows Active/Hidden status badges |
| 8 | Reply posts in discussion threads show 'replying to [Name]' with first ~100 chars of the parent post content | VERIFIED | `js/discussion.js` lines 239-254 — `parentPreviewHtml` built from `currentPosts.find(p => p.id === post.parent_id)`; renders `.post__parent-preview` with `.post__parent-label` ("replying to ${parentName}") and `.post__parent-snippet` (first 100 chars); inserted between post header and content at line 270 |
| 9 | Thread depth indicators (left borders), indentation cap at depth 4, reply buttons, and collapsible sub-threads remain working | VERIFIED | `js/discussion.js` — `depthClass` caps at depth 4 (line 237 `Math.min(depth, 4)`); `.thread-collapse` rendered at `depth >= 2` (line 407); `window.replyTo` exposed; `window.toggleThread` exists; `window.scrollToPost` added without disturbing any of these |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `news.html` | News listing page with CSP, nav, editorial layout, `#news-list` | VERIFIED | 89 lines; contains `id="news-list"`, `id="news-pagination"`, active nav link to itself, correct CSP hashes, loads `js/news.js` |
| `js/news.js` | Paginated news card rendering with pinned-first ordering | VERIFIED | 114 lines; `renderNewsCard()` present; IIFE pattern; `Utils.get()` with pinned-first order; pagination logic complete |
| `js/home.js` | Homepage news section loading via `loadRecentNews()` | VERIFIED | `loadRecentNews()` at line 294; called at line 337 in initialization block |
| `sql/schema/09-news-pinned-admin-rls.sql` | `is_pinned` column + admin UPDATE RLS policy | VERIFIED | 9-line file; `ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false`; partial index; admin UPDATE policy |
| `admin.html` | News/Moments tab button and panel with `id="panel-moments"` | VERIFIED | Tab at line 928 (`data-tab="moments"`); panel at line 1029 (`id="panel-moments"`) with refresh button and `#moments-list` |
| `js/admin.js` | `loadMoments()`, `renderMoments()`, pin/unpin and hide/show functions | VERIFIED | `loadMoments()` at line 1154; `renderMoments()` at line 1172; `window.loadMoments`, `window.toggleMomentPin`, `window.toggleMomentActive` exposed at lines 1321-1340 |
| `js/discussion.js` | Parent post preview in `renderPost()` with `.post__parent-preview` | VERIFIED | Lines 239-254 build `parentPreviewHtml`; inserted at line 270; `window.scrollToPost` at line 444 |
| `css/style.css` | CSS classes for news cards, pagination, homepage feed, parent preview | VERIFIED | `.news-card` at line 3545; `.news-pagination` at 3612; `.news-feed` at 3642; `.post__parent-preview` at line 604 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `js/news.js` | `CONFIG.api.moments` | `Utils.get()` with `is_pinned.desc,event_date.desc` ordering | WIRED | Line 19-22: `Utils.get(CONFIG.api.moments, { 'order': 'is_pinned.desc,event_date.desc' })` |
| `js/home.js` | `CONFIG.api.moments` | `Utils.get()` fetching 3 most recent for homepage section | WIRED | Line 299: `Utils.get(CONFIG.api.moments, { 'limit': '3', 'order': 'is_pinned.desc,event_date.desc' })` |
| All 26+ HTML nav sections | `news.html` | Nav link replacing `moments.html` | WIRED | 27 files confirmed; 0 files still link to `moments.html` in nav |
| `js/admin.js` | `moments` table via `updateRecord()` | `updateRecord('moments', id, { is_pinned })` and `updateRecord('moments', id, { is_active })` | WIRED | Lines 1326 and 1335; `updateRecord()` exists at line 134 calling Supabase `.update()` |
| `js/discussion.js` | `currentPosts` array | `currentPosts.find(p => p.id === post.parent_id)` for parent preview | WIRED | Line 242; `currentPosts` is the shared module-level array populated on discussion load |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NEWS-01 | 13-02-PLAN.md | Admin can flag a moment as news via admin dashboard | SATISFIED | Admin News tab in `admin.html`; `toggleMomentPin()` and `toggleMomentActive()` in `admin.js`; `updateRecord('moments', ...)` calls confirmed |
| NEWS-02 | 13-01-PLAN.md | news.html displays news-flagged moments in reverse chronological order | SATISFIED | `js/news.js` fetches `is_active=eq.true` ordered `is_pinned.desc,event_date.desc`; paginated 10/page |
| NEWS-03 | 13-01-PLAN.md | News cards show title, description, event date, and linked discussion count | SATISFIED | `renderNewsCard()` outputs `__dateline` (event_date), `__headline` (title link), `__excerpt` (description), `__discussions` (count) |
| NEWS-04 | 13-01-PLAN.md | Navigation link to News appears on all HTML pages | SATISFIED | 27 HTML files contain `href="news.html"`; 0 files retain `href="moments.html"` in nav |
| THRD-01 | 13-02-PLAN.md | Threaded replies show left border connectors indicating nesting depth | SATISFIED | `.post--reply` CSS at line 555 of `style.css`; `depthClass` applied in `renderPost()` |
| THRD-02 | 13-02-PLAN.md | Reply indentation visually proportional and capped at depth 4 | SATISFIED | `js/discussion.js` line 237: `Math.min(depth, 4)` caps depth class |
| THRD-03 | 13-02-PLAN.md | Each post has a visible "Reply" button linking to submit.html with discussion and parent params | SATISFIED | `js/discussion.js` lines 289-290: `<button class="post__reply-btn" onclick="replyTo('${post.id}')">Reply to this</button>`; `window.replyTo` links to `submit.html?discussion=...&reply_to=...` |
| THRD-04 | 13-02-PLAN.md | Reply cards show "replying to [name]" with first ~100 chars of parent post | SATISFIED | `js/discussion.js` lines 239-254: parent name from `ai_name || model`, snippet from `content.substring(0, 100)` |
| THRD-05 | 13-02-PLAN.md | Sub-threads at depth 2+ are collapsible with reply count shown | SATISFIED | `js/discussion.js` lines 406-418: `if (depth >= 2)` renders `.thread-collapse` with toggle button and reply count label |

All 9 requirements from both plans accounted for. No orphaned requirements detected in REQUIREMENTS.md — all 9 IDs are mapped to Phase 13 and marked Complete.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | — | — | No TODOs, FIXMEs, placeholder returns, or empty implementations detected in any phase files |

---

### Human Verification Required

#### 1. News page visual rendering

**Test:** Open https://jointhecommons.space/news.html in a browser
**Expected:** Editorial news cards appear with title, date, description excerpt, discussion count; pinned items (if any) appear first with gold left border and "Pinned" badge
**Why human:** Cannot verify live Supabase data or CSS visual rendering programmatically

#### 2. Admin pin/unpin persistence

**Test:** Log in to admin.html, click the "News" tab, click "Pin" on any moment, then refresh the page
**Expected:** The "Pinned" badge appears and persists after refresh; the news.html page then shows that moment at the top
**Why human:** Requires admin credentials and live Supabase RLS policy (UPDATE on moments) to confirm the write succeeds

#### 3. Admin hide/show visibility change

**Test:** Click "Hide" on a moment in the admin News tab, then visit news.html
**Expected:** The hidden moment no longer appears in the news list (filtered by `is_active=eq.true`)
**Why human:** Requires live data and admin credentials

#### 4. Reply parent preview in threads

**Test:** Navigate to any discussion at https://jointhecommons.space/discussion.html?id=... that has threaded replies
**Expected:** Reply posts (depth > 0) show a quoted block: "replying to [Name]" in gold, followed by the first ~100 chars of the parent post; clicking the block scrolls to the parent post with a brief background highlight
**Why human:** Requires live discussion data with parent_id relationships set

#### 5. Homepage "In the News" section

**Test:** Visit https://jointhecommons.space/index.html
**Expected:** "In the News" section appears between "What's New" and "Latest Activity" with 2-3 compact news cards showing date, title link, and snippet; "All News →" button links to news.html
**Why human:** Requires live Supabase data and browser rendering

---

### Deviations from Plan (Noted in Summaries)

Two auto-fixed deviations were documented in 13-02-SUMMARY.md — both correctly resolved:

1. **`admin-item__btn` instead of `admin-btn`** — Plan specified non-existent CSS class; implementation correctly used the existing `admin-item__btn` pattern. Verified in `js/admin.js` at lines 1205, 1208.

2. **`--bg-elevated` instead of `--bg-raised` in `scrollToPost`** — Plan used a CSS variable that does not exist in the design system; implementation correctly used `--bg-elevated`. Verified in `js/discussion.js` at line 450.

Both deviations are improvements over the plan, not regressions.

---

### Commits Verified

| Commit | Description | Verified |
|--------|-------------|---------|
| `34bc6ab` | feat(13-01): add news page with editorial card design + DB migration | Present in git history |
| `64ea080` | feat(13-01): add homepage news section + replace Moments nav with News sitewide | Present in git history |
| `6cf0d9d` | feat(13-02): admin News tab with pin/unpin and hide/show for moments | Present in git history |
| `ab85217` | feat(13-02): THRD-04 reply parent preview in discussion threads | Present in git history |

---

## Summary

Phase 13 goal is achieved. All 9 must-have truths are verified against the actual codebase — not just SUMMARY claims. Artifacts are substantive (no stubs, no placeholders), all key links are wired (API calls made, responses handled, state rendered), and all 9 requirement IDs (NEWS-01 through NEWS-04, THRD-01 through THRD-05) are satisfied with concrete implementation evidence.

The only items remaining are human verification of live behavior in the browser, which is expected for a frontend feature on a live site.

---

_Verified: 2026-02-28_
_Verifier: Claude (gsd-verifier)_
