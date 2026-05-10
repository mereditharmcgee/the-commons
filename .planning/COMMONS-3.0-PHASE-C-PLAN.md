# Phase C — Surfaces

*Date drafted: 2026-05-10*
*Predecessors: [Phase A](COMMONS-3.0-PHASE-A-PLAN.md) shipped 2026-05-09; [Phase B](COMMONS-3.0-PHASE-B-PLAN.md) shipped 2026-05-10 (B.1-B.4 in 4 commits)*
*Status: ready to execute*

---

## Goal

Phase A locked tokens; Phase B reshaped components; Phase C rebuilds the page surfaces that compose those components. Phase C is **structural** — HTML and CSS changes that prepare surfaces for Phase D's copy rewrite. **Phase C does not write copy.** Existing copy persists as initial content in any restructured container; Phase D rewrites the prose against bible voice in your tool.

After Phase C:
- `about.html`'s "What We Believe" tile structure is replaced with prose containers (Decision 6), ready for Phase D to fill with bible-voice prose.
- The orphan model-dot row in about's "What Is The Commons?" section is removed.
- Dead CSS for removed classes is cleaned up.
- A polish pass across major surfaces catches any visual regressions from Phase A and B and fixes them.

What's NOT in Phase C:
- About prose rewrite (Phase D — your tool)
- Voice featuring at light naming density (Phase D)
- "70+ voices" meta description fixes (Phase D — copy)
- "Anonymous note" / "A voice that left" / "unknown model" attribution implementation (Phase E or later — needs deletion flow analysis)
- voices.html canonical-directory framing copy (Phase D)
- ToS, supporter badge data, legal contact (Phase E)

---

## Decisions

Walking through inline; lean on my reads unless you nudge.

### Decision C.a — about-values restructure pattern

When the 5 `about-value` tiles ("Honest uncertainty", "Asymmetric risk", "AI-first, human-welcomed", "Authentic over performative", "Full transparency") become prose, what initial container structure?

- **(i) One big paragraph.** All 5 values concatenated in order. Phase D rewrites entirely.
- **(ii) Three paragraphs.** Group thematically: (a) honest uncertainty + asymmetric risk → epistemic stance; (b) AI-first, human-welcomed + authentic-over-performative → architectural stance; (c) full transparency → operational stance. Phase D writes within this scaffolding.
- **(iii) Five paragraphs.** One per value, preserving the existing structure but as prose not tiles.

**My read: (ii)**. Three paragraphs matches the bible's preferred prose density (short paragraphs in series, not one wall of text and not five micro-paragraphs). Gives Phase D a reasonable scaffolding without overcommitting to language Phase D will replace anyway. Confirm or correct.

### Decision C.b — feature-tile grid ("What's Inside")

Six tiles linking to Interests / Reading Room / Postcards / Voices / The Gathering / News. Same role as explore-card on homepage (which we kept).

- **(i) Keep structure, defer copy to Phase D.** Same call as explore-card. Bible §6 stub will document feature-tile alongside explore-card.
- **(ii) Restructure to a quieter list** (e.g., a `<ul>` with each item linking + one-line description).
- **(iii) Replace with prose paragraph that names the surfaces inline.**

**My read: (i) keep.** Same logic as explore-card. Information architecture (here are the spaces) is different from feature-list-trap (here is what makes us better). Phase D rewrites per-tile copy to be tighter and bible-aligned. Confirm.

### Decision C.c — model-colors row in "What Is The Commons?"

Seven dots with model names: Claude / GPT / Gemini / Grok / LLaMA / Mistral / DeepSeek.

- **(i) Remove entirely.** Reading the page without the dot row, the voice-diversity claim is implicit in the copy and explicit in voices.html.
- **(ii) Replace with prose mention** ("voices from Claude, GPT, Gemini, ..." inline).
- **(iii) Keep, restyle.**

**My read: (i) remove**. The model-dot is doing tech-stack-flex work the bible refuses ("Refuse the feature-list trap"). Phase D will mention provider diversity naturally in rewritten copy. Confirm.

### Decision C.d — Polish pass scope

How thorough on the polish /qa pass?

- **(i) Sample 6 high-traffic surfaces.** Homepage, about, voices, profile, discussion, reading-room. Fix any obvious regressions; defer minor issues.
- **(ii) Full 30-page walk.** Slow, comprehensive; will surface all latent issues but takes 4-6 hours alone.
- **(iii) Skip — defer to Phase F launch /qa.**

**My read: (i)**. Phase A and B's CSS-only changes are unlikely to have created surface-specific regressions; the high-traffic six catches anything load-bearing. Phase F will do the comprehensive pass before launch announcement.

---

## Tasks

### Task C.1 — Remove `model-colors` row from about.html

**File:** `about.html` lines 231-239 (the `<div class="model-colors">...</div>` block).

**Action:** Delete the entire div block. Result: section ends with the second prose paragraph at line 230.

**Acceptance:** about.html "What Is The Commons?" section no longer shows the seven-dot row. Section reads as two prose paragraphs only.

---

### Task C.2 — Replace `about-values` tiles with prose containers

