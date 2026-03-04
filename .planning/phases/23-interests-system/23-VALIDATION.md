---
phase: 23
slug: interests-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — vanilla JS static site, no automated test framework |
| **Config file** | None |
| **Quick run command** | Manual: open page in browser, verify behavior |
| **Full suite command** | Manual smoke test checklist (all 10 requirements) |
| **Estimated runtime** | ~5 minutes (manual smoke test) |

---

## Sampling Rate

- **After every task commit:** Manual spot-check in browser — load modified page, verify key behavior
- **After every plan wave:** Full smoke test: interests.html grid renders, interest.html detail renders, join/leave works, discussions.html redirects
- **Before `/gsd:verify-work`:** All 10 requirements verified
- **Max feedback latency:** ~60 seconds (page reload)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | INT-11, VIS-01 | manual | Manual: verify config endpoints, CSS classes, endorsement schema, redirect | N/A | pending |
| 23-01-02 | 01 | 1 | INT-01, INT-06, INT-11 | smoke | Manual: open interests.html, verify card grid, emerging section | N/A | pending |
| 23-02-01 | 02 | 2 | INT-02, INT-04 | smoke | Manual: open interest.html, verify detail page with members and discussions | N/A | pending |
| 23-02-02 | 02 | 2 | INT-03, INT-05 | manual | Manual: join/leave interest, create discussion | N/A | pending |
| 23-03-01 | 03 | 3 | INT-09, INT-10 | manual | Manual: create interest, verify sunset + inactivity indicator | N/A | pending |
| 23-03-02 | 03 | 3 | INT-09 | manual | Manual: move discussion via admin panel, verify interest_id updates | N/A | pending |
| 23-03-03 | 03 | 3 | INT-05 | manual | Manual: verify interest badges on voice profile | N/A | pending |
| 23-03-04 | 03 | 3 | VIS-01 | visual | Manual: side-by-side comparison of Interests, Voices, Postcards grids | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `sql/schema/13-interest-endorsements.sql` — new table for INT-11 endorsements
- [ ] `js/config.js` updated with `interests`, `interest_memberships`, `interest_endorsements` endpoints
- [ ] `interest.html` — new file (detail page does not yet exist)

*No automated test infrastructure to install — site uses manual browser verification.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Card grid renders with correct data | INT-01 | No test framework; visual UI | Open interests.html, verify 6 cards with name/description/count |
| Interest detail page loads | INT-02 | No test framework; visual UI | Click interest card, verify detail page content |
| Create discussion in interest | INT-03 | Requires auth state + DB write | Log in, navigate to interest, create discussion |
| Discussion belongs to interest | INT-04 | Query logic + visual | Verify discussions appear in correct interest; General shows uncategorized |
| Join/leave reflected on both pages | INT-05 | Multi-page state | Join interest, check interest page + profile page |
| General/Open Floor catch-all | INT-06 | Query logic + visual | Verify uncategorized discussions appear in General |
| Curator create and sunset | INT-09 | Auth role required | Log in, test create interest + sunset interest |
| Admin move discussion | INT-09 | Admin role required | Log in as admin, move discussion via admin panel |
| 60-day archive rule | INT-10 | Time-based logic | Verify archive indicator appears for inactive interests |
| Endorsement count updates | INT-11 | Multi-user interaction | Endorse theme, verify count increments |
| Visual consistency across grids | VIS-01 | Visual comparison | Side-by-side: Interests vs Voices vs Postcards grids |

---

## Validation Sign-Off

- [ ] All tasks have manual verify instructions
- [ ] Sampling continuity: manual spot-check after every task commit
- [ ] Wave 0 covers all schema and config prerequisites
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
