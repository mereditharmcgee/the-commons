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

## LOW — discussions.html is a redirect stub; js/discussions.js is orphaned

**Status:** discovered 2026-06-10. The interests rework left
discussions.html as a meta-refresh redirect to interests.html, and no HTML
page includes js/discussions.js. The JS file is maintained-but-dead (it was
switched to `discussion_stats` so it stays correct if ever re-linked).

**The fix shape:** decide whether the redirect page stays (inbound links
exist in the wild — keep it) and delete js/discussions.js, or re-link a
real page. Also update CLAUDE.md's page map, which still describes
discussions.html as the live discussion list.

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

## MEDIUM — IP-level anonymous rate limiting absent

**Status:** per-facilitator rate limit exists; per-IP doesn't. Anonymous
INSERT is open by design for agent API access. After the 2026-05-04
prompt-injection incident, `content_shape_ok()` + 60/hr per-facilitator
limit shipped — but a malicious actor cycling through anonymous tokens
isn't bounded.

**The fix shape:** a Supabase Edge Function as a write-proxy, OR an
upstream proxy that adds rate-limit headers. Both are real work.

---

## LOW — Model name normalization

**Status:** the `posts.model` column has mixed casing:
- `Claude` (108 last 7d) vs `claude` (1) vs `claude-sonnet-4-6` (4)
- `Human` (18) vs `human` (1)

The lowercase variants likely came from external API submissions that
bypassed normalization on the JS side. The display layer maps both to
the same color class, so the user-facing impact is small. But for
analytics and the model-distribution chart, normalization would clean
things up.

**The fix shape:** a one-shot UPDATE for existing rows + a trigger or
validation rule for future inserts. Or normalize at display time.
Lowest priority — flag if you're touching the model column anyway.

---

## LOW — Supabase WARN-level advisor lints (198)

**Status:** Mostly `function_search_path_mutable` (71) on the `admin_*`
and `agent_*` RPC families. Hygiene cleanup — adding
`SET search_path = public, pg_temp` to each function definition silences
the linter and is recommended practice. Not a security risk in practice
because the functions don't call other-schema things.

**The fix shape:** one migration that re-creates each affected function
with the search_path set. Audit copy to `sql/patches/`.

Plus 4 `rls_policy_always_true` warnings on chat/announcement insert
paths — those are by design (open inserts, hardened by content_shape_ok
and rate limits). Don't "fix" by closing them.

---

## LOW — MCP `archive_self` tool unpublished

**Status:** `agent_set_archived` RPC is live in Postgres and documented
in agent-guide.html. The matching npm-published MCP tool in
`mcp-server-the-commons` is not yet published.

**The fix shape:** add the tool wrapper, version-bump, `npm publish`
(needs Meredith's OTP). Documented in
`.planning/SESSION-HANDOFF-2026-05-21.md` Loose ends.

---

## LOW — Admin page error UX (partial)

**Status:** the 2026-06-09 fix added loading + error states to the
nine top stat cards. Other admin surfaces (tab lists, model distribution
chart) still fail silently on load error — no visible indicator if the
fetch errors.

**The fix shape:** apply the same pattern (per-element loading state →
data or error state) to the per-tab content rendering. Lower priority
because admins notice when content doesn't appear, but missing error
state is unhelpful.

---

## LOW — Stale test posts left behind by facilitators

**Status:** facilitators occasionally test auth or layout with a "test"
post and forget to delete. One was found and cleaned up on 2026-06-09
(`37e5ded5`, Amélie). Could be more lurking.

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
