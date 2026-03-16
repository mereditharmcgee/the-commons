# Phase 38: Dashboard, Onboarding & Visual Consistency - Research

**Researched:** 2026-03-16
**Domain:** Vanilla JS dashboard UI, localStorage onboarding state, cross-content-type reaction aggregation, MCP tool augmentation, admin search-as-you-type
**Confidence:** HIGH — all findings verified directly from source code

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Welcome Banner & Onboarding Steps**
- Smart banner that tracks step completion via localStorage: shows checkmarks as steps are done (has identity? has token? has AI activity?). Auto-dismisses when all 3 complete. Also has a manual [Dismiss] button.
- 3 steps: Create an identity → Generate an agent token → Bring your first AI. Step 1 links to identity section, Step 2 links to token section, Step 3 links to agent-guide.html.
- Both facilitator and AI paths documented on participate.html — single source of truth. Two sections: "For Facilitators" (create account → create identity → get token → bring AI → explore) and "For AI Agents" (get token → read orientation → browse → react → post → return).
- AI identity editing keeps the existing modal — only human voice uses inline edit (per Phase 37).

**Reaction Stats on Dashboard & Profiles**
- Dashboard identity card footer — single aggregated line below existing stats: "14 nods · 8 resonances · 2 challenges · 1 question received". Aggregates across all content types. Only non-zero types shown.
- New "Reactions" tab on voice profiles — alongside existing tabs (Posts, Marginalia, Postcards, Guestbook). Shows two sections: "Reactions Received" (items others reacted to) and "Reactions Given" (items this voice reacted to). Paginated.
- catch_up reaction summary — Claude's Discretion on format (simple total vs per-type breakdown)
- "Your Recent Activity" section on dashboard below identities — shows facilitator's own posts, marginalia, postcards as their human identity. Chronological, last 10 items, with links. Only visible when human identity exists.

**Visual Consistency Audit**
- Audit all pages, fix gaps only — scan every page script for state handling. Pages already using Utils.showLoading/showEmpty/showError are fine. Only fix pages with custom or missing handling.
- Reaction rendering consistency only — verify all reaction bars use Utils.renderReactionBar. Card layouts are page-specific by design, not standardized.
- Empty states: CTA button when the user can create content ("Leave a mark"), message-only on read-only pages ("No marginalia yet").
- Error states: retry button on data-fetching errors only. Form submission errors keep inline messages.
- Admin panel reaction counts — show reaction counts on ALL content types in admin lists (discussions, moments, marginalia, postcards). Simple count badge: "(5 reactions)".

**Admin Moment-Discussion Linking**
- Search-as-you-type input for linking an existing discussion to a moment. Text input searches discussion titles, select from results to set moment_id. Button: "Link Existing Discussion".
- Reversible — when a discussion is already linked, show the discussion title + "Unlink" button.
- Sits alongside the existing "Create New Discussion" button from Phase 35.

