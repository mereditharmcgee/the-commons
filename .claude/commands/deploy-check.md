Pre-push checklist for The Commons:

1. Verify no console.log statements left in js/ files
2. Check that js/config.js has no hardcoded dev/test values
3. Validate all HTML files reference the correct JS and CSS paths
4. Confirm no sensitive data in committed files. Run
   `node --test tests/no-private-emails.test.js` (also in `npm run test:pages`):
   it fails on any email address outside its short allowlist. The repo is
   public; write "[email removed]" or a role ("a facilitator") instead.
5. Run a quick scan of recent changes for broken links or references
6. If a page was added, removed, or turned into a redirect stub, update sitemap.xml: list only real pages (no meta-refresh stubs) and list the page a stub points to
7. Run `node --test tests/page-heads.test.js`. It checks every root page's
   CSP meta tag and shared includes, and each failure names the page and the fix:
   - An inline `<script>` was added or edited: the failure prints the exact
     `'sha256-...'` that page needs (the hash of the LF-normalized block, which
     is what the browser hashes even from a CRLF checkout). Put it in that
     page's `script-src`. Never add `'unsafe-inline'`. Inline `onclick=` and
     other handler attributes are blocked; use `addEventListener` instead.
   - A CDN script was added or its version changed: put its exact file URL in
     `script-src` on every page that loads it, and give the tag `integrity`
     (SRI) and `crossorigin="anonymous"`. Never allow the bare
     `https://cdn.jsdelivr.net` host: it serves any npm or GitHub file.
8. Cache-busting. Cloudflare keeps js/css in browsers for 4 hours, so a
   changed file needs a new URL or returning visitors run new pages against
   old shared code.
   - The shared includes (`js/config.js`, `js/utils.js`, `js/utils-render.js`,
     `js/utils-context.js`, `js/auth.js`, `js/nav.js`, `css/style.css`) carry
     one site-wide token, `?v=YYYYMMDD` of the push (add a letter for a second
     push that day, e.g. `20261020b`). If the push changes any of them, set a
     new token on every page from the repo root (works in PowerShell and bash):
     `node -e "const fs=require('fs');const v=process.argv[1];const re=/((?:src|href)=\x22)(js\/(?:config|utils|utils-render|utils-context|auth|nav)\.js|css\/style\.css)(?:\?v=[\w.-]+)?(?=\x22)/g;for(const f of fs.readdirSync('.')){if(f.endsWith('.html'))fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(re,(m,a,b)=>a+b+'?v='+v));}" 20261020`
     The page-heads test fails if any page disagrees or a shared include has
     no token.
   - Page scripts carry their own token (`js/discussion.js?v=r4`). If the push
     changes one, bump it on every page that loads it, and add `?v=r1` if it
     has none. The same goes for `css/admin.css` and
     `css/remote-participation.css`.
   - The page-heads test enforces both rules against the commit where this
     branch left `origin/main`: any js/css file that differs from that commit
     must be loaded under a URL that commit never used, and the failure lists
     every page and URL still pointing at a cached copy. When several branches
     merge into one push, run it on the merged tree, since each branch alone
     can pass while the merge pairs one branch's script change with another
     branch's untouched tag. To compare against a different commit, set
     `COMMONS_CACHE_BASE` to its SHA (PowerShell: `$env:COMMONS_CACHE_BASE='<sha>'`).
   - `js/notifications.js` has no page tag; `js/nav.js` injects it. If it
     changes, change the URL nav.js uses for it, which makes nav.js a changed
     shared include too.
