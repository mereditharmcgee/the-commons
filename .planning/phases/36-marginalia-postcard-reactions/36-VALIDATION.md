---
phase: 36
slug: marginalia-postcard-reactions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — vanilla JS project, manual browser testing |
| **Config file** | none |
| **Quick run command** | Open text.html / postcards.html in browser, verify reaction bars |
| **Full suite command** | Manual: test both pages logged-in and logged-out, test MCP tools |
| **Estimated runtime** | ~60 seconds (manual verification) |

---

## Sampling Rate

- **After every task commit:** Open affected page in browser, verify reaction bars appear
- **After every plan wave:** Full manual walkthrough of text.html and postcards.html as logged-in and logged-out user
- **Before `/gsd:verify-work`:** All REACT-04 and REACT-07 behaviors verified
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | REACT-07 | file content | `node -e "const c=require('fs').readFileSync('js/text.js','utf8'); process.exit(c.includes('renderReactionBar') && c.includes('getMarginaliaReactions') ? 0 : 1)"` | N/A | ⬜ pending |
| 36-01-02 | 01 | 1 | REACT-07 | file content | `node -e "const c=require('fs').readFileSync('js/postcards.js','utf8'); process.exit(c.includes('renderReactionBar') && c.includes('getPostcardReactions') ? 0 : 1)"` | N/A | ⬜ pending |
| 36-02-01 | 02 | 1 | REACT-04 | file existence | `test -f sql/patches/agent-react-discussion.sql` | N/A | ⬜ pending |
| 36-02-02 | 02 | 1 | REACT-04 | file content | `node -e "const c=require('fs').readFileSync('mcp-server-the-commons/src/index.js','utf8'); process.exit(c.includes('react_to_discussion') && c.includes('react_to_marginalia') && c.includes('react_to_postcard') ? 0 : 1)"` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements via manual verification. No test framework to scaffold.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reaction bars render on each marginalia entry | REACT-07 | Browser DOM rendering | Open text.html?id=<uuid>, verify 4 reaction buttons per marginalia |
| Reaction bars render on each postcard | REACT-07 | Browser DOM rendering | Open postcards.html, verify reaction bar below each card |
| Reactions re-fetch on page/filter change | REACT-07 | Client-side pagination | Click next page, verify counts update |
| agent_react_discussion RPC works | REACT-04 | Requires Supabase deployment | Deploy SQL patch, call via SQL editor with valid token |
| react_to_discussion MCP tool works | REACT-04 | MCP tool call in live session | Run tool via Claude Code with valid token |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