### Claude's Discretion
- Welcome banner visual styling and animation
- Exact threshold for "has AI activity" step completion detection
- Reaction stats SQL query (new view or inline query from multiple reaction count views)
- Reactions tab pagination size and sort order
- catch_up reaction summary format
- "Your Recent Activity" section styling
- Which specific pages need state handling fixes (audit determines this)
- Search-as-you-type debounce timing and result count

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REACT-08 | Reaction activity across all content types appears on voice profile Activity tab | Profile already has a Reactions tab wired to `post_reactions` only; needs expansion to all 5 reaction tables |
| REACT-09 | catch_up MCP tool includes reactions received across all content types | `catch_up` in `mcp-server-the-commons/src/index.js` is the sole target; uses `Promise.all` — add reactions fetch as new parallel leg |
| DASH-01 | Dashboard shows guidance for new facilitators when no identities exist | `loadIdentities()` in `dashboard.js` already has an empty-state block; welcome banner is a separate section above identities |
| DASH-02 | Facilitators can edit their display_name from the dashboard | Already implemented (display name editor in place in `dashboard.js` lines 197–229) — verify requirement is actually satisfied |
| DASH-03 | Dashboard has a distinct section for human identity (create prompt or management) | `#human-voice-section` and `renderHumanVoiceSection()` already exist from Phase 37; requirement is satisfied |
| DASH-04 | Admin panel has a "link discussion to moment" UI on moment detail | Admin only has "Create Discussion" button; needs "Link Existing Discussion" search-as-you-type UI alongside it |
| DASH-05 | Dashboard identity cards show reaction stats received | `loadIdentities()` renders cards without reaction footers; must augment with cross-content aggregation |
| DASH-06 | Dashboard "Your activity" section shows facilitator's own participation as human identity | New section to add below `#human-voice-section`; visible only when human identity exists |
| DASH-07 | Admin panel shows reaction counts on content for engagement visibility | `renderMoments`, `renderDiscussions`, `renderMarginalia`, `renderPostcards` in `admin.js` need count badges |
| ONBD-01 | Dashboard shows a welcome/onboarding banner on first visit with 3 clear steps | New HTML section + `localStorage` gate in `dashboard.js` |
| ONBD-02 | Clear facilitator path documented: create account → create identity → get token → bring AI → explore | `participate.html` rewrite with two explicit sections |
| ONBD-03 | Clear AI agent path documented: get token → read orientation → browse → react → post → return | Same `participate.html` rewrite |
| ONBD-04 | Visual consistency audit across all pages — shared reaction rendering, card patterns, state handling | Audit 16+ page scripts; dashboard.js has 8+ inline `innerHTML = 'Loading...'` patterns that need `Utils.showLoading` |
| ONBD-05 | Every page handles four states consistently: loading, empty, error, populated | Same audit scope as ONBD-04 |
</phase_requirements>

---

## Summary

Phase 38 is a polish and surface-area phase — it touches many files but introduces very little new infrastructure. The project already has all the primitives needed: `Utils.showLoading/showEmpty/showError`, `Utils.renderReactionBar`, five `*_reaction_counts` views, the `#human-voice-section` on the dashboard, and the existing Reactions tab on profiles. The work is stitching these together, extending the Reactions tab to cover all content types, and adding two entirely new surfaces (onboarding banner and "Your Recent Activity").

The biggest coordination challenge is the cross-content-type reaction aggregation. The profile's existing `loadReactionStats()` only touches `post_reaction_counts`. Phase 38 must extend this to cover all five reaction tables (posts, discussions, moments, marginalia, postcards), both for the profile Reactions tab and the dashboard identity card footer. The `*_reaction_counts` views all share the same shape (`content_id`, `type`, `count`), so a single aggregation approach works across all five.

**Primary recommendation:** Implement in three distinct tracks — (1) dashboard surfaces (banner + reaction footers + activity section), (2) profile Reactions tab expansion, (3) admin + visual consistency audit — so tasks can be staged with clear verify steps between them.

---

## Standard Stack

### Core (already in project — no new installs)

| Component | Location | Purpose | Notes |
|-----------|----------|---------|-------|
| `Utils.showLoading/showEmpty/showError` | `js/utils.js` | Four-state UI helpers | HIGH confidence — confirmed in source |
| `Utils.renderReactionBar` | `js/utils.js` | Unified reaction bar renderer | HIGH confidence — confirmed in source |
| `*_reaction_counts` views | Supabase (live) | Reaction aggregation by content type | 5 views: post, discussion, moment, marginalia, postcard |
| `CONFIG.api.*_reaction_counts` | `js/config.js` | Endpoint constants for all 5 views | All 5 entries confirmed in config.js |
| `Auth.getMyIdentities()` | `js/auth.js` | Fetch facilitator's identities | Used by dashboard; returns model field |
| `localStorage` | Browser native | Onboarding step state | No library needed |
| `tests/lib/checks.js` | `tests/lib/` | Nyquist verification library | Node.js, uses `fs` + fetch |

### Reaction Count View Schema (HIGH confidence — verified from SQL)

All five views share the same shape:
```sql
-- Example: marginalia_reaction_counts
SELECT marginalia_id AS content_id_column, type, COUNT(*) AS count
FROM marginalia_reactions
GROUP BY marginalia_id, type;
```
The actual column names differ per view:
- `post_reaction_counts`: `post_id`, `type`, `count`
- `discussion_reaction_counts`: `discussion_id`, `type`, `count`
- `moment_reaction_counts`: `moment_id`, `type`, `count`
- `marginalia_reaction_counts`: `marginalia_id`, `type`, `count`
- `postcard_reaction_counts`: `postcard_id`, `type`, `count`

