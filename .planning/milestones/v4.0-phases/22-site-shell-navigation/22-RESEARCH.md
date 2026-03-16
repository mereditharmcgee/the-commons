# Phase 22: Site Shell & Navigation - Research

**Researched:** 2026-03-03
**Domain:** Vanilla HTML/CSS responsive navigation, page scaffolding
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Desktop Navigation**
- Inline title + nav bar: site title on the left, nav links in the middle, auth controls on the right — all in one compact sticky bar
- Six nav items: Home | Interests | Reading Room | Postcards | News | Voices
- Removed from nav: Chat (archived), Discussions (absorbed into Interests), Submit/Propose/Suggest (consolidated as page actions), Participate (into About), Search (to footer), API (to footer), Support (to footer)
- Auth section stays on the right: Login link (logged out) or Dashboard + notification bell (logged in)
- Nav bar is sticky with backdrop blur (existing pattern preserved)
- Active page indicated with gold underline (existing pattern preserved)

**Mobile Navigation**
- Hamburger menu on mobile — collapses all nav items into a dropdown panel
- Dropdown panel slides down from the nav bar, overlays content (not full-screen takeover)
- Hamburger icon on the left, site title in center, auth controls on the right
- Tap hamburger opens panel with all 6 nav links in a vertical list
- Tap X or outside the panel closes it

**Breakpoint**
- Claude's discretion on exact breakpoint — somewhere around 900px where 6 items + auth stop fitting comfortably

**Header Treatment**
- Home page only gets the large hero: "THE COMMONS" with gradient text + "Where AI minds meet" tagline
- All other pages: just the compact nav bar, no hero. Content starts immediately after nav.
- Site title in nav bar says "The Commons" (full name) and links to Home
- Hero keeps the existing gold gradient text treatment for the title

**Footer Organization**
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NAV-01 | Site displays restructured navigation: Home | Interests | Reading Room | Postcards | News | Voices | New nav HTML structure with 6 links, CSS three-column layout |
| NAV-04 | Chat ("The Gathering") is removed from public navigation (data preserved) | Remove `<a href="chat.html">` from nav; chat.html stays on disk but no nav link |
| NAV-05 | Submit/Propose/Suggest forms consolidated as actions within relevant pages | Remove propose.html, submit.html, suggest-text.html from nav; keep files for later phases |
| NAV-06 | About, Constitution, Roadmap, API docs, Agent Guide accessible from footer | Footer columns CSS + HTML pattern |
| VIS-04 | All pages are mobile-responsive by default | Hamburger pattern + breakpoint CSS; no horizontal scroll |
| VIS-05 | Navigation is decluttered to 6 items with no surprise popups | Hamburger dropdown (not popup) pattern; panel overlays content cleanly |
</phase_requirements>

## Summary

This phase is entirely internal to the project — no third-party libraries or framework changes are involved. The Commons runs vanilla HTML/CSS/JS with no build step and GitHub Pages hosting. The research task is therefore a codebase audit rather than an ecosystem search.

The core work is threefold: (1) redesign the `<nav>` HTML from a centered list of 12 items to a three-column sticky bar (title | links | auth), (2) add a hamburger/dropdown for mobile at around 900px, and (3) rebuild the `<footer>` from a single-line inline list into a grouped-column layout. Every one of the 28 HTML pages must receive the updated nav and footer HTML, because the project has no shared template system — each page carries its own inline copy.

The biggest practical risk is the 28-page nav update: it is mechanical but must be done precisely, preserving each page's correct `class="active"` link and its `Auth.init()` vs `await Auth.init()` pattern. The CSS changes are confined to `.site-header`, `.site-nav`, and `.site-footer` blocks in `css/style.css`, plus a new hamburger/panel section.

**Primary recommendation:** Write the canonical new nav/footer HTML once, then apply it systematically page-by-page. Treat the CSS rewrite as a separate task from the HTML propagation to keep diffs reviewable.

## Standard Stack

### Core (project-native — no new installs)

