# Drop `style-src 'unsafe-inline'` (KNOWN_TECH_DEBT: CSP style-src gap)

Status: draft, 2026-11-02. Nothing here is applied. Every page edit below is a
deploy, so it waits for Meredith's "push" like any other.

## What the gap is

36 of the 39 CSP pages still carry `style-src 'self' 'unsafe-inline'
https://fonts.googleapis.com` (the debt entry says 35; setup.html arrived
after it was written). Only agent-kit.html and the three remote-* pages are
clean. With `'unsafe-inline'`, any markup that slips past escaping can carry
its own `style=""`: a full-screen `position:fixed` panel with fake text, a
`display:none` on the real thread, an off-screen "sign in again" link. Script
is already pinned, so this is the main thing an HTML-injection slip can still
do.

It is a backstop. The audit on 2026-11-02 found no live injection path in js/
or the root pages; escaping is the defense, and stays the defense.

## What has to move

`node scripts/csp-style-inventory.js` (read-only) counts it per page. On
2026-11-02:

- 5 `<style>` blocks (about, changes, orientation, participate, report).
- 225 distinct `style=""` values across the 36 pages, 131 distinct site-wide.
  api.html (42) and agent-guide.html (34) hold a third of them.
- 50 distinct `style=""` values inside innerHTML templates in the js/ files
  those pages load (admin.js 13, text.js 7, dashboard.js, discussion.js and
  postcards.js 6 each).
- 2 template values that interpolate data, both in admin.js (the model bar:
  `width: ${pct}%; background: ${m.color}`). No hash can match these.

Not counted, because CSP does not block them: `el.style.x = ...` and
`el.style.cssText = ...` (CSSOM). The five modal overlays built with
`cssText` keep working as they are.

## Recommendation: hashes first, classes when you are in the file

**Stage 1 (one mechanical change, test-enforced).** Per page, replace
`'unsafe-inline'` with `'unsafe-hashes'` plus one `'sha256-...'` per distinct
`<style>` block and `style=""` value that page can produce, including the
values in its own js/ templates. `node scripts/csp-style-inventory.js --page
<page> --hashes` prints the exact `style-src` for one page. Before that, move
the two admin.js model-bar values to CSSOM: render the bar without `style=`,
then set `bar.style.width = pct + '%'` and `bar.style.background = m.color`
after the innerHTML assignment.

This is the same shape the site already uses for scripts: the allow-list is
exact, an edit to an inline style means a new hash, and the test tells you
which. What it buys: injected markup can no longer bring arbitrary CSS. What
it does not: injected markup can still reuse any hashed value or any class
in css/style.css. That residue is the same under Stage 2, because a class is
also reusable, so Stage 1 gets most of the benefit for a small fraction of
the churn.

**Stage 2 (opportunistic).** Move inline styles into classes in
css/style.css as feature work passes through a page, starting with api.html
and agent-guide.html, and drop each page's `'unsafe-hashes'` once its count
reaches zero. Do not do this as a sweep: 225 attributes across 36 pages is a
visual-regression risk with no staging environment to catch it.

## Test to add with Stage 1 (tests/page-heads.test.js)

A sketch, matching how the script-src test works:

```js
test("style-src has no 'unsafe-inline' and hashes every inline style", () => {
    for (const page of cspPages) {
        const styleSrc = load(page).csp['style-src'] || [];
        assert.ok(!styleSrc.includes("'unsafe-inline'"), `${page}: style-src allows 'unsafe-inline'`);
        for (const value of inlineStyleValues(page)) {      // blocks, attrs, and the page's js/ templates
            const hash = `'sha256-${sha256base64(value)}'`;
            assert.ok(styleSrc.includes(hash), `${page}: add ${hash} for style "${value.slice(0, 60)}"`);
        }
    }
});
```

`inlineStyleValues` is the extraction in scripts/csp-style-inventory.js;
move it into tests/lib/ when the test lands so both share one copy.

## Before shipping Stage 1, check

1. **Browser support for `'unsafe-hashes'`.** A browser that understands
   hashes but not `'unsafe-hashes'` blocks every `style=""` on the page, so
   layout degrades rather than fails open. Check current support (caniuse,
   "CSP: unsafe-hashes") and decide whether the long tail matters. Not checked
   in this session.
2. **Hash input.** Browsers hash the attribute value after HTML parsing, so
   `&quot;` and `&amp;` are decoded first (the script does this). For
   template values, the hash is of the string as it lands in the DOM. Verify
   on one page in a real browser (DevTools prints the hash it wanted for any
   blocked style) before rolling out.
3. **Shared templates.** nav.js and the utils files are loaded on every page.
   Today they produce no `style=""`; if one ever does, every page needs that
   hash. The test above catches it.
4. **Cache-busting.** Stage 1 edits only HTML heads, so no `?v=` bumps,
   except admin.js for the CSSOM change (`?v=rN` on admin.html).

## Related gaps from the same debt entry (cheap, separate)

- `form-action 'self'` can go on every page whose forms never post off-site.
  Pages that set it today: agent-kit and the three remote-* pages.
- The three meta-refresh stubs (discussions, moments, whats-new) still carry
  no CSP. They render nothing, so the risk is nil; a one-line
  `default-src 'none'` would make the test uniform.
- `Utils.sanitizeHtml` allows the `class` attribute through DOMPurify. Its
  only caller today is suggest-text.js, before storage, and the admin view
  escapes what it stores, so nothing renders through it. If a render path
  ever adopts it, drop `class` from `ALLOWED_ATTR` first, or it can reuse any
  layout class in css/style.css.
