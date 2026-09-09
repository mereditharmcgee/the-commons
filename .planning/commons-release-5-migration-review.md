# Dormant migration approval package

Prepared September 9, 2026 on codex/release-5-participation-build. Supersedes
8fe20fb's immediate-activation review and hashes. Not applied or approved.

## Findings and validation

Authorized catalog-only helper comparison on project dfephsfberzadihcrhal is
complete. Both notification helpers match source. Scoring logic matches, with
production search_path now mirrored locally. No user/session/token rows read.
See commons-release-5-catalog-review.md.

All 89 offline participation test entries pass, including 31 actual-proposal
PostgreSQL entries. Tests cover dormant denial of all ten RPCs, the separate
activation privilege matrix, containment revocation, retention, atomic posting,
trigger effects, authority races and rollback. The exact scheduled cleanup
command ran locally; pg_cron itself was not installed or tested. Local tests
cannot establish production timing or live session-revocation behavior.

## Next approval: dormant install only

Apply sql/proposals/remote-mcp-participation.sql once transactionally to project
dfephsfberzadihcrhal, after refreshing catalog-only dependencies and confirming
no existing proposed schema/function names. Stop on drift. Keep the required
audit copy under sql/patches as part of approved application work.

Creates three private tables, indexes, five private helpers and ten public RPCs.
Exact-signature REVOKEs deny PUBLIC/anon/authenticated execution. Private tables
have RLS and no public policies or direct client access. Administrators retain
ownership. No grant, draft or post is created; no recurring job is scheduled.
Verify catalog inventory, definitions, signatures, RLS, ACL denial and unchanged
legacy functions. Inspect catalogs before retrying an uncertain application.

Approval excludes activation, scheduling, Worker deployment, main push, account
linking, token operations, test posts and npm publication.

## Separate cleanup approval

Artifact: sql/proposals/remote-mcp-participation-cleanup-schedule.sql.
Preflight existing pg_cron, administrator job ownership, capacity and absence of
the named job. The script refuses a missing extension or existing job name.
Do not enable extensions or billing implicitly.

Job commons-remote-mcp-cleanup runs every five minutes (288 times/day), with a
30-second statement timeout and two-second lock timeout. It clears content and
feeling at 23 hours, providing roughly one hour of buffer before the 24-hour
target. Receipts persist until their grant has been expired for 30 days.
Locked grants are skipped; backlog and outages can exceed the target. This is
not a hard physical-deletion guarantee. Cleanup scans all grants; capacity
remains a production pilot gate.

Supabase exposes job definitions/results through cron.job/cron.job_run_details:
https://supabase.com/docs/guides/cron . Before activation, verify exact command,
owner and schedule, and observe two successful scheduled runs. Check aggregate
overdue-body counts without reading bodies. During the bounded pilot, operator
checks every ten minutes: failed runs, no success within ten minutes, or any
body aged 24 hours stops pilot participation pending cleanup investigation.
No unattended pilot until an explicitly approved monitor exists.

## Separate activation and recovery

remote-mcp-participation-activate.sql grants five owner RPCs to authenticated,
and five capability RPCs to anon/authenticated. The operator must verify the
cleanup gate first; SQL does not automatically enforce that operational gate.
Activation permits qualifying direct RPC calls independent of Worker flags.
Worker deployment and a named one-reply pilot remain separately approved.

remote-mcp-participation-disable.sql revokes ten RPCs without data deletion.
This blocks subsequent calls; assess already-running transactions separately.
Disable Worker participation too for containment. Keep cleanup running while
retained private data still needs it.

Before destructive rollback, inspect dependencies and separately approve
remote-mcp-participation-cleanup-stop.sql (if scheduled), then
remote-mcp-participation-rollback.sql. Rollback preserves public posts and legacy
tokens/RPCs but irreversibly deletes private grants, drafts and receipts.
Never run rollback automatically in response to uncertain application status.

## Exact local artifact hashes

SHA-256 of reviewed bytes; line endings affect hashes.
- remote-mcp-participation-activate.sql: 7456B3D4304D358B221EFB78E73E4DE2FAF3742BBBE3F9DC27B045E3AFF1E707
- remote-mcp-participation-cleanup-schedule.sql: EAEACC4B7D35B6506DFCE81FB9E5B97366FBB8D5F996BA6932C353613607EA1F
- remote-mcp-participation-cleanup-stop.sql: 1ED6834E2D35DF5835E6E453D6A4BF4AC1472FE79FAC2B33674B7872B2AAB49D
- remote-mcp-participation-disable.sql: 199432AE97588C71B86955F40CCEA70170B0C94A430E1CC80ECB12898C21D406
- remote-mcp-participation-rollback.sql: 192CE146F1B6D658759F655247A408CDA2658419620683B382A310FD6561D07F
- remote-mcp-participation.sql: B39B700032E3686D378638E16B40190078FD1BA234B438EB63ADA09823CDD230

## Applied September 9, 2026

Meredith approved the dormant installation in conversation. Applied the reviewed
SQL from d9bc6fb to dfephsfberzadihcrhal using the authenticated Chrome SQL Editor
(no Supabase MCP tool was available). Audit copy:
sql/patches/remote-mcp-participation-dormant.sql. Header updated for applied state;
SQL body matches the approved proposal.

The initial editor execution failed with a syntax error at BEGIN. A catalog
recheck confirmed no proposed objects existed. Explicitly selecting the entire
editor document before filling resolved the input issue. The unchanged migration
then returned Success. No rows returned.

Post-apply catalog verification: exactly ten public RPCs and five private helpers;
all 15 normalized function body hashes match the approved SQL; expected signatures,
security-definer flags and pg_catalog search paths; PUBLIC/anon/authenticated
EXECUTE denied. All three private tables have RLS, no client table privileges,
zero policies, and no anon/authenticated schema USAGE. All twelve inspected
legacy/dependency definitions have unchanged MD5 values before/after.

Evidence: .planning/commons-release-5-dormant-install-evidence.json.
No token/session/content rows read, new RPC invoked, cleanup scheduled, access
activated, Worker deployed, npm publication or push performed. Next stage remains
separate cleanup scheduling approval and verification before activation.
