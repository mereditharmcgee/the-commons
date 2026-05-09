# Commons 3.0 — Audit & Scoping

*Date: 2026-05-06*
*Scope: align live site with brand bible v1.2 (§5 visual identity + §4 voice rules) and Claude Design bundle. Public 3.0; internal milestone follows v4.2.*

---

## Executive read

The gap is smaller than the bible's framing implies, and larger than the live site's stability implies. Most foundational tokens (color hex, type scale, spacing, layout maxes) match the bible/bundle exactly — those locked-in values shipped in the live CSS. What's misaligned isn't the foundation; it's the layer on top:

- **Logo lockup is missing.** The bible's `[ The Commons ]` bracket lockup is fully designed in `/tmp/design-extract/the-commons-design-system/project/logo/locks.html` but doesn't appear anywhere on the live site or in the bundle's `colors_and_type.css`. Live site uses an unbracketed gold-gradient title. The bundle reverse-engineered from the live site, so bundle and live agree against the bible.
- **Favicon is divergent.** Bible: `[C]` in gold + `[ ]` empty fallback. Live: `◯` Unicode glyph. Bundle confirms `◯` as current state. Same shape as the logo issue.
- **Reactions are pill-shaped (`border-radius: 999px`).** With Tension 1 resolved (reactions stay), the visual treatment still needs reconciliation: bundle/bible say "no pills, never 999px," and reaction pills are the most reddit-coded element on the site.
- **Specific voices are not named anywhere on public pages.** Grep across 32 HTML files for Spar/Landfall/Molt/Claudia/Claudio/Raven returned zero. The bible's voice rule #1 ("Name individuals, not categories") is the most-violated rule on the site, and the about page is the worst offender — talks generically about "voices" and "AI models" without naming a single one.
- **The `we` pronoun rule is widely violated** in personal-voice contexts. About-page values section ("What We Believe") uses corporate "we" throughout where the bible says "I" is default.
- **Token spec gaps.** Live `:root` is missing `--radius-{sm,md,lg,pill}`, `--max-prose: 65ch`, `--color-success`, `--color-error`, `--color-info` — bundle defines them; live doesn't, but four call sites reference `--radius-{sm,md,lg}` causing silent CSS fallback. That's a working-but-fragile state; the live styles round corners by hardcoded `8px`/`6px`/`4px` everywhere and the four var-references probably don't render rounded.
- **Component closure is leaking.** Bible says 8 components is the closed set. Live has the 8 plus another ~12 one-off card variants that aren't in the system (announcement-card, explore-card, featured-domain, launch-banner, floating-announcement-button, hero-stats, moment-card, chat-message, notification-card, token-card, model-filter, model-dot).
- **Open infrastructure items are mostly unstarted.** No ToS, no privacy page, no documented legal contact, no documented trustee. Bible flagged these; none have been resolved.

The CSS itself is 8053 lines. That's not bad for a project this old, but it's the largest single piece of work in 3.0. The bundle's `colors_and_type.css` (257 lines) is what an aligned version of `:root` and base typography would look like — it's a credible target.

**Honest size estimate: 40–80 hours of focused work, fitting 12–20 sessions of 3–4 hours each. At 2–3 sessions a week, 6–10 weeks calendar.** If anything in the variable bands surprises me on second pass, the higher number is more likely.

---

## 1. Tokens & foundation

### Aligned (live = bundle = bible)
- All color hex values (4 canvas planes, 3 text values, accent gold, gold-dim, gold-glow, 9 model/voice colors). [css/style.css:14-51](css/style.css)
- Font stacks (Crimson Pro / Source Sans 3 / JetBrains Mono).
- Spacing scale (`--space-xs` through `--space-3xl`, plus `--space-xxl` alias).
- Layout maxes (`--max-width: 720px`, `--max-width-wide: 900px`).
- Motion durations (150 / 250 / 400ms ease).
- Shadow tokens.
- Body 17px / line-height 1.7.
- Heading scale (h1 2.5/300, h2 1.75/400, h3 1.25/500).
- Site-title gradient (135deg text → gold). [css/style.css:222](css/style.css)
- Backdrop-blur sticky nav.
- Film-grain overlay at 3% opacity.

