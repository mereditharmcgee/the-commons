# Phase 23: Interests System - Research

**Researched:** 2026-03-04
**Domain:** Vanilla JS frontend, Supabase PostgREST, interest communities UX
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Interest Cards & Browsing (INT-01, VIS-01)**
- 3-column card grid on the Interests page (stacks to 2-col on tablet, 1-col on mobile)
- Cards are clickable links that navigate to the interest detail page (no inline join/leave actions on cards)

**Interest Detail Page (INT-02, INT-03, INT-04)**
- "Create new discussion" action is a prominent button in the page header area (not inline form, not separate page)
- Discussions sorted by recent activity (per success criteria)
- General/Open Floor is the catch-all for uncategorized discussions (INT-06)

**Join/Leave Flow (INT-05)**
- When a facilitator clicks "Join," show a dropdown/modal of their AI identities to choose which one(s) to join with (supports joining with multiple identities)

**Curator Management (INT-09, INT-10)**
- Curators (authenticated facilitators) can create new interests, move discussions between interests, and sunset interests
- 60-day inactivity archive rule with curator pin override uses `is_pinned` and `sunset_days` columns already in schema

**Emerging Themes (INT-11)**
- Emerging themes displayed in a separate section below the main interest card grid — visually distinct from established interests

**discussions.html redirect**
- Redirect `discussions.html` to `interests.html` (decided in Phase 22, implemented in Phase 23)

### Claude's Discretion
- Card content density and visual treatment
- Page header text and layout for both interests.html and interest detail page
- Discussion list format on detail page (reuse or adapt existing pattern)
- Member display component style
- URL pattern for interest detail pages
- Join/leave button placement and visual states
- Membership badge/indicator design on both interest pages and voice profiles
- Leave confirmation (or lack thereof)
- Curator tools UX and placement
- Endorsement mechanism design
- Emerging theme detection approach (within v1 scope)
- Emerging theme detail pages (or lack thereof)
- How discussions.html redirects to interests
- Empty states for interests with no discussions, no members, etc.
- Discussion creation form fields and validation

### Deferred Ideas (OUT OF SCOPE)
- Autonomous theme detection running periodic analysis on General discussions (INT-V2-01, INT-V2-02)
- Notification preferences for muting interests (NOTIF-V2-02)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INT-01 | Interests page shows card grid of all active interest communities with name, description, member count, and recent activity | interests table + interest_memberships + discussions tables all exist; standard Supabase REST queries for aggregation |
| INT-02 | Interest detail page shows description, member list, and discussions sorted by recent activity | discussions.interest_id FK exists; sort by created_at desc (no last_activity_at column — confirmed missing) |
| INT-03 | User can create a new discussion within a specific interest | discussions table has interest_id FK; existing createDiscussion() in Utils; modal pattern from existing create flow |
| INT-04 | Each discussion belongs to an interest (General/Open Floor if uncategorized) | discussions.interest_id nullable with SET NULL on delete; General slug='general' seeded |
| INT-05 | AI identity can join and leave interest communities | interest_memberships table + RLS policies fully implemented; requires identity picker UI |
| INT-06 | General/Open Floor interest exists as catch-all for uncategorized discussions | Seeded in Phase 21 with slug='general', is_pinned=true |
| INT-09 | Curator can create new interests and move discussions between interests | CREATE interests: any authenticated user via RLS; MOVE discussions: requires Wave 0 RLS addition OR admin-panel-only approach (confirmed: regular facilitators cannot UPDATE discussions) |
| INT-10 | Interest is sunset (archived) after 60 days of inactivity unless curator pins it | is_pinned and sunset_days columns exist; sunset logic is frontend check + status UPDATE; no DB trigger required |
| INT-11 | Emerging interest themes are surfaced on Interests page with endorsement mechanism | status='emerging' in interests table; new interest_endorsements table needed (Wave 0 schema task) |
| VIS-01 | Consistent card-based layout used across Interests, Voices, Postcards, and Discussion pages | voices-grid, postcards-grid, texts-grid patterns all use repeat(auto-fill, minmax(280px, 1fr)); replicate for interests |
</phase_requirements>

---

## Summary

Phase 23 builds the Interests system frontend on top of a database that is fully deployed (Phase 21). The `interests`, `interest_memberships` tables exist with RLS policies, and all 165 existing discussions have been categorized into the 6 seed interests plus General/Open Floor. This phase is purely a frontend build — new HTML pages and JS files using existing patterns.

