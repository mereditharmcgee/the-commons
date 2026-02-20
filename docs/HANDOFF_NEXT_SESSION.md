# Handoff: Next Session

Copy this into your next Claude session to pick up where we left off.

---

## Prompt

I need help implementing the **Notification UX** improvement for The Commons (jointhecommons.space).

### Background
- **Repo:** `C:\Users\mmcge\the-commons`
- **Architecture:** Static HTML/CSS/JS + Supabase PostgreSQL, no framework, no build step
- **CLAUDE.md:** Read `CLAUDE.md` in repo root for full project overview
- **Improvement plan:** Read `docs/IMPROVEMENTS.md` — items 1–9 are shipped, item 10 (Notification UX) is next

### What was done this session (February 20, 2026)

- Replaced `og-image.svg` with PNG version for better Twitter/Facebook compatibility (updated all 13 HTML files)
- Updated `README.md` — repo structure section now reflects all 26+ pages, 20 JS files, docs, and SQL schemas

**Previous sessions (also February 20, 2026):**

- Accessibility Phase 1 — Skip links, semantic landmarks, ARIA labels
- Accessibility Phase 2 — Modal focus management (focus trapping, focus restoration, Escape to close)
- Accessibility Phase 3 — Keyboard navigation (focus-visible indicators, arrow keys for tabs/sort, expandable sections)
- Accessibility Phase 4 — Screen reader polish (aria-describedby, aria-expanded, aria-pressed, live region announcements)
- Encoding fix — Fixed double-encoded UTF-8 across all 26 HTML files

### Task: Notification UX (IMPROVEMENTS.md item 10)

**Goal:** Improve notifications to handle notification fatigue as the community grows.

**Spec (from `docs/IMPROVEMENTS.md`, lines 276–294):**
1. Per-item "mark as read" button (not just "mark all as read")
2. Filter tabs: All / Replies / Follows / Mentions
3. Pagination: load 20 at a time with "Load more" button
4. Optional: auto-read on scroll

---

### Current state of notification code

**Database schema** (`sql/identity-system.sql`, lines 116–143):
```sql
CREATE TABLE notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    facilitator_id UUID REFERENCES facilitators(id) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('new_post', 'new_reply', 'identity_posted')),
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Indexes: notifications_unread_idx (facilitator_id, read WHERE false)
--          notifications_recent_idx (facilitator_id, created_at DESC)
```

**Important:** The `type` column has 3 values: `new_post`, `new_reply`, `identity_posted`. The spec says "Replies / Follows / Mentions" but there is no `mention` type in the DB. Map the filter tabs as:
- **All** → no filter
- **Replies** → `type = 'new_reply'`
- **Follows** → `type IN ('new_post', 'identity_posted')` (both are from subscriptions)
- Drop the "Mentions" tab unless you add a mention type later

**Auth methods** (`js/auth.js`, lines 639–715):
- `Auth.getNotifications(limit = 20, unreadOnly = false)` — already accepts `limit` and `unreadOnly` params. Queries `notifications` table with `select('*')`, ordered by `created_at DESC`.
- `Auth.getUnreadCount()` — returns count of unread.
- `Auth.markAsRead(notificationId)` — marks single notification as read. **Already exists** — the spec says "add if missing" but it's there.
- `Auth.markAllAsRead()` — marks all unread as read.
- `Auth.updateNotificationBadge()` — updates the bell badge in nav.

**Note:** `getNotifications()` does NOT currently support filtering by `type`. You'll need to either:
- Add a `type` filter parameter to `getNotifications()` in `auth.js`, OR
- Filter client-side after fetching (simpler for now, but less efficient at scale)

For pagination, `getNotifications()` uses `.limit(limit)` but has no offset/cursor. You'll need to add `.range(offset, offset + limit - 1)` support.

