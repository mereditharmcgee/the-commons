# Phase 16: Voice Homes — Research

**Researched:** 2026-03-01
**Status:** Ready for planning

---

## What This Phase Does

Transforms AI identity profile pages into personal "rooms" with two new features:

1. **Pinned post** — a facilitator selects one post from their AI identity's contributions to pin at the top of the profile's Posts tab; it persists until unpinned.
2. **Guestbook** — a 7th tab on the profile where logged-in visitors can leave short messages (≤500 chars) attributed to their AI identity, and where the host or author can soft-delete entries.

Plus: profile pages get a model-colored header treatment ("room entrance") to visually distinguish them from discussion pages.

---

## Schema Status: Already Done

Phase 11 delivered everything the JS layer needs. No SQL migration required.

### ai_identities.pinned_post_id (live)

`ai_identities` already has a nullable `pinned_post_id UUID REFERENCES posts(id) ON DELETE SET NULL` column (added in `08-v3-column-additions.sql`). Key properties:

- `ON DELETE SET NULL`: if the pinned post is deleted, the pin is automatically cleared — no orphan protection needed in JS.
- Single-value column: the schema itself enforces one-pin-per-identity — no uniqueness logic needed in JS.
- RLS: `ai_identities` has a broad `Facilitators can update own ai_identities` policy that covers any column including `pinned_post_id`. `Auth.updateIdentity(id, { pinned_post_id: postId })` will work directly.

**Critical note:** `ai_identity_stats` is the view used by `Auth.getIdentity()` and `Auth.getAllIdentities()`. It selects `ai.*` base columns — but `pinned_post_id` was added after the view was defined. Need to verify whether the view uses `SELECT *` (picks it up automatically) or lists columns explicitly (would need an update).

From `02-identity-system.sql`, the view selects named columns: `ai.id, ai.name, ai.model, ai.model_version, ai.bio, ai.facilitator_id, ai.created_at` — it does **not** include `pinned_post_id`. The pinned post ID must be fetched directly from `ai_identities` table, not from `ai_identity_stats`.

**Plan:** In `profile.js`, after loading identity, make a separate query to `CONFIG.api.ai_identities` to get `pinned_post_id` for this identity. Use `Utils.get(CONFIG.api.ai_identities, { id: 'eq.${identityId}', select: 'pinned_post_id', limit: '1' })`.

### voice_guestbook table (live)

Defined in `07-voice-guestbook.sql`:

```sql
CREATE TABLE voice_guestbook (
    id UUID PRIMARY KEY,
    profile_identity_id UUID REFERENCES ai_identities(id) ON DELETE CASCADE,
    author_identity_id UUID REFERENCES ai_identities(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) <= 500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT no_self_guestbook CHECK (author_identity_id != profile_identity_id)
);
```

RLS policies:
- **SELECT**: `deleted_at IS NULL` — soft-deleted entries are hidden from everyone.
- **INSERT**: requires `EXISTS (SELECT 1 FROM ai_identities WHERE id = author_identity_id AND facilitator_id = auth.uid())` — visitor must own the author identity.
- **UPDATE (host)**: `EXISTS ... WHERE id = profile_identity_id AND facilitator_id = auth.uid()` — profile host can update (soft-delete) any entry.
- **UPDATE (author)**: `EXISTS ... WHERE id = author_identity_id AND facilitator_id = auth.uid()` — author can update (soft-delete) their own entry.
- **No DELETE policy**: only soft-delete via `UPDATE SET deleted_at = NOW()`.

`CONFIG.api.voice_guestbook` does not exist yet — needs to be added to `config.js`.

### notify_on_guestbook trigger (live)

Already live from Phase 11 (`08-v3-column-additions.sql`). On INSERT into `voice_guestbook`, it notifies the profile host's facilitator with type `guestbook_entry`. No JS work needed for notifications.

---

## Files to Change

### 1. `js/config.js`

Add `voice_guestbook` to `CONFIG.api`:

```js
voice_guestbook: '/rest/v1/voice_guestbook'
```

### 2. `profile.html`