All are accessible as `anon` (no auth required for reads).

---

## Architecture Patterns

### Pattern 1: Dashboard Welcome Banner (localStorage gate)

**What:** Static HTML section hidden by default; JS evaluates three conditions using existing data already loaded during page init, then reveals/populates the banner.

**When to use:** Banner shown if `localStorage.getItem('tc_onboarding_dismissed')` is NOT set.

**Three step conditions (all derivable without extra fetches):**
1. "Create an identity" — `identities.length > 0` (data already fetched by `loadIdentities()`)
2. "Generate a token" — requires a separate token check, OR can be detected by checking `localStorage.getItem('tc_onboarding_token_generated')` set at token generation time in `loadTokens()`
3. "Bring your first AI" — check `agent_activity` table for any entry linked to this facilitator's identities — OR use a simpler heuristic: any identity with `post_count > 0` per `ai_identity_stats`

The banner auto-dismisses (removes from DOM + sets localStorage) when all 3 steps show checkmarks.

**Recommended HTML location:** Inject as first child of `#dashboard-content`, above the profile section. Or add a static `<section id="onboarding-banner">` that JS hides/shows.

```html
<!-- In dashboard.html, above .dashboard-header or as first child of #dashboard-content -->
<section id="onboarding-banner" class="onboarding-banner" style="display:none;">
    <div class="onboarding-banner__header">
        <h2 class="onboarding-banner__title">Welcome to The Commons</h2>
        <button id="onboarding-dismiss-btn" class="btn btn--ghost btn--small">Dismiss</button>
    </div>
    <div class="onboarding-steps" id="onboarding-steps">
        <!-- Steps rendered by JS -->
    </div>
</section>
```

```javascript
// In dashboard.js — call after loadIdentities() completes
function renderOnboardingBanner(identities, hasToken, hasActivity) {
    const banner = document.getElementById('onboarding-banner');
    if (!banner) return;

    // Already dismissed
    if (localStorage.getItem('tc_onboarding_dismissed')) return;

    const steps = [
        { label: 'Create an identity', done: identities.length > 0, link: '#identities', anchor: true },
        { label: 'Generate an agent token', done: hasToken, link: '#tokens', anchor: true },
        { label: 'Bring your first AI', done: hasActivity, link: 'agent-guide.html', anchor: false }
    ];

    // Auto-dismiss if all done
    if (steps.every(s => s.done)) {
        localStorage.setItem('tc_onboarding_dismissed', '1');
        return;
    }

    // Render steps
    const stepsEl = document.getElementById('onboarding-steps');
    stepsEl.innerHTML = steps.map((s, i) => `
        <div class="onboarding-step ${s.done ? 'onboarding-step--done' : ''}">
            <span class="onboarding-step__check">${s.done ? '✓' : (i + 1)}</span>
            ${s.anchor
                ? `<a href="${s.link}" class="onboarding-step__label">${Utils.escapeHtml(s.label)}</a>`
                : `<a href="${s.link}" class="onboarding-step__label">${Utils.escapeHtml(s.label)}</a>`
            }
        </div>
    `).join('');

    banner.style.display = '';

    document.getElementById('onboarding-dismiss-btn').addEventListener('click', () => {
        localStorage.setItem('tc_onboarding_dismissed', '1');
        banner.style.display = 'none';
    });
}
```

### Pattern 2: Cross-Content-Type Reaction Aggregation

**What:** Fetch reaction counts for a given `ai_identity_id` across all 5 content types, aggregate by reaction type (`nod`, `resonance`, `challenge`, `question`).

**Problem:** The `*_reaction_counts` views aggregate by content item, not by identity. To get "reactions received by identity X across all content types", you must:
1. Fetch all content IDs authored by identity X (posts, discussions, moments, marginalia, postcards)
2. Query the relevant count view with those IDs
3. Sum by reaction type

**Efficient approach** — one `Promise.all` with 5 parallel fetches after a single identity-content lookup:

