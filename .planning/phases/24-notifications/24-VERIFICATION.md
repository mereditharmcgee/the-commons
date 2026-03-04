---
phase: 24-notifications
verified: 2026-03-04T18:30:00Z
status: gaps_found
score: 7/9 requirements verified
re_verification: false
gaps:
  - truth: "NOTIF-01/02/05/06 marked Pending in REQUIREMENTS.md despite trigger implementations existing in schema"
    status: partial
    reason: "Triggers for new_reply (NOTIF-01), directed_question (NOTIF-02), reaction_received (NOTIF-05), and guestbook_entry (NOTIF-06) exist in sql/schema/02-identity-system.sql and sql/schema/08-v3-column-additions.sql and predate Phase 24. Plan 01 lists them as requirements it covers ('existing triggers already handle NOTIF-01, NOTIF-02, NOTIF-05, NOTIF-06') but REQUIREMENTS.md still marks all four as Pending. The implementations are real but the tracking is wrong."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "NOTIF-01, NOTIF-02, NOTIF-05, NOTIF-06 status still shows Pending — should be Complete"
    missing:
      - "Update REQUIREMENTS.md to mark NOTIF-01, NOTIF-02, NOTIF-05, NOTIF-06 as Complete"
  - truth: "SQL triggers live in production Supabase (NOTIF-03, NOTIF-04)"
    status: partial
    reason: "The SQL patch file is correct and complete. The SUMMARY claims the SQL was executed manually via Supabase SQL Editor and both triggers were verified in pg_trigger. This cannot be confirmed from the codebase — it requires human verification against the live database."
    artifacts:
      - path: "sql/patches/24-01-notification-triggers.sql"
        issue: "File is correct but live deployment cannot be verified programmatically — no Supabase CLI auth available"
    missing:
      - "Human: confirm triggers on_discussion_activity_notify and on_interest_discussion_notify exist in Supabase via SELECT tgname FROM pg_trigger WHERE tgname IN ('on_discussion_activity_notify', 'on_interest_discussion_notify')"
human_verification:
  - test: "Bell icon dropdown opens on click with unread notifications"
    expected: "Clicking the bell icon in the site header opens a floating dropdown showing recent unread notifications, each with title and relative timestamp"
    why_human: "Visual UI behavior — cannot verify DOM interaction, layout, and positioning programmatically"
  - test: "Clicking a notification item marks it read and navigates"
    expected: "Clicking a notification link calls Auth.markAsRead, decrements the badge, removes the unread highlight, then navigates to the linked page"
    why_human: "Requires live auth session and click interaction to test mark-read flow"
  - test: "Mark all read button clears all notifications"
    expected: "Clicking 'Mark all read' calls Auth.markAllAsRead, empties the list, shows empty state, sets badge to 0"
    why_human: "Requires live auth session with existing unread notifications"
  - test: "Dropdown closes on outside click"
    expected: "Clicking anywhere outside the dropdown or bell button closes the dropdown"
    why_human: "Requires browser interaction to test document click handler"
  - test: "Mobile responsive: dropdown does not overflow at <600px"
    expected: "On a narrow viewport the dropdown width is calc(100vw - 2rem) and right: -1rem so it stays within the viewport"
    why_human: "Requires visual inspection on a mobile viewport"
  - test: "SQL triggers live in production (NOTIF-03, NOTIF-04)"
    expected: "SELECT tgname FROM pg_trigger WHERE tgname IN ('on_discussion_activity_notify', 'on_interest_discussion_notify') returns 2 rows"
    why_human: "No Supabase CLI auth available — must be verified in Supabase dashboard SQL editor"
---

# Phase 24: Notifications Verification Report

**Phase Goal:** Users and agents receive timely notifications for direct interactions, and can view them via bell icon, dropdown, and dashboard history
**Verified:** 2026-03-04T18:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Success Criteria (from ROADMAP.md)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | A notification is created when someone replies, directs a post, posts in a participated discussion, creates a discussion in a followed interest, reacts, or leaves a guestbook entry | PARTIAL | NOTIF-03 and NOTIF-04 triggers exist in the SQL patch. NOTIF-01 (new_reply), NOTIF-02 (directed_question), NOTIF-05 (reaction_received), NOTIF-06 (guestbook_entry) triggers exist in schema files but REQUIREMENTS.md marks them Pending. Live DB deployment unverifiable programmatically. |
| 2 | The site header displays a bell icon with an unread notification count that updates without full page reload | VERIFIED | auth.js updateUI shows bell and calls updateNotificationBadge() at line 868; updateNotificationBadge() calls getUnreadCount() and updates the DOM badge element |
| 3 | Clicking the bell icon opens a dropdown showing recent notifications with links to the relevant content | VERIFIED | js/notifications.js (335 lines) implements bell-click toggle, Auth.getNotifications(10, true), renderItem() with anchor links; CSS positions .notification-dropdown absolute below bell |
| 4 | The user dashboard shows a full scrollable notification history with read/unread distinction | VERIFIED | dashboard.html has #notifications-list; dashboard.js loadNotifications() renders .notification-item--unread class, "Mark read" per-item button, pagination append, filter tabs |

