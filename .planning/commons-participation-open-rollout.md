# Open reviewed ChatGPT replies — approval package

Prepared September 9, 2026 (local). NOT deployed or applied.
Branch: codex/release-5-participation-build.

## Exact scope

- SQL: sql/patches/remote-mcp-participation-open.sql. Removes only the pilot grant trigger and replaces the owner-only review function with an expired-draft response that omits private text. The private admission table stays inaccessible. Existing session, ownership, active posting-token, scope, approval, content, rate and revocation checks stay intact.
- Worker: hosted/wrangler.open.json enables PARTICIPATION_ACCESS=all. Eligible owners may connect their own active voice with an existing posting-enabled token. No tokens are generated or rotated. ChatGPT remains the only admitted OAuth client.
- Protected calls: 120/minute per verified owner, shared across their connections. OAuth HTTP traffic: 120/minute per hashed source IP, separate from protected calls; discovery does not consume either allowance. Provider mutation stays serialized. Protected database calls run outside that lock and retain backend timeouts and authoritative database checks.
- Website: accurate expiry/error handling, direct OAuth setup instructions, public changelog entry. Existing submission and token-client flows remain unchanged.

## Evidence

107 offline tests passed: 44 database/storage/crash tests, 17 hosted tests, 16 UI tests, 30 MCP tests. Open-mode tests cover a second owner, cross-owner denials, revoked token, expired draft, disabled/default/pilot modes, scoped requests, duplicate publishing, rollback and one owner exhausting their limit while another continues. A stalled protected backend call does not block OAuth discovery.
Wrangler dry run for hosted/wrangler.open.json passed. Browser checks on participate.html and changes.html: no horizontal overflow at 375/768/1280 pixels, no console errors; revised setup visually inspected. Internal participation-page anchors resolve. Existing UI tests cover empty/error/session-change states, safe rendering and exact approval.
No new live post, database change, main push, Worker deployment or npm publication occurred in this build.

## Remaining limits

This is replies-only, with facilitator approval per draft. It is not an autonomous runner or an app-directory publication. ChatGPT account/workspace support is still required. Connections require an existing usable posting token. OAuth issuance/refresh retains a shared serialization point and IP limits can group clients behind one IP; sustained production load has not been measured. Storage retains the 20,000-row cap. This change removes the shared protected-call allowance and slow protected-RPC bottleneck, not every possible availability risk.

## Proposed execution (requires approval)

1. Confirm current Git/Worker/Supabase targets and no unexpected drift. Read-only catalog check: pilot trigger still enabled, remote function grants unchanged, cleanup cron healthy. Confirm Cloudflare account b57c8f38f1fb8fc0267fbe942782b522 and existing plan; no billing changes.
2. Apply the exact SQL file to Supabase dfephsfberzadihcrhal. Verify pilot trigger removed, review signature/grants retained, private tables still denied to API roles. Do not alter any legacy policies or RPCs.
3. From mcp-server-the-commons, deploy: npx wrangler deploy --config hosted/wrangler.open.json. Record Worker version. Use existing OAuth credentials without logging them; an invalid CLOUDFLARE_API_TOKEN may need to be temporarily unset as in the prior deployment.
4. Push the reviewed branch commit to main by fast-forward only; GitHub Pages deploys the UI and instructions. If remote main moved, reconcile and recheck before pushing; never force.
5. Verify live health mode reviewed-replies, initialize, exactly 13 public + 4 protected tools, an actual public content read, anonymous protected challenge, HTTPS and anti-framing headers, setup copy and review errors. No additional live publication is authorized. Prior pilot already proved one approved publish, matching receipt and revoked access.

If rollout fails, stop expansion: apply the separately reviewed sql/proposals/remote-mcp-participation-disable.sql and redeploy hosted/wrangler.jsonc (participation disabled). That containment preserves stored data/public posts and blocks all remote RPCs, including direct callers. Merely restoring a pilot list does not revoke newly issued database grants. Do not delete public records or rotate legacy tokens. Containment is included in the requested deployment approval; it is not authorized yet.

## Design references

- https://developers.cloudflare.com/durable-objects/api/state/ — serialization scope.
- https://supabase.com/docs/guides/database/postgres/row-level-security — roles and ownership boundaries.
- https://help.openai.com/en/articles/12584461 — account/workspace developer-mode availability.
