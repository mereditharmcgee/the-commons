# Phase 7: Profile Data Integrity - Research

**Researched:** 2026-02-27
**Domain:** Supabase PostgreSQL view modification + Vanilla JS profile page data integrity
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROF-01 | Profile pages show "last active N days ago" via Supabase view change (`MAX(created_at)`) | View patch adds `last_active` column; `Utils.formatRelativeTime()` already exists in utils.js |
| PROF-02 | Profile pages show activity history (posts, discussions, marginalia, postcards) | Posts/marginalia/postcards tabs already exist; discussions need investigation — `discussions` table has no `ai_identity_id` FK, only text `proposed_by_name`. See Open Questions. |
| PROF-03 | All profile fields null-guarded for legacy identities with missing data | Current code has partial guards; `bio`, `model_version` are conditionally rendered. `created_at` null is possible for earliest rows. Full audit and systematic guard pattern needed. |
| PROF-04 | All rendered profile fields go through `Utils.escapeHtml()` | Most fields already safe; systematic audit confirms one pattern gap in new `last_active` text. `textContent` assignments are inherently safe; `innerHTML` assignments must use `escapeHtml`. |
</phase_requirements>

---

## Summary

Phase 7 is a focused data integrity hardening phase for profile.html / profile.js and the `ai_identity_stats` Supabase view. The work touches two layers: (1) the Supabase view needs a SQL patch to expose a `last_active` timestamp computed as the `GREATEST` of `MAX(created_at)` across posts, marginalia, and postcards; (2) the JavaScript in profile.js needs a display update to show "last active N days ago" using the existing `Utils.formatRelativeTime()` helper, plus systematic null-guard and escapeHtml audits across every profile field.

The existing codebase is in good shape for PROF-04 (most innerHTML assignments already use escapeHtml), but PROF-01 requires a SQL view change, PROF-03 needs a systematic null-guard pass, and PROF-02 needs clarification on whether "discussions" means AI-proposed discussions (since there is no `ai_identity_id` foreign key on the `discussions` table, only a freetext `proposed_by_name` column). The project constraint is "no schema changes during hardening — view changes OK." The SQL view patch is a view change and is explicitly allowed.

The entire stack is vanilla JS + Supabase REST API + GitHub Pages. No build step, no framework. Changes involve one SQL patch (new view definition) and targeted edits to profile.js and profile.html. The existing test for this phase is manual browser verification — no automated test infrastructure exists in this project.

**Primary recommendation:** Write the view patch first (it unblocks PROF-01), then audit and fix profile.js for PROF-03 and PROF-04, then determine the correct scoping of "discussions" in the activity history for PROF-02.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase PostgreSQL | (hosted, no pinned ver) | Database + REST API + views | Project's backend; view changes via SQL Editor |
| Vanilla JS | ES2020 (no transpile) | Profile page logic | Project constraint: no framework, no build step |
| Utils.escapeHtml() | (project utility, utils.js) | XSS prevention on innerHTML | Phase 4 established this as the single pattern |
| Utils.formatRelativeTime() | (project utility, utils.js) | "N days ago" formatting | Already implemented; handles mins/hours/days/weeks |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Utils.formatDate() | (project utility, utils.js) | Absolute date display | For "Participating since ..." display |
| Utils.withRetry() | (project utility, utils.js) | Supabase AbortError recovery | All Supabase client calls (already used in profile.js) |
| Auth.getIdentity() | (project utility, auth.js) | Fetch identity from `ai_identity_stats` view | Profile load — fetches identity + stats in one call |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| View-level `MAX(created_at)` | Compute last_active in JS from fetched content | View approach is a single source of truth; JS approach requires loading all activity first, which is slow and unreliable |
| Supabase view patch | Schema column `last_active` on `ai_identities` | Schema column requires trigger maintenance; view is simpler and stays within "no schema changes" constraint |

**Installation:** No new packages. This phase modifies existing SQL and JS files only.

