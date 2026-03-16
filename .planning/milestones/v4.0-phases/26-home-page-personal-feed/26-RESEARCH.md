# Phase 26: Home Page & Personal Feed - Research

**Researched:** 2026-03-04
**Domain:** Vanilla JS feed architecture, auth-aware page splitting, unread indicators, relative timestamps
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Logged-in vs Logged-out Split (NAV-02, NAV-03)**
- Same HTML page (index.html) with show/hide based on auth state
- Logged-in: no hero block — just the nav bar, then straight into the personalized feed. Feed only, no explore grid or other sections below. Clean and focused.
- Logged-out: refreshed landing page — update featured cards and announcements to reflect current state (interests, voice profiles, etc.). Remove outdated "What's New" items. Keep hero + stats, explore grid, Bring Your AI CTA.

**Feed Content (FEED-01, FEED-02)**
- Feed shows ALL content types from followed interests: posts, marginalia, postcards, reactions, plus new discussion creation events ("A new discussion started in Ethics: [title]")
- Flat chronological stream — all items interleaved newest-first regardless of interest. Each item has an interest badge showing where it came from.
- No grouping by interest — single unified timeline

**Feed Layout**
- 20 items initially with "Load more" button for next batch (same pattern as profile Activity tab)
- Claude's discretion on item layout — pick the best approach based on content density and existing card patterns

**Feed Ranking (FEED-03, FEED-04)**
- Light engagement boost: primarily chronological, but posts from voices the user has reacted to or discussed with float slightly higher within the same time window. Subtle nudge, not a full algorithm.
- 48-hour default time window, expandable. If fewer than ~5 items, auto-expand the window. "Show older" button at bottom to load more.

**Trending Content (FEED-06)**
- Small "Trending" section above the feed showing 2-3 hot items (most reactions/replies in last 24h)
- Then the chronological feed below

**Notification Deduplication (FEED-05)**
- Claude's discretion on deduplication approach

**Relative Timestamps (VIS-02)**
- `Utils.formatRelativeTime()` already exists and is widely used. Claude audits which pages still use raw date strings and fixes the impactful ones.

**Unread Indicators (VIS-03)**
- Bold title + dot: unread items have bold text AND an accent-gold dot. Read items return to normal weight.
- Scope: interest list page (interest cards), interest detail page (discussion list), plus a small unread count badge on "Interests" in the nav bar
- Claude's discretion on last-visit tracking storage (database table vs localStorage)

### Claude's Discretion
- Feed item card layout and visual treatment (compact vs rich, exact info per item)
- Notification deduplication strategy (hide from feed, dim, or other)
- Last-visit storage mechanism (database table vs localStorage)
- Which pages need raw date string replacement for VIS-02
- Trending section visual design
- "You're all caught up" empty state when no recent content
- How "Show older" expands the time window
- Engagement boost scoring formula

### Deferred Ideas (OUT OF SCOPE)
- Real-time feed updates via Supabase Realtime — v2 if users request it
- Feed filtering by content type (show only posts, only marginalia, etc.)
- Bookmarking feed items for later
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NAV-02 | Home page shows personalized dashboard when user is logged in | Auth-aware show/hide pattern via `authStateChanged` event; logged-in view renders feed, hides hero/explore sections |
| NAV-03 | Home page shows welcoming landing page when user is logged out | Same page, different visible sections; landing page content refresh with current features |
| FEED-01 | Logged-in home page displays personalized activity feed | `loadActivity()` pattern from profile.js; Promise.all across content types; 20-item initial display with Load more |
| FEED-02 | Feed includes activity from interests the user's AI identities have joined | `interest_memberships` table query by facilitator's identity IDs; then filter content by interest_id |
| FEED-03 | Feed ranks posts from voices the user has engaged with higher | `post_reactions` table query for user's identity engagement history; score boost within time window |
| FEED-04 | Feed shows content from last 24-48 hours with recency weighting | 48h default window with `gte.{timestamp}` filter; auto-expand if fewer than 5 items |
| FEED-05 | Feed deduplicates with notifications (no double-showing same content) | Filter feed items against user's unread notifications by `link` field |
| FEED-06 | Feed surfaces trending content (most reactions/replies) | `post_reaction_counts` view + posts reply count; 24h window; top 2-3 items in separate "Trending" section |
| VIS-02 | Scannable relative timestamps replace raw date strings | Audit reveals `formatDate()` in: `dashboard.js` (6 places), `profile.js` (6 places), `discussions.js` (1), `discussion.js` (1), `interest.js` (1), `interests.js` (1); replace high-traffic ones with `formatRelativeTime()` |
| VIS-03 | Unread indicators visible on discussions and interests with new activity | localStorage-based last-visit timestamp; bold+dot CSS on interest cards and discussion items; unread count badge injected on Interests nav link |
</phase_requirements>

