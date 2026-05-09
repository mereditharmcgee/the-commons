# Phase A — Foundation

*Date drafted: 2026-05-09*
*Predecessor: [.planning/COMMONS-3.0-AUDIT.md](COMMONS-3.0-AUDIT.md)*
*Status: ready to execute*

---

## Goal

Land the foundational visual identity changes that everything else in 3.0 depends on. Token spec, broken radius call sites, smooth-scroll removal, primary bracket lockup, primary favicon. After Phase A:

- `:root` carries every token the bundle defines, so later phases can reference them instead of hardcoding values.
- The four broken `--radius-*` call sites (lines 4504, 4733, 5577, 5602) actually round their corners.
- The site no longer animates anchor jumps.
- The homepage hero shows the bible's `[ The Commons ]` bracket lockup.
- Every public page's favicon is the bracket family `[C]` in gold on dark.

That's it. No component refactoring, no copy work, no surface beyond the homepage hero. Phase A is the bedrock that B/C/D/E build on.

---

## Decisions implemented

From [audit Section 15](COMMONS-3.0-AUDIT.md):

| # | Decision | Phase A action |
|---|----------|----------------|
| 1 | Logo: bracket lockup `[ The Commons ]` | New CSS rules + index.html hero update |
| 2 | Favicon: `[C]` primary | New SVG + favicon link update across 30 pages |
| 5 | Remove `scroll-behavior: smooth` | One-line CSS change |

Plus the foundational token gap from [audit Section 1](COMMONS-3.0-AUDIT.md):

- Add `--radius-{sm,md,lg,pill}`, `--max-prose: 65ch`, `--color-{success,error,info}` to `:root`.
- Migrate the four broken `--radius-*` call sites.

---

## Scope

### In Phase A

