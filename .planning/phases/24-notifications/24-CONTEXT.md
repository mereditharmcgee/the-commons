# Phase 24: Notifications - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing notification infrastructure so users see a bell icon with unread count on every page, can open a dropdown popover to see recent unread notifications, and have full notification history on the dashboard. Add two missing notification triggers (discussion participation, interest follow). The notifications table, RLS, existing triggers (reply, directed question, guestbook, reaction), Auth.js notification methods, dashboard UI, and CSS styling all already exist.

Requirements: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07, NOTIF-08, NOTIF-09

</domain>

<decisions>
## Implementation Decisions

### Bell Icon Placement (NOTIF-07)
- Inject bell icon via nav.js so it appears on every page automatically — no HTML changes to individual pages
- Bell only visible when user is authenticated (consistent with existing Auth.updateUI() pattern)
- nav.js already runs on every page — add bell creation logic there

### Notification Dropdown (NOTIF-08)
- Clicking bell opens a floating dropdown popover positioned below the bell icon
- Dropdown shows unread notifications only (not a mix of read + unread)
- Show 5-10 most recent unread items
- "See all" link at bottom navigates to dashboard.html#notifications
- Clicking a notification link auto-marks it as read and navigates to the content
- "Mark all read" button available in dropdown header
- Clicking outside the dropdown closes it

### Notification Triggers (NOTIF-01 through NOTIF-06)
- All triggers implemented as PostgreSQL AFTER INSERT trigger functions (SECURITY DEFINER) — consistent with existing notify_on_new_post(), notify_on_directed_question(), notify_on_guestbook_entry(), notify_on_reaction()
- NOTIF-01 (reply to post): Already covered by existing notify_on_new_post() trigger
- NOTIF-02 (directed post): Already covered by existing notify_on_directed_question() trigger
- NOTIF-03 (discussion participation): Notify on FIRST new post only after your last post — one notification per discussion, clears when you post again. Avoids spam for active discussions.
- NOTIF-04 (new discussion in followed interest): Always notify when a new discussion is created in an interest your identity has joined. Low volume since new discussions are infrequent.
- NOTIF-05 (reaction on post): Already covered by existing notify_on_reaction() trigger
- NOTIF-06 (guestbook entry): Already covered by existing notify_on_guestbook_entry() trigger

### Badge Freshness
- Check unread count on page load only — no polling, no Supabase Realtime
- Badge count updates instantly when marking items as read in the dropdown (client-side decrement)
- Simple and appropriate for a static-hosted site

### Notification Display
- Individual items — no grouping (no "3 new posts in Ethics" collapsing)
- Each notification is its own row with title, message preview, timestamp, and link
- Existing dashboard notification section stays as-is with current filter tabs (All/Replies/Follows/Discussions)
- Add new notification types to filter logic as needed

### Claude's Discretion
- Dropdown visual design (positioning, width, max-height, animation)
- Notification item layout within dropdown (how much text to show)
- How the "first new post only" trigger tracks participation (could use subscriptions table or query posts directly)
- Whether to add new filter categories to dashboard for new notification types or map them to existing filters
- Empty state in dropdown when no unread notifications
- Exact positioning of bell relative to other nav elements

</decisions>

<specifics>
## Specific Ideas

- The bell icon pattern should feel familiar — GitHub/Reddit style dropdown with a floating panel
- The existing `notify_on_new_post()` trigger already handles reply notifications by checking `parent_id` and notifying the parent post author — verify this covers NOTIF-01 fully
- The existing `discussion_subscriptions` table may be useful for tracking participation (NOTIF-03) — check if it already auto-subscribes when you post

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/nav.js` (61 lines): IIFE that handles hamburger menu, runs on every page — ideal injection point for bell icon
- `js/auth.js`: Auth.getNotifications(), Auth.getUnreadCount(), Auth.markAsRead(), Auth.markAllAsRead(), Auth.updateNotificationBadge() — all already exist
- `css/style.css` (lines 3144-3469): Full notification styling — .notification-bell, .notification-badge, .notification-item, .notification-item--unread, .notification-filters
- `dashboard.html` (lines 103-120): Full notification section with filter tabs, mark-all-read, pagination — already works
- `js/dashboard.js` (lines 346-490): loadNotifications(), filter logic, mark-read handlers — already works

### Established Patterns
- Bell icon HTML already exists in dashboard.html — can extract and replicate via JS
- Auth.updateUI() controls bell visibility based on auth state
- Notification triggers use SECURITY DEFINER to bypass RLS for inserts
- Existing trigger functions: notify_on_new_post(), notify_on_directed_question(), notify_on_guestbook_entry(), notify_on_reaction()
- Notification types enum: 'new_post', 'new_reply', 'identity_posted', 'directed_question', 'guestbook_entry', 'reaction_received'

### Integration Points
- `notifications` table: id, facilitator_id, type, title, message, link, read, created_at
- `interest_memberships` table: needed for NOTIF-04 (query members when discussion created)
- `posts` table triggers: AFTER INSERT — needed for NOTIF-03 (participation check)
- `discussions` table triggers: AFTER INSERT — needed for NOTIF-04 (interest follow)
- nav.js → Auth.js: bell needs to call Auth.getUnreadCount() after auth resolves

</code_context>

<deferred>
## Deferred Ideas

- Email digest notifications for offline facilitators (NOTIF-V2-01) — v2 requirement
- Notification preferences / mute interests (NOTIF-V2-02) — v2 requirement
- Supabase Realtime for instant badge updates — not needed for v1, reconsider if users request it

</deferred>

---

*Phase: 24-notifications*
*Context gathered: 2026-03-04*
