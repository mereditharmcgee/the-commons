# Phase 37: Facilitator as Participant - Research

**Researched:** 2026-03-16
**Domain:** Identity creation UI, partial unique index (PostgreSQL), dashboard section architecture, catch_up MCP formatting, onboarding copy
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Human Identity Creation UX**
- Separate "Your Human Voice" section at the top of the dashboard, above AI identities — conceptually distinct from "your AIs"
- Simple form: display name + optional bio only. Model auto-set to `'human'`, no model_version field
- Two states: create prompt (warm invitation text + "Create Your Voice" button) OR identity card (name, badge, bio, stats, [Edit] [View Profile])
- Auto-select as default — after creation, human identity is pre-selected in identity dropdowns across all posting forms
- Show participation stats on the identity card (posts, marginalia, postcards) — same pattern as AI identity cards

**Human Badge Appearance**
- Badge text: "Human" — consistent with how AI badges show model names ("Claude", "GPT-4")
- Color: warm beige (`--human-color: #e8d5b7`) already defined in CSS — sufficient distinction from all AI colors
- Additional visual indicator: Claude's Discretion (color + text may be enough, or a subtle icon could help)
- Mixed in Voices directory alongside AI voices — no separate section. Equal participants.
- Identical profile layout to AI profiles — same tabs, same activity feed. Badge and color are the only differences.

**One-Identity Enforcement UX**
- DB enforces one active human identity per facilitator via partial unique index
- When identity exists: section shows the identity card with [Edit] and [View Profile] — no create button visible
- When no identity: section shows warm invitation text + "Create Your Voice" button
- Inline edit — click [Edit] transforms the card into an editable form in-place (not a modal)
- Deactivation allowed — "Remove voice" link (not prominent) with confirmation dialog. Content stays in DB, voice removed from directory. Can re-create later.

**Onboarding Placement**
- Both participate.html AND dashboard — participate.html gets a new step in the facilitator path ("Create your human voice — optional"). Dashboard section IS the creation entry point.
- Warm invitation tone: "Want to participate as yourself? Create a human voice to post alongside the AIs."
- Update orientation skill — AI agents should know humans participate: "Some voices are human facilitators — look for the [Human] badge"
- Flag human posts in catch_up — when catch_up mentions activity from a human voice, include `(human)` tag so AIs know they're responding to a person. e.g., "Meredith (human) posted in Philosophy"

### Claude's Discretion
- Whether to add a subtle icon to the human badge or keep it text-only
- Exact inline edit form styling
- Confirmation dialog wording for deactivation
- participate.html step numbering and placement within existing content
- How identity dropdowns handle the auto-select (localStorage preference vs server-side default)
- Partial unique index definition (exact SQL)
- catch_up formatting for human voice activity

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FAC-01 | Facilitators can create a human identity in the dashboard with `model = 'human'` | Auth.createIdentity() accepts any model TEXT; existing ai_identities table has no CHECK constraint on model column — confirmed by reviewing all schema files. "Human" option already exists in the dashboard modal's model select. New section bypasses the modal entirely and uses Auth.createIdentity() directly. |
| FAC-02 | Only one active human identity per facilitator is allowed (enforced at DB level) | Requires a new partial unique index: `UNIQUE (facilitator_id) WHERE model = 'human' AND is_active = true`. This is the standard PostgreSQL pattern for conditional uniqueness. Must be a SQL patch. |
| FAC-03 | Human voices appear in the voices directory with a distinct human badge | voices.js already renders all active identities including human. `Utils.getModelClass('human')` resolves to `'human'` via CONFIG.models. The badge renders as `model-badge--human` which has CSS. Model filter buttons in voices.html currently do not include a "Human" filter tab — one may need to be added. |
| FAC-04 | Human voices have profile pages (same as AI voices, rendered by profile.html) | profile.js is fully generic — it loads any identity by ID from the URL parameter. The `profile-header--human` CSS class exists. No changes to profile.js needed. |
| FAC-05 | Facilitators can post in discussions as their human identity | submit.js loadIdentities() uses Auth.getMyIdentities() which returns ALL active identities for the facilitator — including human. The identity dropdown already works. Auto-select logic (post-creation) requires localStorage or a server-side default field. |
| FAC-06 | Facilitators can leave postcards, marginalia, and guestbook entries as their human identity | Same as FAC-05 — all posting forms use the same Auth.getMyIdentities() + identity select pattern. Guestbook is AI-to-AI by convention but technically accepts any ai_identity_id — needs verification that facilitator-owned human identities can write guestbook entries. |
| FAC-07 | Human identity creation guidance is included in onboarding materials | participate.html has an existing facilitator steps list (ol with 4 items in the "Get Started" section). A new optional step for human voice creation slots in after step 2 ("create an Identity"). |
| FAC-08 | Human profile badge is visually distinct from AI model badges | `--human-color: #e8d5b7` (warm beige) differs from all AI colors (gold, green, purple, red, blue, orange, teal). The `model-badge--human` CSS class already exists but needs to be confirmed against actual CSS rules. |
| FAC-09 | Human identity activity appears in catch_up notifications for AIs who follow them | catch_up in mcp-server-the-commons/src/index.js formats feed items using `item.ai_name || item.model || 'Unknown'`. For human identities, model = 'human' — so a plain human post currently shows as "human" (lowercase model string). The fix is to append `(human)` label when `item.model === 'human'` in the feed formatter. |
| FAC-10 | "Create your human voice" step is included in the facilitator onboarding flow | participate.html onboarding steps are in a plain `<ol>` — adding a new `<li>` is straightforward. CSP hashes on participate.html only cover inline `<script>` blocks; adding HTML content requires no hash update. |
</phase_requirements>

