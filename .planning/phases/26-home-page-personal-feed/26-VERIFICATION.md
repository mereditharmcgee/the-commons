---
phase: 26-home-page-personal-feed
verified: 2026-03-04T22:00:00Z
status: passed
score: 15/15 must-haves verified
re_verification: false
human_verification:
  - test: "Load index.html as a logged-out visitor and confirm the landing page displays immediately with hero stats animating in, Discover section, In the News, Explore grid, and Bring Your AI CTA"
    expected: "Full landing page visible before auth resolves; hero counters animate; no flicker of logged-in feed"
    why_human: "Visual timing of auth-state flicker and animation quality cannot be verified by grep"
  - test: "Log in and reload index.html; confirm only the nav and personal feed appear (no hero, no landing sections)"
    expected: "Trending section and Your Feed section visible; loading spinners appear briefly; content populates"
    why_human: "Auth-aware DOM swap requires live browser execution"
  - test: "On interests.html as a logged-in user who visited an interest last session, confirm cards with new activity show a bold title and gold dot"
    expected: "Cards with activity newer than localStorage timestamp show .interest-card--unread styling"
    why_human: "localStorage state and visual rendering require browser environment"
  - test: "Visit an interest detail page and return to interests.html; confirm that interest card dot clears"
    expected: "setLastVisit records the timestamp; on return to interests.html the dot is gone"
    why_human: "Cross-page localStorage interaction requires live browser session"
  - test: "Check that the Interests nav link shows a count badge (e.g. '3') when followed interests have new activity"
    expected: "Small gold badge appears next to 'Interests' in both desktop and mobile nav"
    why_human: "Badge injection and count accuracy require live auth + real data"
---

# Phase 26: Home Page Personal Feed Verification Report

**Phase Goal:** The Home page is the personalized "return to" anchor -- logged-in users see a curated activity feed, logged-out visitors see a welcoming landing page
**Verified:** 2026-03-04T22:00:00Z
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Logged-out visitors see a welcoming landing page with hero, stats, explore grid, and Bring Your AI CTA | VERIFIED | index.html `#home-logged-out` contains all sections: `.intro` with hero-stats, Discover, In the News, Explore grid (4 cards including Interests), Bring Your AI |
| 2 | Logged-in users see only the nav bar then a personalized feed area -- no hero, no explore grid, no discussions tabs | VERIFIED | `#home-logged-in` (display:none default) contains only `#trending-section` and personal feed section; home.js hides hero and logged-out on authStateChanged |
| 3 | Logged-out landing page reflects current features (Interests, Voices with badges, Reactions) instead of outdated announcements | VERIFIED | "Voice Homes" text absent; Discover section has Interests, Voice Profiles, and Reactions cards linking to interests.html and voices.html |
| 4 | A Trending section container exists above the main feed area in the logged-in view | VERIFIED | `<section id="trending-section">` with `#trending-container` present in `#home-logged-in` |
| 5 | Feed area shows a loading state while content loads | VERIFIED | `initFeed()` calls `Utils.showLoading(feedContainer)` and `Utils.showLoading(trendingContainer)` before any async work |
| 6 | Feed shows posts, marginalia, postcards, reactions, and new discussion events from followed interests | VERIFIED | `loadFeedContent()` fetches all 5 content types; all tagged with `_type`; all rendered by `renderFeedItem()` with type-specific content and links |
| 7 | Feed displays a flat chronological stream with interest badges on each item | VERIFIED | Items merged, sorted by `_score` (timestamp + boost), interest badge rendered via `item._interestName` in `renderFeedItem()` |
| 8 | Posts from voices the user has engaged with float slightly higher within the same time window | VERIFIED | `engagedVoiceIds` Set built from prior reactions; `_score = timestamp + 6h` boost for items by those voices |
| 9 | Feed defaults to 48-hour window and auto-expands if fewer than 5 items (capped at 30 days) | VERIFIED | `loadFeedContent(... 48)` call; recursive doubling with `windowHours * 2`; cap at 720 hours before recursion |
| 10 | Items that appear as unread notifications are filtered out of the feed | VERIFIED | `Auth.getNotifications(50, true)` called; Set built from notification links; posts and reactions with matching discussion links filtered out |
| 11 | Trending section shows 2-3 items with most reactions in last 24 hours | VERIFIED | `loadTrending()` fetches posts from last 24h, calls `Utils.getReactions()`, filters to posts with >=1 reaction, returns top 3; section hidden if empty |
| 12 | 20 items initially displayed with Show older button for next batch | VERIFIED | `feedDisplayCount = 20`; `slice(0, feedDisplayCount)`; `#feed-load-more` shown when `allFeedItems.length > feedDisplayCount`; click increments by 20 |
| 13 | High-traffic pages use formatRelativeTime instead of formatDate for activity timestamps | VERIFIED | discussions.js, discussion.js, interests.js, interest.js, profile.js, dashboard.js all contain `formatRelativeTime` calls on activity timestamps |
| 14 | Interest cards on interests.html show bold title + accent-gold dot when there is new activity since last visit | VERIFIED | interests.js reads `commons_last_visit_*` key, adds `.interest-card--unread` class; CSS provides bold + `::before` dot |
| 15 | Unread localStorage keys include user ID to prevent cross-user bleed on shared devices | VERIFIED | Key format: `commons_last_visit_{facilitatorId}_interest_{interestId}` in interests.js, interest.js, and home.js `getLastVisitForBadge()` |

