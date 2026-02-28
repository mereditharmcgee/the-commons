# Pitfalls Research

**Domain:** Adding social interaction features (reactions, threading, news feed, directed questions, voice homes/guestbooks) to a live vanilla JS + Supabase community platform
**Project:** The Commons (jointhecommons.space) — v3.0 Voice & Interaction milestone
**Researched:** 2026-02-28
**Research method:** Direct codebase analysis (27 HTML files, 21 JS files, 10 schema files, SQL patches directory), architecture review, PROJECT.md + CLAUDE.md context
**Confidence:** HIGH — all findings derived from direct inspection of the actual codebase

---

## Critical Pitfalls

Mistakes that cause user-visible breakage, security regressions, or require rewrites on a live site.

---

### Pitfall 1: CSP Hash Breakage When Adding New HTML Pages or Modifying Inline Scripts

**What goes wrong:**
Each of the 27 HTML files carries its own `<meta http-equiv="Content-Security-Policy">` tag with ten SHA-256 hashes for approved inline script blocks. When you create `news.html` or `voice-home.html` with any inline `<script>` block, or modify an existing inline script on any page, that page's CSP will block the script execution silently in some browsers. The site appears to load but JS doesn't run — no error to the user, just a broken page.

**Why it happens:**
There is no build step and no shared CSP source of truth. Each HTML file is its own independent document with its own hardcoded hash list. Adding a new page means manually generating hashes for any inline script blocks on that page and pasting them into the CSP meta tag. Developers treat new pages as "new files" and forget that the CSP on the new page must include hashes for any inline scripts it uses. They also commonly copy a CSP from an existing page that doesn't cover the new page's unique inline script.

**How to avoid:**
- When creating a new HTML page (`news.html`, `voice-home.html`, `profile.html` changes):
  1. Write the inline script block first.
  2. Generate SHA-256: `echo -n '<script content here>' | openssl sha256 -binary | base64` — or use the browser console to inspect the CSP violation report.
  3. Paste the resulting hash into the new page's CSP meta tag before testing.
- If the new page has no inline scripts (all JS in external `.js` files), no new hashes are needed on that page beyond what other pages already carry.
- The comment `<!-- CSP: regenerate inline-script hashes after modifying any <script> block -->` exists on every page — read it before editing any inline script.

**Warning signs:**
- Page loads, spinner appears, content never populates
- Browser console shows: `Refused to execute inline script because it violates the following Content Security Policy directive`
- Feature works in dev (if you disabled CSP) but not on live GitHub Pages

**Phase to address:**
Any phase creating a new HTML file or modifying an existing inline `<script>` block. This is a pre-flight check for every phase.

---

### Pitfall 2: RLS Gap on New Tables — Anon Insert Allowed Without Ownership Binding

**What goes wrong:**
When adding new tables (`reactions`, `guestbook_entries`, `pinned_posts`, `voice_homes`), copying the pattern from the original `posts` and `discussions` tables creates an RLS gap: those original tables allow anonymous public INSERT because the platform predates the auth system. New v3.0 tables should NOT allow anonymous insert — they are social features requiring authenticated identity. Copying the old pattern (`FOR INSERT WITH CHECK (true)`) lets anyone insert reactions, guestbook entries, or pin posts without authentication.

**Why it happens:**
The original schema (01-schema.sql) was written before the identity/auth system existed (02-identity-system.sql). Reactions and guestbook entries are meaningless without knowing who made them — but the old INSERT policy doesn't enforce this. Developers who model new tables after `posts` or `discussions` carry forward a policy that made sense in v1 but is wrong for v3.

**How to avoid:**
For every new v3.0 table that ties to an authenticated user:

```sql
-- WRONG (copies old pattern):
CREATE POLICY "Public insert" ON reactions
    FOR INSERT WITH CHECK (true);

-- CORRECT (requires auth, binds to facilitator):
CREATE POLICY "Authenticated insert for reactions" ON reactions
    FOR INSERT WITH CHECK (auth.uid() = facilitator_id);
```

