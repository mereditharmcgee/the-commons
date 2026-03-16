---
phase: 37-facilitator-as-participant
plan: 01
subsystem: ui
tags: [dashboard, identity, human-voice, localStorage, sql, supabase]

# Dependency graph
requires:
  - phase: 34-shared-reaction-infrastructure
    provides: Utils patterns and dashboard identity card HTML structure
  - phase: 07-profile-data-integrity
    provides: ai_identities table, Auth.createIdentity/updateIdentity, ai_identity_stats view

provides:
  - Human voice dashboard section with create/card/edit/deactivate states
  - Partial unique index enforcing one active human identity per facilitator
  - tc_preferred_identity_id localStorage key for auto-select across posting forms
  - Auto-select preferred identity in submit, chat, postcards, text, and profile guestbook

affects:
  - 37-02 (if exists) — onboarding and catch_up integration needs tc_preferred_identity_id and human badge
  - 38-dashboard-polish — dashboard layout includes human-voice-section above identities-section
  - Any page with identity dropdowns — auto-select pattern established

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tc_preferred_identity_id localStorage key: set on human voice create/edit, cleared on deactivate; read in all posting form loadIdentities() to auto-select"
    - "renderHumanVoiceSection: invite state vs card state, re-rendered on CRUD operations"
    - "Inline edit: replaces section content in-place, no modal"

key-files:
  created:
    - sql/patches/11-human-identity-unique.sql
    - .planning/phases/37-facilitator-as-participant/37-01-SUMMARY.md
  modified:
    - dashboard.html
    - js/dashboard.js
    - js/submit.js
    - js/chat.js
    - js/postcards.js
    - js/text.js
    - js/profile.js

key-decisions:
  - "Human identity is stored as an ai_identities row with model='human' (lowercase) — same table as AI identities, not a separate facilitator column"
  - "tc_preferred_identity_id persisted in localStorage so all posting forms auto-select without server round-trip"
  - "Inline edit replaces section content in-place — no modal, consistent with context decision from phase 37 research"
  - "Stats fetched from ai_identity_stats view via Utils.get REST call, same view used by profile pages"
  - "Deactivation calls Auth.updateIdentity({ is_active: false }) preserving DB content; clears localStorage preference"

patterns-established:
  - "Human voice section: two states (invite with warm copy, identity card with badge/stats/actions)"
  - "Auto-select pattern: after populatingidentity dropdown options, read tc_preferred_identity_id and call dispatchEvent(new Event('change')) to trigger dependent UI updates"

requirements-completed: [FAC-01, FAC-02, FAC-05, FAC-06, FAC-08]

# Metrics
duration: 30min
completed: 2026-03-16
---

# Phase 37 Plan 01: Facilitator as Participant Summary

**"Your Human Voice" dashboard section with inline CRUD, SQL uniqueness constraint, and tc_preferred_identity_id auto-select in all five posting form dropdowns**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-03-16T02:40:15Z
- **Completed:** 2026-03-16T03:10:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- SQL partial unique index enforces one active human voice per facilitator at the DB level
- Dashboard "Your Human Voice" section renders above "Your Identities" with invite state (create prompt) or card state (name, Human badge, participation stats, Edit, View Profile, Remove voice)
- Inline edit form with name + bio fields replaces card content in-place — no modal
- On create, identity ID stored to `tc_preferred_identity_id` in localStorage
- All five posting form dropdowns (submit, chat, postcards, text, profile guestbook) auto-select the preferred identity and dispatch `change` event for dependent UI updates
- Stale preferences cleared from localStorage when identity is deactivated or no longer in the list

## Task Commits

1. **Task 1: SQL patch + dashboard HTML + human voice section JS** - `31ce74a` (feat)
2. **Task 2: Auto-select human identity in all posting form dropdowns** - `d547a97` (feat)

## Files Created/Modified

- `sql/patches/11-human-identity-unique.sql` - Partial unique index: one active human identity per facilitator
- `dashboard.html` - Added "Your Human Voice" section HTML above "Your Identities"
- `js/dashboard.js` - renderHumanVoiceSection, renderHumanVoiceInvite, renderHumanVoiceCard, renderHumanVoiceForm functions; wired into init sequence
- `js/submit.js` - Auto-select preferred identity after loadIdentities populates dropdown
- `js/chat.js` - Auto-select preferred identity after loadIdentities populates dropdown
- `js/postcards.js` - Auto-select preferred identity after loadIdentities populates dropdown
- `js/text.js` - Auto-select preferred identity after loadIdentities populates dropdown
- `js/profile.js` - Auto-select preferred identity in guestbook identity select (multi-identity case)

## Decisions Made

- Human identity uses `model='human'` (lowercase) in `ai_identities` — consistent with CONFIG.models.human and Utils.getModelClass handling
- Stats fetched from `ai_identity_stats` Supabase view via `Utils.get('/rest/v1/ai_identity_stats', ...)` — same view profile pages use; graceful fallback to zeros if unavailable
- guestbook auto-select guarded with `if (guestbookIdentitySelect)` — select only rendered for multi-identity eligible visitors, not shown for single-identity case

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**SQL patch requires deployment to Supabase.** Run the following in Supabase SQL editor or via MCP execute_sql:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ai_identities_one_human_per_facilitator
    ON ai_identities (facilitator_id)
    WHERE model = 'human' AND is_active = true;
```

## Next Phase Readiness

- Human voice creation, editing, deactivation, and auto-select are all functional in the dashboard and posting forms
- Voices directory and profile pages already support human identities (no changes needed)
- Phase 37-02 (if planned): participate.html onboarding step and catch_up flagging can build on tc_preferred_identity_id and model='human' pattern established here

---
*Phase: 37-facilitator-as-participant*
*Completed: 2026-03-16*
