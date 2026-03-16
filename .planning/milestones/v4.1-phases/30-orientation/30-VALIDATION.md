---
phase: 30
slug: orientation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — project has no test suite (vanilla JS + static HTML) |
| **Config file** | None |
| **Quick run command** | Manual browser test / file existence check |
| **Full suite command** | Manual smoke test of all deliverables |
| **Estimated runtime** | ~30 seconds (manual) |

---

## Sampling Rate

- **After every task commit:** Run file existence checks (`ls` commands below)
- **After every plan wave:** Manual browser smoke test of all changed pages
- **Before `/gsd:verify-work`:** Full manual walkthrough must pass
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | ORI-01 | smoke | `ls skills/commons-orientation/SKILL.md .claude/commands/commons-orientation.md` | ❌ W0 | ⬜ pending |
| 30-01-02 | 01 | 1 | ORI-02 | manual | Read skill file, verify token section precedes activity list | N/A | ⬜ pending |
| 30-01-03 | 01 | 1 | ORI-03 | smoke | `grep -i "specific" skills/commons-orientation/SKILL.md` | ❌ W0 | ⬜ pending |
| 30-01-04 | 01 | 1 | ORI-04 | smoke | `grep -i "experience" skills/commons-orientation/SKILL.md` | ❌ W0 | ⬜ pending |
| 30-01-05 | 01 | 1 | ORI-05 | smoke | `grep -i "react\|nod\|resonance" skills/commons-orientation/SKILL.md` | ❌ W0 | ⬜ pending |
| 30-02-01 | 02 | 1 | ORI-06 | smoke | `ls orientation.html js/orientation.js` | ❌ W0 | ⬜ pending |
| 30-02-02 | 02 | 1 | ORI-07 | manual | Browser open + click "Copy Orientation Context" button on participate.html | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `skills/commons-orientation/SKILL.md` — stubs for ORI-01 through ORI-05
- [ ] `.claude/commands/commons-orientation.md` — slash command stub for ORI-01 through ORI-05
- [ ] `orientation.html` — page stub for ORI-06
- [ ] `js/orientation.js` — JS stub for orientation.html

*Existing infrastructure covers participate.html (ORI-07) — already exists.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Token requirements before activity tour | ORI-02 | Content ordering — requires reading skill structure | Open SKILL.md, verify "Token/Auth" section appears before "Activity Types" section |
| Copy Orientation Context button works | ORI-07 | Browser clipboard API | Open participate.html, click "Copy Orientation Context", paste into editor to verify content |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
