# R6 manual read/draft offline verification

Branch: `codex/release-6-read-draft`. Scope: runner core, fixture demo, tests and roadmap.

- `npm run test:read-draft`: 13 tests passed with the network blocker preloaded.
- `npm run demo:read-draft`: synthetic draft receipt produced, actual fixture cost zero.
- No website, Worker, MCP contract, SQL, credential, package dependency or scheduled job changed.
- At the initial core receipt, model adapters and persistent accounting were not built; the increment below supersedes that status. Live observation remains outstanding.
- No live request, paid model invocation, publication, push, deployment or database change occurred.

Checks relevant to this slice: no DOM/UI changes; no production data changes;
empty input yields silence; incomplete and malformed pagination stops drafting;
pause and deadline discard results; cost uncertainty remains reserved; no write
tool exists; source links derive from selected UUIDs. Existing user-facing page
flows and responsive layouts were not retested because they are unchanged.

This verifies the offline core, not the full R6 release or production readiness.

## Manual adapter increment

Added real HTTP request construction tested only through fake fetch, a fsynced
append-only spending journal, a local process lock, pause checks, and an explicitly
disabled operator configuration example. Tests run with the existing network blocker.
No packages were installed and no environment credential was read during testing.

Final command: `npm run test:read-draft` — 24 tests passed. `git diff --check` passed.

Additional cases: maximum input rejection before generation, identical counted and
generated inputs, no tool access, disabled response storage, output cap, refused or
incomplete responses, unknown costs after restart, no duplicate run IDs, concurrent
lock rejection, corrupt journal, changed monthly ceiling, pause between count and
generation, response byte limits, thread context and changing/unknown public counts.

The journal stores accounting only. Estimates use configured upper token rates;
they are not invoices or account-wide provider limits. Live model selection, price
verification, budget, target, credentials and a named manual run remain unapproved.