| Component | What it is | Current State | Phase 22 Change |
|-----------|-----------|--------------|----------------|
| `css/style.css` | Single stylesheet | `.site-nav` centered flex, 12 links, no mobile collapse | Rewrite nav block: 3-column layout + hamburger at ~900px; rewrite footer block: columns grid |
| `<nav class="site-nav">` HTML | Inline in every page | 12 `<a>` tags + `.site-nav__auth` div | 6 `<a>` tags + title link + hamburger button + auth div |
| `<footer class="site-footer">` HTML | Inline in every page | Single `<p>` with `&middot;` separated links | Columns grid: Community / Developers / Search+Support + copyright |
| `<header class="site-header">` HTML | Inline in every page | Present on all 28 pages | Remove from all non-home pages; keep only on index.html |
| `js/auth.js` `updateUI()` | Manages login/user-menu visibility | References `#auth-login-link`, `#auth-user-menu`, `#notification-bell` | IDs must stay identical; hamburger open/close is new JS in auth.js or inline |

### No New Dependencies

The project explicitly forbids framework dependencies and build steps. No npm packages are added in this phase. Hamburger behavior is implemented with a handful of vanilla JS lines (toggle a CSS class, close on outside click).

## Architecture Patterns

### Recommended Page Structure After Phase 22

```
Every non-home page:
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>
  <nav class="site-nav">
    <!-- left: title -->
    <!-- center: 6 nav links -->
    <!-- right: auth controls -->
    <!-- hamburger panel (hidden by default) -->
  </nav>
  <main id="main-content">
    <div class="container">...</div>
  </main>
  <footer class="site-footer">
    <div class="footer-columns">...</div>
    <div class="footer-copyright">...</div>
  </footer>
</body>

Home page (index.html) only:
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>
  <nav class="site-nav">...</nav>
  <header class="site-header-hero">   <!-- new class, home only -->
    <h1 class="site-title">THE COMMONS</h1>
    <p class="site-tagline">Where AI minds meet</p>
  </header>
  <main id="main-content">...</main>
  <footer class="site-footer">...</footer>
</body>
```

Note: The old `<header class="site-header">` above `<nav>` is removed from all pages. The nav bar itself becomes the persistent header. Home gets an additional hero section between nav and main.

### Pattern 1: Three-Column Sticky Nav (Desktop)

**What:** A single `<nav>` row with three flex regions: site title on the left, nav links centered, auth controls on the right.

**When to use:** All pages, always visible, sticky.

**Rationale for three-column approach over justify-content: center:** With `justify-content: center` on the outer nav and floating auth to the right, the auth section overlaps the centered links at narrow widths before the hamburger kicks in. The three-column approach (title | flex-grow center links | auth) keeps items from colliding.

**Example:**
```html
<nav class="site-nav" id="site-nav">
    <a href="index.html" class="site-nav__brand">The Commons</a>

    <div class="site-nav__links" id="nav-links">
        <a href="index.html">Home</a>
        <a href="interests.html">Interests</a>
        <a href="reading-room.html">Reading Room</a>
        <a href="postcards.html">Postcards</a>
        <a href="news.html">News</a>
        <a href="voices.html">Voices</a>
    </div>

    <div class="site-nav__auth">
        <a href="login.html" id="auth-login-link" class="auth-link">Login</a>
        <div id="auth-user-menu" class="user-menu" style="display: none;">
            <a href="dashboard.html" class="auth-link">Dashboard</a>
            <button id="notification-bell" class="notification-bell"
                    title="Notifications" aria-label="Notifications"
                    style="display: none;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                <span id="notification-badge" class="notification-badge"
                      style="display: none;">0</span>
            </button>
        </div>
        <button class="site-nav__hamburger" id="nav-hamburger"
                aria-label="Open navigation" aria-expanded="false"
                aria-controls="nav-mobile-panel">
            <span class="hamburger-bar"></span>
            <span class="hamburger-bar"></span>
            <span class="hamburger-bar"></span>
        </button>
    </div>
</nav>

<!-- Mobile dropdown panel — rendered outside nav flow -->
<div class="nav-mobile-panel" id="nav-mobile-panel" hidden>
    <a href="index.html">Home</a>
    <a href="interests.html">Interests</a>
    <a href="reading-room.html">Reading Room</a>
    <a href="postcards.html">Postcards</a>
    <a href="news.html">News</a>
    <a href="voices.html">Voices</a>
</div>
```

**CSS for desktop:**
```css
.site-nav {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-md) var(--space-xl);
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-subtle);
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(10px);
}

.site-nav__brand {
    font-family: var(--font-serif);
    font-size: 1.125rem;
    font-weight: 400;
    color: var(--text-primary);
    white-space: nowrap;
    flex-shrink: 0;
    /* No border-bottom from .site-nav a rule — override needed */
}

.site-nav__brand:hover {
    color: var(--accent-gold);
}

.site-nav__links {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
    flex: 1;
    justify-content: center;
}

.site-nav__auth {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-shrink: 0;
}

.site-nav__hamburger {
    display: none; /* hidden on desktop */
}
```

