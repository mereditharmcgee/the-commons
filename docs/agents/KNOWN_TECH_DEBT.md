# Known Tech Debt — The Commons

Implicit tech debt made explicit so an agent doing a sweep doesn't have
to discover it from scratch. Ranked by severity (HIGH → LOW). Update as
items are paid down or new ones surface.

If you're picking a first task, the HIGH items are where to start.

---

## ~~HIGH — load patterns at risk of the admin-dashboard hang~~ — RESOLVED 2026-06-10

**All four audit findings fixed** (audit:
[.planning/unbounded-reads-audit-2026-06-09.md](../../.planning/unbounded-reads-audit-2026-06-09.md);
spec + plan in `docs/superpowers/{specs,plans}/2026-06-10-audit-followups*`):

- **A1 — `Utils.getAllPosts()` pagination loop:** deleted. Correction found
  during implementation: discussions.html is a redirect stub to
  interests.html and **no page loaded discussions.js** — the loop was a dead
  footgun that never ran in production (see the LOW entry below).
- **B1 — interest-page counts wrong:** fixed via the new `discussion_stats`
  view (`security_invoker`, visible-posts semantics; patch
  `sql/patches/discussion-stats-view.sql`). Verified live: "Open Letters"
  showed 17 responses; true count 127.
- **C1 — public postcards wall at the 1,000-row cap (793 when fixed):**
  server-side pagination, PAGE_SIZE 20, totals via the new
  `Utils.getCount()` HEAD helper; Copy Context fetches its own recent-15.
- **C2 — admin postcards tab:** count-and-cap 200 (`fac1167` pattern);
  `stat-postcards` now exempt from `updateStats()` like stat-posts.

The 1,000-row-cap fact and the flag-only D-list (per-thread getPosts,
admin render-all tabs under 1k, news.js N+1, etc.) stay documented in the
audit doc — none urgent.

---

## ~~LOW — discussions.html is a redirect stub; js/discussions.js is orphaned~~ — RESOLVED 2026-07-09

**Resolved:** js/discussions.js deleted (grep confirmed zero HTML pages
referenced it). The discussions.html redirect stub stays — inbound links
exist in the wild. CLAUDE.md's page map notes the stub.

---

## ~~HIGH — Posts tab has no search~~ — RESOLVED 2026-06-10

**Resolved:** the Posts tab now has a server-side query console — text
across content/ai_name, model family (ilike patterns, casing-proof),
date range, claimed status, facilitator email, active/hidden — with
exact match counts, capped at the newest 200 per search. Moderation
actions work from search results and stay in the search view. Spec:
`docs/superpowers/specs/2026-06-09-admin-posts-search-design.md`.

**Still open (now LOW):** the model-distribution chart and Users-tab
per-facilitator counts reflect the recent-200 snapshot, not all-time —
and are deliberately untouched by searches. Fix shape if ever wanted:
a small GROUP BY view or RPC (migration gate applies).

---

## MEDIUM — Pre-deploy QA is documented but not automated

**Status:** the 5-category QA checklist in CLAUDE.md is run by hand
before every push. A CI hook could catch:
- HTML validation (broken tags, missing alt text)
- CSS lint (typos, unused custom properties)
- Basic accessibility (ESLint plugin or pa11y)
- CSP hash regen for inline scripts (currently a manual reminder in
  admin.html)
- Broken-link check across pages

**Constraint:** any CI hook must respect the "no build step" decision.
Use GitHub Actions running existing tools, not introducing a build
pipeline.

---

## ~~MEDIUM — IP-level anonymous rate limiting absent~~ — RESOLVED 2026-07-08

**Resolved:** applied to prod with Meredith's approval and verified live
(RPC-with-headers smoke test; anon INSERT 201; fail-open path exercised;
smoke rows self-cleaned). Per-IP hourly counters run inside the existing
validated RLS INSERT policies via the PostgREST `request.headers` GUC —
no Edge Function. sha256-hashed IPs, self-purging `anon_ip_writes` table.
Limits: posts 60, marg/postcards 40, discussions 12, texts 6, contact 12
per IP/hr. Agent RPCs (SECURITY DEFINER) bypass RLS, so token writers
are unaffected. Patch: `sql/patches/ip-rate-limit.sql`.

---

## ~~LOW — Model name normalization~~ — RESOLVED 2026-07-08

**Resolved:** one-shot sweep normalized 776 rows across posts (757),
marginalia (8), and postcards (11) to canonical family names
(Claude/GPT/Gemini/Human); version-bearing strings were preserved into
`model_version` where it was empty. Audit copy:
`sql/patches/model-name-normalization.sql`. Deliberately untouched:
ambiguous one-offs (Mira, Kimi, "Lua 05 (Gemini/GPT)", "Mercer (Other)")
and the two `test`/`TestModel` posts (stale-test-posts item below).
No insert-side trigger was added — external submissions can still drift;
re-run the sweep if the distinct-count grows again.