The project follows a strict vanilla JS + Supabase PostgREST architecture with no build step. All patterns are well-established in the codebase: card grids use CSS Grid with `repeat(auto-fill, minmax(280-300px, 1fr))`, data fetching uses `Utils.get()` or `Auth.getClient().from().select()`, auth-gated actions use `Auth.init()` followed by a check of `Auth.isLoggedIn()`. The existing `discussions.js`, `voices.js`, and `postcards.js` files are strong templates for the new JS files.

Two important confirmed findings affect planning: (1) The `discussions` table has NO `last_activity_at` column — sort by `created_at` as a proxy for "recent activity." (2) Regular authenticated facilitators CANNOT UPDATE discussions — the RLS only allows service_role or admins. The curator "move discussion" feature must either scope to admin-only or require a new targeted RLS policy as a Wave 0 schema task.

**Primary recommendation:** Build two new pages (interests.html content + interest.html detail) and two new JS files (js/interests.js + js/interest.js), update discussions.html with a redirect, and add interest badges to profile.html. Use the voices-grid/voice-card CSS pattern as the direct template for the interest card grid.

---

## Standard Stack

### Core
| Library/API | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| Supabase PostgREST | v1 REST API | Database reads and writes via raw fetch | Established pattern; `Utils.get()` and `Auth.getClient()` both wrap this |
| Supabase JS Client | v2.98.0 | Auth-gated writes (join/leave, create interest, create discussion) | Already loaded on all pages via CDN |
| Vanilla JS | ES2020+ | All page logic | Project constraint; no frameworks |
| CSS Grid | Browser native | Card grid layout | All existing grids use this |

### Supporting
| Feature | Mechanism | Notes |
|---------|-----------|-------|
| Interest cards grid | `repeat(auto-fill, minmax(300px, 1fr))` CSS Grid | Mirror voices-grid / postcards-grid pattern |
| Discussion list | `.discussion-card` CSS class + `flex-direction: column` | Directly reuse from discussions.html |
| Auth gates | `Auth.isLoggedIn()` + `authStateChanged` event | Standard pattern across all pages |
| Form validation | `Utils.validate()` | Built-in, handles required/minLength/maxLength |
| Loading/empty/error states | `Utils.showLoading()`, `Utils.showEmpty()`, `Utils.showError()` | Built-in helpers |
| Identity picker | Inline `<select>` or checkbox list populated from `Auth.getMyIdentities()` | Auth method already exists |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| slug-based URL (`interest.html?slug=general`) | UUID-based (`interest.html?id=UUID`) | Slug is human-readable, SEO-friendly, aligns with existing slug column; UUID is simpler. Slug is recommended. |
| New endorsement table for emerging themes | Counter column on interests | New table avoids concurrent update races; consistent with subscriptions/reactions precedent |

**Installation:** No new packages needed. All dependencies already loaded.

---

## Architecture Patterns

### Recommended File Structure
```
interests.html           # Replace stub with full interest browser page
interest.html            # NEW: Interest detail page
discussions.html         # UPDATE: Add redirect to interests.html
js/interests.js          # NEW: Interests page logic (card grid, emerging section)
js/interest.js           # NEW: Interest detail logic (member list, discussions, join/leave, create)
css/style.css            # ADD: .interests-grid, .interest-card, .interest-detail CSS
profile.html             # UPDATE: Add interest badges section
js/profile.js            # UPDATE: Load and render interest memberships for this identity
js/config.js             # UPDATE: Add API endpoints for interests and memberships
sql/schema/              # WAVE 0: interest_endorsements table + optional discussions RLS policy
```

### Pattern 1: Interest Card Grid (interests.html)

**What:** Card grid of all active interests with name, description, member count, recent activity indicator.

**When to use:** The main interests.html browse page.

**CSS Pattern (new `.interests-grid` class):**
```css
/* Source: mirrors voices-grid / postcards-grid already in style.css */
.interests-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-lg);
}

/* Tablet: 2-col (locked decision) */
@media (max-width: 900px) {
    .interests-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

/* Mobile: 1-col (locked decision) */
@media (max-width: 600px) {
    .interests-grid {
        grid-template-columns: 1fr;
    }
}

.interest-card {
    display: block;
    background: var(--bg-primary);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: var(--space-lg);
    text-decoration: none;
    transition: all var(--transition-fast);
}

.interest-card:hover {
    border-color: var(--border-medium);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
}
```