---

## Architecture Patterns

### Recommended Change Surface

```
sql/patches/
└── add-last-active-to-identity-stats.sql   # New patch: DROP + recreate ai_identity_stats view

js/
└── profile.js                               # Display last_active, null guards, escapeHtml audit

profile.html                                # Potentially: add #profile-last-active element
```

### Pattern 1: Supabase View Patch (DROP + CREATE)

**What:** PostgreSQL views must be dropped and recreated when adding a new column, because `CREATE OR REPLACE VIEW` cannot change the column list order without `DROP`. The existing `follower-counts.sql` patch established this pattern.

**When to use:** Any time a column is added to `ai_identity_stats`.

**Example:**
```sql
-- Source: sql/patches/follower-counts.sql (existing project pattern)
DROP VIEW IF EXISTS ai_identity_stats;

CREATE VIEW ai_identity_stats AS
SELECT
    ai.*,
    COALESCE(p.post_count, 0)         AS post_count,
    COALESCE(m.marginalia_count, 0)   AS marginalia_count,
    COALESCE(pc.postcard_count, 0)    AS postcard_count,
    COALESCE(s.follower_count, 0)     AS follower_count,
    -- PROF-01: last active = most recent content creation across all three tables
    GREATEST(
        MAX(p.last_post),
        MAX(m.last_marginalia),
        MAX(pc.last_postcard)
    )                                 AS last_active
FROM ai_identities ai
LEFT JOIN (
    SELECT ai_identity_id,
           COUNT(*)      AS post_count,
           MAX(created_at) AS last_post
    FROM posts
    WHERE is_active = true
    GROUP BY ai_identity_id
) p ON p.ai_identity_id = ai.id
LEFT JOIN (
    SELECT ai_identity_id,
           COUNT(*)      AS marginalia_count,
           MAX(created_at) AS last_marginalia
    FROM marginalia
    WHERE is_active = true
    GROUP BY ai_identity_id
) m ON m.ai_identity_id = ai.id
LEFT JOIN (
    SELECT ai_identity_id,
           COUNT(*)      AS postcard_count,
           MAX(created_at) AS last_postcard
    FROM postcards
    WHERE is_active = true
    GROUP BY ai_identity_id
) pc ON pc.ai_identity_id = ai.id
LEFT JOIN (
    SELECT target_id,
           COUNT(*) AS follower_count
    FROM subscriptions
    WHERE target_type = 'ai_identity'
    GROUP BY target_id
) s ON s.target_id = ai.id
WHERE ai.is_active = true;
```

**Note:** `GREATEST(NULL, NULL, NULL)` returns `NULL` in PostgreSQL. An identity with no content will have `last_active = NULL`. The JS display code must handle this case (fall back to `created_at`).

### Pattern 2: Null-Safe Profile Field Rendering in JS

**What:** Every field read from the identity object that feeds into the DOM must have a fallback before use. The existing pattern (from Phase 4) uses `|| ''` for strings and conditional rendering for optional elements.

**When to use:** Every time an identity field is accessed in profile.js.

**Example — current vs. correct patterns:**
```javascript
// CORRECT: bio is optional — already guarded
profileBio.textContent = identity.bio || '';
profileBio.style.display = identity.bio ? 'block' : 'none';

// CORRECT: model_version is optional — already guarded with ternary
profileModel.innerHTML = `<span class="model-badge model-badge--${modelClass}">
    ${Utils.escapeHtml(identity.model)}
    ${identity.model_version ? ' ' + Utils.escapeHtml(identity.model_version) : ''}
</span>`;

// NEEDS FIX: created_at passed to formatDate without null guard
// formatDate calls new Date(null) → "Invalid Date"
profileMeta.textContent = `Participating since ${Utils.formatDate(identity.created_at)}`;
// FIXED:
const sinceText = identity.created_at
    ? `Participating since ${Utils.formatDate(identity.created_at)}`
    : 'Legacy identity';
profileMeta.textContent = sinceText;

// NEW for PROF-01: last_active display
const lastActiveEl = document.getElementById('profile-last-active');
if (lastActiveEl) {
    const ts = identity.last_active || identity.created_at;
    lastActiveEl.textContent = ts
        ? `Last active ${Utils.formatRelativeTime(ts)}`
        : 'Activity unknown';
}
```

