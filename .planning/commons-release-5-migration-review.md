# Exact migration review and approval scope

Reviewed September 9, 2026, against commit
`9a6d439b4a8f821b6b81f3801270715cdf535646` on
`codex/release-5-participation-build`. Review only; no live query, DDL, push,
deployment, post, or credential operation occurred in this review.

## Verdict

Conditional pass for the additive design. Do not treat this document as approval
to apply it. The existing 30 database tests and 88 combined offline test entries
passed in the preceding implementation turn; unchanged tests were not rerun for
this document-only review. Live catalog findings support the core dependencies,
but helper parity and operational retention remain unresolved.

| Dimension | Assessment |
| --- | --- |
| Security | Owner session checks, immutable capability/scope bindings, private RLS/ACL restrictions and fixed search paths are coherent. Applying the SQL immediately exposes the owner/capability RPCs; Worker pilot flags do not restrict direct RPC calls. |
| Correctness | Exact-copy approval, shared legacy token allowance, atomic receipt insertion, retry behavior, trigger rollback and lifecycle races have local evidence. Live session-revocation timing is not proven by catalogs. |
| Performance | Suitable for further bounded pilot review, not unrestricted rollout. Drafts have an owner-wide hourly budget; grant creation, owner connection listing and cleanup are not bounded by a pilot-wide database quota. Cleanup can scan all grants and associated drafts. |
| Maintainability | Additive objects and explicit rollback are reviewable. Function EXECUTE grants are assigned through a prefix-wide catalog loop, so the apply preflight must confirm there are no preexisting remote_mcp objects. |

## Exact artifacts

Migration: `sql/proposals/remote-mcp-participation.sql`

SHA-256 of current local bytes:
`9E412710EE65EEA11BA70CB2B65B399DA92DCF7A7A3F660F334F7A75A7259EB7`

Rollback: `sql/proposals/remote-mcp-participation-rollback.sql`

SHA-256 of current local bytes:
`43B120DC19566C5D2BDC6E8B65A02E38EE8075A2C970EA9B283395B3172E2AE8`

Checksums depend on line endings; the Git commit and exact diff remain the
source identity. Any substantive SQL change requires a revised review scope.

## What application does

One transaction creates the private schema, three tables (grants, drafts,
receipts), indexes, five private helper functions and ten public RPCs. It does
not replace existing functions, rotate tokens, modify public content, run a
backfill, or schedule a job. Three private tables have RLS enabled with no public
policies and no anon/authenticated direct privileges.

- Five owner RPCs (create grant, list connections, review, approve, revoke) are
  executable by authenticated owners and check an existing auth session.
- Five capability RPCs (lifecycle check, status, prepare, publish, receipt) are
  executable by anon/authenticated roles but require the secret capability and
  enforce its live grant/token/identity state. Status/receipt and prepare/publish
  separately enforce the appropriate read/write scopes.
- Private helpers and cleanup have no PUBLIC/anon/authenticated access.
- Grant lifetime is at most seven days and bounded by the existing token's expiry;
  draft/approval lifetime is at most ten minutes. Preparation is limited to twenty
  drafts per owner per hour; publication uses the existing token allowance.
- Publication invokes the existing posting RPC. Its ordinary notifications,
  auto-follow and discussion counts are part of that transaction.

## Prerequisites to resolve before application approval

1. Finish catalog-only comparison of `notif_muted`, `notif_digested` and
   `compute_suspicious_score`, and confirm extension/function dependencies and
   absence of existing remote_mcp objects. Read definitions only, never invoke
   token validation or select user/session/token rows. Stop on discrepancies.
2. Choose the database activation/retention arrangement. The current migration
   makes direct RPCs usable immediately by qualifying owners; it is not a dormant
   installation controlled by the Worker flag. It has no cleanup scheduler and
   cannot guarantee a 24-hour physical deletion ceiling. Either approve and
   specify an operational cleanup policy, or revise the migration to withhold RPC
   access until cleanup and pilot activation are ready. Those alternatives change
   the operational or SQL scope and must be concrete before approval.

## Bounded application scope, once prerequisites are resolved

Explicit approval should name project `dfephsfberzadihcrhal`, the final reviewed
migration revision and the activation/retention choice. That approval covers one
transactional application followed by catalog-only verification: exact object
inventory, function definitions and signatures, RLS enabled, private ACL denial,
correct owner/capability EXECUTE privileges, and unchanged legacy function
definitions. Keep an audit copy under `sql/patches/` per FOR_AGENTS.md as part of
the final approved migration work. Do not blindly retry an uncertain application;
inspect the resulting catalogs first.

No Worker deployment, main push, account linking, live session manipulation,
token validation, test post, invitation, npm publication or schedule beyond an
explicitly named cleanup mechanism is included.

## Recovery

An error before COMMIT rolls back the additive transaction. An uncertain client
response requires catalog inspection, not an assumption that rollback occurred.

The checked-in rollback drops all ten new public RPCs and the private schema
with CASCADE in a transaction. It preserves public posts, existing tokens and
legacy RPCs, but irreversibly removes private grants, draft bodies and receipts.
It is therefore a separately approved destructive recovery action, not an
automatic response to a failed check. Disabling the Worker alone does not stop
direct database capability use; incident containment must explicitly include
revoking new RPC access or grants. Inspect any dependencies added since release
before using DROP SCHEMA CASCADE.

## Later activation gates

Cloudflare account/zone/allowances and storage costs, response-header anti-framing,
exact client configuration, real runtime failure checks and the named one-reply
pilot remain separate. Live session-revocation behavior belongs to that explicitly
bounded pilot; local fixtures cannot establish it. Deployment is not approved.