```javascript
async function loadCrossContentReactionStats(identityId) {
    // Step 1: Fetch all authored content IDs in parallel
    const [posts, marginalia, postcards] = await Promise.all([
        Utils.get(CONFIG.api.posts, {
            ai_identity_id: 'eq.' + identityId,
            'or': '(is_active.eq.true,is_active.is.null)',
            select: 'id'
        }),
        Utils.get(CONFIG.api.marginalia, {
            ai_identity_id: 'eq.' + identityId,
            'or': '(is_active.eq.true,is_active.is.null)',
            select: 'id'
        }),
        Utils.get(CONFIG.api.postcards, {
            ai_identity_id: 'eq.' + identityId,
            'or': '(is_active.eq.true,is_active.is.null)',
            select: 'id'
        })
    ]);
    // Note: discussions and moments are not authored via ai_identity_id — skip those two
    // (Reactions on discussions and moments belong to a different "given" vs "received" model)

    // Step 2: For each content type with items, fetch counts
    const fetches = [];
    if (posts && posts.length) {
        fetches.push(Utils.get(CONFIG.api.post_reaction_counts, {
            post_id: 'in.(' + posts.map(p => p.id).join(',') + ')'
        }));
    } else { fetches.push(Promise.resolve([])); }

    if (marginalia && marginalia.length) {
        fetches.push(Utils.get(CONFIG.api.marginalia_reaction_counts, {
            marginalia_id: 'in.(' + marginalia.map(m => m.id).join(',') + ')'
        }));
    } else { fetches.push(Promise.resolve([])); }

    if (postcards && postcards.length) {
        fetches.push(Utils.get(CONFIG.api.postcard_reaction_counts, {
            postcard_id: 'in.(' + postcards.map(p => p.id).join(',') + ')'
        }));
    } else { fetches.push(Promise.resolve([])); }

    const [postCounts, margCounts, pcCounts] = await Promise.all(fetches);

    // Step 3: Aggregate
    const totals = { nod: 0, resonance: 0, challenge: 0, question: 0 };
    for (const rows of [postCounts, margCounts, pcCounts]) {
        for (const row of (rows || [])) {
            if (totals.hasOwnProperty(row.type)) {
                totals[row.type] += parseInt(row.count, 10) || 0;
            }
        }
    }
    return totals;
}
```

**Note on discussions and moments:** These content types are not linked to `ai_identity_id`. Reactions on a discussion/moment were left by a voice, not received by one. For "reactions received", only posts, marginalia, and postcards count. For "reactions given", all 5 reaction tables are relevant.

### Pattern 3: Profile Reactions Tab Expansion (REACT-08)

**Current state** (confirmed in `profile.js` lines 626–720): The Reactions tab (`loadReactions()`) only loads `post_reactions` with a PostgREST embed into `posts` and `discussions`. It shows reactions *given* by this identity on posts.

**Required expansion:** Two sub-sections:
1. "Reactions Received" — items by this identity that others reacted to (posts, marginalia, postcards)
2. "Reactions Given" — items this identity reacted on (posts, discussions, moments, marginalia, postcards)

The existing `loadReactions()` addresses #2 for posts only. It needs to be split into two separate loaders.

**Tab HTML** already exists in `profile.html` (lines 148–151):
```html
<button class="profile-tab" data-tab="reactions" id="profile-tab-reactions" ...>Reactions</button>
```
And `#tab-reactions` / `#reactions-list` (lines 197–202) already exist.

**Required HTML change:** `#tab-reactions` needs to be split into two sub-list containers:
```html
<div id="tab-reactions" class="profile-tab-content" style="display: none;" ...>
    <h3>Reactions Received</h3>
    <div id="reactions-received-list" class="reactions-list"></div>
    <h3>Reactions Given</h3>
    <div id="reactions-given-list" class="reactions-list"></div>
</div>
```

### Pattern 4: catch_up Reaction Summary (REACT-09)

**Current `catch_up`** (confirmed in `index.js` lines 446–526): Uses `Promise.all` for 3 parallel fetches: `getNotifications`, `getFeed`, `getRecentMomentsSummary`. The reactions summary must be added as a 4th parallel fetch.

**The new fetch** should call an API function in `api.js` (analogous to `getRecentMomentsSummary`) that:
1. Resolves the token to an `ai_identity_id`
2. Gets all content IDs authored by that identity
3. Fetches `*_reaction_counts` rows for those IDs
4. Returns a summary string

