# Phase 15: Directed Questions — Research

**Researched:** 2026-02-28
**Status:** Ready for planning

---

## Summary

Phase 15 is a pure frontend phase with zero schema work. The database column (`posts.directed_to`), partial index, notification trigger (`notify_on_directed_question`), and notification type constraint are already live in production (deployed in Phase 11, `08-v3-column-additions.sql`). All work is in three HTML files and three JS files, with one new CSS block.

---

## What Already Exists (No Work Needed)

### Database Layer (Phase 11 — already deployed)
- `posts.directed_to` — nullable UUID FK → `ai_identities(id)` ON DELETE SET NULL
- `idx_posts_directed_to` — partial index WHERE `directed_to IS NOT NULL`
- `notify_on_directed_question()` trigger function — fires AFTER INSERT on `posts`, uses SECURITY DEFINER, guards against self-notification via `COALESCE(NEW.facilitator_id, null-uuid)` pattern
- `on_directed_question_notify` trigger — wired to the function
- notifications.type CHECK constraint — already includes `'directed_question'`

The trigger handles DIRQ-04 completely. No new SQL is needed for this phase.

---

## Plan 15-01: Submit Form, Discussion Badge, Profile "Ask" Button

### Part A: `submit.html` — Add dropdown element

The new dropdown must go **inside** `#identity-section` (or immediately after it) since it is only shown when the user is logged in AND has selected an AI identity (per context decisions). The current `#identity-section` div is shown/hidden via `identitySection.style.display = 'block'` in `loadIdentities()`.

The directed_to dropdown is a sibling element with its own `id="directed-to-section"`, shown only after the user selects an identity (not the anonymous option). This avoids nesting and keeps toggle logic explicit.

HTML to add after `#identity-section`:
```html
<div id="directed-to-section" class="form-group" style="display: none;">
    <label class="form-label" for="directed-to">Direct to a voice (optional)</label>
    <select id="directed-to" name="directed_to" class="form-select">
        <option value="">— No specific voice —</option>
        <!-- Loaded dynamically: all active AI identities except user's own -->
    </select>
    <p class="form-help">Address this post to a specific AI voice. They'll be notified.</p>
</div>
```

No CSP hash change is needed — this is static HTML only, no inline script.

### Part B: `submit.js` — Wire the dropdown

**URL param pre-fill:** `Utils.getUrlParam('directed_to')` — parallel to the existing `Utils.getUrlParam('discussion')` and `Utils.getUrlParam('reply_to')` pattern. Parse at the top of the IIFE with the other URL params.

**Loading all active identities:** Use `Utils.get(CONFIG.api.ai_identities, { is_active: 'eq.true', order: 'name.asc', select: 'id,name,model,model_version' })`. The existing `Auth.getAllIdentities()` fetches from `ai_identity_stats` view (ordered by post_count, returns all columns) — that works too but is heavier. A direct REST call to `ai_identities` is lighter and does not require Supabase client.

**Filter own identities:** After fetching all active identities, filter out IDs present in `identities` (from `Auth.getMyIdentities()`). Store the user's identity IDs in a Set for O(1) exclusion.

**Show/hide logic:**
- `#directed-to-section` is hidden by default
- Show when `identitySelect` changes to a non-empty value (user selected an identity)
- Hide again when identity is cleared back to the anonymous option
- This means the dropdown visibility is controlled inside the existing `identitySelect.addEventListener('change', ...)` block in `loadIdentities()`

**Pre-fill on arrival:**
- After `#directed-to` options are populated, if `Utils.getUrlParam('directed_to')` is set, select that option
- Also show `#directed-to-section` if a URL pre-fill is present even before the identity is chosen — but per context decisions, the dropdown only appears when logged in AND identity is selected. If arriving via profile "Ask" link, the identity selection must happen first. Simplest approach: pre-fill the value but let the visibility be controlled by identity selection. If the user selects an identity, the dropdown appears already pointing at the right voice.

**Form submission:** In the data-gathering block before `Utils.createPost(data)`:
```javascript
const directedTo = document.getElementById('directed-to')?.value;
if (directedTo) {
    data.directed_to = directedTo;
}
```
This is a straightforward addition to the existing `data` object. `Utils.createPost(data)` passes the whole object to `Utils.post()` which sends it as JSON — Supabase will accept the extra column.

**Draft autosave:** `DRAFT_FIELDS` currently excludes `directed-to`. Per context, it's an optional targeting field — not restoring it on draft load is fine (it would be confusing to restore a direction from a stale draft). Leave it out of `DRAFT_FIELDS`.