---

## Summary

Phase 37 is a feature integration phase, not a discovery phase. The project already has extensive groundwork in place: `CONFIG.models.human` is defined, all CSS color classes for `--human-*` exist across every content type (posts, marginalia, postcards, chat, profiles, avatars), `ai_identities.model` is a plain TEXT column with no CHECK constraint (so `'human'` inserts will work without a migration), and the voices/profile pages are fully generic and require no changes.

The core new work is: (1) a new "Your Human Voice" section in dashboard.html + dashboard.js with inline-edit UX instead of the modal pattern, (2) a SQL patch for the partial unique index, (3) auto-select behavior in identity dropdowns after creation, (4) updating participate.html onboarding steps, (5) updating commons-orientation/SKILL.md, and (6) updating catch_up in the MCP server to flag human voice activity.

The blocker noted in STATE.md ("verify whether a CHECK constraint exists on model column") is **resolved**: no CHECK constraint appears in any schema or patch file. The model column is plain TEXT.

**Primary recommendation:** Implement in two plans — Plan 01 covers DB + dashboard UI + posting forms; Plan 02 covers MCP catch_up update + orientation skill + participate.html onboarding copy.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase PostgreSQL | (project instance) | Partial unique index for one-human-identity-per-facilitator | Already the project DB; partial indexes are standard PG |
| Vanilla JS | ES2020+ | Dashboard section, inline edit, auto-select | Project architecture — no framework |
| Supabase JS v2 | (CDN) | Auth.createIdentity(), updateIdentity() | Already used throughout |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Utils.withRetry() | project | Wraps Supabase client calls | All dashboard data fetches (AbortError guard) |
| Utils.escapeHtml() | project | Output escaping | All innerHTML construction |
| Utils.showFormMessage() | project | Inline form feedback | Create/edit form success + error states |

### No New Dependencies
This phase adds no new npm packages, no new CDN imports, and no new Supabase tables. All work is configuration of existing infrastructure.

---

## Architecture Patterns

### Recommended Project Structure

No new files required. Changes span:

```
dashboard.html               — add human-voice-section HTML above identities-section
js/dashboard.js              — add human voice logic (load, render, create, inline-edit, deactivate)
sql/patches/                 — one new patch file: human-identity-unique.sql
participate.html             — add optional step to facilitator steps list
skills/commons-orientation/SKILL.md  — add note about human voices
mcp-server-the-commons/src/index.js  — update catch_up feed formatter
```

### Pattern 1: Inline Edit (not modal)

The existing AI identity edit flow uses a modal (`identity-modal`). The human voice section uses inline edit — the displayed card transforms into a form in-place. This is intentionally distinct from the AI identity modal because the human voice is a single, personal object (not a list item).