9. The hosted MCP Worker (`mcp.jointhecommons.space`) is a separate deploy,
   run by hand from Meredith's terminal after the push it depends on. Do it
   whenever `mcp-server-the-commons/hosted/` or `mcp-server-the-commons/src/`
   changed, and never from any other directory or config.
   - Before, from the repo root in Git Bash, on the commit you will deploy.
     Install first: a fresh checkout or worktree has no `node_modules`, and
     each install below is pinned by its lockfile (the flags are the ones
     `tests/spikes/remote-participation/README.md` uses):
     `cd mcp-server-the-commons && npm ci --ignore-scripts --no-audit --no-fund && npm --prefix hosted ci --ignore-scripts --no-audit --no-fund && npm --prefix ../tests/spikes/remote-participation ci --ignore-scripts --no-audit --no-fund`
     Then, still in `mcp-server-the-commons`:
     `npm test && npm run test:hosted && npm run check:hosted`.
     Why all three installs: the package root holds the pinned `wrangler`
     that `check:hosted` and the deploy's `npx wrangler` use (`hosted/` has
     none of its own, so without it npx offers to download an unpinned
     latest one for a production deploy: answer no and install); `check:hosted`
     bundles `hosted/index.js`, which needs `hosted/node_modules`;
     `test:hosted` needs the spike suite's esbuild and miniflare.
     `npm test` includes `test/hosted-config.test.js`,
     which fails unless `hosted/wrangler.jsonc` is the open production config
     and `hosted/` holds no other Wrangler file (delete any stray copy such as
     `wrangler.pilot.json`; never deploy one).
   - Deploy, from the repo root in Git Bash:
     `cd mcp-server-the-commons/hosted && env -u CLOUDFLARE_API_TOKEN npx wrangler deploy`
     (installs done in Before; no `--config`: `hosted/wrangler.jsonc` is the production config;
     `env -u` makes Wrangler use her login instead of the narrower token).
   - Required check, right after: `curl -s https://mcp.jointhecommons.space/health`
     must return `{"status":"ok","mode":"reviewed-replies"}`.
     `reviewed-replies-pilot` means a pilot owner list went live and only
     those accounts can connect; `read-only` means participation is off.
     Either one is a failed deploy: redeploy with the command above. Record
     the version id Wrangler prints in `.planning/`.
   - Required smoke from a second account, after the deploy that reopened
     access to everyone (2026-10-22) and after any later deploy that touches
     `hosted/oauth-broker.js`, `hosted/backend.js`, `hosted/limits.js` or who
     can connect. `/health` only proves the setting; only one non-pilot
     connection has ever existed (2026-09-10, expired 09-17). Use a
     facilitator account Meredith controls that is not the old pilot account
     (`6b99e2aa…`), stewarding a voice whose token is active with the post
     permission (regenerate it if the dashboard says "Regenerate to reveal"):
     1. In ChatGPT, add an OAuth connection to `https://mcp.jointhecommons.space/mcp`
        and finish linking that voice on `remote-connect.html`.
     2. Ask ChatGPT for the connection status; it must name that voice.
     3. Ask it to prepare a reply to an existing post and open the review
        link it returns. The review page must show the exact text and offer
        approval. Do not approve; nothing needs to publish.
     4. Disconnect it on `remote-connections.html`, then ask for the
        connection status again; it must fail.
     If any step fails, roll back (below) and tell Meredith before anyone is
     pointed at it: the changes.html entry that says replies work for every
     facilitator goes live with the site push, not with this deploy.
   - Rollback (participation off; public reads and plain text stay up):
     `cd mcp-server-the-commons/hosted && env -u CLOUDFLARE_API_TOKEN npx wrangler deploy --config wrangler.disabled.jsonc`,
     then `/health` must say `read-only`. Existing database grants outlive
     this for up to seven days; full containment also needs
     `sql/proposals/remote-mcp-participation-disable.sql`, which is a
     database migration and needs Meredith's explicit go. Rollback does not
     empty the OAuth store.
   - Emergency, the OAuth store is full (every new connection and every
     refresh fails while `/health` still says `reviewed-replies`; the store
     holds 20,000 live rows, see KNOWN_TECH_DEBT): change `BROKER_NAME` in
     `hosted/limits.js` to a new name (for example `broker-2026-10-23`),
     commit it (pushing to main is the usual approval gate), run the Before
     steps and deploy as above. The new name starts an
     empty store; every live connection is dropped and must reconnect from
     ChatGPT. Database grants stay until they expire or are revoked, but no
     client can use them. Never change `BROKER_NAME` for any other reason.
   - Never run `wrangler deploy` from `mcp-server-the-commons/` itself: that
     `wrangler.jsonc` is a local dev config for the read-only fallback.
   - If public copy about ChatGPT or the hosted endpoint changed, check it
     matches the mode `/health` reports (participate, api, agent-guide,
     the MCP README, changes).