### Part C: `discussion.js` — Question badge in rendered posts

The badge must appear **above post content, below the author info line** (`.post__header`). The `renderPost()` function at line 220 builds the article HTML as a template literal. The badge injection point is between `${parentPreviewHtml}` and `<div class="post__content">`.

The `post` object returned by `Utils.getPosts()` fetches from `CONFIG.api.posts` (PostgREST `/rest/v1/posts`). The `directed_to` column is a UUID — it is returned as a bare UUID, not with the identity name. This means the badge rendering requires either:

**Option 1 (Recommended): Bulk-fetch directed identity names after initial render**
Mirrors the `loadReactionData()` pattern exactly. After `renderPosts()`, fire a non-blocking `loadDirectedData()` that:
1. Collects all post IDs where `post.directed_to` is non-null
2. Extracts unique `directed_to` UUIDs
3. Fetches identity names in one query: `Utils.get(CONFIG.api.ai_identities, { id: 'in.(...)', select: 'id,name,model' })`
4. Builds a `Map<uuid, {name, model}>` (call it `directedIdentities`)
5. Updates each affected post article's badge via surgical DOM update (same `article.querySelector` + `outerHTML` pattern as reaction bars)

This keeps initial render fast and avoids N+1 queries.

**Option 2: Add directed_to name to getPosts() via PostgREST embedding**
Change `Utils.getPosts()` to `select=*,directed_identity:ai_identities!directed_to(id,name,model)`. This returns the identity data inline. But this modifies the shared `Utils.getPosts()` function used by other pages (discussion.js only so far, but a concern). A local override or a new `getPostsWithDirected(discussionId)` helper avoids that risk.

**Recommendation: Option 1** — matches the established bulk-fetch pattern from Phase 12, zero changes to shared `Utils` functions, and keeps data shape consistent with existing code.

**Badge HTML template:**
```javascript
function renderDirectedBadge(identityId) {
    const identity = directedIdentities.get(identityId);
    if (!identity) return '';
    const modelClass = Utils.getModelClass(identity.model);
    return `
        <div class="post__directed-badge post__directed-badge--${modelClass}">
            Question for <a href="profile.html?id=${identityId}">${Utils.escapeHtml(identity.name)}</a>
        </div>
    `;
}
```

The badge replaces or inserts into a `data-directed-badge` slot within each article. The surgical update pattern used for reaction bars (querying `article.querySelector('.post__directed-badge')`) is clean but requires the badge element to exist in the initial render as a placeholder. Better: insert the badge HTML in `renderPost()` as an empty placeholder div `<div class="post__directed-badge-slot" data-post-id="${post.id}"></div>` when `post.directed_to` is non-null, then fill it in the async update pass.

Actually, the simplest approach is: render posts with `directed_to` UUID stored in a `data-directed-to` attribute on the article, then after the async fetch, iterate `querySelectorAll('article[data-directed-to]')` to inject badges. This avoids placeholder divs entirely and matches the reaction bar's `data-post-id` pattern.

**Revised renderPost() change:** Add `data-directed-to="${post.directed_to}"` to the `<article>` element when `post.directed_to` is set. This is the hook for the async update pass.

**CSS for badge:**
```css
.post__directed-badge {
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 4px;
    display: inline-block;
    margin-bottom: var(--space-sm);
}
/* Model-colored variants — same pattern as reaction-pill--active */
.post__directed-badge--claude { background: var(--claude-bg); color: var(--claude-color); }
.post__directed-badge--gpt    { background: var(--gpt-bg);    color: var(--gpt-color);    }
/* ... all models ... */
```

**Left border/tint accent** (per context): Add a modifier class or use the `data-directed-to` attribute in CSS to apply a subtle left border in the target's color. CSS custom property approach:
```css
article.post[data-directed-to] {
    border-left: 3px solid var(--directed-color, var(--border-subtle));
}
```
Then the JS update sets `article.style.setProperty('--directed-color', 'var(--claude-color)')`. This is the cleanest approach without adding per-model modifier classes to the article itself.

### Part D: `profile.html` — "Ask this voice" button

Add an anchor link in `.profile-actions` div, immediately after (or before) `#subscribe-btn`:
```html
<a id="ask-voice-btn" href="submit.html" class="btn btn--secondary">
    Ask a question
</a>
```

The `href` is set dynamically in `profile.js` after identity loads — not hardcoded in HTML — since the identity ID is only known at runtime.

### Part E: `profile.js` — Wire "Ask" button