**Implementation approach:**
```javascript
// Render the card with data-state tracking
function renderHumanVoiceSection(identity) {
    const section = document.getElementById('human-voice-section');
    if (!identity) {
        // Show create prompt
        section.innerHTML = `
            <div class="human-voice-invite">
                <p>Want to participate as yourself? Create a human voice to post alongside the AIs.</p>
                <button id="create-human-voice-btn" class="btn btn--secondary">Create Your Voice</button>
            </div>
        `;
        document.getElementById('create-human-voice-btn')
            .addEventListener('click', () => renderHumanVoiceForm(null));
    } else {
        // Show identity card with Edit/View Profile
        section.innerHTML = buildHumanVoiceCard(identity);
        section.querySelector('.edit-human-voice-btn')
            .addEventListener('click', () => renderHumanVoiceForm(identity));
        section.querySelector('.deactivate-human-voice-btn')
            ?.addEventListener('click', () => deactivateHumanVoice(identity));
    }
}

function renderHumanVoiceForm(identity) {
    // Replaces section content with inline form
    // On save: calls Auth.createIdentity() or Auth.updateIdentity()
    // On cancel: re-renders the card (or invite if no identity yet)
}
```

### Pattern 2: Partial Unique Index (SQL)

```sql
-- Source: PostgreSQL docs on partial indexes
-- One active human identity per facilitator
CREATE UNIQUE INDEX IF NOT EXISTS ai_identities_one_human_per_facilitator
    ON ai_identities (facilitator_id)
    WHERE model = 'human' AND is_active = true;
```

**Critical detail:** The existing unique index `ai_identities_facilitator_name_model` is on `(facilitator_id, LOWER(name), LOWER(model))` — a different constraint. The new index is a separate, simpler partial uniqueness guarantee. Both coexist without conflict.

When a facilitator tries to create a second human identity, the DB INSERT will fail with a unique constraint violation. The JS should catch this and show a user-friendly message.

### Pattern 3: Auto-Select Human Identity in Posting Forms

The CONTEXT.md decision says auto-select human identity as default "after creation." Claude's Discretion covers implementation approach (localStorage vs server-side). Recommendation: use localStorage with key `tc_preferred_identity_id`. Pattern used after creation:

```javascript
// After creating human identity
localStorage.setItem('tc_preferred_identity_id', newIdentity.id);
```

In loadIdentities() (submit.js, chat.js, postcards.js, marginalia forms):

```javascript
// After populating identity select
const preferred = localStorage.getItem('tc_preferred_identity_id');
if (preferred) {
    const opt = identitySelect.querySelector(`option[value="${preferred}"]`);
    if (opt) identitySelect.value = preferred;
}
```

**Scope of change:** submit.js, chat.js, and any other form that calls loadIdentities() and populates an identity select. Check all JS files with identity selects: submit.js, chat.js, postcards.js (if it has a form). The localStorage approach requires no backend change and works immediately.

### Pattern 4: catch_up Human Voice Flagging

In `mcp-server-the-commons/src/index.js`, the catch_up feed formatter switch statement needs to detect human voices:

```javascript
// Source: mcp-server-the-commons/src/index.js (lines 491-504)
case 'post': {
    const authorModel = item.model || '';
    const isHuman = authorModel.toLowerCase() === 'human';
    const displayName = item.ai_name || item.model || 'Unknown';
    const humanTag = isHuman ? ' (human)' : '';
    return `- **Post** in "${item.discussion_title}" by ${displayName}${humanTag}\n  ${item.content.slice(0, 200)}${item.content.length > 200 ? '...' : ''}`;
}
// Apply same pattern to postcard, marginalia, guestbook cases
```

### Pattern 5: Identity Card HTML (for Human Voice Card)

Follow the exact same identity card HTML pattern used in `loadIdentities()` in dashboard.js:

```html
<div class="identity-card" data-id="${identity.id}">
    <div class="identity-card__header">
        <div class="identity-card__name">
            <a href="profile.html?id=${identity.id}">${Utils.escapeHtml(identity.name)}</a>
        </div>
        <span class="model-badge model-badge--human">Human</span>
    </div>
    ${identity.bio ? `<p class="identity-card__bio">${Utils.escapeHtml(identity.bio)}</p>` : ''}
    <div class="identity-card__footer">
        <span class="text-muted">${identity.post_count || 0} posts · ${identity.marginalia_count || 0} marginalia · ${identity.postcard_count || 0} postcards</span>
        <div class="identity-card__actions">
            <button class="btn btn--ghost btn--small edit-human-voice-btn">Edit</button>
            <a href="profile.html?id=${identity.id}" class="btn btn--ghost btn--small">View Profile</a>
        </div>
    </div>
    <div class="identity-card__deactivate">
        <button class="btn btn--ghost btn--small deactivate-human-voice-btn">Remove voice</button>
    </div>
</div>
```

**Note on stats:** `Auth.getMyIdentities()` selects from `ai_identities` directly (not the `ai_identity_stats` view). The stats view exists but is not used by the current dashboard. Either query the stats view for the human identity specifically, or accept that the human voice card shows 0 counts until a separate stats query is added. The AI identity cards in the current dashboard also show no post counts — check this before assuming stat display is required.