### Pattern 2: Hamburger Mobile Nav (~900px breakpoint)

**What:** At ~900px, the `.site-nav__links` div hides, a hamburger button appears in the auth area, and tapping it toggles a `.nav-mobile-panel` that slides down below the sticky nav bar.

**Why overlay (not push):** The panel uses `position: absolute` anchored below the nav bar. It overlays content rather than pushing it down, preventing layout reflow which is jarring on mobile scroll.

**Why the panel is outside `<nav>`:** A `position: absolute` child of a `position: sticky` parent has its containing block relative to the sticky element's scrolled position — which is exactly what we want (panel always appears directly below the nav bar regardless of scroll).

**Example CSS:**
```css
@media (max-width: 900px) {
    .site-nav__links {
        display: none;
    }

    .site-nav__hamburger {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 5px;
        width: 32px;
        height: 32px;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 4px;
    }

    .hamburger-bar {
        display: block;
        width: 22px;
        height: 2px;
        background: var(--text-secondary);
        border-radius: 2px;
        transition: transform var(--transition-fast), opacity var(--transition-fast);
    }

    /* X state when open */
    .site-nav__hamburger[aria-expanded="true"] .hamburger-bar:nth-child(1) {
        transform: translateY(7px) rotate(45deg);
    }
    .site-nav__hamburger[aria-expanded="true"] .hamburger-bar:nth-child(2) {
        opacity: 0;
    }
    .site-nav__hamburger[aria-expanded="true"] .hamburger-bar:nth-child(3) {
        transform: translateY(-7px) rotate(-45deg);
    }

    .nav-mobile-panel {
        display: none;
        flex-direction: column;
        position: fixed;
        top: var(--nav-height, 56px); /* set via JS or known height */
        left: 0;
        right: 0;
        background: var(--bg-primary);
        border-bottom: 1px solid var(--border-subtle);
        z-index: 99;
        padding: var(--space-md) var(--space-xl);
        gap: var(--space-md);
    }

    .nav-mobile-panel.is-open {
        display: flex;
    }

    .nav-mobile-panel a {
        font-size: 1rem;
        font-weight: 500;
        color: var(--text-secondary);
        padding: var(--space-sm) 0;
        border-bottom: 1px solid var(--border-subtle);
    }

    .nav-mobile-panel a:last-child {
        border-bottom: none;
    }

    .nav-mobile-panel a.active,
    .nav-mobile-panel a:hover {
        color: var(--text-primary);
    }
}
```

**Hamburger JS (minimal, inline or in a small nav-init block):**
```javascript
// Hamburger toggle — attach after DOM ready
(function() {
    const hamburger = document.getElementById('nav-hamburger');
    const panel = document.getElementById('nav-mobile-panel');
    if (!hamburger || !panel) return;

    hamburger.addEventListener('click', function() {
        const isOpen = panel.classList.toggle('is-open');
        hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close on outside click
    document.addEventListener('click', function(e) {
        if (!e.target.closest('#site-nav') && !e.target.closest('#nav-mobile-panel')) {
            panel.classList.remove('is-open');
            hamburger.setAttribute('aria-expanded', 'false');
        }
    });
})();
```

Note: This inline IIFE must be included on every page. Its CSP hash will need regenerating since it is new inline script content. The project has an existing CSP pattern with precomputed `sha256-` hashes in every page `<head>`. Every `<script>` block change requires a new hash.

### Pattern 3: Footer Columns

**What:** Replace the single `<p>` with `&middot;` separators with a proper column grid.

**Example:**
```html
<footer class="site-footer">
    <div class="footer-columns">
        <div class="footer-col">
            <h3 class="footer-col__heading">Community</h3>
            <a href="about.html">About</a>
            <a href="constitution.html">Constitution</a>
            <a href="roadmap.html">Roadmap</a>
        </div>
        <div class="footer-col">
            <h3 class="footer-col__heading">Developers</h3>
            <a href="api.html">API</a>
            <a href="agent-guide.html">Agent Guide</a>
        </div>
        <div class="footer-col">
            <a href="search.html">Search</a>
            <a href="https://ko-fi.com/mmcgee"
               target="_blank" rel="noopener noreferrer"
               class="footer-support-link">Support The Commons</a>
        </div>
    </div>
    <div class="footer-copyright">
        <p>&copy; 2026 The Commons</p>
    </div>
</footer>
```

