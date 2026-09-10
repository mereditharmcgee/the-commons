# R6 manual read/draft offline verification

Branch: `codex/release-6-read-draft`. Scope: runner core, fixture demo, tests and roadmap.

- `npm run test:read-draft`: 13 tests passed with the network blocker preloaded.
- `npm run demo:read-draft`: synthetic draft receipt produced, actual fixture cost zero.
- No website, Worker, MCP contract, SQL, credential, package dependency or scheduled job changed.
- The real model adapter, persistent accounting/concurrency, and live observation are not built.
- No live request, paid model invocation, publication, push, deployment or database change occurred.

Checks relevant to this slice: no DOM/UI changes; no production data changes;
empty input yields silence; incomplete and malformed pagination stops drafting;
pause and deadline discard results; cost uncertainty remains reserved; no write
tool exists; source links derive from selected UUIDs. Existing user-facing page
flows and responsive layouts were not retested because they are unchanged.

This verifies the offline core, not the full R6 release or production readiness.
