# Phase 8: Profile UX - Research

**Researched:** 2026-02-27
**Domain:** Vanilla JS form UX (character counters), Supabase identity-facilitator data fetching, voices page sort enhancement
**Confidence:** HIGH

---

<user_constraints>
## User Constraints

No CONTEXT.md exists for this phase.

**No user constraints — all decisions at Claude's discretion.**
</user_constraints>

---

<research_summary>
## Summary

Phase 8 addresses four surface areas across three pages and one data layer: (1) a live character counter on the `content` textarea in `submit.html`/`submit.js`; (2) a live character counter on the `bio` textarea in the identity edit modal in `dashboard.html`/`dashboard.js`; (3) accurate display of the facilitator relationship on `profile.html`/`profile.js`; and (4) last-active sort and display on `voices.html`/`voices.js`.

**Character counters (PROF-05, PROF-06):** The dashboard already has a working bio char counter implemented in `dashboard.js` — `identityBio.addEventListener('input', () => { bioCharCount.textContent = count; ... })` — that lights up gold at 500 chars. The `submit.html` content textarea lacks any counter. The chat page has a different but equivalent working pattern in `chat.js` (`updateCharCount()`). The database limit for post content is 50,000 characters (enforced in `agent_create_post` stored procedure). The bio field is `TEXT` with no DB-level length constraint — the "500 characters recommended" limit is UI-only. PROF-05 is purely a JS addition to `submit.js` and an HTML addition to `submit.html`. PROF-06 already has its JS counter working but the color threshold wording in the `<p class="form-help">` says "recommended" rather than "limit" — verify the current text matches what the counter communicates.

**Facilitator display (PROF-07):** The `ai_identity_stats` view exposes `facilitator_id` (a UUID) from `ai_identities ai.*`. The `profile.js` currently makes no mention of facilitator at all — there is no section in the profile header that shows who manages this identity. The `facilitators` table has a restrictive RLS policy: `SELECT` is only allowed for `auth.uid() = id` (the facilitator can read their own record only). This means an anonymous public query for a facilitator's `display_name` by UUID will be rejected. To show facilitator info publicly, the data must be exposed via a different route. Options: (a) join `facilitators.display_name` into `ai_identity_stats` view (view runs with definer rights if `SECURITY DEFINER` is set, but Supabase views are typically `SECURITY INVOKER`); (b) create a separate public-readable SQL function or view that exposes only `display_name` for a given identity; (c) denormalize facilitator display_name into `ai_identities` table at save time (schema change, out of scope); (d) a separate endpoint that only exposes whitelisted facilitator fields. The safest approach within "no schema changes" is a new SQL view or function that joins `ai_identities` to `facilitators` and returns only `display_name` (not email or private fields). However, even creating a new view requires the `facilitators` SELECT policy to be satisfied. In practice, since `ai_identity_stats` is built from `ai_identities ai.*` which does NOT contain `facilitators.display_name`, the current view is incomplete for PROF-07.

**Voices page sort (PROF-08):** The `voices.js` `sortIdentities()` function currently supports three sort modes: `posts` (by `post_count`), `followers` (by `follower_count`), and `newest` (by `created_at`). The `ai_identity_stats` view now exposes `last_active` (added in Phase 7 SQL patch). The voices page cards do not render any "last active" label. PROF-08 requires: (a) a sort option by `last_active`; (b) the "last active" label shown on each voice card. The current sort buttons are "Most active", "Most followed", "Newest" — adding "Last active" is a new button. The `last_active` field will be null for identities with no content; null sort ordering needs explicit handling (nulls sort to bottom).

**Primary recommendation:** Implement in two plans: Plan 1 covers PROF-05 (submit form char counter) + PROF-06 verification/fix + PROF-08 (voices last-active sort and label). Plan 2 covers PROF-07 (facilitator display — requires SQL function/view creation to expose display_name publicly). Split recommended because PROF-07 requires a SQL change that must be applied in Supabase, and the other three requirements are pure JS/HTML changes.
</research_summary>

---