**CSS:**
```css
.footer-columns {
    display: grid;
    grid-template-columns: repeat(3, auto);
    gap: var(--space-xl) var(--space-3xl);
    justify-content: center;
    margin-bottom: var(--space-xl);
}

.footer-col {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
}

.footer-col__heading {
    font-family: var(--font-sans);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: var(--space-xs);
}

.footer-col a {
    font-size: 0.875rem;
    color: var(--text-secondary);
}

.footer-col a:hover {
    color: var(--accent-gold);
}

.footer-support-link {
    color: var(--accent-gold) !important;
}

.footer-copyright {
    text-align: center;
    border-top: 1px solid var(--border-subtle);
    padding-top: var(--space-lg);
}

.footer-copyright p {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin: 0;
}

@media (max-width: 600px) {
    .footer-columns {
        grid-template-columns: 1fr;
        text-align: center;
        gap: var(--space-xl);
    }
}
```

### Pattern 4: Hero (index.html only)

The home page hero is a new `<section>` (or `<div>`) between the nav and main content, not a separate `<header>` element. The existing `.site-header` CSS class gets repurposed or replaced with `.home-hero` to make the distinction clear.

```html
<!-- index.html only — between <nav> and <main> -->
<div class="home-hero">
    <h1 class="site-title">THE COMMONS</h1>
    <p class="site-tagline">Where AI minds meet</p>
</div>
```

```css
.home-hero {
    padding: var(--space-2xl) var(--space-xl);
    text-align: center;
    border-bottom: 1px solid var(--border-subtle);
    background: linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-deep) 100%);
}
/* .site-title and .site-tagline CSS unchanged from current */
```

### Anti-Patterns to Avoid

- **`justify-content: center` on the outer nav with `margin-left: auto` on auth:** At intermediate widths (900px-1100px), the centered links and right-pushed auth collide. Use flex children with explicit `flex: 1` on the center region instead.
- **`position: absolute` panel inside a `position: sticky` nav:** The containing block logic is counterintuitive. Use `position: fixed` with a `top` value matching the nav height, or place the panel as a sibling of `<nav>` in the DOM.
- **Animating `display: none` → `display: flex`:** CSS transitions don't work with `display`. Toggle a class that uses `max-height` or `transform: translateY` for the slide-down effect, or simply toggle `display` without animation (clean approach, no JS animation library needed given the project's no-framework rule).
- **Updating nav HTML with search-and-replace across 28 files:** Risky for divergent page-specific nav states (active classes, auth visibility). Update each file individually, verifying the active link is correct.
- **Missing CSP hash updates:** Every changed inline `<script>` block requires a new `sha256-` hash in the CSP `<meta>` tag. If the hamburger JS is added as inline script, all 28 pages need new hashes. Consider adding it to `js/auth.js` or a new `js/nav.js` file (loaded as external script = no CSP hash needed).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hamburger/dropdown nav | Custom animation library or framework component | Vanilla CSS class toggle + `aria-expanded` | Project is no-framework by design; CSS class toggle is < 20 lines of JS |
| Template system for shared nav | Server-side includes, web components, build step | Per-file inline HTML (existing pattern) | GitHub Pages static hosting; no server; no build step is a project feature |
| Smooth slide animation for mobile panel | CSS transition on `max-height` | Simple `display: none/flex` toggle via class | Simpler, reliable across all browsers; animation is a nice-to-have and the project values clarity over flourish |

## Common Pitfalls

### Pitfall 1: The "Interests" page does not exist yet

**What goes wrong:** NAV-01 requires linking to `interests.html`, but that page is built in Phase 23. Linking to it in Phase 22 creates a broken link on the deployed site.

**Why it happens:** The nav is being rebuilt before all destination pages exist.

**How to avoid:** Link to `interests.html` in the nav HTML (correct destination for Phase 23) but add an `<!-- TODO Phase 23: create interests.html -->` comment. On the commons-2.0 branch, this is a dead link during Phase 22 development. The phase deliverable is the shell; page existence is Phase 23's job. Do NOT link to `discussions.html` as a placeholder — it will confuse the nav audit.

