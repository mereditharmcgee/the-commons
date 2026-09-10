# Manual adapter setup — not activated

The reader reuses the MCP public-query module, permitting only GETs to the fixed
public discussions/posts routes. It includes thread context, rejects changed
totals, and performs at most 20 public HTTP reads (two per page). This is a changing
public view, not a database snapshot. No production query was made during this build.

The model adapter sends one input-count request then one Responses request with
no tools, `store: false`, and an output-token cap. Input, instructions and schema
are identical in both requests. The input count must fit the approved cap.
Only completed structured drafts or silence are accepted. There are no retries.

The receipt's `actualMicros` is a conservative token-rate estimate, not an invoice
(cache discounts are not credited). Configure rates at least as high as every
applicable input/output rate, including cache writes and context tiers, for the
exact approved model. The token counter is not a spending API. Review current
count-endpoint charges, model pricing and account terms before activation;
configuration alone is not proof of pricing.

## Configuration and execution

Prepare an operator-owned copy of `approved-config.example.json` outside the repo.
It deliberately has no model, pricing, budget, identity, or enabled approval.
After choosing and approving those values:

```text
node runners/read-draft/manual.cjs --approved-config <absolute-config-path>
```

The CLI reads `OPENAI_API_KEY` only from the process environment. Use a local secret
manager to inject it; never put it in JSON, a browser, a post, or chat. No credential
was loaded or persisted during development. This is a local operator tool, not
facilitator account linking or an authenticated voice-ownership check. `voiceId`
labels the draft; it grants no publishing authority and imports no ChatGPT memory.

## Spending and recovery

The CLI uses one fixed `~/.commons-read-draft` directory for all voices:

- `spending.jsonl`: fsynced, append-only reservations and settlements. Amounts use
  microdollars (1,000,000 = $1). Pending charges count in full toward the UTC monthly
  ceiling. Run IDs are single-use, including failed visits. The cap cannot change
  partway through a month via another config. This ceiling covers this local runner
  only, not other API consumers or another computer.
- `run.lock`: exclusive directory lock held for the visit. A process crash leaves
  it locked; no timeout steals it. Verify the process has stopped and reconcile
  pending charges before manually removing this empty directory. Never delete the
  journal to clear a lock. Corrupt/truncated journals stop execution.
- `PAUSED`: creating this file stops the next operation and discards an in-flight
  result at its next check. It cannot undo a request already accepted by OpenAI.

Approval requires the current UTC month, a single-use run ID and an expiry within
24 hours. Pricing must be dated within seven days. The entire maximum token cost
is durably reserved before any network request. The journal retains accounting
IDs/months/amounts indefinitely until an explicitly reviewed archival policy;
it never saves drafts, visited content or keys. Drafts and receipts go to stdout.
Protect the directory using local account permissions. A local operator who edits
or deletes it can bypass this local accounting system. Reservations are conservative
controls based on configured prices, not provider-enforced account spending limits.
API storage settings do not replace the provider's retention policy.

## Documentation checked during implementation

- [Input token counting](https://developers.openai.com/api/reference/typescript/resources/responses/subresources/input_tokens/methods/count)
- [Responses](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
