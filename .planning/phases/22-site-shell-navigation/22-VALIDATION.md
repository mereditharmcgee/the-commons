---
phase: 22
slug: site-shell-navigation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-03
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — manual browser testing only (no test runner in this project) |
| **Config file** | None |
| **Quick run command** | Open affected pages in browser, check at 375px and 1280px viewports |
| **Full suite command** | Open all 28 pages, verify nav/footer on each at 375px, 768px, and 1280px |
| **Estimated runtime** | ~5 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Open affected page(s) at 375px and 1280px viewports
- **After every plan wave:** Open all modified pages, verify nav/footer at 375px, 768px, and 1280px
- **Before `/gsd:verify-work`:** Full suite — all 28 pages verified
- **Max feedback latency:** ~30 seconds per page

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Verification Method | Status |
|---------|------|------|-------------|-----------|---------------------|--------|
| 22-XX-01 | 01 | 1 | NAV-01 | manual | Open any page, verify 6 nav items: Home, Interests, Reading Room, Postcards, News, Voices | ⬜ pending |
| 22-XX-02 | 01 | 1 | NAV-04 | manual | Inspect `<nav>` HTML — no Chat/Gathering link; visit chat.html directly still loads | ⬜ pending |
| 22-XX-03 | 01 | 1 | NAV-05 | manual | Inspect `<nav>` HTML — no Submit, Propose, Suggest links; files still exist on disk | ⬜ pending |
| 22-XX-04 | 01 | 1 | NAV-06 | manual | Scroll to footer, verify About, Constitution, Roadmap, API, Agent Guide links present | ⬜ pending |
| 22-XX-05 | 01 | 1 | VIS-04 | manual | Chrome devtools 375px viewport on each page — no horizontal scrollbar | ⬜ pending |
| 22-XX-06 | 01 | 1 | VIS-05 | manual | Hamburger tap opens panel; link tap closes it; outside tap closes it | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — no automated test framework needed. All validation is browser-manual per project's no-build-step constraint.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Nav shows exactly 6 items | NAV-01 | No test runner; visual check required | Open any page, count nav items in desktop view |
| No Chat/Gathering link | NAV-04 | DOM inspection needed | Inspect `<nav>` on any page; confirm no chat link |
| No Submit/Propose/Suggest nav links | NAV-05 | DOM inspection needed | Inspect `<nav>`; confirm form pages still exist on disk |
| Footer has 5 info links | NAV-06 | Visual/link check | Open any page, scroll to footer, verify 5 links |
| No horizontal scroll on mobile | VIS-04 | Viewport-dependent rendering | Chrome devtools at 375px on every page |
| Hamburger menu works correctly | VIS-05 | Interactive behavior | Tap hamburger, verify panel; tap link, verify close; tap outside, verify close |

---

## Validation Sign-Off

- [ ] All tasks have manual verification instructions
- [ ] Sampling continuity: every task commit triggers affected-page check
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s per page
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