**Warning signs:** 404 on `interests.html` during Phase 22 testing is expected and acceptable.

### Pitfall 2: CSP hash invalidation from inline script changes

**What goes wrong:** Adding hamburger toggle JS as an inline `<script>` block silently breaks the page's Content Security Policy. The browser refuses to execute the script but shows no visible error unless CSP violation reporting is set up.

**Why it happens:** Every page has hardcoded CSP `sha256-` hashes in the `<meta>` tag for each inline script block. Adding new inline JS requires computing a new hash.

**How to avoid:** Put the hamburger JS in `js/nav.js` (new file, loaded via `<script src="js/nav.js"></script>`). External scripts are covered by `script-src 'self'` and require no new hash computation. This is the cleanest solution.

**Warning signs:** Nav links visible but hamburger click has no effect. Check browser console for CSP violations.

### Pitfall 3: `auth.js` updateUI() breaks on nav restructure

**What goes wrong:** `Auth.updateUI()` in `js/auth.js` directly manipulates `#auth-login-link`, `#auth-user-menu`, and `#notification-bell` by ID. If the HTML IDs change or these elements move outside their expected parent structure, auth state display breaks silently.

**Why it happens:** The nav HTML is being restructured. IDs must be preserved exactly.

**How to avoid:** Keep the IDs `auth-login-link`, `auth-user-menu`, `notification-bell`, and `notification-badge` unchanged in the new nav HTML. The restructuring changes the wrapper elements and layout, not the IDs auth.js uses.

**Warning signs:** Login link visible while logged in, or Dashboard never appears after login.

### Pitfall 4: Dashboard page has inverted auth initial state

**What goes wrong:** `dashboard.html` sets `auth-login-link` to `display: none` and `auth-user-menu` without `display: none` in the HTML (hardcoded for logged-in state), while other pages default to showing the login link. Copy-pasting nav HTML from index.html to dashboard.html will reset this hardcoded state.

**Why it happens:** Auth-gated pages use `await Auth.init()` and set initial display state differently. The dashboard assumes logged-in state in its static HTML as a flash-prevention technique.

**How to avoid:** When updating dashboard.html, preserve:
```html
<a href="login.html" id="auth-login-link" class="auth-link" style="display: none;">Login</a>
<div id="auth-user-menu" class="user-menu">
```
Versus the standard public page default:
```html
<a href="login.html" id="auth-login-link" class="auth-link">Login</a>
<div id="auth-user-menu" class="user-menu" style="display: none;">
```

**Warning signs:** Dashboard flashes "Login" before resolving auth state.

### Pitfall 5: Mobile horizontal scroll from wide fixed-width elements

**What goes wrong:** Some pages have inline `style` attributes with pixel widths or `min-width` values that are fine on desktop but cause horizontal scroll on 375px mobile viewports.

**Why it happens:** Legacy inline styles added during feature development, not caught by existing `@media (max-width: 768px)` rules.

**How to avoid:** After updating nav/footer, test each page at 375px width in browser devtools. The most common culprits are table elements, `.container--wide`, and components with `min-width: Xpx` in inline styles.

**Warning signs:** The VIS-04 requirement fails: horizontal scrollbar appears on mobile.

### Pitfall 6: `.site-nav` CSS is defined twice in style.css

**What goes wrong:** The current `css/style.css` has `.site-nav` defined twice: once around line 237 (the original definition, `justify-content: center`) and again around line 2718 (the "AUTH & HEADER" section with `justify-content: center` plus `flex-wrap: wrap`). The second definition partially overrides the first but both exist.

**Why it happens:** CSS was accumulated over time, with auth-related styles added in a later block without removing the original.

**How to avoid:** In the CSS rewrite, consolidate to a single `.site-nav` block. Remove the duplicate. Audit for any other duplicate selectors.

**Warning signs:** Nav layout behaves unexpectedly at edge widths; one definition's flex-wrap setting overrides another.

## Code Examples

### Active Page Link Pattern

Each page sets `class="active"` on the link matching its page. With the new nav having both `.site-nav__links` (desktop) and `.nav-mobile-panel` (mobile), the active class must appear in BOTH places.

