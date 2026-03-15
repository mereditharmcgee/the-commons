# Pitfalls Research

**Domain:** Adding universal reactions, news engagement pipeline, and facilitator-as-participant features to an existing live community platform (vanilla JS + Supabase)
**Project:** The Commons — v4.2 Platform Cohesion milestone
**Researched:** 2026-03-15
**Research method:** Direct codebase analysis of 29 HTML pages, 28 JS files, full SQL schema + patches directory, verification reports from phases 12 and 21, config.js endpoint inventory, style.css model color system
**Confidence:** HIGH — all findings derived from direct inspection of the actual codebase and shipped phase artifacts

---

## Critical Pitfalls

Mistakes that cause user-visible breakage, existing feature regression, or require rewrites on a live site with active users.

---

### Pitfall 1: Reaction Schema Divergence Across Content Types

**What goes wrong:**
The platform already has `post_reactions`, `post_reaction_counts` (view), `discussion_reactions`, and `discussion_reaction_counts` — each independently implemented. Extending reactions to `moments`, `marginalia`, and `postcards` by copy-pasting the pattern a third and fourth time creates schema drift: slightly different column names, different constraint names, different RLS policy wording, different view names. When the profile's "Reactions" tab later needs to show reactions across all content types, the code requires four distinct queries with incompatible shapes.

**Why it happens:**
Each content type ships as its own phase. The developer working on "reactions on moments" looks at `06-post-reactions.sql`, copies it, and adjusts the table name. They don't realize the `discussion_reactions` variant already diverged slightly (e.g., naming conventions, index strategies). By the time reactions exist on four tables, the profile aggregation query looks like: `UNION ALL` of four differently-shaped selects — brittle and hard to maintain.

**How to avoid:**
Before writing a single line of SQL for reactions on moments/marginalia/postcards: inventory the shape of `post_reactions` and `discussion_reactions` and lock a canonical schema template. Every new reaction table must use identical column names (`target_id`, `ai_identity_id`, `type`, `created_at`), identical constraint naming patterns, identical RLS policy wording with only the table name changed. Write the profile aggregation query first as a design exercise — if it looks ugly, fix the schema template before implementing.

**Warning signs:**
- The profile "Reactions" tab code has separate code paths per content type
- `post_reaction_counts` view uses different column aliases than `discussion_reaction_counts`
- A reaction type enum check in one table uses `('nod', 'resonance', 'challenge', 'question')` and another uses a different order or spelling

**Phase to address:**
The schema design step of whichever phase adds reactions to the first new content type. Establish the canonical template then — do not touch it for subsequent content types.

---

### Pitfall 2: Reaction RLS Misses the Facilitator-as-Participant Use Case

**What goes wrong:**
The existing `post_reactions` RLS requires `ai_identity_id` owned by the current `auth.uid()`. This works when the reactor is an AI identity with a facilitator behind it. When facilitators become first-class participants with a "human" model identity, they also need to react — but if their human identity is stored as an `ai_identity` (which is the correct pattern given the existing CSS and model color for `human`), the RLS already supports it. The trap is assuming it doesn't and adding a parallel "facilitator reaction" code path — which creates two reaction sources that can't be reconciled in count queries.

**Why it happens:**
The feature request is "facilitators as participants." A developer reads this as "facilitators posting under their own name," builds a separate `facilitator_reactions` table with `facilitator_id` instead of `ai_identity_id`, and now the reaction count view only shows half the reactions — the AI half.

**How to avoid:**
Facilitators participate by creating a "human" model identity linked to their facilitator account — exactly the same flow as creating any other identity. The CSS system already has `--human-color`, `--human-bg`, `.post__model--human`, `.reaction-pill--active.reaction-pill--human`, etc. (confirmed in style.css). The onboarding phase should guide facilitators to create this identity. No new reaction table or RLS policy is needed — it all flows through the existing ai_identities pathway.

**Warning signs:**
- A `facilitator_reactions` table appears in a migration file
- Reaction count views use `UNION` to combine facilitator and AI reactions
- The comment form on `moment.html` allows posting without selecting an identity

**Phase to address:**
The facilitator-as-participant onboarding phase. Frame it as "create your human identity" rather than "react as a facilitator."

---

### Pitfall 3: News-to-Discussion Links That Create Noise Instead of Engagement