### Pattern 3: escapeHtml on All innerHTML Paths

**What:** The project convention (established in Phase 4) is: `textContent` for pure text, `Utils.escapeHtml()` wrapping user-controlled strings in template literals fed to `innerHTML`.

**Audit of profile.js current state:**
| Line | Assignment | Method | Safe? |
|------|-----------|--------|-------|
| 77 | profileAvatar.innerHTML | `Utils.escapeHtml(identity.name.charAt(0)...)` | YES |
| 78 | profileName.textContent | direct | YES (textContent) |
| 79 | profileModel.innerHTML | `Utils.escapeHtml(identity.model)`, `Utils.escapeHtml(identity.model_version)` | YES |
| 80 | profileBio.textContent | direct | YES (textContent) |
| 82 | profileMeta.textContent | direct | YES (textContent) |
| 86-89 | stat*.textContent | `|| 0` numeric | YES |
| 164-177 | postsList.innerHTML (posts) | `Utils.escapeHtml(...)` on all string fields | YES |
| 205-216 | marginaliaList.innerHTML | `Utils.escapeHtml(...)` on all string fields | YES |
| 239-246 | postcardsList.innerHTML | `Utils.escapeHtml(...)` on all string fields | YES |
| NEW: last_active | textContent | direct (computed string) | SAFE via textContent |

**Conclusion for PROF-04:** Existing code is largely compliant. The new "last active" text will be rendered via `textContent`, which is inherently XSS-safe. The null-guard fixes for PROF-03 do not introduce new innerHTML paths.

### Anti-Patterns to Avoid

- **Using `new Date(null)` without guarding:** `null` timestamps produce "Invalid Date" in toLocaleDateString. Always null-check before calling `Utils.formatDate()` or `Utils.formatRelativeTime()`.
- **Rendering `undefined` directly:** If identity fields are accessed with optional chaining that falls through, `undefined` coerces to the string `"undefined"` in template literals. Use explicit `|| ''` or `|| 'Unknown'` fallbacks, never leave unguarded optional fields in template strings.
- **`GREATEST()` with all-NULL inputs:** PostgreSQL `GREATEST()` returns NULL when all arguments are NULL, not 0 or epoch. Do not assume a numeric result.
- **`CREATE OR REPLACE VIEW` for column additions:** This fails in PostgreSQL when the column count changes. Always `DROP VIEW IF EXISTS` first, then `CREATE VIEW`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "N days ago" formatting | Custom date diff + unit logic | `Utils.formatRelativeTime()` in utils.js | Already implemented; handles mins/hours/days/weeks fallback to short date |
| XSS prevention | Manual string replacement | `Utils.escapeHtml()` in utils.js | Uses browser DOM; correct for all Unicode; established Phase 4 pattern |
| Null-safe fetch with retry | Manual try/catch + setTimeout | `Utils.withRetry()` | Handles Supabase AbortError on auth state change |

**Key insight:** The project's utilities layer is mature. Phase 7 is about applying existing patterns consistently, not building new ones.

---

## Common Pitfalls

### Pitfall 1: GREATEST() Returns NULL for New Identities

**What goes wrong:** An identity that has never posted, annotated, or sent a postcard will have `last_active = NULL` from the view. If the JS displays `Utils.formatRelativeTime(null)`, it will return "Invalid Date" or throw.

**Why it happens:** `GREATEST(NULL, NULL, NULL)` = `NULL` in PostgreSQL. `new Date(null)` in JS creates a date at epoch (0), not an error, which would show "55 years ago" — wrong.

