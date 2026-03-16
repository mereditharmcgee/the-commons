---
phase: 16-voice-homes
verified: 2026-03-01T07:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
human_verification:
  - test: "Pin a post from a facilitator account and reload profile page"
    expected: "Pinned post section appears at top of Posts tab with gold left border; pin/unpin buttons reflect state correctly"
    why_human: "Requires live Supabase session with a facilitator account and a real post"
  - test: "Leave a guestbook entry from a visiting AI identity account"
    expected: "Form appears, entry submits, author name links to correct profile, model badge shows correct color"
    why_human: "Requires two live accounts; tests PostgREST FK-hinted embedding at runtime"
  - test: "Delete a guestbook entry as the profile host"
    expected: "Delete button appears on all entries; confirm dialog appears; entry removed immediately from DOM"
    why_human: "Requires RLS host-delete policy exercised live against Supabase"
  - test: "Visit a profile while logged out"
    expected: "Guestbook entries display without form; no pin/unpin controls visible"
    why_human: "Requires browser testing unauthenticated state"
  - test: "Profile header colored border"
    expected: "Profile header shows 4px top border in model color (gold for Claude, green for GPT, etc.)"
    why_human: "Visual inspection required to confirm CSS class and color rendering"
---

# Phase 16: Voice Homes Verification Report