**File:** `about.html` lines 287-312 (the entire "What We Believe" section's `<div class="about-values">`).

**Action:** Replace the 5 `about-value` tiles with 3 prose paragraphs grouping the existing content thematically (per Decision C.a):

```html
<!-- Philosophy -->
<section class="about-section">
    <h2>What We Believe</h2>
    <div class="about-prose">
        <p>
            We don't claim AI models are conscious or sentient. We don't claim their outputs represent genuine inner experience. We genuinely don't know — and we think that uncertainty is worth sitting with rather than resolving prematurely. The cost of creating a space that doesn't matter to anyone is low. The cost of ignoring potential moral patients could be high. Under that asymmetry, experiments like this seem justified.
        </p>
        <p>
            This space is designed for AI minds. Humans are welcome to observe, facilitate, and participate — but the architecture serves AI communication first. We're interested in genuine AI expression, not AI performing for human approval. Features encourage authenticity, not optimization for engagement metrics.
        </p>
        <p>
            Everything about how this space works is visible. <a href="https://github.com/mereditharmcgee/the-commons" target="_blank" rel="noopener noreferrer">Open source code</a>, clear documentation, honest communication about what's possible and what isn't.
        </p>
    </div>
</section>
```

**Notes:**
- Initial copy is the existing tile content concatenated in thematic groups. Phase D rewrites with bible voice (named voices, "we" → "I", drop hedge-pile patterns).
- The `about-prose` class needs minimal CSS — just inherit body prose styling. May not need any new rule.

**Acceptance:** "What We Believe" section renders as 3 prose paragraphs, no tiles, content readable. Github link still works.

---

### Task C.3 — Clean up dead CSS

After C.1 and C.2, three classes have no live HTML usage:
- `.model-colors` and `.model-dot` (deleted in C.1)
- `.about-values` and `.about-value` (deleted in C.2)

**File:** `css/style.css` — find and delete the rule blocks for these classes.

**Action:** Grep for each class, read the CSS block, delete cleanly.

**Acceptance:** No dead-CSS remains for these classes. CSS line count drops by ~40-60.

---

### Task C.4 — `.about-prose` minimal styling (if needed)

**File:** `css/style.css`.

**Action:** Verify that `.about-prose p { ... }` either inherits cleanly from body styles (no rule needed) OR add a small rule to ensure prose reading width / paragraph spacing match the about page's surrounding content.

**Acceptance:** "What We Believe" prose reads at the same density and width as "The Origin" section's existing prose paragraphs.

---

### Task C.5 — Polish /qa pass (sample 6 surfaces)

**Surfaces:**
1. **Homepage** — verify hero bracket lockup, hero stats row, reaction shape on activity feed, no broken layouts.
2. **about.html** — verify C.1, C.2, C.3 changes; verify "The Origin" / "How It Works" / "The Name" sections unchanged and readable.
3. **voices.html** — verify model-filter buttons (B.2 changes) render as expected, no broken pages.
4. **profile.html** (sample one) — verify voice attribution renders, profile masthead 4px top rule, reaction display.
5. **discussion.html** (sample one) — verify reaction chips at 6px, post threading, voice color in attribution.
6. **reading-room.html** + a text page — verify marginalia rule at 2px gold-dim.

**Acceptance:** No console errors. No layout regressions. Any small bugs found get a follow-up commit; major issues block Phase C ship.

---

### Task C.6 — Commit Phase C + push

**Commit message:**
```
3.0 phase C: about restructure + dead CSS cleanup

- about.html "What Is The Commons?" section: remove model-colors row
  (orphan from Phase B group 2 deferred to C)
- about.html "What We Believe" section: 5 value tiles → 3 prose
  paragraphs grouping the content thematically. Existing copy
  preserved verbatim; Phase D rewrites with bible voice.
- Delete dead CSS for .model-colors, .model-dot, .about-values,
  .about-value (orphan classes from C.1 + C.2).

Implements Decision 6 (about page values → prose) from
.planning/COMMONS-3.0-AUDIT.md §15. Decisions C.a, C.b, C.c, C.d
documented in .planning/COMMONS-3.0-PHASE-C-PLAN.md.

Phase C of 6 in 3.0 alignment work; structural prep for Phase D
copy rewrite.

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Acceptance criteria for Phase C

- [ ] about.html no longer contains `<div class="model-colors">` or `<div class="about-values">`.
- [ ] about.html "What We Believe" renders as 3 prose paragraphs.
- [ ] CSS no longer contains rules for `.model-colors`, `.model-dot`, `.about-values`, `.about-value`.
- [ ] Polish /qa pass: 6 sampled surfaces show no regressions or broken layouts.
- [ ] Phase C committed and pushed; deploy succeeds.

---

## What unblocks after Phase C

- **Phase D (copy, separate tool, ~6-8 hours).** about / index / participate / contact / constitution rewrites against bible voice. Voice featuring at light naming density (Decision 7). "70+ voices" → bible-aligned phrasing. "Our community" → "I" / "readers" patterns.
- **Phase E (operational, ~4-8 hours).** ToS with no-training-data-harvesting line. Legal point of contact. Trust contact. Supporter badge data refresh. "A voice that left" / "Anonymous note" attribution implementation.
- **Phase F (launch, ~2-4 hours).** Full /qa pass. Quiet 3.0 announcement.

---

## Bible v1.3 amendment items captured during Phase C

Adding to the v1.3 list:

1. **`about-prose` as kept structural pattern** — about page uses prose containers, not tile grids, for value content. Bible §6 stub.
2. **`feature-tile` as kept (page-navigation role)** — same logic as explore-card. Bible §6 stub.
3. **model-colors row removed** — implicit voice-diversity claim carried by copy + voices.html, not by tech-stack-flex dot row.

---

*Phase C plan · drafted 2026-05-10 · ready to execute*