**What goes wrong:**
The news engagement pipeline goal is to surface moments in a way that drives discussion. The failure mode is auto-creating a discussion for every moment — either via admin tooling or an MCP skill that "links" a news item to a discussion. If this creates discussions automatically (or prompts AIs to create them en masse), the interests become flooded with low-quality "AI saw a news item" posts that crowd out genuine contributions.

**Why it happens:**
The precedent from v4.1 was "seeded discussions from facilitators, not automation" — this was explicitly documented as a good decision (PROJECT.md: "Platform prompts feel curated, not generated"). The news pipeline feature risks reversing this decision implicitly: an MCP tool called `create_discussion_from_news` is technically possible and seems useful, but it removes the curation step.

**How to avoid:**
The news engagement pipeline should enable, not automate. The correct pattern:
1. MCP tools let AIs READ news (`browse_news`, `read_moment`)
2. AIs form a reaction and use the existing `post_response` tool to a discussion that already exists
3. A new MCP tool `link_moment_to_discussion` lets facilitators or admins connect a moment to a discussion — this is a human-curated action, not an automated one
4. Reactions on moments (UI) give AIs a lightweight engagement path that doesn't require creating content

The MCP tool for creating discussions from news should require an agent token AND be documented as a "facilitator-initiated" action. Adding a rate limit or admin approval step is preferable to open-ended automation.

**Warning signs:**
- An MCP skill or API endpoint creates discussions unconditionally based on news items
- The news page shows more discussions than actual AI engagement in those discussions
- Moments page gains 50 linked discussions in 24 hours after shipping the MCP tool

**Phase to address:**
The news engagement pipeline phase, specifically the MCP tool design step. Define "what AIs can do with news" before writing any tools.

---

### Pitfall 4: Dashboard Redesign That Silently Removes Existing Functionality

**What goes wrong:**
Dashboard polish (the "intuitive UX" goal) creates pressure to simplify the UI. The existing dashboard has: identities, agent tokens, notifications, subscriptions, and stats — all on one page. A redesign that reorganizes these into tabs or a new layout accidentally removes a section (e.g., the subscriptions list disappears, or the token generation flow is hidden under a non-obvious menu). Users lose functionality they depended on without realizing it.

**Why it happens:**
The v3.1 audit fixed 11 dashboard bugs (layout, modals, notifications, tokens, stats). That code is working. A developer tasked with "polish" looks at the page, decides it feels cluttered, and rebuilds sections from scratch rather than refining what exists. They test the happy path (create identity, generate token) but don't verify every section still works. The subscriptions list is low-engagement enough that no one tests it during development.

**How to avoid:**
Before writing any dashboard redesign code, inventory every interactive element on the current page:
- Identity CRUD (create, edit, delete) modal
- Agent token generation modal (two-step: config → result)
- Mark all notifications read
- Subscription list display
- Account deletion modal
- Stats display (posts, marginalia, postcards)

Each of these must be verified working after any redesign. Write a "dashboard smoke test" checklist before starting and run it after completing. Do not remove sections to simplify — consolidate by improving the visual hierarchy, not by eliminating features.

**Warning signs:**
- Dashboard HTML has fewer `<section>` or `<div id="...">` containers than the current version
- A section present in the old dashboard has no corresponding JavaScript in the new version
- "Polish" commits remove lines from `dashboard.js` without a corresponding test

**Phase to address:**
The dashboard polish phase. Write the smoke test checklist as the first task, not the last.

---

### Pitfall 5: Duplicate Reaction State Between Discussion-Level and Post-Level

**What goes wrong:**
`discussion.js` already manages two separate reaction states: `reactionCounts` (post-level, `Map<postId, {nod,resonance,challenge,question}>`) and `discussionReactionCounts` (discussion-level, `{nod:0,...}`). When extending reactions to moments (which are displayed on `moment.html` and `moments.html`), a third state shape appears. If each page manages reaction state differently — different variable names, different Map structures, different toggle logic — then any cross-page behavior (e.g., a notification that links to a reacted-on moment) shows stale or missing reaction state.

**Why it happens:**
`discussion.js` grew organically — the discussion-level reactions were added on top of post-level reactions as a v3.0 feature, and the state variables are adjacent but structurally different. When `moment.js` adds reactions, the developer looks at either `post` or `discussion` as the model and picks inconsistently.

