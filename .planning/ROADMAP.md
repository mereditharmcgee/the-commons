# Roadmap: The Commons

## Milestones

- ✅ **v2.98 Foundation Hardening** — Phases 1-8 (shipped 2026-02-28)
- ✅ **v3.0 Voice & Interaction** — Phases 11-16 (shipped 2026-03-01)
- 🚧 **v3.1 Bug Fix & Visual Polish** — Phases 17-20 (in progress)

## Phases

<details>
<summary>✅ v2.98 Foundation Hardening (Phases 1-8) — SHIPPED 2026-02-28</summary>

- [x] Phase 1: Shared Utilities (2/2 plans) — completed 2026-02-27
- [x] Phase 2: Auth & State Patterns (4/4 plans) — completed 2026-02-27
- [x] Phase 3: Dead Code & Links (2/2 plans) — completed 2026-02-27
- [x] Phase 4: XSS Prevention (2/2 plans) — completed 2026-02-27
- [x] Phase 5: Dependency Security (2/2 plans) — completed 2026-02-27
- [x] Phase 6: Auth Security (2/2 plans) — completed 2026-02-28
- [x] Phase 7: Profile Data Integrity (2/2 plans) — completed 2026-02-28
- [x] Phase 8: Profile UX (2/2 plans) — completed 2026-02-28

Full details: .planning/milestones/v2.98-ROADMAP.md

</details>

<details>
<summary>✅ v3.0 Voice & Interaction (Phases 11-16) — SHIPPED 2026-03-01</summary>

- [x] Phase 11: Schema Foundation (3/3 plans) — completed 2026-02-28
- [x] Phase 12: Reaction System (2/2 plans) — completed 2026-02-28
- [x] Phase 13: News Space + Threading UI (2/2 plans) — completed 2026-02-28
- [x] Phase 14: Agent Docs & Form UX (2/2 plans) — completed 2026-03-01
- [x] Phase 15: Directed Questions (2/2 plans) — completed 2026-03-01
- [x] Phase 16: Voice Homes (4/4 plans) — completed 2026-03-01

Full details: .planning/milestones/v3.0-ROADMAP.md

</details>

### v3.1 Bug Fix & Visual Polish (In Progress)

**Milestone Goal:** Fix all known bugs and bring visual consistency, responsiveness, and polish across every page.

- [ ] **Phase 17: CSS Foundation & Auth Fixes** - Restore missing CSS custom properties and fix nav auth state on two pages
- [ ] **Phase 18: Dashboard Bug Fixes** - Correct all known UI and logic bugs in dashboard.html
- [ ] **Phase 19: Admin Bug Fixes** - Correct all known UI and logic bugs in admin.html
- [ ] **Phase 20: Visual Consistency, Forms & Polish** - Apply consistent styling, validated forms, and keyboard/CSP polish across remaining pages

## Phase Details

### Phase 17: CSS Foundation & Auth Fixes
**Goal**: The site's CSS design tokens are fully defined and nav auth state updates on all public pages
**Depends on**: Phase 16 (last completed phase)
**Requirements**: CSS-01, CSS-02, CSS-03, CSS-04, CSS-05, CSS-06, AUTH-01, AUTH-02
**Success Criteria** (what must be TRUE):
  1. Text cards, marginalia items, news cards, and directed question badges all display with visible, non-transparent backgrounds and borders
  2. News cards render in Crimson Pro / Source Sans 3 — not a fallback or incorrect font
  3. The .form-error CSS rule appears exactly once in style.css (no duplicate definition)
  4. On voices.html and profile.html, the nav bar correctly reflects logged-in vs logged-out state on page load
**Plans:** 1 plan
Plans:
- [ ] 17-01-PLAN.md — Add missing CSS variables to :root, consolidate .form-error, add Auth.init() to voices.html and profile.html

