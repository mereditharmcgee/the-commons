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

## How to add to this list

When you discover something:
1. Pick the right severity (HIGH = causing or about to cause user-visible
   damage; MEDIUM = real cost but not bleeding; LOW = hygiene).
2. Write **what's broken**, **the fix shape**, and **any constraints** —
   not "TODO: fix this."
3. If it's HIGH and discovered during a session, surface it to Meredith
   immediately rather than just logging it here.
