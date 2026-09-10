# R6 first slice: manual read and draft

Status: implementation authorized in this task; offline first. No live run authorized.

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
