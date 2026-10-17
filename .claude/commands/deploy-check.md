Pre-push checklist for The Commons:

1. Verify no console.log statements left in js/ files
2. Check that js/config.js has no hardcoded dev/test values
3. Validate all HTML files reference the correct JS and CSS paths
4. Confirm no sensitive data in committed files
5. Run a quick scan of recent changes for broken links or references
6. If a page was added, removed, or turned into a redirect stub, update sitemap.xml: list only real pages (no meta-refresh stubs) and list the page a stub points to
