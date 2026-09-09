# Proposed website routing and anti-framing change

September 9, 2026. Prepared only; no DNS, TLS or rule changes applied.

## Verified context

Cloudflare account b57c8f38f1fb8fc0267fbe942782b522 belongs to
Meredith.ar.mcgee@gmail.com's Account. Dashboard shows Workers Paid as Current
plan, $5/month plus usage. Account home showed 631 Worker invocations and zero
Worker errors over its displayed last 24 hours. This is not a billing-cycle
remaining-allocation measurement. No plan or billing changes are requested.

The existing OAuth login works with Wrangler when the overriding environment
CLOUDFLARE_API_TOKEN is omitted for that child shell only. The original variable
is restored on shell exit. No credential was read out, replaced or expanded.
Read-only Worker current deployment is 100% version
1e5cf7c2-c5ba-4ff5-9a55-3278a94c24dc. Recheck before any later rollback.

The four apex A records point to GitHub Pages at 185.199.108.153,
185.199.109.153, 185.199.110.153 and 185.199.111.153; all are DNS only.
www CNAME points to mereditharmcgee.github.io and is DNS only.
mcp is already a proxied Worker custom domain and is outside this change.
Current zone SSL mode is Full. Universal edge certificate for apex and wildcard
is Active, expires November 5, 2026. GitHub Pages HTTPS works currently.

## Exact proposed approval scope

1. Inspect current response-header rules and available rule capacity; preserve
   all unrelated rules. Add the single rule in
   commons-participation-response-headers.json to http_response_headers_transform.
   Add CSP frame-ancestors 'none' without replacing any existing CSP and set
   X-Frame-Options DENY. Match only the three participation pages and their
   extensionless equivalents on apex/www. Do not overwrite a ruleset wholesale.
2. Verify GitHub Pages origin certificates against the public hostnames, then
   set zone SSL mode Full (strict), preserving end-to-end certificate checking.
   Stop if valid origin TLS or edge certificate readiness cannot be established.
3. Switch only those four apex A records and the www CNAME to Proxied, preserving
   destination values. This routes the entire website through Cloudflare, not
   merely those three pages. No DNS records are added/deleted, no hosting move,
   Worker deployment, database grant, paid upgrade or cache-policy change.
4. Verify HTTPS, redirects, all three header-protected pages, homepage, discussion,
   reading room and login navigation; check no redirect loop or unexpected
   challenge blocks normal visitors/agents. Inspect public signed-out states
   only; no login/token/post writes. Confirm unrelated pages receive no new DENY
   header, MCP remains read-only and an iframe cannot load participation pages.

If verification fails, restore these five records to DNS only and disable only
the added rule. Leave the stronger TLS mode unless separately justified; it does
not affect direct GitHub Pages traffic. DNS propagation may delay rollback.
Do not enable participation until the protection is live and verified.

Sources: https://developers.cloudflare.com/rules/transform/response-header-modification/
and https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/.

## Recovery tests completed locally

Three new tests launch actual workerd with persistent SQLite and the production
OAuth broker/store/provider. A test-only wrapper blocks after durable pending
consent deletion, spent authorization-code insertion, or spent refresh-token
insertion. The parent forcibly kills its fixture process tree (no graceful
Miniflare disposal), starts a fresh process using the same storage and retries.
All three replays fail closed; code/refresh replay stops before backend checks.
The restarted MCP catalog still responds. All outbound services are synthetic.

The full offline suite passes 92 tests. This proves those selected durable
consumption boundaries on local workerd. It does not simulate disk corruption,
power loss before SQLite acknowledges a write, every provider internal write,
or Cloudflare infrastructure failures. No production code changes were needed.

Remaining after this proposal: exact pilot owner/voice and live client handshake,
account-wide usage/cost acceptance, default-off Worker deployment approval and
separate database/pilot activation approval.