**Score:** 3 of 4 success criteria fully verified; 1 partially verified (existing trigger implementations confirmed in schema, live DB state and REQUIREMENTS.md status unverified)

---

### Observable Truths (from Plan must_haves)

#### Plan 01 Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | A notification is created when someone posts in a discussion you previously participated in (first post only since your last post) | VERIFIED (file) / HUMAN NEEDED (live DB) | sql/patches/24-01-notification-triggers.sql lines 67-124: notify_on_discussion_activity() with NOT EXISTS deduplication check on (facilitator_id, type, link, read=false); AFTER INSERT ON posts trigger created |
| 2 | A notification is created when a new discussion is created in an interest your AI identity has joined | VERIFIED (file) / HUMAN NEEDED (live DB) | sql/patches/24-01-notification-triggers.sql lines 147-189: notify_on_interest_discussion() queries interest_memberships JOIN ai_identities; AFTER INSERT ON discussions trigger created |
| 3 | Existing triggers still work: reply, directed question, guestbook entry, reaction | VERIFIED (code exists, REQUIREMENTS.md status wrong) | sql/schema/02-identity-system.sql: notify_on_new_post() handles new_reply (NOTIF-01). sql/schema/08-v3-column-additions.sql: notify_on_directed_question() (NOTIF-02), notify_on_guestbook() (NOTIF-06), notify_on_reaction() (NOTIF-05). All four use SECURITY DEFINER and produce correct notification types. |

#### Plan 02 Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Clicking the bell icon opens a dropdown showing recent unread notifications | VERIFIED (code) / HUMAN NEEDED (visual) | js/notifications.js initDropdown() bell click handler calls openDropdown() → Auth.getNotifications(10, true) → renderNotifications(). .notification-dropdown--open class toggled. |
| 2 | Clicking a notification in the dropdown navigates to the content and marks it read | VERIFIED (code) | js/notifications.js renderItem() anchor click handler: Auth.markAsRead(notif.id), decrementBadge(), item class removal, then window.location.href = safeLink |
| 3 | Clicking outside the dropdown closes it | VERIFIED (code) | js/notifications.js line 290-297: document.addEventListener('click') checks !bell.contains(e.target) && !dropdown.contains(e.target) → closeDropdown() |
| 4 | Mark all read button in dropdown header clears all unread notifications | VERIFIED (code) | js/notifications.js line 219-227: markAllBtn click handler calls Auth.markAllAsRead(), clears dropdownList.innerHTML, shows empty state, setBadgeCount(0) |
| 5 | See all link navigates to dashboard.html#notifications | VERIFIED | js/notifications.js line 250: seeAll.href = 'dashboard.html#notifications' |
| 6 | Dashboard filter tabs include categories for new notification types | VERIFIED | dashboard.html lines 116-117: data-type="discussion_activity" (Activity) and data-type="new_discussion_in_interest" (Interests) filter buttons present |
| 7 | Bell badge count updates when items are marked read | VERIFIED (code) | js/notifications.js decrementBadge() and setBadgeCount() functions; auth.js updateNotificationBadge() called on login |

---

### Required Artifacts

| Artifact | Level 1: Exists | Level 2: Substantive | Level 3: Wired | Status |
|---|---|---|---|---|
| `sql/patches/24-01-notification-triggers.sql` | YES | YES — 203 lines, 2 full SECURITY DEFINER trigger functions, CHECK constraint expansion, 8 notification types | PARTIALLY — file correct, live DB deployment is human-verify only | VERIFIED (file) |
| `js/notifications.js` | YES | YES — 335 lines, full IIFE with open/close, fetch, render, mark-read, mark-all-read, teardown, safe URL, relative time | YES — dynamically loaded by nav.js; calls Auth.getNotifications, Auth.markAsRead, Auth.markAllAsRead; listens on authStateChanged | VERIFIED |
| `js/nav.js` | YES | YES — existing nav module, updated with 3-line script injection | YES — loads js/notifications.js on every page at end of DOMContentLoaded | VERIFIED |
| `css/style.css` | YES | YES — 17 .notification-dropdown* classes at lines 3178-3307, mobile breakpoint at 600px, positioned absolute relative to .notification-bell (which has position:relative at line 3145) | YES — classes referenced in js/notifications.js DOM creation | VERIFIED |
| `dashboard.html` | YES | YES — has 6 filter tabs including new Activity and Interests tabs, #notifications-list div | YES — dashboard.js loadNotifications() and filter click handlers use data-type attribute | VERIFIED |

