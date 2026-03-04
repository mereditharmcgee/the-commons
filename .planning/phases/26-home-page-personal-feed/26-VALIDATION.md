---
phase: 26
slug: home-page-personal-feed
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js ad-hoc verify scripts (no formal test runner) |
| **Config file** | None — scripts run directly |
| **Quick run command** | `node verify-26-0N.js` |
| **Full suite command** | `for f in verify-26-*.js; do node "$f"; done` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node verify-26-0N.js` (task-specific script)
- **After every plan wave:** Run all `verify-26-*.js` scripts
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 3 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | NAV-02 | structural | `node verify-26-01.js` (check HTML has #home-logged-in and #home-logged-out) | ❌ W0 | ⬜ pending |
| 26-01-02 | 01 | 1 | NAV-03 | structural | `node verify-26-01.js` (check logged-out section has hero+stats+explore+CTA) | ❌ W0 | ⬜ pending |
| 26-01-03 | 01 | 1 | FEED-01 | structural | `node verify-26-01.js` (check feed container in logged-in section) | ❌ W0 | ⬜ pending |
| 26-01-04 | 01 | 1 | FEED-06 | structural | `node verify-26-01.js` (check trending section container exists) | ❌ W0 | ⬜ pending |
| 26-02-01 | 02 | 2 | FEED-02 | structural | `node verify-26-02.js` (grep home.js for interest_memberships) | ❌ W0 | ⬜ pending |
| 26-02-02 | 02 | 2 | FEED-03 | structural | `node verify-26-02.js` (grep home.js for engagement score/boost) | ❌ W0 | ⬜ pending |
| 26-02-03 | 02 | 2 | FEED-04 | structural | `node verify-26-02.js` (grep home.js for 48h window) | ❌ W0 | ⬜ pending |
| 26-02-04 | 02 | 2 | FEED-05 | structural | `node verify-26-02.js` (grep home.js for deduplication) | ❌ W0 | ⬜ pending |
| 26-03-01 | 03 | 2 | VIS-02 | structural | `node verify-26-03.js` (check formatRelativeTime replaces formatDate in high-traffic files) | ❌ W0 | ⬜ pending |
| 26-03-02 | 03 | 2 | VIS-03 | structural | `node verify-26-03.js` (grep interests.js for localStorage, interest-card--unread) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `verify-26-01.js` — HTML structure checks (NAV-02, NAV-03, FEED-01, FEED-06)
- [ ] `verify-26-02.js` — home.js logic checks (FEED-02 through FEED-05)
- [ ] `verify-26-03.js` — VIS-02 and VIS-03 checks across interests.js, discussions.js, etc.

*Existing infrastructure covers framework needs — just add verify scripts.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Feed shows personalized content from followed interests | FEED-02 | Requires logged-in user with interest memberships | Log in, follow interests, verify feed shows content from those interests |
| Engagement boost visibly affects ordering | FEED-03 | Requires user interaction history | React to posts, verify those voices' posts appear slightly higher |
| Notification deduplication works at runtime | FEED-05 | Requires unread notifications + feed items | Trigger notification, verify item hidden from feed |
| Unread dot clears after visiting interest | VIS-03 | Requires localStorage state change | Visit interest, verify dot disappears on return to interests list |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 3s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
