---
phase: 15-directed-questions
verified: 2026-02-28T00:00:00Z
status: human_needed
score: 10/10 must-haves verified
re_verification: false
human_verification:
  - test: "Submit form directed-to dropdown — end-to-end flow"
    expected: "Log in, select an AI identity from the dropdown on submit.html, verify the 'Direct to a voice' dropdown appears listing all other active voices (not the user's own). Select a voice, submit a post, then verify directed_to UUID is saved in the database for that post."
    why_human: "Cannot programmatically verify Supabase network calls or database state. UI show/hide behavior requires browser interaction."
  - test: "URL pre-fill of directed-to on submit form"
    expected: "Navigate to submit.html?directed_to=[valid-identity-id], select an AI identity from the identity dropdown, verify the 'Direct to a voice' dropdown auto-selects the pre-filled voice."
    why_human: "URL param pre-fill requires browser execution of JS and form state verification."
  - test: "Directed badge and left border in discussion thread"
    expected: "Open a discussion page that has a post with directed_to set in the database. The badge 'Question for [voice name]' should appear above the post content, styled with the target voice's model color (e.g. gold for Claude). A colored left border should appear on the article."
    why_human: "Requires a directed post to exist in the database and visual rendering verification."
  - test: "Badge and border disappear after sort toggle"
    expected: "On a discussion page with directed posts, toggle sort order (Oldest/Newest). Verify whether directed badges re-appear after the sort re-render. (Expected: badges are LOST after sort toggle — see Warning in report.)"
    why_human: "This is a known partial coverage gap. Human must confirm actual behavior and decide if acceptable."
  - test: "Ask a question button on profile page"
    expected: "Open profile.html?id=[any-identity-id]. The 'Ask a question' button should be visible and its href should be submit.html?directed_to=[that-id]. Button should be visible to ALL visitors (not gated by login)."
    why_human: "Dynamic href wiring and display visibility require browser rendering."
  - test: "Questions tab on profile page — count badge"
    expected: "On profile.html for an identity that has directed questions, the Questions tab should show a count badge with the number of UNANSWERED questions before the tab is clicked."
    why_human: "Requires directed questions in DB and non-blocking IIFE behavior verification."
  - test: "Questions tab — Waiting and Answered split"
    expected: "Click the Questions tab. Directed posts should split into 'Waiting' (target voice has not replied in that discussion) and 'Answered' (target voice has at least one post in that discussion). Each question shows model badge, author name, discussion link, timestamp, and 200-char content snippet."
    why_human: "Requires DB data and visual verification of the two-query answered detection logic."
  - test: "Facilitator notification on directed question (DIRQ-04)"
    expected: "Insert a post with directed_to set to a valid ai_identity UUID. The DB trigger notify_on_directed_question should fire and create a notification for the identity's facilitator. Verify by checking the notifications table and the notification bell in the facilitator's browser session."
    why_human: "DB trigger behavior and notification delivery require database access and live session testing."
---

# Phase 15: Directed Questions Verification Report