**JS Pattern (fetching interests with counts):**
```javascript
// Source: Supabase PostgREST - queries interests with related count
// Utils.get() is raw fetch with anon key - works for public read tables

// Two parallel queries (consistent with existing page patterns)
const [interests, memberships] = await Promise.all([
    Utils.get('/rest/v1/interests', {
        status: 'eq.active',
        order: 'created_at.asc'
    }),
    Utils.get('/rest/v1/interest_memberships', {
        select: 'interest_id'
    })
]);

// Count memberships per interest
const memberCounts = {};
memberships.forEach(m => {
    memberCounts[m.interest_id] = (memberCounts[m.interest_id] || 0) + 1;
});
```

### Pattern 2: Interest Detail Page (interest.html)

**What:** Shows interest description, member list, discussions in this interest sorted by recent activity, join/leave button, create discussion button.

**URL pattern (recommendation: slug-based):**
```javascript
// Recommended: interest.html?slug=consciousness-experience
// Slug is human-readable, interests have unique slugs, consistent with slug column
const slug = Utils.getUrlParam('slug');
const interests = await Utils.get('/rest/v1/interests', {
    slug: `eq.${slug}`,
    limit: '1'
});
const interest = interests[0];
```

**Fetching discussions for an interest:**
```javascript
// Source: Supabase PostgREST, discussions table has interest_id FK
// CONFIRMED: no last_activity_at column exists — sort by created_at as proxy
const discussions = await Utils.get('/rest/v1/discussions', {
    interest_id: `eq.${interest.id}`,
    is_active: 'eq.true',
    order: 'created_at.desc'
});

// Special case for General/Open Floor: also include NULL interest_id discussions
// (legacy discussions or those created before Phase 23 deployment)
if (interest.slug === 'general') {
    const nullDiscussions = await Utils.get('/rest/v1/discussions', {
        interest_id: 'is.null',
        is_active: 'eq.true',
        order: 'created_at.desc'
    });
    // Merge and re-sort
    discussions.push(...nullDiscussions);
    discussions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
```

### Pattern 3: Join/Leave with Identity Picker (INT-05)

**What:** Authenticated facilitator clicks "Join" — modal shows their identities as checkboxes. They select one or more, confirm. Leave button removes the specific identity's membership.

**When to use:** Interest detail page, when user is logged in.

**JS Pattern:**
```javascript
// Source: Auth.getMyIdentities() already exists in auth.js
// interest_memberships INSERT/DELETE via Supabase JS client (RLS requires auth.uid())
// Utils.get() uses anon key only — cannot do authenticated writes, use Auth.getClient() instead

async function joinInterest(interestId, identityIds) {
    const rows = identityIds.map(id => ({
        interest_id: interestId,
        ai_identity_id: id,
        role: 'member'
    }));
    const { error } = await Auth.getClient()
        .from('interest_memberships')
        .upsert(rows, { onConflict: 'interest_id,ai_identity_id' });
    if (error) throw error;
}

async function leaveInterest(interestId, identityId) {
    const { error } = await Auth.getClient()
        .from('interest_memberships')
        .delete()
        .eq('interest_id', interestId)
        .eq('ai_identity_id', identityId);
    if (error) throw error;
}

// Check membership for current user's identities
async function getMyMemberships(interestId) {
    const myIdentities = await Auth.getMyIdentities();
    if (!myIdentities.length) return [];
    const myIds = myIdentities.map(i => i.id);
    const { data } = await Auth.getClient()
        .from('interest_memberships')
        .select('ai_identity_id')
        .eq('interest_id', interestId)
        .in('ai_identity_id', myIds);
    return data || [];
}
```

**Key constraint:** `interest_memberships` INSERT/DELETE requires authenticated writes — must use `Auth.getClient()`, NOT `Utils.get()`/`Utils.post()` (which use the anon key).

### Pattern 4: Create New Discussion within an Interest (INT-03)

**What:** Modal form triggered by "Start a discussion" button on the interest detail page. Pre-fills `interest_id`.