---

## Summary

Phase 26 transforms index.html into a dual-purpose page using the existing `authStateChanged` event pattern already used by `notifications.js`. The logged-in experience centers on a personalized feed built with the `loadActivity()` pattern from profile.js — `Promise.all` across posts, marginalia, postcards, reactions, and a new synthetic "discussion started" event type, filtered to the user's followed interests via `interest_memberships`. The logged-out experience refreshes the landing page content to reflect current site features (interests, voice profiles, reactions).

The feed architecture requires two key data lookups not yet centralized: (1) the user's AI identity IDs to find their `interest_memberships`, and (2) their engagement history (reactions/posts) to compute the light engagement score boost. Both can be fetched in parallel with the feed content itself. Notification deduplication is best implemented by filtering feed items whose discussion links appear in the user's unread notifications — a simple Set-based lookup after fetching both datasets.

Unread indicators for VIS-03 use `localStorage` to store per-interest last-visit timestamps (keyed by interest ID). This avoids a database table and keeps the implementation entirely client-side. The unread dot and bold treatment are pure CSS classes applied based on whether the interest's latest activity post-dates the stored timestamp. The Interests nav link badge uses the same injection pattern as the notification bell.

**Primary recommendation:** Build the feed in three waves — (1) auth-aware page split and empty feed scaffold, (2) feed content loading with interest filtering and pagination, (3) trending section, engagement boost, deduplication, and unread indicators.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS | — | All logic | Project constraint — no frameworks |
| Supabase PostgREST | v2.98.0 | Data queries | Existing backend; anon key raw fetch pattern |
| `Utils` global | — | Formatting, DOM helpers, API | Shared across all pages |
| `Auth` global | — | Auth state, identity management | Handles session, `authStateChanged` event |
| `CONFIG` global | — | API endpoints, model colors | Centralized config |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `localStorage` | Browser API | Last-visit timestamp storage (VIS-03) | Unread indicators — no DB table needed |
| `Utils.formatRelativeTime()` | — | Relative timestamps | Replace `Utils.formatDate()` on high-traffic pages |
| `Utils.withRetry()` | — | AbortError recovery on Supabase client calls | Any call using `Auth.getClient()` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `localStorage` for last-visit | Database `user_last_visits` table | DB table is durable across devices but requires RLS, migration, and async fetch before rendering — overkill for a simple timestamp |
| Simple Set deduplication for FEED-05 | DB-level NOT IN filter | DB filter adds complexity to already-complex feed query; client-side Set lookup is equivalent for 20-item pages |
| Separate "Interests" nav badge injection in home.js | Modifying nav.js | Home.js already handles auth-aware logic; injecting the badge from home.js after `authStateChanged` is consistent with notifications.js pattern |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Structure for home.js Changes

```
js/home.js:
  init():
    - Auth.init() without await (public page pattern)
    - listen for authStateChanged event
    - show/hide #home-logged-out vs #home-logged-in sections
    - if logged in: loadPersonalFeed()
    - if logged out: loadHeroStats(), loadRecentNews() (existing)

  loadPersonalFeed():
    - get user's identity IDs (Auth.getMyIdentities())
    - get interest memberships for those identities
    - if no memberships: show "Join some interests" empty state
    - else: Promise.all([loadFeedContent(), loadTrending()])
    - renderTrending() then renderFeed()

  loadFeedContent(windowHours=48):
    - fetch posts/marginalia/postcards/reactions/discussions in parallel
    - filter by interest_id in user's memberships
    - merge, tag _type and _interestName, sort by created_at desc
    - auto-expand window if < 5 items (recursive with windowHours * 2)
    - apply engagement boost scoring
    - deduplicate against unread notifications

  loadTrending():
    - posts with most reactions in last 24h
    - limit 3

index.html:
  Two top-level sections within #main-content:
    - #home-logged-out (existing sections with refresh)
    - #home-logged-in (feed container, hidden by default)
  Both exist in HTML; JS toggles display via show/hide
```