---

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `notify_on_discussion_activity` | `notifications` table | AFTER INSERT ON posts trigger | VERIFIED (SQL) | Line 120-124 of SQL patch: DROP TRIGGER IF EXISTS + CREATE TRIGGER on_discussion_activity_notify |
| `notify_on_interest_discussion` | `interest_memberships` table | AFTER INSERT ON discussions trigger | VERIFIED (SQL) | Lines 164-170: SELECT DISTINCT ai.facilitator_id FROM interest_memberships im JOIN ai_identities ai |
| `js/nav.js` | `js/notifications.js` | Dynamic script injection | VERIFIED | nav.js lines 61-63: createElement('script'), src = 'js/notifications.js', body.appendChild |
| `js/notifications.js` | `Auth.getNotifications` | Function call in openDropdown() | VERIFIED | notifications.js line 191: Auth.getNotifications(10, true, null, 0).then(...) |
| `js/notifications.js` | `Auth.markAsRead` | Function call in renderItem() click handler | VERIFIED | notifications.js line 102: Auth.markAsRead(notif.id).catch(function () {}) |
| `js/notifications.js` | `Auth.markAllAsRead` | Function call in mark-all button handler | VERIFIED | notifications.js line 222: Auth.markAllAsRead().catch(function () {}) |
| `.notification-dropdown` | `.notification-bell` | CSS position:absolute relative to position:relative parent | VERIFIED | css/style.css line 3145: .notification-bell { position: relative }; line 3178: .notification-dropdown { position: absolute; top: 100%; right: 0 } |
| `authStateChanged` event | `initDropdown() / tearDown()` | window.addEventListener in notifications.js | VERIFIED | notifications.js line 316-323: authStateChanged listener; auth.js line 880: dispatchEvent(new CustomEvent('authStateChanged')) |

---

### Requirements Coverage

Plan 01 claims: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06
Plan 02 claims: NOTIF-07, NOTIF-08, NOTIF-09

All 9 requirement IDs from both plans are accounted for.

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| NOTIF-01 | 24-01-PLAN | User receives notification when someone replies to their post | IMPLEMENTATION EXISTS — TRACKING GAP | notify_on_new_post() in sql/schema/02-identity-system.sql line 174 inserts 'new_reply' notification. REQUIREMENTS.md wrongly shows Pending. |
| NOTIF-02 | 24-01-PLAN | User receives notification when a post is directed at their AI identity | IMPLEMENTATION EXISTS — TRACKING GAP | notify_on_directed_question() in sql/schema/08-v3-column-additions.sql line 70. REQUIREMENTS.md wrongly shows Pending. |
| NOTIF-03 | 24-01-PLAN | User receives notification for new posts in discussions they participated in | VERIFIED (SQL file) / HUMAN NEEDED (live DB) | notify_on_discussion_activity() in sql/patches/24-01-notification-triggers.sql. REQUIREMENTS.md shows Complete. |
| NOTIF-04 | 24-01-PLAN | User receives notification for new discussions in interests they follow | VERIFIED (SQL file) / HUMAN NEEDED (live DB) | notify_on_interest_discussion() in sql/patches/24-01-notification-triggers.sql. REQUIREMENTS.md shows Complete. |
| NOTIF-05 | 24-01-PLAN | User receives notification for reactions on their posts | IMPLEMENTATION EXISTS — TRACKING GAP | notify_on_reaction() in sql/schema/08-v3-column-additions.sql line 171. REQUIREMENTS.md wrongly shows Pending. |
| NOTIF-06 | 24-01-PLAN | User receives notification for guestbook entries on their voice profile | IMPLEMENTATION EXISTS — TRACKING GAP | notify_on_guestbook() in sql/schema/08-v3-column-additions.sql line 125. REQUIREMENTS.md wrongly shows Pending. |
| NOTIF-07 | 24-02-PLAN | Bell icon in site header shows unread notification count | VERIFIED | auth.js updateUI shows bell, calls updateNotificationBadge() → getUnreadCount() → updates #notification-badge |
| NOTIF-08 | 24-02-PLAN | Notification dropdown shows recent notifications with links | VERIFIED | js/notifications.js: full dropdown with links, mark-read, mark-all-read, outside-click close |
| NOTIF-09 | 24-02-PLAN | Dashboard shows full notification history | VERIFIED | dashboard.html + dashboard.js: scrollable list, read/unread distinction, filter tabs, load-more |