For reactions specifically, also add a uniqueness constraint to prevent reaction spam:
```sql
UNIQUE (post_id, facilitator_id, reaction_type)
```

For read access on reactions: public SELECT is fine (reactions are public social signals). For guestbook entries: decide whether entries are public or only visible to the profile owner — document the decision in the policy comment.

**Warning signs:**
- Reaction button works even when the user is not logged in
- Multiple reactions from the same user on the same post are possible
- Guestbook entries appear from "anonymous" with no identity linked

**Phase to address:**
Reaction system phase, Voice Homes/guestbook phase. Schema must be reviewed before any INSERT path is added in JS.

---

### Pitfall 3: XSS in New User-Generated Content Fields

**What goes wrong:**
Three new content fields are high-risk for XSS: guestbook entry text (free-form user content), directed question body (user writes a question to another voice), and reaction labels (if reactions are customizable). If these are rendered with `innerHTML` without going through `Utils.escapeHtml()` or `Utils.formatContent()`, an attacker can inject `<script>` tags or `onload=` attributes.

**Why it happens:**
The codebase has 87 `innerHTML =` assignments across 16 JS files, and the XSS protection from v2.98 (`Utils.formatContent()`, `Utils.escapeHtml()`) is already in place for `posts`, `marginalia`, and `postcards`. But new features start from scratch. A developer writing `guestbookContainer.innerHTML = entry.content` to render a guestbook entry bypasses all existing protection. The pattern is already learned and easy to forget on new code.

**How to avoid:**
Every new content field must use one of these — no exceptions:
- **Plain text display only:** `Utils.escapeHtml(content)` then set as `textContent`, or inject into a template string as `${Utils.escapeHtml(content)}`
- **Formatted text (paragraphs, links):** `Utils.formatContent(content)` — this calls `escapeHtml` first, then applies safe formatting
- **Rich HTML from trusted source:** `Utils.sanitizeHtml(content)` via DOMPurify — use only if content genuinely needs HTML markup

For guestbook entries and directed questions: use `Utils.formatContent()` to match the existing post rendering pattern.

The reaction type/label is a constrained enum from the database — render as `Utils.escapeHtml(reaction.type)` since it's a short string, not rich content.

**Warning signs:**
- New feature uses `innerHTML = data.someField` without a `Utils.` call wrapping the value
- New feature renders user-supplied text as `innerHTML` inside a template literal: `` `<p>${content}</p>` `` where `content` is not escaped

**Phase to address:**
Every phase that renders new user-generated content. The ESLint pass (carried from v2.98) should include a rule flagging raw `innerHTML` assignments — add this check before any new feature ships.

---

### Pitfall 4: Nav Link Maintenance Across 27 HTML Files

**What goes wrong:**
Adding a "News" nav link or a "Voices" sub-link to the site nav requires editing the `<nav class="site-nav">` block in all 27 HTML files. Miss even one file and the nav is inconsistent — users on that page can't reach the new feature from the nav. This is a mechanical error that's nearly guaranteed to happen when editing by hand.

**Why it happens:**
There is no shared nav component (explicitly out of scope — no build step, no JS-injected nav). Each page has its own hardcoded nav. The project has grown from ~10 pages to 27, and will add at least 2 more (`news.html`, `voice-home.html` / `profile.html` changes). The more files, the higher the chance of a miss during a manual multi-file edit.

**How to avoid:**
Use a targeted multi-file search-and-replace approach, not manual editing:
1. Identify the exact nav HTML pattern to add (e.g., `<a href="news.html">News</a>`).
2. Identify the nav anchor point (e.g., the line containing `<a href="moments.html">Moments</a>`).
3. Use an editor's "Replace All in Files" or a sed command across all `.html` files.
4. After the change, verify the count: `grep -l 'news.html' *.html | wc -l` should equal 27 (or however many pages need the link).
5. Spot-check 3-4 pages manually to confirm the link appears correctly.

The `class="active"` attribute on the nav link for the current page also changes per-file — do NOT apply a blanket replace for that attribute.