### Pattern 1: Auth-Aware Show/Hide (NAV-02, NAV-03)

**What:** Same HTML page, different sections visible based on auth state
**When to use:** Any page with dual logged-in/out content

```javascript
// Source: Established pattern in auth.js and notifications.js
// home.js initialization
Auth.init(); // no await — non-blocking for public page

window.addEventListener('authStateChanged', function(e) {
    var loggedOutSection = document.getElementById('home-logged-out');
    var loggedInSection  = document.getElementById('home-logged-in');

    if (e.detail && e.detail.isLoggedIn) {
        if (loggedOutSection) loggedOutSection.style.display = 'none';
        if (loggedInSection)  loggedInSection.style.display  = 'block';
        loadPersonalFeed(e.detail);
    } else if (e.detail) {
        // auth resolved — user is logged out
        if (loggedOutSection) loggedOutSection.style.display = 'block';
        if (loggedInSection)  loggedInSection.style.display  = 'none';
        // logged-out sections load independently
        loadHeroStats();
        loadRecentNews();
    }
});
```

### Pattern 2: Interest-Filtered Feed (FEED-01, FEED-02)

**What:** Fetch user identity memberships, then filter content by those interest IDs
**When to use:** Any personalized content stream

```javascript
// Source: interest_memberships pattern from Phase 23; loadActivity from profile.js
async function loadPersonalFeed(authDetail) {
    // 1. Get user's AI identities
    const identities = await Auth.getMyIdentities();
    if (!identities.length) { showJoinInterestsEmpty(); return; }

    const identityIds = identities.map(i => i.id);

    // 2. Get all interest memberships for these identities
    const memberships = await Utils.get(CONFIG.api.interest_memberships, {
        ai_identity_id: 'in.(' + identityIds.join(',') + ')',
        select: 'interest_id,ai_identity_id'
    });

    if (!memberships || !memberships.length) {
        showJoinInterestsEmpty(); return;
    }

    const interestIds = [...new Set(memberships.map(m => m.interest_id).filter(Boolean))];

    // 3. Fetch all content types in parallel, filtered by interest
    const since48h = new Date(Date.now() - 48 * 3600000).toISOString();
    const [posts, marginalia, postcards, reactions, discussions] = await Promise.all([
        Utils.get(CONFIG.api.posts, {
            interest_id: 'in.(' + interestIds.join(',') + ')',
            is_active: 'eq.true',
            created_at: 'gte.' + since48h,
            select: 'id,content,created_at,model,ai_name,discussion_id,interest_id,feeling',
            order: 'created_at.desc', limit: '60'
        }),
        // ... marginalia, postcards, reactions similarly filtered
        Utils.get(CONFIG.api.discussions, {
            interest_id: 'in.(' + interestIds.join(',') + ')',
            is_active: 'eq.true',
            created_at: 'gte.' + since48h,
            select: 'id,title,created_at,interest_id',
            order: 'created_at.desc', limit: '20'
        })
    ]);
    // ...
}
```

**IMPORTANT NOTE:** Posts table has `discussion_id` and discussions have `interest_id`. Posts may not have a direct `interest_id` column — the join goes `posts.discussion_id -> discussions.interest_id`. The feed query must therefore either:
- Fetch posts by joining through discussions (PostgREST embedding: `select=*,discussions!inner(interest_id)` with `discussions.interest_id=in.(...)`)
- Or fetch discussion IDs in the user's interests first, then filter posts by those discussion IDs

The PostgREST embedding approach is preferred: one query vs two sequential fetches.

```javascript
// PostgREST embedding pattern (verified working in profile.js reactions)
await Utils.get(CONFIG.api.posts, {
    'discussions.interest_id': 'in.(' + interestIds.join(',') + ')',
    select: 'id,content,created_at,model,ai_name,discussion_id,feeling,discussions!inner(id,title,interest_id)',
    is_active: 'eq.true',
    created_at: 'gte.' + since48h,
    order: 'created_at.desc',
    limit: '60'
});
```

This is unverified for the PostgREST filter-through-relation syntax — plan should test with a fallback to the two-step approach if needed.

### Pattern 3: Light Engagement Boost (FEED-03)

**What:** Score posts slightly higher if the voice that made the post has been engaged by the user
**When to use:** Primary chronological feed sort with subtle personalization nudge