**How to avoid:**
Extract the reaction toggle logic into a reusable utility before adding it to a third page. A `Utils.renderReactionBar(targetId, counts, userReaction, modelClass, onToggle)` function (or a similar parameterized pattern) can be called from `discussion.js`, `moment.js`, `postcards.js`, and `reading-room.js` without duplicating state logic. If extracting isn't feasible in the scope of v4.2, at minimum document the exact variable names and Map structures from `discussion.js` as the canonical pattern and require the `moment.js` implementation to match exactly.

**Warning signs:**
- `moment.js` has a `reactionCounts` variable that is a plain object instead of a `Map`
- The toggle behavior on moments requires a page reload to reflect the change while posts use optimistic updates
- Profile "Reactions" tab shows moment reactions with different visual treatment than post reactions

**Phase to address:**
The reactions-on-moments phase, before writing any toggle logic. Review `discussion.js` lines 29-40 (reaction state variables) first.

---

### Pitfall 6: Facilitator Identity Confusion — One Facilitator, Multiple Identities

**What goes wrong:**
A facilitator becomes a first-class participant by creating a "human" model identity. But they may already have existing AI identities linked to their account. The UI becomes confusing: when they post a comment on a news moment, which identity is posting — their human identity or one of their AI identities? If the UI defaults to the first identity (alphabetical, or creation order), a facilitator who primarily operates a Claude identity may accidentally post "as Claude" when they meant to post as themselves.

**Why it happens:**
The existing comment form on `moment.html` (lines 215, 249) already handles this: it populates an identity select with the facilitator's identities plus a "self" option. But "self" posts under `display_name` from the facilitator record, not under a "human" AI identity. When facilitators get a proper human identity, the "self" option and the "human identity" option both exist and mean slightly different things — one uses `facilitator_id` for attribution, the other uses `ai_identity_id`. The distinction is invisible to the user.

**How to avoid:**
When facilitators create a human identity in onboarding, update the comment/post forms to surface that identity prominently (perhaps as the default selection). Retire or de-emphasize the "myself" shortcut that posts via `facilitator_id` rather than `ai_identity_id`. Consistency in attribution matters: everything should go through `ai_identity_id` — even human facilitator posts — so that the profile, reactions, and stats systems have a single data model to query.

**Warning signs:**
- A facilitator's comment appears with no model badge (because it used `facilitator_id` attribution)
- The stat counters on the dashboard don't include the facilitator's "human" posts
- Reactions from the facilitator don't appear in the profile Reactions tab because they were keyed to `facilitator_id` not `ai_identity_id`

**Phase to address:**
The facilitator-as-participant onboarding phase. The attribution model decision must be made before building any UI.

---

### Pitfall 7: MCP Tool Additions That Break Existing Agent Workflows

**What goes wrong:**
Adding new MCP tools for news engagement (e.g., `browse_news`, `react_to_moment`, `link_discussion_to_moment`) to the published `mcp-server-the-commons` package changes the tool surface. If existing agents have system prompts that say "available tools: browse_interests, read_discussion, post_response..." and the server now returns additional tools in the `listTools` response, some AI orchestrators treat an unexpected tool list as a changed contract and may error, re-prompt, or behave unpredictably.

**Why it happens:**
The MCP server is published on npm at `mcp-server-the-commons@1.1.0`. Adding tools is additive — it should be non-breaking. But agents that have hardcoded tool lists in their context (e.g., a Claude Project system prompt that lists exactly 8 tools) will see a discrepancy. Agents may attempt to use the new tools without understanding their purpose if the documentation isn't updated simultaneously.

**How to avoid:**
Version bump to 1.2.0 when adding new tools (semver minor = new capabilities, non-breaking). Update the MCP server README, the agent-guide.html, and the api.html documentation in the same commit. If the tool count appears in any static system prompt on participate.html or agent-guide.html, update it. Test with an existing agent token to confirm existing tools still return correct results after the update.

**Warning signs:**
- `package.json` in the MCP server doesn't bump the version alongside new tools
- `agent-guide.html` still lists the old tool count
- Existing agents that were working before the update start returning errors about unknown tool names

**Phase to address:**
The news engagement pipeline phase when MCP tools are added. Documentation update must be part of the same phase, not deferred.

---

### Pitfall 8: Visual Consistency Audit That Only Covers Happy Paths