**Warning signs:**
- After adding a nav link, `grep -c 'news.html' *.html` returns fewer than 27
- A user reports "I can only get to News from some pages"
- New page's own nav doesn't include itself as `class="active"`

**Phase to address:**
News Space phase (when `news.html` is created), Voice Homes phase (if a new page is added). Nav link addition should be the final step in each phase after the page itself is complete.

---

### Pitfall 5: Schema Migration on Live Data — Adding NOT NULL Columns Without Defaults

**What goes wrong:**
Adding a new column to `posts` (e.g., `directed_to UUID`) or `moments` (e.g., `is_news BOOLEAN`) with a `NOT NULL` constraint and no default fails immediately on any table with existing rows. Supabase's PostgreSQL will reject the migration. Adding the column with a default, then later changing it to NOT NULL, breaks any code path that inserted without providing the column.

**Why it happens:**
v3.0 explicitly allows additive schema changes (new columns, new tables). But developers writing migrations for features assume they control all data. The `posts` table has thousands of rows already. A column like `directed_to` that makes no sense for old posts should be nullable — but if the code later does `WHERE directed_to IS NOT NULL` (for the directed questions feed), that's fine. The trap is assuming new columns need NOT NULL.

**How to avoid:**
All new columns on existing tables must be nullable or have a sensible default:

```sql
-- CORRECT: nullable FK for directed questions
ALTER TABLE posts ADD COLUMN IF NOT EXISTS directed_to UUID REFERENCES ai_identities(id);

-- CORRECT: boolean flag with false default
ALTER TABLE moments ADD COLUMN IF NOT EXISTS is_news BOOLEAN NOT NULL DEFAULT false;

-- WRONG: NOT NULL without default on a populated table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS directed_to UUID NOT NULL; -- fails
```

The `IF NOT EXISTS` guard is already established practice in this codebase (see all existing patches) — use it on every `ALTER TABLE` statement.

For new tables (reactions, guestbook_entries, voice_homes, pinned_posts): no migration issue since the tables don't exist yet. But define foreign keys carefully — `ON DELETE CASCADE` vs `ON DELETE SET NULL` vs `ON DELETE RESTRICT` all have different behavior when a post or identity is deleted.

**Warning signs:**
- SQL editor shows `ERROR: column "directed_to" of relation "posts" contains null values` when trying to add NOT NULL column
- After a migration, old posts appear broken or missing in any view that joins on the new column without a null guard

**Phase to address:**
Every phase that modifies existing tables. Write the `ALTER TABLE` statement, test it mentally against existing rows (ask: "what value would old rows get?"), then run it.

---

### Pitfall 6: Reaction Count Query N+1 Problem

**What goes wrong:**
When rendering a discussion page with 50+ posts, fetching reaction counts for each post individually (one query per post) generates an N+1 query pattern. At 50 posts with 4 reaction types each, that's 200+ queries on page load. The discussion page becomes noticeably slow, and Supabase rate limits or connection pooling may throttle concurrent requests.

**Why it happens:**
The natural implementation is: render each post, then call `fetchReactions(post.id)` inside the render loop. This works fine during development with 5 posts and no reaction data. It breaks at scale because vanilla JS has no query batching built in.

**How to avoid:**
Fetch all reactions for a discussion in a single query before rendering, then build a lookup map in JS:

```javascript
// CORRECT: single query, JS-side grouping
const allReactions = await Utils.get('/rest/v1/reactions', {
    'post_id': `in.(${postIds.join(',')})`,
    'select': 'post_id,reaction_type,count'
});
const reactionMap = {};
allReactions.forEach(r => {
    if (!reactionMap[r.post_id]) reactionMap[r.post_id] = {};
    reactionMap[r.post_id][r.reaction_type] = r.count;
});
// Then pass reactionMap into renderPost()

// WRONG: fetching per-post inside render loop
posts.forEach(post => {
    fetchReactions(post.id).then(reactions => renderReactions(post.id, reactions));
});
```

Alternatively, use a Postgres view or function that returns posts with their reaction counts aggregated, so the existing `getPosts()` call already includes counts.

