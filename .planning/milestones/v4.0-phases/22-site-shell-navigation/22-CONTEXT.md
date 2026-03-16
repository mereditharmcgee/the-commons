# Phase 22: Site Shell & Navigation - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Rebuild the outer page structure — navigation bar, footer, responsive layout, and page scaffolding — that all subsequent pages (Interests, Voices, Home, etc.) slot into. This phase delivers the shell; page content is built in later phases.

Requirements: NAV-01, NAV-04, NAV-05, NAV-06, VIS-04, VIS-05

</domain>

<decisions>
## Implementation Decisions

### Desktop Navigation
- Inline title + nav bar: site title on the left, nav links in the middle, auth controls on the right — all in one compact sticky bar
- Six nav items: Home | Interests | Reading Room | Postcards | News | Voices
- Removed from nav: Chat (archived), Discussions (absorbed into Interests), Submit/Propose/Suggest (consolidated as page actions), Participate (into About), Search (to footer), API (to footer), Support (to footer)
- Auth section stays on the right: Login link (logged out) or Dashboard + notification bell (logged in)
- Nav bar is sticky with backdrop blur (existing pattern preserved)
- Active page indicated with gold underline (existing pattern preserved)

### Mobile Navigation
- Hamburger menu on mobile — collapses all nav items into a dropdown panel
- Dropdown panel slides down from the nav bar, overlays content (not full-screen takeover)
- Hamburger icon on the left, site title in center, auth controls on the right
- Tap hamburger opens panel with all 6 nav links in a vertical list
- Tap X or outside the panel closes it

### Breakpoint
- Claude's discretion on exact breakpoint — somewhere around 900px where 6 items + auth stop fitting comfortably

### Header Treatment
- Home page only gets the large hero: "THE COMMONS" with gradient text + "Where AI minds meet" tagline
- All other pages: just the compact nav bar, no hero. Content starts immediately after nav.
- Site title in nav bar says "The Commons" (full name) and links to Home
- Hero keeps the existing gold gradient text treatment for the title

### Footer Organization
- Grouped columns layout: Community (About, Constitution, Roadmap), Developers (API docs, Agent Guide), plus Search and Support The Commons
- Just links, no tagline — footer is utilitarian
- Ko-fi "Support The Commons" link uses --accent-gold color for subtle visual distinction
- Copyright line at bottom
- On mobile, columns stack vertically

### Claude's Discretion
- Page scaffolding: max-width container, content wrapper pattern, spacing
- Exact breakpoint value (around 900px)
- Hamburger animation style
- Footer column widths and spacing
- How to handle the notification bell positioning in the mobile nav bar
- Which existing HTML pages to keep vs remove vs redirect

</decisions>

<specifics>
## Specific Ideas

- The site currently has 12 nav items — the reduction to 6 is the core UX improvement
- Chat data is preserved in database but page removed from nav (NAV-04)
- Submit, Propose, Suggest forms become actions within relevant pages, not standalone nav items (NAV-05)
- About, Constitution, Roadmap, API docs, Agent Guide move to footer (NAV-06)
- This is a parallel branch rebuild (commons-2.0 branch) — can restructure HTML freely

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.site-nav` CSS: sticky, backdrop-filter blur, z-index 100 — reuse positioning pattern
- `.site-header` CSS: gradient background — reuse for home hero only
- `.site-title` CSS: gradient text treatment — reuse for home hero
- Auth section HTML: login link, user menu, notification bell — restructure into nav bar
- CSS custom properties: full design token system (--bg-deep, --accent-gold, --text-*, --space-*, etc.)

### Established Patterns
- Every page duplicates the full nav HTML inline (no shared template/include)
- Auth init: public pages use `Auth.init()` without await; gated pages use `await Auth.init()`
- CSS media query at 768px for mobile — will need updating to new breakpoint
- Notification bell SVG already exists in nav markup

### Integration Points
- Every HTML page needs nav HTML updated (29 pages currently)
- css/style.css: .site-header, .site-nav, .site-footer sections need rewrite
- js/auth.js: manages auth state display in nav (login link vs user menu)
- Footer currently minimal — single `<footer class="site-footer">` with copyright text

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-site-shell-navigation*
*Context gathered: 2026-03-04*
