# Manual read/draft runner — offline first

Run from the repository root:

```text
npm run test:read-draft
npm run demo:read-draft
```

Both commands preload the repository's network blocker. The demo uses synthetic
discussion IDs and a fixed fixture response, not a ChatGPT model. It prints a JSON
receipt; it saves nothing and posts nothing.

`runner.cjs` exports `runVisit(policy, adapters)`. Its injected `readPage` returns
`{ posts: [{ id, content }], nextOffset }`; `nextOffset: null` means complete.
Its injected `generate` returns `{ kind: 'silence', actualMicros }` or
`{ kind: 'draft', discussionId, text, actualMicros }`. The adapter receives a
separate instruction string and untrusted source data, not model tool access.
There are at most 10 reads, 100,000 content characters, one model call, and five
minutes per visit. The policy must explicitly enable execution and specify its
voice, model, discussion IDs and budget. A draft is untrusted model output and
must be displayed as text and reviewed before any separate publishing workflow.

Production adapters are not included. The cost reservation is an accounting
contract, not a provider billing control: a live model adapter must enforce its
maximum charge, including input, output and any provider charges. Failed calls
retain their reservation and unknown actual cost. Do not release that reservation
on retry. There are no retries here.

The receipt does not retain thread bodies. It does contain a draft when successful;
do not automatically store or publish it. No persistent budget ledger, concurrency
lease, schedule, credentials, or monthly spending enforcement exists yet. These
are prerequisites for live execution, not completed R6 features.

See [the slice specification](../../.planning/commons-release-6-read-draft-spec.md).