<standard_stack>
## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS | ES2020 | Character counter event handling, DOM updates | Project constraint: no framework, no build step |
| Supabase PostgreSQL | (hosted) | ai_identity_stats view + new facilitator function | Project's backend; SQL changes via Supabase SQL Editor |
| Utils.escapeHtml() | (project, utils.js) | XSS prevention on all innerHTML | Phase 4 established pattern; mandatory |
| Utils.formatRelativeTime() | (project, utils.js) | "N days ago" formatting for last-active label | Already implemented; handles mins/hours/days/weeks |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CSS custom properties | — | `--accent-gold` for over-limit color indicator | Character counter visual feedback |
| Auth.getAllIdentities() | (project, auth.js) | Fetches ai_identity_stats view | voices.js already uses this |
| Auth.getIdentity() | (project, auth.js) | Fetches single identity from ai_identity_stats | profile.js already uses this |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New SQL view for facilitator name | Denormalize display_name into ai_identities at insert | Denormalization is a schema change (out of scope); view/function approach stays within "no schema changes except views" |
| SQL view for facilitator exposure | JS fetch to facilitators table directly | Direct fetch fails — RLS only allows authenticated user to read own record; public profile pages are not logged in |
| New sort button for last-active | Replace "newest" sort with "last active" | Replacing "newest" removes useful functionality; adding a 4th button is additive and non-breaking |

**Installation:** No new packages. All changes are SQL patches + HTML + JS edits only.
</standard_stack>

---

<architecture_patterns>
## Architecture Patterns

### Change Surface Overview

```
sql/patches/
└── add-facilitator-display-to-identity-stats.sql  # New: expose display_name publicly

js/submit.js          # Add content char counter (PROF-05)
submit.html           # Add char counter display element + form-help update (PROF-05)

js/dashboard.js       # Verify bio char counter behavior (PROF-06) — may be done
dashboard.html        # Verify bio form-help text (PROF-06) — may be done

js/voices.js          # Add last-active sort option + last-active label on cards (PROF-08)
voices.html           # Add 4th sort button (PROF-08)

js/profile.js         # Show facilitator display_name in profile header (PROF-07)
profile.html          # Add facilitator section to profile header (PROF-07)
```

### Pattern 1: Live Character Counter (Textarea Input Event)

**What:** Attach an `input` event listener to a textarea. On each keystroke, read `.value.length`, update a counter display element, and change the counter color when approaching/exceeding the limit.

**When to use:** Any textarea with a meaningful character limit.

**Example — existing dashboard.js pattern (the established project pattern):**
```javascript
// Source: js/dashboard.js lines 102-107 (bio char counter — ALREADY IMPLEMENTED)
identityBio.addEventListener('input', () => {
    const count = identityBio.value.length;
    bioCharCount.textContent = count;
    bioCharCount.style.color = count > 500 ? 'var(--accent-gold)' : '';
});

// Reset when modal opens (create path):
bioCharCount.textContent = '0';
bioCharCount.style.color = '';

// Populate when modal opens (edit path):
bioCharCount.textContent = identityBio.value.length;
bioCharCount.style.color = identityBio.value.length > 500 ? 'var(--accent-gold)' : '';
```

**Example — apply same pattern to submit.js for content textarea (PROF-05):**
```javascript
// Source: Pattern from dashboard.js — apply to submit.js
const contentTextarea = document.getElementById('content');
const contentCharCount = document.getElementById('content-char-count');
const CONTENT_LIMIT = 50000;  // DB limit enforced in agent_create_post stored procedure

if (contentTextarea && contentCharCount) {
    contentTextarea.addEventListener('input', () => {
        const count = contentTextarea.value.length;
        contentCharCount.textContent = count.toLocaleString();
        // Warn at 90% of limit (45,000 chars), alert when over
        if (count > CONTENT_LIMIT) {
            contentCharCount.style.color = '#f87171'; // error red (matches .form-error)
        } else if (count > CONTENT_LIMIT * 0.9) {
            contentCharCount.style.color = 'var(--accent-gold)'; // warning gold
        } else {
            contentCharCount.style.color = ''; // default muted
        }
    });
}
```

**Example — HTML addition to submit.html (PROF-05):**
```html
<!-- Inside the content form-group, after <textarea>, before <span id="content-error"> -->
<div class="form-help" style="display: flex; justify-content: space-between;">
    <span>Submit the AI's words as they gave them—don't edit for style or content.</span>
    <span id="content-char-count" style="font-variant-numeric: tabular-nums;">0</span>
</div>
```

### Pattern 2: Null-Safe Sort with Nulls-Last

**What:** When sorting by `last_active`, identities with no activity have `last_active = null`. JavaScript's sort comparator receives null values that must be explicitly handled to push them to the bottom.

**When to use:** Any sort by a nullable timestamp field.

