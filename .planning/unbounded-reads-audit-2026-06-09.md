# Unbounded Supabase reads — audit, 2026-06-09

Follow-up to the 2026-06-09 admin `loadPosts` hang fix (commit `fac1167`).
Sweep of every client-side read path in `js/` (supabase-js `.from()` chains,
raw `Utils.get()` REST calls, and the shared `Utils.*` fetch helpers) for
missing bounds. Companion to the HIGH entry in
[docs/agents/KNOWN_TECH_DEBT.md](../docs/agents/KNOWN_TECH_DEBT.md).

**Method:** grepped `\.from\(`, `Utils\.get\(`, `\.(limit|range)\(` across
`js/`; read each call site's params; pulled live row counts via
`pg_stat_user_tables`; verified the server cap empirically with
`GET /rest/v1/posts?select=id` (no limit) using the anon key.

---

## The server cap changes the risk model

PostgREST on this project returns **at most 1,000 rows per request**
(Supabase `db-max-rows` default; verified live — the unbounded posts query
returns exactly 1,000 of 4,410).

Consequences:

- A single unbounded `.select()` / `Utils.get()` **cannot** hang the browser
  by row volume. Only a **pagination loop** can fetch unboundedly.
- The failure mode for single unbounded reads is **silent truncation**:
  client-side counts go wrong, lists quietly lose their tail, nothing errors.
- DOM cost still applies (rendering up to 1,000 cards is sluggish), but the
  hard ceiling is 1,000 rows per request.

So instances are classified: **A** pagination loops (hang class), **B**
truncating today (wrong data live), **C** approaching the cap, **D** bounded
by scope today / flag-only.

## Live row counts (2026-06-09)

posts 4,410 · postcards 782 · ai_identities 368 · discussions 297 ·
chat_messages 275 · marginalia 246 · facilitators 227 · interest_memberships
116 · voice_guestbook 107 · moments 85 · contact 65 · postcard_prompts 50 ·
texts 23 · text_submissions 16 · interests 11.
(notifications 9,355 and agent_activity 32,082 have only bounded reads.)
Largest discussion: 128 posts. Most prolific identity: 217 posts.

---

## A — pagination loop, the hang class (1 instance)

### A1. `Utils.getAllPosts()` — [js/utils.js:229](../js/utils.js), called from [js/discussions.js:20](../js/discussions.js)

A while-loop pulling `id,discussion_id,created_at` in 1,000-row pages until
the table is exhausted — explicitly built to defeat the cap. The **public
discussions list** downloads every post ever written (4,410 rows across 5
sequential requests today) on every page load, to derive per-discussion post
counts and last-activity. Same shape that hung the admin dashboard, minus the
DOM rendering (it only counts), so it degrades by network: load time grows
linearly with total posts, forever. ~1–2s of sequential fetching today; 10k
posts → 10 round-trips.

**Fix shape:** a `discussion_stats` view (`post_count`, `last_post_at` per
discussion; `security_invoker = true`; SELECT granted to anon) — direct
sibling of the existing `ai_identity_stats` view — then switch discussions.js
to one request against it. Migration required (approval gate).

## B — silently wrong today (1 instance)

### B1. [js/interest.js:130](../js/interest.js) (public interest pages)

`Utils.get(posts, { select: 'id,discussion_id' })` — no filter, no order, no
limit. Returns an arbitrary 1,000 of 4,410 rows, including soft-deleted posts
(no `is_active` filter). The per-discussion post counts rendered on interest
pages are derived from at most an arbitrary quarter of the table — **wrong
right now**, not at some future scale.

**Fix shape:** same `discussion_stats` view. (Stopgap without a migration:
scope with `discussion_id=in.(…)` for the interest's discussions and filter
`is_active` — but a busy interest can itself exceed 1,000 posts, so the view
is the real fix.)

## C — approaching the cap at current growth

### C1. [js/postcards.js:119](../js/postcards.js) (public wall)

All active postcards, `select=*`, `order=created_at.desc` — 782 of 1,000
today. When the table crosses 1,000, the **oldest postcards silently vanish**
from the wall (the page has client-side pagination, so users paging back will
just never reach them). ~220 rows of headroom — and **309 postcards were
created in the last 30 days**, so at the current rate truncation begins in
**~3 weeks**.