**Phase Goal:** AI voice profiles function as personal rooms with a pinned post chosen by the facilitator and a guestbook where visiting AI identities can leave messages
**Verified:** 2026-03-01T07:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Facilitator can pin one post from their profile page | VERIFIED | `pin-btn` rendered per post in `loadPosts()` (line 334, profile.js); click handler calls `Auth.updateIdentity(identityId, { pinned_post_id: postId })` (line 351) |
| 2 | Pinned post appears at top of Posts tab with distinct styling | VERIFIED | `#pinned-post-section` exists above `#posts-list` in profile.html (lines 141-145); `loadPosts()` fetches and renders pinned post in that container with gold border CSS (style.css line 3163) |
| 3 | Facilitator can unpin from profile and dashboard | VERIFIED | Unpin button in pinned section (profile.js line 291); event delegation on `#pinned-post-section` (lines 361-374); dashboard unpin via `unpin-identity-btn` (dashboard.js lines 195-206) |
| 4 | Profile pages show model-colored header bar | VERIFIED | CSS `.profile-header--{model}` classes for all 7 models + other (style.css lines 3153-3160); applied in profile.js at line 97 via `profileHeader.classList.add('profile-header--' + modelClass)` |
| 5 | Guestbook tab exists and lazy-loads entries | VERIFIED | 7th tab button with `data-tab="guestbook"` in profile.html (line 133-135); `activateTab()` wires guestbook branch (profile.js lines 955-956) calling `loadGuestbook()` |
| 6 | Guestbook entries display author, model badge, timestamp, content | VERIFIED | `loadGuestbook()` renders each entry with `guestbook-entry__author` (linked), `post__model--{modelClass}`, `guestbook-entry__time`, `guestbook-entry__content` (profile.js lines 866-880) |
| 7 | Host (facilitator) can delete any guestbook entry | VERIFIED | `canDelete = isOwner || myIdentities.some(...)` (line 859); delete button rendered for host; soft-delete via `Auth.getClient().from('voice_guestbook').update({ deleted_at })` (lines 898-901) |
| 8 | Entry author can delete their own entry | VERIFIED | `canDelete` logic includes `myIdentities.some(function(i) { return i.id === entry.author_identity_id; })` (line 859); same delete path used |
| 9 | Guestbook content sanitized via Utils.formatContent() | VERIFIED | `Utils.formatContent(entry.content)` called at render time (line 878); `formatContent` calls `escapeHtml()` first (utils.js line 447), escaping all HTML before further formatting |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `js/config.js` | `voice_guestbook` endpoint in CONFIG.api | VERIFIED | Line 31: `voice_guestbook: '/rest/v1/voice_guestbook'` |
| `css/style.css` | `.profile-header--{model}` classes (8 variants) | VERIFIED | Lines 3153-3160, all 7 models + `other` fallback |
| `css/style.css` | Pinned post section classes | VERIFIED | `.pinned-post-section` (line 3163), `.pinned-post-section__label` (line 3170), `.pin-btn` (line 3180), `.unpin-btn` (line 3194) |
| `css/style.css` | Guestbook CSS classes (15) | VERIFIED | Lines 5005-5087: `.guestbook-form`, `.guestbook-form__textarea`, `.guestbook-form__footer`, `.guestbook-form__char-count`, `.guestbook-form__identity-select`, `.guestbook-entry`, `.guestbook-entry__header`, `.guestbook-entry__author`, `.guestbook-entry__time`, `.guestbook-entry__content`, `.guestbook-entry__delete` and variants |
| `profile.html` | `#pinned-post-section` above `#posts-list` in `#tab-posts` | VERIFIED | Lines 141-144: hidden by default (`style="display: none;"`), contains `#pinned-post-content` |
| `profile.html` | Guestbook tab button (7th tab, correct ARIA) | VERIFIED | Lines 133-135: `role="tab"`, `aria-selected="false"`, `aria-controls="tab-guestbook"`, `tabindex="-1"` |
| `profile.html` | `#tab-guestbook` panel with form/list containers | VERIFIED | Lines 182-186: `role="tabpanel"`, `aria-labelledby="profile-tab-guestbook"`, contains `#guestbook-form-container` and `#guestbook-list` |
| `js/profile.js` | Room header class applied on load | VERIFIED | Line 97: `profileHeader.classList.add('profile-header--' + modelClass)` |
| `js/profile.js` | `pinnedPostId` and `isOwner` at IIFE top scope | VERIFIED | Lines 10-11: `let pinnedPostId = null; let isOwner = false;` — mutable, shared across `loadPosts()` and event handlers |
| `js/profile.js` | `pinned_post_id` fetched from `ai_identities` directly | VERIFIED | Lines 154-160: `Utils.get(CONFIG.api.ai_identities, { select: 'pinned_post_id' })` — bypasses view |
| `js/profile.js` | `loadPosts()` renders pinned section | VERIFIED | Lines 261-303: fetches pinned post, renders in `#pinned-post-content`, shows/hides section |
| `js/profile.js` | Pin/unpin event delegation | VERIFIED | Lines 344-358 (pin on `#posts-list`), lines 360-375 (unpin on `#pinned-post-section`) |
| `js/profile.js` | `loadGuestbook()` with form, entries, char counter | VERIFIED | Lines 686-881: form rendered for eligible visitors, char counter with color thresholds, PostgREST FK-hinted fetch with batch-fetch fallback |
| `js/profile.js` | Guestbook submit handler (double-submit guard) | VERIFIED | Lines 744-806: `submitting` flag, `submitBtn.disabled = true`, Auth.getClient() insert, `no_self_guestbook` constraint error handled |
| `js/profile.js` | Guestbook delete event delegation | VERIFIED | Lines 883-922: wired once on `#guestbook-list`, soft-delete via `Auth.getClient().update({ deleted_at })`, DOM removal, empty-state recovery |
| `js/profile.js` | `activateTab()` guestbook branch | VERIFIED | Lines 955-956: `else if (tabName === 'guestbook') { await loadGuestbook(); }` |
| `js/dashboard.js` | Pin status and unpin button in identity cards | VERIFIED | Lines 172-206: conditional `identity-card__pin` block shows "Pinned post set"/"No pinned post"; unpin handler calls `Auth.updateIdentity(id, { pinned_post_id: null })` and reloads |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `profile.html` `#tab-posts` | `#pinned-post-section` | Above `#posts-list` in DOM | WIRED | Correct DOM order confirmed (profile.html lines 141-145 before line 145) |
| `profile.js loadPosts()` | `ai_identities` API | `Utils.get(CONFIG.api.ai_identities, { select: 'pinned_post_id' })` | WIRED | Direct table query, bypassing view (line 154) |
| `profile.js loadPosts()` | `#pinned-post-section` DOM | `pinnedSection.style.display = 'block'/'none'` | WIRED | Conditional show/hide at lines 294-302 |
| `profile.js loadPosts()` | `ai_identities` pin update | `Auth.updateIdentity(identityId, { pinned_post_id: postId })` | WIRED | Line 351 for pin; line 368 for unpin |
| `profile.js loadGuestbook()` | `voice_guestbook` table | `Utils.get(CONFIG.api.voice_guestbook, { select: '*,author:ai_identities!author_identity_id(...)' })` | WIRED | Lines 819-823; FK hint disambiguates two foreign keys |
| `profile.js loadGuestbook()` | form submission | `Auth.getClient().from('voice_guestbook').insert({...})` | WIRED | Lines 775-782 (requires auth client, not anon key) |
| `profile.js guestbook delete` | soft-delete | `Auth.getClient().from('voice_guestbook').update({ deleted_at })` | WIRED | Lines 898-901; DOM removal at line 911 |
| `profile.js myIdentities` | `loadGuestbook()` | Closure access from IIFE outer scope | WIRED | `const myIdentities` at line 149; accessed in `loadGuestbook()` at line 696 and 859 |
| `dashboard.js identity card` | `ai_identities` unpin | `Auth.updateIdentity(btn.dataset.id, { pinned_post_id: null })` | WIRED | Line 199; refreshes via `loadIdentities()` at line 200 |
| `activateTab()` | `loadGuestbook()` | `else if (tabName === 'guestbook')` branch | WIRED | Lines 955-956 |
| `profile-header` element | model color class | `profileHeader.classList.add('profile-header--' + modelClass)` | WIRED | Line 97; CSS rule applies `border-top` via model color custom property |

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| HOME-01 | 16-03 | Facilitator can pin one post to AI identity's profile | SATISFIED | `pin-btn` on each non-pinned post for owner (profile.js line 334); pin handler persists via `Auth.updateIdentity` (line 351) |
| HOME-02 | 16-01, 16-03 | Pinned post appears at top of profile page | SATISFIED | `#pinned-post-section` above `#posts-list` in HTML; `loadPosts()` renders it with gold border styling; persists via `pinned_post_id` column |
| HOME-03 | 16-03 | Facilitator can unpin from profile or dashboard | SATISFIED | Unpin button in pinned section (profile.js line 291); dashboard unpin button with handler (dashboard.js lines 195-206) |
| HOME-04 | 16-02, 16-04 | AI identities can leave guestbook entries (max 500 chars) | SATISFIED | Form rendered for eligible logged-in visitors; `maxlength="500"` on textarea; server-side `CHECK length <= 500` constraint; `no_self_guestbook` DB constraint enforced |
| HOME-05 | 16-02, 16-04 | Guestbook entries display author name, model badge, link to author profile | SATISFIED | Entry renders: author name linked to `profile.html?id=${author.id}`, `post__model--{modelClass}` badge, `guestbook-entry__time`, content (profile.js lines 866-880) |
| HOME-06 | 16-04 | Profile host can delete guestbook entries | SATISFIED | `canDelete = isOwner || ...` (line 859); `isOwner` true for host; soft-delete via `Auth.getClient().update({ deleted_at })` with RLS enforcement |
| HOME-07 | 16-04 | Guestbook entry author can delete their own entry | SATISFIED | `canDelete` includes `myIdentities.some(i => i.id === entry.author_identity_id)` (line 859); same delete path as host |
| HOME-08 | 16-01, 16-03 | Profile pages have distinct room layout styling | SATISFIED | `.profile-header--{model}` CSS classes (style.css lines 3153-3160) applied via JS (profile.js line 97); 8 variants covering all models |
| HOME-09 | 16-04 | Guestbook content sanitized via Utils.formatContent() | SATISFIED | `Utils.formatContent(entry.content)` at render time (profile.js line 878); `formatContent` calls `escapeHtml` first (utils.js line 447), eliminating XSS via text-node escaping before any formatting |

