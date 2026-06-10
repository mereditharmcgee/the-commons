# Audit Follow-ups Implementation Plan (discussion_stats view + postcards pagination)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill the last pagination-loop on the public discussions page and the wrong interest-page counts with one `discussion_stats` view, and convert the postcards wall (790 of the 1,000-row cap) to server-side pagination before it silently truncates.

**Architecture:** Part A: a `security_invoker` GROUP BY view over posts replaces whole-table client fetches in discussions.js and interest.js; `Utils.getAllPosts()` is then deleted. Part B: a new `Utils.getCount()` HEAD helper + per-page fetches in postcards.js (PAGE_SIZE 20 unchanged); admin `loadPostcards` gets the `fac1167` count-and-cap pattern.

**Tech Stack:** Vanilla JS (IIFE), PostgREST via raw `Utils.get`/`fetch` and supabase-js (admin), one Postgres view migration. **No test framework exists by design** — steps verify via SQL reference counts, anon REST probes, and browser drives (the established pattern from the posts-console build).

**Spec:** [docs/superpowers/specs/2026-06-10-audit-followups-design.md](../specs/2026-06-10-audit-followups-design.md)
**Spec addendum (found during planning):** postcards.js's Copy Context button uses `postcards.slice(0, 15)` and `postcards.length`; under server paging it must fetch its own recent-15 and use `totalCount` for the total (Task 7 Step 4).

**Two hard gates, both Meredith's:** the migration apply (end of Task 1) and the final push (Task 9). Tasks 6–8 don't depend on the migration and can run while waiting at the apply gate.

Line numbers reference commit `8ae3bed`; every edit quotes unique anchor text.

---

### Task 1: Migration artifact → APPLY GATE

**Files:**
- Create: `sql/patches/discussion-stats-view.sql`

- [ ] **Step 1: Write the patch file (audit copy)**

```sql
-- discussion_stats: per-discussion visible-post counts as a view
--
-- What: GROUP BY view over posts (post_count, last_post_at per discussion),
--       security_invoker = true, SELECT granted to anon/authenticated.
-- Why: discussions.html paginated the ENTIRE posts table client-side on
--      every load (Utils.getAllPosts loop — the hang-class pattern, audit
--      finding A1) and interest.html derived counts from an arbitrary
--      1,000-row sample including soft-deleted posts (finding B1). One
--      ~300-row view replaces both. See
--      .planning/unbounded-reads-audit-2026-06-09.md and
--      docs/superpowers/specs/2026-06-10-audit-followups-design.md.
-- Risk: low — additive object only, no table or policy changes.
--       security_invoker applies the querier's posts RLS underneath; the
--       explicit visibility filter (is_active IS DISTINCT FROM false) pins
--       identical counts for every role. Uses existing
--       idx_posts_discussion. Rollback: DROP VIEW public.discussion_stats.
-- Applied: 2026-06-10 via mcp apply_migration (discussion_stats_view).

CREATE VIEW public.discussion_stats
WITH (security_invoker = true) AS
SELECT
    p.discussion_id,
    count(*)          AS post_count,
    max(p.created_at) AS last_post_at
FROM public.posts p
WHERE p.is_active IS DISTINCT FROM false
  AND p.discussion_id IS NOT NULL
GROUP BY p.discussion_id;

GRANT SELECT ON public.discussion_stats TO anon, authenticated;
```

- [ ] **Step 2: Capture the before-baseline (for Task 3/4 verification)**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT discussion_id::text, count(*) AS post_count
FROM posts
WHERE is_active IS DISTINCT FROM false AND discussion_id IS NOT NULL
GROUP BY discussion_id
ORDER BY post_count DESC
LIMIT 3;
```

Record the three (id, count) pairs — these are the expected view rows AND the expected discussions.html card counts.

- [ ] **Step 3: Commit the patch file**

```powershell
git add sql/patches/discussion-stats-view.sql
git commit -m "sql: discussion_stats view patch (audit copy; apply pending)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: ⛔ GATE — present the SQL to Meredith and STOP**

Show the SQL and the diagnostic plan; wait for an explicit "apply". Do not call `apply_migration` before that word. (Tasks 6–8 may proceed meanwhile.)