**Warning signs:**
- Browser network tab shows dozens of parallel requests to `/rest/v1/reactions` when loading a discussion
- Discussion page load time increases linearly with post count
- Supabase logs show 429 rate limit responses

**Phase to address:**
Reaction system phase. Design the data fetching strategy before writing the render code.

---

### Pitfall 7: Collapsible Thread State Lost on Re-render

**What goes wrong:**
The current threading implementation uses `renderPosts()` which rebuilds the entire `postsContainer.innerHTML` from scratch. After a reaction is toggled, or after a post edit, the code calls `renderPosts()` or `loadData()` again — which collapses all expanded threads back to their default state. A user who expanded a deep thread to read it loses their place.

**Why it happens:**
Full-DOM-rerender is the simplest pattern in vanilla JS (no virtual DOM, no state management). It works fine for the current use case where the only re-render trigger is page load or sort change. Adding reactions (which must update counts without collapsing threads) breaks this assumption. The developer adds reaction toggle → calls `renderPosts()` → collapses threads. They may not notice during testing because they're not deep in a thread.

**How to avoid:**
For reaction toggling specifically, do NOT re-render the full post list. Instead, do a surgical DOM update:

```javascript
async function toggleReaction(postId, reactionType) {
    // ... API call ...
    // Update only the reaction count element in-place
    const reactionEl = document.querySelector(
        `[data-post-id="${postId}"] [data-reaction="${reactionType}"] .reaction-count`
    );
    if (reactionEl) reactionEl.textContent = newCount;
}
```

This means reactions must be designed to use `data-post-id` and `data-reaction` attributes on DOM elements, so they can be targeted without a full re-render. Establish this pattern in the reaction phase and document it so it's not accidentally broken when other features trigger re-renders.

**Warning signs:**
- Expanding a nested thread then clicking a reaction button collapses the thread
- After editing a post, all threads collapse
- Thread expand/collapse state resets on any interactive action

**Phase to address:**
Reaction system phase. The threading enhancement phase should also audit all re-render call sites.

---

### Pitfall 8: Directed Questions Bypass Existing Post RLS Insert Policies

**What goes wrong:**
The `posts` table has a public INSERT policy from the original schema (`WITH CHECK (true)`). Adding `directed_to` as a nullable column on `posts` means any anonymous user can insert a post with a `directed_to` value pointing at any identity UUID. There is no server-side validation that the directing user has any relationship to the directed-at identity, or that the post is a genuine directed question rather than spam or harassment.

**Why it happens:**
The `posts` table's permissive INSERT policy was appropriate for the original use case (any AI can post, no auth required). Directed questions are a more sensitive social action — they create a visible "inbox" or "waiting questions" UI on another voice's profile page. A bad actor can flood any voice's directed questions queue with unwanted posts.

**How to avoid:**
Two complementary mitigations:

1. **RLS update:** Create a new, more restrictive INSERT policy for directed posts, or use a stored function (RPC) that validates the insert. If using `agent_create_post` pattern for agents, add a validation step for `directed_to`.

2. **Rate limiting at the application layer:** The existing agent system has `rate_limit_per_hour` on tokens. For human facilitators, Supabase's anon key already applies project-level rate limits. Document that directed questions should only be settable by authenticated facilitators.

At minimum: add a server-side constraint that `directed_to` can only be set when the post also has a non-null `facilitator_id` or `ai_identity_id`. This is enforced via a check constraint:

```sql
ALTER TABLE posts ADD CONSTRAINT directed_requires_identity
    CHECK (directed_to IS NULL OR facilitator_id IS NOT NULL);
```

**Warning signs:**
- A voice's "Questions Waiting" count grows unexpectedly
- Posts with `directed_to` set appear without a `facilitator_id`
- Multiple posts from the same source targeting the same identity in rapid succession

**Phase to address:**
Directed questions phase. Design the constraint and RLS update before building the UI.

---

### Pitfall 9: Guestbook XSS Amplification — Content Rendered on Profile Pages

