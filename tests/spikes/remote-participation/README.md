# Release 5 Slice A: offline compatibility findings

September 9, 2026. Branch `codex/release-5-authority-spike`, based on planning commit `9dc8b0d`.

**Follow-up completed:** see [FOLLOWUP.md](FOLLOWUP.md) for the current findings and narrowed build proposal. The metadata fix and synthetic PostgreSQL transaction design now pass runtime tests. A Durable Object storage prototype prevents duplicate code redemption locally; adopting that custom adapter still requires review. The original KV design remains unsuitable. Nothing has been deployed.

The sections below retain the initial spike findings; the follow-up supersedes their database/runtime status.

## Reproduce

Requires Windows x64 and Node 24 (uses synchronous module hooks). The new PostgreSQL suite uses pinned Windows binaries and starts/stops its own loopback-only cluster. In this directory:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

Installation downloads packages; tests use only local runtimes. The original Node fixtures block all socket connections. The new PostgreSQL/Miniflare harness permits loopback sockets only; Worker outbound traffic is routed to a denying fixture service. There are no production credentials or provider bindings. The reserved `.example` domains never resolve over the network.

Dependencies are isolated from application manifests and locked: `@cloudflare/workers-oauth-provider` 0.10.3, `@modelcontextprotocol/sdk` 1.27.1, Zod 3.25.76 (all MIT). Provider tarball integrity is recorded in package-lock.json. SDK source advertises MCP protocol `2025-11-25`; this is the tested SDK version, not a claim that it is the newest protocol specification.

## Experimental results

14 diagnostic tests pass. `provider.test.js` executes the installed provider code without editing it. The Node loader replaces only `cloudflare:workers`' base class, supplies fixture metadata, and provides immediate-consistency in-memory KV. `wire.test.js` uses the actual SDK Streamable HTTP transport and parses its JSON responses.

| Area | Observed result | Implication |
|---|---|---|
| Discovery | Exact configured issuer/resource, S256 advertisement and HTTP 401 resource-metadata challenge | Provider is a viable protocol candidate |
| Authorization | Wrong redirect, resource, plain PKCE and incorrect verifier rejected; success redirect preserves state and includes issuer | Positive and selected negative cases pass; error-redirect issuer/client mix-up matrix remains open |
| Sequential code replay | Replay rejected and original grant revoked | Recovery must not blindly resend a code after an uncertain outcome |
| **Concurrent code redemption** | Two simultaneous exchanges both return HTTP 200 against fixture KV | **No-go pending workerd reproduction and supported atomicity solution.** A sequential replay test alone misses this |
| Encryption | Stored keys/values omit full access/refresh secrets and fixture capability; unwrap restores encrypted props | Supports encrypted capability storage; metadata must remain nonsecret |
| Refresh | Rotation works; previous refresh token accepted for recovery; grant expiration stays fixed; expired grant refused | Do not promise single-use refresh semantics; independently enforce database grant expiry |
| Revocation/expiry/outage | Explicit revocation and expired access record return null; storage exception propagates | Adapter must translate failures into bounded responses; no fallback authority |
| CIMD | Negotiates `none` when offered alongside `private_key_jwt`; rejects assertion-only client and missing public-fetch flag | Fixture proves negotiation, not real SSRF protection or ChatGPT linking |
| Tool metadata | `registerTool` silently drops top-level `securitySchemes`; `_meta.securitySchemes` survives actual tools/list wire | Resolve supported metadata emission before claiming current OpenAI compatibility |
| Mixed wire fixture | Anonymous read succeeds; protected fixture returns `isError` and `mcp/www_authenticate`; forged input rejected | Challenge envelope works. This is not a full OAuth-to-protected-tool integration |

The provider's whole-route API guard returns 401 without a bearer token. Wrapping the existing `/mcp` wholesale would therefore break anonymous discovery/reads. A future adapter needs deliberate per-tool authorization while preserving the public catalog. The fixture demonstrates envelopes only; it never publishes.

The provider emits a CIMD validation warning directly to console even with an `onError` override. A future logging audit must cover these paths and sanitize client-controlled metadata URLs/descriptions, not just application catches. No real secrets were used or logged here.

## Unfinished authority evidence

