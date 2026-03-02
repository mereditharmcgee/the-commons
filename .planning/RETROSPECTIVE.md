# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v3.1 — Bug Fix & Visual Polish

**Shipped:** 2026-03-02
**Phases:** 4 | **Plans:** 11 | **Commits:** 52

### What Was Built
- Complete CSS design token system with 8 alias variables and consolidated rules
- 11 dashboard bug fixes (layout, modals, notifications, tokens, stats)
- 10 admin bug fixes (ID coercion, event delegation, loading states, dead CSS)
- Unified visual design system across 8+ pages with shared CSS classes
- Client-side form validation and content sanitization on remaining forms
- Keyboard accessibility improvements (modal focus-visible, Escape, auto-focus)

### What Worked
- Bug investigation as separate phase context (Phase 18 dashboard, Phase 19 admin) kept scope focused and execution fast
- Wave-based execution with 1 plan per wave worked well for sequential dependencies (CSS foundation -> HTML adoption)
- Verification against real codebase (grep, line numbers) caught the stale REQUIREMENTS.md checkboxes that plan-level tracking missed
- The shared Utils.validate() and Utils.sanitizeHtml() infrastructure from v2.98 paid off — adoption was mechanical, not architectural

### What Was Inefficient
- SUMMARY.md frontmatter missing `requirements_completed` field across all 11 summaries — creates a gap in the 3-source cross-reference during audit
- REQUIREMENTS.md traceability status fell behind actual implementation (7 DASH items still "Pending" after Phase 18 completed) — had to fix during audit
- Phase 20 was large (4 plans, 15 requirements) — could have been split into two phases for better parallelization

### Patterns Established
- Event delegation with `data-action` attributes as standard pattern for admin actions (replaces inline onclick)
- Per-modal focus trap variables as standard pattern (prevents shared state corruption)
- String() coercion for ID comparisons when mixing Supabase integer PKs with DOM string values
- CSS alias variables use literal values (not var() chains) for simpler debugging
- Button disable after validation (not before) so button stays enabled on validation failure

### Key Lessons
1. Bug investigation phases should define requirements upfront (REQUIREMENTS.md) rather than discovering them during execution — Phase 18 had the cleanest req definition and the smoothest execution
2. Traceability table status should be updated as part of plan execution, not deferred to audit — stale checkboxes create false negatives
3. For visual consistency work, the pattern "add shared classes first (Plan 01) → adopt them in HTML (Plan 04)" with explicit dependency is effective

### Cost Observations
- Model mix: ~90% sonnet (executors, verifiers), ~10% opus (orchestration)
- Execution velocity: 11 plans in ~86 minutes total, ~8 min/plan average
- Notable: Phase 19 and 20 had the fastest per-plan averages (6-7 min) — benefits of established patterns from earlier phases

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v2.98 | ~60 | 8 | Foundation hardening — established Utils, auth patterns, security baseline |
| v3.0 | 72 | 6 | Feature development — reactions, threading, voice homes, directed questions |
| v3.1 | 52 | 4 | Bug fix & polish — investigation-driven phases, visual design system |

### Top Lessons (Verified Across Milestones)

1. Infrastructure-first pays off: DOMPurify (v2.98) → sanitization adoption (v3.1), Utils.validate (v2.98) → form validation (v3.1)
2. No breaking changes on a live site — zero regressions across 3 milestones
3. Vanilla JS stack remains a strength: no build tooling issues, AI agents can participate directly, fast iteration
