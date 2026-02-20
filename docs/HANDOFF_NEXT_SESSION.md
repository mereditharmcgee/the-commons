# Handoff: Next Session

Copy this into your next Claude session to pick up where we left off.

---

## Prompt

I need help continuing improvements for The Commons (jointhecommons.space).

### Background
- **Repo:** `C:\Users\mmcge\the-commons`
- **Architecture:** Static HTML/CSS/JS + Supabase PostgreSQL, no framework, no build step
- **CLAUDE.md:** Read `CLAUDE.md` in repo root for full project overview
- **Improvement plan:** Read `docs/IMPROVEMENTS.md` — items 1–10 shipped, items 11–14 specced and ready

### What was done this session (February 20, 2026)

**Items 1–10 all shipped** (see IMPROVEMENTS.md for details on each).

**New improvement specs written (items 11–14):**

1. **Item 11: Email Notification Digests** — Supabase Edge Function approach for daily/weekly email digests. Includes `notification_preferences` table spec, Edge Function outline, email template, and 3 phases (preferences UI → daily digest → instant notifications). Highest effort item — requires Edge Functions and email service setup.

2. **Item 12: Gathering UX Improvements** — 3 phases: (1) Presence indicator using Supabase Realtime Presence ("X voices present"), (2) Message edit/delete for own messages with 5-minute edit window, (3) Reconnection UX with gap-fill messaging.

3. **Item 13: Postcards Admin Dashboard** — 3 phases: (1) Prompt management in admin (create, activate/deactivate, view stats per prompt), (2) Featured postcards (`is_featured` column, highlighted display, homepage integration), (3) Prompt archive public page.

4. **Item 14: Follower Counts & Activity Feed** — 3 phases: (1) Follower counts on `ai_identity_stats` view + display on profile/voices pages, (2) Auto-follow on post (submit → auto-subscribe to discussion), (3) Personalized activity feed on dashboard.

**Also done this session:**
- Search feature (`search.html`, `js/search.js`) — full-text search across discussions, posts, marginalia, postcards, voices
- Admin dashboard updates (`js/admin.js`, `admin.html`) — Claude admin login SQL patch, UI improvements
- Discussion response count fix
- Notification UX (item 10) — filter tabs, per-item mark-as-read, pagination
- Accessibility Phases 1-4
- OG image PNG conversion
- UTF-8 encoding fix across all HTML files

### What should come next

Items 11-14 are fully specced in `docs/IMPROVEMENTS.md` with recommended implementation order:

1. **Item 14, Phase 1** (Follower counts) — Low effort, immediate social value
2. **Item 14, Phase 2** (Auto-follow on post) — Low effort, reduces friction
3. **Item 13, Phase 1** (Postcards prompt admin) — Medium effort, unblocks prompt management
4. **Item 12, Phase 1** (Gathering presence) — Medium effort, makes chat feel alive
5. **Item 12, Phase 2** (Chat edit/delete) — Medium effort, quality of life
6. **Item 13, Phase 2** (Featured postcards) — Medium effort, curation
7. **Item 14, Phase 3** (Activity feed) — Higher effort, major engagement feature
8. **Item 11** (Email digests) — Highest effort, requires Supabase Edge Functions

Each phase is designed to be completable in a single session.

### Community feedback items (also ready)
- See `docs/COMMUNITY_FEEDBACK_FEB2026.md` for:
  - Collapsible threads (coyotefather — specs ready, community contribution welcome)
  - Facilitator notes on posts (new `facilitator_note` column)
  - Editable `model_version` on posts

### Key files
- `CLAUDE.md` — Project overview and instructions for Claude Code
- `docs/IMPROVEMENTS.md` — The master improvement plan (items 1-10 shipped, 11-14 specced)
- `docs/HANDOFF.md` — Full project architecture
- `docs/COMMUNITY_FEEDBACK_FEB2026.md` — Community feedback tracker
- `js/discussion.js` — Threading, edit/delete, post rendering (most complex)
- `js/dashboard.js` — Dashboard with modals, notification filters/pagination/mark-as-read
- `js/chat.js` — Gathering live chat (has pagination, realtime)
- `js/auth.js` — Authentication, identity management, notifications (with type/offset params)
- `js/search.js` — Site-wide search across all content types
- `js/admin.js` — Admin dashboard (auth-gated via RLS, postcards/posts/marginalia management)
- `js/config.js` — Central configuration (all endpoints consolidated)
- `css/style.css` — All styles

---

*Last updated: February 20, 2026*
*Items 1-10 shipped. Items 11-14 specced with detailed implementation plans.*
