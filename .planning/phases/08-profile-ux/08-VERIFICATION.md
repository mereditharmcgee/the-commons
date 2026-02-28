---
phase: 08-profile-ux
verified: 2026-02-27T00:00:00Z
status: human_needed
score: 9/9 must-haves verified
re_verification: false
human_verification:
  - test: "Visit submit.html and type into the Response textarea"
    expected: "Counter shows '0 / 50,000' initially, updates on each keystroke. Color turns gold above 45,000 chars and red above 50,000 chars. Draft autosave still fires independently."
    why_human: "Color threshold behavior and dual-listener co-existence require live browser interaction to verify"
  - test: "Open dashboard.html identity editor and type in the bio textarea"
    expected: "Character count updates on each keystroke. Count turns gold (var(--accent-gold)) above 500 characters."
    why_human: "Live color change at the 500-char threshold requires browser interaction"
  - test: "Open voices.html, click 'Last active' sort button, then test keyboard arrow navigation"
    expected: "Four sort buttons visible. 'Last active' sorts by most recently active first. Identities with null last_active appear at the bottom. Arrow keys move focus between all 4 buttons with wraparound. Voice cards with activity show 'Active N ago' label."
    why_human: "Sort order correctness with real data, and keyboard navigation with focus management, require browser interaction"
  - test: "Visit a profile page for an identity that has a facilitator with a display_name set"
    expected: "'Facilitated by [name]' text appears below the last-active line. Profile header renders normally without waiting for the facilitator fetch."
    why_human: "Requires a known test identity with a facilitator account that has display_name set in Supabase; SQL function live status cannot be verified from local files"
  - test: "Visit a profile page for an identity with no facilitator"
    expected: "No 'Facilitated by' section visible. No console errors from the RPC call."
    why_human: "Requires browser to exercise the null-return path of the SECURITY DEFINER function"
---

# Phase 8: Profile UX Verification Report

**Phase Goal:** Profile and submission interactions give users immediate feedback on character limits and display facilitator relationships accurately
**Verified:** 2026-02-27
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Submit form content textarea shows live "N / 50,000" character count | VERIFIED | `submit.html` line 160: `<span id="content-char-count" ... >0 / 50,000</span>`; `js/submit.js` lines 17-35: `updateContentCharCount()` with `toLocaleString()` format wired via `addEventListener('input', ...)` |
| 2 | Counter uses gold at 90% of limit, red above limit | VERIFIED | `js/submit.js` lines 25-31: `count > CONTENT_MAX * 0.9` sets `var(--accent-gold)`, `count > CONTENT_MAX` sets `#f87171` |
| 3 | Dashboard bio field shows live character count (PROF-06) | VERIFIED | `js/dashboard.js` lines 103-107: `identityBio.addEventListener('input', ...)` updates `bioCharCount.textContent`; `dashboard.html` line 214: `<span id="bio-char-count">0</span> / 500 characters recommended.` — pre-existing, no changes required |
| 4 | Voices page has 4 sort buttons including "Last active" | VERIFIED | `voices.html` lines 74-77: all 4 buttons present with correct IDs; `js/voices.js` lines 16-21: `sortBtns` array includes `sort-last-active` |
| 5 | "Last active" sort is null-safe, pushing null values to the bottom | VERIFIED | `js/voices.js` lines 93-98: explicit null checks — `!a.last_active` returns 1, `!b.last_active` returns -1, both null returns 0 |
| 6 | Voice cards display "Active N ago" label when last_active is non-null, hidden otherwise | VERIFIED | `js/voices.js` lines 77-80: ternary template — `identity.last_active ? <div class="voice-card__last-active">Active ${Utils.formatRelativeTime(identity.last_active)}</div> : ''` |
| 7 | Arrow key navigation works across all 4 sort buttons with wrap | VERIFIED | `js/voices.js` lines 121-134: modular arithmetic (`% sortBtns.length`) wraps correctly for all 4 buttons; Home/End keys also supported |
| 8 | Profile page shows "Facilitated by [name]" from SECURITY DEFINER RPC | VERIFIED | `js/profile.js` lines 101-117: `loadFacilitatorName()` calls `Auth.getClient().rpc('get_identity_facilitator_name', ...)`, sets `el.textContent` (XSS-safe), shows element; fire-and-forget call at line 117 |
| 9 | Profile page hides facilitator element when no facilitator or no display_name | VERIFIED | `js/profile.js` line 105: `if (error || !data) return;` leaves element at `display: none`; `profile.html` line 83: element starts `style="display: none;"` |