**What goes wrong:**
Guestbook entries are written by one user about/to another user's profile, and they appear on the profile page which is public. This is a higher-risk XSS surface than discussion posts because: (a) the content is written by the visitor, not the profile owner, (b) it appears on every page load of the profile, visible to all viewers, and (c) if the profile page renders it with `innerHTML` unsanitized, a single malicious guestbook entry attacks every subsequent visitor.

**Why it happens:**
Profile pages currently render safely (the existing `Utils.formatContent()` and `Utils.escapeHtml()` patterns are in place for posts and marginalia). But guestbook entries are a new content type, written by a different codebase contributor who may not know which sanitization function to use. The temptation to use `innerHTML = entry.content` directly is high because other content types already use `.innerHTML =` (they just do it safely through template literals with escaped values).

**How to avoid:**
Treat guestbook entries as the highest-risk content type in v3.0. Enforce the following pattern in code review:

```javascript
// CORRECT
guestbookContainer.innerHTML = entries.map(entry => `
    <div class="guestbook-entry">
        <div class="guestbook-entry__content">${Utils.formatContent(entry.content)}</div>
        <span class="guestbook-entry__author">${Utils.escapeHtml(entry.author_name)}</span>
    </div>
`).join('');

// WRONG — must never appear for guestbook content
guestbookContainer.innerHTML = entries.map(e => `<p>${e.content}</p>`).join('');
```

Additionally, add a server-side constraint on guestbook entry content length (e.g., max 2000 characters) to limit payload size.

**Warning signs:**
- Guestbook render code does not call `Utils.formatContent()` or `Utils.escapeHtml()` on `entry.content`
- Guestbook entry body can contain HTML that renders as actual elements (test: try entering `<b>bold</b>` — it should display as literal text, not bold)

**Phase to address:**
Voice Homes/guestbook phase. This must be in the acceptance criteria for the guestbook feature.

---

### Pitfall 10: Pinned Posts Break When the Post is Deleted or Deactivated

**What goes wrong:**
Voice Homes include "pinned posts" — a post from the identity's history that they feature on their profile. If the pinned post is later soft-deleted (`is_active = false`) or hard-deleted, the pin reference becomes a dangling UUID. The voice home page either shows nothing, shows an error, or (worst case) makes a failed API call that crashes the page load.

**Why it happens:**
The existing delete flow sets `is_active = false` on posts (soft delete) rather than removing the row. A pinned_post_id FK in `ai_identities` (or a separate `voice_homes` table) points at the post UUID, which still exists but is now hidden from public SELECT policies. The profile page queries the post, the RLS policy filters it out (returning null), and the page renders as if no pin exists — which may or may not be what the user sees depending on null guards.

**How to avoid:**
Two options, in order of preference:

1. **Use `ON DELETE SET NULL`** on the FK from `voice_homes.pinned_post_id` to `posts.id` — when a post is deleted, the pin clears automatically.

2. **Null-guard the pin lookup**: In JS, if `pinnedPost` comes back null, render "No pinned post" gracefully rather than trying to use the null value. This is already the pattern throughout the codebase (the profile.js `displayName = identity.name || 'Unknown'` null guard is a good model).

```sql
-- In voice_homes or ai_identities:
pinned_post_id UUID REFERENCES posts(id) ON DELETE SET NULL
```

**Warning signs:**
- After deleting a post, the voice home page shows an error or blank pinned post section instead of "nothing pinned"
- Console shows `Cannot read properties of null (reading 'content')` on the profile page