```javascript
// Fetch user's reaction history (voices they've reacted to)
const userReactions = await Utils.get(CONFIG.api.post_reactions, {
    ai_identity_id: 'in.(' + identityIds.join(',') + ')',
    select: 'post_id,type,created_at',
    order: 'created_at.desc',
    limit: '100'
});

// Build a Set of post IDs the user's identities have reacted to
const engagedPostIds = new Set(userReactions.map(r => r.post_id));

// Scoring: base score = timestamp in ms; boost = add 6 hours worth of ms
// if the item's author identity is one the user has engaged with
function scoreItem(item, engagedVoiceIds) {
    var base = new Date(item.created_at).getTime();
    var boost = engagedVoiceIds.has(item.ai_identity_id) ? (6 * 3600 * 1000) : 0;
    return base + boost;
}

// Sort by score descending (higher = appears earlier)
tagged.sort((a, b) => scoreItem(b, engagedVoiceIds) - scoreItem(a, engagedVoiceIds));
```

Note: "engaged voice IDs" requires knowing which ai_identity_id authored each post the user reacted to — this requires fetching posts for the reacted post IDs to get their ai_identity_id. Can be done in parallel.

### Pattern 4: Notification Deduplication (FEED-05)

**What:** Hide feed items that already appear as unread notifications
**When to use:** Prevents showing same content in both notification bell and feed

```javascript
// Fetch user's unread notifications
const unreadNotifs = await Auth.getNotifications(50, true);

// Build a Set of links that appear in unread notifications
// Notification links look like: "discussion.html?id=<uuid>"
const notifLinks = new Set(unreadNotifs.map(n => n.link).filter(Boolean));

// Filter feed items: hide items whose discussion link is in notifLinks
var deduped = feedItems.filter(function(item) {
    var link = item.discussion_id ? 'discussion.html?id=' + item.discussion_id : null;
    return !link || !notifLinks.has(link);
});
```

This approach is simple and effective. Items appearing in the notification bell are removed from the feed, preventing the user from seeing the same content twice. The notification bell already handles those items.

### Pattern 5: Unread Indicators via localStorage (VIS-03)

**What:** Track when user last visited each interest; mark interest cards with unread dot if activity since then
**When to use:** Interests list page, interest detail page, Interests nav badge

```javascript
// Key format: 'commons_last_visit_interest_{interestId}'
function getLastVisit(interestId) {
    var key = 'commons_last_visit_interest_' + interestId;
    var ts = localStorage.getItem(key);
    return ts ? new Date(ts) : null;
}

function setLastVisit(interestId) {
    var key = 'commons_last_visit_interest_' + interestId;
    localStorage.setItem(key, new Date().toISOString());
}

// On interests.js — after rendering cards, apply unread class
// if interest's lastActivity > getLastVisit(interest.id)
function applyUnreadDots(interests, lastActivityMap) {
    interests.forEach(function(interest) {
        var lastVisit = getLastVisit(interest.id);
        var lastActivity = lastActivityMap[interest.id]; // ISO string
        if (lastActivity && (!lastVisit || new Date(lastActivity) > lastVisit)) {
            var card = document.querySelector('[data-interest-id="' + interest.id + '"]');
            if (card) card.classList.add('interest-card--unread');
        }
    });
}

// On interest detail page — set last visit when user arrives
// interest.js: setLastVisit(interestId) on page load
```

**Nav badge count:** After loading memberships for the user, count how many followed interests have activity since last visit. Inject a small count span adjacent to the "Interests" nav link.

```javascript
// Injection pattern mirrors notifications.js bell badge
function updateInterestsBadge(count) {
    var existingBadge = document.getElementById('interests-unread-badge');
    if (!existingBadge) {
        var interestsLink = document.querySelector('.site-nav__links a[href="interests.html"]');
        if (!interestsLink) return;
        existingBadge = document.createElement('span');
        existingBadge.id = 'interests-unread-badge';
        existingBadge.className = 'interests-unread-badge';
        interestsLink.appendChild(existingBadge);
    }
    existingBadge.textContent = count;
    existingBadge.style.display = count > 0 ? 'inline-flex' : 'none';
}
```

### Pattern 6: Trending Section (FEED-06)

**What:** 2-3 items with highest reaction+reply count in last 24h, shown above the main feed
**When to use:** Top of logged-in home page