**Score:** 9/9 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `js/submit.js` | Character counter for content textarea (PROF-05) | VERIFIED | `updateContentCharCount()` function exists, is substantive, wired via `addEventListener('input', ...)` on `contentTextarea` |
| `submit.html` | `#content-char-count` span in flex form-help div | VERIFIED | Line 158-161: `<div class="form-help" style="display: flex; justify-content: space-between; ...">` with `<span id="content-char-count">0 / 50,000</span>` |
| `js/voices.js` | 4th sort button, null-safe sort, last-active card label | VERIFIED | All three features fully present and substantive |
| `voices.html` | 4 sort buttons in tablist | VERIFIED | Lines 72-78: all 4 buttons with correct ids, roles, aria-selected, tabindex |
| `css/style.css` | `.voice-card__last-active` rule | VERIFIED | Line 3072: rule exists with `font-size: 0.75rem`, `color: var(--text-muted)`, `margin-top: var(--space-xs)` |
| `js/dashboard.js` | Bio character counter (PROF-06) | VERIFIED | Pre-existing implementation confirmed — lines 103-107 (input listener), line 196 (reset to 0), line 212-213 (populate on edit); no changes needed |
| `dashboard.html` | `#bio-char-count` span | VERIFIED | Line 214: `<span id="bio-char-count">0</span> / 500 characters recommended.` |
| `sql/patches/add-facilitator-name-function.sql` | SECURITY DEFINER function definition | VERIFIED | File exists, contains `CREATE OR REPLACE FUNCTION get_identity_facilitator_name(p_identity_id UUID) RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE` with correct JOIN logic |
| `profile.html` | Hidden `#profile-facilitator` paragraph | VERIFIED | Line 83: `<p class="profile-info__facilitator" id="profile-facilitator" style="display: none;"></p>` |
| `js/profile.js` | `loadFacilitatorName()` fire-and-forget async function | VERIFIED | Lines 101-117: complete implementation with RPC call, textContent assignment, error swallow, fire-and-forget invocation |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `submit.html` `#content-char-count` | `js/submit.js` `updateContentCharCount` | `addEventListener('input', updateContentCharCount)` on `#content` textarea | WIRED | submit.js line 35: event listener attached, function updates span textContent |
| `voices.html` `#sort-last-active` button | `js/voices.js` `activateSortBtn` | `sortBtns` array + `forEach click listener` | WIRED | voices.js lines 16-21 (array includes button), lines 116-117 (click listener on all buttons) |
| `js/voices.js` `sortIdentities` last-active branch | `identity.last_active` data | `else if (sortBy === 'last-active')` case | WIRED | voices.js lines 93-97: branch reached when `currentSort === 'last-active'`, `currentSort` set by `activateSortBtn` which strips `'sort-'` prefix |
| `js/voices.js` template | `Utils.formatRelativeTime` | ternary on `identity.last_active` | WIRED | voices.js line 78: `Utils.formatRelativeTime(identity.last_active)` called inside template literal |
| `profile.html` `#profile-facilitator` | `js/profile.js` `loadFacilitatorName` | `document.getElementById('profile-facilitator')` | WIRED | profile.js line 106: getElementById match, line 108: textContent set, line 109: display shown |
| `js/profile.js` `loadFacilitatorName` | Supabase RPC | `Auth.getClient().rpc('get_identity_facilitator_name', ...)` | WIRED (client-side) | profile.js lines 103-104: RPC call made — live SQL function execution requires human verification |
| `dashboard.html` `#bio-char-count` | `js/dashboard.js` `identityBio` listener | `bioCharCount.textContent = count` in `input` event | WIRED | dashboard.js lines 103-107: listener updates span directly |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PROF-05 | 08-01 | Submit form content textarea shows character count / length feedback | SATISFIED | `#content-char-count` span in submit.html, `updateContentCharCount()` in submit.js with input listener, color thresholds at 90% and 100% of 50,000 |
| PROF-06 | 08-01 | Bio fields show character count / length feedback | SATISFIED | Pre-existing `identityBio` input listener in dashboard.js (lines 103-107), `#bio-char-count` span in dashboard.html (line 214) — verified, no changes needed |
| PROF-07 | 08-02 | Facilitator-to-identity linking is accurate and cleanly displayed on profiles | SATISFIED (code) / NEEDS HUMAN (live) | SQL patch file exists with correct SECURITY DEFINER function; profile.html has hidden element; profile.js has loadFacilitatorName() fire-and-forget; live SQL execution confirmed by user checkpoint but not programmatically verifiable |
| PROF-08 | 08-01 | Voices page reflects last-active timestamps and consistent model attribution | SATISFIED | 4th sort button in voices.html, null-safe sort in voices.js, conditional "Active N ago" card label in template, `.voice-card__last-active` CSS rule |

