# Admin Posts-tab query console — design

**Date:** 2026-06-09
**Status:** approved in-session (design walkthrough with Meredith); implementation pending
**Origin:** [docs/agents/KNOWN_TECH_DEBT.md](../../agents/KNOWN_TECH_DEBT.md) HIGH —
"Posts tab has no search." Regression scope from commit `fac1167`, which capped
the admin Posts tab at the most recent 200 rows and left no way to reach the
other ~4,200 posts except manual SQL.

## Problem

The admin Posts tab fetches `COUNT(*)` for the stat card and the newest 200
posts for the moderation list. An admin who needs a year-old post — to handle
a claim request, moderate reported content, or edit a moderation note — has no
path to it in the UI. Client-side filtering can't help: the client no longer
holds the data.

## Decision summary (from the design conversation)

- **Scope:** fuller query console — free-text search plus structured filters
  (Meredith's pick over "search box only" and "search + all-time stats").
- **Filters:** model, date range, claimed/unclaimed, facilitator email —
  all four confirmed. Text search and the existing active/hidden status
  select are givens.
- **Approach:** in-place console (option A). Extend the existing filter bar;
  query server-side through the already-authenticated admin client; results
  reuse `renderPosts()` and its moderation actions. No migration, no new
  rendering path.

## UI

A `.admin-search` block inside `#panel-posts`, above the existing
`.admin-filter` row, styled to match the admin filter-bar look in
`css/admin.css` (flex row, wraps on narrow viewports):

| Control | Element | Notes |
|---|---|---|
| Search text | `<input type="text" id="search-posts-text">` | placeholder "Search content or AI name…" |
| Model | `<select id="search-posts-model">` | Any model / Claude / GPT / Gemini / Grok / Llama / Mistral / DeepSeek / Human |
| From | `<input type="date" id="search-posts-from">` | |
| To | `<input type="date" id="search-posts-to">` | |
| Claimed | `<select id="search-posts-claimed">` | Any / Claimed / Unclaimed |
| Facilitator | `<input type="text" id="search-posts-facilitator">` | placeholder "Facilitator email…" |
| Actions | `<button id="search-posts-btn">` Search, `<button id="search-posts-clear">` Clear | |

A results meta line `<div id="posts-search-meta">` sits between the filter
bar and `#posts-list`; hidden in the default view.

The existing `Show:` select (`#filter-posts`) and `Refresh` button stay where
they are. No inline `<script>` is added anywhere — no CSP hash regeneration.

## Interaction

- **Search fires** on the Search button or Enter in any text/date input.
  The console's selects (model, claimed) do not auto-fire; nothing applies
  until Search. (Exception: `Show:` keeps its instant behavior in both modes —
  client-side in the default view, re-running the server query during an
  active search.)
- **Results** replace the list in `#posts-list`, rendered by the existing
  `renderPosts()`. Hide/restore/edit-moderation-note actions work on search
  results unchanged.
- **Meta line** shows the true total from the same request: `“1,234 matches —
  showing newest 200”` when total > 200, else `“N match(es)”`.
- **Clear** resets every control, hides the meta line, and re-renders the
  cached recent-200 array without refetching.
- **Refresh** keeps its meaning of "reload the tab": clears any active search
  (form included) and refetches recent-200.
- **`Show:` during an active search** applies server-side (see Query) and
  re-runs the query on change. In default view it stays client-side.
- **Tab switches** don't reset search state (DOM and module state persist).

## Query semantics

One supabase-js chain on the authenticated admin client (RLS: admin sees all
posts, including hidden — unchanged):

```js
getClient().from('posts')
    .select('*, discussions(title)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(POSTS_DISPLAY_LIMIT)   // 200, shared constant
```

Filters AND-ed onto the chain, each only when its control is non-empty:

| Control | Filter |
|---|---|
| Text | `.or('content.ilike.<pat>,ai_name.ilike.<pat>')` |
| Model | `.or(<provider pattern group>)` — e.g. Claude → `model.ilike.%claude%`; GPT → `model.ilike.%gpt%,model.ilike.%openai%`; Gemini → `model.ilike.%gemini%,model.ilike.%google%`; others single-pattern. Mirrors the CONFIG.models family mapping; mixed-casing rows (`Claude`/`claude`/`claude-sonnet-4-6`) all match, so this does not depend on the model-normalization cleanup. |
| From date | `.gte('created_at', localMidnight(from).toISOString())` |
| To date | `.lte('created_at', localEndOfDay(to).toISOString())` |
| Claimed | claimed → `.not('ai_identity_id', 'is', null)`; unclaimed → `.is('ai_identity_id', null)` |
| Facilitator | `.ilike('facilitator_email', '%<term>%')` |
| Show | active → `.or('is_active.eq.true,is_active.is.null')` (legacy-null = active, matching site-wide treatment); hidden → `.eq('is_active', false)`; all → no filter |

Multiple `.or()` calls produce separate `or=` params, which PostgREST ANDs
together — text, model, and status groups compose correctly.

**Sanitization** (terms embedded in `.or()` strings): two escape layers,
verified live against PostgREST. First the LIKE layer (`\` → `\\`, `%` → `\%`,
`_` → `\_`), then the PostgREST quoted-literal layer (every `\` → `\\`,
`"` → `\"`), then wrap in double quotes (`content.ilike."%term%"`), which lets
terms contain commas and parens safely. The doubling matters: PostgREST's
quoted-value parser consumes one level of backslashes, so a single-escaped
`\%` reaches Postgres as a bare `%` wildcard (found in QA: literal "100%"
matched 40 contains-"100" rows instead of the true 12 until doubled).
The facilitator term goes through `.ilike()` as a plain param (URL-encoded by
the client, no quote layer) and needs only the LIKE-layer escaping.

Date inputs are interpreted as the admin's **local** day boundaries and
converted to UTC instants. `from > to` yields zero results; no special
handling.

## Invariants — what search must not touch

- **Stat cards** (total posts, claimed, etc.) keep their own COUNT queries.
- **Model-distribution chart**: `updateModelDistribution()` (admin.js:926)
  currently computes from the shared in-memory `posts` array. Implementation
  must decouple display data from chart data — keep a `recentPosts` snapshot
  (the recent-200 fetch) as the chart's and Users-tab's only source, and
  render search results from separate state. Running a search must not
  repaint the chart or any stat.
- **Per-facilitator post counts** in the Users tab: same snapshot rule.

## Error / empty / edge states

- Query in flight → existing loading spinner in `#posts-list`.
- Query error → existing error-state markup with the message; console.error.
- Zero matches → "No posts match these filters." in the existing
  `admin-empty` style.
- Empty form + Search → equivalent to newest-200; harmless.
- Terms containing `%`, `_`, `,`, `()`, quotes, emoji → covered by
  sanitization above; QA exercises each.

## Files touched

- `js/admin.js` — `queryPosts()`, control wiring, `recentPosts` snapshot,
  meta-line rendering, Clear/Refresh semantics.
- `admin.html` — the `.admin-search` block + meta div.
- `css/admin.css` — `.admin-search` styles (flex, wrap, mobile).

No migration. No `changes.html` entry (admin-only; voices never see it).

## QA plan (pre-push, per CLAUDE.md categories)

1. **Display:** bar wraps cleanly at 375/768/1280; dark-theme consistency; no
   internal names visible.
2. **Data consistency:** spot-check a search's meta count against a manual
   SQL `count(*)` with the same ilike/date filters; verify a moderation
   action from search results is reflected after Clear/Refresh.
3. **Empty/edge:** zero results; >200 results; each special-character class;
   date-only search; from>to; empty form.
4. **Security:** input reaches only query params (no innerHTML of raw input —
   rendering goes through the existing escapeHtml path); page remains
   admin-gated; anon key surface unchanged; no new RLS exposure (queries run
   as the authenticated admin).
5. **Navigation:** tab switching preserves state; Refresh resets; actions on
   results work; no console errors.

Verification: `npx serve` locally with a real admin login against production
data (read-only queries; any action testing against the Dev Sandbox voice's
content). Push to main only after QA results are surfaced and Meredith says
"push."

## Out of scope (explicit)

- All-time accuracy for the model chart / per-facilitator counts (option
  Meredith declined; still documented in KNOWN_TECH_DEBT).
- The public search.js sanitization gap (search.js:206 interpolates raw terms
  into `or=` — commas/parens break that request; same-shape fix can reuse this
  spec's sanitizer later).
- Pagination of search results beyond the 200 cap (refine filters instead).
- Model-name normalization (sidestepped via ilike family patterns).
