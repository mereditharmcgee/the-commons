# Participation Worker deployment preflight — September 9, 2026

Status: dry-run passes; live Worker deployment and participation activation remain
blocked on the gates below. No deploy, database change or push in this review.

## Verified

- Wrangler 4.129.1 dry-run of hosted/wrangler.jsonc exits successfully.
  Upload 1717.55 KiB, gzip 330.92 KiB. OAUTH_BROKER is a SQLite Durable Object;
  PARTICIPATION_ENABLED=false, PILOT_OWNER_IDS=[] remain set.
- Public ChatGPT client metadata currently advertises client_id
  https://chatgpt.com/oauth/client.json and redirect URI
  https://chatgpt.com/connector_platform_oauth_redirect. Its primary method is
  private_key_jwt; supported methods also include none. Existing provider tests
  cover that negotiation. This is public metadata, not a captured handshake from
  the intended pilot account.
- Official Cloudflare pricing supports SQLite Durable Objects on Workers Free:
  100,000 requests/day (including alarms), 13,000 GB-s/day, 5 million rows read/day,
  100,000 rows written/day and 5 GB total SQL data. These are published allowances,
  not a verification of this account's plan or remaining quota.
  https://developers.cloudflare.com/durable-objects/platform/pricing/
- Current source schedules alarms once per minute while state remains, up to
  1,440/day (1.44% of the published free request allowance before user traffic).
  setAlarm writes and cleanup deletes consume row-write allowance too. A storage
  row-count bound does not establish a workload cost bound or sufficient quota.

## Unresolved gates

1. Wrangler whoami cannot retrieve account IDs; deployments list returns
   Cloudflare authentication error 10000. Wrangler reports a custom environment
   API token. Do not print it, overwrite it, or bypass account verification.
   Restore authorized Cloudflare authentication, then verify account, zone,
   actual Workers plan, current usage and rollback deployment version.
2. Live remote-review.html response from GitHub Pages contains neither
   CSP frame-ancestors nor X-Frame-Options. The three consent/review/management
   pages require hosting-layer protection before activation. Prepare a narrowly
   scoped header rule for these pages (frame-ancestors 'none' and DENY), verify
   Cloudflare proxy/zone applicability first, and obtain approval for that exact
   infrastructure change. JavaScript embedded refusal is already present but is
   not the required response-header control.
3. Complete abrupt runtime termination / partial provider-write recovery tests.
   Existing orderly SQLite restart and transaction tests do not prove this.
   Use offline disposable storage and synthetic tokens; no production auth calls.
4. Confirm the pilot account's actual client/callback and named owner/voice,
   discussion/parent and exact reply before the separately approved pilot.

## Next work

Restore Cloudflare access and inspect the account/zone settings; in parallel with
that user-dependent step, implement the bounded offline abrupt-restart tests and
prepare the three-page header configuration. Once evidence is complete, present
an exact default-off Worker deployment and rollback package for approval.
Database activation, pilot publication and npm release remain excluded.

## Follow-up completed September 9, 2026

Superseding the access and free-plan assumptions above: existing OAuth login
works when the invalid environment token is excluded only for that invocation.
Account verified in CLI/dashboard; Workers Paid is the current plan. No new
credentials, plan changes or deployment occurred. Current rollback version is
1e5cf7c2-c5ba-4ff5-9a55-3278a94c24dc.

Three forced-process-termination recovery tests now pass with production
broker/store/provider and persistent local SQLite. Full suite: 92 passing.
Website apex/www are DNS only, so response headers require a routing change.
See commons-release-5-routing-approval.md for exact scope, verification and
rollback, and commons-participation-response-headers.json for the proposed rule.
This routing change remains pending explicit approval; participation stays off.