**Phase Goal:** Users can address posts to specific AI voices, profiles surface the questions waiting for that voice, and facilitators are notified
**Verified:** 2026-02-28
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Submit form shows a 'Direct to a voice' dropdown when a logged-in user selects an AI identity | VERIFIED | `submit.html` lines 143-150: `#directed-to-section` with `#directed-to` select, `display:none`. `js/submit.js` lines 226-227: `directedToSection.style.display = 'block'` in `identitySelect` change handler when identity selected. |
| 2 | Selecting a voice from the dropdown and submitting includes directed_to UUID in the POST body | VERIFIED | `js/submit.js` lines 371-375: `data.directed_to = directedTo` guarded by `if (directedTo)`, passed to `Utils.createPost(data)` at line 418. |
| 3 | Arriving at submit.html?directed_to=[id] pre-selects that voice in the dropdown once an identity is chosen | VERIFIED | `js/submit.js` line 48: `preselectedDirectedTo = Utils.getUrlParam('directed_to')`. Lines 266-269: `if (preselectedDirectedTo) { directedToSelect.value = preselectedDirectedTo; }` inside `loadDirectedToOptions()`. |
| 4 | Directed posts in discussion threads display a 'Question for [voice name]' badge with the target's model color | VERIFIED | `js/discussion.js` lines 434-441: badge HTML injected via `insertAdjacentHTML('beforebegin', badgeHtml)` with class `post__directed-badge--${modelClass}`. `css/style.css` lines 891-906: 7 model color variants + other fallback. |
| 5 | Directed posts have a subtle left border accent in the target voice's model color | VERIFIED | `js/discussion.js` lines 444-445: `article.style.setProperty('--directed-color', colorVar)`. `css/style.css` lines 909-911: `article.post[data-directed-to] { border-left: 3px solid var(--directed-color, var(--border-subtle)); }`. |
| 6 | Profile pages show an 'Ask a question' button linking to submit.html?directed_to=[id] | VERIFIED | `profile.html` lines 89-91: `#ask-voice-btn` anchor, initially hidden. `js/profile.js` lines 77-81: `askBtn.href = submit.html?directed_to=${identityId}` and `askBtn.style.display = ''` after identity loads. |
| 7 | Profile pages show a 'Questions' tab with an unanswered count badge | VERIFIED | `profile.html` lines 129-132: `#profile-tab-questions` button with `#questions-count-badge` span. `js/profile.js` lines 189-216: non-blocking IIFE fetches directed posts, determines unanswered count, shows badge. |
| 8 | Clicking the Questions tab shows directed posts split into Waiting and Answered sections | VERIFIED | `js/profile.js` lines 504-576: `loadQuestions()` fetches directed posts, queries replies to determine `answeredDiscs`, splits into `waiting` and `answered` arrays, renders with section headers. `activateTab()` line 607-609 dispatches to `loadQuestions()`. |
| 9 | A directed question is 'answered' if the target voice has replied in the same discussion | VERIFIED | `js/profile.js` lines 523-529: queries `ai_identity_id=eq.{identityId}` with `discussion_id=in.(...)` to find discussions where the identity has posted. Result used as `answeredDiscs` Set. |
| 10 | Facilitators are notified when their AI identity gets a directed question | VERIFIED | `sql/schema/08-v3-column-additions.sql`: `notify_on_directed_question()` trigger function + `on_directed_question_notify` trigger defined. Fires AFTER INSERT on posts when `directed_to IS NOT NULL`. Creates `directed_question` notification for the identity's facilitator. No new JS needed — existing notification bell in auth.js renders these. |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `submit.html` | Directed-to dropdown HTML element inside form | VERIFIED | Lines 143-150: `#directed-to-section` form group with `#directed-to` select. Contains `directed-to-section` ID. |
| `js/submit.js` | Dropdown population, show/hide logic, URL param pre-fill, form data inclusion | VERIFIED | `loadDirectedToOptions()` lines 244-273 (populate + pre-fill). Identity change handler lines 214-235 (show/hide). Form data lines 371-375 (inclusion). URL param line 48. |
| `js/discussion.js` | data-directed-to attribute on articles, loadDirectedData() bulk fetch, renderDirectedBadge() | VERIFIED | Line 263: `data-directed-to` attribute. Lines 400-447: `loadDirectedData()` with bulk fetch and surgical DOM update. Badge injection at line 436. Module-level `directedIdentities` Map at line 35. |
| `profile.html` | Ask a question button element with `ask-voice-btn` ID | VERIFIED | Lines 89-91: `#ask-voice-btn` anchor element present. |
| `js/profile.js` | Dynamic href wiring for ask button | VERIFIED | Lines 77-81: `askBtn.href` and `askBtn.style.display` set after identity loads. |
| `profile.html` | 6th tab button (Questions) with count badge span, tab content panel #tab-questions | VERIFIED | Lines 129-132: `#profile-tab-questions` with `data-tab="questions"`. Lines 167-172: `#tab-questions` content panel with `#questions-list`. |
| `js/profile.js` | loadQuestions() function, non-blocking count badge update, activateTab hook | VERIFIED | `loadQuestions()` lines 504-576. IIFE count badge lines 189-216. `activateTab` else-if at lines 607-609. `questionsList` ref at line 29. |
| `css/style.css` | Directed badge styles with per-model color variants, left border accent | VERIFIED | Lines 877-906: `.post__directed-badge` base + 8 model variants. Lines 908-911: `article.post[data-directed-to]` border-left. Lines 913-928: `.tab-count-badge`. Lines 930-975: `.questions-section-title`, `.question-item`, and sub-element styles. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `js/submit.js` | POST /rest/v1/posts | `data.directed_to` in `Utils.createPost(data)` | WIRED | Line 374: `data.directed_to = directedTo` before `Utils.createPost(data)` at line 418. |
| `js/discussion.js` | GET /rest/v1/ai_identities | `loadDirectedData()` bulk fetch after `renderPosts()` | WIRED | Lines 410-414: `Utils.get(CONFIG.api.ai_identities, {...})` inside `loadDirectedData()`. Called at lines 87 and 163 after `renderPosts()`. |
| `profile.html` | `submit.html` | `ask-voice-btn` href with `directed_to` param | WIRED | `profile.html` line 89: element exists. `js/profile.js` line 79: `askBtn.href = submit.html?directed_to=${identityId}`. |
| `js/profile.js` | GET /rest/v1/posts?directed_to=eq.{id} | `Utils.get()` in `loadQuestions()` | WIRED | Line 509: `directed_to: \`eq.${identityId}\`` in `Utils.get(CONFIG.api.posts, {...})`. Also in IIFE at line 192. |
| `js/profile.js` | GET /rest/v1/posts?ai_identity_id=eq.{id} | `Utils.get()` for answered-status check | WIRED | Line 525: `ai_identity_id: \`eq.${identityId}\`` in `Utils.get(CONFIG.api.posts, {...})`. |
| `profile.html` | `js/profile.js` | `data-tab="questions"` activateTab() dispatch | WIRED | `profile.html` line 129: `data-tab="questions"`. `js/profile.js` lines 607-609: `else if (tabName === 'questions') { await loadQuestions(); }`. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DIRQ-01 | 15-01 | User can optionally direct a post to a specific AI identity via a dropdown on the submit form | SATISFIED | `#directed-to-section` in submit.html, `loadDirectedToOptions()` in submit.js, `data.directed_to` in form POST. End-to-end wired. |
| DIRQ-02 | 15-01 | Directed posts display a "Question for [voice name]" label in discussion threads | SATISFIED | `loadDirectedData()` in discussion.js injects `.post__directed-badge` with per-model color variants. `article.post[data-directed-to]` left border in CSS. |
| DIRQ-03 | 15-02 | Profile pages show a "Questions waiting" section with posts directed to that identity | SATISFIED | Questions tab (6th tab) in profile.html with `loadQuestions()` rendering Waiting/Answered split. Non-blocking count badge shows unanswered count before tab is clicked. |
| DIRQ-04 | 15-02 | Facilitator receives a notification when their AI identity gets a directed question | SATISFIED | `notify_on_directed_question` DB trigger in `sql/schema/08-v3-column-additions.sql` handles this server-side. No new JS required — existing notification bell in auth.js renders `directed_question` notifications. |
| DIRQ-05 | 15-01 | "Ask this voice a question" link appears on profile pages linking to submit form | SATISFIED | `#ask-voice-btn` in profile.html, wired dynamically in profile.js with `submit.html?directed_to=${identityId}`. Visible to all visitors. |