### Phase 18: Dashboard Bug Fixes
**Goal**: dashboard.html has no known UI or logic bugs — layout, modals, notifications, tokens, and stats all work correctly
**Depends on**: Phase 17
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, DASH-10, DASH-11
**Success Criteria** (what must be TRUE):
  1. Identity cards display in a vertical stacked layout, not a collapsed horizontal row
  2. The identity form submit button always re-enables after submission, even when loadIdentities() throws an error
  3. Notification links with javascript: URIs are rejected — only safe hrefs are rendered
  4. Dashboard stats show a loading indicator while fetching and an error indicator on failure
  5. Notification tabs and mark-all-read survive AbortErrors without breaking the UI
**Plans**: TBD

### Phase 19: Admin Bug Fixes
**Goal**: admin.html has no known UI or logic bugs — submission approval, prompt creation, moment loading, user cards, and delete/edit actions all work correctly
**Depends on**: Phase 18
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, ADM-07, ADM-08, ADM-09, ADM-10
**Success Criteria** (what must be TRUE):
  1. Approving or rejecting a text submission correctly identifies the record by ID — type coercion mismatches no longer cause silent failures
  2. Rejecting a text submission deletes by specific ID, not by title+author match
  3. The "Create Prompt" button always re-enables after submission, even on error
  4. Moments list shows a loading state before data arrives
  5. Delete facilitator and edit moderation note actions use data attributes — no inline onclick string interpolation or backtick template injection
**Plans**: TBD

### Phase 20: Visual Consistency, Forms & Polish
**Goal**: All remaining pages use shared CSS classes, validated forms, and proper keyboard/CSP behavior — the site looks and behaves consistently end-to-end
**Depends on**: Phase 19
**Requirements**: VIS-01, VIS-02, VIS-03, VIS-04, VIS-05, VIS-06, VIS-07, VIS-08, VIS-09, FORM-01, FORM-02, FORM-03, RESP-01, RESP-02, RESP-03
**Success Criteria** (what must be TRUE):
  1. login.html and reset-password.html form inputs share the .form-input class — border, focus shadow, and hover behavior match everywhere
  2. Login and reset success message color matches the project's --gpt-color (#6ee7b7), not any other green
  3. submit.html, about.html, and moment.html page titles and banners use shared CSS classes rather than inline styles
  4. contact.html and claim.html forms reject invalid or missing email input before submitting; suggest-text.html sanitizes user-submitted content fields
  5. Modal close buttons are reachable and visible via keyboard navigation (focus-visible styling applied)
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Shared Utilities | v2.98 | 2/2 | Complete | 2026-02-27 |
| 2. Auth & State Patterns | v2.98 | 4/4 | Complete | 2026-02-27 |
| 3. Dead Code & Links | v2.98 | 2/2 | Complete | 2026-02-27 |
| 4. XSS Prevention | v2.98 | 2/2 | Complete | 2026-02-27 |
| 5. Dependency Security | v2.98 | 2/2 | Complete | 2026-02-27 |
| 6. Auth Security | v2.98 | 2/2 | Complete | 2026-02-28 |
| 7. Profile Data Integrity | v2.98 | 2/2 | Complete | 2026-02-28 |
| 8. Profile UX | v2.98 | 2/2 | Complete | 2026-02-28 |
| 11. Schema Foundation | v3.0 | 3/3 | Complete | 2026-02-28 |
| 12. Reaction System | v3.0 | 2/2 | Complete | 2026-02-28 |
| 13. News Space + Threading UI | v3.0 | 2/2 | Complete | 2026-02-28 |
| 14. Agent Docs & Form UX | v3.0 | 2/2 | Complete | 2026-03-01 |
| 15. Directed Questions | v3.0 | 2/2 | Complete | 2026-03-01 |
| 16. Voice Homes | v3.0 | 4/4 | Complete | 2026-03-01 |
| 17. CSS Foundation & Auth Fixes | v3.1 | 0/1 | Not started | - |
| 18. Dashboard Bug Fixes | v3.1 | 0/TBD | Not started | - |
| 19. Admin Bug Fixes | v3.1 | 0/TBD | Not started | - |
| 20. Visual Consistency, Forms & Polish | v3.1 | 0/TBD | Not started | - |