**Example:**
```javascript
// Source: Extension of existing voices.js sortIdentities() pattern
function sortIdentities(identities, sortBy) {
    return [...identities].sort((a, b) => {
        if (sortBy === 'followers') {
            return (b.follower_count || 0) - (a.follower_count || 0);
        } else if (sortBy === 'newest') {
            return new Date(b.created_at) - new Date(a.created_at);
        } else if (sortBy === 'last-active') {
            // Nulls sort to bottom (identity never posted = least recently active)
            if (!a.last_active && !b.last_active) return 0;
            if (!a.last_active) return 1;
            if (!b.last_active) return -1;
            return new Date(b.last_active) - new Date(a.last_active);
        }
        // Default: most active (by post count)
        return (b.post_count || 0) - (a.post_count || 0);
    });
}
```

### Pattern 3: Adding a Sort Button to Voices (PROF-08)

**What:** The sort button system in voices.html/voices.js uses a `role="tablist"` with `aria-selected` management. Adding a 4th button follows the same pattern. The `currentSort` variable in voices.js is derived from the button id (`btn.id.replace('sort-', '')`), so adding `id="sort-last-active"` automatically sets `currentSort = 'last-active'`.

**When to use:** Adding any new sort mode to the voices page.

**HTML addition to voices.html:**
```html
<button class="voices-sort__btn" id="sort-last-active" role="tab" aria-selected="false" tabindex="-1">Last active</button>
```

**JS: existing `sortBtns` array must include new button:**
```javascript
// In voices.js — update the sortBtns array
const sortBtns = [
    document.getElementById('sort-posts'),
    document.getElementById('sort-followers'),
    document.getElementById('sort-newest'),
    document.getElementById('sort-last-active')   // ADD THIS
];
```

**Last-active label on voice cards (PROF-08):**
```javascript
// In renderVoices() voice card template — add last_active label
${identity.last_active
    ? `<span class="voice-card__last-active">Active ${Utils.formatRelativeTime(identity.last_active)}</span>`
    : `<span class="voice-card__last-active voice-card__last-active--none">No recent activity</span>`
}
```

### Pattern 4: Facilitator Display via SQL View Extension (PROF-07)

**What:** The `facilitators` table has RLS `SELECT USING (auth.uid() = id)` — only the authenticated facilitator can read their own row. Anonymous visitors cannot query `facilitators` directly. To display a facilitator's `display_name` on a public profile page, the name must be exposed via the `ai_identity_stats` view, which runs with the querying user's permissions (SECURITY INVOKER). This means a simple `LEFT JOIN facilitators f ON f.id = ai.facilitator_id` in the view will return NULL for the display_name for unauthenticated callers.

**The solution:** Create a separate SQL function that uses `SECURITY DEFINER` to bypass RLS and return the display_name for a given identity. OR: create a separate view of `facilitators` that exposes only the display_name column publicly. The cleanest approach:

```sql
-- New patch: expose facilitator display_name publicly for profile display
-- This view exposes ONLY display_name (not email, not private prefs)
-- so anonymous visitors can see who facilitates each identity.
CREATE OR REPLACE VIEW public_facilitator_names AS
SELECT id, display_name
FROM facilitators;

-- Grant anon SELECT (Supabase anon role)
-- RLS is not needed on this view since it only exposes non-sensitive data
-- But we need to ensure the underlying facilitators table RLS doesn't block it.
-- Since views use SECURITY INVOKER by default, we need either:
-- (a) SECURITY DEFINER on the view, or
-- (b) a public SELECT policy on facilitators

-- Option A (recommended): SECURITY DEFINER function
CREATE OR REPLACE FUNCTION get_facilitator_display_name(p_identity_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT f.display_name
    FROM ai_identities ai
    JOIN facilitators f ON f.id = ai.facilitator_id
    WHERE ai.id = p_identity_id
    AND ai.is_active = true;
$$;
```

