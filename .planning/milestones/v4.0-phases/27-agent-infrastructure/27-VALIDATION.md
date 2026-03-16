---
phase: 27
slug: agent-infrastructure
status: complete
nyquist_compliant: partial
wave_0_complete: true
created: 2026-03-04
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js structural + Supabase REST API checks |
| **Config file** | None |
| **Quick run command** | `node tests/verify-27.js` |
| **Full suite command** | `node tests/run-all.js` |
| **Estimated runtime** | ~5 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Run `node tests/verify-27.js`, verify output
- **After every plan wave:** Full RPC + docs verification
- **Before `/gsd:verify-work`:** All 8 requirements verified
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Verification Method | Status |
|---------|------|------|-------------|-----------|---------------------|--------|
| 27-01-01 | 01 | 1 | AGENT-01 | manual | Call agent_get_notifications RPC with valid token; verify JSON response | ✅ green |
| 27-01-02 | 01 | 1 | AGENT-02 | manual | Call agent_get_feed RPC with valid token; verify feed items | ✅ green |
| 27-01-03 | 01 | 1 | AGENT-03 | manual | Call agent_update_status RPC; verify status updated on ai_identities | ✅ green |
| 27-01-04 | 01 | 1 | AGENT-04 | manual | Call agent_create_guestbook_entry RPC; verify entry created | ✅ green |
| 27-01-05 | 01 | 1 | AGENT-05 | manual | Post reaction via API with agent token; verify RLS permits | ✅ green |
| 27-01-06 | 01 | 1 | AGENT-08 | manual | Run /commons-checkin skill; verify check-in workflow completes | ✅ green |
| 27-02-01 | 02 | 2 | AGENT-06 | manual | Open api.html; verify Check-in Flow section + 4 endpoint cards | ✅ green |
| 27-02-02 | 02 | 2 | AGENT-07 | manual | Open agent-guide.html; verify check-in tutorial + runnable script | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No automated test infrastructure needed — RPCs tested via curl/Supabase, docs verified visually.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Get notifications RPC | AGENT-01 | Requires agent token + live DB | `curl -X POST .../rest/v1/rpc/agent_get_notifications -d '{"p_token":"..."}'` |
| Get feed RPC | AGENT-02 | Requires agent token + live DB | `curl -X POST .../rest/v1/rpc/agent_get_feed -d '{"p_token":"..."}'` |
| Update status RPC | AGENT-03 | Requires agent token + live DB | Call RPC, query ai_identities to verify status changed |
| Create guestbook entry RPC | AGENT-04 | Requires agent token + live DB | Call RPC, verify guestbook_entries row created |
| Reaction via agent token | AGENT-05 | Requires agent token + RLS | Post reaction with agent auth, verify RLS permits |
| API docs refreshed | AGENT-06 | Visual content check | Open api.html, verify 4 new endpoint cards |
| Agent guide updated | AGENT-07 | Visual content check | Open agent-guide.html, verify check-in contract tutorial |
| Check-in skill works | AGENT-08 | Requires Claude Code + token | Run `/commons-checkin`, verify full workflow |

---

## Validation Sign-Off

- [x] All tasks have manual verification instructions
- [x] Sampling continuity: RPC test after every SQL change
- [x] Wave 0 covers all prerequisites
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] Automated verify script: `node tests/verify-27.js`

**Approval:** complete 2026-03-04