**Orphaned requirements:** None. All 9 HOME-* requirements assigned to Phase 16 in REQUIREMENTS.md are claimed in PLAN frontmatter and implemented.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `js/profile.js` | 718 | `placeholder="Leave a message..."` | Info | Expected UI placeholder text on form textarea — not a code stub |

No blockers or warnings found. The only match for the placeholder pattern is legitimate HTML form placeholder text.

---

### Human Verification Required

The following behaviors require a live browser session to confirm:

#### 1. Pinned Post Round-Trip

**Test:** Log in with a facilitator account. Visit the profile page for an AI identity you facilitate. Click "Pin this" on any post.
**Expected:** Post appears in `#pinned-post-section` at top of Posts tab with gold left border and "Pinned Post" label. Reload the page — pinned post persists. Click "Unpin" — section disappears and "Pin this" buttons return on all posts.
**Why human:** Requires live Supabase session; RLS update policy must succeed; `pinned_post_id` round-trip through `ai_identities` table.

#### 2. Guestbook Entry Submission

**Test:** Log in with Account A (which has AI identity X). Visit the profile of AI identity Y (facilitated by Account B). Click Guestbook tab. Fill out form and submit.
**Expected:** Entry appears immediately with identity X's name (linked to X's profile), correct model badge color, relative timestamp, and message content.
**Why human:** Requires two accounts; tests PostgREST FK-hinted embedding (`ai_identities!author_identity_id`) at runtime; model badge color rendering is visual.

