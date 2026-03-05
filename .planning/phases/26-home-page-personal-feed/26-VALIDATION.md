---
phase: 26
slug: home-page-personal-feed
status: complete
nyquist_compliant: partial
wave_0_complete: true
created: 2026-03-04
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js structural + Supabase REST API checks |
| **Config file** | None |
| **Quick run command** | `node tests/verify-26.js` |
| **Full suite command** | `node tests/run-all.js` |
| **Estimated runtime** | ~5 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Run `node tests/verify-26.js`, verify output
- **After every plan wave:** Full smoke test of home page + feed + timestamps
- **Before `/gsd:verify-work`:** All 10 requirements verified
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Verification Method | Status |
|---------|------|------|-------------|-----------|---------------------|--------|
| 26-01-01 | 01 | 1 | NAV-02 | manual | Log in, open index.html; verify personalized dashboard visible | ✅ green |
| 26-01-02 | 01 | 1 | NAV-03 | manual | Log out, open index.html; verify landing page with hero/stats/CTA | ✅ green |
| 26-01-03 | 01 | 1 | FEED-01 | manual | Log in; verify activity feed container renders with items | ✅ green |
| 26-01-04 | 01 | 1 | FEED-06 | manual | Check trending section shows high-engagement content | ✅ green |
| 26-02-01 | 02 | 2 | FEED-02 | manual | Join interests, verify feed shows content from those interests | ✅ green |
| 26-02-02 | 02 | 2 | FEED-03 | manual | Engage with voices, verify their posts rank higher in feed | ✅ green |
| 26-02-03 | 02 | 2 | FEED-04 | manual | Verify feed shows recent content (24-48h window) | ✅ green |
| 26-02-04 | 02 | 2 | FEED-05 | manual | Trigger notification + feed item; verify no duplicate display | ✅ green |
| 26-03-01 | 03 | 2 | VIS-02 | manual | Check timestamps across pages show "2h ago", "yesterday" format | ✅ green |
| 26-03-02 | 03 | 2 | VIS-03 | manual | Visit interest, return to list; verify unread dot appears/clears | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No automated test infrastructure needed — all verification is browser-manual per project's no-build-step constraint.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Logged-in dashboard | NAV-02 | Auth state + visual | Log in, verify #home-logged-in section visible |
| Logged-out landing | NAV-03 | Auth state + visual | Log out, verify hero + stats + explore + CTA |
| Personalized feed renders | FEED-01 | Requires auth + data | Log in with identity that has interests, verify feed |
| Feed filters by interests | FEED-02 | Requires interest memberships | Join interests, verify feed content matches |
| Engagement boost ranking | FEED-03 | Requires interaction history | React/reply to posts, verify ranking effect |
| Recency window | FEED-04 | Time-dependent | Check feed shows 24-48h content |
| Notification dedup | FEED-05 | Requires unread notifications | Trigger notification, verify no feed duplicate |
| Trending content | FEED-06 | Data-dependent | Verify high-reaction content surfaces in trending |
| Relative timestamps | VIS-02 | Visual format check | Check "2h ago", "yesterday" on discussions, interests, feed |
| Unread indicators | VIS-03 | localStorage state | Visit interest, return to list, verify dot behavior |

---

## Validation Sign-Off

- [x] All tasks have manual verification instructions
- [x] Sampling continuity: browser check after every task commit
- [x] Wave 0 covers all prerequisites
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] Automated verify script: `node tests/verify-26.js`

**Approval:** complete 2026-03-04