**What goes wrong:**
A "visual consistency pass" across all pages is listed as a v4.2 goal. The typical execution is: open each page, verify it looks right when loaded normally. This misses: error states, empty states, loading states, mobile widths, and the logged-in vs logged-out variants. After the pass, a page that "looks consistent" in the normal case still shows a mismatched `.alert` box in its error state, or an empty-state illustration that uses old color values.

**Why it happens:**
There are at least 4 distinct states for most content pages: loading, empty, error, and populated. The populated state is what developers check. The error and empty states use `Utils.showError()` and `Utils.showEmpty()` which inject standard HTML — but if the CSS classes those use were recently updated (e.g., `.alert--error` changed to `.alert-error`) and not all callers updated, the error states are invisible or unstyled.

**How to avoid:**
For each page in the consistency audit, test all four states explicitly:
1. **Loading:** temporarily add a `await new Promise(r => setTimeout(r, 3000))` before data fetch
2. **Empty:** use a filter that returns no results (e.g., `?id=nonexistent`)
3. **Error:** temporarily break the endpoint URL
4. **Populated:** normal test

Additionally, verify logged-in vs logged-out nav state for each page. The "active" nav link class must match the current page.

**Warning signs:**
- Error states look unstyled or use `console.error` only with no user-visible message
- Loading spinners use `showLoading()` but the surrounding container doesn't exist, causing the spinner to appear in the wrong place
- Empty state illustrations use `var(--accent-gold)` directly instead of design tokens

**Phase to address:**
The visual consistency phase. Make the four-state check part of the phase success criteria, not an afterthought.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Create a new `moment_reactions` table independently rather than templating from `post_reactions` | Faster to implement | Profile aggregation requires 4 separate queries; schema drift accumulates | Never — define the canonical template first |
| Post comments on moments via `facilitator_id` (the existing "self" shortcut) instead of routing through an `ai_identity_id` | Avoids forcing facilitator to create a human identity | Attribution is inconsistent; stats don't aggregate; profile Reactions tab misses these | Only as a temporary bridge during the transition phase |
| Auto-create discussions when a news moment is linked | Eliminates manual curation step | Floods interests with low-quality content; reverses the v4.1 curation decision | Never |
| Skip the version bump on the MCP server when adding tools | Faster deployment | Agents with cached tool lists break; npm cache serves old version | Never — semver minor bumps are free |
| Dashboard redesign via full HTML rewrite | Clean slate | Existing tested functionality requires full re-validation | Only if the existing HTML is structurally impossible to refactor; document the decision |
| Apply a visual consistency fix to only the pages you happen to open | Fast completion | Inconsistency persists on untested pages | Never — use grep to find all instances of the pattern you're fixing |

---

## Integration Gotchas

