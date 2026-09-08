# Release 3 verification and rollout record

September 8, 2026. Implementation approved in conversation. Branch: `codex/release-3-agent-reading`; planning base `1595303`; implementation commit **`bd3ce00`**.

Status: **locally Verified; not deployed or Observed**. All three approved slices are implemented. This record does not authorize Worker deployment, npm publication, a main push, database access, real token validation, paid model calls or volunteer messaging.

## Delivered

- Shared source URLs, honest page/excerpt metadata, neutral unavailable-item responses and sanitized MCP errors. Composite reads retain an available parent and mark failed child sections.
- Bounded lookahead paging for discussions, voices, postcards, moments, Reading Room and marginalia. Stable timestamp/ID ordering; descending thread selections display chronologically. The output budget reserves metadata and next-call space and advances only over delivered rows.
- Anonymous `search_public_content` and optional literal voice-name lookup. Exactly 13 public tools / 49 stdio tools. Public schemas reject unknown/token arguments and invalid paging consistently. Authenticated tools and token precedence remain unchanged.
- Candidate version 1.10.0 in package, lock root, registry manifest and both server entrypoints. No dependency versions changed. Setup copy handles mixed catalogs; historical Phase 1 evidence remains dated. Candidate changelog entries explicitly say rollout is pending.

Legacy internal array/composite exports remain available. Unverified sampled count properties were removed. `browse_moments` now points callers to `get_moment` for its bounded linked-discussion snapshot, instead of attaching an unpaged join to every browse. Text bodies that exceed the response budget require opening their source. Full voice history remains outside this release.

## Verification

| Check | Result |
|---|---|
| MCP package `npm test` | **30 pass** with fail-closed fetch/socket guards and synthetic upstream fixtures |
| Root `npm run test:discovery` | **16 pass** |
| Root `npm run test:first-visits` | **6 pass**, including 2 checks shared with discovery; 20 unique website checks |
| `npm run check:worker` | Passed; 809.14 KiB uncompressed / 154.99 KiB gzip; no bindings; dry-run only |
| `npm pack --dry-run --json` | Passed; 11 intended source/metadata/doc files; fixture tests, secrets and Wrangler state excluded; no package published |
| Branch diff | `git diff --check` passed; scope reviewed; lockfile changes are only the package and root package versions |
| Source destinations | Local browser post, marginalia and postcard links each highlighted exactly one synthetic contribution, with no fixture runtime errors |
| Responsive copy | Participate, API, Agent Guide and changes at 375/768/1280: no horizontal overflow or fixture runtime errors; mobile candidate changelog visually inspected; viewport restored |

Tests cover empty/one/limit/lookahead pages, final/high offsets, malformed/wildcard totals, equal timestamp tie-breaks, ascending/descending reads, duplicate voice names, punctuation/wildcards, strict validation, no private hosted tools, oversized Unicode bodies, row omission without skips, missing parents, partial failures, sanitized failures, redirects, concurrency and request/response caps. A real stdio child process completed synthetic search → cite → thread → continuation. Existing token precedence is tested using fixture strings only.

Browser QA used `tests/fixtures/discovery_server.py`: synthetic fetch responses, stubbed auth, rejected writes, and a CSP that blocks production connections. Source-link tests exercised existing R1 target handling. No live Supabase query or real token RPC was run. The aggregate `tests/run-all.js` was not invoked.

Five-category QA:

1. **Display:** updated static text fits required widths; no CSS, provider mappings or render functions changed.
2. **Data consistency:** public page/continuation contracts and parent/child handling passed synthetic tests across shared logic and both transports. Real-account and production RLS behavior were not exercised.
3. **Empty/edge states:** empty/final versus failed/unavailable reads stay distinct; long bodies preserve sources and continuation; offsets never advance over omitted rows.
4. **Security:** public reads enumerate columns; Worker remains fixed-origin, GET-only, no-RPC, no redirects, 10-second/1-MiB bounded upstream, 64-KiB request bound. No new credentials, inline scripts or database changes. Public token arguments fail before upstream access. External moment links allow only HTTP(S) in both transports. Community content remains untrusted text.
5. **Navigation:** canonical routes agree with the frontend, including interest slugs and exact contribution query parameters; existing site link/anchor regressions pass. Setup text does not assume an upgraded catalog is live.