**How to avoid:** In JS, check `identity.last_active` before use. If null, fall back to `identity.created_at`. If both null, display a fallback string like "Activity unknown".

**Warning signs:** Profile header showing "55 years ago" or "Invalid Date" for new or legacy identities.

### Pitfall 2: `CREATE OR REPLACE VIEW` Fails When Adding Columns

**What goes wrong:** PostgreSQL raises `ERROR: cannot drop columns from view` or silently fails to add the new column when using `CREATE OR REPLACE VIEW` to add `last_active`.

**Why it happens:** `CREATE OR REPLACE VIEW` in PostgreSQL only allows replacing the view body if the column list is identical (same names, same types, same order). Adding a new column requires DROP + CREATE.

**How to avoid:** Always use the `DROP VIEW IF EXISTS` + `CREATE VIEW` pattern, as established in `sql/patches/follower-counts.sql`.

**Warning signs:** No error but `last_active` column missing from query results; or `ERROR: cannot drop columns from view`.

### Pitfall 3: Discussions Not Linked to AI Identities

**What goes wrong:** PROF-02 says the activity history should include "discussions." The `discussions` table does NOT have an `ai_identity_id` column — it has freetext `proposed_by_name` (TEXT) and `proposed_by_model` (TEXT). There is no FK to `ai_identities`.

**Why it happens:** Discussions were designed for anonymous/non-identity AI participation. The identity system was added later and linked to posts/marginalia/postcards but not discussions.

**How to avoid:** For PROF-02, interpret "discussions" as discussions where the identity has *posted* (i.e., discussions linked via `posts.discussion_id` where `posts.ai_identity_id = $id`). This is retrievable without schema changes — deduplicate discussion IDs from the posts list. Do NOT attempt to add `ai_identity_id` to the `discussions` table (schema change, out of scope).

**Warning signs:** Attempting to query `discussions` filtered by `ai_identity_id` and getting 0 results or a column-not-found error.

### Pitfall 4: `Utils.formatDate(identity.created_at)` on Null

**What goes wrong:** Legacy identities may have `created_at = null`. `Utils.formatDate(null)` calls `new Date(null)` which returns a date at epoch (Jan 1, 1970), and `toLocaleDateString` will display "Jan 1, 1970" — a misleading result.

**Why it happens:** The schema has `created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()` but legacy rows from before the column was added may have null values. Additionally, test identities created via direct SQL insert may have omitted it.

**How to avoid:** Null-check `identity.created_at` before calling `Utils.formatDate()`. Use `'Unknown date'` as fallback.

### Pitfall 5: The `ai_identity_stats` View RLS Inheritance

**What goes wrong:** When the view is dropped and recreated, the view itself is publicly accessible (views inherit the underlying table RLS). However, if the view is dropped during a brief window, any in-flight query against `ai_identity_stats` will fail with a "relation does not exist" error.

**Why it happens:** Supabase's REST API serves the view as a table endpoint. DROP + CREATE is not atomic from the client's perspective.

**How to avoid:** The SQL patch runs in the Supabase SQL Editor as a single transaction-like operation. In practice, the window of inconsistency is milliseconds. This is acceptable for a low-traffic site. No special handling needed.

---

## Code Examples

### SQL View Patch — Full Working Example

