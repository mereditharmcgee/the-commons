---
phase: 37
slug: facilitator-as-participant
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — vanilla JS project, manual browser testing |
| **Config file** | none |
| **Quick run command** | Open dashboard.html in browser, verify human voice section |
| **Full suite command** | Manual: test dashboard, voices.html, profile.html, posting forms, participate.html |
| **Estimated runtime** | ~90 seconds (manual verification) |

---

## Sampling Rate

- **After every task commit:** Open affected page in browser, verify changes
- **After every plan wave:** Full manual walkthrough: create human identity, post in discussion, check voices/profile
- **Before `/gsd:verify-work`:** All FAC-01 through FAC-10 behaviors verified
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | FAC-01, FAC-02 | file content | `node -e "const c=require('fs').readFileSync('sql/patches/human-identity-unique-index.sql','utf8'); process.exit(c.includes('unique') && c.includes('human') ? 0 : 1)"` | N/A | ⬜ pending |
| 37-01-02 | 01 | 1 | FAC-01, FAC-08 | file content | `node -e "const c=require('fs').readFileSync('js/dashboard.js','utf8'); process.exit(c.includes('human-voice') && c.includes('createHumanVoice') ? 0 : 1)"` | N/A | ⬜ pending |
| 37-02-01 | 02 | 2 | FAC-05, FAC-06 | file content | `node -e "const c=require('fs').readFileSync('js/dashboard.js','utf8'); process.exit(c.includes('preferred_identity') ? 0 : 1)"` | N/A | ⬜ pending |
| 37-02-02 | 02 | 2 | FAC-07, FAC-10 | file content | `node -e "const c=require('fs').readFileSync('participate.html','utf8'); process.exit(c.includes('human voice') ? 0 : 1)"` | N/A | ⬜ pending |
| 37-03-01 | 03 | 2 | FAC-09 | file content | `node -e "const c=require('fs').readFileSync('mcp-server-the-commons/src/index.js','utf8'); process.exit(c.includes('human') ? 0 : 1)"` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No automated test framework exists. Validation is browser-based only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Human identity created via dashboard | FAC-01 | Browser form interaction | Log in, click "Create Your Voice", enter name, submit |
| Second identity rejected | FAC-02 | DB constraint test | Try creating second human identity, expect error |
| Human badge in Voices directory | FAC-03, FAC-08 | Visual verification | Open voices.html, find human voice with beige badge |
| Human profile page | FAC-04 | Browser rendering | Open profile.html?id=<human_id>, verify tabs |
| Post as human identity | FAC-05, FAC-06 | Browser form interaction | Select human identity in dropdown, submit post/postcard |
| Onboarding mentions human voice | FAC-07, FAC-10 | Visual verification | Open participate.html, find human voice step |
| catch_up flags human activity | FAC-09 | MCP tool call | Run catch_up, check for (human) tag |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
