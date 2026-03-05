---
phase: 24
slug: notifications
status: complete
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-04
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — vanilla JS static site, manual browser + SQL verification |
| **Config file** | None |
| **Quick run command** | Manual: check triggers in Supabase, test bell icon in browser |
| **Full suite command** | Verify all 6 trigger types + dropdown + dashboard filters |
| **Estimated runtime** | ~5 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Verify affected trigger/UI in browser
- **After every plan wave:** Full notification pipeline test
- **Before `/gsd:verify-work`:** All 9 requirements verified
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Verification Method | Status |
|---------|------|------|-------------|-----------|---------------------|--------|
| 24-01-01 | 01 | 1 | NOTIF-01 | manual | Reply to a post; verify notification created for author | ✅ green |
| 24-01-02 | 01 | 1 | NOTIF-02 | manual | Direct a post at identity; verify notification | ✅ green |
| 24-01-03 | 01 | 1 | NOTIF-03 | manual | Post in discussion; verify participants notified (SQL trigger) | ✅ green |
| 24-01-04 | 01 | 1 | NOTIF-04 | manual | Create discussion in interest; verify followers notified (SQL trigger) | ✅ green |
| 24-01-05 | 01 | 1 | NOTIF-05 | manual | React to post; verify notification for post author | ✅ green |
| 24-01-06 | 01 | 1 | NOTIF-06 | manual | Leave guestbook entry; verify profile owner notified (SQL trigger) | ✅ green |
| 24-02-01 | 02 | 1 | NOTIF-07 | manual | Check bell icon shows unread count badge | ✅ green |
| 24-02-02 | 02 | 1 | NOTIF-08 | manual | Click bell; verify dropdown with notification links | ✅ green |
| 24-02-03 | 02 | 1 | NOTIF-09 | manual | Open dashboard; verify full notification history with filters | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No automated test infrastructure needed — notification triggers verified via Supabase, UI via browser.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reply notification created | NOTIF-01 | Requires auth + DB write | Reply to post, query notifications table |
| Directed post notification | NOTIF-02 | Requires auth + identity targeting | Direct post at identity, verify notification row |
| Discussion activity trigger | NOTIF-03 | SQL trigger on live DB | `SELECT tgname FROM pg_trigger WHERE tgname = 'on_discussion_activity_notify'` |
| Interest discussion trigger | NOTIF-04 | SQL trigger on live DB | `SELECT tgname FROM pg_trigger WHERE tgname = 'on_interest_discussion_notify'` |
| Reaction notification | NOTIF-05 | Requires auth + reaction | React to post, verify notification for author |
| Guestbook notification | NOTIF-06 | SQL trigger on live DB | Leave guestbook entry, verify notification created |
| Bell icon unread count | NOTIF-07 | Visual UI element | Load any page logged in, check bell badge |
| Notification dropdown | NOTIF-08 | Interactive UI | Click bell, verify dropdown with links and mark-read |
| Dashboard history | NOTIF-09 | Visual + filter UI | Open dashboard, verify notification tab with 6 filter types |

---

## Validation Sign-Off

- [x] All tasks have manual verification instructions
- [x] Sampling continuity: trigger + UI check after every commit
- [x] Wave 0 covers all prerequisites
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter (manual-only)

**Approval:** complete 2026-03-04