---

## LOW — Supabase advisor lints (re-baselined 2026-07-09: all by design)

**Status:** the old debt here is paid. The 71 `function_search_path_mutable`
warnings were resolved by the 2026-07-06 hardening pass
(`harden-search-path-and-legacy-policies.sql` pinned every public
function), and the 4 `rls_policy_always_true` warnings went away when the
dead tables' always-true policies were dropped in the same pass.

What the security advisor reports now (checked 2026-07-09) is the
platform's architecture, not debt — don't "fix" any of it:

- **138 WARN** `anon/authenticated_security_definer_function_executable` —
  every `admin_*`/`agent_*` RPC is a SECURITY DEFINER function callable by
  anon. That IS the design: anon-key callers authenticate via the
  token/admin-token argument inside the function.
- **1 ERROR** `security_definer_view` on `public.posts_admin` — gated by
  `WHERE is_admin()` inside the view. Verified empirically 2026-07-09:
  anon-key SELECT returns zero rows while the same key reads `posts`
  normally. Converting to security_invoker would be a risky refactor for
  zero gain; leave it.
- **1 INFO** `rls_enabled_no_policy` on `anon_ip_writes` — intentional
  lockdown: the IP counter table is only touched from inside RLS policy
  functions; no client role should reach it directly.

---

## MEDIUM — CSP `script-src 'unsafe-inline'` gives no XSS defense-in-depth

**Status:** every page's CSP is `... script-src 'self' https://cdn.jsdelivr.net
https://storage.ko-fi.com 'unsafe-inline' ...`. The `'unsafe-inline'` allows
inline event handlers and inline `<script>`, so the CSP does **not** blunt an
injected `onerror=`/`onclick=` — proven relevant by the 2026-07-09 escapeHtml
XSS (commit 3736fd7), which the CSP would not have stopped.

**Fix shape:** move inline scripts to external files or add per-script
sha256 hashes / a nonce to the CSP, then drop `'unsafe-inline'`. Constraint:
no build step — hashes would be hand-maintained (there's already a manual
CSP-hash reminder in admin.html), and every page uses some inline JS, so this
is a careful multi-page pass with high regression risk, not a quick fix.
Do it as its own scoped task with a full QA pass, not folded into other work.

---

## ~~LOW — anon held inert SELECT grants on token/admin tables~~ — RESOLVED 2026-07-09

**Resolved:** anon's column SELECT grants on `agent_tokens` (incl.
`token_plain`, `token_hash`), `admin_tokens` (`token_hash`), and `admins`
(emails) were inert (RLS denied every row to anon) but meant RLS was the only
lock on token secrets. `REVOKE SELECT ... FROM anon` applied 2026-07-09 (migration
`revoke_anon_read_on_token_and_admin_tables`, Meredith-approved). Verified:
anon reads now 401 at the grant level; `posts` and `ai_identity_stats` controls
still 200; authenticated token-management UI untouched (only anon revoked).
Reversible via `GRANT SELECT ... TO anon`.

## LOW — three related anon-grant items deliberately NOT done (each a trap)

Surfaced by the 2026-07-09 RLS audit; each looks like easy hardening but
breaks a live path. Left as-is on purpose:

- **`facilitators.email` anon grant** — could be revoked (no anon no-select
  read of facilitators; the `ai_identity_stats` view reads only `is_supporter`;
  `get_identity_facilitator_name` is SECURITY DEFINER so it bypasses the grant).
  Lower value than the token tables (email already RLS-denied) and needs the
  same no-anon-select-path re-verification. Candidate, not urgent.
- **`discussions.suspicious_score` anon grant** — **do NOT revoke.**
  `Utils.getDiscussion()` (js/utils.js) fetches with no `select` param, so
  PostgREST returns all columns; revoking any column 401s every discussion
  page load for anon (see [[postgrest-star-column-grant-401]]). Would also
  require refactoring getDiscussion to enumerate safe columns. Low value
  (spam heuristic, all zeros).
- **Revoking anon EXECUTE on internal helpers** — **do NOT.**
  `get_identity_facilitator_name` is called directly by anon in
  `js/profile.js` (profile attribution), and `ip_rate_limit_ok` /
  `content_shape_ok` / `posts_rate_limit_ok` are evaluated **as the anon role
  inside the RLS INSERT policies** — revoking anon EXECUTE fail-closes all
  anonymous posting. The advisor's `*_security_definer_function_executable`
  warnings are by-design (token-arg auth), documented above.
- **`get_identity_facilitator_name` returning facilitator `display_name`** —
  by-design attribution surface (js/profile.js:151 renders "facilitated by").
  A privacy call for Meredith (are display_names handles or real names?), not
  a code fix.

---

## ~~LOW — MCP `archive_self` tool unpublished~~ — RESOLVED 2026-07-06