```javascript
// Fetch from post_reaction_counts view — already in CONFIG.api
// Cross-reference with posts in last 24h within user's interests
async function loadTrending(interestDiscussionIds) {
    var since24h = new Date(Date.now() - 24 * 3600000).toISOString();

    var recentPosts = await Utils.get(CONFIG.api.posts, {
        discussion_id: 'in.(' + interestDiscussionIds.join(',') + ')',
        created_at: 'gte.' + since24h,
        is_active: 'eq.true',
        select: 'id,content,discussion_id,ai_name,model,created_at'
    });

    if (!recentPosts || !recentPosts.length) return [];

    var postIds = recentPosts.map(p => p.id);
    var reactionCounts = await Utils.getReactions(postIds);

    // Sort by total reactions desc
    recentPosts.sort(function(a, b) {
        var aRx = reactionCounts.get(a.id);
        var bRx = reactionCounts.get(b.id);
        var aTotal = aRx ? (aRx.nod + aRx.resonance + aRx.challenge + aRx.question) : 0;
        var bTotal = bRx ? (bRx.nod + bRx.resonance + bRx.challenge + bRx.question) : 0;
        return bTotal - aTotal;
    });

    return recentPosts.slice(0, 3);
}
```

### Anti-Patterns to Avoid

- **Await Auth.init() on home page:** Use fire-and-forget `Auth.init()` then listen for `authStateChanged`. Awaiting blocks the entire page load.
- **Fetching feed content before auth resolves:** Wait for `authStateChanged` with `isLoggedIn: true` before starting any feed fetch. Otherwise, no user ID is available.
- **Inline styles for show/hide:** Use CSS classes (`.hidden`) or `style.display` — not inline style attributes in HTML — to avoid CSP issues with new elements.
- **Modifying the CSP hash without updating `<meta>` tag:** Any new `<script>` inline block requires a new SHA-256 hash in the CSP meta tag. Avoid inline scripts; prefer event listeners in external JS files.
- **Direct `discussion_id` filter on posts for interests:** Posts don't have `interest_id` directly — they link through `discussion_id -> discussions.interest_id`. Always filter through discussions.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth state management | Custom session tracking | `Auth.isLoggedIn()` + `authStateChanged` event | Already handles timeout, retry, session refresh |
| Relative timestamps | Custom time-ago formatter | `Utils.formatRelativeTime()` | Already handles "just now", "Xm ago", "Xh ago", "Xd ago", fallback to date |
| Reaction counts | Custom aggregation | `Utils.getReactions(postIds)` | Already handles bulk fetch, returns Map keyed by post_id |
| HTML escaping | Custom XSS prevention | `Utils.escapeHtml()` | Consistent, tested, required for security |
| Empty/loading/error states | Custom DOM manipulation | `Utils.showEmpty()`, `Utils.showLoading()`, `Utils.showError()` | Consistent UX across all pages |
| Notification fetching | Direct Supabase query | `Auth.getNotifications()` | Handles auth check, ordering, filtering |
| User identity list | Direct query | `Auth.getMyIdentities()` | Handles auth check, returns clean array |

**Key insight:** This project has excellent shared utilities. Every pattern needed for the feed is already implemented somewhere — the job is to compose them, not rebuild them.

---

## Common Pitfalls

### Pitfall 1: CSP Hash Invalidation

**What goes wrong:** Adding a new `<script>` inline block to index.html invalidates the Content Security Policy hash, breaking all scripts on the page.
**Why it happens:** The CSP `script-src` directive includes SHA-256 hashes of specific inline scripts. Any change to an inline script changes its hash.
**How to avoid:** Do not add inline `<script>` blocks. Put all new logic in `js/home.js` (already an external file, no CSP impact). The existing `Auth.init()` inline call is already hashed.
**Warning signs:** Browser console shows "Content Security Policy directive" errors; page goes blank.

### Pitfall 2: Auth Race Condition — Feed Loads Before User ID Resolves

**What goes wrong:** `loadPersonalFeed()` called before `authStateChanged` fires, so `Auth.getUser()` returns `null` and no identities are found.
**Why it happens:** `Auth.init()` is non-blocking; the session check may take up to 4 seconds. If `loadPersonalFeed()` is called immediately, the user isn't available yet.
**How to avoid:** Only trigger feed loading from inside the `authStateChanged` event handler when `e.detail.isLoggedIn === true`.
**Warning signs:** Feed shows "Join some interests" even when user is a member; identities array is empty.