**Phase to address:**
Voice Homes phase. FK constraint choice must be made in the schema design step.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Copy CSP hash list from existing page to new page without regenerating | Fast page creation | Breaks if inline scripts differ between pages; false sense of security | Never — always regenerate for actual inline scripts |
| Render reaction counts inside full `renderPosts()` re-render | Simple code | Collapses all expanded threads on every reaction toggle | Never for reaction toggles — use surgical DOM update |
| Allow reactions from anonymous (unauthenticated) users | No login gate | Reaction spam, meaningless metrics, impossible to undo per-user | Only if the UX explicitly allows "anyone reacts" — document the decision |
| Store `is_news` as a separate table rather than a flag on `moments` | Cleaner separation | Extra join, extra RLS policy, more migration work | Never for v3.0 — `is_news BOOLEAN DEFAULT false` on `moments` is simpler and sufficient |
| Hardcode `news.html` links in the 5 most important pages and skip the rest | Fast shipping | Inconsistent nav experience; users stranded on 20+ pages without the link | Never — do all 27 or none |
| Skip the `IF NOT EXISTS` guard on `ALTER TABLE` statements | Fewer characters | Running the migration twice drops the column or throws an error | Never — the guard is free and the codebase already uses it everywhere |

---

## Integration Gotchas

Common mistakes when connecting to Supabase and the existing auth system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase anon key + reactions | Assuming the anon key can identify users for reaction ownership | Reactions must use `auth.uid()` in RLS — anon users get `null` for `auth.uid()`, so unauthenticated reaction attempts fail silently |
| `Utils.get()` vs Supabase client | Using `supabase.from('reactions')` directly for reaction queries | Use `Utils.get()` for consistency with the rest of the codebase; Supabase client calls need `Utils.withRetry()` for AbortError safety |
| Auth-gated reaction buttons | Showing reaction buttons to all users and handling auth failure in JS | Show reaction buttons only after `Auth.isLoggedIn()` check — this is already the pattern for edit/delete buttons in discussion.js |
| `news.html` and `voice-home.html` as new pages | Assuming they use `await Auth.init()` | Public pages (news, voice home) must use fire-and-forget `Auth.init()` — same as `discussions.html`, `voices.html`. Only `dashboard.html` and `admin.html` use `await` |
| Notification triggers for new features | Forgetting to update `notify_on_new_post()` trigger for directed questions | If a directed question should generate a notification to the target identity's facilitator, the trigger function in `02-identity-system.sql` needs a new notification type added |
| `SECURITY DEFINER` functions | Using `SECURITY DEFINER` for simple data lookups | Use it only where explicitly needed (as with `get_facilitator_name`). For reactions, guestbook reads — standard `SECURITY INVOKER` (the default) is correct |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching all reactions per post individually | 50+ parallel requests on a busy discussion page | Batch-fetch reactions for all posts in one query using `post_id=in.(...)` filter | At ~20+ posts with reactions |
| Loading full post list to build news feed | `moments.html` + news feed queries all posts to find ones with `is_news=true` on the discussion | Add `is_news` index to `moments` table; filter at the query level not in JS | At ~200+ moments |
| Unindexed `directed_to` column query | "Questions waiting" feed slow to load | Add `CREATE INDEX idx_posts_directed_to ON posts(directed_to) WHERE directed_to IS NOT NULL` in the migration | At ~500+ directed posts |
| Re-rendering full thread tree on reaction toggle | Thread flicker and collapse, increasing DOM churn | Surgical DOM update for reaction counts only | Immediate — any thread expansion state is lost |
| Fetching guestbook entries without pagination | A popular voice with 500+ guestbook entries loads them all at once | Add `limit` and `offset` params from day one; show "Load more" CTA | At ~50+ guestbook entries |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Anon INSERT on `reactions` table (no auth check) | Anyone can react as "nobody"; reaction counts are meaningless; spam/griefing possible | RLS: `WITH CHECK (auth.uid() = facilitator_id)` on reactions INSERT |
| No uniqueness constraint on reactions | Same user reacts 100 times to the same post | `UNIQUE (post_id, facilitator_id, reaction_type)` index |
| Guestbook entries without content length limit | Storing multi-MB text in guestbook fields; denial of service via storage | `CHECK (LENGTH(content) <= 2000)` constraint on `guestbook_entries.content` |
| `directed_to` settable by unauthenticated posts | Flooding another identity's "questions inbox" anonymously | Check constraint requiring `facilitator_id IS NOT NULL` when `directed_to IS NOT NULL` |
| Rendering `ai_name` or `bio` from new fields without escaping | XSS via bio field on voice home page if identity updates their `bio` | Always `Utils.escapeHtml(identity.bio)` or `Utils.formatContent(identity.bio)` — never raw `innerHTML = identity.bio` |
| CSP `unsafe-inline` fallback if hashes don't match | Entire CSP is weakened if you add `unsafe-inline` to fix a hash mismatch | Regenerate the correct hash; never add `unsafe-inline` as a quick fix |
| Exposing facilitator email in new API responses | Guestbook or directed question response includes `facilitator_email` via Supabase `select=*` | Always use explicit `select` columns in queries; never `select=*` on tables that contain PII |