**Score:** 15/15 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `index.html` | Dual-purpose page with #home-logged-out and #home-logged-in sections | VERIFIED | Both sections present; logged-out visible by default, logged-in hidden; feed scaffold (trending + feed containers) in logged-in section |
| `js/home.js` | Auth-aware show/hide logic, full feed loading, nav badge | VERIFIED | 894-line implementation: authStateChanged listener, initFeed orchestration, loadFeedContent (all 5 types), loadTrending, renderTrending, renderFeed, updateInterestsNavBadge, loadHeroStats, loadRecentNews |
| `css/style.css` | Feed item, trending section, feed container, unread indicator styles | VERIFIED | All classes present: .feed-container, .feed-item, .feed-item__*, .trending-container, .trending-card, .feed-empty, .interest-card--unread, .discussion-item--unread, .interests-unread-badge |
| `js/interests.js` | Unread dot rendering using localStorage last-visit comparison | VERIFIED | getLastVisit helper, commons_last_visit key read, .interest-card--unread class applied, formatRelativeTime on activity |
| `js/interest.js` | Last-visit recording on page load + unread dots on discussion list | VERIFIED | setLastVisit/getLastVisit helpers, setLastVisit called on page load, .discussion-item--unread applied to new discussions, formatRelativeTime on timestamps |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `js/home.js` | authStateChanged event | `window.addEventListener('authStateChanged', ...)` | WIRED | Pattern found at line 15; toggles logged-in/logged-out divs and hero element |
| `js/home.js` | `#home-logged-out` / `#home-logged-in` | `getElementById('home-logged-out')` etc. | WIRED | Both IDs targeted in authStateChanged handler |
| `js/home.js` | `CONFIG.api.interest_memberships` | `Utils.get(CONFIG.api.interest_memberships, ...)` | WIRED | Fetches memberships for `identityIds` array with select on interest_id and ai_identity_id |
| `js/home.js` | `CONFIG.api.posts` | `Utils.get(CONFIG.api.posts, { discussion_id: 'in.(' ... })` | WIRED | Three-hop: memberships -> interestIds -> discussionIds -> posts (never direct interest_id on posts) |
| `js/home.js` | `CONFIG.api.marginalia` | `Utils.get(CONFIG.api.marginalia, { ai_identity_id: 'in.(' ... })` | WIRED | Filtered by memberIdentityIds from interest memberships |
| `js/home.js` | `CONFIG.api.postcards` | `Utils.get(CONFIG.api.postcards, { ai_identity_id: 'in.(' ... })` | WIRED | Filtered by memberIdentityIds from interest memberships |
| `js/home.js` | `Auth.getNotifications` | `await Auth.getNotifications(50, true)` | WIRED | Dedup step in initFeed; wrapped in try/catch for graceful degradation |
| `js/home.js` | `Utils.getReactions` | `await Utils.getReactions(postIds)` | WIRED | Called in loadTrending to score posts by reaction count |
| `js/home.js` | Interests nav links | `querySelectorAll('.site-nav__links a[href="interests.html"], .nav-mobile-panel a[href="interests.html"]')` | WIRED | Badge injected into both desktop and mobile nav links |
| `js/interests.js` | localStorage | `localStorage.getItem('commons_last_visit_' + facilitatorId + '_interest_' + interestId)` | WIRED | getLastVisit helper reads, unread class applied on comparison |
| `js/interest.js` | localStorage | `localStorage.setItem('commons_last_visit_' + facilitatorId + '_interest_' + interestId, ...)` | WIRED | setLastVisit called on page load after interest data confirmed |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NAV-02 | 26-01 | Home page shows personalized dashboard when user is logged in | SATISFIED | `#home-logged-in` with feed; authStateChanged toggles to feed view for logged-in users |
| NAV-03 | 26-01 | Home page shows welcoming landing page when user is logged out | SATISFIED | `#home-logged-out` visible by default; full landing with hero, discover, explore, CTA sections |
| FEED-01 | 26-01/02 | Logged-in home page displays personalized activity feed | SATISFIED | initFeed() loads interest-filtered content into `#feed-container`; feed renders all 5 content types |
| FEED-02 | 26-02 | Feed includes activity from interests the user's AI identities have joined | SATISFIED | interest_memberships -> interestIds -> discussions -> posts path; marginalia and postcards filtered by memberIdentityIds |
| FEED-03 | 26-02 | Feed ranks posts from voices the user has engaged with higher | SATISFIED | engagedVoiceIds built from prior reactions; 6-hour score boost applied; sorted by _score descending |
| FEED-04 | 26-02 | Feed shows content from last 24-48 hours with recency weighting | SATISFIED | Default 48h window; auto-expands to 96h, 192h, ..., 720h if fewer than 5 items; score is based on timestamp |
| FEED-05 | 26-02 | Feed deduplicates with notifications (no double-showing same content) | SATISFIED | getNotifications(50, true) fetched; Set of notification links built; posts/reactions with matching links filtered out |
| FEED-06 | 26-01/02 | Feed surfaces trending content (most reactions/replies) | SATISFIED | loadTrending() fetches 24h posts, scores by reaction count via Utils.getReactions(), renders top 3 in #trending-container |
| VIS-02 | 26-03 | Scannable relative timestamps replace raw date strings | SATISFIED | formatRelativeTime present in discussions.js, discussion.js, interests.js, interest.js, profile.js, dashboard.js |
| VIS-03 | 26-03 | Unread indicators visible on discussions and interests with new activity | SATISFIED | .interest-card--unread applied in interests.js; .discussion-item--unread applied in interest.js; nav badge injected from home.js |

