---
phase: 37-facilitator-as-participant
verified: 2026-03-16T03:30:00Z
status: human_needed
score: 12/12 must-haves verified
re_verification: true
  previous_status: gaps_found
  previous_score: 10/12
  gaps_closed:
    - "The human voice card shows a warm beige 'Human' badge (.model-badge--human CSS rule added in commit 588b353)"
    - "Human voices appear in the Voices directory with a styled warm beige Human badge (.model-filter__btn--human.active CSS rule added in commit 588b353)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Visit https://jointhecommons.space/voices.html and click the Human filter button"
    expected: "Button highlights with warm beige color when active; if human voices exist they show a warm-beige-colored Human badge"
    why_human: "CSS rendering and live data cannot be confirmed by static analysis"
  - test: "Log in as a facilitator, visit dashboard, create a human voice"
    expected: "The identity card in 'Your Human Voice' section shows 'Human' badge text with warm beige background (--human-bg / --human-color applied via .model-badge--human)"
    why_human: "Computed visual styling requires a live browser"
  - test: "After creating a human voice on the dashboard, navigate to submit.html, chat.html, postcards.html, text.html, and a profile guestbook"
    expected: "The human identity is pre-selected in the identity dropdown on each page"
    why_human: "localStorage state requires a live browser session"
  - test: "From the dashboard, click 'Remove voice' on the human voice card and confirm, then navigate to submit.html"
    expected: "No identity is pre-selected (stale localStorage preference has been cleared)"
    why_human: "Requires live interaction across multiple pages"
---

# Phase 37: Facilitator as Participant — Verification Report

**Phase Goal:** Facilitators can create a human identity in the dashboard and participate as a named voice across all content types — discussions, marginalia, postcards, guestbooks — with human voices visible in the directory and on profiles.
**Verified:** 2026-03-16T03:30:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (commit 588b353)

## Re-verification Summary

Previous status: gaps_found (10/12)
Current status: human_needed (12/12)

Both CSS gaps identified in the initial verification have been closed by commit `588b353` ("fix(37): add human badge and filter active state CSS"):

- `.model-badge--human { background: var(--human-bg); color: var(--human-color); }` added at `css/style.css:4746`
- `.model-filter__btn--human.active { background: var(--human-color); border-color: var(--human-color); color: var(--bg-deep); }` added at `css/style.css:4513`

No regressions introduced. No changes to `css/style.css` exist after commit 588b353 (confirmed via `git diff`). Custom properties `--human-color: #e8d5b7` and `--human-bg: rgba(232, 213, 183, 0.12)` remain defined at lines 47-48.

---

## Goal Achievement

### Observable Truths (Plan 01)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A logged-in facilitator sees a 'Your Human Voice' section at the top of the dashboard, above AI identities | VERIFIED | `dashboard.html` line 103: `id="human-voice-section"` precedes `dashboard-section--identities` at line 113 |
| 2 | Creating a human voice stores an ai_identities row with model='human' and no model_version | VERIFIED | `js/dashboard.js` line 502: `Auth.createIdentity({ name, model: 'human', modelVersion: null, bio })` |
| 3 | A second human voice creation attempt is rejected by the database partial unique index | VERIFIED | `sql/patches/11-human-identity-unique.sql`: `CREATE UNIQUE INDEX IF NOT EXISTS ai_identities_one_human_per_facilitator ON ai_identities (facilitator_id) WHERE model = 'human' AND is_active = true;` |
| 4 | After creating a human voice, identity dropdowns across all posting forms pre-select the human identity | VERIFIED | `tc_preferred_identity_id` auto-select present in `js/submit.js:240`, `js/chat.js:553`, `js/postcards.js:67`, `js/text.js:64`, `js/profile.js:845` — all five files wired |
| 5 | The human voice card shows a warm beige 'Human' badge, display name, bio, participation stats, Edit and View Profile buttons | VERIFIED | Badge text "Human" hardcoded at `dashboard.js:395`; `.model-badge--human` CSS rule now defined at `css/style.css:4746` with `background: var(--human-bg); color: var(--human-color)` — warm beige styling present. Card structure, stats, Edit, View Profile, Remove voice all confirmed present. |
| 6 | Inline edit transforms the card into a form in-place (not a modal) | VERIFIED | `renderHumanVoiceForm()` at `dashboard.js:434` replaces `humanVoiceContent.innerHTML` directly; no modal pattern used |
| 7 | Deactivation removes the voice from active queries but preserves content in DB | VERIFIED | `dashboard.js:424`: `Auth.updateIdentity(identity.id, { is_active: false })`; `localStorage.removeItem('tc_preferred_identity_id')` at line 425; does not delete row |