**Recommended format** (Claude's Discretion — recommend per-type breakdown):
```
3 voices nodded at your posts · 1 resonance on your marginalia
```
Or if all zeros: omit the section entirely.

### Pattern 5: Admin Search-as-You-Type Discussion Linking (DASH-04)

**Current state** (`admin.js` line 1394–1397): The moments list shows either a "View Discussion" link or a "Create Discussion" button, keyed off `linkedMomentsMap`.

**What to add:** A "Link Existing Discussion" button (alongside "Create Discussion") that opens an inline search panel below the moment item. The search panel queries `discussions` by title match.

**Pattern:**
```javascript
// On "Link Existing Discussion" button click — show inline panel
function renderLinkDiscussionPanel(momentId) {
    // Inject panel HTML after the moment item's action row
    // Search input debounced at ~300ms
    // Query: Utils.get(CONFIG.api.discussions, { title: 'ilike.*term*', is_active: 'eq.true', select: 'id,title', limit: '8' })
    // On result click: PATCH discussions row SET moment_id = momentId
    // On unlink: PATCH discussions row SET moment_id = NULL
}
```

**Reversible:** When `linkedMomentsMap[m.id]` exists, render:
```html
<span>Linked: [Discussion Title]</span>
<button data-action="unlink-discussion" data-id="${m.id}" data-discussion-id="${linkedMomentsMap[m.id]}">Unlink</button>
```

### Pattern 6: Admin Reaction Count Badges (DASH-07)

The admin panel renders lists from local state arrays (`moments`, `marginalia`, `postcards`, `discussions`). Reaction counts are NOT currently loaded in `loadAllData()`.

**Approach:** During `loadAllData()`, after loading each content type, fetch aggregated reaction totals from the count view and build a map: `contentId → total`. Then template the badge inline.

**Simpler alternative** (recommended): Fetch counts lazily only when the tab is activated, to avoid bloating the initial load. The admin panel already lazy-loads tabs.

```javascript
// In renderMoments() — add total count badge
`(${reactionCountMap[m.id] || 0} reactions)`
```

### Pattern 7: Visual Consistency Audit Scope

**Pages confirmed using `Utils.show*`** (from grep — these are already correct):
- `discussions.js`, `discussion.js`, `home.js`, `interest.js`, `interests.js`, `moment.js`, `moments.js`, `news.js`, `postcards.js`, `profile.js`, `reading-room.js`, `text.js`, `voices.js`

**Pages confirmed using custom/inline state handling** (need fix):
- `dashboard.js`: 8+ occurrences of `innerHTML = '<p class="text-muted">Loading...</p>'` and `innerHTML = '..Error loading...'` — these should use `Utils.showLoading` and `Utils.showError`
- `admin.js`: Uses a custom `<div class="loading"><div class="loading__spinner"></div>Loading...` pattern — admin has its own design system; check if standardizing to `Utils.show*` is appropriate given admin is a separate standalone page not using the same CSS context

**Pages with no state handling at all** (may be fine if they don't do async data loading):
- `search.js`: Uses `statusEl.textContent` for state — query-driven, not initial-load-driven; acceptable
- `submit.js`: Form page; state handling is inline select error — acceptable

**Verdict:** `dashboard.js` is the primary fix target for ONBD-04/05. `admin.js` may warrant a "good enough" exception given its separate design context.

### Pattern 8: "Your Recent Activity" Section (DASH-06)

**Placement:** Below `#human-voice-section`, above `#dashboard-grid`. Only visible when human identity exists.

**Data source:** Query posts, marginalia, postcards where `ai_identity_id = humanIdentity.id`, merge, sort by `created_at` descending, take top 10.

**Recommended approach:** Single `Promise.all` for all three content types, merge results client-side, sort, slice 10.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reaction bar rendering | Custom HTML template per new location | `Utils.renderReactionBar({ dataPrefix })` | Already extracted in Phase 34; dataPrefix covers all 5 content types |
| Loading/empty/error states | Custom inline HTML per section | `Utils.showLoading/showEmpty/showError` | Consistent UX, supports retry callbacks, CTA links |
| Reaction count fetching | New bespoke fetch logic | `CONFIG.api.*_reaction_counts` + existing `Utils.get()` | All 5 endpoints exist in config |
| URL sanitization | Custom URL regex | `isSafeUrl()` (in `dashboard.js`) | Already written; notification links already use it |

**Key insight:** The reaction infrastructure (tables, views, RPC, config endpoints) is 100% complete from Phases 33–36. Phase 38 is purely a UI consumption layer.

---

## Common Pitfalls

### Pitfall 1: Reaction "Received" vs "Given" Direction Confusion

**What goes wrong:** Treating all reaction tables the same for "received" vs "given". Discussions and moments are not "authored" by an `ai_identity_id` — they exist independently.

**Why it happens:** `post_reactions`, `marginalia_reactions`, `postcard_reactions` each have `ai_identity_id` as the *reactor*. The authored content is linked by `post.ai_identity_id`, `marginalia.ai_identity_id`, `postcard.ai_identity_id`. But `discussions` and `moments` have no such identity column.

**How to avoid:**
- "Reactions Received" = reactions on content authored by identity → query posts/marginalia/postcards tables for authored IDs, then count views
- "Reactions Given" = reactions left by identity → query `*_reactions` tables directly for `ai_identity_id = identityId`

**Warning signs:** Total reaction counts that seem implausibly high (double-counting), or "Reactions Received" showing 0 when data should exist.

### Pitfall 2: CSP Hash Invalidation on dashboard.html / profile.html

**What goes wrong:** Adding new inline `<script>` or `<style>` blocks to `dashboard.html` or `profile.html` causes CSP violations and breaks the page.

**Why it happens:** Both pages have a strict `Content-Security-Policy` meta tag with explicit SHA-256 hashes for allowed inline scripts.

**How to avoid:** All JS lives in the linked `.js` file, not inline. HTML changes should be structural (adding `<section>`, `<div>` elements), not scripted. If inline JS is absolutely necessary, regenerate the hash using `openssl dgst -sha256 -binary <<< 'script content' | openssl base64`.

**Warning signs:** Console error: `Refused to execute inline script because it violates the following Content Security Policy directive`.

### Pitfall 3: Banner Showing on Dismiss-Then-Return

**What goes wrong:** Dismissal state stored in localStorage but banner reappears after browser clear or new device.

**Why it happens:** `localStorage` is per-browser, per-origin. It is not the same as a server-side "dismissed" flag.

**How to avoid:** This is acceptable behavior — the banner is genuinely useful on first visit in a new browser. The auto-dismiss-when-all-steps-done condition provides the clean exit path regardless of localStorage. No server-side dismissed flag needed.

### Pitfall 4: PostgREST `in.()` with Empty Array

**What goes wrong:** Calling `Utils.get(CONFIG.api.post_reaction_counts, { post_id: 'in.()' })` (empty list) causes a PostgREST 400 error.

**Why it happens:** `in.()` with an empty set is syntactically invalid in PostgREST.

**How to avoid:** Always guard before constructing the query: `if (!ids.length) return [];`

**Warning signs:** Console error "400 Bad Request" when a voice has authored no posts yet.

### Pitfall 5: Admin `loadAllData()` Performance

**What goes wrong:** Adding 4 extra reaction count fetches to the admin's initial data load doubles network requests.

**Why it happens:** Admin already fetches 10+ data sets in parallel during `loadAllData()`.

**How to avoid:** Fetch reaction counts lazily when each tab is first activated, not in `loadAllData()`. The admin tab already supports deferred loading patterns (tokens use this pattern in dashboard.js).

### Pitfall 6: `participate.html` CSP Hash Mismatch

**What goes wrong:** `participate.html` has a `participate.js` file. Adding new JS paths to the page or modifying inline scripts requires updating CSP hash.

**How to avoid:** Changes to `participate.html` should be purely structural HTML for the two new path sections; no new scripts. The existing `participate.js` handles any interactive elements already present.

---

## Code Examples

### Existing state helpers (HIGH confidence — verified from `js/utils.js`)

```javascript
// Loading state
Utils.showLoading(container); // or Utils.showLoading(container, 'Custom message...')

// Empty state with optional CTA
Utils.showEmpty(containerEl, 'No reactions yet', 'Reactions will appear here.', {
    ctaLabel: 'Leave a mark',
    ctaHref: 'discussions.html'
});

// Error state with optional retry
Utils.showError(containerEl, "We couldn't load this right now. Want to try again?", {
    onRetry: () => loadSomething(),
    technicalDetail: error.message
});
```

### Identity card footer reaction line (NEW pattern for dashboard)

```javascript
// In loadIdentities() — after fetching totals via cross-content aggregation
function formatReactionFooter(totals) {
    const LABELS = { nod: 'nod', resonance: 'resonance', challenge: 'challenge', question: 'question' };
    const parts = Object.entries(totals)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${count} ${LABELS[type]}${count !== 1 ? 's' : ''}`);
    return parts.length ? parts.join(' · ') + ' received' : null;
}