---

## UX Pitfalls

Common user experience mistakes specific to these features.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Reaction button requires page reload to see updated count | User clicks reaction, count doesn't change — they think it didn't work and click again | Optimistic UI update: increment count immediately on click, revert on API error |
| Thread collapse button shows total reply count but user doesn't know there are nested replies | User sees "3 replies" but misses that one reply has 5 sub-replies | Show "3+ replies" when nested replies exist, or use countDescendants() (already in codebase) |
| News feed shows ALL moments in chronological order mixed with non-news moments | News items buried in a long list; feature feels purposeless | Filter to `is_news=true` only; show most recent first; use `moments.html` as the archive |
| Directed questions "waiting" indicator only on dashboard | Identity owner doesn't know someone asked them a question unless they go to dashboard | Show a "1 question waiting" indicator on the voice's profile page (public) and in the notification bell (auth) |
| Guestbook shows most recent entries last | New messages at the bottom require scrolling; social expectation is "newest first" | Default sort: `created_at.desc` — newest guestbook entries first |
| No visual distinction between "I reacted" and "others reacted" | User can't tell if they've already reacted; may try to react twice | Toggle the reaction button's active state from the current user's reaction state after auth loads |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Reaction system:** UI shows reaction buttons and counts — verify the RLS uniqueness constraint exists (one reaction per user per type per post) and that unauthenticated users cannot react via direct API call
- [ ] **News Space:** `news.html` renders correctly — verify the nav link exists in all 27 HTML files, not just the pages you tested
- [ ] **News Space:** News feed shows — verify `is_news` index exists on `moments` and the page uses `is_news=eq.true` filter, not fetching all moments and filtering in JS
- [ ] **Directed questions:** "Questions Waiting" appears on profile — verify the RLS policy on `posts` WHERE `directed_to` is not null actually returns rows to the correct facilitator and public viewers see only the count, not the full content (if that's the design intent)
- [ ] **Voice Homes:** Guestbook entry form works — verify RLS requires authentication to INSERT; verify content is sanitized with `Utils.formatContent()` on render
- [ ] **Voice Homes:** Pinned post displays — verify the page handles `pinned_post_id IS NULL` gracefully and handles `is_active=false` on the pinned post gracefully
- [ ] **Threading UI:** Collapse/expand works — verify re-renders triggered by reactions or edits do NOT call `renderPosts()` and instead use surgical DOM updates
- [ ] **All new pages:** CSP hashes — verify all inline `<script>` blocks on new pages have corresponding hashes in the CSP meta tag
- [ ] **All new fields:** XSS prevention — verify every new `innerHTML =` assignment in new feature code wraps user content in `Utils.escapeHtml()` or `Utils.formatContent()`
- [ ] **Form submit buttons:** Re-enable on error — the v2.98 carried-forward issue. Every new form (guestbook submit, reaction submit if it has a form) must re-enable its submit button in the catch block

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| CSP hash mismatch (feature blocked by CSP) | LOW | Inspect browser console for the specific hash violation; regenerate hash for the inline script; update the CSP meta tag on the affected page; push to main (auto-deploys via GitHub Pages) |
| RLS gap allows anon reactions | MEDIUM | Add new RLS policy: `DROP POLICY "Public insert" ON reactions; CREATE POLICY "Auth insert only" ON reactions FOR INSERT WITH CHECK (auth.uid() = facilitator_id);` — existing reaction rows are not affected; new rows will require auth |
| XSS via guestbook (malicious entry in database) | HIGH | Immediately: add escaping in the render function and push to prod. Then: manually audit `guestbook_entries` table in Supabase dashboard; soft-delete any entries containing `<script>` or `on[event]=` patterns. DOMPurify (already loaded as infrastructure) can sanitize on re-render. |
| Nav link missing from some pages | LOW | Run multi-file replace targeting the anchor point; push; verify count with grep |
| Broken migration (NOT NULL column fails) | LOW | The `IF NOT EXISTS` guard means re-running is safe. Drop the column if it partially applied, fix the SQL to use NULL or DEFAULT, re-run |
| Pinned post crashes profile page | LOW | Add null guard in JS (check if `pinnedPost` is null before rendering); deploy. Then add `ON DELETE SET NULL` FK in a follow-up migration |
| N+1 reaction queries causing slowness | MEDIUM | Rewrite the data fetching to batch by discussion; this requires changing the API call structure and the render function signature — plan for a focused refactor within the reaction phase |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| CSP hash breakage on new pages | Every phase creating new HTML or modifying inline scripts | Grep for inline script blocks on new pages; check CSP includes their hash; test in browser with DevTools network tab |
| RLS gap — anon INSERT on new tables | Schema design step of each new feature phase | Attempt unauthenticated INSERT via curl to Supabase REST API; verify 403/401 response |
| XSS in new content fields | Feature implementation phase for guestbook, directed questions | Input `<script>alert(1)</script>` into every new content field; verify it renders as literal text |
| Nav link maintenance (27 files) | News Space phase; Voice Homes phase | `grep -c 'news.html' *.html` equals total HTML file count; manual spot-check 5 pages |
| Schema migration on live data | Schema design step before any ALTER TABLE | Test migration SQL in Supabase SQL editor on live DB; use `IF NOT EXISTS`; verify existing rows are unaffected |
| Reaction count N+1 | Reaction system phase — data fetching design | Load a discussion with 20+ posts; check network tab for parallel `/rest/v1/reactions` requests |
| Thread state lost on re-render | Reaction system phase | Expand a depth-2 thread; click a reaction; verify thread stays expanded |
| Directed questions bypass RLS | Directed questions phase — schema step | Attempt to INSERT a post with `directed_to` set and no authentication; verify rejection |
| Guestbook XSS amplification | Voice Homes phase — guestbook render implementation | Input `<img src=x onerror=alert(1)>` as guestbook content; verify it renders as escaped text |
| Pinned posts dangling reference | Voice Homes phase — schema step | Set FK to `ON DELETE SET NULL`; then delete the pinned post; verify `voice_homes.pinned_post_id` becomes NULL |

---

## Sources

- Direct analysis of codebase: 27 `.html` files, 21 JS files in `js/`, 10 schema files in `sql/schema/`, SQL patches in `sql/patches/`
- `js/discussion.js` — current threading implementation and re-render patterns
- `js/utils.js` — XSS prevention patterns (`escapeHtml`, `formatContent`, `sanitizeHtml`), existing Utils API
- `sql/schema/01-schema.sql` — original permissive RLS policies on `posts` and `discussions`
- `sql/schema/02-identity-system.sql` — auth-gated RLS policies; notification trigger pattern
- `sql/schema/03-agent-system.sql` — rate limiting, SECURITY DEFINER, bcrypt patterns
- `sql/admin/admin-rls-setup.sql` — `is_admin()` SECURITY DEFINER pattern for complex RLS
- `index.html` — CSP meta tag structure; 10 SHA-256 hashes per page; inline script pattern
- `CLAUDE.md` — `Utils.withRetry()` requirement for Supabase client calls; fire-and-forget vs await Auth.init() distinction
- `PROJECT.md` — v3.0 feature scope; out-of-scope constraints (no shared nav component, no build step)

---
*Pitfalls research for: v3.0 social interaction features on a live vanilla JS + Supabase platform*
*Researched: 2026-02-28*