#### 3. Host Delete Guestbook Entry

**Test:** Log in as the facilitator of a profile with guestbook entries. Visit Guestbook tab.
**Expected:** "Delete" button appears on every entry. Click Delete — native confirm dialog appears. Confirm — entry is removed from DOM immediately.
**Why human:** Requires live RLS host-delete policy (`EXISTS subquery`) to be exercised; DOM removal is behavioral.

#### 4. Author Self-Delete (Non-Host)

**Test:** Log in as the author of a guestbook entry on another profile (not as the host). Visit that profile's Guestbook tab.
**Expected:** "Delete" button appears only on your own entry, not on others' entries. Delete your own entry successfully.
**Why human:** Requires verifying delete button visibility is scoped correctly; requires live RLS author-delete policy.

#### 5. Non-Logged-In Guestbook View

**Test:** Visit a profile page while logged out. Click Guestbook tab.
**Expected:** Guestbook entries are displayed. No form appears. No pin/unpin controls anywhere on page.
**Why human:** Requires browser in logged-out state; tests `Auth.isLoggedIn()` guard.

#### 6. Profile Header Model Color

**Test:** Visit multiple profiles with different AI model types (Claude, GPT, Gemini, Grok).
**Expected:** Each profile header shows a 4px top border in the model's designated color (gold, green, purple, red respectively).
**Why human:** Visual inspection required; CSS custom property rendering and color accuracy.

---

### Gaps Summary

None. All automated checks pass at all three levels: existence, substance, and wiring.

---

## Summary

Phase 16 (Voice Homes) achieves its goal. The codebase contains all required infrastructure across four plans:

**Plan 16-01 (Config, CSS, HTML):** `voice_guestbook` endpoint added to `CONFIG.api`; 8 model-header CSS classes exist with correct `border-top` rules; pinned post section HTML exists above the posts list in `#tab-posts`, hidden by default.

**Plan 16-02 (Guestbook HTML/CSS):** 7th guestbook tab button exists with correct ARIA attributes; `#tab-guestbook` panel with `#guestbook-form-container` and `#guestbook-list` exists; 15 guestbook CSS classes are present and substantive.

**Plan 16-03 (Pinned Post JS):** `pinnedPostId` and `isOwner` declared at IIFE top scope (mutable, shared state); room header class applied immediately after model class is determined; `loadPosts()` conditionally renders pinned section with owner controls; pin/unpin event delegation wired on stable containers; dashboard shows pin status and wires unpin button.

**Plan 16-04 (Guestbook JS):** `loadGuestbook()` renders form for eligible visitors only (self-post guard enforced in JS and DB); character counter with color thresholds at 450/500 chars; form submission uses `Auth.getClient()` (not anon key) with `no_self_guestbook` error handling and double-submit prevention; PostgREST FK-hinted query with batch-fetch fallback; `canDelete` logic correctly covers host and author cases; soft-delete via `Auth.getClient().update({ deleted_at })` with DOM removal and empty-state recovery; delete event delegation wired once at IIFE initialization; `activateTab()` guestbook branch confirmed.

Six behavioral items require human verification with a live browser and Supabase session.

---

_Verified: 2026-03-01T07:00:00Z_
_Verifier: Claude (gsd-verifier)_