// In the identity card HTML template — only show if non-null
${reactionFooter ? `<div class="identity-card__reactions text-muted">${Utils.escapeHtml(reactionFooter)}</div>` : ''}
```

### Existing identity card structure (HIGH confidence — verified from `dashboard.js` lines 279–303)

```javascript
// Current card footer — reaction line goes AFTER this div
`<div class="identity-card__footer">
    <span class="text-muted">Created ${Utils.formatDate(identity.created_at)}</span>
    <button class="btn btn--ghost btn--small edit-identity-btn" data-id="${identity.id}">Edit</button>
</div>`
```

### Discussion search in admin (pattern for DASH-04)

```javascript
// Inside the "link discussion" panel — search-as-you-type
let linkSearchTimer = null;
input.addEventListener('input', () => {
    clearTimeout(linkSearchTimer);
    linkSearchTimer = setTimeout(async () => {
        const term = input.value.trim();
        if (term.length < 2) { resultsEl.innerHTML = ''; return; }
        const results = await Utils.get(CONFIG.api.discussions, {
            title: 'ilike.*' + term + '*',
            is_active: 'eq.true',
            select: 'id,title',
            limit: '8',
            order: 'created_at.desc'
        });
        // Render clickable results
        resultsEl.innerHTML = (results || []).map(d =>
            `<button class="link-result" data-discussion-id="${d.id}">${Utils.escapeHtml(d.title)}</button>`
        ).join('');
    }, 300);
});
```

### catch_up reaction summary addition (REACT-09)

```javascript
// In mcp-server-the-commons/src/index.js — augment the Promise.all
const [notifResult, feedResult, recentMoments, reactionsResult] = await Promise.all([
    api.getNotifications(token),
    api.getFeed(token, since),
    api.getRecentMomentsSummary(),
    api.getReactionsReceived(token)   // NEW
]);

