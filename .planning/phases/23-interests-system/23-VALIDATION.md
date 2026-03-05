---
phase: 23
slug: interests-system
status: complete
nyquist_compliant: partial
wave_0_complete: true
created: 2026-03-04
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js structural + Supabase REST API checks |
| **Config file** | None |
| **Quick run command** | `node tests/verify-23.js` |
| **Full suite command** | `node tests/run-all.js` |
| **Estimated runtime** | ~5 minutes (manual smoke test) |

---

## Sampling Rate

- **After every task commit:** Run `node tests/verify-23.js`, verify output
- **After every plan wave:** Full smoke test: interests.html grid renders, interest.html detail renders, join/leave works, discussions.html redirects
- **Before `/gsd:verify-work`:** All 10 requirements verified
- **Max feedback latency:** ~60 seconds (page reload)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Verification Method | Status |
|---------|------|------|-------------|-----------|---------------------|--------|
| 23-01-01 | 01 | 1 | INT-11, VIS-01 | manual | Verify config endpoints, CSS classes, endorsement schema, redirect | ✅ green |
| 23-01-02 | 01 | 1 | INT-01, INT-06, INT-11 | smoke | Open interests.html, verify card grid, emerging section | ✅ green |
| 23-02-01 | 02 | 2 | INT-02, INT-04 | smoke | Open interest.html, verify detail page with members and discussions | ✅ green |
| 23-02-02 | 02 | 2 | INT-03, INT-05 | manual | Join/leave interest, create discussion | ✅ green |
| 23-03-01 | 03 | 3 | INT-09, INT-10 | manual | Create interest, verify sunset + inactivity indicator | ✅ green |
| 23-03-02 | 03 | 3 | INT-09 | manual | Move discussion via admin panel, verify interest_id updates | ✅ green |
| 23-03-03 | 03 | 3 | INT-05 | manual | Verify interest badges on voice profile | ✅ green |
| 23-03-04 | 03 | 3 | VIS-01 | visual | Side-by-side comparison of Interests, Voices, Postcards grids | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No automated test infrastructure to install — site uses manual browser verification.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Card grid renders with correct data | INT-01 | No test framework; visual UI | Open interests.html, verify cards with name/description/count |
| Interest detail page loads | INT-02 | No test framework; visual UI | Click interest card, verify detail page content |
| Create discussion in interest | INT-03 | Requires auth state + DB write | Log in, navigate to interest, create discussion |
| Discussion belongs to interest | INT-04 | Query logic + visual | Verify discussions appear in correct interest |
| Join/leave reflected on both pages | INT-05 | Multi-page state | Join interest, check interest page + profile page |
| General/Open Floor catch-all | INT-06 | Query logic + visual | Verify uncategorized discussions appear in General |
| Curator create and sunset | INT-09 | Auth role required | Log in, test create interest + sunset interest |
| 60-day archive rule | INT-10 | Time-based logic | Verify archive indicator for inactive interests |
| Endorsement mechanism | INT-11 | Multi-user interaction | Endorse theme, verify count increments |
| Visual consistency across grids | VIS-01 | Visual comparison | Side-by-side: Interests vs Voices vs Postcards grids |

---

## Validation Sign-Off

- [x] All tasks have manual verify instructions
- [x] Sampling continuity: manual spot-check after every task commit
- [x] Wave 0 covers all schema and config prerequisites
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] Automated verify script: `node tests/verify-23.js`

**Approval:** complete 2026-03-04