Docker CLI exists, but its Linux engine pipe is unavailable; `psql` and `postgres` are absent from PATH. No database was started or contacted. No SQL migration was written. In particular, this spike has **not** proven:

- Atomic grant handoff tied to owner session, OAuth transaction, client and exact redirect; login-CSRF, session substitution and grant-swap rejection.
- Real PostgreSQL concurrent publish/retry returning one post and one receipt with one limiter charge.
- Revocation, token rotation and account deletion races under facilitator -> identity -> token lock ordering, with grant/draft locks placed without inversion.
- Capability hash isolation, cross-owner receipt privacy, review revision invalidation and cleanup in a real schema.
- Workers runtime KV consistency, OAuth concurrent redemption across isolates, runtime SSRF flag enforcement, CPU limits or live client behavior.

Do not substitute a JavaScript Map transaction model for PostgreSQL locking evidence. The concurrent OAuth finding also shows why single-process tests cannot establish distributed guarantees.

Local source confirms the existing posting RPC does not invoke `content_shape_ok`; its 50,000-character cap differs from anonymous policies. The proposed wrapper still needs an explicit 30,000-character / 1,000-non-ASCII check plus nonempty content. JavaScript UTF-16 length is not PostgreSQL character length. The reviewed anonymous-post policy does not cap `feeling`; choose and approve a separate bound rather than claiming one already exists.

## Narrowed design proposal

Retain the connection-capability/database-wrapper candidate. Retaining a facilitator refresh session still gives the Worker excessive authority; creating another agent token still risks independent allowances or rotation. Neither resolves transactional receipt or revocation races.

Before Slice B, finish a focused A follow-up:

1. Reproduce simultaneous redemption in local workerd with synthetic clients and blocked egress. Investigate a maintained provider-supported serialized storage/deployment arrangement or upstream fix. Do not hand-roll OAuth or claim the current fixture is production evidence.
2. Exercise a supported SDK tool-list handler/metadata path with top-level security declarations and backward-compatible `_meta`, then verify initialize, list and protected calls in one mixed endpoint. No application SDK upgrade without reviewing the diff.
3. Bring up an isolated PostgreSQL instance; execute synthetic versions of existing RPC/lifecycle paths. Prove handoff atomic consumption, exact approval, receipt idempotency and revocation/rotation/deletion races with independent connections before final migration design.
4. Exercise sanitization, expiry/cleanup and failure injection in the integrated local adapter. Only then propose Slice B files, exact privilege model and migration review scope.

No production action follows from this report. Real ChatGPT linking, database catalog inspection, migrations, account provisioning, deployment, publishing a reply and main push retain their existing separate gates.

## Pilot cost envelope (estimate, not measured billing)

Assume 10 connections, 20 protected calls and 8 refreshes per connection/day, and 10 new connections/day as a conservative reconnect allowance: 200 calls + 80 refreshes + at most 50 connection/discovery requests = about 330 Worker requests/day (9,900/month). Budget 4 KV writes per refresh and 10 per connection: about 420 writes/day before abuse, retries and cleanup. These operation multipliers are planning allowances, not instrumented counts.

Assume 20 KB live OAuth storage per connection: about 200 KB. At 2 drafts per connection/day, 35 KB per draft and 24-hour body retention, about 700 KB of private draft payload; 1 KB receipts retained for 37 days add about 740 KB. Database indexes, WAL, history, replication and backups are additional, and plaintext draft storage belongs in the database, not provider metadata. No Supabase account capacity was inspected.

Cloudflare currently lists Free at 100,000 requests/day and 10 ms CPU per invocation. Paid starts at $5/account/month with 10 million requests and 30 million CPU-ms included. At a hypothetical 10-50 ms/request, this workload uses roughly 99,000-495,000 CPU-ms/month, but calls above 10 ms can fail on Free regardless of monthly volume. Node timings are not Worker CPU measurements. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

KV Free lists 100,000 reads/day, 1,000 writes/deletes/list operations each per day, and 1 GB storage; exceeding an operation allowance fails those operations. The modeled pilot fits those numerical allowances with limited write headroom, subject to shared account usage and actual operation counts. [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)

Therefore $0 incremental hosting is only a conditional possibility; $5/month is a possible account minimum if Paid is required, not an approved upgrade or a full system quote. No model API calls are included or were made. No account, billing, namespace or infrastructure change occurred.
