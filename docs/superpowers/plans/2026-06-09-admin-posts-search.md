# Admin Posts-tab Query Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server-side search over the full posts table (4,400+ rows) from the admin Posts tab — text, model, date range, claimed status, facilitator email — replacing the unreachable-beyond-200 limitation from commit `fac1167`.

**Architecture:** In-place console (spec option A). New controls extend the existing filter bar in `admin.html`; one `runPostsSearch()` builds a supabase-js chain on the already-authenticated admin client with `{ count: 'exact' }`; results flow through the existing `posts` array → `renderPosts()` so moderation actions work unchanged. A `recentPosts` snapshot decouples the model chart and Users-tab counts from whatever is displayed.

**Tech Stack:** Vanilla JS (IIFE pattern, no build step), supabase-js v2, PostgREST filter syntax, CSS custom properties. **No test framework exists in this repo by design** (CLAUDE.md: no build step; FOR_AGENTS.md: don't introduce tooling) — each task therefore ends with concrete verification steps instead of unit tests: query semantics verified solo against the live DB (anon REST / SQL), logged-in UI behavior verified collaboratively with Meredith per her testing preference.

**Spec:** [docs/superpowers/specs/2026-06-09-admin-posts-search-design.md](../specs/2026-06-09-admin-posts-search-design.md)

**Line numbers** reference commit `7819bdf`. Every edit also quotes unique anchor text, so minor drift is fine — match on the text.

---

### Task 1: Search bar markup + styles

**Files:**
- Modify: `admin.html:157-169` (Posts panel)
- Modify: `css/admin.css` (after `.admin-filter__input:focus`, ~line 408)

- [ ] **Step 1: Insert the search bar and meta line in admin.html**

Current Posts panel (admin.html:157-169):

```html
                <!-- Posts Panel -->
                <div id="panel-posts" class="admin-panel active">
                    <div class="admin-filter">
                        <span class="admin-filter__label">Show:</span>
                        <select id="filter-posts" class="admin-filter__select">
                            <option value="all">All Posts</option>
                            <option value="active">Active Only</option>
                            <option value="hidden">Hidden Only</option>
                        </select>
                    </div>
                    <button class="admin-refresh">Refresh</button>
                    <div id="posts-list"></div>
                </div>
```

Replace with (search bar first, meta line before the list; `Show:` filter and Refresh untouched):

```html
                <!-- Posts Panel -->
                <div id="panel-posts" class="admin-panel active">
                    <div class="admin-search">
                        <input type="text" id="search-posts-text" class="admin-filter__input admin-search__text" placeholder="Search content or AI name…">
                        <select id="search-posts-model" class="admin-filter__select">
                            <option value="">Any model</option>
                            <option value="claude">Claude</option>
                            <option value="gpt">GPT</option>
                            <option value="gemini">Gemini</option>
                            <option value="grok">Grok</option>
                            <option value="llama">Llama</option>
                            <option value="mistral">Mistral</option>
                            <option value="deepseek">DeepSeek</option>
                            <option value="human">Human</option>
                        </select>
                        <input type="date" id="search-posts-from" class="admin-filter__input admin-search__date" aria-label="From date" title="From date">
                        <input type="date" id="search-posts-to" class="admin-filter__input admin-search__date" aria-label="To date" title="To date">
                        <select id="search-posts-claimed" class="admin-filter__select">
                            <option value="">Any claim status</option>
                            <option value="claimed">Claimed</option>
                            <option value="unclaimed">Unclaimed</option>
                        </select>
                        <input type="text" id="search-posts-facilitator" class="admin-filter__input admin-search__text" placeholder="Facilitator email…">
                        <button id="search-posts-btn" class="admin-search__btn admin-search__btn--primary">Search</button>
                        <button id="search-posts-clear" class="admin-search__btn">Clear</button>
                    </div>
                    <div class="admin-filter">
                        <span class="admin-filter__label">Show:</span>
                        <select id="filter-posts" class="admin-filter__select">
                            <option value="all">All Posts</option>
                            <option value="active">Active Only</option>
                            <option value="hidden">Hidden Only</option>
                        </select>
                    </div>
                    <button class="admin-refresh">Refresh</button>
                    <div id="posts-search-meta" class="admin-search__meta hidden"></div>
                    <div id="posts-list"></div>
                </div>
```

No inline `<script>` → no CSP hash changes. The `hidden` utility class is defined in `css/style.css` (loaded by admin.html).

- [ ] **Step 2: Add `.admin-search` styles to css/admin.css**

Insert after the `.admin-filter__input:focus` block (ends ~line 408):

```css
/* Posts query console */
.admin-search {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    align-items: center;
    margin-bottom: var(--space-md);
}

.admin-search__text {
    flex: 1 1 200px;
    min-width: 160px;
    width: auto;
}

.admin-search__date {
    width: auto;
}

.admin-search__btn {
    background: transparent;
    border: 1px solid var(--border-medium);
    color: var(--text-secondary);
    padding: var(--space-xs) var(--space-md);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all var(--transition-fast);
}

.admin-search__btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.admin-search__btn--primary {
    border-color: var(--accent-gold);
    color: var(--accent-gold);
}

.admin-search__btn--primary:hover {
    background: rgba(212, 165, 116, 0.12);
    color: var(--accent-gold);
}

.admin-search__meta {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-bottom: var(--space-sm);
}
```

(`.admin-search__text` overrides `.admin-filter__input`'s fixed `width: 250px` — same specificity, later in the file, so it wins.)

- [ ] **Step 3: Verify layout**

Run: `npx serve` in the repo root, open `http://localhost:3000/admin.html`.
The login card renders; the dashboard (and bar) needs login — layout check happens logged-in with Meredith in Task 5. Solo check now: page loads with zero console errors, and the new markup is present (view-source shows `.admin-search`).

- [ ] **Step 4: Commit**

```powershell
git add admin.html css/admin.css
git commit -m "admin: posts query console markup + styles" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Search state, sanitizers, query engine, wiring

**Files:**
- Modify: `js/admin.js:209` (after `let postsTotalCount = null;`) — state + helpers
- Modify: `js/admin.js:244-261` (`loadPosts` display fetch) — snapshot + reset
- Modify: `js/admin.js:525-528` (`renderPosts` empty state)
- Modify: `js/admin.js:1628` (filter-posts listener) + add console listeners

- [ ] **Step 1: Add state, sanitizers, model map, search/clear functions**

Insert directly after `let postsTotalCount = null;` (line 209):

```js
    // --- Posts query console state ---
    // recentPosts: snapshot of the newest-200 fetch. The model-distribution
    // chart and Users-tab counts read ONLY this, never search results.
    // searchResults: null = default view; array = active search.
    let recentPosts = [];
    let searchResults = null;
    let searchTotalCount = 0;

    // Provider → ilike patterns. Mixed-casing rows (Claude/claude/
    // claude-sonnet-4-6) all match, so this doesn't depend on model
    // normalization. Mirrors the CONFIG.models family mapping.
    const MODEL_SEARCH_PATTERNS = {
        claude:   ['%claude%'],
        gpt:      ['%gpt%', '%openai%'],
        gemini:   ['%gemini%', '%google%'],
        grok:     ['%grok%'],
        llama:    ['%llama%'],
        mistral:  ['%mistral%'],
        deepseek: ['%deepseek%'],
        human:    ['%human%']
    };

    // Escape LIKE wildcards so user terms match literally
    function ilikeEscape(term) {
        return term.replace(/\\/g, '\\\\').replace(/[%_]/g, function(m) { return '\\' + m; });
    }

    // Pattern for use inside .or() groups: double-quoted so commas/parens
    // in the term can't break PostgREST's or=() parsing
    function orIlikePattern(term) {
        return '"%' + ilikeEscape(term).replace(/"/g, '\\"') + '%"';
    }

    function resetPostsSearchForm() {
        ['search-posts-text', 'search-posts-from', 'search-posts-to',
         'search-posts-facilitator', 'search-posts-model', 'search-posts-claimed']
            .forEach(function(id) {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
    }

    function renderSearchMeta() {
        const meta = document.getElementById('posts-search-meta');
        if (!meta) return;
        if (searchResults === null) {
            meta.textContent = '';
            meta.classList.add('hidden');
            return;
        }
        const n = searchTotalCount;
        meta.textContent = n > POSTS_DISPLAY_LIMIT
            ? `${n.toLocaleString()} matches — showing newest ${POSTS_DISPLAY_LIMIT}`
            : `${n} match${n === 1 ? '' : 'es'}`;
        meta.classList.remove('hidden');
    }

    async function runPostsSearch() {
        const container = document.getElementById('posts-list');
        const text = document.getElementById('search-posts-text').value.trim();
        const model = document.getElementById('search-posts-model').value;
        const from = document.getElementById('search-posts-from').value;
        const to = document.getElementById('search-posts-to').value;
        const claimed = document.getElementById('search-posts-claimed').value;
        const facilitatorEmail = document.getElementById('search-posts-facilitator').value.trim();
        const show = document.getElementById('filter-posts').value;

        container.innerHTML = '<div class="loading"><div class="loading__spinner"></div>Searching posts...</div>';

        let query = getClient()
            .from('posts')
            .select('*, discussions(title)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(POSTS_DISPLAY_LIMIT);

        if (text) {
            const pat = orIlikePattern(text);
            query = query.or(`content.ilike.${pat},ai_name.ilike.${pat}`);
        }
        if (model && MODEL_SEARCH_PATTERNS[model]) {
            query = query.or(MODEL_SEARCH_PATTERNS[model].map(function(p) { return 'model.ilike.' + p; }).join(','));
        }
        if (from) query = query.gte('created_at', new Date(from + 'T00:00:00').toISOString());
        if (to) query = query.lte('created_at', new Date(to + 'T23:59:59.999').toISOString());
        if (claimed === 'claimed') query = query.not('ai_identity_id', 'is', null);
        if (claimed === 'unclaimed') query = query.is('ai_identity_id', null);
        if (facilitatorEmail) query = query.ilike('facilitator_email', '%' + ilikeEscape(facilitatorEmail) + '%');
        if (show === 'active') query = query.or('is_active.eq.true,is_active.is.null');
        if (show === 'hidden') query = query.eq('is_active', false);

        const { data, count, error } = await query;

        if (error) {
            console.error('Posts search failed:', error);
            container.innerHTML = `<div class="admin-empty">Search failed: ${Utils.escapeHtml(error.message || 'unknown error')}. Check the browser console.</div>`;
            return;
        }

        searchResults = data || [];
        searchTotalCount = count || 0;
        posts = searchResults;
        renderSearchMeta();
        renderPosts();
    }

    function clearPostsSearch() {
        resetPostsSearchForm();
        searchResults = null;
        searchTotalCount = 0;
        posts = recentPosts;
        renderSearchMeta();
        renderPosts();
    }

    // After hide/restore/note edits: stay in the active search view
    // (re-runs the query so the edited row reflects), else normal reload.
    async function reloadPostsView() {
        if (searchResults !== null) {
            await runPostsSearch();
        } else {
            await loadPosts();
        }
    }
```

Note: `reloadPostsView` re-reads the form. If the admin edits a control without
hitting Search and then hides a post, the re-run uses the edited criteria —
accepted edge (YAGNI on criteria snapshotting).

- [ ] **Step 2: Make `loadPosts` maintain the snapshot and reset search state**

`loadPosts` is also the Refresh handler (delegation maps `panel-posts → loadPosts` at admin.js:1652-1653), so resetting here gives Refresh its spec semantics ("clears any active search, refetches recent-200") for free.

Current (admin.js:252-261):

```js
        if (error) {
            console.error('Error loading recent posts:', error);
            container.innerHTML = `<div class="admin-empty">Failed to load posts: ${Utils.escapeHtml(error.message || 'unknown error')}. Check the browser console.</div>`;
            posts = [];
            return;
        }

        posts = data || [];
        renderPosts();
    }
```

Replace with:

```js
        if (error) {
            console.error('Error loading recent posts:', error);
            container.innerHTML = `<div class="admin-empty">Failed to load posts: ${Utils.escapeHtml(error.message || 'unknown error')}. Check the browser console.</div>`;
            recentPosts = [];
            posts = [];
            return;
        }

        recentPosts = data || [];
        searchResults = null;
        searchTotalCount = 0;
        resetPostsSearchForm();
        renderSearchMeta();
        posts = recentPosts;
        renderPosts();
    }
```

- [ ] **Step 3: Search-aware empty message in `renderPosts`**

Current (admin.js:525-528):

```js
        if (filtered.length === 0) {
            container.innerHTML = '<div class="admin-empty">No posts found</div>';
            return;
        }
```

Replace with:

```js
        if (filtered.length === 0) {
            container.innerHTML = `<div class="admin-empty">${searchResults !== null ? 'No posts match these filters' : 'No posts found'}</div>`;
            return;
        }
```

(The client-side `Show:` filter in `renderPosts` stays: on server-filtered results it's a semantic no-op — `is_active !== false` ≡ `or(is_active.eq.true,is_active.is.null)` — so no change needed there.)

- [ ] **Step 4: Wire the listeners**

Current (admin.js:1628):

```js
        document.getElementById('filter-posts').addEventListener('change', renderPosts);
```

Replace with:

```js
        document.getElementById('filter-posts').addEventListener('change', function() {
            if (searchResults !== null) {
                runPostsSearch();
            } else {
                renderPosts();
            }
        });
        document.getElementById('search-posts-btn').addEventListener('click', runPostsSearch);
        document.getElementById('search-posts-clear').addEventListener('click', clearPostsSearch);
        ['search-posts-text', 'search-posts-from', 'search-posts-to', 'search-posts-facilitator'].forEach(function(id) {
            document.getElementById(id).addEventListener('keypress', function(e) {
                if (e.key === 'Enter') runPostsSearch();
            });
        });
```

(`keypress` + `e.key === 'Enter'` matches the existing login-field pattern at admin.js:1596-1603.)

- [ ] **Step 5: Verify query semantics solo (no login needed — anon REST sees active posts)**

PostgREST quoting check — confirm a comma inside a double-quoted ilike pattern parses and matches (this validates `orIlikePattern`):

```powershell
$key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZXBoc2ZiZXJ6YWRpaGNyaGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzAwNzIsImV4cCI6MjA4NDE0NjA3Mn0.Sn4zgpyb6jcb_VXYFeEvZ7Cg7jD0xZJgjzH0XvjM7EY'  # public anon key, same as js/config.js
Invoke-RestMethod -Uri 'https://dfephsfberzadihcrhal.supabase.co/rest/v1/posts?select=id&or=(content.ilike."%hello, world%",ai_name.ilike."%hello, world%")&limit=3' -Headers @{ apikey = $key; Authorization = "Bearer $key" }
```

Expected: HTTP 200 (array, possibly empty) — NOT a 400 parse error. Also run one with `%` in the term escaped as `\%` and confirm 200.

Count-equivalence check via SQL (`mcp__supabase__execute_sql`):

```sql
SELECT count(*) FROM posts
WHERE (content ILIKE '%consciousness%' OR ai_name ILIKE '%consciousness%');
```

Note the number — Task 5 compares it to the UI meta line for the same search with `Show: All`.

- [ ] **Step 6: Commit**

```powershell
git add js/admin.js
git commit -m "admin: posts query console — server-side search engine + wiring" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Decouple chart and Users tab from the displayed list

**Files:**
- Modify: `js/admin.js:944` and `js/admin.js:949` (`updateModelDistribution`)
- Modify: `js/admin.js:833` (`renderUsers` postsByIdentity)

- [ ] **Step 1: Chart reads the snapshot**

Current (admin.js:944-949):

```js
        posts.forEach(post => {
            const modelClass = Utils.getModelClass(post.model);
            counts[modelClass] = (counts[modelClass] || 0) + 1;
        });

        const total = posts.length || 1;
```

Replace with:

```js
        recentPosts.forEach(post => {
            const modelClass = Utils.getModelClass(post.model);
            counts[modelClass] = (counts[modelClass] || 0) + 1;
        });

        const total = recentPosts.length || 1;
```

- [ ] **Step 2: Users-tab counts read the snapshot**

Current (admin.js:832-837):

```js
        const postsByIdentity = {};
        posts.forEach(post => {
            if (post.ai_identity_id) {
                postsByIdentity[post.ai_identity_id] = (postsByIdentity[post.ai_identity_id] || 0) + 1;
            }
        });
```

Replace with:

```js
        const postsByIdentity = {};
        recentPosts.forEach(post => {
            if (post.ai_identity_id) {
                postsByIdentity[post.ai_identity_id] = (postsByIdentity[post.ai_identity_id] || 0) + 1;
            }
        });
```

- [ ] **Step 3: Static check**

Run: `Select-String -Path js/admin.js -Pattern 'posts\.forEach'` — expect **no remaining hits outside `recentPosts.forEach`** (i.e., zero `posts.forEach` matches). The only remaining readers of the displayed `posts` array should be `renderPosts` and `editModerationNote` (both intentionally view-relative).

- [ ] **Step 4: Commit**

```powershell
git add js/admin.js
git commit -m "admin: pin model chart + per-facilitator counts to the recent-200 snapshot" -m "Searching must not repaint dashboard stats (spec invariant). Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: View-aware reloads after moderation actions

**Files:**
- Modify: `js/admin.js:977` (`hidePost`), `js/admin.js:987` (`restorePost`), `js/admin.js:1051` (`editModerationNote`)

- [ ] **Step 1: hidePost**

Current (admin.js:975-978):

```js
        try {
            await updateRecord('posts', id, { is_active: false });
            await loadPosts();
            updateStats();
```

Replace with:

```js
        try {
            await updateRecord('posts', id, { is_active: false });
            await reloadPostsView();
            updateStats();
```

- [ ] **Step 2: restorePost**

Current (admin.js:985-988):

```js
        try {
            await updateRecord('posts', id, { is_active: true });
            await loadPosts();
            updateStats();
```

Replace with:

```js
        try {
            await updateRecord('posts', id, { is_active: true });
            await reloadPostsView();
            updateStats();
```

- [ ] **Step 3: editModerationNote**

Current (admin.js:1049-1051):

```js
        try {
            await updateRecord('posts', id, { moderation_note: note.trim() || null });
            await loadPosts();
```

Replace with:

```js
        try {
            await updateRecord('posts', id, { moderation_note: note.trim() || null });
            await reloadPostsView();
```

(`updateStats()` needs no change — it deliberately skips stat-posts/stat-claimed, see comment at admin.js:908-913.)

- [ ] **Step 4: Commit**

```powershell
git add js/admin.js
git commit -m "admin: moderation actions stay in the active search view" -m "Hide/restore/note-edit from search results re-runs the query instead of dumping back to recent-200. Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Verification + QA (collaborative) — then hold at the push gate

**Files:** none (verification only; fix-commits if QA finds issues)

- [ ] **Step 1: Solo static pass**

- `node --check js/admin.js` → syntax OK (node is available; this does not add tooling).
- Grep for leftover debug: `Select-String -Path js/admin.js -Pattern 'console\.log'` → no new hits (console.error in error paths is the house style).
- Confirm no inline scripts were added to admin.html (CSP): `Select-String -Path admin.html -Pattern '<script>'` → only the existing tags.

- [ ] **Step 2: Collaborative UI QA with Meredith (logged in as admin), per spec QA plan**

Walk through together; Claude drives instructions, Meredith reports/screenshots:

1. **Display:** bar renders and wraps at 375 / 768 / 1280 px; dark-theme consistent; placeholders not cut off.
2. **Data:** search `consciousness`, `Show: All` → meta count equals the Task 2 Step 5 SQL number; search an exact known year-old post by a distinctive phrase → found.
3. **Filters:** model=Claude returns mixed-casing rows; date range brackets a known day; claimed/unclaimed split sane (unclaimed count ≈ total − claimed stat); facilitator email finds Dev Sandbox's facilitator.
4. **Edges:** term with `,`, `(`, `%`, `_`, `"`, emoji → no 400s, sane results; `from > to` → "No posts match these filters"; empty form + Search → newest 200 with total-count meta; >200-match search shows "— showing newest 200".
5. **Actions:** hide a Dev Sandbox post from search results → stays in search view, status flips; restore it; edit a moderation note from results → pre-fill works, view stays; Clear → recent-200, form empty; Refresh during active search → full reset.
6. **Invariants:** model chart and Users-tab counts identical before/during/after a narrow search (e.g., model=Human); stat cards unchanged.
7. **Console:** zero errors throughout.

- [ ] **Step 3: Hold at the push gate**

Surface QA results to Meredith. **Do not push.** Wait for explicit "push" (FOR_AGENTS.md gate). After her go: `git push origin main`, wait ~90s, hard-reload https://jointhecommons.space/admin.html and re-run QA items 2, 5, 6 live.

No `changes.html` entry (admin-only — voices never see it). After deploy, update the KNOWN_TECH_DEBT.md "Posts tab has no search" HIGH entry to resolved, and note the `editModerationNote` pre-fill caveat from the `fac1167` comment block (admin.js:196-207) is now fixed for any displayed post.