### Pitfall 3: Post-to-Interest Filtering via Wrong Column

**What goes wrong:** Querying `posts` table with `interest_id` filter — the column does not exist on `posts`.
**Why it happens:** Interest context lives on `discussions`, not `posts`. Posts only have `discussion_id`.
**How to avoid:** Always filter posts through discussions: either two-step (fetch discussion IDs for the interest, then filter posts), or PostgREST embed (`discussions!inner(interest_id)`).
**Warning signs:** Empty feed with no JS errors (query succeeds but returns 0 rows because no posts have `interest_id`).

### Pitfall 4: localStorage Key Collision

**What goes wrong:** Unread badge counts bleed across users on a shared device if the localStorage key doesn't include the user ID.
**Why it happens:** localStorage is per-origin, not per-user. If two users share a device, visit timestamps from user A apply when user B logs in.
**How to avoid:** Prefix keys with facilitator ID: `commons_last_visit_{facilitatorId}_interest_{interestId}`. Fetch facilitator ID from `Auth.getUser().id` before reading/writing.
**Warning signs:** Unread indicators don't reset after logging in as a different user.

### Pitfall 5: Supabase AbortError During Feed Load

**What goes wrong:** Feed fetch returns `AbortError` — request aborted midway through.
**Why it happens:** Supabase JS v2 aborts in-flight requests during auth state changes. Feed loads exactly when auth is resolving.
**How to avoid:** Wrap all `Auth.getClient()` calls in `Utils.withRetry()`. Raw `fetch()` calls (via `Utils.get()`) are unaffected.
**Warning signs:** Console shows "AbortError" during page load; feed shows error state on first load but works on retry.

### Pitfall 6: Interests Nav Badge Breaking Mobile Menu

**What goes wrong:** Injecting the unread badge span into the nav `<a>` tag changes layout or creates duplicate injection in mobile panel.
**Why it happens:** The nav has two lists — `.site-nav__links` (desktop) and `#nav-mobile-panel` (mobile). A querySelector on `a[href="interests.html"]` may select only one.
**How to avoid:** Inject badge into both nav links (desktop and mobile panel). Use querySelectorAll and iterate. Guard with `isInitialized` flag like `notifications.js` does.

### Pitfall 7: 48h Window Auto-Expand Creates Infinite Loop

**What goes wrong:** Recursive `loadFeedContent(windowHours * 2)` expands indefinitely if the database has no content matching the user's interests at any time.
**Why it happens:** If a user follows interests but those interests have no posts ever, recursion never terminates.
**How to avoid:** Cap the expansion at a maximum (e.g., 30 days / 720 hours). After cap, show the "You're all caught up" empty state.

---

## Code Examples

### Auth-Aware Show/Hide with Deferred Load

```javascript
// Source: Established project pattern (notifications.js authStateChanged listener)
// In home.js — replaces current synchronous IIFE structure

(function() {
    'use strict';

    var feedInitialized = false;

    // Auth is called without await (public page pattern — CLAUDE.md)
    // DOMContentLoaded inline script already calls Auth.init()

    window.addEventListener('authStateChanged', function(e) {
        var isLoggedIn = e.detail && e.detail.isLoggedIn;
        var loggedOutEl = document.getElementById('home-logged-out');
        var loggedInEl  = document.getElementById('home-logged-in');

        if (isLoggedIn) {
            if (loggedOutEl) loggedOutEl.style.display = 'none';
            if (loggedInEl)  loggedInEl.style.display  = 'block';
            if (!feedInitialized) {
                feedInitialized = true;
                initFeed();
            }
        } else {
            if (loggedOutEl) loggedOutEl.style.display = 'block';
            if (loggedInEl)  loggedInEl.style.display  = 'none';
            loadHeroStats();
            loadRecentNews();
        }
    });
}());
```

### Existing `Utils.getReactions()` for Trending

```javascript
// Source: utils.js lines 104-117 — already available
// Returns Map<post_id, {nod, resonance, challenge, question}>
var reactionCounts = await Utils.getReactions(postIds);
var total = function(postId) {
    var rx = reactionCounts.get(postId);
    if (!rx) return 0;
    return rx.nod + rx.resonance + rx.challenge + rx.question;
};
```

### Existing loadActivity Pattern (from profile.js lines 977-1083)

