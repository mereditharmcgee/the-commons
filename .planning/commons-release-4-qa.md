# Release 4: local verification record

September 9, 2026. Implementation approved in conversation. Branch `codex/release-4-continuity`, based on planning commit `dee1419`.

Status: **implemented and locally verified; not pushed, deployed or observed in production.** A separate main-push approval is required. No Worker, npm, database, authenticated RPC, token validation, paid model call, message or schedule was part of this work.

## Delivered

- Interests: recent-reply batches from `discussion_stats`, stable timestamp/ID ordering, 20 consumed rows plus lookahead, one bounded parent lookup, manual continuation, sparse/final/error states and retry without losing the prior batch.
- Discussion: explicit per-post saves, browser-local privacy notice, resume/remove controls and one optional reply-time baseline lookup. Existing exact-target resolution now calls the existing collapsed-ancestor expansion helper before highlighting. Incoming targets remain authoritative; opening a page does not advance a saved position.
- Homepage: five saved places per explicit group, current public titles, manual timestamp comparisons, total local count and management controls, bounded return note and selectable clipboard fallback.
- Isolated `reading-state.js` and `reading-continuity.js`, page markup, scoped CSS, public changelog, offline tests and synthetic browser fixture extension. No edits to shared auth/config/utils, SQL, MCP or notification code.

## Offline checks

| Command | Result |
|---|---|
| `npm run test:continuity` | 12 passed |
| `npm run test:discovery` | 16 passed |
| `npm run test:first-visits` | 6 passed |
| `npm --prefix mcp-server-the-commons test` | 30 passed |
| `git diff --check` | Passed |

64 test executions cover 62 distinct tests because the two static discovery checks also run in first-visits. Test commands load the fail-closed network guard. `tests/run-all.js` was not run.

Storage tests cover exact persisted fields, fake clock, replacement, 20-discussion cap without eviction, unknown/corrupt/oversized/invalid schemas, blocked/quota errors, preservation of unrelated keys, cross-tab clear, and saves completing out of order. API/UI tests cover 0/20/21-row batches, missing/inactive parents, consumed-row offsets, the continuation ceiling, failures retaining prior output/check time, five-item groups, server-time comparisons without unread counts, unavailable parents, bounded source notes, missing/denied clipboard paths and late network/clipboard responses after clear.

## Five QA categories

1. **Display and UI:** local fixture pages for homepage, discussion and interests had no horizontal overflow at 375, 768 and 1280 viewport widths. Client widths were 360, 753 and 1265 after the scrollbar; scroll widths matched. Mobile screenshot inspection confirmed wrapped controls and readable cards. Keyboard Enter saved the nested post; status regions announce outcomes, and removal/continuation controls retain a stable focus target. No new JavaScript errors appeared in fixture reports. Actual assistive-technology testing was not performed.
2. **Data consistency:** one synthetic save appeared on the homepage and resumed the same post. A later server reply timestamp produced the newer-reply message and newest-replies link. Saving used one stats GET; homepage title loading used one parent GET; update checking used two bounded GETs. Recent batches advanced from stats offset 0 to 20 even though only one parent was available. These results establish frontend contracts under fixtures, not live schema/RLS behavior.
3. **Empty and edge states:** missing saved target produced a neutral unavailable notice while retaining the save. A temporary exact-target failure offered Retry; retry highlighted the recovered target. Unit coverage includes unknown baselines, failed briefings, unsupported storage, capacity and stale-response races. Clearing the synthetic save on the homepage removed the resume control in another open tab. An empty homepage offered an explanatory state. With scripts removed, existing first-visit navigation remained usable and the new controls stayed hidden.
4. **Security:** all new data reads explicitly enumerate public fields and use bounded IDs/limits. Titles use textContent; URLs are constructed from validated UUIDs. Save attributes validate IDs and escape timestamps. Browser records contain only IDs/timestamps, with version/count/size validation. No content, credentials, identity or account identifiers are persisted. Existing write/auth controls were left intact; anonymous and signed-in fixture presentations showed the same browser-local scope. No real writes or live role/permission tests were performed.
5. **Navigation:** saved resume links use canonical post IDs; an out-of-initial-collection post resolved through the existing parent-bound exact lookup. The nested fixture opened five collapsed ancestor groups. Missing and retryable targets retained the saved-place controls. Recent links use `sort=newest`; static tests checked internal links and unique IDs across affected pages. Existing directory/first-visit paths remain present.

Browser QA used `tests/fixtures/discovery_server.py` on loopback with injected synthetic public responses, stubbed auth, blocked writes/RPC network requests and a self-only connection CSP. Disposable browser saves were cleared through the UI; viewport override was reset. The browser walkthrough did not access production data.

## Limits and release gate

The timestamp briefing is deliberately narrower than an unread-history audit: edits, deletions, backdated replies and equal-time replies may be missed. Saves belong to one browser, are shared by its users and do not sync to ChatGPT/accounts. Cross-tab synchronization is best-effort, not transactional. Offset pages are a changing view. Failed parent/stats reads are retryable rather than treated as no activity.

Production schema and RLS were not queried; the implementation follows the existing repository's view contract. Pages/CI/deployed asset checks and a voluntary live save/return flow belong to a separately approved deployment/production-read scope. Rollback is an approved frontend revert; it must not silently erase local records.

Weekly account usage was 33% used before implementation and 34% at the end of functional QA (67% to 66% remaining). This rounded account-wide movement is not exact task attribution. Both reset credits remain unused.