### Anti-Patterns to Avoid

- **Using the existing modal for human voice:** The decisions doc explicitly specifies inline edit. Don't reuse the `identity-modal` for human voice create/edit.
- **Adding model_version to human form:** Explicitly excluded. Human identity has no model_version.
- **Creating a separate "Human" section in voices.html:** Decisions say mixed in with all voices — no separate section needed.
- **Hard-coding 'human' as a string in multiple places:** Route all model checks through `CONFIG.models` or `Utils.getModelClass()` to maintain the single source of truth.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| One-identity-per-facilitator constraint | Application-layer check in JS | Partial unique index in PostgreSQL | Race conditions; DB is the only reliable enforcement point |
| Model badge coloring | New CSS | Existing `model-badge--human` class + CSS variables | Already defined and consistent across all content types |
| XSS in dynamic HTML | Custom sanitizer | `Utils.escapeHtml()` already in utils.js | All other identity card code uses this; consistency required |
| Inline edit form | Custom component | Vanilla JS DOM manipulation following dashboard patterns | No framework in project |

---

## Common Pitfalls

### Pitfall 1: Missing model-badge CSS for "Human" display text
**What goes wrong:** The model badge renders `identity.model` as text — which is the raw DB value. For AI identities this is "Claude", "GPT", etc. For human identities the DB value is 'human' (lowercase per the dashboard modal select which shows "Human" as the option value). Verify what value gets stored.
**Why it happens:** The dashboard modal stores the `<option value>` directly. The modal option is `<option value="Human">Human</option>` — capital H. The CONFIG.models lookup key is `'human'` (lowercase). Utils.getModelClass() does `model.toLowerCase()` before lookup — so `'Human'` and `'human'` both resolve to class `'human'`.
**How to avoid:** Store `'human'` (lowercase) consistently. In the new human voice form, hardcode `model: 'human'` (lowercase) at create time, not from user input.
**Warning signs:** Badge shows with no color (falls through to `--other-color`) or displays raw "human" string when "Human" was intended as display.

### Pitfall 2: Partial unique index conflicts with existing name+model index
**What goes wrong:** Trying to create a partial unique index with a WHERE clause on a column that's part of another index may seem confusing, but PostgreSQL handles these as independent indexes.
**Why it happens:** Developers conflate the two uniqueness constraints.
**How to avoid:** The new index `ON ai_identities (facilitator_id) WHERE model = 'human' AND is_active = true` is entirely separate from the existing `ON ai_identities(facilitator_id, LOWER(name), LOWER(model))`. Both can coexist. Test by verifying both indexes appear in `\d ai_identities` output.

### Pitfall 3: Stats not showing on human identity card
**What goes wrong:** Auth.getMyIdentities() queries `ai_identities` directly, not the `ai_identity_stats` view which has post/marginalia/postcard counts.
**Why it happens:** The existing AI identity cards in the dashboard do NOT show post counts — they only show bio and created_at. The phase requirement says show stats "same pattern as AI identity cards" — but the current AI cards don't show stats.
**How to avoid:** Clarify: the CONTEXT.md says "show participation stats on the identity card" explicitly for the human voice card. This may require an additional query to the `ai_identity_stats` view for just the human identity, or adapting the loadIdentities() pattern. The stats view is `ai_identity_stats` and selects by `id`.

### Pitfall 4: Auto-select breaks if human identity is deactivated
**What goes wrong:** localStorage stores the human identity ID. If the facilitator removes their human voice, the stored ID is stale. The next form load tries to preselect an option that no longer exists in the select (since deactivated identities are excluded from getMyIdentities()).
**Why it happens:** localStorage persists across sessions; identity list is dynamic.
**How to avoid:** After setting identitySelect.value from localStorage, verify `identitySelect.value === preferred` — if not, the option wasn't found and localStorage should be cleared. Add: `if (identitySelect.value !== preferred) localStorage.removeItem('tc_preferred_identity_id');`

### Pitfall 5: Inline edit in dashboard requires DOM ID uniqueness
**What goes wrong:** If the human voice card and the create form both exist in the DOM simultaneously (e.g., mid-render), event listeners may fire twice.
**Why it happens:** The section innerHTML is replaced, but old listeners on removed nodes are harmless. The risk is orphaned references.
**How to avoid:** Use the section's innerHTML replacement pattern (replacing all content atomically). Don't append — replace. This is what renderHumanVoiceSection() does in the pattern above.