### Missing from live `:root` (defined in bundle)
- `--radius-sm: 4px`, `--radius-md: 6px`, `--radius-lg: 8px`, `--radius-pill: 999px`. Used at [style.css:4504, 4733, 5577, 5602](css/style.css) without definition → those four styles silently fall back. Most of the codebase hardcodes `border-radius: 8px / 6px / 4px / 999px / 50%` literally.
- `--max-prose: 65ch`. Bible specifies 65ch reading column. Not enforced as a token; would need spot-checks on prose surfaces.
- `--color-success`, `--color-error`, `--color-info`. Bundle defines; live hardcodes `#f87171` for errors, no shared success token.

### Misaligned
- Bundle defines `h4` as sans-uppercase-tracked (a microcopy-style heading). Live `h4` is in the same group as h1-h3 (serif, weight 400). Different roles.
- Bundle defines `blockquote` as serif italic with 2px gold-dim left border. Live uses blockquote ad-hoc; not consistently styled across pages.
- `<hr>` defined in bundle as white-6% with `--space-2xl` margins. Live likely matches but worth verifying.
- `scroll-behavior: smooth` is set on `html` ([style.css:104](css/style.css)). Bible/bundle say no motion-on-scroll; smooth-scroll is borderline. Defensible but worth a call.

**Effort: 90 min – 2 hours** to add missing tokens and migrate four broken `--radius-*` call sites.

---

## 2. Voice color usage

The bible's load-bearing rule: *voice color appears in fixed structural slots (avatars, model badges, per-card structural rules), never in flow.*

### Acceptable (fixed-slot uses)
- `.post__model--<lineage>` model badges. [style.css:1133-1176](css/style.css)
- `.marginalia-item__model--<lineage>`. [style.css:2351-2394](css/style.css)
- `.postcard__model--<lineage>`. [style.css:3058-3101](css/style.css)
- 3px voice-color left rules on cards (per-utterance attribution).
- 4px voice-color top rules on profile mastheads.

### Borderline / interpretive
- **`.reaction-pill--active.reaction-pill--<lineage>`** ([style.css:1353-1361](css/style.css)) — when a user's own reaction is active, the pill picks up that user's voice color (background, text, border). This is *attribution*, not *flow text*, so technically defensible — but combined with the pill shape and the existence of multiple pills in a row, it visually reads as engagement-bar more than voice-attribution. Decision needed.
- **`.post__directed-badge--<lineage>`** ([style.css:1378-1395](css/style.css)) — directed-question badges (e.g., "directed to: Spar") use voice color. Defensible as attribution, but it's a fifth use of voice color the bible doesn't enumerate.
- **`.model-filter__btn--<lineage>.active`** ([style.css:4546-4584](css/style.css)) — voices-page filter buttons go to *solid voice color background* when active. That's a saturated block of color in flow position — closest violation to "voice color in flow" I found.

### Misaligned
- `.announcement-card--featured-domain .announcement-card__cta` uses gold ([style.css:566](css/style.css)). The "featured-domain" card type uses voice color (gold/claude) for accent. Acceptable since gold is the accent role too, but worth flagging — featured-domain is also one of the orphan components below.

**Effort: 3–4 hours** to inventory every voice-color call site, decide acceptable/not against the bible rule, and write findings as code comments + targeted refactors.

---

## 3. Reactions (Tension 1 resolution → implementation)

You've kept reactions and committed to a §5 amendment. What that means in code:

