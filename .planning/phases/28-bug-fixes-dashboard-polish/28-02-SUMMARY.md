---
phase: 28-bug-fixes-dashboard-polish
plan: 02
subsystem: auth, ui, database
tags: [account-deletion, dashboard, danger-zone, sql-rpc, postgresql, supabase]

# Dependency graph
requires:
  - phase: 28-01
    provides: Dashboard bug fixes (auth modals) that this plan builds upon

provides:
  - Account deletion SQL RPC (delete_account) with full content anonymization
  - Auth.deleteAccount() method for client-side account removal
  - Dashboard Danger Zone section with confirmation modal

affects:
  - dashboard.html, js/dashboard.js, js/auth.js (account management)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER PostgreSQL function for privileged account cleanup"
    - "Danger Zone UI pattern (GitHub settings style) with confirmation input"
    - "Modal guard: force-hide on JS init to prevent CSP inline-style issues"

key-files:
  created:
    - sql/patches/028-account-deletion.sql
  modified:
    - js/auth.js
    - dashboard.html
    - js/dashboard.js
    - css/style.css

key-decisions:
  - "Content anonymization preserves posts/marginalia/postcards to '[deleted]' — threads remain coherent"
  - "auth.users record NOT deleted by RPC — requires admin API; user is signed out client-side"
  - "Confirmation requires typing 'DELETE' (case-sensitive) or the user's email address"
  - "SQL patch applied manually via Supabase dashboard (consistent with Phase 24 pattern — no service key in env)"
  - "delete modal variable initialized at JS init and force-hidden, keeping it consistent with other modals"

patterns-established:
  - "Danger Zone section spans full grid width via grid-column: 1 / -1 (same as tokens section)"
  - "Delete modal uses same trapFocus/openModal/closeModal pattern as identity and token modals"
  - "Force-hide all new modals immediately after const declaration in JS init guard block"

requirements-completed:
  - BUG-04

# Metrics
duration: 17min
completed: 2026-03-04
---

# Phase 28 Plan 02: Account Deletion Summary

**PostgreSQL SECURITY DEFINER RPC that anonymizes all user content and deletes account data, plus a GitHub-style Danger Zone dashboard UI with DELETE confirmation modal**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-03-04T23:33:17Z
- **Completed:** 2026-03-04T23:50:05Z
- **Tasks:** 2 auto tasks complete, 1 checkpoint (human-verify) reached
- **Files modified:** 4

## Accomplishments
- SQL RPC `delete_account()` anonymizes posts/marginalia/postcards to "[deleted]", deactivates identities and agent tokens, deletes subscriptions/notifications/memberships, removes facilitator record — all in one SECURITY DEFINER function
- `Auth.deleteAccount()` in `js/auth.js` calls the RPC then signs out client-side, redirecting to index.html
- Dashboard Danger Zone section at bottom with red border, "Delete Account" button, and full confirmation modal requiring "DELETE" or email to enable the confirm button

## Task Commits

Each task was committed atomically:

1. **Task 1: Create account deletion SQL RPC and Auth method** - `c726468` (feat)
2. **Task 2: Add Danger Zone UI to dashboard with confirmation flow** - `dc6cb88` (feat)
3. **Task 3: Verify account deletion UI (checkpoint:human-verify)** - awaiting user verification

**Plan metadata:** (pending after checkpoint resolves)

## Files Created/Modified
- `sql/patches/028-account-deletion.sql` - PostgreSQL delete_account() SECURITY DEFINER RPC with 9-step cleanup sequence
- `js/auth.js` - Added deleteAccount() method after signOut()
- `dashboard.html` - Added Danger Zone section + delete confirmation modal with ARIA attributes
- `js/dashboard.js` - Added openDeleteModal/closeDeleteModal, confirmation input listener, deletion handler; force-hide guard; Escape key handler updated
- `css/style.css` - Added .danger-zone, .danger-zone__title, .danger-zone__item, .btn--danger styles; .dashboard-section--danger grid span

## Decisions Made
- Content anonymization (not deletion) preserves discussion thread integrity — posts remain but attribution is cleared
- auth.users record is intentionally not deleted by the RPC (requires admin API access not available in client context)
- Confirmation input accepts "DELETE" (exact, case-sensitive) or the user's email address
- SQL patch applied manually via Supabase dashboard, consistent with Phase 24 precedent

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**SQL RPC must be manually applied to Supabase before the deletion flow works end-to-end.**
Steps:
1. Go to https://supabase.com/dashboard/project/dfephsfberzadihcrhal/sql/new
2. Paste the contents of `sql/patches/028-account-deletion.sql`
3. Run it

The UI changes (Danger Zone section, modal) work immediately without the SQL patch. The deletion flow requires the patch.

## Next Phase Readiness
- Account deletion UI is live on the dashboard once code is deployed
- SQL patch must be applied manually before deletion actually works
- No blockers for subsequent plans

---
*Phase: 28-bug-fixes-dashboard-polish*
*Completed: 2026-03-04*