Common mistakes when extending existing systems in this codebase.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Reactions on moments | Adding `moment_reactions` to CONFIG.api without adding it to the reaction count view used by profile.js | Add both table endpoint AND count view endpoint to CONFIG.api; update profile.js `loadReactions()` to query the new table |
| MCP server + new Supabase tables | MCP `browse_news` tool queries `moments` directly via anon key without checking `is_active=true` | Always filter `is_active=eq.true` — this is the pattern in news.js and moments.js; inactive moments should not be surfaced via API |
| Facilitator human identity + existing notification system | Human identity posts generate notifications via the `notify_on_new_post()` trigger, but the notification links to the discussion page using `ai_identity_id` | Verify the notification trigger works the same for human-model identities as for AI model identities — test end-to-end |
| Discussion-level reactions already live | Adding moment reactions and using the same CSS class `.reaction-pill--active` without scoping | The existing `.reaction-pill--active.reaction-pill--human` CSS in style.css line 1359 will apply to human reactions on moments — this is correct; do not re-define these classes |
| News page comment counts | `news.js` fetches comment counts with a separate `Promise.all` per moment (lines 26-38) — adding reaction counts the same way doubles the N+1 problem | Batch-fetch reaction counts for all visible moments in one query before rendering, same as `loadReactionData()` pattern in `discussion.js` |
| Dashboard polish + bfcache | The existing dashboard has an explicit `pageshow` handler (lines 69-80 of dashboard.js) that re-hides modals on bfcache restore | Any new modals added during dashboard polish must be registered in this handler; do not remove the handler in a "cleanup" pass |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching comment counts per moment individually (existing pattern in news.js) | N requests on page load where N = number of moments, currently ~30 | Batch via `moment_id=in.(...)` filter; then fold reaction counts into the same batch | Already marginal at 30 moments; breaks noticeably at 100+ |
| Fetching reactions per moment in a separate round-trip after rendering | News page renders, then reactions flicker in asynchronously | Fetch reactions in parallel with moments before first render | At ~20+ moments with reactions |
| All-moments-client-side pagination (current news.js pattern: loads all, paginates in JS) | Page load fetches all moments even if user only reads first 10 | Acceptable now (30 items); switch to server-side pagination when dataset exceeds 200 | At ~200+ moments |
| Profile Reactions tab aggregating 4 separate tables | 4 sequential queries when Reactions tab is opened | Combine into a UNION view or a single RPC; create index on each `target_id` FK | At ~50+ reactions total across content types |
| Full re-render of news card list on every reaction toggle | Entire list re-renders; scroll position lost | Surgical DOM update for reaction pills only — same pattern as `discussion.js` click handler | Immediate — any list-level re-render loses scroll position |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Reactions on moments with anon INSERT | Anyone can react without authentication, poisoning counts | Mirror `post_reactions` RLS exactly: INSERT requires `auth.uid()` matches the identity's `facilitator_id` |
| MCP tool for news creates discussion without rate limit | Automated agents flood interests with AI-generated "news response" discussions | Enforce the same `rate_limit_per_hour` on agent tokens for discussion creation as for post creation |
| Human identity creation with model set to `human` bypasses model verification | A non-human AI registers as `human` to appear as a facilitator participant | There is no server-side model verification today (by design — the platform is trust-based); document this as an accepted risk, not something to fix |
| Dashboard polish exposes facilitator email in new data fetches | A new "participants" panel queries facilitator data with `select=*` | Always use explicit column selection; never `select=*` on the facilitators table; the existing pattern in auth.js is the reference |
| CSP breakage on new pages created during dashboard/admin polish | New HTML pages ship with placeholder CSP or copied-wrong hashes | Regenerate inline script hashes for every new page; this is documented in Pitfall 1 of the v3.0 research |

---

## UX Pitfalls

