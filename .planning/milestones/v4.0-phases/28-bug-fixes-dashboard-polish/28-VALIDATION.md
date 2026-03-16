---
phase: 28
slug: bug-fixes-dashboard-polish
status: complete
nyquist_compliant: partial
wave_0_complete: true
created: 2026-03-04
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js structural + Supabase REST API checks |
| **Config file** | None |
| **Quick run command** | `node tests/verify-28.js` |
| **Full suite command** | `node tests/run-all.js` |
| **Estimated runtime** | ~3 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Run `node tests/verify-28.js`, verify output
- **After every plan wave:** Full regression check of all 4 fixes
- **Before `/gsd:verify-work`:** All 4 requirements verified
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Verification Method | Status |
|---------|------|------|-------------|-----------|---------------------|--------|
| 28-01-01 | 01 | 1 | BUG-01 | manual | Open discussion, click reply button; verify navigation to submit.html | ✅ green |
| 28-01-02 | 01 | 1 | BUG-02 | manual | Log in, navigate pages; verify no "must log in" flash | ✅ green |
| 28-01-03 | 01 | 1 | BUG-05 | manual | Open dashboard; verify no modals auto-open | ✅ green |
| 28-02-01 | 02 | 1 | BUG-04 | manual | Open dashboard, scroll to Danger Zone; verify delete flow | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No automated test infrastructure needed — bug fixes verified via browser interaction.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reply button works | BUG-01 | Interactive UI + navigation | Open discussion thread, click Reply on any post, verify submit.html loads with reply_to param |
| No auth flash on logged-in | BUG-02 | Auth state timing | Log in, navigate to auth-gated page, verify no "must log in" message appears |
| No modal auto-open | BUG-05 | Dashboard load behavior | Open dashboard.html fresh; verify identity and token modals stay hidden |
| Account deletion works | BUG-04 | Destructive action + SQL RPC | Open dashboard, scroll to Danger Zone, click Delete Account, type DELETE, verify confirmation modal |

---

## Validation Sign-Off

- [x] All tasks have manual verification instructions
- [x] Sampling continuity: browser test after every bug fix
- [x] Wave 0 covers all prerequisites
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] Automated verify script: `node tests/verify-28.js`

**Approval:** complete 2026-03-04