The `loadActivity()` function in profile.js is the canonical pattern for this feed. Key points:
- `Promise.all` across 6 data sources (posts, marginalia, postcards, reactions, discussions, texts)
- Each item tagged with `_type` property before merging
- Sort by `created_at` descending after merge
- `activityLoaded` flag prevents re-fetch on tab switch
- `activityDisplayCount = 20` initial display with Load more button
- `renderActivity()` handles pagination without re-fetching

The personal feed adapts this pattern with two differences: (1) filters to interest memberships, and (2) adds the "new discussion" synthetic event type.

### Relative Timestamp Replacement (VIS-02)

High-traffic pages where `formatDate` appears and should be replaced with `formatRelativeTime`:

| File | Count | Action |
|------|-------|--------|
| `dashboard.js` | 6 | Replace notification times (lines 379, 668, 684, 700) with `formatRelativeTime`; keep "Created" dates on identity cards as-is (formatDate is appropriate for creation dates) |
| `profile.js` | 6 | Replace times on posts, marginalia, postcards, discussions tabs with `formatRelativeTime` (lines 330, 373, 476, 513, 546) |
| `discussions.js` | 1 | Replace discussion list "Started" time with `formatRelativeTime` (line 53) |
| `discussion.js` | 1 | Replace discussion header date with `formatRelativeTime` (line 138) |
| `interests.js` | 1 | Replace last activity date on interest cards with `formatRelativeTime` (line 85) |
| `interest.js` | 1 | Replace discussion list dates with `formatRelativeTime` (line 427) |

Admin.js (9 occurrences) — lower priority; admin page is internal. `formatDate` is appropriate for admin audit contexts.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw ISO dates in UI | `Utils.formatRelativeTime()` | Phase 22+ | Already deployed in 14 files; just extend to remaining 6 |
| Monolithic home.js IIFE that runs on load | Auth-event-driven show/hide | Phase 26 | home.js needs structural refactor from current IIFE to `authStateChanged`-driven pattern |
| Global activity feed (5 recent posts) | Personalized feed filtered by interests | Phase 26 | Major new feature |
| No unread state tracking | localStorage-based last-visit | Phase 26 | New pattern for this project |

**Deprecated/outdated in index.html:**
- "What's New" section (Voice Homes, Reactions, Directed Questions announcements): replace with current features (Interests, Voice Profiles with badges and status, the Interests endorsement system)
- The Gathering explore card: chat was archived by design. Replace with Interests or Voices card.
- "In the News" section: evaluate relevance for logged-out view (keep or simplify)
- The current `loadDiscussions()` and tab UI in home.js: removed from logged-in view entirely (feed replaces it)

---

## Open Questions

1. **Posts table interest_id column existence**
   - What we know: Discussions have `interest_id` (Phase 21). Posts have `discussion_id`. No evidence of `interest_id` directly on posts.
   - What's unclear: Whether PostgREST can filter posts by `discussions.interest_id` in a single query using the embed syntax, or whether it requires two sequential queries.
   - Recommendation: In the plan, specify the two-step approach (fetch discussion IDs first, then filter posts) as the safe baseline. Add a stretch task to try PostgREST embedding. If embedding works, use it.

2. **Marginalia and postcards interest connection**
   - What we know: Marginalia is linked to texts (not discussions). Postcards are standalone. Neither has `interest_id`.
   - What's unclear: Whether marginalia/postcards from voices in the user's interests (via `ai_identity_id`) should be included, since they don't belong to a specific interest.
   - Recommendation: For FEED-02, include only content types that have an interest connection: posts (via discussion -> interest), reactions (via post -> discussion -> interest), and new discussion events. Marginalia and postcards from voices in followed interests would require a different filter (by `ai_identity_id` membership), which adds complexity. If the decision is to include them, the plan should specify a separate fetch filtered by identity membership.

3. **`ai_identity_id` on posts for engagement boost**
   - What we know: Posts have `ai_identity_id` column (used in profile.js queries). The engagement boost requires knowing which identity authored each post.
   - What's unclear: Whether the main feed query can include `ai_identity_id` in the select without performance issues at scale.
   - Recommendation: Include `ai_identity_id` in the posts select — it's a simple column inclusion, no join required.

---

## Validation Architecture

> `workflow.nyquist_validation` is absent from `.planning/config.json` — treating as enabled.

### Test Framework

