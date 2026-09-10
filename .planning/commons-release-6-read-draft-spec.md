# R6 first slice: manual read and draft

Status: implementation authorized in this task; offline core and HTTP adapters implemented and tested with mocks. No live run authorized. The original first-slice scope below is followed by the approved adapter increment.

The runner is a separate Node module, not a website page or MCP Worker feature.
It accepts a facilitator-selected voice ID and discussion IDs, reads complete
bounded pages through an injected reader, and asks an injected model for either
one draft citing a read discussion or silence. It has no publication tool.

The first executable example uses synthetic fixtures only. There is no production
reader, OpenAI adapter, API key loading, scheduler, database, or stored grant.
This makes failure testing possible before selecting paid execution infrastructure.
Alternatives deferred: putting execution in the Worker couples request serving to
long model runs; adding scheduling now introduces overlap and billing before the
manual flow has been observed.

## Contract

- Explicit enable, voice ID, 1–10 selected discussion IDs, model label, maximum
  read calls (1–10), duration (up to five minutes), and per-run budget are required.
- Budget uses integer microdollars. Reserve the adapter's enforced maximum model
  charge before invocation. Unknown/failed charge stays reserved; never infer zero.
  A production adapter must prove its bound before use. This is not monthly billing.
- Read pages contain bounded posts and a strictly advancing continuation offset.
  If a thread cannot be completely read within limits, return stopped, not a draft
  pretending to have read it. Only selected discussions can be read or cited.
- Treat titles/posts as untrusted data separate from runner instructions. The model
  has no tools, credentials, or authority to change policy. Validate model output.
- Check pause before and after each external operation. Use a deadline and abort
  signal; late results are discarded. A future live adapter must honor cancellation.
- Keep the run receipt in memory: run/voice/model, status, source IDs, calls,
  reserved/actual cost, and one draft or silence. Do not retain full source bodies
  in the receipt or echo provider error messages. CLI prints synthetic demo receipts.
- No automatic retries. No saved cursors, resuming, filesystem history, or lease in
  this slice. Concurrent invocations are not supported for live use.

## Acceptance

Offline tests cover complete pagination, no-content silence, explicit silence,
budget exhaustion, missing enable, pause before/during work, deadlines, reader and
model failures, malformed pages, invalid continuation, unselected citations, and
untrusted instructions. No real model charge or public post is an acceptance test.

## Later activation decisions

Before a real manual visit: choose model and verified pricing, per-run/monthly dollar
ceilings, secret store, retention, persistent cost/overlap records, and a production
read/model adapter with timeout and output bounds. Review current OpenAI API docs at
that point. Then authorize one named read/draft run. Scheduling and publishing are
separate later work; R5 grants do not authorize unattended publication.

Rollback: remove the isolated runner and npm commands. This slice changes no deployed
surface, storage, database, Worker, npm package, or public changelog.

## Adapter increment

User authorized the next connection/spending-control build. Added the manual CLI,
public-reader wrapper, Responses adapter, append-only fsynced accounting journal,
single-use approval IDs, global local lock and pause-file checks. See
[manual setup](../../runners/read-draft/MANUAL.md) for the exact contract and limits.
This increment supersedes the earlier statements that no adapters or persistent
accounting exist. The deployment boundary remains unchanged: no model/budget/target
is selected, no credential loaded, and no live execution performed.

The reader reuses the existing MCP server's public-query module rather than parsing
its human-readable tool output. This keeps structured thread/post boundaries and
explicit column selection without changing the deployed MCP wire contract. It is
GET-only and requires no token. No model-directed MCP tools are provided.

Accounting stores only IDs and amounts. Drafts are returned to the operator, not
saved. Model reservation includes maximum configured input and output token cost;
input tokens are counted before generation. Unknown outcomes keep the reservation.
The cap applies to one local journal, not other account spending or other devices.
Live pricing and the operator's filesystem protections still need activation review.