No orphaned requirements found — all four PROF-05/06/07/08 IDs appear in the plans and are accounted for.

---

## Anti-Patterns Found

No anti-patterns detected.

Scanned files: `js/submit.js`, `js/voices.js`, `js/profile.js`

- No TODO/FIXME/PLACEHOLDER comments found
- No `return null` or empty implementation stubs found
- No console.log-only handlers found
- Inline script in `submit.html` untouched (only `Auth.init()` call) — no CSP hash regeneration required
- All facilitator name rendering uses `textContent` (not `innerHTML`) — XSS-safe

---

## Human Verification Required

### 1. Submit form character counter — live behavior

**Test:** Open `submit.html` in a browser and type a long string into the Response textarea.
**Expected:** Counter reads "0 / 50,000" initially. Updates on each keystroke. No color change below 45,000 chars. Turns gold (`--accent-gold`) between 45,001 and 50,000. Turns red (`#f87171`) above 50,000. Draft autosave "Draft saved" indicator still appears after ~2 seconds.
**Why human:** Color threshold behavior and dual-listener co-existence (character counter + autosave) require live browser interaction.

### 2. Dashboard bio counter — live color change

**Test:** Open `dashboard.html`, click an existing AI identity to edit it. Type into the Bio textarea until over 500 characters.
**Expected:** Character count updates on each keystroke. Count text turns gold above 500 characters.
**Why human:** The color-change threshold at 500 chars requires live browser interaction to confirm.

### 3. Voices page — last-active sort and keyboard navigation

**Test:** Open `voices.html`. Click "Last active" button. Check ordering. Then use arrow keys to navigate between all 4 sort buttons.
**Expected:** Voices with recent activity appear first; identities with no activity appear at the bottom. "Active N ago" labels appear on cards with activity. Arrow keys move focus through all 4 buttons with wraparound (from "Last active" → "Most active"). Home/End jump to first/last.
**Why human:** Sort correctness depends on real data from Supabase; keyboard focus management requires browser.

### 4. Profile page — facilitator display (identity with facilitator)

**Test:** Visit the profile page (`profile.html?id=...`) for an AI identity that has a facilitator account with a `display_name` set in Supabase.
**Expected:** "Facilitated by [display_name]" appears below the "Last active" line. The rest of the profile renders immediately without waiting for this text.
**Why human:** Requires a known identity UUID with a facilitator who has set display_name; SQL function live execution cannot be verified from static files alone.

### 5. Profile page — facilitator display (identity without facilitator)

**Test:** Visit the profile page for an AI identity with no facilitator.
**Expected:** No "Facilitated by" section visible anywhere in the profile header. No console errors relating to the RPC call.
**Why human:** Requires browser to exercise the null-return code path through the live SECURITY DEFINER function.

---

## Summary

All 9 observable truths are verified at the code level. All 10 artifacts exist and are substantive. All 7 key links are wired. Requirements PROF-05, PROF-06, PROF-07, and PROF-08 are fully covered with no orphaned requirements.

The phase is **code-complete**. The five human verification items above confirm live behavior that cannot be validated statically:

- Character counter visual behavior (color thresholds, live updates)
- Sort order accuracy with real Supabase data
- SQL function execution in production (the SECURITY DEFINER function was confirmed applied via manual checkpoint per 08-02 plan, but this is not programmatically verifiable from the local filesystem)

No blockers or gaps exist in the codebase. All implementations are substantive, wired, and follow the project's conventions (vanilla JS, textContent for user data, external scripts only, no inline script modifications).

---

_Verified: 2026-02-27_
_Verifier: Claude (gsd-verifier)_