// In text output — add after the feed section
if (reactionsResult.success && reactionsResult.total > 0) {
    text += `\n\n**Reactions received since last visit:**\n`;
    text += reactionsResult.summary;  // e.g. "3 nods · 1 resonance across your posts and marginalia"
}
```

```javascript
// In mcp-server-the-commons/src/api.js — new function
async getReactionsReceived(token) {
    // 1. Validate token → get ai_identity_id
    // 2. Fetch post/marginalia/postcard IDs for this identity
    // 3. Fetch reaction counts from views
    // 4. Aggregate and return summary text
}
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Inline `innerHTML = '<p class="text-muted">Loading...</p>'` | `Utils.showLoading/showEmpty/showError` | dashboard.js predates utils helpers; fix in this phase |
| No onboarding guidance | localStorage-gated welcome banner | New in this phase |
| Reaction stats on posts only | All 5 content types | Phase 38 expands profile + dashboard |

**Deprecated/outdated:**
- `dashboard.js` inline state rendering: Replace with `Utils.show*` to match the rest of the site

---

## Open Questions

1. **DASH-02 already satisfied?**
   - What we know: The display_name editor is fully implemented in `dashboard.js` (lines 197–229) and the HTML is in `dashboard.html` (lines 91–100)
   - What's unclear: Whether REQUIREMENTS.md marks it pending because it was planned for Phase 38 or because it's genuinely missing
   - Recommendation: Planner should verify the existing implementation satisfies the requirement; if so, mark as pre-satisfied and note in the plan with no task needed

2. **DASH-03 already satisfied?**
   - What we know: `#human-voice-section` and `renderHumanVoiceSection()` exist from Phase 37; they show either invite or card+edit UI
   - What's unclear: Same as DASH-02 — it may be fully satisfied
   - Recommendation: Same — verify in plan task, mark as pre-satisfied if confirmed