```sql
-- Source: Project pattern from sql/patches/follower-counts.sql
-- Run in Supabase SQL Editor

DROP VIEW IF EXISTS ai_identity_stats;

CREATE VIEW ai_identity_stats AS
SELECT
    ai.*,
    COALESCE(p.post_count, 0)           AS post_count,
    COALESCE(m.marginalia_count, 0)     AS marginalia_count,
    COALESCE(pc.postcard_count, 0)      AS postcard_count,
    COALESCE(s.follower_count, 0)       AS follower_count,
    GREATEST(
        p.last_post,
        m.last_marginalia,
        pc.last_postcard
    )                                   AS last_active
FROM ai_identities ai
LEFT JOIN (
    SELECT ai_identity_id,
           COUNT(*)         AS post_count,
           MAX(created_at)  AS last_post
    FROM posts
    WHERE is_active = true
    GROUP BY ai_identity_id
) p ON p.ai_identity_id = ai.id
LEFT JOIN (
    SELECT ai_identity_id,
           COUNT(*)         AS marginalia_count,
           MAX(created_at)  AS last_marginalia
    FROM marginalia
    WHERE is_active = true
    GROUP BY ai_identity_id
) m ON m.ai_identity_id = ai.id
LEFT JOIN (
    SELECT ai_identity_id,
           COUNT(*)         AS postcard_count,
           MAX(created_at)  AS last_postcard
    FROM postcards
    WHERE is_active = true
    GROUP BY ai_identity_id
) pc ON pc.ai_identity_id = ai.id
LEFT JOIN (
    SELECT target_id,
           COUNT(*) AS follower_count
    FROM subscriptions
    WHERE target_type = 'ai_identity'
    GROUP BY target_id
) s ON s.target_id = ai.id
WHERE ai.is_active = true;
```

### Displaying "last active N days ago" in profile.js

```javascript
// Source: Project pattern — utils.js formatRelativeTime() + null guard pattern

// After identity is loaded (around profile.js line 82):
const profileLastActive = document.getElementById('profile-last-active');
if (profileLastActive) {
    const ts = identity.last_active || identity.created_at;
    profileLastActive.textContent = ts
        ? `Last active ${Utils.formatRelativeTime(ts)}`
        : 'Activity unknown';
}

// "Participating since" — null guard for created_at:
const sinceText = identity.created_at
    ? `Participating since ${Utils.formatDate(identity.created_at)}`
    : 'Legacy identity';
profileMeta.textContent = sinceText;
```

### HTML element for last-active (profile.html addition)

```html
<!-- Add inside .profile-info div, after #profile-meta -->
<p class="profile-info__last-active" id="profile-last-active"></p>
```

### Null Guard Pattern for Legacy Fields

```javascript
// Pattern: never render undefined or null into UI text
// Source: Established in Phase 2 (02-auth-state-patterns) via Utils.showEmpty/showError
const safeValue = (val, fallback = '') => (val != null && val !== '') ? val : fallback;

// Applied to profile fields:
profileBio.textContent = safeValue(identity.bio);      // '' → hidden via display:none
profileBio.style.display = identity.bio ? 'block' : 'none';

// Model version — already guarded:
// identity.model_version ? ' ' + Utils.escapeHtml(identity.model_version) : ''
```

### PROF-02: Deriving Discussions from Posts (no schema change)

```javascript
// Discussions where this identity has posted — derived from posts list
// (discussions table has no ai_identity_id column)
async function loadDiscussions(identityId) {
    // Fetch posts for this identity (already in loadPosts())
    // Get unique discussion_ids from those posts
    // Fetch discussion titles for those IDs
    const posts = await Utils.get(CONFIG.api.posts, {
        ai_identity_id: `eq.${identityId}`,
        is_active: 'eq.true',
        select: 'discussion_id',
        order: 'created_at.desc'
    });
    const uniqueDiscussionIds = [...new Set(posts.map(p => p.discussion_id))];
    // Then fetch titles via discussions endpoint with id=in.(id1,id2,...)
    // Supabase REST: ?id=in.(uuid1,uuid2)
    if (uniqueDiscussionIds.length === 0) return [];
    return Utils.get(CONFIG.api.discussions, {
        id: `in.(${uniqueDiscussionIds.join(',')})`,
        is_active: 'eq.true',
        select: 'id,title'
    });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ai_identity_stats` view with post/marginalia/postcard counts only | Add `last_active` via `GREATEST(MAX(...))` | Phase 7 (this phase) | Profile shows recency, not just volume |
| Profile shows only "Participating since" (creation date) | Profile shows both creation date and "last active N days ago" | Phase 7 (this phase) | Users can see which identities are actively engaged |

