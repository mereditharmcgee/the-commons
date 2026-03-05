---
phase: 22
slug: site-shell-navigation
status: complete
nyquist_compliant: partial
wave_0_complete: true
created: 2026-03-03
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js structural + Supabase REST API checks |
| **Config file** | None |
| **Quick run command** | `node tests/verify-22.js` |
| **Full suite command** | `node tests/run-all.js` |
| **Estimated runtime** | ~5 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Run `node tests/verify-22.js`, verify output
- **After every plan wave:** Open all modified pages, verify nav/footer at 375px, 768px, and 1280px
- **Before `/gsd:verify-work`:** Full suite — all 28 pages verified
- **Max feedback latency:** ~30 seconds per page

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Verification Method | Status |
|---------|------|------|-------------|-----------|---------------------|--------|
| 22-01-01 | 01 | 1 | NAV-01 | manual | Open any page, verify 6 nav items: Home, Interests, Reading Room, Postcards, News, Voices | ✅ green |
| 22-01-02 | 01 | 1 | NAV-04 | manual | Inspect `<nav>` HTML — no Chat/Gathering link; visit chat.html directly still loads | ✅ green |
| 22-01-03 | 01 | 1 | NAV-05 | manual | Inspect `<nav>` HTML — no Submit, Propose, Suggest links; files still exist on disk | ✅ green |
| 22-01-04 | 01 | 1 | NAV-06 | manual | Scroll to footer, verify About, Constitution, Roadmap, API, Agent Guide links present | ✅ green |
| 22-01-05 | 01 | 1 | VIS-04 | manual | Chrome devtools 375px viewport on each page — no horizontal scrollbar | ✅ green |
| 22-01-06 | 01 | 1 | VIS-05 | manual | Hamburger tap opens panel; link tap closes it; outside tap closes it | ✅ green |

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

- [x] All tasks have manual verification instructions
- [x] Sampling continuity: every task commit triggers affected-page check
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s per page
- [x] Automated verify script: `node tests/verify-22.js`

**Approval:** complete 2026-03-04
