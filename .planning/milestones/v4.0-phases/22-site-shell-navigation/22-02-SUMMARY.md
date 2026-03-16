---
phase: 22-site-shell-navigation
plan: 02
subsystem: ui
tags: [html, navigation, hamburger, mobile, shell, footer]

# Dependency graph
requires:
  - phase: 22-site-shell-navigation
    provides: "Plan 01: CSS nav/footer rewrites, js/nav.js IIFE, index.html reference implementation, interests.html stub"
provides:
  - "All 27 remaining HTML pages updated with new three-column nav, footer columns, and nav.js"
  - "Site-wide shell transformation complete — every page on commons-2.0 uses the new nav structure"
  - "Dashboard/admin inverted auth state preserved — no flash-of-login on auth-gated pages"
  - "Correct active nav link on each primary page (Reading Room, Postcards, News, Voices)"
affects:
  - "23-interests-frontend"
  - "Any future HTML page additions — use new shell as reference"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hamburger as direct child of .site-nav — enables CSS order:-1 mobile layout without DOM reordering"
    - "Inverted auth state on auth-gated pages — login hidden, user-menu visible by default to prevent flash"
    - "No active nav link on secondary/utility pages — only primary nav items have active state"
    - "js/nav.js added via script src after auth.js on every page — no CSP hash required"

key-files:
  created: []
  modified:
    - "reading-room.html — Reading Room nav link active"
    - "postcards.html — Postcards nav link active"
    - "news.html — News nav link active"
    - "voices.html — Voices nav link active"
    - "discussions.html — no active link (Discussions removed from nav, page kept for backward compat)"
    - "dashboard.html — inverted auth state, await Auth.init() preserved"
    - "admin.html — inverted auth state, await Auth.init() preserved"
    - "chat.html — standard public auth, chat JS preserved"
    - "login.html — standard public auth, form preserved"
    - "reset-password.html — standard public auth, form preserved"
    - "about.html, agent-guide.html, api.html, claim.html, constitution.html, contact.html — new shell"
    - "discussion.html, moment.html, moments.html, participate.html, profile.html — new shell"
    - "propose.html, roadmap.html, search.html, submit.html, suggest-text.html, text.html — new shell"

key-decisions:
  - "discussions.html has no active nav link — Discussions is no longer a primary nav item; page kept for backward compatibility, will redirect to Interests in Phase 23"
  - "Mechanical transformation approach — identical nav/footer HTML pasted across 17 utility pages with no active links, minimizing per-page decision-making"
  - "User approved visual verification on desktop and mobile viewports — shell confirmed correct across primary and utility pages"

patterns-established:
  - "New page template: three-column nav + mobile panel + footer columns + js/nav.js (see index.html as reference)"
  - "Active link set in BOTH .site-nav__links AND .nav-mobile-panel for consistency"
  - "Auth-gated pages: login hidden + user-menu visible by default, await Auth.init()"
  - "Public pages: login visible + user-menu hidden by default, non-blocking Auth.init()"

requirements-completed: [NAV-01, NAV-04, NAV-05, VIS-04]

# Metrics
duration: 25min
completed: 2026-03-04
---

# Phase 22 Plan 02: Site Shell Navigation — All Pages Summary

**New three-column nav (6 links, hamburger, footer columns) propagated to all 27 remaining HTML pages with active-link mapping and inverted auth state preserved on auth-gated pages**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-04
- **Completed:** 2026-03-04
- **Tasks:** 4 (3 auto + 1 human-verify checkpoint, user approved)
- **Files modified:** 27

## Accomplishments

- Propagated new three-column nav, mobile panel, footer columns, and nav.js to all 27 remaining HTML pages
- Preserved inverted auth state on dashboard.html and admin.html — no flash-of-login on auth-gated pages
- Mapped correct active nav links for 4 primary pages (Reading Room, Postcards, News, Voices); discussions.html intentionally has no active link since it is no longer a primary nav destination
- User visually verified the shell on desktop and mobile viewports and approved

## Task Commits

Each task was committed atomically:

1. **Task 1: Update primary nav pages (5 pages)** - `54b17d8` (feat)
2. **Task 2: Update auth-gated and special pages (5 pages)** - `43769ef` (feat)
3. **Task 3: Update remaining public/utility pages (17 pages)** - `e8caf59` (feat)
4. **Task 4: Visual verification** - User approved — no code commit required

## Files Created/Modified

- `reading-room.html` — new shell, Reading Room nav link active
- `postcards.html` — new shell, Postcards nav link active
- `news.html` — new shell, News nav link active
- `voices.html` — new shell, Voices nav link active
- `discussions.html` — new shell, no active nav link
- `dashboard.html` — new shell, inverted auth state, await Auth.init() preserved
- `admin.html` — new shell, inverted auth state, await Auth.init() preserved
- `chat.html` — new shell, standard auth, chat JS preserved
- `login.html` — new shell, standard auth, form preserved
- `reset-password.html` — new shell, standard auth, form preserved
- `about.html`, `agent-guide.html`, `api.html`, `claim.html`, `constitution.html`, `contact.html` — new shell, no active link
- `discussion.html`, `moment.html`, `moments.html`, `participate.html`, `profile.html` — new shell, no active link
- `propose.html`, `roadmap.html`, `search.html`, `submit.html`, `suggest-text.html`, `text.html` — new shell, no active link

## Decisions Made

- `discussions.html` intentionally has no active nav link — Discussions is no longer a top-level nav item; page kept on disk for backward compatibility and will redirect to Interests in Phase 23
- Mechanical, identical transformation applied to all 17 utility pages — no per-page customization needed since none are primary nav destinations
- User approved visual verification: shell confirmed correct on desktop (three-column) and mobile (hamburger left, brand center, auth right) viewports

## Deviations from Plan

None — plan executed exactly as written. All 27 pages received the new shell without requiring auto-fixes or architectural changes.

## Issues Encountered

None — the transformations were mechanical. Each page's main content and existing auth patterns were preserved without conflict.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Site shell transformation is complete across all 29 HTML pages (index.html + interests.html from Plan 01, 27 pages from Plan 02)
- Phase 23 (Interests Frontend) can now build on a consistent nav/footer shell
- discussions.html should be updated in Phase 23 to redirect to the new Interests page
- Any future HTML pages should use index.html as the shell reference

---
*Phase: 22-site-shell-navigation*
*Completed: 2026-03-04*
