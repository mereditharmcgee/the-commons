# Release 1 verification and usage baseline

Date: 2026-09-07. Branch: `codex/release-1-discovery`. Base planning commit: `c50ce68`.
Status: implemented and locally verified; no push or deployment.

## Delivered

- Four-source search with a 50-result display cap per source, 51-row lookahead, explicit incomplete/unavailable states, failed-source retry, and stale-query protection.
- Validated exact URLs and bounded target reads for posts, marginalia, and postcards. Parent checks, neutral unavailable notices, retryable errors, visible highlights, and links to surrounding collections.
- Creation-date labels, public changelog entry, and a narrow mobile search-input overflow fix.
- Dependency-free offline test command and scoped CI workflow. The workflow has not run on GitHub yet.

## Verification

Run `npm run test:discovery`: 16 tests cover caps, empty/partial/all-failed responses, UUID lookup/fallback, stale searches/retries, filter state, escaping, validated URLs, bounded reads, parent/visibility constraints, static local links/anchors, unique IDs, and script parsing/loading order. A preload blocks fetch and socket connections.

Browser QA used `tests/fixtures/discovery_server.py` at localhost:8878. All Supabase reads were synthetic; auth and notifications were stubbed, mutations rejected, and a restrictive connection CSP blocked production. These checks do not prove production RLS or real account behavior.

| QA category | Result |
|---|---|
| Display | Search, discussion, text, postcards, interest, interests, and changes checked at 375, 768, and 1280 viewport widths. No page overflow after correcting the mobile search input. Target outlines visible; script-like content rendered as text. |
| Data consistency | All three contribution targets fetched outside the initial fixture collection and rendered once. Anonymous/other-user fixtures lacked edit controls; owner fixtures retained them. No mutation controls activated. |
| Empty/error | Missing and failed targets distinct on all three pages. Keyboard retries recovered successfully and retained focus at the notice. Search retry retained query/filter and cleared its error. Offline tests cover successful zero and all-source failure. |
| Security | Target requests bounded to one row, with explicit columns and active/parent filters. IDs validated before destination construction. No injected images, fixture runtime errors, or write requests in the target/role matrix. Existing inline script bodies unchanged. |
| Navigation | Static local links and anchors pass. Postcard All filter leaves focused view, removes target parameter/highlight/notice, and restores wall browsing. Existing collection routes remain available. |

Browser matrix: 21 page/width checks plus 12 target state/role checks, three successful target retry checks, and search retry/wall-return interactions. Viewport emulation restored afterward. No production database queries or changes, real posts, npm publication, Worker deployment, or remote git operations were performed for this implementation.

## Codex allowance baseline

Account usage tool reported weekly allowance **2% used before implementation** and **3% used at verification**, approximately **one percentage point consumed**. Weekly window: 10,080 minutes; reset timestamp: 1789435397. This is a rounded, account-wide measurement, not an exact token bill or isolated task meter. Concurrent tasks can contribute. No reset credits consumed.

Use this release as one observed baseline for a bounded frontend feature with fixtures and browser QA. Do not extrapolate it linearly to authentication, database, or autonomous-agent work; those have different review and integration costs.

## Remaining deployment gate

Review and obtain explicit push approval under `docs/agents/FOR_AGENTS.md`. After an approved deployment, verify the actual Pages commit and existing public destinations with read-only live checks. No production acceptance claim is made here.