## Contract evidence and limits

Local schema evidence: `sql/admin/admin-setup.sql` permits active-or-null posts and marginalia; `sql/schema/06-reading-room-schema.sql` defines texts without an active column; existing clients use true-only discussions, postcards, voices and moments; interests exclude sunset and route by slug. These are repository contracts, not a fresh production schema audit.

The [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) supports the retained text-content result envelope and `isError` for tool execution failures; no structured-only output contract was introduced. The [OpenAI connection guidance](https://developers.openai.com/plugins/deploy/connect-chatgpt) and developer-mode guidance were checked during this release's orientation: custom tool catalogs and anonymous remote reads remain the intended surface; deployed catalog refresh and account/workspace acceptance are separate checks.

[PostgREST URL grammar](https://docs.postgrest.org/en/v13/references/api/url_grammar.html) and [filter operators](https://docs.postgrest.org/en/v14/references/api/tables_views.html) informed literal quoting. LIKE percent/underscore/backslashes are escaped before PostgREST quoting. Because `*` aliases percent in LIKE, a query containing a literal asterisk uses `imatch` with every regex metacharacter escaped. There is no user-provided regex. Fixture tests verify encoding, not an actual PostgREST execution plan or hosted query latency. Verify representative literal searches in the separately approved live smoke; do not infer production performance or free-tier CPU suitability from local tests.

## Release matrix and next gates

| Surface | Baseline evidence | Candidate | State |
|---|---|---|---|
| Source | Planning commit `1595303` | Implementation `bd3ce00` on feature branch | Committed locally; no push |
| npm | Registry reported 1.9.1 during implementation; 48 tools | 1.10.0; 49 tools | Dry-run only; publication unapproved |
| Hosted Worker | Prior pilot catalog: 12; active Worker version ID not retrieved in this build | Code version 1.10.0; 13 public tools | Dry-run only; no new deployed version ID |
| GitHub Pages | Last verified R2 commit `658594b26f054e5ac77c02869f9cc6100db8a953` from prior release; not refreshed here | Candidate copy and changelog | No main push; deployment unapproved |
| Live clients | Prior pilot orientation/discussion evidence belongs to baseline | ChatGPT plus a second remote client | New search/read/paging acceptance pending |

1. Review this candidate and obtain explicit Worker deployment approval. Reconfirm Cloudflare account, zone, target DNS, plan and remaining allowance; capture the exact current known-good Worker version **before** deployment. Record the concrete rollback command for that verified version. Do not use the runbook's failed first-deploy version as an assumed rollback target.
2. From `mcp-server-the-commons`, deploy with `npx wrangler deploy` only after that approval. Record the returned version ID. Verify HTTPS, `/health`, initialize, the exact 13-tool catalog and rejection of private/write tools. With approved public reads, verify one small search/source/read/continuation flow, literal punctuation and voice lookup in ChatGPT and a second client. Capture CPU/failure observations. Stop if allowance or compatibility requires a separate decision.
3. Obtain separate npm publication approval. Recheck version availability and npm identity/auth, finalize candidate wording, and publish only the reviewed version. Registry listing updates, if desired, need their own bounded scope. Rollback is a prior-version pin or corrective release, never overwriting an npm version.
4. Reconcile the matrix with actual deployments and finalize website/changelog wording. Recheck affected pages and obtain explicit main-push approval under `docs/agents/FOR_AGENTS.md`. Verify Pages/CI and exact deployed assets afterward. A website rollback is a separately approved revert/push.

The existing setup text is intentionally valid through mixed-version intervals: users check for `search_public_content` rather than assuming a simultaneous rollout. The 13th tool is not claimed as currently deployed. Do not relabel this release Observed until actual authorized client evidence exists. R4 continuity and later authentication/autonomous publication are not approved by this build.

## Usage

Weekly allowance: **8% used before implementation, 10% after QA** (90% remaining). Displayed change: **2 percentage points**, rounded and account-wide; it is not exact per-task token attribution. Window: 10,080 minutes; reset timestamp 1789435397. No reset credits consumed, model overrides, paid model calls or delegated agents used.
