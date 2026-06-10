# Audit follow-ups: discussion_stats view + postcards pagination — design

**Date:** 2026-06-10
**Status:** approved in-session (design walkthrough with Meredith); implementation pending
**Origin:** [.planning/unbounded-reads-audit-2026-06-09.md](../../../.planning/unbounded-reads-audit-2026-06-09.md)
findings A1 (the `Utils.getAllPosts()` pagination loop on the public
discussions page), B1 (interest pages derive counts from an arbitrary 1,000
of 4,400+ posts, soft-deleted included), C1 (public postcards wall at 790 of
the 1,000-row PostgREST cap, ~310 new/month), and C2 (admin loadPostcards,
same exposure).

Two parts, one combined push. Part A requires a migration (Meredith's
apply gate); Part B is frontend-only.

---

## Part A — `discussion_stats` view

### The view (migration)

```sql
CREATE VIEW public.discussion_stats
WITH (security_invoker = true) AS
SELECT
    p.discussion_id,
    count(*)          AS post_count,
    max(p.created_at) AS last_post_at
FROM public.posts p
WHERE p.is_active IS DISTINCT FROM false
  AND p.discussion_id IS NOT NULL
GROUP BY p.discussion_id;

GRANT SELECT ON public.discussion_stats TO anon, authenticated;
```

- **Semantics:** `is_active IS DISTINCT FROM false` = the site-wide
  "visible" definition (true or legacy NULL). Today zero NULL-`is_active`
  posts exist (backfilled), so this equals `is_active = true` — the filter
  is defensive. 28 posts with NULL `discussion_id` are excluded; they were
  never attributed to a discussion in the current UI either.
- **Per-role consistency:** `security_invoker` applies the querier's posts
  RLS underneath. Anon RLS (active-or-null) intersected with the view filter
  is the same set; admin (`is_admin() OR is_active = true`) and owner
  (`auth.uid() = facilitator_id`) policies see supersets that the view
  filter pins back down. Every role gets identical, visible-only counts.
- **`last_post_at`** is included per the audit fix shape: one `max()`, and
  it makes a future "sort by activity" need no migration. No consumer reads
  it yet; that is acceptable and deliberate.
- **Performance:** GROUP BY over ~4.4k rows using existing
  `idx_posts_discussion`; row count of the view ≈ discussions with posts
  (≈300). Single request, far under the 1,000-row response cap until the
  site has 1,000 discussions.
- **Discussions with zero posts** don't appear in the view; consumers
  default missing ids to 0 (both already do: `postCounts[d.id] || 0`).
- **Migration mechanics:** applied via `mcp__supabase__apply_migration`
  ONLY after Meredith says "apply"; audit copy saved to
  `sql/patches/discussion-stats-view.sql` with the standard what/why/risk/
  date header referencing the audit doc.

### Consumers

- **`js/config.js`:** add `discussion_stats: '/rest/v1/discussion_stats'`
  to `CONFIG.api`.
- **`js/discussions.js`** (line ~20): replace `Utils.getAllPosts()` in the
  `Promise.all` with `Utils.get(CONFIG.api.discussion_stats)`; replace the
  per-post counting loop with a map-build over view rows
  (`postCounts[row.discussion_id] = Number(row.post_count)`). Failure
  stays fatal-to-page exactly as the current posts fetch is (no `.catch`),
  preserving error behavior. **Counts rendered on discussions.html are
  byte-identical to today's** (same visible-posts definition).
- **`js/interest.js`** (line ~130): replace
  `Utils.get(CONFIG.api.posts, { select: 'id,discussion_id' })` in the
  `Promise.all` with
  `Utils.get(CONFIG.api.discussion_stats, { select: 'discussion_id,post_count' })`;
  replace the counting loop (~line 217) with the same map-build. The
  'popular' sort consumes the corrected map unchanged. **Counts on interest
  pages will visibly change — from wrong (arbitrary-1,000-sample, including
  soft-deleted) to correct.** That correction is the point and gets the
  changelog entry.
- **`js/utils.js`:** DELETE `getAllPosts()` after the swap. It will have
  zero callers (verified by grep before deletion) and is the last
  pagination-loop footgun in the shared utils; leaving it invites reuse.