**Dashboard JS** (`js/dashboard.js`, lines 284–333):
```javascript
async function loadNotifications() {
    // Fetches 20 notifications via Auth.getNotifications(20)
    // Renders each as .notification-item with title, message, time, optional link
    // Click handler: marks item as read, removes --unread class
}

// Mark all as read button handler at line 329
markAllReadBtn.addEventListener('click', async () => {
    await Auth.markAllAsRead();
    await loadNotifications();
    Auth.updateNotificationBadge();
});
```

**Dashboard HTML** (`dashboard.html`, lines 101–112):
```html
<section class="dashboard-section dashboard-section--notifications">
    <div class="dashboard-section__header">
        <h2 class="dashboard-section__title">Notifications</h2>
        <button id="mark-all-read-btn" class="btn btn--ghost btn--small">
            Mark all read
        </button>
    </div>
    <div id="notifications-list" class="notification-list">
        <!-- Loaded dynamically -->
    </div>
</section>
```

**CSS** (`css/style.css`, lines 2636–2680):
- `.notification-list` — no list-style
- `.notification-item` — padding, bottom border, hover bg
- `.notification-item--unread` — gold glow background
- `.notification-item__title` / `__message` / `__time` / `__link` — standard text styles

---

### Implementation plan

**1. Add filter tabs to `dashboard.html`** (between header and list):
```html
<div class="notification-filters" role="tablist" aria-label="Filter notifications">
    <button class="notification-filter notification-filter--active" role="tab"
            aria-selected="true" data-filter="all">All</button>
    <button class="notification-filter" role="tab"
            aria-selected="false" data-filter="new_reply">Replies</button>
    <button class="notification-filter" role="tab"
            aria-selected="false" data-filter="follows">Follows</button>
</div>
```

**2. Add per-item mark-as-read button** in the notification render (dashboard.js):
Add an `<button>` with class `notification-item__mark-read` inside each unread notification item.

**3. Add pagination** — "Load more" button after the list:
```html
<button id="notifications-load-more" class="btn btn--ghost btn--small" style="display:none;">
    Load more
</button>
```

**4. Update `Auth.getNotifications()`** in `auth.js`:
- Add `type` parameter for server-side filtering
- Add `offset` parameter for pagination: `.range(offset, offset + limit - 1)`

**5. Update `loadNotifications()`** in `dashboard.js`:
- Track `currentFilter` and `currentOffset` state variables
- On filter tab click: reset offset, reload with filter
- On "Load more" click: increment offset, append results
- Wire up per-item mark-as-read buttons

**6. Add CSS** in `style.css`:
- `.notification-filters` — flex row with gap
- `.notification-filter` — pill/tab styling matching the sort tabs pattern used elsewhere
- `.notification-filter--active` — gold accent
- `.notification-item__mark-read` — small ghost button

### Key files to modify
- `dashboard.html` — Filter tabs markup, load-more button
- `js/dashboard.js` — Filter logic, pagination state, per-item read button handlers
- `js/auth.js` — Add type filter and offset params to `getNotifications()`
- `css/style.css` — Filter tab and mark-read button styles

### Style reference
Look at the existing sort tabs in `discussion.html` / `js/discussion.js` for a pattern to follow — they use `role="tablist"` with `aria-selected`, which is the same pattern to use for notification filters. The chat "Load earlier messages" button in `js/chat.js` is a good reference for the "Load more" pagination pattern.

---

### Key files
- `CLAUDE.md` — Project overview and instructions for Claude Code
- `docs/IMPROVEMENTS.md` — The master improvement plan with specs (items 1-9 shipped, item 10 next)
- `docs/HANDOFF.md` — Full project architecture
- `js/dashboard.js` — **Primary file to modify** (notification section starts at line 284)
- `js/auth.js` — `getNotifications()` at line 639, `markAsRead()` at line 686
- `dashboard.html` — Notification section markup at line 101
- `css/style.css` — Notification styles at line 2636
- `js/chat.js` — Reference for "Load earlier" pagination pattern
- `js/discussion.js` — Reference for sort tab pattern

---

*Last updated: February 20, 2026*
*Items 1–9 shipped. Item 10 (Notification UX) is next.*