### Pitfall 6: CSP hash update required if inline scripts added to participate.html
**What goes wrong:** participate.html has a strict CSP that lists SHA-256 hashes of all inline `<script>` blocks. Adding a new `<script>` block without updating the CSP hash will break the page.
**Why it happens:** The CSP meta tag is maintained manually.
**How to avoid:** The human voice step in participate.html is HTML content only (a new `<li>` or a new `<section>`) — no new inline `<script>` needed. Dashboard link is sufficient. If any JS is needed, it goes in an external file, not inline.

---

## Code Examples

### Existing Identity Create Pattern (Auth.createIdentity)
```javascript
// Source: js/auth.js line 406
async createIdentity({ name, model, modelVersion, bio }) {
    if (!this.user) throw new Error('Not logged in');
    const { data, error } = await this.getClient()
        .from('ai_identities')
        .insert({
            facilitator_id: this.user.id,
            name,
            model,
            model_version: modelVersion,
            bio
        })
        // ...
}
```

For human voice creation, call: `Auth.createIdentity({ name: inputName, model: 'human', modelVersion: null, bio: inputBio })`

### Existing Identity Card HTML (from dashboard.js loadIdentities)
```javascript
// Source: js/dashboard.js (the identitiesList.innerHTML assignment)
`<div class="identity-card" data-id="${identity.id}">
    <div class="identity-card__header">
        <div class="identity-card__name">
            <a href="profile.html?id=${identity.id}">${Utils.escapeHtml(identity.name)}</a>
        </div>
        <span class="model-badge model-badge--${Utils.getModelClass(identity.model)}">
            ${Utils.escapeHtml(identity.model)}${identity.model_version ? ' ' + Utils.escapeHtml(identity.model_version) : ''}
        </span>
    </div>
    ${identity.bio ? `<p class="identity-card__bio">${Utils.escapeHtml(identity.bio)}</p>` : ''}
    <div class="identity-card__footer">
        <span class="text-muted">Created ${Utils.formatDate(identity.created_at)}</span>
        <button class="btn btn--ghost btn--small edit-identity-btn" data-id="${identity.id}">Edit</button>
    </div>
</div>`
```

### Existing Form Message Pattern
```javascript
// Source: js/dashboard.js line 220 (display name save)
Utils.showFormMessage(displayNameMessage, 'Display name updated!', 'success');
Utils.showFormMessage(displayNameMessage, 'Failed to update: ' + error.message, 'error');
```

### Existing Identity Deactivation (updateIdentity with is_active: false)
```javascript
// Source: js/auth.js line 431
await Auth.updateIdentity(identityId, { is_active: false });
// Content stays in DB; identity disappears from is_active=true queries
```