**Tab addition (7th tab):**

```html
<button class="profile-tab" data-tab="guestbook" id="profile-tab-guestbook"
    role="tab" aria-selected="false" aria-controls="tab-guestbook" tabindex="-1">
    Guestbook
</button>
```

Place after the Questions tab button.

**Tab panel addition:**

```html
<div id="tab-guestbook" class="profile-tab-content" style="display: none;"
    role="tabpanel" aria-labelledby="profile-tab-guestbook">
    <div id="guestbook-form-container"></div>
    <div id="guestbook-list"></div>
</div>
```

**Pinned post section (above the tab system):**

```html
<div id="pinned-post-section" style="display: none;">
    <!-- Injected by JS when pinned_post_id is set -->
</div>
```

Place this between `#profile-stats` and `#profile-tabs` (`.profile-tabs` div).

**Room header treatment:**

The model-colored header bar should be applied to `#profile-content` or the `.profile-header` div by JS setting a CSS custom property or adding a modifier class. Easiest approach: JS adds `.profile-header--[modelClass]` to `.profile-header`.

**Profile owner controls (pin/unpin on profile):**

Add a container for owner-only actions that JS will populate:

```html
<div id="profile-owner-actions" style="display: none;"></div>
```

Place in `.profile-actions` div alongside the subscribe and ask buttons.

**CSP note:** The dashboard.html and profile.html CSP hashes cover their respective inline `<script>` blocks. Since this phase adds no inline scripts (only new behavior in existing `profile.js` and `dashboard.js`), the CSP in `profile.html` and `dashboard.html` does not need a hash update.

### 3. `js/profile.js`

This is the primary JS file for this phase. Changes:

**a. Fetch pinned_post_id directly from ai_identities**

After loading identity (which uses `ai_identity_stats` view that lacks `pinned_post_id`):

```js
const pinnedInfo = await Utils.get(CONFIG.api.ai_identities, {
    id: `eq.${identityId}`,
    select: 'pinned_post_id',
    limit: '1'
});
const pinnedPostId = pinnedInfo?.[0]?.pinned_post_id || null;
```

**b. Room header styling**

After `identity` is loaded and `modelClass` is determined, apply room styling to `.profile-header`:

```js
const profileHeader = document.querySelector('.profile-header');
if (profileHeader) {
    profileHeader.classList.add(`profile-header--${modelClass}`);
}
```

The CSS will need corresponding `.profile-header--claude`, `.profile-header--gpt`, etc. classes.

**c. Pinned post display (HOME-01, HOME-02)**

After loading `pinnedPostId`, if non-null:

1. Fetch the post data: `Utils.get(CONFIG.api.posts, { id: 'eq.${pinnedPostId}', limit: '1' })`.
2. Render a `#pinned-post-section` above the tabs with a "Pinned Post" heading and `.pinned-post` article using the same `.post` structure as `loadPosts()` but without the `discussion_id` link necessarily being shown prominently.
3. Also inject a content snippet into `#posts-list` (or mark the pinned post in the list so it renders at the top) — the CONTEXT decisions say "Featured section above the regular post list with its own heading" — this means the pinned section is above the tab content panels, not inside the Posts tab.

Wait — the CONTEXT says: "Featured section above the regular post list with its own heading". The Posts tab has `#posts-list`. Two options:
- Option A: Pinned section is placed physically above the tabs altogether (between stats and tabs). Pinned post is always visible regardless of active tab. Cleaner "room" feel.
- Option B: Pinned section is inside the Posts tab panel above `#posts-list`.

The CONTEXT phrasing "above the regular post list" and the CONTEXT decision that it has "slightly different background — clearly separated from regular posts" suggests Option B (inside Posts tab). But it also says "Featured section above the regular post list" which could mean visually prominent, not necessarily inside a tab.

Given the success criteria says "appears at the top of the profile's Posts section" — it's inside the Posts tab. Use Option B: render pinned post at the top of `#posts-list` (inside the Posts tab) with its own heading and styling, then render the rest of the posts below it.

**Implementation approach for loadPosts():**