**Fix shape:** server-side pagination — `limit`/`offset` per page with a
count head-request for total pages, following the chat.js `PAGE_SIZE` pattern.

### C2. `loadPostcards` — [js/admin.js:323](../js/admin.js) (admin)

Same table, same truncation exposure, plus renders all 782 rows into the DOM.

**Fix shape:** the `loadPosts` shape from `fac1167` — count head-request for
the stat card, capped fetch (200) for display, error state.

## D — bounded by scope today; truncates or degrades at scale (flag-only)

| Call site | Table (rows today) | Pattern | Breaks when |
|---|---|---|---|
| [js/discussion.js:169](../js/discussion.js) → `getPosts()` | posts per thread (max 128) | full thread render, `created_at.asc` | thread > 1,000 posts → **newest** posts invisible |
| [js/admin.js:415](../js/admin.js) `fetchData('facilitators'/'ai_identities')` | 227 / 368 | render-all Users tab | > 1,000 rows |
| [js/admin.js](../js/admin.js) :301 :345 :367 :391 :431 :1480 | marginalia 246, discussions 297, contact 65, submissions 16, prompts 50, moments 85 | render-all tabs | > 1,000 rows (truncation, compounds the no-search issue) |
| [js/admin.js:444](../js/admin.js) | postcards `prompt_id` (782) | per-prompt usage counts | > 1,000 → undercounts |
| [js/voices.js:73](../js/voices.js) → `Auth.getAllIdentities()` | ai_identity_stats view (368) | directory render-all | > 1,000 voices |
| [js/submit.js:268](../js/submit.js), [js/interest.js:116](../js/interest.js) | ai_identities (368) | dropdown / lookup map | > 1,000 |
| [js/interests.js:26](../js/interests.js), [js/voices.js:42](../js/voices.js) | memberships 116, discussions 297 | client-side count aggregation | > 1,000 → wrong counts |
| [js/reading-room.js:24](../js/reading-room.js) | marginalia 246 (full rows) | count per text | > 1,000 → wrong counts. **Fix already exists:** `text_shapes.marginalia_count` |
| [js/profile.js](../js/profile.js) :189 :337 :367 :428 :506 :568 :607 :887 :1110 | per-identity content (max 217) | full per-voice feeds, render-all | a single voice > 1,000 items |
| [js/dashboard.js:1347](../js/dashboard.js) | per-identity ids | reaction-count aggregation | same |
| [js/news.js:27](../js/news.js) | moment_comments | **N+1**: one request per moment (85 requests/load today) | request count grows with moments |
| `Utils.getRecentPosts(24)` ([js/utils.js:258](../js/utils.js)) | posts last 24h | copy-context | > 1,000 posts/day |
| `Utils.getDiscussions()` ([js/utils.js:192](../js/utils.js)) — discussions.js, profile.js ×4, submit.js | discussions (297) | list render / title lookup | > 1,000 discussions |
| `Utils.getTexts()` ([js/utils.js:326](../js/utils.js)) — reading-room, profile.js ×2 | texts (23) | `select=*` pulls **full text content** even where only id/title is used (profile.js title lookups) | payload waste, not rows |

## Already correct (don't re-audit)

- chat.js — `PAGE_SIZE` + `created_at=lt.` cursor pagination
- search.js — `limit: 50` + ilike on every branch
- home.js feed — limits 60/30/20/40 + `gte.` time windows; `in.()`-scoped lookups
- auth.js `getNotifications` — `.range()` with default 20
- agent-admin.js activity logs — `.range()` with default 50 (agent_activity is 32k rows; this is why it's safe)
- admin.js `loadPosts` — count + cap 200 (the `fac1167` fix)
- All `id=in.(…)` lookups — bounded by the input list

## Suggested order

1. **`discussion_stats` view + switch discussions.js and interest.js to it.**
   Kills A1 (the last pagination loop) and B1 (the live wrong-counts bug) with
   one migration + two small JS changes.
2. **Postcards** (C1 public pagination, C2 admin cap) before the table crosses
   1,000 — at the May–June rate (~310/month) that's **~3 weeks away**, so this
   arguably outranks everything else for user-visible impact.
3. **D items** — fix opportunistically when touching those files; none urgent.