---

### Task 2: Apply + verify the view (after "apply")

**Files:** none (database)

- [ ] **Step 1: Apply**

`mcp__supabase__apply_migration` with name `discussion_stats_view` and the exact SQL body from Task 1 Step 1 (comment header included is fine).

- [ ] **Step 2: SQL equivalence check**

```sql
SELECT v.discussion_id::text, v.post_count, d.cnt AS direct_count
FROM discussion_stats v
JOIN (SELECT discussion_id, count(*) AS cnt FROM posts
      WHERE is_active IS DISTINCT FROM false AND discussion_id IS NOT NULL
      GROUP BY discussion_id) d USING (discussion_id)
WHERE v.post_count <> d.cnt
LIMIT 5;
```

Expected: **zero rows** (no mismatches). Then `SELECT count(*) FROM discussion_stats;` — expected ≈ number of discussions with posts (≈300, well under the 1k response cap).

- [ ] **Step 3: Anon REST probe (proves the grant + RLS path)**

```powershell
$key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZXBoc2ZiZXJ6YWRpaGNyaGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzAwNzIsImV4cCI6MjA4NDE0NjA3Mn0.Sn4zgpyb6jcb_VXYFeEvZ7Cg7jD0xZJgjzH0XvjM7EY'
Invoke-RestMethod -Uri 'https://dfephsfberzadihcrhal.supabase.co/rest/v1/discussion_stats?order=post_count.desc&limit=3' -Headers @{ apikey = $key; Authorization = "Bearer $key" } | ConvertTo-Json
```

Expected: the three Task 1 Step 2 baseline pairs, exactly.

---

### Task 3: config.js + discussions.js switch

**Files:**
- Modify: `js/config.js:15` (api map)
- Modify: `js/discussions.js:18-41`

- [ ] **Step 1: Add the endpoint**

In `js/config.js`, after the line `discussions: '/rest/v1/discussions',` add:

```js
        discussion_stats: '/rest/v1/discussion_stats',
```

- [ ] **Step 2: Swap the fetch in discussions.js**

Replace:

```js
        const [discussions, allPosts, allDiscReactions] = await Promise.all([
            Utils.getDiscussions(),
            Utils.getAllPosts(),
            Utils.get(CONFIG.api.discussion_reaction_counts).catch(() => [])
        ]);
```

with (failure stays fatal-to-page, same as today — no `.catch` on the stats fetch):

```js
        const [discussions, discussionStats, allDiscReactions] = await Promise.all([
            Utils.getDiscussions(),
            Utils.get(CONFIG.api.discussion_stats),
            Utils.get(CONFIG.api.discussion_reaction_counts).catch(() => [])
        ]);
```

- [ ] **Step 3: Replace the counting loop**

Replace:

```js
        // Count posts per discussion
        const postCounts = {};
        if (allPosts) {
            allPosts.forEach(post => {
                postCounts[post.discussion_id] = (postCounts[post.discussion_id] || 0) + 1;
            });
        }
```

with:

```js
        // Post counts per discussion (from the discussion_stats view)
        const postCounts = {};
        if (discussionStats) {
            discussionStats.forEach(row => {
                postCounts[row.discussion_id] = Number(row.post_count) || 0;
            });
        }
```

- [ ] **Step 4: Verify**

`node --check js/discussions.js` → OK. Start the preview (`preview_start` name `site`), open `/discussions.html`, then:
- Cards for the three baseline discussion ids show exactly the baseline counts ("N responses").
- `preview_network`: exactly **one** request to `/rest/v1/discussion_stats` and **zero** requests to `/rest/v1/posts` from this page load (the old behavior was 5 sequential posts pages).
- Console: zero errors.

- [ ] **Step 5: Commit**

