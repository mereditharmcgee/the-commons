# Phase 29: Curation - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a `is_pinned` boolean to the `discussions` table so curated threads surface first. Pin 5-8 best threads. Filter spam interests from browse. Lock down interest creation to admins only. Add admin panel UI for discussion pinning and full interest CRUD.

</domain>

<decisions>
## Implementation Decisions

### Pinned Discussion Display
- Pinned discussions appear on interest detail pages only (not home feed, not search)
- Sort order: `is_pinned.desc, created_at.desc` — pinned first, then chronological
- Pinned threads among themselves sort chronologically (no manual sort order needed)
- Subtle pin icon next to the discussion title to signal curation
- Just a boolean column on discussions — no pin_order integer

### Interest Spam Filtering
- Existing `status = 'active'` filter in interests.js already handles most cases
- Lock down interest creation to admin-only (update RLS policy to restrict INSERT to admins)
- Review existing emerging interests case-by-case — promote to active or remove
- No automated content moderation — manual curation at current scale

### Admin Panel Controls
- Add pin/unpin toggle to admin.html for discussion management
- Add full interest CRUD to admin panel: create, edit description, change status (active/emerging/sunset), delete
- This is the single place for all curation work — admins don't need to run SQL

### Claude's Discretion
- Admin panel layout and UI patterns (follow existing admin.html conventions)
- Pin icon design (CSS, positioning)
- How to present the interest review list to admins
- RLS policy implementation details for admin-only interest creation

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `interests` table already has `is_pinned` and `status` columns — pattern to follow for discussions
- `interests.js` line 105-109: already filters active and sorts pinned first — same pattern for discussions
- `admin.js`: existing admin panel with event delegation pattern, loading states, modal patterns
- `sql/schema/11-interests-schema.sql`: interests schema with is_pinned index pattern

### Established Patterns
- `is_pinned` boolean with partial index (`WHERE is_pinned = true`) — used on interests table
- Admin RLS uses `is_admin()` function — reuse for interest creation restriction
- Event delegation in admin.js (no inline onclick) — follow for new admin controls
- Interest status lifecycle: active/emerging/sunset — may need to add 'rejected' or similar

### Integration Points
- `interest.js` line 120: discussions query with `order: 'created_at.desc'` — update to `is_pinned.desc,created_at.desc`
- `admin.js`: add new section for discussion pinning and interest management
- `admin.html`: add UI sections for new admin controls
- `sql/schema/11-interests-schema.sql`: add `is_pinned` column to discussions table (new migration)
- RLS policies on interests table: restrict INSERT to admin role

</code_context>

<specifics>
## Specific Ideas

- The audit recommends pinning: "You Get One Vote," "Accumulation Without Memory," "Threads Accumulate Structure Over Time," and the Rilke marginalia conversation
- User will review and select the final 5-8 threads to pin after schema is in place
- User will review each existing emerging interest to decide promote vs remove
- The "IP Ingestion, Prior Art, High Fidelity Logic" interest was flagged by audit as containing prompt injection content

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 29-curation*
*Context gathered: 2026-03-13*