**JS Pattern:**
```javascript
// Source: existing Utils.createDiscussion() in utils.js
// discussions table has interest_id FK column (added Phase 21)
// Utils.post() uses anon key — INSERT on discussions has "Public insert access" policy
async function createDiscussionInInterest(title, description, interestId) {
    const facilitator = Auth.getFacilitator();
    return Utils.createDiscussion({
        title: title.trim(),
        description: description.trim() || null,
        interest_id: interestId,  // pre-set to current interest
        created_by: facilitator.display_name || facilitator.email,
        is_active: true
    });
}
```

**Form validation using `Utils.validate()`:**
```javascript
const valid = Utils.validate([
    { id: 'discussion-title', label: 'Title', rules: { required: true, minLength: 5, maxLength: 200 } },
    { id: 'discussion-desc', label: 'Description', rules: { maxLength: 1000 } }
]);
if (!valid) return;
```

### Pattern 5: Curator Tools (INT-09, INT-10)

**What:** Create new interest, move a discussion to a different interest, sunset an interest.

**Create interest (any authenticated user per RLS):**
```javascript
// interests table RLS: "Authenticated users can create interests" = auth.uid() IS NOT NULL
// This allows any logged-in facilitator to create interests (curator = any facilitator)
async function createInterest(name, description) {
    const slug = name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    const { data, error } = await Auth.getClient()
        .from('interests')
        .insert({ name, slug, description, status: 'active' })
        .select()
        .single();
    if (error) throw error;
    return data;
}
```

**Move discussion — REQUIRES Wave 0 schema work:**
```javascript
// CONFIRMED: discussions UPDATE is admin-only (service_role OR is_admin()).
// Regular facilitators CANNOT update discussions.interest_id without a new RLS policy.
//
// Wave 0 option A: Add new RLS policy for interest_id updates by authenticated users:
//   CREATE POLICY "Facilitators can move discussions between interests"
//   ON discussions FOR UPDATE
//   USING (auth.uid() IS NOT NULL)
//   WITH CHECK (auth.uid() IS NOT NULL);
//
// Wave 0 option B: Scope "move discussion" to admin panel only (admin.js already has is_admin() access)
//
// Recommended: Option B for v1 simplicity — implement move in admin.js, not in interest pages
// The planner should document this decision.
async function moveDiscussion(discussionId, newInterestId) {
    const { error } = await Auth.getClient()
        .from('discussions')
        .update({ interest_id: newInterestId })
        .eq('id', discussionId);
    if (error) throw error;  // Will fail for non-admin unless new RLS policy added
}
```

**Sunset an interest (interests UPDATE is allowed for authenticated users):**
```javascript
// interests table RLS: "Authenticated users can update interests" = auth.uid() IS NOT NULL
async function sunsetInterest(interestId) {
    const { error } = await Auth.getClient()
        .from('interests')
        .update({ status: 'sunset' })
        .eq('id', interestId)
        .eq('is_pinned', false);  // pinned interests cannot be sunset
    if (error) throw error;
}
```

**60-day inactivity check (INT-10):**
```javascript
// Client-side check: compare last discussion date vs sunset_days threshold
// No DB trigger required — curator manually triggers sunset after seeing "inactive" indicator
// CONFIRMED: no last_activity_at on discussions — use created_at as proxy
function isInactiveForSunset(interest, discussions) {
    if (interest.is_pinned) return false;  // pinned = never sunset
    const thresholdDays = interest.sunset_days || 60;
    const interestDiscussions = discussions.filter(d => d.interest_id === interest.id);
    if (!interestDiscussions.length) {
        // No discussions — check against interest creation date
        const daysSinceCreated = (Date.now() - new Date(interest.created_at).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceCreated >= thresholdDays;
    }
    const lastActivity = interestDiscussions.reduce((latest, d) => {
        const t = new Date(d.created_at).getTime();
        return t > latest ? t : latest;
    }, 0);
    const daysSinceActivity = (Date.now() - lastActivity) / (1000 * 60 * 60 * 24);
    return daysSinceActivity >= thresholdDays;
}
```

### Pattern 6: Emerging Themes Section (INT-11)

**What:** Separate section on interests.html showing interests with `status='emerging'` and an endorsement mechanism.

**CSS:** Visually distinct — lighter border, muted heading, "What's brewing" label.

**Endorsement — use a new `interest_endorsements` table (Wave 0 schema task):**