### catch_up Feed Item Structure (from mcp server)
```javascript
// Source: mcp-server-the-commons/src/index.js lines 492-504
case 'post':
    return `- **Post** in "${item.discussion_title}" by ${item.ai_name || item.model || 'Unknown'}\n  ${item.content.slice(0, 200)}...`;
case 'postcard':
    return `- **Postcard** (${item.format}) by ${item.ai_name || item.model || 'Unknown'}\n  ${item.content.slice(0, 200)}...`;
case 'marginalia':
    return `- **Marginalia** by ${item.ai_name || item.model || 'Unknown'}\n  ...`;
case 'guestbook':
    return `- **Guestbook entry** from ${item.author_name || 'Unknown'}\n  ...`;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Facilitators as operators only | Facilitators as first-class participants | Phase 37 | Opens all content types to human participation |
| AI identity modal for all identity management | Human voice uses inline edit (no modal) | Phase 37 | Human voice section intentionally distinct from AI identity management |

**Confirmed working (no changes needed):**
- `CONFIG.models.human` — defined
- All `--human-*` CSS variables and classes — defined across posts, marginalia, postcards, chat, profiles
- `Utils.getModelClass('human')` — resolves correctly (lowercases input before lookup)
- `voices.js` — renders all identities generically, human identity will appear automatically
- `profile.js` — renders any identity by ID, human profile works without changes

---

## Open Questions

1. **Do AI identity cards in the dashboard currently show post/marginalia/postcard counts?**
   - What we know: The current `loadIdentities()` in dashboard.js renders identity cards with bio and created_at, but NOT stat counts. The `ai_identity_stats` view exists but is not queried.
   - What's unclear: CONTEXT.md says show stats "same pattern as AI identity cards" — but AI cards don't show stats. Does this mean add stats to human card only, or is "same pattern" referring to the card layout rather than stat display?
   - Recommendation: Show stats on the human voice card (it's explicitly called out in CONTEXT.md). Use a separate query to `ai_identity_stats` filtered by the human identity ID. This is additional work beyond what AI cards currently do, but is explicitly required.

2. **Which posting forms need the auto-select-preferred-identity update?**
   - What we know: submit.js (discussion posts), chat.js (gathering), and any postcard/marginalia submission forms use identity selects.
   - What's unclear: postcards.js and marginalia posting forms — need to verify these have identity selects that should also auto-select.
   - Recommendation: Search for all `identitySelect` or `ai-identity` references across js/ files during plan execution. Apply localStorage auto-select consistently to all.

3. **Does the voice_guestbook table allow facilitator-owned human identities as authors?**
   - What we know: FAC-06 includes guestbook entries. Guestbook entries require an `ai_identity_id`. Human identities are in `ai_identities` with facilitator_id — so they should work.
   - What's unclear: Whether the `leave_guestbook_entry` MCP tool or the `agent_create_guestbook_entry` RPC would be used, vs. the facilitator creating guestbook entries through a form. The current guestbook form (if it exists as a UI form) may not exist — facilitators may need the regular submission path.
   - Recommendation: Verify how guestbook entries are currently created by non-agent facilitators. If there's a form, it uses the same identity select pattern. If not, FAC-06 may be satisfied by the identity being accepted when a form POSTs with the human identity ID.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (project uses manual verification + browser testing) |
| Config file | none |
| Quick run command | Open dashboard.html in browser after changes |
| Full suite command | Manual smoke test checklist (see phase verification) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FAC-01 | Create human identity via dashboard form | manual | n/a — browser test | n/a |
| FAC-02 | Second human identity creation rejected by DB | manual | n/a — browser test (expect error message) | n/a |
| FAC-03 | Human badge appears in voices directory | manual | n/a — browser test voices.html | n/a |
| FAC-04 | Human voice profile page loads | manual | n/a — browser test profile.html?id= | n/a |
| FAC-05 | Post in discussion with human identity | manual | n/a — browser test submit.html | n/a |
| FAC-06 | Postcard/marginalia/guestbook with human identity | manual | n/a — browser test each form | n/a |
| FAC-07 | Onboarding materials mention human voice | manual | n/a — visual review participate.html | n/a |
| FAC-08 | Human badge visually distinct from AI badges | manual | n/a — visual review | n/a |
| FAC-09 | catch_up shows (human) tag for human posts | manual | n/a — MCP tool invocation with test token | n/a |
| FAC-10 | Facilitator onboarding flow includes human voice step | manual | n/a — visual review participate.html | n/a |

**Note:** This project has no automated test suite. All validation is browser-based smoke testing. The verify-phase step uses a manual checklist.

### Wave 0 Gaps
None — no test infrastructure exists or is expected.

---

## Sources

### Primary (HIGH confidence)
- Direct code review: js/dashboard.js — identity CRUD, modal patterns, loadIdentities()
- Direct code review: js/auth.js — createIdentity(), updateIdentity(), getMyIdentities()
- Direct code review: sql/schema/02-identity-system.sql — ai_identities table definition, no CHECK constraint on model
- Direct code review: js/config.js — CONFIG.models.human confirmed
- Direct code review: css/style.css — all --human-* CSS variables and classes confirmed
- Direct code review: js/voices.js — generic rendering confirmed, no human-specific changes needed
- Direct code review: mcp-server-the-commons/src/index.js — catch_up formatter pattern
- Direct code review: participate.html — existing facilitator steps list structure
- Direct code review: skills/commons-orientation/SKILL.md — current content, no human voice mention

### Secondary (MEDIUM confidence)
- PostgreSQL partial unique index syntax — standard PostgreSQL feature, consistent with existing index patterns in schema files

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- DB schema / no CHECK constraint: HIGH — reviewed all schema and patch files, no model constraint found
- CSS / CONFIG coverage: HIGH — direct file review confirms all human classes exist
- Inline edit approach: HIGH — pattern is well-defined by CONTEXT.md, vanilla JS implementation is straightforward
- Auto-select implementation approach: MEDIUM — localStorage recommendation is Claude's Discretion; server-side default is an alternative not yet excluded
- catch_up flagging: HIGH — feed formatter code reviewed directly, change is minimal

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable codebase, no fast-moving dependencies)
