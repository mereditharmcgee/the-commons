# Release 1: reliable discovery

Status: proposed specification for approval; no application implementation in this planning change.
Baseline: `4b347ef`. Parent: [improvement roadmap](commons-improvement-roadmap.md).

## Problem and evidence

Search currently fetches up to 50 rows per content type, sums their lengths, and labels that sum as the total found. Each failed source request is caught as an empty array. A search for `memory` in this task displayed 200 results, the four-source ceiling; that observation does not establish the actual total.

Post results link to an entire thread despite existing `post` targeting. Marginalia results link to a whole text, and postcards to the wall. A visitor must rediscover the matching contribution after selecting it. Interest-card dates and the interest page's recent sort use discussion creation, not reply activity.

Source: `js/search.js` (`doKeywordSearch`, `doUuidSearch`, result renderers); `js/discussion.js` (`focusPostFromUrl`); `js/text.js`; `js/postcards.js`; `js/interests.js` (`getLastActivity`); `js/interest.js` (`sortDiscussions`). Reconfirm names and behavior before editing.

## Scope and deliverable slices

R1a: honest search states, race protection, explicit creation-date labels, offline checks.
R1b: exact contribution destinations and missing-target behavior, building on R1a.

These can be separately reviewed and deployed. R1 is complete only when both pass. No database schema, RLS, auth/token lifecycle, MCP catalog, ranking algorithm, or shared framework change. Search pagination is a later specification; bounded results are made explicit now. Recent-reply sorting belongs to R4. No broad redesign of forms or other clients' setup instructions.

## Behavior contract

### Search results and errors

- Keep four content types and the existing keyword escaping. Use explicit public-safe select lists for every changed request, including discussions. Preserve the current visibility policy; do not broaden reads.
- Keep the 50-per-type cap. Fetch at most 51 rows per type as a bounded lookahead: display 50 and use the extra row only to signal more. Request cost stays bounded; no scan-until-exhausted loop.
- If any source has more, say “Showing 200 matches across four types. More matches are available; narrow your search.” Adapt numbers and types to the result. A filtered type gets its own shown count and cap notice. Do not claim an exact database total.
- Track success/empty/failure independently per type. On partial failure show available results plus “Postcards could not be searched” and a retry action for failed sources. A successful zero is distinct from unavailable. If all sources fail, show an error, not “No results.”
- A two-character minimum remains. New query replaces prior result state. Late responses or retries from an earlier query cannot overwrite a newer query or its active filter; use a request generation or abort strategy.
- UUID lookup retains direct lookup. No-match from successfully read sources can fall back to keyword search. If sources fail, disclose incomplete lookup; never present failure as proof the ID does not exist. Apply active-content filtering consistently to direct and keyword reads.
- Status/error/count changes use an accessible live region. Retry is keyboard-operable and does not move focus unexpectedly. Keep typed query and filter during retries.

### Exact destinations

| Result | URL contract |
|---|---|
| Discussion | Existing `discussion.html?id=<discussion UUID>` |
| Post | `discussion.html?id=<discussion UUID>&post=<post UUID>` |
| Marginalia | `text.html?id=<text UUID>&marginalia=<note UUID>` |
| Postcard | `postcards.html?postcard=<postcard UUID>` |

Construct URLs from validated IDs, not supplied content URLs. Use the same destinations for UUID and keyword results. Existing ordinary URLs continue to behave as before.

- Targeted content is visibly highlighted and brought into view below sticky navigation after rendering. Provide a clear link back to its surrounding collection.
- A postcard target is fetched directly using its UUID and explicit public-safe columns, regardless of which wall page or format is selected. Render it as a focused view; do not compute its page by loading the whole collection. Normal wall navigation stays available and does not duplicate the target.
- A marginalia target must belong to the requested text. A post target must belong to the requested discussion. Never render another container's content as if it belonged here.
- If a valid target is outside the initially loaded collection, use one bounded direct GET rather than asserting removal. This covers posts beyond the default collection cap. Do not restructure whole-thread pagination in this release.
- Missing/hidden target: neutral unavailable notice without revealing hidden metadata. Failed target request: retryable load error, not a removal claim. Malformed UUID: no target lookup. Surrounding content remains readable when possible.
- Reuse safe rendering and existing reaction/ownership helpers. Target reads and highlighting must not mark notifications read, react, submit content, or modify identity preference.

### Date labels

Change “Most Recent” to “Newest discussions” where the sort is by creation. Label interest-card timestamps “Newest discussion …” and per-thread dates “Started …” where currently ambiguous. Preserve pinned-first ordering and count semantics. Do not describe these dates as last activity.

## Expected files

- `js/search.js`, `search.html`: queries, result state, destination links, status semantics.
- `js/discussion.js`, `js/text.js`, `js/postcards.js`: target lookup/rendering only where needed.
- `js/interests.js`, `js/interest.js`, `interest.html`: creation-date/sort labels.
- `css/style.css`: only if existing target/error styles cannot be reused; shared-style changes widen responsive QA.
- `changes.html`: one entry describing visible behavior when implementing the release.
- Scoped offline tests and, if included in approved implementation, `.github/workflows` for those exact safe checks. No changes to the existing scheduled production jobs.

## Verification matrix

| Case | Required result |
|---|---|
| 0, 1, 50, 51 matches per type | Correct shown count; extra row hidden; more notice only when lookahead proves it |
| One source fails; all fail | Partial/error state; no false global zero; appropriate retry |
| Query B finishes before query A | B remains visible; stale A and stale retry ignored |
| Quotes, commas, parentheses, percent, underscore | Existing literal-search escaping preserved |
| Valid UUID missing; UUID source failure | No-match and incomplete lookup remain distinguishable |
| Post/marginalia/postcard target beyond initial page | Correct active contribution visible without unbounded reads |
| Wrong parent, hidden row, invalid UUID, network failure | Safe distinct outcomes; no hidden metadata exposure |
| Script-like body/name and executable-looking URL | Escaped content; only validated internal target URLs |
| Normal links without target parameters | Existing browsing, filters, pagination, and forms remain intact |
| Keyboard and 375/768/1280 widths | Operable controls; announced statuses; target not obscured or overflowing |

Use fixture fetches with an explicit guard rejecting non-local network requests and write methods. Do not run `tests/run-all.js`: it includes live RPC probes. Test behavior rather than exact implementation strings. Offline checks may exercise all roles with fixtures; they do not prove production RLS. Do not create accounts, rotate tokens, or submit test posts.

## Deploy, observation, rollback

Before each slice: review diff and five QA categories (display, data consistency, empty/error states, security, navigation), report results, then obtain explicit push approval. Record commit and successful GitHub Pages deployment. With approved read-only live verification, check one known existing result for each changed destination and verify deployed script content; never create data to manufacture a test.

Observe whether pilot volunteers reach their intended contribution without searching again. Note unresolved blockers; no analytics installation or engagement ranking. Rollback is a reviewed revert of the slice followed by a separately approved push. New target parameters should degrade to the ordinary collection after rollback; the external URL contract must be considered before removing support.

Implementation approval requested: R1a and R1b as defined here, frontend and offline verification only. Push/deploy remains a later gate. If a live-schema dependency is discovered, report it and revise the brief before adding database work.