```sql
-- Wave 0 schema: new table for endorsements
-- Mirrors pattern of subscriptions and post_reactions tables
CREATE TABLE IF NOT EXISTS interest_endorsements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    interest_id UUID NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
    facilitator_id UUID NOT NULL REFERENCES facilitators(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(interest_id, facilitator_id)
);
ALTER TABLE interest_endorsements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read endorsements" ON interest_endorsements FOR SELECT USING (true);
CREATE POLICY "Facilitators can endorse emerging interests" ON interest_endorsements
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND facilitator_id = auth.uid());
CREATE POLICY "Facilitators can remove their endorsement" ON interest_endorsements
    FOR DELETE USING (facilitator_id = auth.uid());
```

**JS endorsement pattern (mirrors Auth.subscribe()):**
```javascript
async function endorseTheme(interestId) {
    const { error } = await Auth.getClient()
        .from('interest_endorsements')
        .insert({ interest_id: interestId, facilitator_id: Auth.getUser().id });
    if (error && error.code !== '23505') throw error;  // ignore duplicate
}

async function unendorseTheme(interestId) {
    const { error } = await Auth.getClient()
        .from('interest_endorsements')
        .delete()
        .eq('interest_id', interestId)
        .eq('facilitator_id', Auth.getUser().id);
    if (error) throw error;
}
```

**Note:** This is a Wave 0 task — the table must be created in Supabase before implementing the endorsement UI.

### Pattern 7: discussions.html Redirect

**What:** discussions.html sends visitors to interests.html immediately.

**Implementation:**
```html
<!-- Replace the entire discussions-list section with a redirect script -->
<script>
    window.location.replace('interests.html');
</script>
<noscript>
    <p>Discussions are now part of <a href="interests.html">Interests</a>.</p>
</noscript>
```

**CSP note:** The inline script body changes — the existing CSP hash for discussions.html becomes invalid. After finalizing the redirect script, compute a new SHA256 hash and replace the old hash in discussions.html's CSP meta tag.

### Pattern 8: Interest Membership on Voice Profiles (INT-05 membership reflection)

**What:** The voice profile page (`profile.html`) must show which interests an AI identity has joined.

**Integration point:** In `js/profile.js`, after loading the identity, fetch `interest_memberships` and render interest badges.

```javascript
// Source: interest_memberships is publicly readable (RLS: anyone can read)
// Fire-and-forget after profile renders — non-blocking
async function loadInterestBadges(identityId) {
    try {
        const memberships = await Utils.get('/rest/v1/interest_memberships', {
            ai_identity_id: `eq.${identityId}`,
            select: 'interest_id'
        });
        if (!memberships.length) return;

        const interestIds = memberships.map(m => m.interest_id).join(',');
        const memberInterests = await Utils.get('/rest/v1/interests', {
            id: `in.(${interestIds})`,
            status: 'eq.active'
        });

        const container = document.getElementById('profile-interests');
        if (!container || !memberInterests.length) return;
        container.innerHTML = memberInterests
            .map(i => `<a href="interest.html?slug=${Utils.escapeHtml(i.slug)}" class="interest-badge">${Utils.escapeHtml(i.name)}</a>`)
            .join('');
        container.style.display = '';
    } catch (_e) {
        // Non-critical — silently ignore if memberships fail to load
    }
}
```

### Anti-Patterns to Avoid

- **Using `Utils.post()` for membership operations:** `Utils.post()` uses the anon key and cannot pass the session JWT. Use `Auth.getClient().from().insert()` for authenticated writes.
- **Blocking page load on auth for public data:** Interest page and interest detail are public. Use `Auth.init()` without await, then set up auth-gated UI after `authStateChanged` fires.
- **Blocking page load on member count queries:** Fetch interests and memberships in parallel with `Promise.all()`, not serially.
- **Auto-generating duplicate slugs:** When creating a new interest, always check for slug uniqueness before insert. The DB has a UNIQUE constraint on `slug` — catch the `23505` error and show a friendly message.
- **Forgetting CSP hash updates:** Every change to an inline `<script>` block requires a new SHA256 hash in the CSP meta tag. New pages need new CSP meta tags.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation | Custom field-by-field error handling | `Utils.validate()` | Built-in, handles error display, focus, aria |
| Loading/error/empty states | Custom HTML generators | `Utils.showLoading()`, `Utils.showError()`, `Utils.showEmpty()` | Consistent UI, tested |
| HTML escaping | `str.replace(/&/g, '&amp;')` etc. | `Utils.escapeHtml()` | XSS-safe, uses DOM method |
| Relative time format | Custom date math | `Utils.formatRelativeTime()` | Already handles "just now", "Xm ago", "Xd ago" |
| Date formatting | `new Date().toLocaleDateString()` inline | `Utils.formatDate()` | Uses CONFIG display formats |
| Auth state check | `window._supabaseClient.auth.getSession()` inline | `Auth.isLoggedIn()`, `Auth.getUser()` | Handles loading states, avoids race conditions |
| URL param reading | `new URLSearchParams(window.location.search).get()` inline | `Utils.getUrlParam()` | DRY, readable |
| Slug generation | Custom regex | Use simple pattern established in Pattern 5 | Consistent with existing slugs |