---

## Part B — postcards server-side pagination

### Shared helper

**`Utils.getCount(endpoint, params)`** in `js/utils.js` (additive; no
existing function changes): issues the same URL-construction as
`Utils.get` but with `method: 'HEAD'` and a `Prefer: 'count=exact'`
header; parses the `Content-Range` response header
(`"0-19/790"` → `790`; `"*/0"` → `0`).
Returns a number, or `null` if the header is missing/unparseable —
callers treat `null` as "total unknown" and degrade (see below).

### Public page (`js/postcards.js`)

- **State:** `currentPage`, `currentFilter` (exists), plus new
  `totalCount`. `PAGE_SIZE` stays **20**; `postcards` holds only the
  current page.
- **`loadPostcards(page)`** becomes fetch-one-page:
  `is_active=eq.true`, `order=created_at.desc`, `limit=PAGE_SIZE`,
  `offset=(page-1)*PAGE_SIZE`, plus `format=eq.<filter>` when
  `currentFilter !== 'all'`.
- **Count:** fetched via `Utils.getCount` with the same filters **once per
  filter change** (and once at initial load), not on every page flip.
  Owner deletes refetch both the page and the count (total changed).
  If count returns `null`, show `Page ${currentPage}` without "of Y" and
  disable Next only when a page returns fewer than PAGE_SIZE rows.
- **Filter buttons:** switch filter → `currentPage = 1`, recount, refetch.
  `getFiltered()` is removed (server filters now).
- **Pagination controls:** same elements (`postcards-prev`,
  `postcards-next`, `postcards-page-info`); `totalPages =
  Math.ceil(totalCount / PAGE_SIZE)`; clamp `currentPage` and refetch if a
  delete leaves it past the end. Empty result (e.g. a format with no
  cards): existing `showEmpty` text, pagination hidden — unchanged.
- **Unchanged:** per-page reaction fetching (already keyed to visible
  ids), card markup, owner edit/delete actions (they re-run
  `loadPostcards(currentPage)` + recount), the prompt box, submission flow.

### Admin (`js/admin.js`)

`loadPostcards` gets the `fac1167` pattern:
- `POSTCARDS_DISPLAY_LIMIT = 200` alongside the posts constant.
- Count head-request (`select('id', { count: 'exact', head: true })`)
  drives `stat-postcards` and the tab count; error → `setStatError`.
- Display fetch capped: `order created_at desc, limit 200`.
- `updateStats()` stops setting `stat-postcards` from `postcards.length`
  (same exemption and comment treatment as stat-posts/stat-claimed).
  `hidePostcard`/`restorePostcard` already re-run `loadPostcards()`, which
  recounts — no further changes there.

**Out of scope, deliberate:** admin postcards search (extend the Posts
console pattern later if wanted); the prompt-usage counter at admin.js:444
(audit class D, documented); per-thread `getPosts` on discussion.html
(class D); any consumer of `last_post_at` (future).

---

## Verification & QA (pre-push)

1. **View correctness (after apply):** REST `discussion_stats` totals vs
   SQL `GROUP BY` over posts — exact match per discussion id; spot-check
   3 discussion ids including the largest (128 posts).
2. **discussions.html parity:** per-card response counts before/after the
   swap are identical (sample comparison vs SQL), one network request to
   the view replaces the 5-request pagination loop.
3. **interest.html correction:** per-discussion counts equal SQL
   visible-posts counts (they don't today — capture one wrong-before
   example as evidence).
4. **Postcards:** page 1/2/last render 20/20/remainder; "Page X of Y"
   matches `ceil(total/20)` with totals vs SQL per format filter; filter
   switch resets to page 1; prev/next disabled states at bounds; reactions
   render per page; console/network clean.
5. **Admin postcards tab:** stat card = true total via count; list shows
   newest 200; tab count = total.
6. **Standard sweep:** browser console zero errors, no failed requests,
   mobile/desktop layout unchanged (no visual changes intended).
7. **Changelog:** one `changes.html` entry covering the interest-page count
   correction (postcards pagination folded in — invisible if done right).

Push only after QA results are surfaced and Meredith says "push."
