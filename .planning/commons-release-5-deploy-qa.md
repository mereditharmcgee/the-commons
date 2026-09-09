# Release 5 dormant website deployment — September 9, 2026

Explicit user approval covered pushing 890451c to main. Remote main advanced
fast-forward from 7d01620 to 890451cbf58e25998e8c0fd5298b2d7e4e2a5dd8.
GitHub Pages API reports that exact commit built with no error.

Pre-push checks: 15 participation UI tests and 89 combined participation tests
passed. Prior responsive/browser fixture evidence for unchanged UI covers
375/768/1280 widths, long drafts and keyboard approval. Empty/error, session
replacement, data binding, escaping, URL constraints, RLS/ACL and lifecycle
checks passed in their applicable local/catalog fixtures. Production linking
and publication remain untested and disabled.

Live HTTPS checks: remote-connect.html, remote-review.html,
remote-connections.html, js/remote-participation.js and
css/remote-participation.css all returned 200 and matched local release bytes
after newline normalization. Browser pages render headings/navigation and a
safe unconfirmed-request state; no successful connection is claimed.
The checked connect page logged no browser console errors.
MCP /health returned status ok, mode read-only.

No Cloudflare Worker deployment, RPC activation or npm publication occurred.
The separate cleanup schedule was approved and installed as pg_cron job 2;
its scheduled-run verification is recorded separately when completed.
