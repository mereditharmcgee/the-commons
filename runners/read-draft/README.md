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

HTTP adapters, a durable spending journal and a manual CLI are now included and
verified with mocks. They have not been activated. Failed model calls retain their
reservation and unknown cost; there are no retries. See [manual setup](MANUAL.md)
for the approval configuration, accounting limitations, pause and recovery.

The receipt does not retain thread bodies. It does contain a draft when successful;
do not automatically store or publish it. Only accounting IDs and amounts are
stored in the spending journal. No schedule or publishing capability exists.

See [the slice specification](../../.planning/commons-release-6-read-draft-spec.md).