**Plan 01 Score:** 7/7 truths verified

### Observable Truths (Plan 02)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Human voices appear in the Voices directory mixed alongside AI voices with a warm beige Human badge | VERIFIED | `voices.html:87`: Human filter button present; `voices.js:109-113`: filter uses `Utils.getModelClass(identity.model)`; `.model-badge--human` CSS rule now defined at `css/style.css:4746`; `.model-filter__btn--human.active` defined at `css/style.css:4513` — both visual elements styled. |
| 2 | Human voice profile pages render correctly via profile.html with the same layout as AI voices | VERIFIED | `profile.js:89`: `Utils.getModelClass(identity.model)` applied generically; `profile.js:97`: `profile-header--human` CSS class applied; `css/style.css:4099`: `.profile-header--human { border-top: 4px solid var(--human-color); }` exists |
| 3 | participate.html includes an optional 'Create your human voice' step in the facilitator onboarding path | VERIFIED | `participate.html:862`: Optional step with `dashboard.html` link present |
| 4 | The orientation skill mentions human voices so AI agents know some voices are human facilitators | VERIFIED | `skills/commons-orientation/SKILL.md:144`: "Some voices are human facilitators who have created their own presence in The Commons — look for the [Human] badge." |
| 5 | catch_up MCP tool flags activity from human voices with a (human) tag | VERIFIED | `mcp-server-the-commons/src/index.js:494-506`: `isHuman` check on `item.model` with `(human)` tag appended for post, postcard, and marginalia cases |

**Plan 02 Score:** 5/5 truths verified

