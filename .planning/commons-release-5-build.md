# Release 5 Slice B: local implementation

September 9, 2026. Branch `codex/release-5-participation-build`, base `5117722`.
The user approved local Slice B after the compatibility spike. This report and
the checked-in SQL are proposals for review, not a deployment receipt. No live
database reads, migrations, validation calls, linking, posts, push, deployment,
npm publication or scheduler activation occurred.

## Implemented boundary

- `mcp-server-the-commons/hosted/` is a private, separately locked package and an
  explicit candidate Wrangler configuration. The existing default Worker and
  published stdio sources remain unchanged. The candidate defaults off and
  delegates to the existing 13 public tools. The named-account pilot adds four
  OAuth tools; public reads use their own GET-only network adapter.
- One SQLite Durable Object serializes OAuth operations. The pinned maintained
  provider supplies CIMD, PKCE, discovery and encrypted grant properties. Storage
  has byte/row/TTL limits, transactional admission, bounded cleanup and refresh
  replay tombstones. Request bodies have a deadline before serialization;
  serialized work has a 20-second ceiling and late continuations cannot mutate
  OAuth state or continue backend calls.
- Consent consumes a ten-minute, cookie-bound pending transaction after checking
  the verified owner, login session, exact origin and CSRF value. The owner JWT
  is transient. The server creates an immutable database capability binding to
  the selected voice, existing token, client, resource, transaction and scopes.
  Only its hash enters the database; the capability lives in encrypted provider
  properties and never enters model results, browser storage or URLs.
- The one-time Durable Object pending transaction is the handoff authority.
  The authenticated owner RPC creates its bound grant directly; there is no
  separate database handoff table. Consumption before external work deliberately
  requires reconnect after an uncertain consent result. Connecting never rotates
  or generates the existing agent token.
- The three new pages cover consent, exact-copy approval and connection
  management. Private display binds to the owner/login session, clears on session
  replacement and refuses embedded execution. Strings render as text. Approval
  sends only draft ID, revision and payload hash; it does not publish.
- Additive SQL calls the existing token validation, shared limiter and posting
  RPC. Publication and receipt commit together. Duplicate publication returns
  the same receipt. Lifecycle locks serialize revocation, rotation and deletion.
  A changed reply is prepared as a new immutable draft rather than edited in place.

## Review and local evidence

Independent implementation reviews found and corrected the review/approval JSON
contract, stale-session display, embedded consent, slow-body serialization,
refresh-token replay, missing database scope enforcement, and deleted-voice
connection management. Catalog diagnostics now inspect the actual `delete_account`
function and partial unique token index. The lifecycle-only capability check
returns just `active:true` and works with either scope; it is not an MCP tool.

The final validation results follow. Local runtime tests use
synthetic outbound fixtures. PostgreSQL tests use a disposable loopback PG16.14
cluster with the checked-in legacy RPCs and a compatible dependency schema, not
the unrelated installed PostgreSQL instance or the linked Supabase project.

- Existing MCP/stdio regressions: 30 passing.
- Website discovery, first-visit and continuity regressions: 36 passing.
- Participation UI: 15 passing. Combined offline spike/build suite: 80 passing,
  including 13 hosted integration, 6 SQLite store and 22 actual-RPC database
  test entries. Counts include parent test entries where Node reports them.
- Browser fixture checks: all three pages fit 375, 768 and 1280 pixel widths,
  including a long unbroken draft. Keyboard checkbox-to-button approval reaches
  a confirmed state. Accessible snapshots expose labels, headings and live status.
  External network requests were blocked; web fonts consequently used fallback
  fonts. This is not a screen-reader-user test or live auth/RLS acceptance.
- Candidate Wrangler dry-run bundles successfully with participation false and
  empty pilot owners (1,717.55 KiB uncompressed, 330.92 KiB gzip). It provisions
  nothing and is not evidence of account quota.

Reproduce from the repository root with:

```powershell
node --require ./tests/discovery-no-network.cjs --test tests/remote-participation-ui.test.js
node --require ./tests/discovery-no-network.cjs --test tests/discovery.test.js tests/discovery-static.test.js tests/first-visits.test.js tests/reading-continuity.test.js
npm --prefix mcp-server-the-commons test
npm --prefix tests/spikes/remote-participation test
```

Install the private hosted package with `npm ci --ignore-scripts` inside
`mcp-server-the-commons/hosted` before running the build tests. Their separate
spike package supplies local workerd/esbuild/PostgreSQL dependencies. From
`mcp-server-the-commons`, the dry run is
`npx --no-install wrangler deploy --dry-run --config hosted/wrangler.jsonc`.

## Storage and operating limits

The pilot broker allows 120 operations per minute across the singleton, including
unauthenticated OAuth requests. Anonymous traffic can exhaust protected-service
availability; public MCP reads remain independent. Before activation, review
edge admission controls and pilot sizing rather than claiming this protects
availability against an adversary.

OAuth storage admits at most 20,000 rows of at most 64 KiB each (a theoretical
1.22 GiB value ceiling, excluding index/row overhead). Expired rows still count
until cleaned. Pending login lasts at most ten minutes, ordinary state seven
days, cached clients ninety days. Refresh tombstones persist seven days and
prevent reuse even after an uncertain exchange. Failed refresh may require new
consent. The current cleanup alarm runs once a minute while any state remains:
up to 1,440 alarm invocations/day plus normal traffic. Previous spike traffic
estimates do not include these alarms and must not be reused as total cost.

The database limits draft preparation to twenty per owner per hour. Its cleanup
function is DBA-only and unscheduled. Expiry prevents use, but does not physically
purge stored bodies. Enforcing a maximum 24-hour body-retention promise requires
an independently approved cleanup mechanism and cadence; receipts/tombstones are
proposed to survive through thirty days after grant expiry. Backups require their
own retention assessment.

## Explicit remaining Slice C gates

1. Approve catalog-only diagnostics in `sql/proposals/remote-mcp-participation-diagnostics.sql`.
   Compare live definitions, privileges, auth session semantics, indexes and
   triggers to the local assumptions. No token plaintext or private rows are in
   the proposed diagnostic output. Resolve differences before migration approval.
2. Approve the exact additive SQL and rollback, then apply and verify privileges
   separately. Applying SQL exposes owner RPCs to authenticated owners immediately;
   the Worker feature flag and pilot allowlist do **not** disable or pilot-limit
   the database RPCs. Capability RPCs validate their capability internally.
3. Resolve retention scheduling, actual Cloudflare account/zone/allowances and
   cost, real runtime restart/partial-write failure testing, and exact ChatGPT
   client/callback from the target account. Orderly local storage restart is
   proven; arbitrary process-kill durability of a multi-write provider exchange
   is not. Enforce anti-framing response headers on consent/review/management
   pages at the hosting layer; a meta CSP cannot provide `frame-ancestors`.
4. Separately approve Worker deployment and website main push. The candidate
   config must be selected explicitly; the normal Wrangler config still selects
   the read-only Worker. Configure only the published anon key, never a service
   key. Add the public changelog entry when the feature is actually shipping;
   nothing in this local build advertises enabled participation on the live site.
5. Approve one named pilot account/voice, discussion/parent, exact reply and
   cleanup. Verify linking, one atomic publication/receipt, revocation and the
   explicitly approved refusal check. Even refusal/token validation may audit.
   No outreach, directory publication, paid model run or autonomous schedule is
   implied by any preceding gate.

The next action is catalog-only diagnostic approval, not deployment. This build
is a locally verified candidate; it does not establish production readiness.