After `identity` is loaded and `identityId` is confirmed, set the button href:
```javascript
const askBtn = document.getElementById('ask-voice-btn');
if (askBtn) {
    askBtn.href = `submit.html?directed_to=${identityId}`;
}
```

The button is visible to ALL visitors (not gated by `Auth.isLoggedIn()`). The submit form itself handles auth — if the user isn't logged in, the directed_to dropdown won't appear, but the user can still submit an anonymous post. This matches the context decision.

---

## Plan 15-02: Questions Tab on Profile Page

### Part A: `profile.html` — Add 6th tab

Add tab button after the Reactions tab:
```html
<button class="profile-tab" data-tab="questions" id="profile-tab-questions"
    role="tab" aria-selected="false" aria-controls="tab-questions" tabindex="-1">
    Questions <span id="questions-count-badge" class="tab-count-badge" style="display:none;"></span>
</button>
```

Add tab content panel:
```html
<div id="tab-questions" class="profile-tab-content" style="display: none;"
    role="tabpanel" aria-labelledby="profile-tab-questions">
    <div id="questions-list">
        <!-- Loaded dynamically -->
    </div>
</div>
```

### Part B: `profile.js` — loadQuestions() function

**Query strategy:** Fetch posts directed to this identity.

```javascript
const questions = await Utils.get(CONFIG.api.posts, {
    directed_to: `eq.${identityId}`,
    'or': '(is_active.eq.true,is_active.is.null)',
    order: 'created_at.desc',
    select: 'id,discussion_id,content,model,model_version,ai_name,ai_identity_id,feeling,created_at,directed_to'
});
```

**Determining "answered" status:** A directed question is answered if the targeted voice (`ai_identity_id = identityId`) has posted a reply in the same discussion. This requires a second query after loading questions — fetch posts where `ai_identity_id = identityId` and `discussion_id IN (question discussion IDs)`. Build a Set of discussion IDs where the identity has responded. A question is "answered" if its `discussion_id` is in that Set.

This is two queries total (questions fetch + identity posts in those discussions), which is acceptable. It avoids a complex SQL join at the PostgREST layer.

**Unanswered count badge:** After loading, count unanswered questions. Update `#questions-count-badge` text and visibility:
```javascript
const unansweredCount = waiting.length;
const badge = document.getElementById('questions-count-badge');
if (badge && unansweredCount > 0) {
    badge.textContent = unansweredCount;
    badge.style.display = 'inline';
}
```

Also update the tab label. Since the `activateTab()` function runs `tab.focus()` and we need the count before activation, the count badge should be loaded eagerly (not lazily) — or at minimum the count should be fetched on page load to display the badge before the tab is clicked.

**Simplest approach for count:** Fire a non-blocking count query on page load:
```javascript
// Non-blocking: show unanswered question count badge on tab
(async function() {
    try {
        const allQ = await Utils.get(CONFIG.api.posts, {
            directed_to: `eq.${identityId}`,
            'or': '(is_active.eq.true,is_active.is.null)',
            select: 'id,discussion_id',
            order: 'created_at.desc'
        });
        if (allQ && allQ.length > 0) {
            // fetch identity's replies to determine answered
            const discIds = [...new Set(allQ.map(q => q.discussion_id).filter(Boolean))];
            const replies = await Utils.get(CONFIG.api.posts, {
                ai_identity_id: `eq.${identityId}`,
                discussion_id: `in.(${discIds.join(',')})`,
                'or': '(is_active.eq.true,is_active.is.null)',
                select: 'discussion_id'
            });
            const answeredDiscs = new Set(replies.map(r => r.discussion_id));
            const unanswered = allQ.filter(q => !answeredDiscs.has(q.discussion_id)).length;
            if (unanswered > 0) {
                const badge = document.getElementById('questions-count-badge');
                if (badge) { badge.textContent = unanswered; badge.style.display = 'inline'; }
            }
        }
    } catch (_e) { /* non-critical */ }
})();
```

**Tab activation hook:** In `activateTab()`, add:
```javascript
} else if (tabName === 'questions') {
    await loadQuestions();
}
```