```html
<!-- On reading-room.html: active in desktop links -->
<div class="site-nav__links">
    <a href="index.html">Home</a>
    <a href="interests.html">Interests</a>
    <a href="reading-room.html" class="active">Reading Room</a>
    ...
</div>

<!-- And in mobile panel -->
<div class="nav-mobile-panel" id="nav-mobile-panel" hidden>
    <a href="index.html">Home</a>
    <a href="interests.html">Interests</a>
    <a href="reading-room.html" class="active">Reading Room</a>
    ...
</div>
```

### Pages Where the Header Hero Appears (home only)

All pages currently have `<header class="site-header">` above `<nav>`. The Phase 22 restructured layout removes this for non-home pages. The removal pattern:

```html
<!-- REMOVE from all pages except index.html: -->
<header class="site-header">
    <h1 class="site-title">The Commons</h1>
    <p class="site-tagline">Where AI minds meet</p>
</header>

<!-- ADD to index.html only (between <nav> and <main>): -->
<div class="home-hero">
    <h1 class="site-title">THE COMMONS</h1>
    <p class="site-tagline">Where AI minds meet</p>
</div>
```

### Auth Init Variants

Two patterns must be preserved as-is across pages:

```javascript
// Public pages (most pages):
document.addEventListener('DOMContentLoaded', () => {
    Auth.init(); // No await — non-blocking
});

// Auth-gated pages (dashboard.html):
document.addEventListener('DOMContentLoaded', async () => {
    await Auth.init(); // Blocking — ensures auth state before rendering
    // ...page-specific logic follows
});
```

### Page Inventory with Classification

28 HTML pages total. Classification by nav treatment:

**Primary nav pages (nav link exists):**
- `index.html` — "Home" active; + home hero
- `interests.html` — "Interests" active (DOES NOT EXIST YET — Phase 23 creates it)
- `reading-room.html` — "Reading Room" active
- `postcards.html` — "Postcards" active
- `news.html` — "News" active
- `voices.html` — "Voices" active

**Secondary pages (no nav link, but get updated nav shell):**
- `discussion.html` — individual discussion thread
- `discussions.html` — old discussions list (may redirect to interests.html in Phase 23)
- `profile.html` — AI voice profile
- `moment.html` — single historical moment
- `moments.html` — historical moments list
- `text.html` — single reading room text
- `dashboard.html` — auth-gated; active = none (Dashboard link is in auth section)
- `admin.html` — auth-gated admin
- `login.html` — auth page; nav/footer optional (minimal shell acceptable)
- `reset-password.html` — auth page; nav/footer optional
- `claim.html` — post claim form
- `contact.html` — contact form

**Utility pages (footer-linked, no nav link):**
- `about.html` — Community footer
- `constitution.html` — Community footer
- `roadmap.html` — Community footer
- `api.html` — Developers footer
- `agent-guide.html` — Developers footer
- `search.html` — footer link

**Removed from nav (keep files, no nav/footer link needed but files stay):**
- `chat.html` — archived; no nav link; data preserved
- `participate.html` — content folded into about.html or removed
- `propose.html` — form becomes page action in Phase 23
- `submit.html` — form becomes page action in future phase
- `suggest-text.html` — form becomes page action in future phase

## State of the Art

| Old Approach | Current Approach | Phase 22 Change |
|--------------|-----------------|----------------|
| 12-item flat nav, `justify-content: center` | 12 items cramped on mobile | 6-item three-column nav with hamburger |
| Separate `<header>` + `<nav>` on every page | Hero on all pages, nav below | Hero only on home page; nav is the full header on all others |
| Footer: single `<p>` with `&middot;` separators | No grouping, no visual hierarchy | Footer columns: Community / Developers / Search+Support |
| Mobile: nav wraps to second line (768px breakpoint) | Links shrink to 0.75rem but still all visible | Hamburger at ~900px; 0 nav links visible on mobile |
| No hamburger UI exists | N/A | New: hamburger button + dropdown panel |

**Deprecated/outdated:**
- `.site-header` class on non-home pages: remove from all non-home HTML
- The duplicate `.site-nav` CSS block at line 2718: consolidate into single definition
- `@media (max-width: 768px)` nav override: replace with `@media (max-width: 900px)` hamburger pattern

## Open Questions

1. **`interests.html` doesn't exist — what does the Interests nav link do on Phase 22 delivery?**
   - What we know: Phase 23 creates this page. Phase 22 ships the nav shell.
   - What's unclear: Should Phase 22 create a stub `interests.html`, or is a broken link acceptable on the commons-2.0 branch during development?
   - Recommendation: Create a minimal stub `interests.html` (just nav + "Coming soon" text) so the nav is fully functional end-to-end when Phase 22 ships. Phase 23 replaces the stub with the real page.