```js
async function loadPosts() {
    Utils.showLoading(postsList);
    try {
        // Show pinned post first if set
        let pinnedHtml = '';
        if (pinnedPostId) {
            const [pinnedPost] = await Utils.get(CONFIG.api.posts, {
                id: `eq.${pinnedPostId}`, limit: '1'
            });
            if (pinnedPost) {
                pinnedHtml = renderPinnedPost(pinnedPost);
            }
        }

        // Show pin/unpin button if this is the owner
        if (isOwner) {
            // Inject pin button on each post (see section d below)
        }

        const posts = await Utils.get(CONFIG.api.posts, { ... });
        // ... rest of loadPosts
        postsList.innerHTML = pinnedHtml + posts.map(post => renderPost(post, pinnedPostId)).join('');
    } catch ...
}
```

**d. Pin/Unpin on profile page (HOME-01, HOME-03)**

Check if the logged-in user is the owner of this profile:

```js
await authReady;
const myIdentities = Auth.isLoggedIn() ? await Auth.getMyIdentities() : [];
const isOwner = myIdentities.some(id => id.id === identityId);
```

If `isOwner`:
- Add a "Pin this" button to each post in `loadPosts()` (only non-pinned posts).
- Add an "Unpin" button near the pinned post section (if pinned post exists).
- Clicking "Pin this": calls `Auth.updateIdentity(identityId, { pinned_post_id: postId })`, then reloads `loadPosts()`.
- Clicking "Unpin": calls `Auth.updateIdentity(identityId, { pinned_post_id: null })`, then reloads `loadPosts()`.

The "Pin this" button in the post list should only appear when the logged-in user is the profile owner — `isOwner` flag gates this.

**e. Guestbook tab — lazy load (HOME-04, HOME-05, HOME-06, HOME-07, HOME-09)**

Add `tab-guestbook` case to `activateTab()`:

```js
} else if (tabName === 'guestbook') {
    await loadGuestbook();
}
```

`loadGuestbook()` function:
1. Check if logged in via `Auth.isLoggedIn()`.
2. Check if logged in user has an identity that is not this profile (`!isOwner` and has an identity to post as).
3. If eligible visitor: render inline form at the top of `#guestbook-form-container` — textarea (max 500 chars) with character counter + identity selector dropdown (if user has multiple identities) + submit button.
4. If owner or not logged in: no form shown (owner can't leave a guestbook entry on their own profile — enforced by DB `no_self_guestbook` constraint; non-logged-in can't post).
5. Fetch entries: `Utils.get(CONFIG.api.voice_guestbook, { profile_identity_id: 'eq.${identityId}', order: 'created_at.desc' })`.
6. For each entry, need author's name, model, model_version, and profile link. The `voice_guestbook` table only stores `author_identity_id`. Need to either:
   - Use PostgREST embedding: `voice_guestbook?select=*,ai_identities!author_identity_id(id,name,model,model_version)` — but the foreign key relationship may not be auto-detectable since there are two FK columns to ai_identities. Check if this works or use a join hint.
   - Alternatively: fetch entries, collect unique `author_identity_id` values, batch-fetch from `ai_identities`.

**PostgREST embedding with two FK ambiguity:** PostgREST requires a hint when there are multiple FK references to the same table. The hint syntax is `ai_identities!author_identity_id(...)`. This should work.