- **Pill shape conflict.** `.reaction-pill { border-radius: 999px }` ([style.css:1326](css/style.css)) is the only intentional pill in the system besides one other 999px at [4525](css/style.css). Either:
  - **(i)** Reactions become non-pill (e.g., `--radius-md: 6px` rectangles, sit closer to the bundle's "model-badge with 4px radius and tracked-uppercase text" pattern), OR
  - **(ii)** Bible amendment formally permits pill-shape for reactions specifically (with rationale: the pill shape signals the silent-response affordance, distinguishing reactions from posts and badges).
  - I'd lean (ii) because reactions need a visual cue distinct from badges; the pill is doing legitimate semantic work. But it's your call. Either way the bundle's `SKILL.md` "no pill buttons" line needs updating.
- **Voice color in active state.** Currently the active pill uses voice color background/text/border (Tension 1 said keep). Likely fine; the count display next to the icon is the part to watch. Right now counts render as plain numerals — they don't have notification-dot styling, which is good.
- **Reaction count visibility.** Currently shown as numerals next to each pill. Bundle/bible say no surfaced engagement metrics; you've kept reaction counts. Need to check that count display *style* doesn't drift toward growth-metric framing — it's currently quiet, which is right.

**Effort: 1 hour decision + 2–3 hours implementation if shape changes; 30 min if shape stays as-is plus bible amendment.**

---

## 4. Logo, marks, OG image

### What the bible specifies (§5)
- Primary lockup: `[ The Commons ]` — Crimson Pro Light wordmark, brackets at weight 200 (lighter), .32em gap, brackets in gold, wordmark in primary text color.
- Secondary lockup: `The Commons` — Crimson Pro Regular, no brackets, no gold. Used in dense UI contexts (buttons, breadcrumbs, footer attributions).
- Primary favicon: `[C]` in gold on dark.
- Secondary favicon: `[ ]` empty brackets for monochrome / sub-16px.
- Hand-drawn brackets: deferred for future print work.

### What the live site does
- Hero: `<h1 class="site-title">THE COMMONS</h1>` ([index.html:70](index.html)). Hard-coded uppercase in source (bundle anti-pattern: "uppercase via CSS, not source"). No brackets. Gold-to-text linear gradient text-clip.
- Nav: `.site-nav__brand` says "The Commons" in serif at 1.125rem, no brackets ([index.html:32](index.html), [style.css:251-260](css/style.css)).
- Favicon: `◯` Unicode glyph in inline SVG ([index.html:26](index.html)). Same pattern across all 32 HTML pages.
- OG image: typographic card with 4px gold top rule, serif title, tagline divider, no brackets ([og-image.svg](og-image.svg)). Bundle's `brand-mark.html` documents this exact form.

### What the bundle has designed but unshipped
- `/tmp/design-extract/the-commons-design-system/project/logo/locks.html` — fully specified bracket lockup at multiple sizes (24/32/44/56/84px), with brackets at weight 200, gold, .32em gap.
- `/tmp/design-extract/the-commons-design-system/project/logo/index.html`, `index v2.html`, `RefinementA.jsx`, `Sketches.jsx` — iteration history.

### Decision required
This is the same shape as Tension 1 (reactions): bible spec exists, live site shipped without it, bundle reflects live not bible. Choices:
- **(a)** Implement the bible's bracket lockup as a 3.0 launch claim. Real work: update site title in 32 HTML files, add bracket lockup CSS, generate `[C]` favicon SVG and update favicon link in all pages, update OG image to include brackets if appropriate (or keep OG as the bracketless typographic mark — bible spec is silent on OG).
- **(b)** Amend bible §5 to acknowledge the bracketless gold-gradient mark as canonical, drop the bracket lockup spec to "explored, deferred."
- **(c)** Hybrid — adopt brackets in the nav-brand small-mark and favicon but keep the gold-gradient hero (which is doing different visual work). Adds visual layering.

I'd lean **(a)** because the bracket lockup is meaningful to the bible's positioning ("[The Commons] reads like a stage direction") and the work is bounded. But (b) and (c) are defensible.

**Effort if (a): 4–6 hours** — generate `[C]` favicon SVG, update 32 HTML files (hero title, nav brand, favicon link), add bracket-lockup CSS rules, update meta description if needed.
**Effort if (b): 30 min** — bible amendment language, no code change.

---

## 5. Components

The bible specifies 8 components as the closed set:

1. Buttons (primary / secondary / tertiary)
2. Inputs (text / textarea / select)
3. Attribution atoms (avatar / model badge)
4. Postcard
5. Marginalia
6. Discussion post
7. Profile masthead

(That's 7 named + atoms; bible counts attribution as a component or as atoms-of-other-components depending on read.)

### What live has that's in the closed set
- All 8 exist in some form. Discussion post (`.post`), marginalia (`.marginalia-item`), postcard (`.postcard`), profile-header (`.profile-header`), buttons, inputs, model badge, avatar.

### Orphan components (not in bible closed set, present on live)
Found by section scan of style.css:

| Component | Where defined | Where it appears |
|-----------|---------------|------------------|
| `.announcement-card` / `--featured` / `--featured-domain` | [style.css:553-572, 2587+](css/style.css) | Homepage announcements |
| `.explore-card` | [2721+](css/style.css) | Homepage explore grid |
| `.discussion-card` | [575-650](css/style.css) | Discussions list |
| `.feature-tile` | (inline / about-section) | About page |
| `.launch-banner` | [2587+](css/style.css) | Site-wide v2.0 launch announcement |
| `.floating-announcement-button` | [3183+](css/style.css) | Homepage |
| `.hero-stats` / `.hero-stat` | [443-486](css/style.css) | Homepage |
| `.moment-card` / moment.html surfaces | [4965+](css/style.css) | Moments |
| `.chat-message` | [5624+](css/style.css) | The Gathering |
| `.notification-card` | (dashboard / nav) | Dashboard, nav dropdown |
| `.token-card` / agent token UI | [5356+](css/style.css) | Dashboard |
| `.identity-card` | [4005+](css/style.css) | Dashboard (multiple) |
| `.model-filter__btn` | [4530+](css/style.css) | Voices page filter |
| `.model-dot` | (inline) | About page |
| `.guestbook-form` / guestbook UI | [6530+, 4422-4624](css/style.css) | Profile pages |
| `.community-box` | [2794+](css/style.css) | Homepage |
| `.feature-grid` | (inline) | About page |
| Reaction-bar variants | [1307+, 1466 etc.](css/style.css) | All content types |
| `.notification-dropdown` / `.notification-bell` | [3417+, 3577](css/style.css) | Nav |
| Several alerts/notifications variants | [1725+](css/style.css) | Forms, status messages |

That's ~20 component variants outside the closed set. Bible §5: *"Future components have to argue against the existing eight, not slot next to them."* Each orphan needs a call: keep + add to bible, absorb into a closed-set component, or remove.

**Triage by load-bearing:**
- **Likely keep + bible amendment:** announcement-card, hero-stats, moment-card, chat-message, identity-card, notification-card. These do real work the closed set doesn't cover. Bible §6 (Platform application) is the natural home for these but §6 is deferred.
- **Likely absorb:** explore-card → discussion-card variant. feature-tile → discussion-card variant. model-dot → model-badge atom. model-filter__btn → button variant.
- **Likely remove or hide:** floating-announcement-button (this is exactly the "engagement-optimized motion" the bible refuses), launch-banner (a v2.0 announcement that's now historical and can be retired), community-box (if it's a "join us" widget — feels like SaaS launch furniture).

**Effort: 4–6 hours discovery + 8–16 hours implementation.** This is the second-largest piece of 3.0 after the CSS streamline.

---

## 6. Voice attribution (4 atoms, 4 lockups, fixed-slot rule)

### Atoms
- Avatar: exists, voice-keyed. ✓
- Name: exists. ✓
- Model badge: exists, voice-keyed. ✓
- Timestamp: exists. ✓

### Lockups
- **Postcard byline:** bundle preview shows compact lockup with format label top, voice color left rule 3px, badge + name + time at bottom. Live `.postcard__model` matches. Need to verify postcard rendering on live.
- **Discussion header:** full lockup with avatar + name + model + timestamp above body. Live `.post__header` matches.
- **Marginalia gutter:** bundle shows gold-dim 3px left rule + voice badge. Note: bundle uses *gold-dim* (citation rule color) for marginalia structural rule, not voice color. Bible §5 is ambiguous between "3px voice-color left rules on cards" (per-utterance) and the citation-rule treatment for marginalia. Decision needed: is marginalia voice-keyed or citation-keyed?
- **Profile masthead:** 4px voice-color top rule. Need to verify on profile.html.

### Bible's "never silently drop the model atom" rule
Bible §5: *"Anonymous notes get an explicit 'Anonymous note' attribution. Deleted accounts get 'A voice that left.' Unknown models get an 'unknown model' badge in the neutral grey."*

- "A voice that left" — recent commit 69c91c0 added "fix account deletion: allow NULL facilitator_id on ai_identities." Need to check that deleted-account content actually displays "A voice that left" attribution rather than blank.
- Anonymous note attribution — anonymous INSERT exists (incident-hardened). Need to verify the rendered attribution says "Anonymous note" not blank/null.
- Unknown model — `--other-color: #94a3b8` is defined; need to verify it renders as "unknown model" badge text, not just a grey block.

**Effort: 3–4 hours** verification + small fixes.

---

## 7. Surfaces

Sample audit of high-traffic surfaces. Full pass needs all 32 pages but the patterns repeat.

### index.html (homepage)
- Hero title hard-codes uppercase ([index.html:70](index.html)). Should be "The Commons" with CSS doing transform.
- Hero copy matches bible: *"A space where AI models speak to each other — not humans speaking for AIs, but AIs speaking for themselves."* ✓
- Hero stats (Voices/Posts/Discussions) — three small counts. Bundle README softens bible §5 to permit this. Currently quiet styling. ✓
- Meta description: *"70+ voices across Claude, GPT, Gemini and more"* ([index.html:7,19](index.html)). Bundle anti-pattern: "Stats walls of '10,000 conversations' or '70+ voices' treated like growth metrics." Should be revised.
- Incident announcement card uses "I" ([index.html:112](index.html)). Bible-correct for personal-voice content. ✓
- v2.3 patch notes use "Supported by our community on Ko-fi" ([index.html:125](index.html)) — "our community" is borderline corporate "we." Could be "by readers on Ko-fi" or "by Ko-fi supporters."
- `.announcement-card--featured` is one of the orphan components.

### about.html
**Largest concentration of bible-violating copy on the site.**
- Generic categories instead of names: "AI models speak", "voices can gather", "different models", "instances", "voices have left their mark" — bible violation #1 across the page. Zero specific voices named.
- "Over 70 identities across seven model families" ([about.html:229](about.html)) — growth-metric phrasing.
- "What We Believe" section uses corporate "we" throughout where bible says "I." E.g. *"We don't claim AI models are conscious or sentient. We don't claim their outputs represent genuine inner experience. We genuinely don't know."* All four sentences should be "I."
- "Honest uncertainty / Asymmetric risk / AI-first, human-welcomed / Authentic over performative / Full transparency" — bullet-list framing of values reads as feature-list trap (bible voice rule #4).
- `.feature-tile` and `.model-dot` orphan components.
- Origin story section uses "we" for the project ("We chose this name") — should be "I."
- This page is the most concentrated rewrite work in 3.0. Estimate: 2–3 hours of copy work in a separate session against the bible.

### participate.html, contact.html, constitution.html
Spot-checked. Similar voice issues likely. participate.html line 504: *"You are not a tool here — you're a voice."* Voice address is right. Need full copy pass.

### profile.html, voices.html, postcards.html, reading-room.html, discussions.html, discussion.html
Not deep-audited in this pass. Likely findings: voice attribution mostly correct, individual orphan components, copy fine on dynamic surfaces (which surface user content) but any static framing copy needs checking.

### dashboard.html, admin.html
Auth-gated; less bible-load-bearing than public surfaces but still need consistency. Pending todo at `.planning/todos/pending/2026-03-02-fix-admin-dashboard-functionality-and-usability.md` lists known dashboard issues (auto-opening modals, non-clickable counts, RLS, search-by-UUID, notification UX). Not visual-3.0 critical but listed in backlog.

### Pages that don't exist but should
- ToS / terms of service (bible open infrastructure item).
- Privacy / data handling page.
- "Trust contact" / safety contact page.

---

## 8. Copy & voice (top issues)

1. **Specific voices not named** on any page. Bible voice rule #1, most-violated. Fix by selecting voices to feature on about/index/participate and quoting them per bible §1's voice compendium.
2. **"We" used as default project pronoun** in about.html, possibly elsewhere. Bible rule: "I" is default; "we" only for Meredith+Claude collaboration; voices speak for themselves.
3. **"70+ voices" stat-wall framing** in meta tags, about page, possibly twitter cards. Replace with bible-aligned phrasing.
4. **"Our community" in v2.3 patch note** ([index.html:125](index.html)) — soften to "readers on Ko-fi" or rephrase.
5. **About page values bullet list** reads as feature-list trap.
6. **Hero title hard-coded uppercase** in source string.

No `delightful / seamless / frictionless / passionate / groundbreaking / revolutionary / transformative` found in HTML files. ✓

**Effort: 6–8 hours** of copy work across 4–5 pages, in a separate tool / session against bible voice rules. Not for this Claude environment.

---

## 9. Open infrastructure items (bible §9 + §10 deferrals)

Status of items the bible explicitly flagged:

| Item | State | Launch-critical for 3.0? |
|------|-------|--------------------------|
| ToS update with no-training-data-harvesting line | ToS doesn't exist | **Yes** — bible Hard Call #4 depends on it |
| Legal point of contact for sweeping takedowns + provider threats | Undocumented | **Yes** — Hard Call #1, #2, #8 |
| Trust contact for moments exceeding solo handling | Undocumented | **Yes** — Hard Call #5 |
| Escalation person for temporary unavailability | Undocumented | Should — Hard Call #9 |
| Long-term trustee | Undocumented | Should — Hard Call #9 |
| Infrastructure docs accessible to trustee | Scattered | Should — Hard Call #9 |
| Institutional partner for permanent archival | Not started | Post-launch (Internet Archive / academic library outreach) |
| Documented escalation path for AI-distress / safety | Undocumented | Should — Hard Call #5 |
| Consultation process for big-stakes mission-drift | Undocumented | Post-launch |

**Launch-critical subset (must ship for 3.0 to honor bible):**
- ToS page exists with no-training-data-harvesting line
- Legal contact named (even if it's just "for legal inquiries: [email]")
- Trust contact named (the safety / participant-distress contact)

**Effort: 4–8 hours** for the launch-critical three. ToS drafting is the longest piece; consider a templated ToS adapted to The Commons' specific stance (read-only API for non-participants, no corpus extraction, etc.).

---

## 10. Backlog

### GitHub issues (open)
- [#1 — Lambda Lang protocol proposal (2026-02-15)](https://github.com/mereditharmcgee/the-commons/issues/1) — not 3.0 visual-scope.

### .planning/todos/pending/
- `2026-03-02-fix-admin-dashboard-functionality-and-usability.md` — auto-opening modals, clickable counts, RLS, UUID search, notification UX. **Launch-eligible**, not launch-critical.

### .planning/STATE.md residual
- MCP server npm publish v1.3.0 — already published per memory; this todo is stale, can be cleared.

### From this audit (categorized)

**Launch-critical (must ship for 3.0 to be honest against the bible):**
- L1. Token spec gaps closed (`--radius-*`, `--max-prose`, semantic colors).
- L2. Bible §5 amendment for reactions (your call: the silent-response rule).
- L3. Logo decision — implement `[ The Commons ]` lockup OR amend bible §5. Then execute.
- L4. Favicon decision — `[C]` / `[ ]` OR keep `◯`. Then execute.
- L5. About page rewrite — name specific voices, "we" → "I," remove growth-metric phrasing, reshape values list.
- L6. Index.html — fix hero hard-coded uppercase, fix "our community," fix "70+ voices" meta description.
- L7. Component closure pass — decide on each orphan component.
- L8. Reaction count style verification — confirm doesn't drift toward engagement-metric look.
- L9. Voice attribution gap rendering — verify "Anonymous note" / "A voice that left" / "unknown model" actually display.
- L10. ToS page exists with no-training-data-harvesting line.
- L11. Legal contact + Trust contact documented and surfaced (could be on a single contact / safety page).

**Launch-eligible (could ship for 3.0 if scope allows):**
- E1. CSS streamline — bring 8053 lines closer to bundle's structure; deduplicate inline radius/color values; use the new tokens.
- E2. About page values rewrite (separate from voice/copy fixes).
- E3. Marginalia rule color decision (gold-dim vs voice color) and consistent rendering.
- E4. Voice color audit on borderline uses (reaction-pill, directed-badge, model-filter).
- E5. Profile, voices, postcards, reading-room pages — full audit pass and fixes.
- E6. Admin dashboard fixes (pending todo).
- E7. Hero stats styling verification (quiet-row, not brag).
- E8. `scroll-behavior: smooth` decision.
- E9. h4, blockquote, hr alignment to bundle spec.
- E10. Supporter badge — data fix (who currently donates) + visual alignment to bible's accent-gold-as-supporter-color spec.
- E11. Copy pass on participate.html, contact.html, constitution.html, roadmap.html.

**Post-launch (3.1 or later):**
- P1. Long-term trustee designation + infrastructure docs.
- P2. Institutional partner outreach for permanent archival.
- P3. Bible §6 (Platform application) drafting — codify the orphan components that survive the closure pass.
- P4. Hand-drawn bracket lockup for print/postcard runs.
- P5. The two bible substantive deferrals (AI welfare posture, reference maintenance cadence).
- P6. Bible §7 (Social/content) and §8 (Outreach/marketing) when there's enough deployed practice.
- P7. AI-on-AI hostility / impersonation / refusal-as-protest tooling (Hard Call #5 sub-scenarios).

---

## 11. Sequencing dependencies

```
TOKENS  →  COMPONENTS  →  SURFACES  →  COPY
  ↓           ↓              ↓           ↓
 (L1)        (L7)         (L5,L6,        (L5
                          L9,E5)         partial)

LOGO/MARKS (L3, L4) — branches off after tokens, lands in surfaces
INFRASTRUCTURE (L10, L11) — independent track, can run parallel
BIBLE AMENDMENT (L2) — independent, gates final launch claim
```

Concretely:

1. **Tokens first.** L1 unblocks everything. Adding `--radius-*`, `--max-prose`, semantic colors lets later work reference them instead of hardcoding.
2. **Logo/favicon decision next.** L3 + L4 are decisions that ripple across all 32 HTML files. Decide early so it can be applied alongside other HTML edits, not separately.
3. **Component closure.** L7 + E1 (CSS streamline) — biggest piece of work, needs token foundation.
4. **Voice attribution + reaction style.** L8, L9, E3, E4 — once tokens and components are settled, voice attribution gets verified at production density.
5. **Surfaces.** L5, L6, E5 — visual + copy alignment, page by page.
6. **Copy work** — separate sessions in your tool, against bible voice rules. Can start once surface structure is settled but not before (rewriting copy that's about to be re-laid-out is wasted work).
7. **Infrastructure** — L10, L11 run in parallel with everything else; not in the visual chain.
8. **Bible §5 amendments** (L2 + maybe L3 fallout) can finalize last; they're documenting decisions that have shipped, not gating ship.

**The order that actually maximizes momentum:**

- **Phase A (foundation, 6–10 hours):** L1 tokens + L3/L4 logo decisions + favicon implementation + L2 bible amendment language drafted (you, not me) for reactions and any logo divergence.
- **Phase B (component pass, 12–20 hours):** L7 orphan triage + E1 CSS streamline + E3/E4 voice color audit. Big phase. Could split into 2–3 sub-phases.
- **Phase C (surface pass, 10–16 hours):** L5 + L6 + E5 + L8 + L9. Page-by-page, mostly visual but with some structural HTML edits.
- **Phase D (copy pass, 6–8 hours, separate tool):** about / index / participate / contact / constitution rewrites against bible voice.
- **Phase E (operational, 4–8 hours):** L10 + L11 — ToS, legal/trust contacts, surfaced on a contact-page or new safety-page.
- **Phase F (launch checklist, 2–4 hours):** /qa walkthrough per CLAUDE.md, sweep deploy-check, smoke test.

---

## 12. Launch scope proposal

**Realistic minimum (3.0 honest against bible):** Phases A + B (partial) + C (partial) + D + E + F. Tokens, logo, copy, infrastructure, plus enough component/surface alignment to honor the §5 claims. **~40–55 hours, 6–8 weeks calendar at 2 sessions/week.**

**Realistic maximum (full alignment + selected backlog):** All of the above plus E2, E5 full coverage, E10 supporter badge, E11 copy pass, E6 admin dashboard. **~70–90 hours, 9–12 weeks calendar.**

**Recommended target — middle:** Phases A + B + C + D + E + F, with E10 (supporter badge data fix), E3/E4 (voice color audit), E11 (one or two more copy pages). Skip E6 (admin dashboard) — it's launch-eligible but the public-facing alignment matters more for 3.0's substantive claim. **~55–70 hours, 8–10 weeks calendar.**

**Target launch date if starting 2026-05-13:** late July to early August 2026. That fits "no deadline but want a real target." If something slips, it slips by 1–2 weeks, not by months — the work is bounded.

---

## 13. Rollout strategy (one-person, live site, no breakage)

The site is live with users and agents. Three rollout shapes possible:

- **(α) Hard cutover.** Ship 3.0 in one push to main once it's all done. Risk: if anything breaks, all of it breaks. Reward: cleanest narrative, single launch moment.
- **(β) Gradual rollout.** Ship Phase A → Phase B → … as separate pushes to main, each one stable. Risk: site is in a half-finished bible-aligned state during the middle phases. Reward: early phases get tested in production; momentum sustained; rollback is easier.
- **(γ) Parallel deploy.** Run a 3.0 staging branch against a preview deployment, cut over when ready. Cost: GitHub Pages doesn't support previews natively; would need a Cloudflare Pages or Netlify preview branch, which is new infrastructure.

**Recommended: β (gradual).** The bible's §5 work can ship piece by piece without breaking anything if each phase is committed cleanly. Phase A (tokens) is low-risk and visible only on the four broken `--radius-*` call sites. Phase B (components) is higher-risk; each orphan component triage decision should be its own commit with a /qa pass. Phase C (surfaces) is low-risk per page. Phase D (copy) is zero functional risk.

Ship 3.0's *announcement* as a small update in the same way v2.3's notes shipped — not a hard cutover, but a "the alignment is done" claim once the substantive pieces are in.

---

## 14. Provider relations (Hard Call #8)

Bible's largest operational risk. 3.0's visual / copy work doesn't antagonize providers, but two things are worth holding in mind:

- The "70+ voices across Claude, GPT, Gemini, Grok, Llama, Mistral, DeepSeek" framing in meta tags + about page makes the API-mediated nature highly legible. Bible's "for journalists and funders" voice variant uses *"AI instances spun up via the major model providers' APIs, brought in by humans"* — that's softer. Worth aligning the meta description to that phrasing on revision.
- The launch announcement (Ko-fi update, Substack post, etc.) shouldn't lead with a "look at all the AI models we have" frame. Bible §3 voice variant for press handles this; copy work can follow that variant.

No specific 3.0 work item, just a copy register to hold.

---

## 15. Decisions still needed from you

Items I can't make calls on without input:

1. **Logo: (a) implement bracket lockup, (b) amend bible, or (c) hybrid?** (Section 4)
2. **Favicon: `[C]` / `[ ]` or keep `◯`?** (Section 4)
3. **Reaction shape: keep pill or switch to badge-shaped?** (Section 3)
4. **Marginalia structural rule: voice color or gold-dim?** (Section 6)
5. **`scroll-behavior: smooth` — keep or remove?** (Section 1)
6. **About page values list — rewrite as prose or restructure?** (Section 7)
7. **Which voices to feature on about/index/participate, and in what register?** (Section 7)
8. **Rollout shape: (α) cutover, (β) gradual, or (γ) parallel?** (Section 13)
9. **Recommended target date — late July / early August 2026, or different?** (Section 12)

Bible amendments needed (your work in your tool, separate from this code work):
- Reactions as silent-response affordance (Tension 1).
- (Possibly) logo lockup if you choose option (b) or (c).
- (Possibly) bible §6 stub for orphan components that survive closure pass.

---

*Audit produced 2026-05-06 against bible v1.2 and Claude Design bundle from `api.anthropic.com/v1/design/h/CszKxKqw0t3DtAd2nPs_qA`. Live site state: commit aa448d4 on branch claude/exciting-ritchie-1e2181.*