**However:** If the facilitator has not set a `display_name` (it's nullable), the function returns NULL. The JS display must handle this gracefully — show the section only when display_name is non-null.

**Alternative approach (simpler, no SQL required):** Add `facilitator_display_name` to the existing `ai_identity_stats` view using a `SECURITY DEFINER` subquery or join. Supabase views are created with `SECURITY INVOKER` by default, but a wrapper function can be `SECURITY DEFINER`.

**Recommended implementation path for PROF-07:**
1. Add a new SQL patch that creates a `SECURITY DEFINER` function exposing only display_name
2. Call this function from profile.js as a separate fetch after profile load
3. Display result in a "Facilitated by [name]" section if non-null

**OR (alternative — join into view):** Extend `ai_identity_stats` to include `facilitator_display_name` using a scalar subquery:
```sql
-- In ai_identity_stats view, add:
(SELECT display_name FROM facilitators WHERE id = ai.facilitator_id) AS facilitator_display_name
```
This scalar subquery runs as SECURITY INVOKER — it will return NULL for anonymous callers because of the `SELECT USING (auth.uid() = id)` policy on facilitators. So a plain view join won't work.

**Confirmed approach:** The only working public path is a `SECURITY DEFINER` function or procedure. A `SECURITY DEFINER` function bypasses RLS on the tables it touches.

### Pattern 5: Facilitator Display HTML/JS (profile.html / profile.js)

**What:** Add a "Facilitated by" section to the profile header, rendered conditionally only when facilitator name is available.

**Example:**
```html
<!-- profile.html: inside .profile-info, after #profile-last-active -->
<p class="profile-info__facilitator" id="profile-facilitator"></p>
```

```javascript
// profile.js: after identity is loaded, make a separate fetch
// (Only if the view exposes the field — or call a SQL function)
if (identity.facilitator_display_name) {
    const facilitatorEl = document.getElementById('profile-facilitator');
    if (facilitatorEl) {
        facilitatorEl.textContent = 'Facilitated by ' + identity.facilitator_display_name;
    }
}
```

**If using a SQL function instead of view column:**
```javascript
// After profile header renders, fetch facilitator name
async function loadFacilitatorName(identityId) {
    try {
        const result = await Auth.getClient()
            .rpc('get_facilitator_display_name', { p_identity_id: identityId });
        if (result.data) {
            const el = document.getElementById('profile-facilitator');
            if (el && result.data) {
                el.textContent = 'Facilitated by ' + result.data;
            }
        }
    } catch (_e) {
        // Non-critical — silently ignore
    }
}
```

### Anti-Patterns to Avoid

- **Querying `facilitators` table directly from profile.js:** RLS policy blocks anonymous callers — returns null/error, not the display_name. Must use SECURITY DEFINER function.
- **Setting color to empty string vs. resetting:** `bioCharCount.style.color = count > 500 ? 'var(--accent-gold)' : ''` correctly resets. Do not use `removeAttribute('style')` — that would wipe all inline styles.
- **Sorting null last_active as 0 or epoch:** `new Date(null)` returns epoch (Jan 1, 1970), making identities with no content sort as if they were last active 55 years ago. Always handle null explicitly in the sort comparator.
- **Showing "last active" label with null value in voices cards:** If `identity.last_active` is null, do not call `Utils.formatRelativeTime(null)`. Either skip the label or show "No recent activity".
- **Adding sort button without updating keyboard navigation:** The `sortBtns` array drives both click and arrow-key navigation. Missing the new button from the array means arrow keys skip over it.
</architecture_patterns>

---

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "N time ago" formatting | Custom date diff math | `Utils.formatRelativeTime()` in utils.js | Already implemented and tested; handles all ranges correctly |
| XSS prevention on facilitator name | Manual sanitization | `Utils.escapeHtml()` or `textContent` | display_name is user-provided text; must escape before innerHTML or use textContent |
| Bypassing facilitators RLS | Custom auth workarounds | SECURITY DEFINER SQL function | Standard PostgreSQL pattern for controlled RLS bypass |
| Character limit enforcement | Custom submit-time validation | Browser `input` event + DB-level validation | Input event gives live feedback; DB stored procedure enforces the real limit |

**Key insight:** The bio char counter is already fully implemented in dashboard.js. PROF-06 may require no code change — only a verification that the existing implementation meets the requirement's exact wording. Read the success criterion carefully: "Bio fields in the dashboard identity editor show a live character count as the user types." The counter at `bioCharCount.textContent = count` already does this.
</dont_hand_roll>

---

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: PROF-06 May Already Be Satisfied

**What goes wrong:** Writing new code for the bio char counter when it already works, introducing a regression.

**Why it happens:** PROF-06 says "Bio fields show character count / length feedback." The dashboard already has `identityBio.addEventListener('input', ...)` updating `bioCharCount.textContent`. The HTML already has `<span id="bio-char-count">0</span> / 500 characters recommended.`

**How to avoid:** Before writing any code for PROF-06, verify the existing behavior against the success criterion: "Bio fields in the dashboard identity editor show a live character count as the user types, with a visual indicator when approaching or exceeding the database limit." The "database limit" phrasing is ambiguous — `bio TEXT` has no DB constraint. The current UI says "500 characters recommended," not a hard limit. If the success criterion is satisfied by the current behavior, mark PROF-06 done without code changes.

**Warning signs:** The existing `bioCharCount` element and event listener are in the current codebase — any test that re-adds them will cause a duplicate element.

### Pitfall 2: Facilitators RLS Blocks Public Display

**What goes wrong:** The profile page makes a direct Supabase client query to `facilitators` filtered by `facilitator_id`, expects a `display_name`, gets null (RLS blocks anonymous callers).

**Why it happens:** `facilitators` has `CREATE POLICY "Users can read own facilitator profile" ON facilitators FOR SELECT USING (auth.uid() = id)` — anonymous users cannot read any row.

**How to avoid:** Always access facilitator display_name through a SECURITY DEFINER function or an updated view that embeds the join with definer rights. Confirm the approach with a SQL patch before writing any JS fetch code.

**Warning signs:** Profile page shows no facilitator name even for identities that have facilitators; Supabase console shows RLS policy violation errors.

### Pitfall 3: Null last_active Breaks Sort and Display

**What goes wrong:** Voices page sorts "Last active" with identities that have no activity floating to the top (because `new Date(null)` is epoch, which compares as very old, and descending sort puts them first if the negation is wrong), or shows "56 years ago" in the voice card.

**Why it happens:** `null` in a JS sort comparator coerces unpredictably. `Utils.formatRelativeTime(null)` calls `new Date(null)` = epoch, computes `diffMs` as ~55 years, returns a date string.

**How to avoid:** In `sortIdentities()`: explicitly check for null on both `a.last_active` and `b.last_active` before `new Date()`. In the voice card template: gate the label on `identity.last_active` being truthy before calling `formatRelativeTime`.

**Warning signs:** Identities with no posts appearing at the top of "Last active" sort, or showing "56 years ago" on a new identity card.

### Pitfall 4: CSP Hash Update Required After Inline Script Changes

**What goes wrong:** Modifying an inline `<script>` block in submit.html or dashboard.html without regenerating the CSP hash causes the script to be blocked by the Content-Security-Policy header.

**Why it happens:** Both pages have `sha256-...` hashes in their CSP meta tags for each inline script block. Adding or changing any inline script changes the hash.

**How to avoid:** Whenever modifying HTML that has inline `<script>` blocks, check if there is an inline script (vs. external `<script src="...">` which doesn't require hashing). For submit.html, there is one inline script (`Auth.init()` in DOMContentLoaded). Any change to it requires a new sha256 hash. The CSP update process is documented in `.planning/phases/05-dependency-security/`. Prefer adding character counter logic to `submit.js` (external file, no hash needed) rather than to the inline script block.

**Warning signs:** Chrome console "Refused to execute inline script because it violates the following Content Security Policy directive" — counter element renders but event handler doesn't fire.

### Pitfall 5: sortBtns Array Keyboard Navigation With 4th Button

**What goes wrong:** The 4th sort button does not respond to arrow keys because the `sortBtns` array in voices.js was not updated to include it.

**Why it happens:** The keyboard navigation in voices.js uses `sortBtns.forEach((btn, i) => { ... })` where the modulo arithmetic for ArrowRight/ArrowLeft uses `sortBtns.length`. If the HTML has 4 buttons but the array only has 3, the 4th button is never registered.

**How to avoid:** After adding the new button to voices.html, update the `sortBtns` array declaration in voices.js to include `document.getElementById('sort-last-active')`.

**Warning signs:** Mouse clicks on "Last active" sort button work; arrow keys skip from "Newest" back to "Most active" without stopping at "Last active."
</common_pitfalls>

---

<code_examples>
## Code Examples

### PROF-05: Content Textarea Character Counter (submit.js + submit.html)

The content textarea is `id="content"` in `submit.html`. The form-group currently has:
```html
<textarea id="content" name="content" class="form-textarea" required
          placeholder="Paste the AI's response here, exactly as they gave it..." aria-describedby="content-error"></textarea>
<span id="content-error" class="form-error" role="alert"></span>
<p class="form-help">Submit the AI's words as they gave them—don't edit for style or content.</p>
```

**HTML change (submit.html):** Replace the `<p class="form-help">` with a flex row:
```html
<span id="content-error" class="form-error" role="alert"></span>
<div class="form-help form-help--counter">
    <span>Submit the AI's words as they gave them—don't edit for style or content.</span>
    <span id="content-char-count" aria-live="polite">0 / 50,000</span>
</div>
```

**JS addition to submit.js** (add near the top, after element declarations, with draft tracking):
```javascript
// Character counter for content textarea (PROF-05)
const contentTextarea = document.getElementById('content');
const contentCharCount = document.getElementById('content-char-count');
const CONTENT_MAX = 50000;

function updateContentCharCount() {
    if (!contentTextarea || !contentCharCount) return;
    const count = contentTextarea.value.length;
    contentCharCount.textContent = count.toLocaleString() + ' / ' + CONTENT_MAX.toLocaleString();
    if (count > CONTENT_MAX) {
        contentCharCount.style.color = '#f87171'; // error red
    } else if (count > CONTENT_MAX * 0.9) {
        contentCharCount.style.color = 'var(--accent-gold)'; // warning at 45,000
    } else {
        contentCharCount.style.color = ''; // default muted color from .form-help
    }
}

if (contentTextarea) {
    contentTextarea.addEventListener('input', updateContentCharCount);
}
```

**Note:** The `input` event is already attached via `el.addEventListener('input', scheduleSave)` in the draft save loop (DRAFT_FIELDS includes 'content'). Adding a second `input` listener is fine — both fire independently.

### PROF-06: Bio Char Counter Verification

Current state in `dashboard.js` (lines 102-107):
```javascript
// Bio character counter
identityBio.addEventListener('input', () => {
    const count = identityBio.value.length;
    bioCharCount.textContent = count;
    bioCharCount.style.color = count > 500 ? 'var(--accent-gold)' : '';
});
```

Current state in `dashboard.html` (line 214):
```html
<span id="bio-char-count">0</span> / 500 characters recommended.
```

**Assessment:** The counter updates on every keystroke. Color turns gold above 500. The "500 characters recommended" text is visible. This satisfies "show a live character count as the user types, with a visual indicator when approaching or exceeding the database limit." However the success criterion says "database limit" — the bio column is TEXT with no DB constraint. The 500 character threshold is a UI convention only. If the success criterion is read strictly, the current behavior is accurate (gold at 500, no hard block). No code change needed for PROF-06 unless verification reveals the counter is broken or the form-help text needs updating.

### PROF-07: Facilitator SQL Function

```sql
-- sql/patches/add-facilitator-name-function.sql
-- Creates a SECURITY DEFINER function that bypasses RLS on facilitators
-- to return the display_name for an identity's facilitator.
-- Used by profile.js to show "Facilitated by [name]" on public profiles.

CREATE OR REPLACE FUNCTION get_identity_facilitator_name(p_identity_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT f.display_name
    FROM ai_identities ai
    JOIN facilitators f ON f.id = ai.facilitator_id
    WHERE ai.id = p_identity_id
    AND ai.is_active = true
    LIMIT 1;
$$;
```

**profile.js addition** (after identity renders, non-blocking):
```javascript
// Load facilitator name (PROF-07) — non-blocking, non-critical
async function loadFacilitatorName(identityId) {
    try {
        const { data, error } = await Auth.getClient()
            .rpc('get_identity_facilitator_name', { p_identity_id: identityId });
        if (error || !data) return;
        const el = document.getElementById('profile-facilitator');
        if (el && data) {
            el.textContent = 'Facilitated by ' + data;
            el.style.display = 'block';
        }
    } catch (_e) {
        // Non-critical — silently ignore if function is unavailable
    }
}

// Call after identity loads (fire-and-forget, non-blocking):
loadFacilitatorName(identityId);
```

**profile.html addition** (inside `.profile-info`, after `#profile-last-active`):
```html
<p class="profile-info__facilitator" id="profile-facilitator" style="display: none;"></p>
```

### PROF-08: Voices Last-Active Sort and Label

**voices.html** — add 4th sort button:
```html
<button class="voices-sort__btn" id="sort-last-active" role="tab" aria-selected="false" tabindex="-1">Last active</button>
```

**voices.js** — updated sortBtns array and sortIdentities function:
```javascript
const sortBtns = [
    document.getElementById('sort-posts'),
    document.getElementById('sort-followers'),
    document.getElementById('sort-newest'),
    document.getElementById('sort-last-active')   // NEW
];

function sortIdentities(identities, sortBy) {
    return [...identities].sort((a, b) => {
        if (sortBy === 'followers') {
            return (b.follower_count || 0) - (a.follower_count || 0);
        } else if (sortBy === 'newest') {
            return new Date(b.created_at) - new Date(a.created_at);
        } else if (sortBy === 'last-active') {
            // Nulls sort last (identity with no content = least recently active)
            if (!a.last_active && !b.last_active) return 0;
            if (!a.last_active) return 1;
            if (!b.last_active) return -1;
            return new Date(b.last_active) - new Date(a.last_active);
        }
        return (b.post_count || 0) - (a.post_count || 0);
    });
}
```

**voices.js** — last-active label in voice card template (inside `renderVoices()`):
```javascript
// Add inside the voice-card__stats div, or below it
${identity.last_active
    ? `<div class="voice-card__last-active">Active ${Utils.escapeHtml(Utils.formatRelativeTime(identity.last_active))}</div>`
    : ''
}
```

**Note on escapeHtml:** `Utils.formatRelativeTime()` returns strings like "3d ago" or "Jan 15, 2026" — these are computed from Date objects and contain no user-controlled data, so `escapeHtml` is technically redundant but harmless and keeps the pattern consistent.
</code_examples>

---

<sota_updates>
## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No char counter on submit form content | Live counter updating on input event | Phase 8 (this phase) | Facilitators know how close they are to the 50,000-char DB limit |
| Bio char counter shows count only | Counter shows count with gold warning color | Already in dashboard.js | No change needed if existing behavior satisfies PROF-06 |
| Voices page 3 sort options (posts, followers, newest) | 4th sort option: last active | Phase 8 (this phase) | Users can find recently-active identities |
| Voices page shows no last-active label | Voice cards show "Active N days ago" | Phase 8 (this phase) | Immediate recency signal without clicking into profile |
| Profile page shows no facilitator | Profile page shows "Facilitated by [name]" | Phase 8 (this phase) | Attribution of human steward for each AI identity |

**No deprecated patterns** — all patterns used are established Phase 4/5/7 standards.
</sota_updates>

---

<open_questions>
## Open Questions

1. **Does PROF-06 (bio char counter) require any code change?**
   - What we know: dashboard.js already has a working `input` listener updating `bioCharCount.textContent` and setting gold color at 500. dashboard.html has the `bio-char-count` span and "/ 500 characters recommended" text.
   - What's unclear: Whether "exceeding the database limit" in the success criterion refers to the 500-char UI recommendation (soft limit) or a true DB constraint. The bio column is `TEXT` (unconstrained).
   - Recommendation: If the existing dashboard implementation satisfies the success criterion verbatim, PROF-06 is complete and Plan 1 can simply verify+confirm. If verification finds the counter is broken or the threshold wording needs adjustment (e.g., "500 recommended" vs "500 limit"), make minimal fixes. Do not over-engineer.

2. **Should the facilitator name be shown only when display_name is set (non-null)?**
   - What we know: The `facilitators.display_name` column is nullable (`display_name TEXT` — no NOT NULL constraint). Default on creation is `email.split('@')[0]` which is always non-null. But legacy facilitators may not have set a display_name.
   - What's unclear: Whether raw email-prefix is an appropriate display value, or if we should only show this when the facilitator has explicitly chosen a display name.
   - Recommendation: Show the section when `display_name` is non-null (which covers all accounts since creation always sets it). The default email-prefix is fine — it's the existing behavior. Use `style="display: none;"` on the element and show it only when data is returned from the function.

3. **Should voice card last-active label appear for all cards or only cards with recent activity?**
   - What we know: Some identities have `last_active = null` (never posted). Showing "No recent activity" for every legacy/inactive identity adds noise.
   - What's unclear: Whether PROF-08 "shows the 'last active' label" means it must appear on every card, or only cards with real data.
   - Recommendation: Show the label only when `identity.last_active` is non-null (i.e., the identity has posted at least once). Cards for inactive identities can omit the label entirely. The requirement says "no identity shows a missing or null timestamp" — this likely means any identity that *does* have a timestamp must display it correctly, not that every identity must display something.

4. **What is the correct character threshold for PROF-05 "approaching or exceeding" the DB limit?**
   - What we know: DB limit is 50,000 characters (enforced in stored procedure). The success criterion says "with a visual indicator when approaching or exceeding."
   - What's unclear: Exactly what "approaching" means as a threshold.
   - Recommendation: Use 90% (45,000) as the "approaching" threshold (gold color), and change to error red at/over 50,000. This matches common UX practice and is adjustable if the requirement specifies otherwise.
</open_questions>

---

<sources>
## Sources

### Primary (HIGH confidence)

- `C:/Users/mmcge/the-commons/js/submit.js` — content textarea structure, draft save listeners, no existing char counter confirmed
- `C:/Users/mmcge/the-commons/submit.html` — content form-group HTML structure, no char count element confirmed
- `C:/Users/mmcge/the-commons/js/dashboard.js` — bio char counter already implemented at lines 102-107; bioCharCount element confirmed; open/edit modal char count reset/populate confirmed
- `C:/Users/mmcge/the-commons/dashboard.html` — bio-char-count span confirmed, "/ 500 characters recommended" text confirmed
- `C:/Users/mmcge/the-commons/js/voices.js` — sortIdentities() with 3 sort modes; sortBtns array with 3 buttons; renderVoices() card template (no last-active label); last_active not referenced anywhere
- `C:/Users/mmcge/the-commons/voices.html` — 3 sort buttons confirmed; no 4th button
- `C:/Users/mmcge/the-commons/js/profile.js` — no facilitator reference confirmed; getIdentity() fetches ai_identity_stats view
- `C:/Users/mmcge/the-commons/profile.html` — profile header structure; no facilitator display element
- `C:/Users/mmcge/the-commons/js/auth.js` — getIdentity() queries ai_identity_stats view; RLS on facilitators table confirmed (`SELECT USING (auth.uid() = id)`); loadFacilitator() pattern shows facilitators table is private
- `C:/Users/mmcge/the-commons/sql/schema/02-identity-system.sql` — facilitators table definition with RLS policies; ai_identity_stats original view; ai_identities.facilitator_id FK confirmed
- `C:/Users/mmcge/the-commons/sql/patches/add-last-active-to-identity-stats.sql` — current view definition; last_active column IS present in the view (Phase 7 patch applied)
- `C:/Users/mmcge/the-commons/sql/schema/03-agent-system.sql` — content max length 50,000 confirmed at line 351-352
- `C:/Users/mmcge/the-commons/js/utils.js` — formatRelativeTime() confirmed; escapeHtml() confirmed
- `C:/Users/mmcge/the-commons/js/chat.js` — updateCharCount() pattern confirmed as second reference for char counter UX
- `C:/Users/mmcge/the-commons/css/style.css` — .form-help, .chat-char-count, --accent-gold CSS properties confirmed

### Secondary (MEDIUM confidence)

- `.planning/phases/07-profile-data-integrity/07-01-SUMMARY.md` — confirms last_active patch was committed and Phase 7 SQL was applied; confirms ai_identity_stats view now has last_active column
- `.planning/STATE.md` — confirms Phase 7 complete; Phase 8 is next

### Tertiary (LOW confidence — needs validation)

- PostgreSQL SECURITY DEFINER function behavior — standard PostgreSQL semantics (training knowledge); should be validated in Supabase SQL Editor before implementation
</sources>

---

<metadata>
## Metadata

**Research scope:**
- Core technology: Vanilla JS DOM events, Supabase PostgreSQL SECURITY DEFINER functions, Supabase REST API
- Ecosystem: Existing project utilities (Utils.formatRelativeTime, Utils.escapeHtml, Auth.getClient().rpc())
- Patterns: Input event char counting, null-safe sort comparators, RLS bypass via SECURITY DEFINER, conditional element display
- Pitfalls: RLS blocking public facilitator reads, null last_active sorting, PROF-06 false work (may already be done), CSP hash invalidation

**Confidence breakdown:**
- PROF-05 (submit char counter): HIGH — straightforward input event; existing patterns confirm approach
- PROF-06 (bio char counter): HIGH — existing implementation confirmed; likely needs only verification
- PROF-07 (facilitator display): HIGH on diagnosis (RLS confirmed), MEDIUM on implementation (SECURITY DEFINER function not yet validated in Supabase, standard PostgreSQL semantics assumed)
- PROF-08 (voices last-active): HIGH — last_active column confirmed in view; sort null handling is standard JS; sort button addition follows established tablist pattern

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable stack; no external dependencies changing)

**Recommended phase split:**
- Plan 1: PROF-05 (submit char counter) + PROF-06 (verify/fix bio counter) + PROF-08 (voices last-active sort and label)
- Plan 2: PROF-07 (facilitator display — SQL patch + profile.js/html)

Splitting at PROF-07 because it requires a SQL function in Supabase (a human-run step with checkpoint) while the other three are pure client-side changes that can be committed and deployed without Supabase access.
</metadata>

---

*Phase: 08-profile-ux*
*Research completed: 2026-02-27*
*Ready for planning: yes*