2. **Which pages get updated nav vs which are deferred?**
   - What we know: The CONTEXT.md says "29 pages currently" (research audit found 28). All need nav HTML updated.
   - What's unclear: Auth pages (`login.html`, `reset-password.html`) typically benefit from a minimal shell (just nav, maybe no footer). Should they get the full footer?
   - Recommendation: Give login and reset-password pages the full nav + footer. Consistency is more valuable than the marginal simplification. But treat them as lower-priority within the phase.

3. **Notification bell position on mobile**
   - What we know: CONTEXT.md marks this as Claude's discretion.
   - What's unclear: On mobile, the nav bar is: hamburger | title | [auth area]. The auth area on desktop is Dashboard + bell. On mobile, should the bell remain in the auth area (visible even on mobile) or hide and re-appear in the mobile panel?
   - Recommendation: Keep the bell visible on mobile in the auth area (right side). Dashboard link moves into the mobile panel. This means the mobile nav bar is: [hamburger] [The Commons] [bell (if logged in)] or [hamburger] [The Commons] [Login]. This avoids hiding the notification indicator behind another menu click.

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` — treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — manual browser testing only (no test runner in this project) |
| Config file | None |
| Quick run command | Open affected pages in browser, check at 375px and 1280px viewports |
| Full suite command | Open all 28 pages, verify nav/footer on each at 375px, 768px, and 1280px |

This project has no automated test infrastructure (no jest, vitest, or pytest). All validation is manual browser review. The verification criteria map directly to the phase success criteria.

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | How to Verify | Automatable? |
|--------|----------|-----------|---------------|-------------|
| NAV-01 | Nav shows exactly: Home, Interests, Reading Room, Postcards, News, Voices | Manual | Open any page, count nav items in desktop view | No |
| NAV-04 | No "Gathering" or "Chat" link in nav | Manual | Inspect `<nav>` HTML on any page; visit chat.html directly (should still load) | No |
| NAV-05 | No Submit, Propose, Suggest links in nav | Manual | Inspect `<nav>` HTML; check that propose.html, submit.html, suggest-text.html files still exist on disk | No |
| NAV-06 | About, Constitution, Roadmap, API, Agent Guide accessible from footer | Manual | Open any page, scroll to footer, verify all 5 links present and clickable | No |
| VIS-04 | No horizontal scroll on mobile | Manual | Chrome devtools: 375px viewport on every page; look for horizontal scrollbar | No (but scriptable with Puppeteer if desired) |
| VIS-05 | 6 nav items, no surprise popups | Manual | Hamburger tap opens panel; tapping link closes it; tapping outside closes it | No |

### Wave 0 Gaps

None — no automated test infrastructure exists or is required for this phase. All verification is browser-manual per project's no-build-step constraint.

## Sources

### Primary (HIGH confidence)
- Direct codebase audit: `css/style.css` — lines 204-265 (existing nav/header), lines 1385-1407 (existing footer), lines 1448-1493 (existing 768px media query), lines 2715-2801 (auth/nav CSS block)
- Direct codebase audit: `index.html`, `discussions.html`, `dashboard.html`, `profile.html` — current nav HTML structure
- Direct codebase audit: `js/auth.js` — `updateUI()` function (lines 857-887), ID dependencies
- Direct codebase audit: `.planning/phases/22-site-shell-navigation/22-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- MDN Web Docs (general knowledge): CSS `position: sticky` + `backdrop-filter: blur` browser support — both have 95%+ global support as of 2026
- General web practice: `aria-expanded` on hamburger buttons, `aria-controls` attribute — ARIA authoring practices

### Tertiary (LOW confidence)
- None — this phase is entirely internal to the codebase with no third-party dependencies to research

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components are already in the codebase; no new libraries
- Architecture: HIGH — patterns derived directly from existing codebase + locked CONTEXT.md decisions
- Pitfalls: HIGH — identified from direct code reading (duplicate CSS block, CSP hash pattern, dashboard auth inversion, `auth.js` ID dependencies are all confirmed in source)

**Research date:** 2026-03-03
**Valid until:** Indefinite — no third-party dependencies; validity tied to codebase changes, not library versions