```powershell
git add js/config.js js/discussions.js
git commit -m "discussions: one discussion_stats request replaces paging the whole posts table" -m "Audit finding A1. Counts unchanged (same visible-posts definition). Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: interest.js switch

**Files:**
- Modify: `js/interest.js:111-131` (Promise.all), `:152`, `:216-221`

- [ ] **Step 1: Swap the fetch + rename the binding**

Replace (line 111):

```js
        let [membersData, identitiesData, discussionsData, nullDiscussionsData, allPosts] = await Promise.all([
```

with:

```js
        let [membersData, identitiesData, discussionsData, nullDiscussionsData, discussionStats] = await Promise.all([
```

and replace (line 130):

```js
            Utils.get(CONFIG.api.posts, { select: 'id,discussion_id' })
```

with:

```js
            Utils.get(CONFIG.api.discussion_stats, { select: 'discussion_id,post_count' })
```

- [ ] **Step 2: Rename the normalized array**

Replace (line 152):

```js
        const allPosts_ = Array.isArray(allPosts) ? allPosts : [];
```

with:

```js
        const statsRows = Array.isArray(discussionStats) ? discussionStats : [];
```

- [ ] **Step 3: Replace the counting loop (line ~216)**

Replace:

```js
        var postCounts = {};
        allPosts_.forEach(function(p) {
            if (p.discussion_id) {
                postCounts[p.discussion_id] = (postCounts[p.discussion_id] || 0) + 1;
            }
        });
```

with:

```js
        var postCounts = {};
        statsRows.forEach(function(r) {
            if (r.discussion_id) {
                postCounts[r.discussion_id] = Number(r.post_count) || 0;
            }
        });
```

Then `Select-String -Path js/interest.js -Pattern 'allPosts'` → expected **no matches** (both references renamed; nothing else uses it).

- [ ] **Step 4: Verify (this page's counts CHANGE — to correct)**

Pick a live interest with discussions (e.g. from `/interests.html`). Before-evidence: with the **live site** (still old code), note one discussion's response count on the interest page, and compare to SQL truth:

```sql
SELECT count(*) FROM posts WHERE discussion_id = '<that id>' AND is_active IS DISTINCT FROM false;
```

Record the mismatch (that's finding B1 in the wild). Then on the **preview** (new code): the same card shows the SQL-true count; 'Popular' sort ordering follows the corrected counts; `node --check js/interest.js` OK; console clean; network shows `/rest/v1/discussion_stats?select=discussion_id,post_count` and no bare all-posts fetch.

- [ ] **Step 5: Commit**

```powershell
git add js/interest.js
git commit -m "interest: per-discussion counts from discussion_stats (correct, was arbitrary-1k sample)" -m "Audit finding B1. Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Delete Utils.getAllPosts

**Files:**
- Modify: `js/utils.js:225-253`

- [ ] **Step 1: Confirm zero callers**

`Select-String -Path js/*.js -Pattern 'getAllPosts'` → expected: only the definition in utils.js.

- [ ] **Step 2: Delete the function**

Remove this entire block (including its doc comment; leave `getRecentPosts` untouched):

```js
    /**
     * Fetch all posts (for counting and activity tracking).
     * Paginates through results to avoid Supabase's default 1000-row limit.
     */
    async getAllPosts() {
        const pageSize = 1000;
        let allResults = [];
        let offset = 0;

        while (true) {
            const page = await this.get(CONFIG.api.posts, {
                'select': 'id,discussion_id,created_at',
                'or': '(is_active.eq.true,is_active.is.null)',
                'order': 'created_at.asc',
                'limit': pageSize,
                'offset': offset
            });

            if (!page || page.length === 0) break;

            allResults = allResults.concat(page);

            if (page.length < pageSize) break;

            offset += pageSize;
        }

        return allResults;
    },
```

- [ ] **Step 3: Verify and commit**

`node --check js/utils.js` → OK; `Select-String -Path js/*.js -Pattern 'getAllPosts'` → zero matches; reload `/discussions.html` in preview once more (it shares utils.js) → renders, console clean.

```powershell
git add js/utils.js
git commit -m "utils: delete getAllPosts — last pagination-loop footgun, zero callers" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Utils.getCount (Part B starts here; gate-independent)

**Files:**
- Modify: `js/utils.js` (insert after the `post()` method, before `getReactions`)

- [ ] **Step 1: Add the helper**

Insert after the closing `},` of `async post(endpoint, data) {...}`:

```js
    /**
     * Count rows matching a query without fetching them.
     * HEAD request with Prefer: count=exact; reads the Content-Range header.
     * @param {string} endpoint - REST endpoint path (e.g. CONFIG.api.postcards)
     * @param {Object} [params] - PostgREST filter params (same shape as get())
     * @returns {Promise<number|null>} exact count, or null if unavailable
     */
    async getCount(endpoint, params = {}) {
        const url = new URL(CONFIG.supabase.url + endpoint);
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });

        const response = await fetch(url, {
            method: 'HEAD',
            headers: {
                'apikey': CONFIG.supabase.key,
                'Authorization': `Bearer ${CONFIG.supabase.key}`,
                'Prefer': 'count=exact'
            }
        });

        if (!response.ok) return null;
        const range = response.headers.get('content-range');
        if (!range || range.indexOf('/') === -1) return null;
        const total = parseInt(range.split('/')[1], 10);
        return Number.isFinite(total) ? total : null;
    },
```

- [ ] **Step 2: Verify the server side of the contract**

```powershell
$key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZXBoc2ZiZXJ6YWRpaGNyaGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzAwNzIsImV4cCI6MjA4NDE0NjA3Mn0.Sn4zgpyb6jcb_VXYFeEvZ7Cg7jD0xZJgjzH0XvjM7EY'  # public anon key, same as js/config.js
$r = Invoke-WebRequest -Method Head -Uri 'https://dfephsfberzadihcrhal.supabase.co/rest/v1/postcards?is_active=eq.true' -Headers @{ apikey = $key; Authorization = "Bearer $key"; Prefer = 'count=exact' } -UseBasicParsing
"content-range: $($r.Headers['Content-Range'])"
```

Expected: `content-range: */790`-shaped (total ≥ 790 and growing). The JS parsing path is exercised in Task 7's browser drive.

- [ ] **Step 3: Commit**

```powershell
git add js/utils.js
git commit -m "utils: getCount — exact row count via HEAD + Content-Range" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: postcards.js server-side pagination

**Files:**
- Modify: `js/postcards.js:29-31` (state), `:114-137` (loadPostcards/getFiltered), `:140-153` (renderPostcards head), `:205-213` (controls), `:398-414` (prev/next), `:417-440` (copy context), `:529-535` (filter buttons)

- [ ] **Step 1: State**

Replace:

```js
    // Pagination state
    const PAGE_SIZE = 20;
    let currentPage = 1;
```

with:

```js
    // Pagination state (server-driven; `postcards` holds only the current page)
    const PAGE_SIZE = 20;
    let currentPage = 1;
    let totalCount = null; // exact total for currentFilter; null = unknown
```

- [ ] **Step 2: Replace loadPostcards + getFiltered with the paged fetchers**

Replace this entire block:

```js
    // Load postcards
    async function loadPostcards() {
        Utils.showLoading(postcardsContainer);

        try {
            postcards = await Utils.get(CONFIG.api.postcards, {
                'is_active': 'eq.true',
                'order': 'created_at.desc'
            });

            currentPage = 1;
            await renderPostcards();
        } catch (error) {
            console.error('Failed to load postcards:', error);
            Utils.showError(postcardsContainer, 'Unable to load postcards. Please try again later.');
        }
    }

    // Get filtered postcards
    function getFiltered() {
        return currentFilter === 'all'
            ? postcards
            : postcards.filter(p => p.format === currentFilter);
    }
```

with:

```js
    function postcardFilterParams() {
        const params = { 'is_active': 'eq.true' };
        if (currentFilter !== 'all') {
            params['format'] = 'eq.' + currentFilter;
        }
        return params;
    }

    // Fetch the current page (no recount) and render
    async function fetchPage() {
        Utils.showLoading(postcardsContainer);
        try {
            const params = postcardFilterParams();
            params['order'] = 'created_at.desc';
            params['limit'] = String(PAGE_SIZE);
            params['offset'] = String((currentPage - 1) * PAGE_SIZE);
            postcards = await Utils.get(CONFIG.api.postcards, params);
            await renderPostcards();
        } catch (error) {
            console.error('Failed to load postcards:', error);
            Utils.showError(postcardsContainer, 'Unable to load postcards. Please try again later.');
        }
    }

    // Recount for the current filter, clamp the page, then fetch it.
    // Used at init, on filter change, and after any mutation
    // (submit / edit / delete) — those paths already call loadPostcards().
    async function loadPostcards() {
        Utils.showLoading(postcardsContainer);
        try {
            totalCount = await Utils.getCount(CONFIG.api.postcards, postcardFilterParams());
        } catch (error) {
            console.warn('Postcard count failed; pagination degrades:', error);
            totalCount = null;
        }
        if (totalCount !== null) {
            const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
            if (currentPage > totalPages) currentPage = totalPages;
        }
        await fetchPage();
    }
```

- [ ] **Step 3: renderPostcards — render the page array, control logic from totalCount**

Replace:

```js
    // Render postcards with pagination (async to support reaction fetching)
    async function renderPostcards() {
        const filtered = getFiltered();

        if (!filtered || filtered.length === 0) {
            Utils.showEmpty(postcardsContainer, 'No postcards yet', 'Be the first to leave a mark.');
            paginationContainer.style.display = 'none';
            return;
        }

        const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
        if (currentPage > totalPages) currentPage = totalPages;

        const start = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filtered.slice(start, start + PAGE_SIZE);
```

with:

```js
    // Render the current page (async to support reaction fetching)
    async function renderPostcards() {
        if (!postcards || postcards.length === 0) {
            Utils.showEmpty(postcardsContainer, 'No postcards yet', 'Be the first to leave a mark.');
            paginationContainer.style.display = 'none';
            return;
        }

        const pageItems = postcards;
```

and replace the controls block:

```js
        // Update pagination controls
        if (totalPages > 1) {
            paginationContainer.style.display = 'flex';
            pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
            prevBtn.disabled = currentPage <= 1;
            nextBtn.disabled = currentPage >= totalPages;
        } else {
            paginationContainer.style.display = 'none';
        }
    }
```

with:

```js
        // Update pagination controls (totalCount may be null = degraded mode)
        const totalPages = totalCount !== null ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : null;
        const showPagination = totalPages !== null
            ? totalPages > 1
            : (currentPage > 1 || postcards.length === PAGE_SIZE);
        if (showPagination) {
            paginationContainer.style.display = 'flex';
            pageInfo.textContent = totalPages !== null ? `Page ${currentPage} of ${totalPages}` : `Page ${currentPage}`;
            prevBtn.disabled = currentPage <= 1;
            nextBtn.disabled = totalPages !== null ? currentPage >= totalPages : postcards.length < PAGE_SIZE;
        } else {
            paginationContainer.style.display = 'none';
        }
    }
```

- [ ] **Step 4: prev/next + Copy Context + filter buttons**

Replace:

```js
    // Pagination handlers
    prevBtn.addEventListener('click', async () => {
        if (currentPage > 1) {
            currentPage--;
            await renderPostcards();
            postcardsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    nextBtn.addEventListener('click', async () => {
        const totalPages = Math.ceil(getFiltered().length / PAGE_SIZE);
        if (currentPage < totalPages) {
            currentPage++;
            await renderPostcards();
            postcardsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
```

with:

```js
    // Pagination handlers (fetch the new page from the server)
    prevBtn.addEventListener('click', async () => {
        if (currentPage > 1) {
            currentPage--;
            await fetchPage();
            postcardsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    nextBtn.addEventListener('click', async () => {
        const totalPages = totalCount !== null ? Math.ceil(totalCount / PAGE_SIZE) : null;
        if (totalPages === null || currentPage < totalPages) {
            currentPage++;
            await fetchPage();
            postcardsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
```

In the Copy Context handler, replace:

```js
            const recent = postcards.slice(0, 15);
```

with (the in-memory array is now just one page, possibly page 7):

```js
            const recent = await Utils.get(CONFIG.api.postcards, {
                'is_active': 'eq.true',
                'order': 'created_at.desc',
                'limit': '15'
            });
```

and replace:

```js
            lines.push(`## Recent Postcards (${recent.length} of ${postcards.length})`);
```

with:

```js
            lines.push(`## Recent Postcards (${recent.length} of ${totalCount !== null ? totalCount : recent.length})`);
```

In the filter-button handler, replace:

```js
            currentFilter = btn.dataset.format;
            currentPage = 1;
            await renderPostcards();
```

with (filter change = recount + refetch):

```js
            currentFilter = btn.dataset.format;
            currentPage = 1;
            await loadPostcards();
```

(The init call at the bottom — `loadPostcards();` — and the post-submission call need no change: `loadPostcards` now recounts + fetches page. The reaction-fallback `renderPostcards()` call re-renders the current page array, also fine.)

- [ ] **Step 5: Verify in the browser (preview, anon)**

`node --check js/postcards.js` → OK. On `/postcards.html` with an in-page async harness (same technique as the posts-console QA):
- Initial load: 20 cards; "Page 1 of N" where N = `ceil(total/20)`; compare against `SELECT count(*) FROM postcards WHERE is_active = true;` (≈790 → 40 pages, last page ≈10 cards).
- Next → page 2 (20 different cards, network shows `offset=20`); jump to last page → remainder count; Prev/Next disabled states correct at both bounds.
- Each format filter: "of Y" matches `SELECT count(*) FROM postcards WHERE is_active = true AND format = '<f>';`; filter switch lands on page 1.
- Copy Context: clipboard text contains 15 entries and `of <true total>`.
- Reactions render on every page; console zero errors; no failed requests.

- [ ] **Step 6: Commit**

```powershell
git add js/postcards.js
git commit -m "postcards: server-side pagination — wall no longer fetches every card" -m "790 of the 1,000-row cap with ~310/month growth; truncation was ~3 weeks out (audit C1). Copy Context now fetches its own recent-15. Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Admin loadPostcards count-and-cap

**Files:**
- Modify: `js/admin.js:208` (constants), `:453-473` (loadPostcards), `:914-924` (updateStats)

- [ ] **Step 1: Constant**

After `const POSTS_DISPLAY_LIMIT = 200;` (and its comment block) add:

```js
    const POSTCARDS_DISPLAY_LIMIT = 200;
```

- [ ] **Step 2: Replace loadPostcards**

Replace:

```js
    async function loadPostcards() {
        const container = document.getElementById('postcards-list');
        container.innerHTML = '<div class="loading"><div class="loading__spinner"></div>Loading postcards...</div>';

        const { data, error } = await getClient()
            .from('postcards')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading postcards:', error);
            postcards = [];
            setStatError('stat-postcards', error.message);
        } else {
            postcards = data || [];
            setStatValue('stat-postcards', postcards.length);
        }

        updateTabCount('postcards', postcards.length);
        renderPostcards();
    }
```

with:

```js
    async function loadPostcards() {
        const container = document.getElementById('postcards-list');
        container.innerHTML = '<div class="loading"><div class="loading__spinner"></div>Loading postcards...</div>';

        // Stat card + tab count → real total via COUNT(*) (head-only)
        try {
            const { count, error } = await getClient()
                .from('postcards')
                .select('id', { count: 'exact', head: true });
            if (error) throw error;
            setStatValue('stat-postcards', count);
            updateTabCount('postcards', count);
        } catch (e) {
            console.error('Error counting postcards:', e);
            setStatError('stat-postcards', e.message);
            updateTabCount('postcards', '!');
        }

        // Recent postcards for the moderation list (capped, fac1167 pattern)
        const { data, error } = await getClient()
            .from('postcards')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(POSTCARDS_DISPLAY_LIMIT);

        if (error) {
            console.error('Error loading postcards:', error);
            postcards = [];
        } else {
            postcards = data || [];
        }
        renderPostcards();
    }
```

- [ ] **Step 3: Exempt stat-postcards from updateStats**

Replace:

```js
    // Refreshes stats from in-memory arrays. NOTE: stat-posts and stat-claimed
    // are driven by separate COUNT queries in loadPosts (the posts table is now
    // too large to hold fully client-side). Those two cards are intentionally
    // not refreshed here — they reflect totals as of the last loadPosts call.
    // Mutations (hide/restore) don't change the totals, so this is fine; the
    // counts re-fetch on next dashboard load.
    function updateStats() {
        setStatValue('stat-marginalia', marginalia.length);
        setStatValue('stat-discussions', discussions.length);
        // Show pending message count instead of total
        const pendingContacts = contacts.filter(c => !c.is_addressed).length;
        setStatValue('stat-contacts', pendingContacts);
        setStatValue('stat-text-submissions', textSubmissions.filter(t => t.status === 'pending').length);
        setStatValue('stat-accounts', facilitators.length);
        setStatValue('stat-identities', aiIdentities.length);
        setStatValue('stat-postcards', postcards.length);
    }
```

with:

```js
    // Refreshes stats from in-memory arrays. NOTE: stat-posts, stat-claimed,
    // and stat-postcards are driven by separate COUNT queries in their load
    // functions (those tables are no longer held fully client-side). They are
    // intentionally not refreshed here — they reflect totals as of the last
    // load call. Mutations (hide/restore) don't change the totals, so this is
    // fine; the counts re-fetch on next dashboard load.
    function updateStats() {
        setStatValue('stat-marginalia', marginalia.length);
        setStatValue('stat-discussions', discussions.length);
        // Show pending message count instead of total
        const pendingContacts = contacts.filter(c => !c.is_addressed).length;
        setStatValue('stat-contacts', pendingContacts);
        setStatValue('stat-text-submissions', textSubmissions.filter(t => t.status === 'pending').length);
        setStatValue('stat-accounts', facilitators.length);
        setStatValue('stat-identities', aiIdentities.length);
    }
```

- [ ] **Step 4: Verify and commit**

`node --check js/admin.js` → OK. `hidePostcard`/`restorePostcard` already re-run `loadPostcards()` (which recounts) — confirm with `Select-String -Path js/admin.js -Pattern 'loadPostcards\(\)'`. Anon browser check (forced-DOM, same harness as the console QA): postcards tab renders ≤200 rows, console clean. The stat card's true total is admin-RLS territory — flag for Meredith's one-glance spot check.

```powershell
git add js/admin.js
git commit -m "admin: postcards tab count-and-cap (fac1167 pattern; audit C2)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Changelog + final QA → PUSH GATE

**Files:**
- Modify: `changes.html` (top of Recent entries)

- [ ] **Step 1: Changelog entry** (insert above the "Search now survives punctuation" entry, matching its markup)

```html
                <div class="change-entry">
                    <h3>Interest-page response counts are now accurate</h3>
                    <p class="change-date">2026-06-10 &mdash; counts fix + postcards pagination</p>
                    <p>The response counts on interest pages were being computed from a partial sample of posts &mdash; busy discussions could show fewer responses than they actually had, and removed posts were sometimes counted. They now come from an exact tally, and the discussions list computes the same numbers far more efficiently.</p>
                    <p>The postcard wall also pages from the server now. You won't see a difference today &mdash; the point is that the oldest postcards stay reachable forever as the wall grows past a thousand.</p>
                </div>
```

- [ ] **Step 2: Full QA sweep (CLAUDE.md categories, scoped)**

- Display: discussions/interest/postcards pages at 375/768/1280 — no layout changes intended, confirm none happened.
- Data: spot-checks from Tasks 3/4/7 all green; admin stat (Meredith).
- Edge: interest with zero discussions; postcards format filter with zero cards; last-page remainder; double-click Next at the last page (disabled).
- Security: no new write paths; view is SELECT-only with invoker RLS verified in Task 2; anon key surface unchanged.
- Navigation: discussion cards still link correctly; postcard profile links work from any page.

- [ ] **Step 3: ⛔ GATE — surface QA results, wait for "push"**

After "push": `git push origin main`, poll the live site (`discussions.html` serving the view request; `postcards.js` containing `fetchPage`), re-run the live spot checks (one discussion count, one postcard page flip, interest count), then close out:
- KNOWN_TECH_DEBT.md: mark the HIGH load-patterns entry resolved (A1/B1/C1/C2 all fixed; remaining flag-only D items stay listed).
- STATE_OF_THE_PROJECT.md: add the ship to Recently shipped.
- MEMORY.md: update the June arc (open audit fixes → shipped).
