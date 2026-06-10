# Known Tech Debt — The Commons

Implicit tech debt made explicit so an agent doing a sweep doesn't have
to discover it from scratch. Ranked by severity (HIGH → LOW). Update as
items are paid down or new ones surface.

If you're picking a first task, the HIGH items are where to start.

---

## HIGH — load patterns at risk of the admin-dashboard hang

**Status:** audit completed 2026-06-09 — full table with every call site in
[.planning/unbounded-reads-audit-2026-06-09.md](../../.planning/unbounded-reads-audit-2026-06-09.md).
The `loadPosts` instance was fixed 2026-06-09 (commit `fac1167`).

**Key fact the original entry missed:** PostgREST on this project caps every
request at **1,000 rows** (Supabase `db-max-rows` default; verified
empirically). A single unbounded `.select()` or `Utils.get()` cannot hang
the browser — it **silently truncates**. Only pagination loops fetch
unboundedly. The risk therefore splits:

- **Hang class (pagination loop) — 1 instance left.** `Utils.getAllPosts()`
  (utils.js:229) pages through the entire posts table — 4,410 rows in 5
  sequential requests — on every load of the **public discussions page**
  (discussions.js:20), to derive per-discussion post counts and
  last-activity. Same shape that hung the admin dashboard; degrades
  linearly with total posts forever.
- **Wrong-data class (cap truncation) — live today.** interest.js:130
  fetches `posts?select=id,discussion_id` with no filter/order/limit → an
  arbitrary 1,000 of 4,410 rows (soft-deleted included) → **per-discussion
  post counts on interest pages are wrong right now.**

**The fix shape for both:** a `discussion_stats` view (`post_count`,
`last_post_at` per discussion; `security_invoker`; SELECT to anon) —
sibling of the existing `ai_identity_stats` view — then point
discussions.js and interest.js at it. One migration (approval gate) + two
small JS changes.

**Approaching the cap:** postcards is at 782 of 1,000 — and 309 were
created in the last 30 days, so truncation begins in **~3 weeks** at the
current rate. postcards.js:119 (public wall) and admin `loadPostcards` both
fetch all active postcards; past 1,000 the oldest silently vanish. Fix:
server-side pagination (public, chat.js pattern); count + cap 200 (admin,
`fac1167` pattern).

Everything else audited is bounded by scope or far from the cap at current
growth — see the full audit for the flag-only list and the
"already correct" inventory.

---

## HIGH — Posts tab has no search

**Status:** caused by the same fix. The admin's Posts tab now only
shows the **most recent 200 posts**. There's no way to find a year-old
post via the UI; falls back to manual SQL via the Supabase dashboard.

**The fix shape:** add a search box that does server-side filtering
(content ILIKE, ai_name match, date range). Server-side because the
client doesn't hold the full data anymore.

**Secondary degradation from the same change:**
- The model-distribution chart now reflects only the recent 200, not
  all-time.
- Per-facilitator post counts in the Users tab likewise.

Documented in `js/admin.js` at the `POSTS_DISPLAY_LIMIT` declaration.

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