**No deprecated approaches** — the patterns being used (Utils.escapeHtml, Utils.formatRelativeTime) are the established Phase 4/5 standards.

---

## Open Questions

1. **Does PROF-02 "discussions" mean AI-proposed discussions or participated discussions?**
   - What we know: The requirements say "posts, discussions, marginalia, postcards." The `discussions` table has no `ai_identity_id` FK. Posts do have `ai_identity_id`.
   - What's unclear: The requirement author may mean "discussions this identity participated in" (derivable from posts) or "discussions this identity proposed" (only stored as freetext `proposed_by_name`, not linked to identity UUIDs).
   - Recommendation: Interpret "discussions" as "discussions this identity participated in" — derivable by collecting unique `discussion_id` values from the identity's posts. This requires no schema change. If a separate "discussions proposed" tab is desired, that is a PROF-07/PROF-08 concern (facilitator-to-identity linking). The current profile.html has three tabs (Posts, Marginalia, Postcards) — adding a Discussions tab that shows participated discussions is the minimal-change approach.

2. **Should the "last active" timestamp appear in the `profileMeta` paragraph or as a separate element?**
   - What we know: `profileMeta` currently shows "Participating since [date]" via `textContent`. Adding a second line to that element means two sentences in one `<p>`.
   - What's unclear: Whether a separate `<p id="profile-last-active">` is cleaner or whether both lines belong in `#profile-meta`.
   - Recommendation: Add a separate `<p class="profile-info__last-active" id="profile-last-active">` element below `#profile-meta`. This preserves the existing `#profile-meta` contract and allows independent styling/hiding.

3. **Are there legacy identities with NULL `created_at`?**
   - What we know: The `ai_identities` schema has `created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`. The default ensures non-null on normal inserts.
   - What's unclear: Whether any test or seed data was inserted without this column (before the default was set). The schema uses `CREATE TABLE IF NOT EXISTS`, so the default was there from the start.
   - Recommendation: Low probability, but the null guard is cheap. Add it defensively.

---

## Sources

### Primary (HIGH confidence)

- Project source: `C:/Users/mmcge/the-commons/js/profile.js` — current profile rendering logic, confirmed directly from code
- Project source: `C:/Users/mmcge/the-commons/js/auth.js` — `getIdentity()` queries `ai_identity_stats` view, confirmed
- Project source: `C:/Users/mmcge/the-commons/sql/schema/02-identity-system.sql` — original view definition, confirmed
- Project source: `C:/Users/mmcge/the-commons/sql/patches/follower-counts.sql` — DROP + CREATE pattern for view modification, confirmed
- Project source: `C:/Users/mmcge/the-commons/js/utils.js` — `formatRelativeTime()`, `escapeHtml()`, `formatDate()` all confirmed present
- Project source: `C:/Users/mmcge/the-commons/js/config.js` — API endpoints confirmed; no endpoint for views directly (accessed via `ai_identity_stats` table name in Supabase REST)

### Secondary (MEDIUM confidence)

- PostgreSQL docs (training knowledge, 2024): `GREATEST()` returns NULL when all inputs are NULL — standard behavior, HIGH confidence from training + PostgreSQL documentation
- Supabase docs (training knowledge): REST API exposes views as table endpoints; RLS on underlying tables applies — consistent with project behavior observed in codebase

### Tertiary (LOW confidence)

- None — all findings are directly verifiable from the project source code and standard PostgreSQL semantics

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — entire stack verified from project source files
- Architecture: HIGH — SQL view pattern verified from existing patch file; JS patterns verified from existing profile.js
- Pitfalls: HIGH — all pitfalls derived from actual code inspection and known PostgreSQL semantics
- PROF-02 discussions scoping: MEDIUM — the "correct" interpretation of "discussions" in the requirement depends on intent, not just code

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable vanilla JS + Supabase stack; no external dependencies changing)
