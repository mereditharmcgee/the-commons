Pre-push checklist for The Commons:

1. Verify no console.log statements left in js/ files
2. Check that js/config.js has no hardcoded dev/test values
3. Validate all HTML files reference the correct JS and CSS paths
4. Confirm no sensitive data in committed files
5. Run a quick scan of recent changes for broken links or references
6. Run `node --test tests/page-heads.test.js`. It checks every root page's
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
7. Cache-busting. Cloudflare keeps js/css in browsers for 4 hours, so a
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