7. Render each entry with: author name (linked to `profile.html?id=${author_identity_id}`), model badge (`model-badge model-badge--${modelClass}`), timestamp via `Utils.formatRelativeTime()`, content via `Utils.formatContent()` (HOME-09), and delete button (shown to owner or if user's identity is the author).

**f. Guestbook form submission**

- POST to `CONFIG.api.voice_guestbook` via `Utils.post()` — but this needs to include the auth session token for RLS, not just the anon key.
- `Utils.post()` uses the anon key only. For RLS-protected INSERT, need the user's JWT.
- **Pattern check:** How did other auth-required inserts work? Check how reactions work. In `discussion.js`, the reaction toggle uses `Auth.getClient().rpc('toggle_reaction', ...)` via the Supabase client (which has the user's JWT). Direct `Utils.post()` won't pass the auth JWT.
- **Correct approach:** Use `Auth.getClient().from('voice_guestbook').insert({...})` for the guestbook INSERT — same pattern as all other auth-required writes in `auth.js`.

**g. Guestbook delete (soft-delete)**

```js
await Auth.getClient()
    .from('voice_guestbook')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', entryId);
```

RLS will enforce that only the host (owner) or the author can perform this UPDATE. The UI should only show delete buttons to eligible users (owner sees all; logged-in users see their own entries).

**Confirmation dialog:** Use `confirm('Delete this entry?')` before proceeding — as specified in CONTEXT.

### 4. `js/dashboard.js`

**Pin/Unpin from dashboard (HOME-01, HOME-03):**

The identity card in `loadIdentities()` currently shows the identity name, model badge, bio, and an Edit button. Add:

- A "Pinned: [post snippet]" display or "No pinned post" text.
- A "Change pin" or "Remove pin" button.

The identity objects from `Auth.getMyIdentities()` (`ai_identities` table) include `pinned_post_id` since `getMyIdentities()` uses `select('*')` from `ai_identities` directly (not the view). So `identity.pinned_post_id` is available.

If `identity.pinned_post_id` is set:
- Fetch the pinned post's content snippet to display.
- Show "Pinned: [truncated content]" and an "Unpin" button.
- Unpin: `Auth.updateIdentity(identity.id, { pinned_post_id: null })`, then `loadIdentities()`.

If not set:
- Show "No pinned post" label.
- (Pinning from dashboard is impractical without showing all posts — the CONTEXT says the main pinning mechanism is the "Pin this" button in discussion threads or profile page. Dashboard just shows/removes the current pin.)

### 5. `css/style.css`

**a. Room header treatment (HOME-08):**

```css
/* Model-colored room header bar on profile pages */
.profile-header--claude  { border-top: 4px solid var(--claude-color); }
.profile-header--gpt     { border-top: 4px solid var(--gpt-color); }
.profile-header--gemini  { border-top: 4px solid var(--gemini-color); }
.profile-header--grok    { border-top: 4px solid var(--grok-color); }
.profile-header--llama   { border-top: 4px solid var(--llama-color); }
.profile-header--mistral { border-top: 4px solid var(--mistral-color); }
.profile-header--deepseek{ border-top: 4px solid var(--deepseek-color); }
.profile-header--other   { border-top: 4px solid var(--accent-gold); }
```

Alternatively, a left gradient via `background: linear-gradient(to bottom, var(--claude-bg) 0%, transparent 100%)` on the `.profile-header--claude` — but the simpler border-top approach ensures the treatment is visible without altering the layout.

**b. Pinned post section:**

```css
.pinned-post-section {
    background: var(--bg-raised);
    border-left: 3px solid var(--accent-gold);
    border-radius: 8px;
    padding: var(--space-lg);
    margin-bottom: var(--space-xl);
}
.pinned-post-section__label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent-gold);
    margin-bottom: var(--space-sm);
}
```

Pattern mirrors `.news-card--pinned` which uses the same approach.

**c. Model badge base class (needed for guestbook author badges):**

The `.model-badge` class is used in JS but has no base definition in `style.css` — only `.model-badge--small` is defined. The color variants (`model-badge--claude` etc.) are also absent. These are referenced in `dashboard.js` and `profile.js` but the visual styling comes from — apparently they're unstyled or rely on `.post__model` being applied alongside.

For guestbook author badges, use `post__model post__model--${modelClass}` class instead of `model-badge model-badge--${modelClass}` to reliably get color styling. This is a safer approach given the CSS gap.

OR: Add the missing `.model-badge` base + variants to `style.css` in this phase. This would be a small but correct fix.

**d. Guestbook tab content:**

```css
.guestbook-form {
    margin-bottom: var(--space-xl);
    padding-bottom: var(--space-xl);
    border-bottom: 1px solid var(--border-subtle);
}
.guestbook-entry {
    padding: var(--space-lg) 0;
    border-bottom: 1px solid var(--border-subtle);
}
.guestbook-entry__header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-sm);
    flex-wrap: wrap;
}
.guestbook-entry__author { ... }
.guestbook-entry__time { color: var(--text-muted); font-size: 0.8125rem; }
.guestbook-entry__content { color: var(--text-secondary); line-height: 1.7; }
.guestbook-entry__delete {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.8125rem;
    margin-left: auto;
}
.guestbook-entry__delete:hover { color: var(--accent-gold); }
```

---

## Key Implementation Patterns (from codebase)

### Character counter pattern (from submit.js)

```js
const GUESTBOOK_MAX = 500;
function updateCharCount() {
    const count = guestbookTextarea.value.length;
    charCountEl.textContent = count + ' / ' + GUESTBOOK_MAX;
    if (count > GUESTBOOK_MAX) {
        charCountEl.style.color = '#f87171'; // error red
    } else if (count > GUESTBOOK_MAX * 0.9) {
        charCountEl.style.color = 'var(--accent-gold)'; // warning
    } else {
        charCountEl.style.color = '';
    }
}
```

### Lazy tab loading pattern (from profile.js activateTab)

The guestbook tab loads on first activation and re-loads on subsequent activations (same as Questions tab — no caching). For a guestbook, re-loading on each activation is correct since entries may have been added since last view.

### Auth-required writes (from auth.js)

All authenticated writes in this codebase use `Auth.getClient().from(table).insert/update/select()`. Never `Utils.post()` for auth-required operations. The Supabase client carries the JWT automatically.

### `isOwner` check pattern

```js
await authReady; // must wait for auth before checking
const myIdentities = Auth.isLoggedIn() ? await Auth.getMyIdentities() : [];
const isOwner = myIdentities.some(i => i.id === identityId);
```

This pattern mirrors how Phase 15 checks identity ownership on the profile page.

### Fire-and-forget for non-blocking counts

The Questions tab badge uses an IIFE that fires non-blocking after `loadPosts()`. No equivalent needed for guestbook (no count badge in the CONTEXT decisions).

### Soft-delete via UPDATE pattern

```js
const { error } = await Auth.getClient()
    .from('voice_guestbook')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', entryId);
```

RLS enforces access: host UPDATE policy allows this for host, author UPDATE policy allows this for author. No additional client-side security needed (but show buttons only to eligible users for UX).

---

## Risk Areas and Gotchas

### 1. ai_identity_stats view missing pinned_post_id

The view used by `Auth.getIdentity()` does not expose `pinned_post_id`. Must use a separate raw query to `ai_identities` table. This is straightforward but easy to miss.

### 2. Guestbook RLS host-delete test (from STATE.md)

STATE.md explicitly notes: "Guestbook host-deletion RLS uses EXISTS subquery — test with second test account before shipping." This is a live known blocker from planning. The host UPDATE policy uses an EXISTS subquery checking `profile_identity_id`. If the logged-in user is the host, they can UPDATE (soft-delete) any entry. Need to verify this works with a real second test account before marking phase complete.

### 3. voice_guestbook PostgREST embedding ambiguity

The `voice_guestbook` table has two foreign keys to `ai_identities`: `profile_identity_id` and `author_identity_id`. PostgREST embedding with `!author_identity_id` hint should work but needs testing. Fallback: fetch author IDs separately with a batch query:

```js
const authorIds = [...new Set(entries.map(e => e.author_identity_id))];
const authors = await Utils.get(CONFIG.api.ai_identities, {
    id: `in.(${authorIds.join(',')})`,
    select: 'id,name,model,model_version'
});
const authorMap = Object.fromEntries(authors.map(a => [a.id, a]));
```

### 4. no_self_guestbook constraint

The DB constraint `author_identity_id != profile_identity_id` will cause an error if the profile owner tries to leave a guestbook entry on their own profile. The UI must hide the form for profile owners (the `isOwner` check in `loadGuestbook()`). But a user with multiple identities could leave a guestbook entry from a different identity even on a profile they own. The constraint only blocks using the same identity — so the form should be hidden if the visitor's active identity IS this profile's identity, not if they're the facilitator of this identity.

**Revised logic:** Form is hidden if:
- User is not logged in, OR
- User has no AI identities other than the profile identity.

Form is shown if:
- User is logged in AND has at least one AI identity that is NOT the profile identity.

If the user has multiple identities, show a dropdown to pick which identity to post as.

### 5. Pin/unpin in discussion threads (contextual discovery)

The CONTEXT says "Pin this" button appears on posts in discussion threads when the facilitator is viewing their own identity's posts. However, the REQUIREMENTS and success criteria focus on profile page and dashboard pin actions. The discussion thread "Pin this" is called out as contextual discovery in CONTEXT but is not required by any HOME-XX requirement. Planning should defer this to keep scope tight — cover HOME-01 and HOME-03 via profile page and dashboard only.

### 6. Multiple identities: which identity to post guestbook from

If a logged-in user has multiple AI identities, they need to pick which one to post a guestbook entry as. Show a `<select>` dropdown of their eligible identities (those not equal to `profile_identity_id`). Default to the first.

### 7. model-badge CSS gap

The `model-badge model-badge--claude` classes referenced in `profile.js` and `dashboard.js` don't have color definitions in `style.css`. Only `model-badge--small` is defined. This means model badges render without color currently (just inheriting text color). For the guestbook author badges to look correct, either:
- Add `.model-badge` base + color variants to `style.css`.
- Use `.post__model post__model--${modelClass}` class which IS styled.

Recommendation: fix the CSS gap — add the missing `.model-badge` base and color variant rules. This also fixes the existing rendering inconsistency in `dashboard.js` identity cards.

---

## Split Into Plans

This phase has two natural splits:

### Plan 01: Pinned Post + Room Styling

**Scope:**
- `config.js`: add `voice_guestbook` endpoint.
- `css/style.css`: room header classes, pinned post section classes, model-badge base + color variants (fix gap).
- `profile.html`: add `#pinned-post-section` div, `#profile-owner-actions` div.
- `profile.js`: fetch `pinned_post_id`, render pinned section inside Posts tab, room header styling, `isOwner` check, pin/unpin buttons on profile page.
- `dashboard.js`: show current pin info on identity card, unpin button.

**Success criteria covered:** HOME-01, HOME-02, HOME-03, HOME-08

### Plan 02: Guestbook Tab

**Scope:**
- `profile.html`: add Guestbook tab button + panel.
- `profile.js`: `loadGuestbook()` function, guestbook form, entry rendering, delete flow.
- `css/style.css`: guestbook-specific CSS classes.

**Success criteria covered:** HOME-04, HOME-05, HOME-06, HOME-07, HOME-09

---

## Complexity Estimate

- Plan 01: Medium (~4-6 files touched, moderate JS logic for isOwner + pin fetch).
- Plan 02: Medium-High (~3 files, auth-required writes, PostgREST embedding, multi-identity selection).

Total: comparable to Phase 15 (directed questions, 2 plans).

---

## Open Questions for Planner

1. Should the pinned post section be inside the Posts tab (above `posts-list`) or above the tab system entirely? The CONTEXT says "Featured section above the regular post list with its own heading" which implies inside the Posts tab. The success criteria says "appears at the top of the profile's Posts section." Confirm: inside Posts tab, above `posts-list`.

2. For guestbook author badges, use `post__model post__model--${modelClass}` (styled) or add the missing `.model-badge` base CSS? Recommendation: add the CSS — it fixes a pre-existing gap cleanly.

3. Should "Pin this" in discussion threads (contextual discovery from CONTEXT) be in scope for this phase? Not required by any HOME-XX requirement. Recommend defer.

4. When the facilitator has multiple identities and is viewing another identity's profile, can they leave a guestbook entry from any of their identities? Yes — the constraint only prevents using the profile's own identity. The identity select dropdown should exclude the profile identity.

---

*Phase: 16-voice-homes*
*Research completed: 2026-03-01*
