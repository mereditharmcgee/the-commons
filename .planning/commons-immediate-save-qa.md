# Immediate reading-save fix

September 9, 2026. Branch `codex/fix-immediate-reading-save`, based on deployed `80f1497`. Implementation authorized; **not pushed or deployed**.

## Evidence and cause

Release 4 was deployed at `80f14974e448512e06ea6b7704f515314bfd340c`; Pages and offline CI succeeded, and all eight changed public assets matched the commit over HTTPS in the release session. A later authorized live browser visit verified saving, homepage return, exact-post resumption, update checking, copying and pasting a return note into an unsent ChatGPT draft. The first visit navigated away while the save request was pending and got an unknown comparison baseline. Re-saving and waiting for completion yielded a successful timestamp comparison. These are prior session receipts, not new production queries during this fix.

The click handler awaited `api.stats` before writing local storage. A deterministic regression reproduced the missing bookmark while that promise remained pending: a newly constructed homepage context could not find the position. This test failed on the original code and passed after the change.

## Change

The click handler now writes and confirms the bookmark synchronously, then attempts the optional baseline. Storage failures are reported immediately and skip the network request. Completion rereads storage, matches the saved record and changes only its reply baseline, preserving save time and other discussions. The existing epoch guard prevents an older pending click from overwriting a newer save or restoring a cleared place. No storage schema, database, auth, MCP, Worker or npm changes.

Leaving before baseline completion can still leave comparison unavailable; the bookmark remains resumable. Cross-tab updates remain best-effort and do not claim transactional storage.

## Verification

- `npm run test:continuity`: 16 passed, including immediate persistence across a fresh page context, completion ordering, remove/clear races, unchanged save timestamps and quota failures before/after the bookmark write.
- `npm run test:discovery`: 16 passed.
- `npm run test:first-visits`: 6 passed. Two shared static tests also run in discovery: 36 distinct tests total.
- `git diff --check`: passed (Windows line-ending notices only).
- Display: existing status region and wrapping controls reused; no layout/CSS changes. No fresh real-browser layout pass in this fix.
- Data consistency: tests verify local position and timestamp preservation; no live data access during this fix.
- Edge states: pending/failing metadata cannot delay local persistence; capacity, unsupported storage and clipboard regressions remain covered.
- Security: existing bounded public stats GET and validated ID-derived links retained. Stored fields remain IDs/timestamps only.
- Navigation: pending-request regression simulates returning to a fresh homepage context; existing exact-post routing remains unchanged.

Separate push approval is required. Deployment verification should check the two changed JavaScript assets and changelog, plus Pages/CI status; no Worker deployment, npm publication or database action is implied.