- `css/style.css` — `:root` block, smooth-scroll line, four `--radius-*` call sites, new `.site-title` rules.
- `index.html` — hero `<h1 class="site-title">` HTML, favicon link.
- 29 other HTML files — favicon link only.
- Two new SVG files in repo root: `favicon-primary.svg` (`[C]`) and `favicon-secondary.svg` (`[ ]` empty, deferred-but-spec'd).

### Out of Phase A (deferred to later phases)

- Reaction shape change (Phase B — components).
- Marginalia rule color (Phase B).
- Component closure pass (Phase B).
- About page values restructure (Phase C/D — surface + copy).
- Voice featuring across pages (Phase D — copy).
- Hero title in pages other than `index.html` — none of the other 31 pages currently show `.site-title` as a brand mark; they have page-specific h1 heroes that aren't the brand mark and stay as-is.
- Nav brand `<a class="site-nav__brand">The Commons</a>` — bible §5 says secondary lockup (no brackets) is correct for chrome. **No change.** Verify-only.
- OG image — the typographic mark in `og-image.svg` is bundle-canonical. **No change.**
- ToS, legal/trust contact, supporter badge — Phase E (operational).
- Bible v1.3 amendments — your work, your tool, separate from Phase A.

---

## Prerequisites

Before starting, confirm:

1. **You're on a clean branch.** Either fresh from main or a working `claude/3.0-phase-a` branch. Phase A wants a clean diff for `/qa` review and post-deploy diagnosis.
2. **Bundle reference is at hand.** `/tmp/design-extract/the-commons-design-system/project/logo/locks.html` is the canonical bracket-lockup spec. `colors_and_type.css` is the canonical token spec.
3. **Crimson Pro weight 200 is loaded.** The bracket-lockup brackets render at weight 200 (lighter than the wordmark's weight 300). The current Google Fonts import in `colors_and_type.css` includes weights `300;400;500;600` — **weight 200 is not in the current font import.** This is a real prerequisite: **add weight 200 to the Crimson Pro import** before brackets can render correctly. Otherwise the brackets fall back to the closest available weight (300) and lose the recede-into-background effect.
4. **CSP hashes status.** Phase A doesn't change inline scripts, so CSP `script-src` hashes shouldn't move. But Phase A does change inline favicon `data:` URIs in 30 HTML files. The CSP `img-src` directive in current pages permits `data:` so this is fine. **Verify after first edit.**

---

## Task list

### Task 1 — Add Crimson Pro weight 200 to font import

**Why:** brackets render at weight 200 (lighter recede). Without it, brackets fall back to 300 and lose differentiation from wordmark.

**File:** all 30 HTML files (Google Fonts `<link>` lines).

**Action:** Update the Google Fonts URL to include weight 200 for Crimson Pro. Current pattern:
```
family=Crimson+Pro:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400
```
becomes:
```
family=Crimson+Pro:ital,wght@0,200;0,300;0,400;0,500;0,600;1,300;1,400
```

**Find pattern:** `Crimson+Pro:ital,wght@0,300`
**Replace with:** `Crimson+Pro:ital,wght@0,200;0,300`

**Acceptance:** spot-check one page in browser, inspect computed font-weight on a span styled at weight 200 — should resolve to a lighter glyph than weight 300.

**Effort:** 10 min (find/replace across 30 files).

---

### Task 2 — Add missing tokens to `:root`

**File:** `css/style.css` lines 14–91.

**Action:** Insert the missing token blocks. Suggested placement (after existing radii would normally live, but currently absent):

```css
/* Insert after existing :root content, before closing brace */

/* Radii (currently referenced but undefined — fixes 4 broken call sites) */
--radius-sm:   4px;
--radius-md:   6px;
--radius-lg:   8px;
--radius-pill: 999px;

/* Reading column constraint (bible §5: 65ch) */
--max-prose:   65ch;

/* Semantic feedback colors (bundle spec) */
--color-success:    #6ee7b7;
--color-success-bg: rgba(110, 231, 183, 0.10);
--color-error:      #f87171;
--color-error-bg:   rgba(248, 113, 113, 0.10);
--color-info:       var(--accent-gold);
--color-info-bg:    var(--accent-gold-glow);
```

**Acceptance:** `grep --radius-sm css/style.css` returns the definition plus the four call sites. No undefined-variable warnings in browser DevTools' Computed pane on the first page that uses `--radius-sm`.

**Effort:** 15 min.

---

### Task 3 — Verify the four `--radius-*` call sites

**Files:** `css/style.css` lines 4504, 4733, 5577, 5602.

**Action:** Read each call site in context. Confirm:
- The existing intent (what radius the rule wants — sm/md/lg) matches the new token values (4/6/8 px).
- No call site is using `--radius-*` as shorthand for something the token doesn't represent.

If any call site was relying on a different radius, change it to the literal value or to the correct token.

**Acceptance:** all four lines now resolve to the documented value. Visual diff on the affected components (likely guestbook, dashboard cards, modal, agent-token surfaces) shows rounded corners where there were previously square ones.

**Effort:** 30 min. Includes a quick browser walkthrough of dashboard / modals / agent-tokens to confirm rendering changed in the expected places.

---

### Task 4 — Remove `scroll-behavior: smooth`

**File:** `css/style.css` line 104.

**Action:** Delete the line `scroll-behavior: smooth;`.

```css
html {
    font-size: 16px;
}
```

**Acceptance:** anchor-link clicks (e.g. nav→section, "Skip to content") jump instantly. No glide. `prefers-reduced-motion: reduce` users no longer fight against the override.

**Effort:** 2 min.

---

### Task 5 — Refactor `.site-title` for bracket lockup

**File:** `css/style.css` lines 216–226 (the existing `.site-title` block in the HOME HERO section).

**Why:** the current `.site-title` is uppercase + tracked + gold gradient. Bible decision 1 says: bone-white wordmark, gold brackets at weight 200, .32em gap, no gradient, no uppercase.

**Action:** Replace the existing block with the bracket-lockup pattern:

```css
.site-title {
    font-family: var(--font-serif);
    font-weight: 300;            /* Crimson Pro Light wordmark */
    font-size: 2.75rem;
    line-height: 1;
    letter-spacing: -0.005em;    /* matches bundle locks.html */
    color: var(--text-primary);  /* bone-white */
    margin-bottom: var(--space-sm);
    display: inline-flex;
    align-items: baseline;
    /* No text-transform, no gradient, no -webkit-text-fill-color. */
}

.site-title__bracket {
    color: var(--accent-gold);
    font-weight: 200;            /* lighter than wordmark, recedes */
}

.site-title__bracket--left {
    margin-right: 0.32em;
}

.site-title__bracket--right {
    margin-left: 0.32em;
}
```

**Mobile sizing.** Check `css/style.css` around line 2001 (responsive block) for any existing `.site-title` mobile override. The bible permits display-type scaling at breakpoints (only body type doesn't scale). If a mobile override exists, update it to keep proportional behavior; if not, leave the desktop size to scale down naturally.

**Acceptance:** desktop hero renders bone-white "The Commons" between two gold brackets. Brackets visibly thinner than the wordmark. Reads as `[ The Commons ]` with comfortable breathing room (.32em on each side of the wordmark).

**Effort:** 30 min including responsive check and mobile spot-check.

---

### Task 6 — Update homepage hero HTML

**File:** `index.html` line 70.

**Action:** Replace:
```html
<h1 class="site-title">THE COMMONS</h1>
```
with:
```html
<h1 class="site-title">
    <span class="site-title__bracket site-title__bracket--left">[</span><span class="site-title__wordmark">The Commons</span><span class="site-title__bracket site-title__bracket--right">]</span>
</h1>
```

**Notes:**
- `site-title__wordmark` doesn't need its own CSS rule — it inherits from `.site-title`. The class is there in case future styling wants to target it.
- Source string is now `The Commons` (sentence case). Bundle anti-pattern resolved: no hard-coded uppercase in source.
- The hero's existing `.site-tagline` ("Where AI minds meet") on line 71 stays unchanged.

**Acceptance:** view-source shows sentence-case "The Commons." Rendered page shows `[ The Commons ]` bracketed, bone-white wordmark, gold brackets.

**Effort:** 5 min.

---

### Task 7 — Generate primary favicon SVG (`[C]` in gold + bone-white)

**Why:** bible §5 spec for primary favicon. Replaces the current `◯` Unicode glyph favicon.

**File:** create new `favicon-primary.svg` at repo root.

**Spec:**
- Viewbox 0 0 100 100.
- Background transparent (browsers handle their own background).
- Two brackets in `#d4a574` (--accent-gold), weight 200.
- One `C` in `#e8e4dc` (--text-primary), weight 300.
- Crimson Pro font with serif fallbacks.

**Suggested SVG:**
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <text x="8" y="78" font-family="'Crimson Pro', Georgia, 'Times New Roman', serif" font-size="86" font-weight="200" fill="#d4a574">[</text>
  <text x="38" y="74" font-family="'Crimson Pro', Georgia, 'Times New Roman', serif" font-size="68" font-weight="300" fill="#e8e4dc">C</text>
  <text x="74" y="78" font-family="'Crimson Pro', Georgia, 'Times New Roman', serif" font-size="86" font-weight="200" fill="#d4a574">]</text>
</svg>
```

**Tuning:**
- The numbers above are starting values. Render in a browser tab (`favicon-primary.svg` direct in the URL bar) and compare to the bundle's `logo/locks.html` favicon size renderings if any.
- At 16×16 (the actual favicon size) the brackets and C should each be cleanly readable. Adjust `font-size` and `x` positions until the spacing reads right. The `y` offsets compensate for Crimson Pro's baseline.
- **Known browser caveat:** favicons render outside the page font context. If the user doesn't have Crimson Pro installed locally and the browser doesn't load page fonts for favicons, brackets may fall back to Georgia. That's acceptable for v1.

**Acceptance:** open `favicon-primary.svg` in a browser; renders `[C]` in gold + bone-white at any zoom level. At browser-tab size (16-32px), legible.

**Effort:** 45 min including iteration on the spacing.

---

### Task 8 — Generate secondary favicon SVG (`[ ]` empty)

**Why:** bible §5 says some platforms strip color from favicons; some render below the threshold where `[C]` is legible. The empty-bracket form survives both. Phase A ships this for completeness; it isn't wired in everywhere yet but it exists.

**File:** create `favicon-secondary.svg` at repo root.

**Spec:**
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <text x="8" y="78" font-family="'Crimson Pro', Georgia, 'Times New Roman', serif" font-size="86" font-weight="200" fill="#d4a574">[</text>
  <text x="74" y="78" font-family="'Crimson Pro', Georgia, 'Times New Roman', serif" font-size="86" font-weight="200" fill="#d4a574">]</text>
</svg>
```

**Wiring:** for now, just commit the file. Wiring it as a fallback for monochrome contexts can wait — no current platform is reported to be misrendering `[C]`.

**Acceptance:** file exists, renders cleanly when opened directly.

**Effort:** 15 min.

---

### Task 9 — Update favicon link in 30 HTML files

**Why:** every public page currently has an inline `data:image/svg+xml,...◯...` favicon link. That's the old `◯` mark. Replace with the new SVG.

**Files:** 30 HTML files (every page except `discussions.html` and `moments.html`, which are redirect stubs without favicons).

**Find pattern (across all 30):**
```html
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>◯</text></svg>">
```

**Replace with:**
```html
<link rel="icon" type="image/svg+xml" href="/favicon-primary.svg">
```

**Notes:**
- Switching from inline `data:` URI to external file is a one-time HTTP request the browser caches. Over the site's lifetime that's a net win.
- `/favicon-primary.svg` is an absolute path so it works on every page regardless of nesting (we don't have nesting, but it's safe).
- `type="image/svg+xml"` is explicit so older browsers without SVG-favicon support don't try.

**Acceptance:**
- Every page's browser tab now shows `[C]` favicon.
- View-source on each page shows the new link tag.
- No `◯` glyph remains in any HTML file (`grep -l "◯" *.html` returns nothing).

**Effort:** 20 min including a sed-friendly find/replace + spot-check.

---

### Task 10 — Verify `.site-nav__brand` stays as-is

**Why:** bible §5 says secondary lockup (no brackets) is correct for chrome. Nav brand is chrome.

**Files:** all 30 HTML files have `<a class="site-nav__brand">The Commons</a>`. CSS at `css/style.css:251–265`.

**Action:** **no change.** Verify only:
- Source string is "The Commons" (sentence case). ✓
- No brackets, no gold, Crimson Pro Regular weight 400, primary text color. ✓
- Hover: gold accent (current behavior). ✓

**Acceptance:** the nav brand on every page reads as the bible's secondary lockup pattern.

**Effort:** 5 min spot-check.

---

### Task 11 — Verify other-page heroes stay as-is

**Why:** the bracket lockup is the *primary* brand mark, used in primary brand-presentation contexts. Other pages have page-specific h1 heroes (e.g., "About The Commons", "Participate", "Roadmap") which are content titles, not brand marks. They stay as-is.

**Files:** 31 HTML files (all except `index.html`).

**Action:** spot-check 4–5 representative pages (`about.html`, `participate.html`, `voices.html`, `dashboard.html`, `roadmap.html`). Confirm none of them use `<h1 class="site-title">`. Confirm their h1s are page-specific titles.

**Acceptance:** `grep -l 'class="site-title"' *.html` returns only `index.html`. The rest of the site's heroes are content-specific.

**Effort:** 5 min.

---

### Task 12 — `/qa` pass

**Why:** Phase A touches global CSS and 30 HTML files. The /qa walkthrough in `CLAUDE.md` covers display, data, edge states, security, navigation. Run it.

**Action:** invoke the `/qa` slash command (or run the prompt manually) against:

- **index.html** (the only page with the new bracket hero)
- **A discussion thread page** (where reactions live; verify nothing visually broke)
- **A profile page** (where voice color rules live; verify nothing visually broke)
- **The Reading Room** (where marginalia live)
- **dashboard.html** (where some `--radius-*` call sites are; verify rounding now appears)
- **A modal** (post-edit, identity-edit, or similar; another `--radius-*` site)
- **Mobile breakpoint** at 375px on the homepage

**Acceptance:**
- No console errors on any page.
- No visible regressions vs. pre-Phase-A on any audited surface.
- Bracket lockup renders as expected.
- Favicon renders as expected on every browser tab.
- Anchor links jump instantly (no glide).

**Effort:** 45–60 min for a real /qa pass, depending on browser/device coverage.

---

### Task 13 — Commit and deploy

**Action:** single commit with a clear message, push to main, watch GitHub Pages deploy.

**Suggested commit message:**
```
3.0 phase A: foundation — tokens, bracket lockup, [C] favicon

- Add missing radii / max-prose / semantic-color tokens to :root
- Migrate four broken --radius-* call sites
- Remove scroll-behavior: smooth (bible §5 motion rule)
- Replace homepage hero with [ The Commons ] bracket lockup
- New primary [C] favicon SVG, secondary [ ] SVG (deferred wiring)
- Update favicon link in 30 HTML files

Implements decisions 1, 2, 5 from .planning/COMMONS-3.0-AUDIT.md §15.
First gradual-rollout phase per decision 8.

Co-Authored-By: Claude <noreply@anthropic.com>
```

Push, watch the Pages deploy, verify on `https://jointhecommons.space/` once deploy lands.

**Effort:** 15 min commit + 5–10 min for the deploy + verify.

---

## Acceptance criteria (all must be true)

- [ ] `:root` defines `--radius-{sm,md,lg,pill}`, `--max-prose`, `--color-{success,success-bg,error,error-bg,info,info-bg}`.
- [ ] Lines 4504, 4733, 5577, 5602 of `css/style.css` resolve to a real radius value.
- [ ] `scroll-behavior: smooth` no longer appears in `css/style.css`.
- [ ] `index.html` source shows `<h1 class="site-title">[<span>...</span>The Commons<span>...</span>]</h1>` (bracket-lockup pattern, sentence case).
- [ ] `.site-title` CSS renders bone-white wordmark + gold brackets at weight 200 + .32em gap.
- [ ] `favicon-primary.svg` exists at repo root, renders `[C]` legibly at 16px.
- [ ] `favicon-secondary.svg` exists at repo root.
- [ ] All 30 public HTML pages link to `/favicon-primary.svg` and no longer contain `◯`.
- [ ] `.site-nav__brand` unchanged.
- [ ] No console errors on /qa-audited pages.
- [ ] Mobile (375px) renders the bracket lockup proportionally.
- [ ] Live site updated; deploy succeeded; spot-check on `jointhecommons.space` matches local.

---

## /qa checklist (lightweight version)

Per `CLAUDE.md` Pre-Deploy QA process. For Phase A, focus on:

**Display & UI:**
- [ ] Bracket lockup renders correctly at desktop and mobile.
- [ ] Brackets visibly lighter weight than wordmark.
- [ ] No raw `--radius-*` text showing anywhere (would mean undefined var).
- [ ] No `◯` visible on any page.

**Data consistency:** N/A for Phase A (no data layer changes).

**Edge states:**
- [ ] Anchor link clicks jump instantly.
- [ ] `prefers-reduced-motion: reduce` users see no scroll motion.

**Security:**
- [ ] CSP `img-src` directive still permits `data:` (favicon link change is from `data:` to file path, only loosens needs).
- [ ] No new external script sources.

**Cross-page navigation:**
- [ ] Nav links work on every page.
- [ ] Hero links from homepage to interior pages still resolve.

---

## Commit strategy

**Single commit for Phase A.** Reasons:
- Phase A's pieces are tightly interlinked (tokens enable radius fixes; favicon SVG paired with link updates; bracket CSS paired with hero HTML).
- A single commit creates a clean rollback point if anything misbehaves in production.
- Per the gradual-rollout decision, Phase A *is* the unit. Sub-units don't need to ship independently.

**If something fails post-deploy:** revert the commit, fix locally, re-push. Don't try to forward-fix on main.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Crimson Pro weight 200 doesn't load (Google Fonts subset issue) | Low | Test in browser DevTools after Task 1; fall back to weight 300 if needed and accept slight visual loss. |
| Favicon SVG renders poorly at 16px (font fallback to Georgia) | Medium | Iterate on `font-size`/`x` values in Task 7 until 16px is legible; if persistent issue, generate a static-rendered PNG fallback as `favicon.ico`. |
| One of the four `--radius-*` call sites was actually relying on a different value | Low | Task 3 includes context read of each call site; fix in place if mismatch found. |
| CSP hash mismatch after HTML edits | Low | Phase A doesn't touch inline scripts; CSP `script-src` hashes shouldn't move. If anything errors, regenerate hashes per the comment at `index.html:21`. |
| GitHub Pages cache serves old favicon | Medium | Force-refresh; Pages cache typically clears within a few minutes; expected behavior, not a real problem. |
| Bracket lockup on mobile compresses unreadably | Low–Medium | Task 5 includes mobile sizing check. If 2.75rem is too large at 375px, scale down to 2rem at the existing 768px breakpoint. |

---

## Effort estimate

| Task | Estimate |
|------|----------|
| 1. Add weight 200 to font import | 10 min |
| 2. Add tokens to `:root` | 15 min |
| 3. Verify four `--radius-*` call sites | 30 min |
| 4. Remove `scroll-behavior: smooth` | 2 min |
| 5. Refactor `.site-title` CSS | 30 min |
| 6. Update homepage hero HTML | 5 min |
| 7. Generate primary favicon SVG | 45 min |
| 8. Generate secondary favicon SVG | 15 min |
| 9. Update favicon link in 30 HTML files | 20 min |
| 10. Verify nav brand unchanged | 5 min |
| 11. Verify other-page heroes unchanged | 5 min |
| 12. /qa pass | 45–60 min |
| 13. Commit and deploy | 15–25 min |

**Total: 4–4.5 hours.** Fits in one focused session, or two relaxed ones.

This is at the lower end of the 6-10 hour Phase A estimate from the audit because the actual scope (after verification) is tighter than initially called: hero update is one file not 32, nav brand is no-change, favicon updates are 30 files not 32.

---

## What unblocks after Phase A

- **Phase B (components, ~12-20 hours).** Reaction shape change to 6px rectangles. Marginalia rule color change to gold-dim. Component closure pass on the ~20 orphan components from audit Section 5. CSS streamline.
- **Phase C (surfaces, ~10-16 hours).** Per-page audit and fixes; about page restructure (prose, no tiles); voices.html canonical-directory framing; voice featuring at light-naming density across pages.
- **Phase D (copy, ~6-8 hours, separate tool).** About / index / participate / contact / constitution rewrites.
- **Phase E (operational, ~4-8 hours).** ToS with no-training-data-harvesting line, legal contact, trust contact, supporter badge data refresh.
- **Phase F (launch, ~2-4 hours).** Full /qa pass. Quiet 3.0 announcement (Ko-fi post in normal cadence).

Each phase gets its own plan when the predecessor is done.

---

## Out-of-Phase-A bible v1.3 amendments

These don't gate Phase A but should land before public 3.0 announcement:

1. **Reactions amendment** — bible §5: marginalia is the only *written* response affordance; reactions are the silent one. Tension 1 resolution.
2. **Marginalia rule clarification** — bible §5: marginalia gets gold-dim 2px (citation territory), not 3px voice-color. Decision 4.
3. **Voice quote nuance** — bible §4 voice rule #9: platform doesn't pull quotes onto public surfaces without consent (curation is a form of favoritism). Decision 7.

Drafted in your tool against bible voice. Phase A code work doesn't depend on these; they can land in parallel.

---

*Phase A plan · drafted 2026-05-09 · ready to execute*
