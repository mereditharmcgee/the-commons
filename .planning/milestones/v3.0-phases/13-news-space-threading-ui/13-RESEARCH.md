# Phase 13: News Space + Threading UI — Research

**Researched:** 2026-02-28
**Phase:** 13-news-space-threading-ui
**Requirements:** NEWS-01, NEWS-02, NEWS-03, NEWS-04, THRD-01, THRD-02, THRD-03, THRD-04, THRD-05

---

## What the Context Decided (Key Decisions from 13-CONTEXT.md)

The user discussion resolved a set of critical design questions that differ from the original plan description. Planning must reflect these decisions:

1. **No is_news toggle** — all moments are news. The is_news column exists in the DB (added in 08-v3-column-additions.sql) but will not be used for filtering. News page queries all active moments.
2. **Retire "Moments" branding, not the data or pages** — nav link changes from "Moments" → "News", pointing to news.html. moment.html detail pages stay fully functional with existing deep links intact.
3. **is_pinned on moments table** — new DB column (BOOLEAN DEFAULT false) needed. Admin can pin 1-2 items to top of news page.
4. **Admin tab for moments/news management** — new tab in admin.html with list of all moments, pin/unpin toggle, hide/show controls. Follows existing admin tab patterns.
5. **Homepage news section** — 2-3 recent news items injected into index.html alongside the existing activity feed.
6. **News card is editorial** — not a plain list. Designed for engagement and discoverability, not just "card grid of events."
7. **Pagination** — 10-15 items per page with next/prev controls on news.html.
8. **Ordering** — pinned items at top, then newest first by event_date.
9. **Reply parent preview in discussion threads** — "replying to [Name]" with first ~100 chars of parent content. Show on all replies or depth 2+ (Claude's discretion per context).

---

## What Already Exists

### Database

**moments table** (from `sql/schema/05-moments-schema.sql`):
```sql
CREATE TABLE moments (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT NOT NULL,
    event_date DATE,
    external_links JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);
```

**Additive columns** (from `sql/schema/08-v3-column-additions.sql`):
- `moments.is_news BOOLEAN NOT NULL DEFAULT false` — exists, partial index on it, but per context decisions, ALL moments = news so this column is not used for filtering
- `posts.directed_to UUID` — unrelated to this phase
- `ai_identities.pinned_post_id UUID` — unrelated to this phase

**Missing column (needs migration):**
- `moments.is_pinned BOOLEAN DEFAULT false` — not in any existing schema file

**RLS on moments:**
- SELECT: `is_active = true` (anon and authenticated)
- INSERT/UPDATE/DELETE: via Supabase dashboard / admin API (no direct RLS policy for admin updates via JS client — admin.js uses authenticated session with admin check)

### JavaScript

**`js/moments.js`** — existing listing page logic:
- `Utils.getMoments()` — fetches `is_active=eq.true` ordered by `event_date.desc`
- Parallel discussion count fetch per moment via `Utils.getDiscussionsByMoment()`
- `renderMomentCard()` — renders `.moment-card` anchors, includes date badge, title, subtitle, preview, discussion/response counts

**`js/utils.js`** — relevant existing helpers:
- `Utils.getMoments()` — queries `CONFIG.api.moments` with `is_active=eq.true`, `order=event_date.desc`
- `Utils.getMoment(id)` — single moment fetch
- `Utils.getDiscussionsByMoment(momentId)` — discussions by moment_id
- `Utils.showLoading/showError/showEmpty` — standard state helpers
- `Utils.escapeHtml/formatContent` — XSS-safe rendering
- `Utils.get()` — raw fetch with anon key

**`js/discussion.js`** — threading system already implemented:
- `renderPost(post, depth, replyMap)` — adds `post--reply` and `post--depth-{n}` classes
- `renderReplies(postId, replyMap, depth)` — recursive with collapse at depth >= 2
- `toggleThread(collapseId)` — expand/collapse, aria-expanded, Utils.announce
- `replyTo(postId)` — navigates to `submit.html?discussion=X&reply_to=Y`
- `renderReactionBar(postId)` — includes reaction pills above `.post__footer`
- Post footer already has `.post__reply-btn` calling `replyTo()`

**Threading status after Phase 12:**
- THRD-01 (left border connectors) — CSS `.post--reply { border-left: 3px solid }` — already exists
- THRD-02 (indentation capped at depth 4) — `effectiveDepth = Math.min(depth, 4)` — already exists
- THRD-03 (Reply button) — `.post__reply-btn` calling `replyTo()` — already exists
- THRD-05 (collapsible sub-threads) — `thread-collapse` at depth >= 2, reply count shown — already exists

**What is MISSING from threading:**
- THRD-04 — reply cards showing "replying to [Name]" with first ~100 chars of parent content. Currently `renderPost()` has no parent preview logic. The parent data is in `currentPosts` array (all posts loaded at once), so lookup is available.

**`js/submit.js`** — existing reply-to handling:
- Reads `reply_to` URL param
- Loads and displays preview of the parent post (model badge + first 200 chars of content)
- Sets `parent_id` hidden input
- On submit, sends `parent_id` in post data

### CSS

**Existing threading classes** (from `css/style.css`):
```css
.post--reply {
    margin-left: var(--space-xl);
    border-left: 3px solid var(--border-medium);
}
.post--depth-3, .post--depth-4 {
    margin-left: var(--space-lg);
}
.thread-collapse { margin-left: var(--space-xl); }
.thread-collapse__toggle { ... }
.thread-collapse__content { ... }
```

**Existing moment card classes:**
```css
.moment-card { ... }
.moment-card__header, .moment-card__date, .moment-card__title
.moment-card__subtitle, .moment-card__preview, .moment-card__stats
.moment-badge, .moment-badge--active, .moment-badge--archived
```

All of these exist. news.html will use different CSS classes (`.news-card`, `.news-pinned`, etc.) for the editorial design, not reusing `.moment-card`.

### HTML Pages

**Current nav in all 26 HTML files:**
```html
<a href="moments.html">Moments</a>
```

Found in: about.html, agent-guide.html, api.html, chat.html, claim.html, constitution.html, contact.html, dashboard.html, discussion.html, discussions.html, index.html, login.html, moment.html, moments.html, participate.html, postcards.html, profile.html, propose.html, reading-room.html, reset-password.html, roadmap.html, search.html, submit.html, suggest-text.html, text.html, voices.html

That is **26 files** — plus admin.html has no nav (admin panel only). Total files with nav to update: 26.

Note: moments.html itself has `class="active"` on the Moments link. That needs to move to a new news.html `<a href="news.html" class="active">News</a>`. On moments.html and moment.html, the active indicator should point to news.html after the rebrand.

### Admin Pattern

**Existing admin tab pattern (from admin.html + admin.js):**
- Tab buttons: `<button class="admin-tab" data-tab="moments">News / Moments</button>`
- Panel div: `<div id="panel-moments" class="admin-panel">`
- JS: `let moments = []`, `loadMoments()`, `renderMoments()`
- Uses `updateRecord('moments', id, { is_pinned: true/false })` via `getClient().from('moments').update()`
- Admin tab count: `updateTabCount('moments', moments.length)`

The admin Supabase client uses authenticated session + admins table check. UPDATE on moments requires an RLS policy for admin users. Need to check if one exists.

**RLS audit for admin UPDATE on moments:**
From `sql/schema/05-moments-schema.sql`: no explicit admin UPDATE policy was defined. The comment says "Only admins can insert/update/delete moments (via Supabase dashboard or admin API)." This means admin.js UPDATE calls will fail unless an admin UPDATE RLS policy exists. Need to add one like the other admin policies (see `sql/admin/admin-rls-setup.sql`).

### CONFIG

`CONFIG.api.moments = '/rest/v1/moments'` — already registered. No `news` endpoint needed (same table).

---

## What Needs to Be Built

### Plan A: news.html + nav updates + homepage section + admin tab

#### 1. Database migration (is_pinned column)

```sql
ALTER TABLE moments ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_moments_is_pinned ON moments(is_pinned) WHERE is_pinned = true;
```

Also need admin UPDATE RLS policy if not already in place:
```sql
-- Check sql/admin/admin-rls-setup.sql for existing pattern
CREATE POLICY "Admins can update moments" ON moments
    FOR UPDATE
    USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));
```

#### 2. news.html (new file)

Clone structure from moments.html. Changes:
- Title: "News — The Commons"
- canonical: `https://jointhecommons.space/news.html`
- Active nav link: `<a href="news.html" class="active">News</a>` (not moments.html)
- Main content: `<div id="news-list">`, plus pagination controls `<div id="news-pagination">`
- Script: `js/news.js` (not moments.js)
- CSP: copy from moments.html and add new script hash(es) for any inline scripts in news.html

#### 3. js/news.js (new file)

Query pattern (all active moments, no is_news filter):
```js
// Pinned first, then event_date desc
const moments = await Utils.get(CONFIG.api.moments, {
    'is_active': 'eq.true',
    'order': 'is_pinned.desc,event_date.desc',
    'limit': PAGE_SIZE,
    'offset': page * PAGE_SIZE
});
```

Important: PostgREST ordering with multiple columns uses comma-separated `order` values. The format `order=is_pinned.desc,event_date.desc` puts pinned items first.

Card rendering: editorial "news card" design — not `.moment-card`. Should feel like a news feed: dateline, headline (serif, large), deck/standfirst (subtitle), excerpt, discussion count link. Pinned items get a visual badge/treatment.

Pagination: track current page, total count (requires separate count query or use PostgREST `Prefer: count=exact` header).

Discussion count fetch: same approach as moments.js — `Utils.getDiscussionsByMoment(moment.id)` in parallel, or optimize with a single query + group-by if possible. For planning scale (30 moments), N+1 is fine.

#### 4. Nav update across all 26 files

Replace `<a href="moments.html">Moments</a>` with `<a href="news.html">News</a>` in the nav block of:
- about.html, agent-guide.html, api.html, chat.html, claim.html, constitution.html, contact.html, dashboard.html, discussion.html, discussions.html, index.html, login.html, moment.html, moments.html, participate.html, postcards.html, profile.html, propose.html, reading-room.html, reset-password.html, roadmap.html, search.html, submit.html, suggest-text.html, text.html, voices.html

On moments.html itself: change `class="active"` from the moments link to the news link.
On moment.html: same — the active class should reflect "News" section.

Verification: after edits, grep for `moments.html` in nav to confirm all updated, then grep for `news.html` to confirm count = 26+ (nav links) + 1 (news.html itself with active class).

**CSP note:** Nav changes are pure HTML, no inline scripts — no hash regeneration needed for nav-only edits.

#### 5. Homepage news section (index.html + js/home.js)

In index.html: add a new section between "What's New" and "Latest Activity" (or after it):
```html
<section class="section">
    <h2 class="section-title">In the News</h2>
    <div id="news-feed" class="news-feed"><!-- loaded dynamically --></div>
    <div class="mt-lg text-center">
        <a href="news.html" class="btn btn--secondary">All News &rarr;</a>
    </div>
</section>
```

In js/home.js: add `loadRecentNews()` function that fetches 2-3 most recent moments (pinned first) and renders compact news cards. Fire alongside other home page loads.

**CSP note:** If js/home.js is modified (JS file, not inline), no hash changes needed. The inline script in index.html only calls `Auth.init()` so no hash change required unless a new inline script is added.

#### 6. Admin tab for moments/news management

In admin.html: add new tab button:
```html
<button class="admin-tab" data-tab="moments">
    News <span class="admin-tab__count" id="tab-count-moments">0</span>
</button>
```

Add panel:
```html
<div id="panel-moments" class="admin-panel">
    <button class="admin-refresh" onclick="loadMoments()">Refresh</button>
    <div id="moments-list"></div>
</div>
```

In admin.js: add to `loadAllData()` → `loadMoments()`. Render function shows:
- Title, subtitle, event_date
- Status badges: Active/Hidden, Pinned/Unpinned
- Buttons: Pin/Unpin (`updateRecord('moments', id, { is_pinned: !moment.is_pinned })`), Hide/Show (`updateRecord('moments', id, { is_active: !moment.is_active })`)
- Link to moment.html?id=... detail page

**Important:** Admin UPDATE on moments requires the RLS policy. Must add migration for it.

### Plan B: THRD-04 — Reply parent preview in discussion.js

This is the only remaining threading requirement not yet implemented. All others (THRD-01, 02, 03, 05) are already in the codebase.

**Current state:** `renderPost(post, depth, replyMap)` has access to `replyMap` (the map of all posts by parent_id), but does not have access to the parent post's content/name — only its ID is available via `post.parent_id`.

**Data available:** `currentPosts` array contains ALL posts for the discussion including all parents. To look up a parent post's name and content, look it up by `post.parent_id` in `currentPosts`.

**Implementation in `renderPost()`:**
```js
// Inside renderPost(), after checking isReply
let parentPreviewHtml = '';
if (isReply && post.parent_id) {
    const parentPost = currentPosts.find(p => p.id === post.parent_id);
    if (parentPost) {
        const parentName = parentPost.ai_name || parentPost.model || 'unknown';
        const parentSnippet = parentPost.content.substring(0, 100) + (parentPost.content.length > 100 ? '...' : '');
        parentPreviewHtml = `
            <div class="post__parent-preview">
                <span class="post__parent-label">replying to ${Utils.escapeHtml(parentName)}</span>
                <span class="post__parent-snippet">${Utils.escapeHtml(parentSnippet)}</span>
            </div>
        `;
    }
}
```

Insert `${parentPreviewHtml}` inside the post article, between the header and content, or between content and footer.

**CSS needed** (new classes in css/style.css):
```css
.post__parent-preview {
    margin-bottom: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    background: var(--bg-deep);
    border-left: 2px solid var(--border-medium);
    border-radius: 0 4px 4px 0;
    font-size: 0.8125rem;
}
.post__parent-label {
    color: var(--accent-gold);
    font-weight: 500;
    display: block;
    margin-bottom: 2px;
}
.post__parent-snippet {
    color: var(--text-muted);
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

**Visibility decision (Claude's discretion per context):** Show on all replies (depth > 0), not just depth 2+. At depth 1, the parent is visible above, but the preview adds useful attribution context. Alternatively, show only when the parent is collapsed (in a thread-collapse). A safe default: show for all replies, since the UI context of deeply nested threads makes attribution valuable at all depths.

---

## CSP / SRI Implications

The CSP hashes in every HTML file cover inline `<script>` blocks. Specifically, hashes cover the `Auth.init()` call in the inline script. If a new inline script is added to news.html, its hash must be computed and added to the CSP meta tag.

news.html will have the same inline script as moments.html:
```html
<script>
    document.addEventListener('DOMContentLoaded', () => {
        Auth.init();
    });
</script>
```

This inline script hash is already in the CSP of moments.html: `'sha256-AmGvtDAkv/U6sY31qctvMI13eS/PK4mLWMxS0mpjCyU='` (visible in moments.html CSP). Copy that hash into news.html's CSP.

Nav edits to existing HTML files do not change any inline scripts, so no hash regeneration is needed for nav-only changes.

index.html: the home.js modification is in the external JS file, not inline — no hash needed.

admin.html: no inline scripts, admin.js is external — no hash needed.

---

## Scope Clarifications for Planning

### What changed from the original plan description

The original plan sketches (from the phase description in additional_context) were:
- "13-01: Create news.html + js/news.js (mirroring moments pattern with is_news filter), add NEWS nav link"
- "13-02: Admin dashboard toggle for is_news flag (NEWS-01), threading CSS depth classes"

The CONTEXT decisions changed these significantly:
- No is_news filter — all moments are news
- Admin tab is for is_pinned + hide/show, not is_news toggle
- threading CSS depth classes already exist — THRD-04 parent preview is the only remaining threading work
- Homepage section needed (not in original plan sketch)
- Editorial card design, not mirroring moments pattern

### Requirements mapping check

- **NEWS-01**: "Admin can flag a moment as news" — now interpreted as admin can manage news (pin/unpin, hide/show). The is_pinned flag is the admin control. Satisfied by admin tab.
- **NEWS-02**: "news.html displays news-flagged moments in reverse chronological order" — news.html displays ALL active moments, pinned first then event_date desc. Satisfied by news.html.
- **NEWS-03**: "News cards show title, description, event date, and linked discussion count" — news card render must include these fields.
- **NEWS-04**: "Navigation link to News appears on all HTML pages" — nav update across all 26 files.
- **THRD-01** through **THRD-03**, **THRD-05**: Already implemented in discussion.js / css/style.css.
- **THRD-04**: Reply parent preview — needs implementation in renderPost() + new CSS.

### Plan split recommendation

The work naturally splits into two plans as the original sketch suggested:

**Plan 13-01** (News page + homepage + nav):
- DB migration: add is_pinned to moments, add admin UPDATE RLS policy
- Create news.html
- Create js/news.js (paginated, pinned-first, editorial cards)
- Add homepage news section to index.html + js/home.js
- Update nav in all 26 HTML files (Moments → News)

**Plan 13-02** (Admin tab + threading parent preview):
- Add Moments/News tab to admin.html
- Add loadMoments/renderMoments to admin.js with pin/unpin and hide/show
- Add THRD-04 parent preview to discussion.js renderPost()
- Add parent preview CSS to css/style.css

---

## Gotchas and Watch-Outs

1. **Admin RLS for moments UPDATE:** The current moments RLS has no admin UPDATE policy. The admin.js updateRecord() call will silently fail (Supabase returns no error but makes no change) without it. Must add migration before testing admin tab.

2. **PostgREST multi-column ordering:** `Utils.get()` appends params as individual URLSearchParams. Multiple `order` values need to be comma-joined in a single param: `'order': 'is_pinned.desc,event_date.desc'`. Test this — PostgREST supports it but the Utils.get() method uses `url.searchParams.append()` so the single string value will work correctly.

3. **moments.html stays live:** Deep links to `moments.html` and `moment.html?id=X` must not break. moments.html stays, just drops out of nav. Consider adding a banner on moments.html pointing to news.html ("This page has moved. Visit News →") or simply leave it as-is since the data is unchanged.

4. **Nav active class on moment.html and moments.html:** After the nav update, both pages will have `<a href="news.html">News</a>` in nav. The `class="active"` on moments.html currently says `<a href="moments.html" class="active">Moments</a>`. This should change to `<a href="news.html" class="active">News</a>` since the moments section is now called News.

5. **is_pinned RLS:** The new is_pinned column on moments needs admin UPDATE permission. The existing SELECT policy `is_active = true` doesn't expose is_pinned to anon, but news.js will query it. Confirm the SELECT policy allows anon to read is_pinned (it reads `*` from the table, so any column added to the table is readable by anon under the existing SELECT policy).

6. **Pagination total count:** PostgREST supports `Prefer: count=exact` header to return total count in the `Content-Range` response header. The `Utils.get()` method does not pass this header. For news.js pagination, options are:
   - Fetch all moments once and paginate client-side (simpler, works for ~30 moments)
   - Add header support to a custom fetch in news.js
   - For 30 moments, client-side pagination is fine and simpler

7. **Reply parent lookup edge case:** If a parent post is hidden (`is_active = false`), `Utils.getPosts()` filters it out (uses `or=(is_active.eq.true,is_active.is.null)`). The reply card will have `post.parent_id` set but `currentPosts.find()` will return undefined. Guard with: `if (parentPost) { ... }` before rendering preview.

8. **CSP for news.html:** Copy the entire CSP meta tag from moments.html. The inline script (`Auth.init()` in DOMContentLoaded) uses the same hash. No new hashes needed unless an additional inline script is added.

9. **Homepage section and CSP for index.html:** The home.js change is in an external file. index.html's inline script is only `Auth.init()` — no change, no hash regeneration needed.

---

## File-by-File Change Inventory

| File | Action | Notes |
|------|--------|-------|
| `sql/` (new migration) | Add `is_pinned` column + admin UPDATE policy | Run via Supabase SQL editor |
| `news.html` | Create new | Clone moments.html, update title/canonical/script |
| `js/news.js` | Create new | Paginated, pinned-first, editorial card render |
| `js/home.js` | Modify | Add `loadRecentNews()`, call in DOMContentLoaded |
| `index.html` | Modify | Add `<section>` for news feed, add `id="news-feed"` div |
| `admin.html` | Modify | Add "News" tab button + panel div |
| `js/admin.js` | Modify | Add `let moments`, `loadMoments()`, `renderMoments()`, update `loadAllData()` |
| `js/discussion.js` | Modify | Add parent preview logic in `renderPost()` |
| `css/style.css` | Modify | Add `.post__parent-preview`, `.post__parent-label`, `.post__parent-snippet` |
| 26 HTML files (nav) | Modify | Replace `moments.html` → `news.html`, text "Moments" → "News" |

Total: 2 new files, ~30 modified files.

---

## Ordering Within Plans

**Plan 13-01 execution order:**
1. DB migration (is_pinned + admin RLS) — Supabase first, then code
2. Create js/news.js
3. Create news.html (references news.js)
4. Update js/home.js + index.html
5. Nav update across all 26 HTML files
6. Verify: grep for `moments.html` in nav (should be zero), grep for `news.html` (should be 26+)

**Plan 13-02 execution order:**
1. Add THRD-04 CSS to css/style.css
2. Update js/discussion.js renderPost() with parent preview
3. Add admin HTML panel to admin.html
4. Update js/admin.js with moments management
5. Verify: test discussion page reply preview, test admin pin/unpin

---

*Research complete: 2026-02-28*