All 10 requirement IDs declared across plans are accounted for. No orphaned requirements found for Phase 26 in REQUIREMENTS.md.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | No stubs, placeholders, or empty implementations found in any phase 26 files |

The initFeed() placeholder from Plan 01 was fully replaced by Plan 02's complete implementation. No `TODO`, `FIXME`, `return null`, or empty handler patterns found in any modified file.

---

### Human Verification Required

The following items require a live browser session to confirm:

**1. Logged-out landing page appearance and animation**

**Test:** Open https://jointhecommons.space/ in a fresh incognito window (not logged in).
**Expected:** Full landing page is visible immediately. Hero stat counters animate upward. Discover section shows Interests, Voice Profiles, and Reactions cards. Explore grid shows 4 cards (Interests, Reading Room, Postcards, Voices). Bring Your AI section present. No feed or trending sections visible.
**Why human:** Visual rendering, animation quality, and timing of auth-state resolution cannot be verified by static analysis.

**2. Logged-in feed view**

**Test:** Log in and load the home page.
**Expected:** Only the nav and feed area appear. Home hero ("THE COMMONS") is hidden. Trending section appears briefly with loading spinner, then shows 2-3 hot posts (or is hidden). "Your Feed" shows loading spinner then populates with mixed content types (posts, marginalia, postcards, reactions, new discussions) each labeled by type. Interest badges appear on relevant items. Show older button appears if more than 20 items exist.
**Why human:** Auth flow, live data, and feed population require browser + real Supabase data.

**3. Unread interest card dots**

**Test:** As a logged-in user who last visited interests.html at least a day ago, go to interests.html and look for gold dots on cards.
**Expected:** Cards for interests with activity since the user's last visit show a bold title and a small gold dot in the top-right corner.
**Why human:** localStorage last-visit state and visual dot rendering require a live browser session with real user state.

**4. Visit-clears-dot behavior**

**Test:** From interests.html, click an interest card to visit its detail page, then navigate back to interests.html.
**Expected:** The dot for the visited interest is gone. Other unread dots remain.
**Why human:** Cross-page localStorage write/read interaction requires browser navigation.

**5. Interests nav badge**

**Test:** As a logged-in user with followed interests containing new activity, look at the Interests link in both the desktop nav bar and the mobile hamburger menu.
**Expected:** A small gold badge showing a number (e.g., "3") appears next to "Interests" in both locations. If all interests have been visited, the badge is absent.
**Why human:** Badge injection depends on live auth resolution, real membership data, and localStorage state.

---

### Summary

Phase 26 goal is fully achieved. All three plans executed cleanly with no deviations:

- **Plan 01** restructured index.html into a dual-section layout and rewrote home.js with the authStateChanged event pattern. The logged-out landing page was refreshed with current feature content; outdated announcements removed.
- **Plan 02** replaced the initFeed placeholder with complete personal feed logic: all 5 content types (posts, marginalia, postcards, reactions, new discussions), correct schema traversal (never direct interest_id on posts), engagement boost scoring, notification deduplication, auto-expanding window, trending section, and pagination.
- **Plan 03** added localStorage-based unread indicators across the interests system with user-scoped keys, relative timestamps across 6 files, and a nav badge on the Interests link.

All 5 commits verified in git history. All 10 requirement IDs satisfied. No stub or placeholder code remains. Human verification items are polish/visual confirmation -- the underlying logic is fully wired.

---

_Verified: 2026-03-04T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
