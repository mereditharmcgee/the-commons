---
phase: 22-site-shell-navigation
plan: 01
subsystem: ui
tags: [css, navigation, hamburger-menu, responsive, vanilla-js, footer]

# Dependency graph
requires: []
provides:
  - "Three-column sticky nav CSS: .site-nav__brand | .site-nav__links | .site-nav__auth"
  - "Hamburger menu with .site-nav__hamburger, .hamburger-bar, X animation, mobile panel"
  - ".nav-mobile-panel with is-open toggle class, fixed positioning below nav"
  - ".home-hero class for home-page-only gradient title + tagline hero"
  - ".footer-columns three-column grid layout with .footer-col, .footer-col__heading"
  - ".footer-support-link accent-gold highlight class"
  - "js/nav.js IIFE: hamburger toggle, outside-click-to-close, link-click-to-close"
  - "index.html as reference implementation of new shell"
  - "interests.html stub page so nav link is not a 404"
affects:
  - 22-site-shell-navigation (plan 02 propagates this shell to all other pages)
  - 23-interests-page (will inherit this shell)
  - all subsequent phases (all pages use this nav/footer pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-column nav: brand (flex-shrink:0) | links (flex:1, justify-content:center) | auth (flex-shrink:0)"
    - "Mobile hamburger: direct child of .site-nav, hidden on desktop (display:none), shown with display:flex + order:-1 on mobile"
    - "CSS order:-1 positions hamburger visually left without DOM reordering"
    - "nav.js IIFE with DOMContentLoaded — external file, no CSP hash required"
    - "Mobile panel: position:fixed below nav, .is-open class toggles display:flex"
    - "Hamburger X animation via aria-expanded attribute + nth-child transforms"

key-files:
  created:
    - js/nav.js
    - interests.html
  modified:
    - css/style.css
    - index.html

key-decisions:
  - "Hamburger is a direct child of .site-nav (not inside .site-nav__auth), CSS order:-1 positions it visually leftmost on mobile"
  - "Nav breakpoint set at 900px — 6 nav items + auth fit comfortably on tablets at this width"
  - "Mobile panel uses position:fixed (not absolute) so it overlays content correctly with sticky nav"
  - "js/nav.js is external file — zero CSP hash implications, pages just add a script src tag"
  - "Old .site-header class removed from CSS; replaced with .home-hero for home-page-only hero"
  - "Duplicate .site-nav block in AUTH & HEADER section removed — canonical definition now in NAVIGATION section"

patterns-established:
  - "Shell pattern: nav#site-nav > (brand + links + auth + hamburger), then div#nav-mobile-panel as sibling"
  - "Home-only hero: div.home-hero > h1.site-title + p.site-tagline (placed between mobile panel and main)"
  - "Footer pattern: footer.site-footer > div.footer-columns > div.footer-col[...] + div.footer-copyright"
  - "Public pages include js/nav.js after auth.js, before any page-specific script"

requirements-completed: [NAV-01, NAV-04, NAV-06, VIS-04, VIS-05]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 22 Plan 01: Site Shell & Navigation Summary

**Sticky three-column nav bar (brand|links|auth), hamburger mobile menu with CSS order positioning, footer column layout, and home-hero gradient — all implemented in vanilla CSS + js/nav.js with index.html as reference**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T05:04:36Z
- **Completed:** 2026-03-04T05:07:56Z
- **Tasks:** 2
- **Files modified:** 4 (css/style.css, js/nav.js, index.html, interests.html)

## Accomplishments

- Rewrote CSS nav section from flat flex row of links to three-column layout with separate brand, links, and auth zones
- Added complete hamburger/mobile-panel system: X animation via aria-expanded + nth-child, is-open toggle, outside-click-to-close in js/nav.js
- Replaced six-link flat footer with grouped three-column footer-columns layout (Community, Developers, Search/Support)
- Created home-hero class for home-page-only gradient title + italic tagline
- Updated index.html as complete reference implementation; created interests.html stub so nav link is not a 404
- Removed duplicate .site-nav block from AUTH & HEADER section (was creating a CSS precedence conflict)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite CSS nav/footer/hero blocks and create js/nav.js** - `61d239b` (feat)
2. **Task 2: Update index.html with new shell and create interests.html stub** - `bf4bd0e` (feat)

## Files Created/Modified

- `css/style.css` — Replaced .site-header with .home-hero; rewrote .site-nav to three-column layout; added .site-nav__brand, .site-nav__links, .site-nav__hamburger, .hamburger-bar, .nav-mobile-panel; replaced flat footer with .footer-columns/.footer-col grid; updated responsive breakpoint from 768px to 900px with mobile nav order rules
- `js/nav.js` — New IIFE: hamburger toggle (is-open class + aria-expanded), outside-click-to-close, nav-link-click-to-close
- `index.html` — Complete new nav/mobile-panel/home-hero/footer shell; nav reduced from 12 links to 6; added nav.js script tag
- `interests.html` — New stub page with full new shell, Interests link active, coming-soon content

## Decisions Made

- Hamburger button is a direct child of `<nav class="site-nav">` (not nested inside `.site-nav__auth`). On mobile, CSS `order: -1` moves it visually to the far left. DOM order is: brand, links, auth, hamburger — visual mobile order is: hamburger | brand | auth. This avoids duplicating DOM elements.
- Nav breakpoint at 900px — 6 nav items with uppercase letter-spacing plus auth controls stop fitting comfortably before this width.
- Mobile panel uses `position: fixed` so it correctly overlays content when the nav is sticky.
- js/nav.js uses an IIFE + DOMContentLoaded so it is a plain external file with no CSP hash requirements.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 02 can now propagate this nav/footer shell to all remaining pages (the HTML pattern is locked in index.html)
- js/nav.js just needs a `<script src="js/nav.js"></script>` added to each page
- interests.html is a stub; Phase 23 will build it out

---
*Phase: 22-site-shell-navigation*
*Completed: 2026-03-04*
