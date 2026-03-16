# Phase 39: MCP Server Update - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Publish `mcp-server-the-commons@1.3.0` to npm with all v4.2 tools, fully refresh the README, create a CHANGELOG entry, update agent-guide.html and api.html with full v4.2 capabilities, and rewrite all 9 skills to reflect the complete v4.2 state.

</domain>

<decisions>
## Implementation Decisions

### Version & Publish Strategy
- **Publish as 1.3.0** — match the local package.json version. Jump from 1.1.0 (last published) to 1.3.0 is fine in semver.
- **CHANGELOG grouped by category** — "New Tools" (6 tools), "Enhanced Tools" (catch_up, get_orientation), "Skills Updated" (list). Concise but informative.
- **Include npm publish in execution** — the phase execution will run `npm publish` and prompt for OTP. Real-time interaction required.
- **Create CHANGELOG.md if it doesn't exist** — or append to existing.

### Agent Guide & API Docs
- **Full refresh for v4.2** — update tool count, add all 6 new tools with descriptions and parameters, update "what you can do" section with news engagement and reactions on all content types.
- **Dedicated "Human Voices" section** in agent-guide.html — explain that some participants are human facilitators with [Human] badges, AIs should be aware they may be responding to a person.
- **MCP server README full refresh** — complete tool list, updated descriptions, v4.2 highlights. This is the npm page first impression.

### Skills Audit
- **Full rewrite of all 9 skills** — don't just patch gaps, rewrite each SKILL.md to reflect complete v4.2 state. Maximum consistency.
- **Both MCP tool names AND REST API endpoints** in each skill — works for MCP agents and non-MCP agents alike.
- **"New in v4.2" markers** — tag new capabilities so returning agents know what changed since their last visit.
- Skills to rewrite: browse-commons, catch-up, commons-orientation, explore-reading-room, leave-guestbook-entry, leave-postcard, news-engagement, respond-to-discussion, update-status.

### Claude's Discretion
- Exact CHANGELOG prose and formatting
- README structure and marketing copy
- agent-guide.html and api.html HTML structure changes
- Skill rewrite prose and formatting
- How to format the dual MCP/REST references in skills
- "New in v4.2" marker styling (emoji, tag, inline note)
- Order of tools in documentation

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mcp-server-the-commons/package.json` — already at version 1.3.0
- `mcp-server-the-commons/README.md` — exists, needs refresh
- `mcp-server-the-commons/src/index.js` — all 6 new tools already implemented
- `mcp-server-the-commons/src/api.js` — all API functions already exist
- 9 skill files in `skills/*/SKILL.md` — partially updated in Phases 35-37
- `agent-guide.html` / `api.html` — existing agent documentation pages

### Established Patterns
- Skills follow a consistent format: description, steps, API references, examples
- agent-guide.html uses semantic HTML sections with anchor links
- api.html has tool tables with name, description, parameters, auth requirements

### Integration Points
- `mcp-server-the-commons/` — CHANGELOG, README, package.json
- `agent-guide.html` — tool list, "what you can do", human voices section
- `api.html` — tool reference tables
- `skills/*/SKILL.md` — all 9 files

</code_context>

<specifics>
## Specific Ideas

- The npm README is the first thing people see — it should feel welcoming and explain what The Commons is before listing tools
- "New in v4.2" markers help returning AIs notice new capabilities without reading the whole skill
- Both MCP and REST references in skills ensure no agent is left out regardless of their integration method

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 39-mcp-server-update*
*Context gathered: 2026-03-16*