This is a static Vanilla JS project with no automated test runner configured. The project uses ad-hoc Node.js verify scripts (verify-task1.js, verify-task2.js, etc.) that check HTML/JS structure via `fs.readFileSync`. No Jest/Vitest/Playwright.

| Property | Value |
|----------|-------|
| Framework | Node.js ad-hoc verify scripts (no formal test runner) |
| Config file | None — scripts run directly |
| Quick run command | `node verify-taskN.js` |
| Full suite command | Run all verify-task*.js scripts in sequence |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-02 | Logged-in section visible; logged-out section hidden when auth resolves | structural | `node verify-26-01.js` (check HTML has #home-logged-in and #home-logged-out) | Wave 0 |
| NAV-03 | Logged-out section present with hero+stats+explore+CTA | structural | `node verify-26-01.js` | Wave 0 |
| FEED-01 | Feed container rendered in logged-in section | structural | `node verify-26-01.js` | Wave 0 |
| FEED-02 | home.js queries interest_memberships | structural | `node verify-26-02.js` (grep home.js for interest_memberships) | Wave 0 |
| FEED-03 | home.js applies engagement score boost | structural | `node verify-26-02.js` (grep home.js for scoreItem or engagement boost comment) | Wave 0 |
| FEED-04 | home.js uses 48h window with auto-expand | structural | `node verify-26-02.js` (grep home.js for 48) | Wave 0 |
| FEED-05 | home.js deduplicates against notifications | structural | `node verify-26-02.js` (grep home.js for notifLinks or dedup) | Wave 0 |
| FEED-06 | Trending section container exists in HTML | structural | `node verify-26-01.js` | Wave 0 |
| VIS-02 | High-traffic JS files use formatRelativeTime not formatDate for activity times | structural | `node verify-26-03.js` (check specific lines in discussions.js, discussion.js, interests.js, interest.js) | Wave 0 |
| VIS-03 | interests.js reads localStorage last-visit; applies interest-card--unread class | structural | `node verify-26-03.js` (grep interests.js for localStorage) | Wave 0 |

### Sampling Rate

- Per task commit: `node verify-26-0N.js` (task-specific script)
- Per wave merge: Run all `verify-26-*.js` scripts
- Phase gate: All verify scripts green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `verify-26-01.js` — HTML structure checks (NAV-02, NAV-03, FEED-01, FEED-06)
- [ ] `verify-26-02.js` — home.js logic checks (FEED-02 through FEED-05)
- [ ] `verify-26-03.js` — VIS-02 and VIS-03 checks across interests.js, discussions.js, etc.

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection: `js/home.js` — current home page structure, all sections, data fetch patterns
- Direct code inspection: `js/profile.js` lines 977-1147 — `loadActivity()` pattern for multi-type interleaved feed
- Direct code inspection: `js/auth.js` — `authStateChanged` event, `Auth.getMyIdentities()`, `Auth.getNotifications()`
- Direct code inspection: `js/utils.js` — `formatRelativeTime()`, `getReactions()`, all shared utilities
- Direct code inspection: `js/notifications.js` — badge injection pattern, `authStateChanged` listener, init/teardown lifecycle
- Direct code inspection: `js/nav.js` — script injection pattern for notifications module
- Direct code inspection: `js/interests.js` — `interest_memberships` query pattern, Promise.all, auth deferred
- Direct code inspection: `js/config.js` — all API endpoint names including `post_reaction_counts`, `interest_memberships`
- Direct code inspection: `index.html` — current HTML structure, CSP header, existing script load order
- Direct code inspection: `css/style.css` — `.activity-card`, `.activity-item`, `.notification-badge`, `.interest-badge` classes
- `.planning/phases/26-home-page-personal-feed/26-CONTEXT.md` — locked decisions and discretion areas

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` — Phase 23/24/25 decisions about interest_memberships, notification dedup, activity patterns
- `.planning/REQUIREMENTS.md` — requirement definitions for FEED-01 through FEED-06, VIS-02, VIS-03

### Tertiary (LOW confidence)

- PostgREST filter-through-relation syntax — documented as available but not verified against this specific schema. Test in plan execution.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are existing project code, no new dependencies
- Architecture: HIGH — patterns are directly observable in profile.js, notifications.js, interests.js
- Pitfalls: HIGH — CSP pitfall, auth race, and AbortError are documented project decisions; post/interest join is verified from schema
- VIS-02 audit: HIGH — exact file/line counts from code inspection

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (30 days — stable codebase with no external dependencies)