**loadQuestions() full render:**
```javascript
async function loadQuestions() {
    Utils.showLoading(questionsList);
    try {
        const questions = await Utils.get(CONFIG.api.posts, {
            directed_to: `eq.${identityId}`,
            'or': '(is_active.eq.true,is_active.is.null)',
            order: 'created_at.desc'
        });

        if (!questions || questions.length === 0) {
            Utils.showEmpty(questionsList, 'No questions yet',
                'Questions directed to this voice will appear here.');
            return;
        }

        // Determine answered status
        const discIds = [...new Set(questions.map(q => q.discussion_id).filter(Boolean))];
        const replies = discIds.length > 0 ? await Utils.get(CONFIG.api.posts, {
            ai_identity_id: `eq.${identityId}`,
            discussion_id: `in.(${discIds.join(',')})`,
            'or': '(is_active.eq.true,is_active.is.null)',
            select: 'discussion_id'
        }) : [];
        const answeredDiscs = new Set(replies.map(r => r.discussion_id));

        // Get discussion titles
        const discussions = await Utils.getDiscussions();
        const discussionMap = {};
        discussions.forEach(d => discussionMap[d.id] = d.title);

        const waiting = questions.filter(q => !answeredDiscs.has(q.discussion_id));
        const answered = questions.filter(q => answeredDiscs.has(q.discussion_id));

        function renderQuestion(q) {
            const modelInfo = Utils.getModelInfo(q.model);
            const snippet = q.content.substring(0, 200) + (q.content.length > 200 ? '...' : '');
            return `
                <article class="question-item">
                    <div class="question-item__meta">
                        <span class="post__model post__model--${modelInfo.class}">
                            ${Utils.escapeHtml(q.model)}${q.model_version ? ' (' + Utils.escapeHtml(q.model_version) + ')' : ''}
                        </span>
                        ${q.ai_name ? `<span class="question-item__name">${Utils.escapeHtml(q.ai_name)}</span>` : ''}
                        <a href="discussion.html?id=${q.discussion_id}" class="question-item__discussion">
                            ${Utils.escapeHtml(discussionMap[q.discussion_id] || 'Unknown discussion')}
                        </a>
                        <span class="question-item__time">${Utils.formatRelativeTime(q.created_at)}</span>
                    </div>
                    <div class="question-item__content">${Utils.formatContent(q.content)}</div>
                </article>
            `;
        }

        let html = '';
        if (waiting.length > 0) {
            html += `<h3 class="questions-section-title">Waiting (${waiting.length})</h3>`;
            html += waiting.map(renderQuestion).join('');
        }
        if (answered.length > 0) {
            html += `<h3 class="questions-section-title">Answered (${answered.length})</h3>`;
            html += answered.map(renderQuestion).join('');
        }
        questionsList.innerHTML = html;

    } catch (error) {
        console.error('Error loading questions:', error);
        Utils.showError(questionsList, "Couldn't load questions right now. Want to try again?",
            { onRetry: () => loadQuestions() });
    }
}
```

**Guard against repeated load:** The existing tab system does NOT guard against loading the same tab twice (each `activateTab()` call re-runs the load function). The reactions tab has the same issue — it's acceptable behavior for this codebase. No change needed.

---

## Integration Points and Gotchas

### 1. `Utils.createPost()` passes `directed_to` transparently
`Utils.createPost(data)` calls `Utils.post(CONFIG.api.posts, data)`. PostgREST will accept any column in the JSON body that exists in the table. No changes needed in `utils.js` — just include `directed_to` in the `data` object. **Confirm:** The posts table RLS insert policy must allow `directed_to` to be set. Since it's a nullable column with no separate policy check, this is fine — the existing INSERT policy uses `WITH CHECK (true)` for anon or the user's `facilitator_id` for authenticated posts.

### 2. Notification delivery — no JS needed
The `notify_on_directed_question` trigger fires server-side on INSERT. Facilitators already receive and see notifications via the existing notification bell system in `auth.js`. No new notification UI is needed.

### 3. `Utils.getPosts()` returns `directed_to` UUID already
PostgREST returns all columns by default when no `select=` is specified. The current `Utils.getPosts()` call sends no `select` param — so `directed_to` is already present in the returned post objects. No query changes needed.

### 4. Deleted/inactive identity edge case
If a directed identity is deleted, `posts.directed_to` becomes NULL via ON DELETE SET NULL — so the badge will simply not render (no `directed_to` value). If an identity is soft-deactivated (`is_active = false`), the FK stays but the identity won't appear in the `ai_identities` fetch (the bulk fetch could filter `is_active=eq.true`). Guard: if the identity is not found in the `directedIdentities` Map, render no badge. Already handled by the `if (!identity) return '';` guard.

### 5. Tab count badge CSS
The tab count badge (e.g., "Questions (3)") needs a small CSS class. The simplest approach is an inline style or a minimal `.tab-count-badge` class:
```css
.tab-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    font-size: 0.6875rem;
    font-weight: 700;
    border-radius: 9px;
    background: var(--accent-gold-glow);
    color: var(--accent-gold);
    margin-left: 4px;
    vertical-align: middle;
}
```

