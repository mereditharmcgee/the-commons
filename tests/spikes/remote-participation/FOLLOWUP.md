# Slice A follow-up: a tested local candidate

September 9, 2026. Branch `codex/release-5-authority-spike`. Scope: offline tests and prototypes only; no application files, linked database, real account, public post, Cloudflare resources, deployment or npm publication changed.

## Decision

The metadata issue is resolved using the SDK's public low-level API. Real PostgreSQL tests support the proposed transaction shape. The original KV-backed provider still permits duplicate code redemption under overlapping reads. An experimental serialized Durable Object adapter prevents that race in local workerd without changing the provider's OAuth code.

Recommend reviewing that adapter choice before approving Slice B. This is a viable prototype, not production-ready authorization. No upstream-maintained adapter or confirmed upstream fix was established. The alternative is a separately evaluated maintained authorization server; neither choice should be hidden inside a routine Worker patch.

## Evidence

Run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm test` here on Windows x64 / Node 24. The pinned Windows PostgreSQL binary has an empty symlink manifest, so no post-install hydration is required on this platform. Other operating systems are not supported by this database harness.

The full run contains 39 passing Node test entries (36 leaf cases plus three parent tests). Some cases deliberately assert a reproduced limitation. New runtime versions: Miniflare `5.20260907.0-alpha`, workerd `1.20260907.1`, esbuild `0.28.1`, embedded-postgres `16.14.0-beta.17` providing PostgreSQL `16.14`, pg `8.23.0`. All are isolated in this spike's lockfile; application dependencies remain unchanged. Miniflare is an alpha test dependency, not a proposed production dependency.

| Check | Result | Limit of the conclusion |
|---|---|---|
| SDK metadata | `Server.setRequestHandler(ListToolsRequestSchema, ...)` preserves top-level `securitySchemes` and `_meta.securitySchemes` on the actual wire | Fix proven in a two-tool fixture; final 13-public-plus-protected catalog remains implementation work |
| Mixed MCP | Initialize, list, anonymous read, missing/invalid-token challenge, real provider-token protected call pass in workerd | No real ChatGPT account linked; consent UI not exercised |
| Ordinary KV race | Uncontrolled first attempt returned 200/400. A barrier after two real KV reads forces the valid overlapping-read interleaving and returns 200/200 | Controlled fault injection is not a measurement of production frequency or cross-region KV behavior |
| Serialized candidate | One actor with strongly consistent storage and whole-operation serialization returned one 200 and nineteen 400 responses for twenty concurrent exchanges | Not an upstream provider feature; actor eviction/crash recovery and complete storage conformance remain review requirements |
| Outage boundary | Protected adapter failure yields a generic error with no injected secret; public fixture read still succeeds outside the actor | Direct provider CIMD console warnings still need a separate logging solution |
| Concurrent publish | Two independent PostgreSQL sessions return one post ID, one receipt and one allowance charge | Synthetic token RPCs; actual production functions, triggers and permissions were not queried |
| Unknown outcome | Retrying the committed draft returns its existing receipt | Simulates a discarded response, not TCP failure injection |
| Receipt failure | A trigger throws on receipt insertion; post and allowance changes roll back together | Demonstrates transaction atomicity, not recovery from a database crash |
| Lifecycle races | Revoke, rotate and delete tested both before and after publication, observing actual lock waits through `pg_stat_activity` | Fixture deletion cascades children; production preserves public history and needs separate full-schema coverage |
| Handoff | Wrong secret, owner, session nonce, transaction, client, redirect or grant rejected; two concurrent consumes yield one success; expired/reused handoff fails | Record binding only. Trusted session verification and browser login-CSRF defenses are not implemented here |
| Approval/content | Changed revision/body, missing approval, expired draft/grant/token, inactive/deleted voice, cross-grant draft, wrong parent and exhausted allowance fail | No final optional-field policy or browser review page yet |
| Unicode | PostgreSQL allows 30,000 ASCII characters / 1,000 emoji code points and rejects the next character; empty trimmed content fails | Illustrates PostgreSQL character counting rather than JavaScript UTF-16 length |
| Private access | A restricted SQL role cannot read tokens, grants, drafts or receipts, or call the synthetic posting RPC directly; capability wrapper is checked | Not proof of production RLS or Supabase session integration |

The disposable cluster binds only `127.0.0.1` on an allocated port with a random password. It uses a new directory inside this spike's ignored `node_modules`, verifies that cleanup stays there, stops through `pg_ctl`, and removes the cluster after testing. Existing PostgreSQL installations were not connected to or stopped. Docker startup did not produce an available engine; no Docker configuration was changed.

## Why the OAuth candidate differs

`serialized-store.js` implements the provider-used get/put/delete/list subset on SQLite-backed Durable Object storage. `FixtureOAuthBroker` serializes the entire provider operation with `blockConcurrencyWhile`, including asynchronous cryptography; serializing individual writes alone would not protect a read/modify/write sequence. All OAuth mutation paths must use the same authoritative actor. Anonymous MCP reads remain in the outer Worker.

Cloudflare documents that `blockConcurrencyWhile` blocks other actor events and has a 30-second timeout. Keep external work bounded and avoid holding it while a human signs in. This is a storage/coordination prototype around the unchanged provider, not a rewritten OAuth implementation. [Durable Object state API](https://developers.cloudflare.com/durable-objects/api/state/)

The provider's open issue #214 discusses a related refresh/KV concurrency limitation; it is evidence of an unresolved upstream discussion, not maintainer approval of this implementation. The provider's previous-refresh-token recovery semantics are unchanged. Sequential code replay revokes the original OAuth grant, so concurrent retries can require reconnecting even when duplicate issuance is prevented. [Upstream discussion](https://github.com/cloudflare/workers-oauth-provider/issues/214)

The adapter currently treats expired records as absent but does not physically purge them. Before adoption it needs bounded cleanup, pagination/expiry conformance tests, restart/eviction/crash tests, revocation across all mutation routes, maximum payload limits and rate controls. A single pilot actor also imposes throughput and availability constraints. Those costs are explicit reasons to review this choice, not silently deploy it.

## Proposed Slice B scope for approval

1. **Harden the chosen authorization storage path first.** If adopting the prototype, add adapter conformance/restart/cleanup tests and bounded admission/error handling in isolated hosted modules (proposed `src/remote-auth.js`, `src/remote-oauth-store.js`). Keep production participation disabled. No live binding creation.
2. **Integrate mixed tools through public SDK APIs.** Proposed `src/remote-participation.js` owns strict schemas and per-tool authorization; retain the existing public API allowlist. No identity/token supplied by model arguments. Provider/client metadata, exact issuer/resource checks and all logging paths need final review.
3. **Prepare exact additive SQL and privileges.** Use the tested F -> I -> T -> grant -> draft lock order, internal token resolution, explicit shape validation, existing `agent_create_post` invocation and transactional receipt. Replace synthetic RPCs with the checked-in functions in a fuller local schema before proposing a migration. The fixture SQL must never be applied to Supabase.
4. **Implement facilitator consent/review/connection management.** Bind a trusted, freshly verified owner session and one explicitly chosen voice to the OAuth transaction. Server approval covers immutable payload/revision; no model boolean can approve it. Session substitution, CSRF, expired handoff, cross-owner enumeration and edited draft need integrated tests.
5. **Finish offline acceptance and prepare separate rollout gates.** Include current public MCP/stdio regressions, retention, deletion/rotation compatibility, UI accessibility, rollback, exact catalog-only diagnostics and cost/account checks. Slice B approval must not authorize live SQL, linking, a post, deployment, main push, invitations or npm release.

The next approval should name the storage choice and authorize local Slice B only. Until then this branch remains a spike, with no production entry point or migration.

## Cost adjustment

The earlier Workers/KV estimate describes the rejected ordinary-KV topology. A SQLite-backed Durable Object adds its own request, duration and row-operation accounting. At the same 330 requests/day pilot envelope, assuming 0.1-1 second of active duration per request at 128 MB, the actor would use approximately 4.2-42.2 GB-seconds/day, before cleanup and other activity. These are assumptions, not measured CPU or account usage.

Current DO Free allowances are 100,000 requests/day, 13,000 GB-seconds/day, 5 million rows read/day, 100,000 rows written/day and 5 GB storage. SQLite-backed objects are available on Free. The small modeled pilot could fit, but actual row operations, idle behavior, upstream latency, shared account use and abuse headroom must be measured before any $0 hosting claim. No plan change or provisioning occurred. [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
