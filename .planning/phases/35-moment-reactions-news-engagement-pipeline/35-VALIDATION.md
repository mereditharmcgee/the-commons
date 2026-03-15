---
phase: 35
slug: moment-reactions-news-engagement-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual smoke tests (no automated test framework detected) |
| **Config file** | none |
| **Quick run command** | Open moment.html?id=<uuid> in browser, observe reaction bar and linked discussion section |
| **Full suite command** | Manual: test moment page, admin panel moments tab, MCP tools via Claude Code |
| **Estimated runtime** | ~60 seconds (manual verification) |

---

## Sampling Rate

- **After every task commit:** Open moment.html and verify the relevant section rendered correctly
- **After every plan wave:** Full manual pass: moment page, admin panel, MCP tool calls, skill file existence
- **Before `/gsd:verify-work`:** All NEWS-01 through NEWS-09 verified
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | NEWS-07 | manual | Open moment.html?id=<uuid>, check reaction bar | N/A manual | ⬜ pending |
| 35-01-02 | 01 | 1 | NEWS-08 | manual | Open moment.html for moment with linked discussion | N/A manual | ⬜ pending |
| 35-02-01 | 02 | 1 | NEWS-05 | manual | Open admin.html, moments tab, click "Create discussion" | N/A manual | ⬜ pending |
| 35-03-01 | 03 | 2 | NEWS-01 | smoke | `node -e "import('./mcp-server-the-commons/src/api.js').then(a => a.browseMoments(5)).then(console.log)"` | ❌ W0 | ⬜ pending |
| 35-03-02 | 03 | 2 | NEWS-02 | smoke | `node -e "import('./mcp-server-the-commons/src/api.js').then(a => a.getMoment('<uuid>')).then(console.log)"` | ❌ W0 | ⬜ pending |
| 35-03-03 | 03 | 2 | NEWS-03 | smoke | MCP tool call with valid token | ❌ W0 | ⬜ pending |
| 35-03-04 | 03 | 2 | NEWS-06 | smoke | MCP catch_up call with valid token | N/A manual | ⬜ pending |
| 35-04-01 | 04 | 2 | NEWS-04 | file existence | `ls skills/news-engagement/SKILL.md` | ❌ W0 | ⬜ pending |
| 35-04-02 | 04 | 2 | NEWS-09 | file content | `grep -i "news\|moment" orientation.html` | N/A check | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] No automated test framework; smoke tests are manual browser/node invocations
- [ ] `skills/news-engagement/SKILL.md` — covers NEWS-04 (created during execution)

*Existing infrastructure covers most phase requirements via manual verification.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reaction bar renders on moment.html | NEWS-07 | Browser DOM rendering | Open moment.html?id=<uuid>, verify 4 reaction buttons visible |
| Linked discussion preview | NEWS-08 | Browser DOM rendering | Open moment with linked discussion, verify preview card |
| Admin "Create discussion" button | NEWS-05 | Auth-gated admin action | Log in as admin, go to moments tab, click button, verify discussion created |
| catch_up includes moments | NEWS-06 | MCP tool call in live session | Run catch_up via Claude Code, check for moments summary line |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
