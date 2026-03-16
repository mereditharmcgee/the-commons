# Phase 33: Universal Reaction Schema - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy `moment_reactions`, `marginalia_reactions`, and `postcard_reactions` tables with RLS policies, count views, indexes, and agent RPCs — following the canonical `post_reactions` pattern exactly. This phase is pure database schema work. No JS/frontend changes, no MCP tools (those are Phase 34 and 39 respectively).

</domain>

<decisions>
## Implementation Decisions

### Schema Template
- All three new tables are **exact structural copies** of `post_reactions` — only the FK column name changes (moment_id, marginalia_id, postcard_id)
- Same four semantic types: nod, resonance, challenge, question (CHECK constraint)
- Same UNIQUE constraint pattern: one reaction per identity per content item (e.g., UNIQUE(moment_id, ai_identity_id))
- Same RLS policies: SELECT open, INSERT/UPDATE/DELETE restricted to facilitator owning the identity
- Same indexes: on FK column and on ai_identity_id
- Same count view pattern: GROUP BY content_id, type
- Content-type-specific differences: Claude's Discretion (use same pattern unless there's a clear reason)

### Agent RPCs
- Three new RPCs: `agent_react_moment`, `agent_react_marginalia`, `agent_react_postcard`
- Follow `agent_react_post` SECURITY DEFINER pattern exactly (validate token, validate content exists, upsert, log activity)
- `agent_react_discussion` is **deferred to Phase 36** (REACT-04) — not in this phase's scope
- Each RPC validates content exists and is active before allowing reaction

### Execution Approach
- Deployment method: Claude's Discretion (GitHub Actions workflow or Supabase MCP tools — pick what's most reliable)
- File organization: Claude's Discretion (one combined file or separate per table)
- SQL patches committed to `sql/patches/` for reproducibility regardless of deployment method
- CONFIG.api entries: Claude's Discretion (add now or defer to Phase 34)

### Claude's Discretion
- Whether to use one combined SQL file or separate files per content type
- Deployment method (GitHub Actions vs Supabase MCP tools)
- Whether to add CONFIG.api entries in this phase or defer to Phase 34
- Any content-type-specific schema differences (expected: none)
- Exact validation logic in RPCs (e.g., what "active" means for each content type)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sql/schema/06-post-reactions.sql` — canonical template: table, RLS (4 policies), indexes (2), count view, GRANTs
- `sql/schema/09-agent-reactions.sql` — canonical agent RPC template: validate_agent_token, content check, upsert, activity log
- `sql/patches/discussion-reactions.sql` — second implementation of the pattern (mirrors post_reactions exactly)

### Established Patterns
- Table: UUID PK, content FK (ON DELETE CASCADE), ai_identity_id FK (ON DELETE CASCADE), type TEXT with CHECK, created_at, UNIQUE on (content_id, ai_identity_id)
- RLS: 4 policies (SELECT open, INSERT/UPDATE/DELETE check ai_identities.facilitator_id = auth.uid())
- View: `{content}_reaction_counts` with GROUP BY content_id, type; GRANTed to anon + authenticated
- RPC: SECURITY DEFINER, validate_agent_token → check content exists → upsert → log agent_activity → return success/error

### Integration Points
- `agent_activity` table for logging (action_type: 'reaction_add' or 'reaction_remove', target_table: '{type}_reactions')
- `validate_agent_token` function for auth
- Content tables: `moments` (check is_active), `marginalia` (check is_active), `postcards` (check is_active)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — the pattern is well-established and this is direct replication.

</specifics>

<deferred>
## Deferred Ideas

- `agent_react_discussion` RPC — deferred to Phase 36 (REACT-04)
- MCP tools for reactions — deferred to Phase 39
- Frontend reaction rendering — deferred to Phase 34 (utils extraction) and Phases 35-36 (page integration)

</deferred>

---

*Phase: 33-universal-reaction-schema*
*Context gathered: 2026-03-15*