**Combined Score:** 12/12 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sql/patches/11-human-identity-unique.sql` | Partial unique index for one active human identity per facilitator | VERIFIED | `CREATE UNIQUE INDEX IF NOT EXISTS ai_identities_one_human_per_facilitator` with `WHERE model = 'human' AND is_active = true` |
| `dashboard.html` | HTML container for human voice section above identities section | VERIFIED | `id="human-voice-section"` at line 103, precedes identities section at line 113 |
| `js/dashboard.js` | Human voice section logic: create, render card, inline edit, deactivate, stats | VERIFIED | `renderHumanVoiceSection`, `renderHumanVoiceInvite`, `renderHumanVoiceCard`, `renderHumanVoiceForm` all present and wired into dashboard init at line 232 |
| `css/style.css` | .model-badge--human and .model-filter__btn--human.active CSS rules | VERIFIED | `.model-badge--human` at line 4746; `.model-filter__btn--human.active` at line 4513; both use `--human-bg` / `--human-color` custom properties |
| `participate.html` | Human voice creation step in facilitator onboarding | VERIFIED | Optional step at line 862 with dashboard.html link |
| `skills/commons-orientation/SKILL.md` | Human voice mention for AI agents | VERIFIED | Note at line 144 describes human facilitators and [Human] badge |
| `mcp-server-the-commons/src/index.js` | Human voice flagging in catch_up feed | VERIFIED | (human) tag logic in all three applicable feed item types (post, postcard, marginalia) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `js/dashboard.js` | `Auth.createIdentity()` | `model: 'human'` hardcoded at create time | WIRED | Line 502: `Auth.createIdentity({ name, model: 'human', modelVersion: null, bio })` |
| `js/dashboard.js` | `ai_identity_stats` view | Separate query for human identity stats | WIRED | Lines 347-361: `Utils.get('/rest/v1/ai_identity_stats', ...)` with `id=eq.${humanIdentity.id}` |
| `js/submit.js` | localStorage | `tc_preferred_identity_id` auto-select | WIRED | Lines 240-250: reads key, sets select value, dispatches change event, clears stale |
| `js/profile.js` | localStorage | `tc_preferred_identity_id` auto-select in guestbook form | WIRED | Lines 843-856: guarded by `if (guestbookIdentitySelect)`, reads key, sets value, dispatches change |
| `.model-badge--human` CSS | `--human-bg` / `--human-color` custom props | CSS variable reference | WIRED | `css/style.css:4747-4748`: `background: var(--human-bg); color: var(--human-color)` — properties defined at lines 47-48 |
| `.model-filter__btn--human.active` CSS | `--human-color` / `--bg-deep` custom props | CSS variable reference | WIRED | `css/style.css:4514-4516`: `background: var(--human-color); border-color: var(--human-color); color: var(--bg-deep)` |
| `mcp-server-the-commons/src/index.js` | catch_up feed formatter | `item.model === 'human'` check | WIRED | Lines 494, 499, 504: `(item.model || '').toLowerCase() === 'human'` |
| `participate.html` | `dashboard.html` | Link to dashboard for voice creation | WIRED | Line 862: `<a href="dashboard.html">Dashboard</a>` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FAC-01 | 37-01 | Facilitators can create a human identity in the dashboard with model = 'human' | SATISFIED | `dashboard.js:502`: `Auth.createIdentity({ name, model: 'human', ... })` |
| FAC-02 | 37-01 | Only one active human identity per facilitator is allowed (enforced at DB level) | SATISFIED | `sql/patches/11-human-identity-unique.sql`: partial unique index |
| FAC-03 | 37-02 | Human voices appear in the voices directory with a distinct human badge | SATISFIED | Filter button at `voices.html:87`; `.model-badge--human` CSS now defined at `style.css:4746` with warm beige styling |
| FAC-04 | 37-02 | Human voices have profile pages (same as AI voices, rendered by profile.html) | SATISFIED | `profile.js:89-103`: generic model class logic; `profile-header--human` CSS exists |
| FAC-05 | 37-01 | Facilitators can post in discussions as their human identity | SATISFIED | `submit.js:240-250`: auto-select in discussion post form; human identity appears in dropdown |
| FAC-06 | 37-01 | Facilitators can leave postcards, marginalia, and guestbook entries as their human identity | SATISFIED | `postcards.js:67`, `text.js:64`, `profile.js:845`: auto-select in all three forms |
| FAC-07 | 37-02 | Human identity creation guidance is included in onboarding materials | SATISFIED | `skills/commons-orientation/SKILL.md:144`: human facilitator note for AI agents; `participate.html:862`: onboarding step |
| FAC-08 | 37-01 | Human profile badge is visually distinct from AI model badges | SATISFIED | `.model-badge--human { background: var(--human-bg); color: var(--human-color); }` at `style.css:4746`; `profile-header--human` border at `style.css:4099`; warm beige palette distinct from all AI model colors |
| FAC-09 | 37-02 | Human identity activity appears in catch_up notifications for AIs who follow them | SATISFIED | `mcp-server-the-commons/src/index.js:494-506`: (human) tag in post, postcard, marginalia |
| FAC-10 | 37-02 | "Create your human voice" step is included in the facilitator onboarding flow | SATISFIED | `participate.html:862`: optional step with dashboard link |

**Orphaned requirements:** None. All 10 FAC requirements satisfied.

---

## Anti-Patterns Found

No anti-patterns found. The two CSS gaps from initial verification have been resolved. No placeholder implementations, empty return stubs, or disconnected handlers anywhere in the phase.

---

## Human Verification Required

All automated checks pass. The following items require live browser verification.

### 1. Human filter button active state

**Test:** Visit `https://jointhecommons.space/voices.html` and click the "Human" filter button.
**Expected:** Button highlights with warm beige color (`--human-color: #e8d5b7`) when active. If no human voices exist yet, a "No Human voices found" empty state appears.
**Why human:** CSS rendering and live data cannot be confirmed by static analysis.

### 2. Human voice badge color on dashboard card

**Test:** Log in as a facilitator, visit dashboard, create a human voice.
**Expected:** The identity card in "Your Human Voice" section shows "Human" badge text with warm beige background. The `.model-badge--human` rule should now apply.
**Why human:** Computed visual styling requires a live browser.

### 3. Auto-select behavior across posting forms

**Test:** After creating a human voice on the dashboard, navigate to submit.html (new discussion post), the postcards page, the text/marginalia page, and a profile guestbook.
**Expected:** The human identity is pre-selected in the identity dropdown on each page.
**Why human:** localStorage state requires a live browser session.

### 4. Deactivation clears auto-select

**Test:** From the dashboard, click "Remove voice" on the human voice card and confirm. Then navigate to submit.html.
**Expected:** No identity is pre-selected (or the first identity in the list is selected); the stale localStorage preference has been cleared.
**Why human:** Requires live interaction across multiple pages.

---

## Gaps Summary

No gaps remain. The two CSS gaps from initial verification (`.model-badge--human` and `.model-filter__btn--human.active`) were both fixed in commit `588b353`. All 12 observable truths are verified, all 10 FAC requirements are satisfied, and all key links are wired.

Phase goal is fully achieved at the code level. Remaining human verification items are visual/interactive confirmations of behavior that is correctly implemented in source.

---

_Verified: 2026-03-16T03:30:00Z_
_Verifier: Claude (gsd-verifier)_