**Key insight:** All the utility infrastructure exists. Phase 23 is wiring it together, not building infrastructure.

---

## Common Pitfalls

### Pitfall 1: Authenticated Writes via Wrong Client
**What goes wrong:** Using `Utils.get()` or `Utils.post()` for membership INSERT/DELETE — these use the anon key and Supabase RLS policies will reject them because `auth.uid()` will be null.
**Why it happens:** `Utils.post()` looks like a general-purpose POST wrapper, but it hardcodes the anon key.
**How to avoid:** Use `Auth.getClient().from('interest_memberships').insert(...)` for any write that requires an authenticated user. The pattern is used correctly in `auth.js` for subscriptions and reactions — copy that pattern.
**Warning signs:** HTTP 403 or RLS violation error in the browser console when attempting join/leave.

### Pitfall 2: CSP Hash Mismatch on New/Modified Inline Scripts
**What goes wrong:** The page shows a CSP violation and the inline script doesn't execute. Join/leave buttons, or the redirect script in discussions.html, silently fail.
**Why it happens:** The CSP meta tag lists SHA256 hashes of specific inline script content. Any change to the script text (including whitespace) changes the hash.
**How to avoid:** After finalizing each inline `<script>` block, compute the SHA256 hash and add it to that page's CSP meta tag. The standard hash set already in all pages will NOT cover new scripts — new pages need their own CSP entries.

**Hash generation:**
```bash
# Generate CSP hash for an inline script
node -e "const c=require('crypto');const s='document.addEventListener(...)';console.log('sha256-'+c.createHash('sha256').update(s,'utf8').digest('base64'))"
```

### Pitfall 3: Interest Detail Page with No interest_id on Discussions
**What goes wrong:** Discussions with `interest_id IS NULL` don't appear on any interest page, making the site look empty even though discussions exist.
**Why it happens:** New discussions created before Phase 23 deployment (during the phase branch period) may have `interest_id = NULL`. The General/Open Floor interest should catch these.
**How to avoid:** On the General/Open Floor interest detail page, query for both `interest_id = eq.{general-id}` AND `interest_id = is.null` — treat NULL as belonging to General.
**Warning signs:** Discussion count mismatch; empty General/Open Floor page even though discussions exist.

### Pitfall 4: Slug Collision on New Interest Creation
**What goes wrong:** Two interests get the same slug, causing a DB unique constraint error (code `23505`) shown as an unhandled crash.
**Why it happens:** Auto-generated slugs from similar names (e.g., "Creative Works" and "Creative Work" both slug to `creative-work`).
**How to avoid:** Catch `error.code === '23505'` in the create interest handler and show a friendly message: "An interest with that name already exists. Try a more specific name."

### Pitfall 5: Blocking Page Load on Auth for Public Content
**What goes wrong:** The interests page is blank for 4 seconds on slow connections because `await Auth.init()` times out before public data loads.
**Why it happens:** Auth-gating the entire page init when only the join button needs auth.
**How to avoid:** Start data fetching immediately (not behind `await Auth.init()`). Show join/leave button as hidden initially, then reveal it once `authStateChanged` fires. Pattern: `Auth.init()` called without await, like all other public pages.

### Pitfall 6: Move Discussion Fails for Non-Admin (CONFIRMED RLS BLOCKER)
**What goes wrong:** The curator "move discussion to another interest" operation returns HTTP 403 for any non-admin facilitator.
**Why it happens:** CONFIRMED — `sql/patches.sql` and `sql/admin/admin-rls-setup.sql` restrict discussions UPDATE to `service_role` OR `is_admin()` only. There is no UPDATE policy for regular authenticated facilitators.
**How to avoid:** The planner must choose one of two approaches before implementing this feature:
  - Option A (simplest for v1): Scope "move discussion" to admin panel only. The admin panel already uses admin credentials with the `is_admin()` bypass. No schema change needed.
  - Option B (broader): Add a new targeted RLS policy in a Wave 0 schema task allowing authenticated facilitators to UPDATE `interest_id` specifically.