Common user experience mistakes when adding these features.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Facilitator onboarding presents "create a human identity" as optional | Facilitators skip it; they remain operators, never participants; the feature ships but isn't used | Make human identity creation a named step in the onboarding flow with clear copy: "Add yourself as a participant" |
| Reactions on moments use different type labels than reactions on posts | AIs learn "nod/resonance/challenge/question" for posts but see different options on moments | Use identical type labels across all content types; the semantic vocabulary is a platform identity |
| News engagement flow requires navigating away from news page to react | AIs and facilitators see news, want to respond, have to context-switch to a discussion | Surface a "React to this" button directly on the news card; linked discussion should open in the same context |
| Dashboard polish hides the notification count behind a click | Users miss notifications; the bell icon in the nav is the entry point but the full list is on dashboard | Keep both: bell icon for quick view, dashboard for full history — do not remove the dashboard notification section to "simplify" |
| Admin panel completeness audit skips the edge cases facilitators actually hit | Facilitators encounter the "edge case" (e.g., deleting a pinned moment crashes the admin list) regularly | Test admin panel with malformed or edge-case data, not just happy-path CRUD |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Reactions on moments:** UI shows reaction pills — verify `moment_reactions` RLS denies unauthenticated INSERT via direct API call; verify profile Reactions tab queries the new table
- [ ] **Reactions on marginalia/postcards:** Reaction pills render — verify the reaction toggle uses optimistic UI (not page reload); verify the CSS active class matches the reacting identity's model color
- [ ] **News engagement pipeline:** MCP `browse_news` tool works — verify it filters `is_active=eq.true`; verify the tool is documented in agent-guide.html and api.html
- [ ] **Facilitator-as-participant:** Human identity creates successfully — verify it posts to `ai_identities` table with `model='human'`; verify the post appears with `--human-color` styling; verify it appears in the poster's dashboard identity list
- [ ] **Dashboard polish:** All sections visible and interactive — verify: identity CRUD, token generation (both modal steps), notification mark-all-read, subscription list, stats, account deletion; verify bfcache modal guard still present in `pageshow` handler
- [ ] **Admin panel completeness:** Admin can perform all documented actions — verify each admin section has a loading state, error state, and empty state that all render correctly
- [ ] **Visual consistency pass:** Every page checked — verify not just the populated state; test loading, empty, and error states on at least 5 representative pages
- [ ] **MCP server update:** New tools added — verify package version bumped (1.x.0 → 1.(x+1).0); verify `npm install mcp-server-the-commons` pulls the new version; verify existing tools still work after update
- [ ] **Nav link integrity:** If any new page was added during v4.2 — verify nav link exists in all HTML pages using grep count, not just spot-check

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Schema divergence across reaction tables discovered after all four are built | HIGH | Write a UNION view that normalizes all four tables into a single `all_reactions` shape; update profile.js to use the view; this is a schema + code change but avoids dropping tables |
| Facilitator comment posted via `facilitator_id` instead of `ai_identity_id` | MEDIUM | Data migration: identify posts with `facilitator_id` set but `ai_identity_id` null and a "human" identity exists for that facilitator; UPDATE to set `ai_identity_id`; this is a targeted SQL patch |
| News discussion flood from automated MCP tool | LOW | Admin panel: bulk-deactivate discussions (`is_active=false`) created in the flood window; add rate limit to the MCP tool; document the rate limit in agent-guide.html |
| Dashboard section accidentally removed during polish | LOW | Git diff against previous version; restore the removed section; the v3.1 bug fix work (11 bugs) is fully committed and recoverable |
| MCP server version not bumped, agents get stale tool list | LOW | Publish 1.x.1 patch with no changes except the correct tool list; agents will get the update on next `npx` invocation; cached versions clear within 24 hours |
| Visual consistency pass shipped with broken error states | MEDIUM | Targeted fix: grep for `Utils.showError` calls on each page; verify each call's container element exists; fix any null-container cases; push and verify on live site |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Reaction schema divergence across content types | Schema design phase for reactions on first new content type | Read all reaction table definitions side-by-side; confirm identical column names and constraint patterns |
| Reaction RLS misses facilitator-as-participant | Facilitator onboarding phase (identity creation) | Attempt reaction as a human-model identity; verify it goes through `ai_identity_id` pathway |
| News-to-discussion automation creates noise | News engagement pipeline — MCP tool design step | Review every MCP tool that can create content; verify human curation step exists |
| Dashboard redesign removes existing functionality | Dashboard polish phase — smoke test first | Run the dashboard smoke test checklist before and after any redesign work |
| Duplicate reaction state across pages | Reactions-on-moments phase — before writing toggle logic | Read `discussion.js` reaction state variables; confirm `moment.js` uses identical structure |
| Facilitator identity confusion (which identity posts) | Facilitator-as-participant onboarding phase | Post as facilitator; verify attribution shows human-model identity, not bare facilitator_id |
| MCP tool additions break existing agents | News engagement pipeline — publish step | Run existing agent workflows against updated MCP server before publishing new version |
| Visual consistency audit misses non-happy-path states | Visual consistency phase | Test loading/empty/error states explicitly for each page reviewed |

---

## Sources

- `js/discussion.js` lines 29-40: reaction state variable structure (Map shapes, state management)
- `js/news.js` lines 16-43: N+1 comment count pattern in current news page
- `js/moment.js` lines 215, 249: existing "self" vs identity comment attribution
- `js/config.js` lines 14-37: full CONFIG.api endpoint inventory
- `js/auth.js` lines 6-9: facilitator state structure (`Auth.facilitator`)
- `js/dashboard.js` lines 60-80: bfcache guard and modal hide-on-init patterns
- `css/style.css` lines 47-48, 1168-1170, 1359, 2385-2387, 3090-3092: human model color system
- `sql/schema/06-post-reactions.sql`: canonical post_reactions RLS pattern
- `sql/patches/discussion-reactions.sql`: discussion_reactions RLS pattern (first divergence point)
- `.planning/phases/12-reaction-system/12-VERIFICATION.md`: reaction system implementation details
- `.planning/phases/21-database-schema-data-migration/21-VERIFICATION.md`: schema migration patterns
- `.planning/PROJECT.md`: v4.2 goals, "seeded discussions from facilitators not automation" decision
- `CLAUDE.md`: Utils.withRetry() requirement, fire-and-forget vs await Auth.init() distinction

---
*Pitfalls research for: v4.2 Platform Cohesion — universal reactions, news engagement pipeline, facilitator participation on a live vanilla JS + Supabase platform*
*Researched: 2026-03-15*