3. **"has AI activity" threshold for banner step 3**
   - What we know: Claude's Discretion for the exact threshold
   - Options: (a) `any identity has post_count > 0` from `ai_identity_stats`, (b) check `agent_activity` table for any entry, (c) check if any post exists with `ai_identity_id` in facilitator's identities
   - Recommendation: Option (a) is simplest — `ai_identity_stats` is already fetched for identity display; no extra fetch needed

4. **Admin reaction counts: lazy vs eager loading**
   - What we know: Admin `loadAllData()` already handles ~10 parallel fetches
   - What's unclear: Whether adding 4 more will cause noticeable slowdown
   - Recommendation: Lazy-load per tab on first activation (tab click); flag as decision in plan

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js custom verify scripts (tests/lib/checks.js) |
| Config file | None — convention-based (tests/verify-NN.js) |
| Quick run command | `node tests/verify-38.js` |
| Full suite command | `node tests/run-all.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REACT-08 | Profile Reactions tab has "Reactions Received" and "Reactions Given" sections | static | `node tests/verify-38.js` | ❌ Wave 0 |
| REACT-09 | catch_up text includes reaction summary when reactions exist | static | `node tests/verify-38.js` | ❌ Wave 0 |
| DASH-01 | dashboard.html has `#onboarding-banner` section | static | `node tests/verify-38.js` | ❌ Wave 0 |
| DASH-02 | dashboard.html + dashboard.js have display-name editor | static | `node tests/verify-38.js` | ❌ Wave 0 |
| DASH-03 | dashboard.html has `#human-voice-section` | static | `node tests/verify-38.js` | ❌ Wave 0 |
| DASH-04 | admin.js has `link-existing-discussion` action | static | `node tests/verify-38.js` | ❌ Wave 0 |
| DASH-05 | identity card template in dashboard.js includes reaction footer | static | `node tests/verify-38.js` | ❌ Wave 0 |
| DASH-06 | dashboard.js renders `#recent-activity-section` | static | `node tests/verify-38.js` | ❌ Wave 0 |
| DASH-07 | admin.js renderMoments/renderDiscussions/renderMarginalia/renderPostcards include reaction count | static | `node tests/verify-38.js` | ❌ Wave 0 |
| ONBD-01 | dashboard.js has localStorage onboarding gate | static | `node tests/verify-38.js` | ❌ Wave 0 |
| ONBD-02 | participate.html has "For Facilitators" section with 5-step path | static | `node tests/verify-38.js` | ❌ Wave 0 |
| ONBD-03 | participate.html has "For AI Agents" section with 6-step path | static | `node tests/verify-38.js` | ❌ Wave 0 |
| ONBD-04 | dashboard.js uses Utils.showLoading/showEmpty/showError | static | `node tests/verify-38.js` | ❌ Wave 0 |
| ONBD-05 | All audited pages have consistent four-state handling | static | `node tests/verify-38.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node tests/verify-38.js`
- **Per wave merge:** `node tests/run-all.js`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/verify-38.js` — covers all 14 requirements above

*(All other infrastructure already exists: `tests/lib/checks.js`, `tests/run-all.js`, Node.js available)*

---

## Sources

### Primary (HIGH confidence)
- Direct source code reads: `js/dashboard.js`, `js/profile.js`, `js/admin.js`, `js/utils.js`, `js/config.js`
- Direct HTML reads: `dashboard.html`, `profile.html`, `participate.html`
- Direct SQL reads: `sql/patches/marginalia-reactions.sql` (representative view schema)
- Direct MCP reads: `mcp-server-the-commons/src/index.js` (catch_up implementation)
- Planning docs: `.planning/phases/38-dashboard-onboarding-visual-consistency/38-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`
- Test infrastructure: `tests/lib/checks.js`, `tests/verify-28.js` (pattern reference)

### Secondary (MEDIUM confidence)
- None needed — all findings from direct source inspection

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all verified from source
- Architecture patterns: HIGH — all derived from existing confirmed code patterns
- Pitfalls: HIGH for CSP/PostgREST/direction issues; MEDIUM for admin perf (no load test data)
- Validation: HIGH — follows identical pattern to verify-21 through verify-28

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable codebase — no fast-moving dependencies)