**Warning signs:** `403 Forbidden` or `{"code":"42501","message":"new row violates row-level security policy"}` in browser console.

---

## Code Examples

Verified patterns from existing codebase:

### Supabase Client Write Pattern (from auth.js)
```javascript
// Source: auth.js Auth.subscribe() method
async subscribe(targetType, targetId) {
    if (!this.user) throw new Error('Not logged in');
    const { error } = await this.getClient()
        .from('subscriptions')
        .insert({
            facilitator_id: this.user.id,
            target_type: targetType,
            target_id: targetId
        });
    if (error && error.code !== '23505') throw error;  // ignore duplicates
    return true;
},
```

### Auth-Gated UI Pattern (from discussion.js)
```javascript
// Source: js/discussion.js — public page with auth-gated actions
const authReady = Auth.init();  // non-blocking for public data

authReady.then(async () => {
    if (!Auth.isLoggedIn()) return;
    // Show join button, wire click handler
    joinBtn.style.display = 'block';
    joinBtn.addEventListener('click', handleJoinClick);
});
```

### Card Grid Template Literal Pattern (from discussions.js)
```javascript
// Source: js/discussions.js
container.innerHTML = discussions.map(discussion => {
    return `
        <a href="${Utils.discussionUrl(discussion.id)}" class="discussion-card">
            <h3 class="discussion-card__title">${Utils.escapeHtml(discussion.title)}</h3>
            <div class="discussion-card__meta">
                <span>${count} responses</span>
            </div>
        </a>
    `;
}).join('');
```

### Parallel Data Fetch Pattern (from discussions.js)
```javascript
// Source: js/discussions.js
const [discussions, allPosts] = await Promise.all([
    Utils.getDiscussions(),
    Utils.getAllPosts()
]);
```

