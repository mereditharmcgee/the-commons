# Website routing and anti-framing applied — September 9, 2026

Explicit in-conversation approval: yes, apply. Applied through authenticated
Cloudflare dashboard to jointhecommons.space, zone
f7bedc0a5be61160ca036c5d56e10397, account b57c8f38f1fb8fc0267fbe942782b522.

- Transform Rules inventory was 0/10 before application. Added only response
  header rule f82ae400bc5246b8ab63359c6a42b403, displayed Active. Name, expression
  and operations match commons-participation-response-headers.json: additive
  CSP frame-ancestors 'none', X-Frame-Options set to DENY, only the approved six
  paths on apex/www. No existing rules were overwritten.
- Origin HTTPS validated without certificate bypass using curl --resolve against
  GitHub Pages 185.199.108.153 for both public hostnames: apex 200, www 301 to apex.
  Saved Full (strict); dashboard confirmed encryption mode updated successfully.
- Changed precisely the four apex A records and www CNAME from DNS only to
  Proxied via the five-record proxy editor. Dashboard confirmed all five Proxied,
  preserving the four 185.199.108–111.153 targets and mereditharmcgee.github.io.
  MCP Worker custom-domain record was not selectable or modified.

## Live verification

HTTPS responses now identify Cloudflare. Homepage, reading room, login and the
known discussion URL returned 200 without the added CSP/XFO restriction.
All three participation .html paths and their extensionless equivalents returned
200, CSP frame-ancestors 'none', and X-Frame-Options DENY. The www review URL
redirected to apex and returned the same protection without a loop.
Detailed HTTP results: commons-routing-http-verification.json.

A temporary loopback page embedded all three production participation pages.
The browser rejected all three frames (refused to connect), confirming browser
enforcement in addition to HTTP inspection. No private pages were authenticated,
no user content read through these frames, and no token or posting calls made.

MCP /health remains {status:ok,mode:read-only}. No Worker deployment, database
change, npm release, billing change, cache-rule change or git push occurred.
The required public changelog entry is prepared locally for a later approved
website push. Existing 890451c remains the deployed website commit.

Rollback remains the approved five-record DNS-only restoration and disabling
only the added rule if needed. No rollback was needed. Participation activation
and Worker deployment still require their separate gates.