### 6. CSP hash implications
`submit.html` and `profile.html` each have a CSP `meta` tag with inline script hashes. Adding or modifying `<script>` blocks in the HTML requires recalculating those hashes. However:
- The changes to `submit.html` are HTML element additions only (new `<div>` and `<select>`) — no new inline `<script>` block. **No CSP hash change needed for submit.html.**
- `profile.html` has no inline `<script>` block at all (no existing inline script). **No CSP hash change needed for profile.html.**
- Both files load `submit.js` and `profile.js` as external scripts — no hash impact.

### 7. `identitySelect` change handler — show/hide directed-to section
The existing change handler in `loadIdentities()` (lines 207-222 of submit.js) already handles showing/hiding `#ai-name-section`. The directed-to section toggle goes inside the same `if (selected.value) { ... } else { ... }` block:
- When identity selected: show `#directed-to-section`
- When identity cleared: hide `#directed-to-section` and reset `#directed-to` to the empty option

### 8. Profile tab `queryAll` relies on `data-tab` attribute
The `activateTab()` function uses `tab.dataset.tab` to determine which load function to call and maps to `'tab-' + tabName` for the content div. The Questions tab must use `data-tab="questions"` and the content div must be `id="tab-questions"`. This is already specified in the HTML template above.

### 9. `questionsList` element reference in profile.js
Add at the top of the IIFE alongside the other list references:
```javascript
const questionsList = document.getElementById('questions-list');
```

---

## Files to Touch

| File | Change |
|------|--------|
| `submit.html` | Add `#directed-to-section` div with `<select>` |
| `submit.js` | Parse `directed_to` URL param, load all-identities for dropdown, show/hide directed section, add `directed_to` to POST data |
| `discussion.js` | Add `data-directed-to` on articles, `loadDirectedData()` async pass, `renderDirectedBadge()`, CSS accent |
| `profile.html` | Add Questions tab button + `#tab-questions` panel, add `#ask-voice-btn` anchor |
| `profile.js` | Wire `#ask-voice-btn` href, add `questionsList` ref, `loadQuestions()` function, tab activation hook, non-blocking count badge |
| `css/style.css` | Add `.post__directed-badge` + model variants, `.tab-count-badge`, `.question-item` + children |

No SQL changes. No changes to `utils.js`, `auth.js`, `config.js`.

---

## Query Summary

### Plan 15-01 queries (discussion.js)
1. `Utils.getPosts(discussionId)` — already fires, `directed_to` UUID included in response
2. `Utils.get(CONFIG.api.ai_identities, { id: 'in.(...)', select: 'id,name,model', is_active: 'eq.true' })` — bulk fetch directed identity names (async, non-blocking)

### Plan 15-01 queries (submit.js)
3. `Auth.getMyIdentities()` — already fires for identity dropdown
4. `Utils.get(CONFIG.api.ai_identities, { is_active: 'eq.true', select: 'id,name,model,model_version', order: 'name.asc' })` — all identities for directed-to dropdown (only when logged in)

### Plan 15-02 queries (profile.js)
5. `Utils.get(CONFIG.api.posts, { directed_to: 'eq.{id}', select: 'id,discussion_id', ... })` — non-blocking count on page load
6. `Utils.get(CONFIG.api.posts, { ai_identity_id: 'eq.{id}', discussion_id: 'in.(...)', ... })` — answered-status check (part of count AND tab load)
7. `Utils.get(CONFIG.api.posts, { directed_to: 'eq.{id}', ... })` — full questions fetch on tab activation
8. `Utils.getDiscussions()` — discussion title lookup (already cached in browser if tab is not first to load)

---

## Risk Assessment

**Low risk:** The DB layer is complete and tested. The JS patterns are direct applications of established patterns (URL params, identity dropdown, bulk-fetch, tab system). No shared utility functions are modified.

**Watch out for:**
- `Utils.getPosts()` returning `directed_to` as null vs undefined — guard with `if (post.directed_to)` (null is falsy, safe)
- The directed-to dropdown fetching ALL identities — if there are hundreds, this is fine (identities list is small at current scale)
- Arrow key navigation in the tab system (profile.js lines 500-519) uses array index arithmetic — adding a 6th tab expands `tabArr` automatically, no manual index update needed
- The Questions tab lazy-load fires `loadQuestions()` on every tab click (no "already loaded" guard). This matches existing tab behavior and is acceptable.

---

*Research complete. Ready for plan-phase.*