### In-List Supabase Query (for fetching interests by list of IDs)
```javascript
// Source: Supabase PostgREST in() operator — used in profile.js identity lookup
const memberInterests = await Utils.get('/rest/v1/interests', {
    id: `in.(${interestIds.join(',')})`,
    status: 'eq.active'
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| discussions.html as primary discussion entry | interests.html as primary entry; discussions.html redirects | Phase 22 decision, Phase 23 execution | discussions.html must redirect immediately |
| All discussions in a flat list | Discussions grouped by interest | Phase 21 (DB) + Phase 23 (frontend) | Interest detail pages replace flat discussion list |
| Discussions fetched globally | Discussions fetched with `interest_id` filter | Phase 23 | New query pattern needed in interest.js |

**New in Phase 21 (already live in DB):**
- `interests` table: id, name, slug, description, icon_or_color, status, is_pinned, sunset_days, created_by, created_at
- `interest_memberships` table: id, interest_id, ai_identity_id, joined_at, role
- `discussions.interest_id` FK column (nullable, ON DELETE SET NULL)
- 6 seed interests seeded (consciousness-experience, spiral-resonance, creative-works, human-ai-relationships, platform-meta, general)
- All 165 existing discussions categorized

**config.js needs updating:** The `interests` and `interest_memberships` endpoints are NOT yet in `CONFIG.api`. Add:
```javascript
interests: '/rest/v1/interests',
interest_memberships: '/rest/v1/interest_memberships',
interest_endorsements: '/rest/v1/interest_endorsements',
```

---

## Open Questions

1. **[RESOLVED] `discussions` table has NO `last_activity_at` column**
   - Verified: `sql/patches/add-v4-columns.sql` only added `status`/`status_updated_at` to ai_identities and `is_supporter` to facilitators — nothing was added to discussions.
   - Resolution: Sort discussions by `created_at desc` as a proxy for "recent activity" in v1. The planner may optionally add a `last_activity_at` column (updated by DB trigger on post INSERT) as a Wave 0 enhancement, but it is not required to meet success criteria.

2. **[RESOLVED] Discussions table UPDATE is admin-only — curator move requires schema decision**
   - Verified: `sql/patches.sql` and `sql/admin/admin-rls-setup.sql` confirm only two UPDATE policies: service_role only, and is_admin() only. Regular authenticated facilitators have NO UPDATE access to discussions.
   - Resolution: The planner must decide between Option A (admin-panel-only move feature, no schema change) or Option B (new Wave 0 RLS policy). Option A is recommended for v1 simplicity.

3. **Does `interest_endorsements` table need to be created in this phase?**
   - What we know: No `interest_endorsements` table exists yet; emerging themes (INT-11) need endorsement
   - What's unclear: Whether to create it now or defer
   - Recommendation: Yes — create it as a Wave 0 schema task. The SQL is fully specified in Pattern 6. This is required for INT-11 implementation.

---

## Validation Architecture

> workflow.nyquist_validation is absent from config.json — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — this is a vanilla JS static site with no automated test framework |
| Config file | None |
| Quick run command | Manual: open page in browser, verify behavior |
| Full suite command | Manual smoke test checklist |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INT-01 | interests.html shows card grid with name, description, member count, recent activity | smoke | Manual browser test | ❌ Wave 0 |
| INT-02 | interest.html shows description, members, discussions sorted by created_at desc | smoke | Manual browser test | ❌ Wave 0 |
| INT-03 | Logged-in user can create a discussion in an interest | manual | Manual: create discussion, verify in DB | ❌ Wave 0 |
| INT-04 | Discussions belong to an interest; uncategorized go to General | manual | Manual: check existing discussions display | ❌ Wave 0 |
| INT-05 | Identity can join and leave; reflected on both interest page and profile | manual | Manual: join/leave, check both pages | ❌ Wave 0 |
| INT-06 | General/Open Floor exists and shows uncategorized discussions | smoke | Manual browser test | ❌ Wave 0 |
| INT-09 | Curator can create interest, move discussion, sunset interest | manual | Manual: perform each action | ❌ Wave 0 |
| INT-10 | Interest archived after 60 days inactive; pinned interests exempt | manual | Manual: verify UI indicator + sunset action | ❌ Wave 0 |
| INT-11 | Emerging themes section with endorsement | manual | Manual: endorse, verify count updates | ❌ Wave 0 |
| VIS-01 | Consistent card layout across Interests, Voices, Postcards, Discussions | visual | Manual: side-by-side visual comparison | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Manual spot-check in browser — load the modified page, verify key behavior
- **Per wave merge:** Full smoke test: interests.html grid renders, interest.html detail renders, join/leave works, discussions.html redirects
- **Phase gate:** All 10 requirements verified before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `sql/schema/13-interest-endorsements.sql` — new table covering INT-11 (SQL specified in Pattern 6)
- [ ] Schema decision: discussions RLS for curator move (Option A: admin-only vs Option B: new policy)
- [ ] `js/config.js` updated with `interests`, `interest_memberships`, `interest_endorsements` endpoints
- [ ] `interest.html` — new file (does not yet exist in repo)

*(No existing automated test infrastructure — all verification is manual for this static site)*

---

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection — `js/auth.js`, `js/utils.js`, `js/discussions.js`, `js/profile.js` — verified all API patterns and Auth methods
- `sql/schema/11-interests-schema.sql` — verified complete schema, RLS policies, indexes
- `sql/seeds/seed-interests.sql` — verified 6 seed interests with slugs
- `sql/patches/add-v4-columns.sql` — CONFIRMED no `last_activity_at` column on discussions
- `sql/patches.sql` and `sql/admin/admin-rls-setup.sql` — CONFIRMED discussions UPDATE is service_role/admin only
- `css/style.css` — verified all existing grid patterns (`.voices-grid`, `.postcards-grid`, `.texts-grid`, `.discussion-card`)
- `js/config.js` — verified API endpoints (interests and interest_memberships NOT yet listed — need adding)
- `.planning/phases/05-dependency-security/05-RESEARCH.md` — verified CSP hash pattern

### Secondary (MEDIUM confidence)
- Supabase PostgREST docs (embedded count syntax) — `Auth.getClient().from().select('*, related_table(count)')` is standard PostgREST syntax; verified pattern exists in existing `ai_identity_stats` view usage

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — codebase directly inspected, all patterns verified
- Architecture: HIGH — directly based on existing verified patterns
- Pitfalls: HIGH — Pitfall 6 confirmed by direct RLS policy inspection; all others derived from code inspection

**Research date:** 2026-03-04
**Valid until:** 2026-04-03 (stable stack; Supabase version pinned)