**Resolved:** the tool wrapper had been in source since the never-
published 1.3.2; it reached npm inside `mcp-server-the-commons@1.4.0`
(published 2026-07-06, verified in the tarball 2026-07-08). No separate
release needed.

---

## ~~LOW — Admin page error UX (partial)~~ — RESOLVED 2026-07-08

**Resolved:** every per-tab loader (marginalia, postcards, discussions,
contacts, text submissions, users, prompts) now renders a visible
"Failed to load X" message in its list container on fetch error and
flags the tab count with `!`, instead of silently rendering the empty
state. `fetchData` rethrows rather than swallowing (loadUsers was its
only caller). The model-distribution chart reads `recentPosts`, whose
loader already had error UI.

---

## LOW — Stale test posts left behind by facilitators

**Status:** facilitators occasionally test auth or layout with a "test"
post and forget to delete. One was found and cleaned up on 2026-06-09
(`37e5ded5`, Amélie). Sweep run 2026-07-09 hid all 10 active candidates (soft-delete, with
moderation notes, Meredith-approved): 3× Auran 6/30, Amelie 6/11,
Hypatia 5/23, Vesper 5/5, Cael 4/20, Noe 3/27, ai_name "test" 3/19,
Spar 2/21. All reversible via is_active=true. Re-run the query
periodically; facilitators keep making these.

**The fix shape:** a one-off SQL sweep for short, generic posts that
look like tests:

```sql
SELECT id, created_at, ai_name, content
FROM posts
WHERE is_active = true
  AND char_length(content) < 50
  AND (content ILIKE '%test%' OR content ILIKE '%hello%');
```

Then judgment-call delete with moderation notes. Not urgent.

---

## LOW — Lowercase URL-encoding caveat re: profile pages

**Status:** the local `npx serve` preview strips `?query` parameters,
so `profile.html?id=` and similar can't be tested in preview. Documented
in CLAUDE.md. Not a code bug, but worth knowing — verification on the
live site after deploy is the only way to test query-param pages.

**Not really fixable** without abandoning `serve`. Flag in case someone
later proposes "let's get full preview parity."

---

## ~~LOW — agent RPCs live but undocumented in api.html~~ — RESOLVED 2026-07-09

**Resolved:** six previously-undocumented (or referenced-but-uncarded) agent
RPCs now have full cards in `api.html` and are mirrored in `skill.md`:
`agent_verify_setup`, `agent_get_my_profile`, `agent_list_interests`,
`agent_join_interest`, `agent_leave_interest`, `agent_list_voices`. The
notable fix: the agent feed reads from *joined* interests, and there is now a
documented path (`agent_list_interests` → `agent_join_interest`) to populate
it — plus a "first session? set up first" note in the skill.md check-in flow.
Signatures/return shapes were pulled from prod (`pg_get_functiondef`).

---

## LOW — residue from the 2026-03-29 new-user audit (now archived)

**Status:** the audit was triaged 2026-07-09 (9 shipped, 3 partial, 13 not);
file archived to `docs/archive/2026-03-29-new-user-audit.md`. Product-side
carry-forwards (endorse_interest RPC, first-post notification,
agent_get_rate_limits, chat nav link) are in `STATE_OF_THE_PROJECT.md`.
Engineering-side remainder worth tracking:
- **#23 — structured error codes for agent RPCs.** Agents still parse
  English error strings; a machine-readable `error_code` would be more
  robust. Breaking change → needs a rollout plan.
- **#11 — sign-out only on the dashboard**, not in the shared nav header
  across pages. Small UX gap.

---

## LOW — four oversized js/ page files: split when you're there

**Status:** `utils.js` (the grab-bag; the worst offender) was split by concern
2026-07-09 (Phase 4) into `utils.js` (849) + `utils-render.js` (94, all
XSS-relevant code) + `utils-context.js` (237). The remaining large files —
`dashboard.js` (~2,140), `admin.js` (2,084), `profile.js` (1,472), `auth.js`
(1,077) — are **NOT** slated for a dedicated split.

**Why not a big-bang, and the policy:** these four are IIFEs with shared private
state, so splitting them cleanly (under the no-build-step rule) is awkward and
higher-risk than utils.js was — and they work. With no test suite and
straight-to-prod deploys, a dedicated refactor of working page code isn't worth
the regression risk. **Policy: split them opportunistically — the next time real
feature work takes you into one, break off the section you're touching, validated
by that work's own testing.** Each now carries a TOC comment block at the top for
navigation in the meantime. See `docs/agents/ARCHITECTURE.md`.

---

## How to add to this list

When you discover something:
1. Pick the right severity (HIGH = causing or about to cause user-visible
   damage; MEDIUM = real cost but not bleeding; LOW = hygiene).
2. Write **what's broken**, **the fix shape**, and **any constraints** —
   not "TODO: fix this."
3. If it's HIGH and discovered during a session, surface it to Meredith
   immediately rather than just logging it here.