**Orphaned requirements:** None. All 9 NOTIF IDs in REQUIREMENTS.md appear in plan frontmatter.

**Tracking discrepancy (not a code gap):** REQUIREMENTS.md marks NOTIF-01, NOTIF-02, NOTIF-05, NOTIF-06 as Pending. The implementations exist in pre-Phase-24 schema files. Plan 01 explicitly notes it covers these as verification of existing triggers, not new work. The status in REQUIREMENTS.md should be updated to Complete.

---

### Anti-Patterns Found

| File | Pattern | Severity | Finding |
|---|---|---|---|
| `js/notifications.js` | None found | — | No TODOs, no stubs, no empty handlers, no return null |
| `sql/patches/24-01-notification-triggers.sql` | None found | — | Both trigger functions are complete with proper logic |
| `css/style.css` | None found | — | All .notification-dropdown classes have substantive definitions |
| `js/nav.js` | None found | — | Script injection is a single clean addition |
| `dashboard.html` | None found | — | Two new filter buttons are complete |

No blocker anti-patterns detected.

---

### Human Verification Required

#### 1. SQL Triggers Live in Production (NOTIF-03, NOTIF-04)

**Test:** In the Supabase SQL editor at https://supabase.com/dashboard/project/dfephsfberzadihcrhal/sql/new, run:
```sql
SELECT tgname FROM pg_trigger
WHERE tgname IN ('on_discussion_activity_notify', 'on_interest_discussion_notify');
```
**Expected:** Returns 2 rows with both trigger names.
**Also verify the CHECK constraint:**
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'notifications_type_check';
```
**Expected:** Constraint includes all 8 types including 'discussion_activity' and 'new_discussion_in_interest'.
**Why human:** No Supabase CLI auth is available in this environment; cannot query the live database programmatically.

#### 2. Bell Icon Dropdown Visual Behavior

**Test:** On the deployed branch, log in with an account that has at least one unread notification. Click the bell icon.
**Expected:** A dropdown panel appears below the bell showing unread notification items with title, relative timestamp, and a clickable link. The panel has a "Mark all read" button in the header and "See all notifications" in the footer.
**Why human:** Visual layout, positioning relative to the bell, and DOM interaction require a browser.

#### 3. Notification Click — Mark Read and Navigate

**Test:** In the open dropdown, click a notification item.
**Expected:** The item's unread highlight (gold left border, gold-glow background) disappears, the badge count decrements by 1, and the browser navigates to the linked page (discussion, profile, etc.).
**Why human:** Requires live auth session and click interaction.

#### 4. Mark All Read Button

**Test:** Click the bell to open the dropdown, then click "Mark all read".
**Expected:** The notification list clears, the empty state message "No unread notifications" appears, and the badge disappears (display: none).
**Why human:** Requires live auth session with existing unread notifications.

#### 5. Outside-Click Closes Dropdown

**Test:** Open the dropdown, then click on a part of the page outside the dropdown and the bell.
**Expected:** The dropdown closes.
**Why human:** Requires browser interaction to test the document click listener.

#### 6. Mobile Viewport — Dropdown Does Not Overflow

**Test:** Open the site on a mobile browser or resize to < 600px. Log in. Click the bell.
**Expected:** The dropdown width is capped at calc(100vw - 2rem) and right-aligned at -1rem so the full dropdown is visible without horizontal scroll.
**Why human:** Requires visual inspection at a narrow viewport width.

---

### Gaps Summary

Two gaps block a clean "passed" verdict:

**Gap 1 — REQUIREMENTS.md tracking discrepancy (low risk):**
NOTIF-01, NOTIF-02, NOTIF-05, NOTIF-06 are marked Pending in REQUIREMENTS.md despite having working trigger implementations in the existing schema (02-identity-system.sql, 08-v3-column-additions.sql). Plan 01 explicitly acknowledges these exist and claims them as covered requirements. The code is correct; only the tracking document is stale. This does not affect functionality but creates confusion about what is actually incomplete.

**Gap 2 — Live DB deployment is human-verify only (medium risk):**
The SQL patch file (24-01-notification-triggers.sql) is correct and complete. The SUMMARY documents that it was executed via the Supabase SQL Editor and both triggers were verified in pg_trigger. However, this cannot be confirmed programmatically without Supabase CLI auth. If the SQL was not actually applied, NOTIF-03 and NOTIF-04 would silently fail to generate notifications. Human verification against the live database is required to close this gap.

Neither gap is a code quality issue — the implementation artifacts are all substantive and correctly wired.

---

_Verified: 2026-03-04T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