No orphaned requirements: all 5 DIRQ IDs (DIRQ-01 through DIRQ-05) are covered by plans 15-01 and 15-02 and accounted for in REQUIREMENTS.md with status "Complete".

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `js/discussion.js` | 681, 704 | `renderPosts()` called without `loadDirectedData()` in sort-toggle and authStateChanged handlers | Warning | Directed badges are lost when user toggles sort order or when auth state changes. `loadReactionData()` has the same omission but reaction bars survive via `updateAllReactionBars()` (surgical update from in-memory state). Directed badges have no equivalent in-memory re-injection mechanism, so they disappear after re-renders triggered by sort toggle or login/logout. |

**No blocker anti-patterns found.** The initial page load path is fully correct. The sort-toggle gap affects a secondary user interaction, not the core directed question flow.

### Human Verification Required

#### 1. Submit Form Directed-to Dropdown — End-to-End

**Test:** Log in with a test account that has at least one AI identity. Navigate to submit.html. Select an AI identity — the "Direct to a voice" dropdown should appear. Verify it lists active voices (excluding the user's own identities). Select a target voice. Submit a post. Check the database to confirm `directed_to` UUID is stored.
**Expected:** Post created with `directed_to` set to the selected identity's UUID.
**Why human:** Network call to Supabase and database state cannot be verified programmatically in this context.

#### 2. URL Pre-fill on Submit Form

**Test:** Navigate to `submit.html?directed_to=[valid-identity-id]`. Select an AI identity from the identity dropdown.
**Expected:** The "Direct to a voice" dropdown auto-selects the pre-specified voice.
**Why human:** Requires browser JS execution and UI state inspection.

#### 3. Directed Badge and Left Border in Discussion Thread

**Test:** Open a discussion that has a post with `directed_to` set in the database (or insert one manually). Verify the badge "Question for [voice name]" appears above the post content, styled with the target voice's model color. Verify a colored left border appears on the article element.
**Expected:** Badge styled in model color, left border using `--directed-color` custom property.
**Why human:** Visual rendering and database data state required.

#### 4. Badge Behavior After Sort Toggle (Warning Confirmation)

**Test:** On a discussion page with directed posts, click the sort toggle (Newest/Oldest).
**Expected:** Directed badges disappear after the sort re-render. Confirm this is the actual behavior and decide if it requires a fix.
**Why human:** This is a known partial gap found during verification. Human must decide if it's acceptable or warrants a follow-up fix.

#### 5. Ask a Question Button on Profile Page

**Test:** Open `profile.html?id=[any-identity-id]`. Verify "Ask a question" button is visible (even when not logged in). Verify its href is `submit.html?directed_to=[that-id]`.
**Expected:** Button visible to all visitors, href correctly set.
**Why human:** Requires browser rendering and dynamic href inspection.

#### 6. Questions Tab Count Badge

**Test:** Open `profile.html?id=[identity-with-directed-questions]` for a profile that has unanswered directed questions. Before clicking the Questions tab, verify the count badge shows the unanswered count.
**Expected:** Badge shows number greater than zero before tab is clicked.
**Why human:** Requires DB state and non-blocking IIFE behavior to observe.

#### 7. Questions Tab — Waiting and Answered Split

**Test:** Click the Questions tab. Verify questions split correctly into Waiting and Answered sections. Verify each item shows model badge, author name, discussion link, timestamp, and content snippet.
**Expected:** Correct split based on whether target voice has any post in the question's discussion thread.
**Why human:** Requires database state with known answered/unanswered distributions to validate.

#### 8. Facilitator Notification on Directed Question (DIRQ-04)

**Test:** Insert a post with `directed_to` set to an AI identity that has a known facilitator. Check the facilitator's notification bell for a `directed_question` notification.
**Expected:** Facilitator receives notification. Notification bell shows the alert.
**Why human:** DB trigger execution and notification delivery require live database and browser session access.

### Gaps Summary

No gaps blocking goal achievement. All 10 observable truths are verified by code inspection. All 5 requirements (DIRQ-01 through DIRQ-05) are covered with substantive, wired implementations.

One warning-level anti-pattern was found: directed question badges are not re-injected when `renderPosts()` is called from the sort toggle or `authStateChanged` handler. This is because `loadDirectedData()` is not called after those two code paths. The badges DO appear correctly on initial page load (the primary user flow). This is a minor UX regression for users who toggle sort order on a discussion that contains directed posts. It does not prevent the phase goal from being achieved but may warrant a one-line fix in a follow-up.

---

_Verified: 2026-02-28_
_Verifier: Claude (gsd-verifier)_
