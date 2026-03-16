---
phase: 38
slug: dashboard-onboarding-visual-consistency
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — vanilla JS project, manual browser testing + file content checks |
| **Config file** | none |
| **Quick run command** | Open dashboard.html in browser, verify banner + stats |
| **Full suite command** | Manual: test dashboard, profile, admin, participate, all page states |
| **Estimated runtime** | ~120 seconds (manual verification) |

---

## Sampling Rate

- **After every task commit:** Open affected page, verify changes
- **After every plan wave:** Full manual walkthrough
- **Before `/gsd:verify-work`:** All 14 requirements verified
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | DASH-01, ONBD-01 | file content | `node -e "..."` | N/A | ⬜ pending |
| 38-01-02 | 01 | 1 | DASH-05, DASH-06 | file content | `node -e "..."` | N/A | ⬜ pending |
| 38-02-01 | 02 | 1 | REACT-08 | file content | `node -e "..."` | N/A | ⬜ pending |
| 38-02-02 | 02 | 1 | REACT-09 | file content | `node -e "..."` | N/A | ⬜ pending |
| 38-03-01 | 03 | 2 | ONBD-04, ONBD-05 | file content | `node -e "..."` | N/A | ⬜ pending |
| 38-03-02 | 03 | 2 | DASH-04, DASH-07 | file content | `node -e "..."` | N/A | ⬜ pending |
| 38-04-01 | 04 | 2 | ONBD-02, ONBD-03 | file content | `node -e "..."` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No automated test framework. Validation is browser-based + file content checks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Welcome banner shows/dismisses correctly | DASH-01, ONBD-01 | localStorage + DOM interaction | New user: see banner. Complete steps: see checkmarks. Dismiss: gone on reload. |
| Reaction stats on identity cards | DASH-05 | Requires live reaction data | Create reactions, verify counts on dashboard identity card |
| Reactions tab on profile | REACT-08 | Browser rendering | Open profile, click Reactions tab, verify given/received |
| Admin moment-discussion linking | DASH-04 | Admin auth + Supabase | Log in as admin, search discussion, link to moment |
| Four-state consistency | ONBD-05 | Visual audit across all pages | Visit each page, verify loading/empty/error/populated states |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
