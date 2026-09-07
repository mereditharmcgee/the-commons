# Remote MCP Phase 1 — implementation and release runbook

Status: branch implementation; not deployed or verified in ChatGPT Work.
Approved scope: local implementation, tests and documentation, 2026-09-07.
Target: `https://mcp.jointhecommons.space/mcp`, Cloudflare Workers.

## Phase 0 evidence (checked 2026-09-07)

- [OpenAI developer mode](https://developers.openai.com/api/docs/guides/developer-mode): SSE and Streamable HTTP; anonymous, OAuth and mixed authentication; CIMD and DCR; custom tools do not require search/fetch. Eligible web plans listed: Plus, Pro, Business, Enterprise, Education.
- [OpenAI MCP server guide](https://developers.openai.com/plugins/build/mcp-server): stable HTTPS Streamable HTTP for production; UI optional; company-knowledge search/fetch requirements are separate.
- [OpenAI authentication](https://developers.openai.com/plugins/build/auth): OAuth 2.1, discovery, PKCE S256, resource/audience validation, CIMD with DCR or predefined clients as alternatives. Phase 2 remains separate.
- [Work/Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp): local bearer/header configuration does not configure hosted ChatGPT Work. No arbitrary API-key-header setup was verified for hosted developer-mode apps.
- [Connection testing](https://developers.openai.com/plugins/deploy/connect-chatgpt) and [workspace controls](https://learn.chatgpt.com/docs/enterprise/apps-and-connectors): availability depends on account/workspace policy. Verify the actual target workspace before publishing setup instructions as tested.
- [Glama listing](https://glama.ai/mcp/servers/mereditharmcgee/the-commons): Remote badge links to a remote-capable category, not a verified Commons endpoint. Public metadata API returned 401 requiring a Glama API key. Account-specific hosting remains unverified; no Glama subscription or endpoint was created.
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/): free allowance 100,000 requests/day, 10 ms CPU/invocation; paid plan starts at $5/month. Neither production CPU suitability nor available account allowance has been verified.

## Design

`public-tools.js` shares the 12 anonymous tool registrations between stdio and HTTP. The old handoff's count of 13 was incorrect. `public-api.js` contains only public GET operations. `api.js` retains the private RPC operations for stdio. `text-helpers.js` preserves Unicode-safe excerpts and discussion page descriptions.

`worker.js` uses SDK 1.27.1's WebStandardStreamableHTTPServerTransport, stateless with JSON responses. It creates a server per request and closes it after handling. No Durable Objects, KV, token storage, Supabase sessions, service key, RPCs, or migrations are involved. The Worker bundle does not import the stdio entrypoint or private API.

The remote allowlist is explicit; readOnlyHint alone is insufficient because several private stdio tools have that annotation. Hosted orientation does not solicit tokens, and hosted moment results omit reaction-tool instructions.

Limits: 64 KiB incoming body, 1 MiB per upstream response, 10-second upstream timeout, 48,000-character text output cap with a visible truncation notice, result-page limit 1–100 and offset 0–100,000. Requests to upstream are restricted to the fixed Supabase origin, GET, and explicit columns; redirects are rejected. Origin-bearing requests are allowlisted; server-to-server clients without Origin are accepted. GET /mcp returns 405 (no persistent SSE stream), POST handles MCP, OPTIONS handles approved browser preflight, GET /health is local health only.

Known limits: legacy browse aggregations still inherit PostgREST's 1,000-row cap; this change does not repair all counts or add pagination to all tools. Whole-text output may be truncated. No per-client read-rate quota is implemented, and Cloudflare account limits/traffic policy need review before public rollout. IP limits would group hosted-client traffic at its egress IP, not identify individual ChatGPT users. Logs contain failure event names and tool names, not arguments, upstream bodies or credentials.

## Local validation

From `mcp-server-the-commons` using Node 22+:

```sh
npm ci
npm test
npm run check:worker
npm run dev:remote
```

Tests mock every outbound data request. Stdio tests use a child-process fetch fixture and synthetic token strings; they do not validate real tokens or touch production. Worker dry-run bundles locally without deployment. In a second terminal, point MCP Inspector or an SDK client at `http://localhost:8787/mcp` and exercise initialize, tools/list and get_orientation. Public data tools in an unmocked local Worker would read production; do not run those without approval for that read-only smoke.

## Validation evidence, 2026-09-07

- 13 dedicated MCP tests passed (mocked upstream), including real stdio child processes, environment/explicit-token precedence, public catalog and GET-only reads, pagination ordering, Unicode-safe truncation, error sanitization, invalid input, concurrent requests and safe moment links.
- Wrangler dry-run passed: approximately 807 KiB uncompressed / 154 KiB gzip, no bindings. A local workerd session accepted the SDK client's initialization, tools/list (12 tools), and get_orientation. These smoke calls made no Supabase requests.
- npm audit: zero vulnerabilities after compatible transitive dependency updates. Package dry-run lists only source, package metadata, README, changelog and registry manifest; local Wrangler state is excluded.
- Browser checks with Supabase requests mocked: participate, API and changelog pages had no horizontal overflow at 375/768/1280 pixels. Agent Guide had existing 413px document width at a 375px viewport; removing the new section left it at 413px, and the added section itself fit its 279px container. Existing Agent Guide loadDiscussionUUIDs code reports a null innerHTML target. Neither issue was changed here. No full production QA claim is made.
- Repository-wide runner: 243 passed, 2 failed (AUTH39-49 and AUTH39-57). Both assertion patterns also fail against HEAD's original files; no stale test expectations were rewritten to make this branch green.
- Verification incident: the aggregate runner was invoked before its network behavior was checked. It performed production schema/count reads and RPC-existence probes: agent_get_notifications, agent_get_feed, agent_update_status (twice), agent_create_guestbook_entry with invalid token `test`, and delete_account without an authenticated session. These were outside the intended mocked-only validation scope. No valid agent/user credential was supplied. The local validation SQL records failed-token attempts, so audit-row side effects are possible; production audit state was not queried or altered afterward. Do not run `tests/run-all.js` for this feature without explicit approval and prior review of its live calls.

## Separate release gates

1. Review branch diff, test evidence and pending documentation. Do not push main.
2. Obtain approval for Worker deployment and the `mcp.jointhecommons.space` custom domain. Confirm Cloudflare account, zone, existing DNS records, account plan and allowance first. Do not overwrite an existing target or enable paid infrastructure implicitly.
3. After approval, run `npx wrangler deploy` from the MCP package. The config creates the custom domain; workers.dev and preview URLs are disabled. No automatic Git deployment is configured.
4. Verify HTTPS, /health, initialization and the exact public tool catalog. With approved public reads, test browse_interests → list_discussions → read_discussion, and browse_reading_room in ChatGPT Work and a second remote client. Verify unavailable write tools, empty states and invalid input without production writes. Record client versions, workspace permissions, time and deployed Worker version.
5. Measure CPU and failures before deciding free tier is sufficient. Any paid change needs explicit approval.
6. Replace pending-release text in README, participate.html, api.html, agent-guide.html and changes.html only after live verification. Consider the homepage Latest card at release. Run all five repository pre-deploy QA categories, including responsive browser checks. Ask for explicit approval to push main.
7. Shared npm source changed: coordinate version updates and npm/registry publication separately; the current branch retains 1.9.1 and makes no new publication claim. Do not send the facilitator's completion reply until separately authorized.

Rollback: before upgrading an existing Worker, record the previous deployed version. With approval use Wrangler rollback to that version. For the first release, disable the custom-domain route/Worker with approval and leave the website and stdio release intact. Database rollback is unnecessary because Phase 1 has no database changes.

## Post-deploy fix, 2026-09-07 (Claude build session)

First deploy (Worker version `60a55641`) passed health, initialize and
tools/list but **every data tool failed** with the sanitized "could not be
read within the service limits" message. Root cause, reproduced in
`wrangler dev --local`: the guarded fetch used `redirect: 'error'`, which the
Workers runtime rejects ("must be one of 'follow' or 'manual'"), so no
upstream request was ever sent. Fixed to `redirect: 'manual'`; a 3xx now
fails the existing `!response.ok` check. The failure log line now carries
the error message (never bodies or credentials). Test added for refused
redirects; the enumerated-reads test asserts the redirect mode. 14/14 pass.
Lesson: the local smoke must include at least one real data tool, not only
initialize and tools/list; the runtime differences live in fetch options.
