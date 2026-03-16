# Phase 5: Dependency Security - Research

**Researched:** 2026-02-27
**Domain:** Subresource Integrity (SRI), Content Security Policy (CSP), rel="noopener noreferrer"
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SECR-04 | Supabase JS pinned to exact version (not floating `@2`) with SRI hash on all pages | SRI hash computed for `@2.98.0/dist/umd/supabase.js`; all 27 pages audited |
| SECR-05 | `<meta http-equiv="Content-Security-Policy">` tag added to all HTML pages | CSP directive set defined; inline-script hashes computed for all 23 pages with inline blocks |
| SECR-06 | `rel="noopener noreferrer"` added to all `target="_blank"` links across all pages | 91 instances identified; 0 currently have the rel attribute |
</phase_requirements>

---

## Summary

Phase 5 covers three independent security hardening tasks across 27 HTML pages. Each task is mechanical but requires careful execution at scale. The work is pure HTML editing — no JavaScript changes, no new libraries.

**SECR-04 (Supabase SRI):** All 27 HTML files currently load Supabase via the floating `@2` URL (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`). This URL serves a **dynamically minified file** — jsDelivr minifies it on-the-fly, so its bytes change and SRI hashing is impossible. The fix is a two-part change per file: pin the exact version+path in the URL, then add the `integrity` and `crossorigin` attributes. The correct URL is `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.98.0/dist/umd/supabase.js` and its SHA384 hash has been pre-computed (see Code Examples). The 4 pages that already have DOMPurify with SRI from Phase 4 still need their Supabase tag updated.

**SECR-05 (CSP meta tag):** GitHub Pages cannot set HTTP headers, so `<meta http-equiv="Content-Security-Policy">` is the only available mechanism. The site loads scripts from exactly one CDN (`cdn.jsdelivr.net`) plus local files, makes API/WebSocket calls to one Supabase project (`dfephsfberzadihcrhal.supabase.co`), and loads fonts from Google Fonts via CSS `@import`. The inline-script blocker is the key complexity: 23 of 27 pages have inline `<script>` blocks. Using `'unsafe-inline'` negates XSS protection for script-src. Using per-page SHA256 hashes is technically precise and feasible — there are only 8 distinct inline-script hash values across all 23 pages, with 15 pages sharing one common hash. A single CSP with all 8 hashes in `script-src` works on every page because browsers ignore hashes that don't match any scripts on the current page. This is the recommended approach.

**SECR-06 (noopener noreferrer):** There are exactly 91 `target="_blank"` links across all 27 pages, none currently have `rel="noopener noreferrer"`. The links are repetitive (Ko-fi and GitHub links appear on virtually every page). The fix is straightforward text replacement.

**Primary recommendation:** Run these as three sequential plans within Phase 5: SECR-06 (noopener — trivial, validate approach), then SECR-04 (Supabase SRI — all 27 pages), then SECR-05 (CSP meta tag — all 27 pages). All three tasks are pure HTML edits with no JS changes required.

---

## Standard Stack

This phase uses no external libraries. All work is HTML attribute editing.

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Subresource Integrity (SRI) | W3C spec | Verify CDN files haven't been tampered with | Browser-native; requires no dependencies |
| Content Security Policy (CSP) | Level 2/3 | Restrict script/resource sources | Browser-native security policy mechanism |
| `rel="noopener noreferrer"` | HTML spec | Prevent target tab from accessing opener window | Browser-native; prevents reverse tabnapping |

### No New Dependencies

No `npm install` step. No library additions. This phase is pure HTML markup.

---

## Architecture Patterns

### Pattern 1: SRI-Pinned CDN Script Tag

**What:** Pin to exact version + explicit file path, add integrity hash and crossorigin attribute.

**Critical rule:** Never use SRI on jsDelivr's default CDN URL format (`@2` or `@latest`). jsDelivr dynamically minifies these, producing different bytes each request. Always use a URL that explicitly names the file path.

**Wrong (current — dynamic minification, cannot SRI-hash):**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

**Correct (static file, hashable):**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.98.0/dist/umd/supabase.js"
    integrity="sha384-NRo2jhGGHu91p1IOcVC3UWI5Vnd+xGXfD/8N7Hr9+aGTK0d/Pl0i+kUZsB/zIlrK"
    crossorigin="anonymous"></script>
```

Source: jsDelivr SRI documentation — https://www.jsdelivr.com/using-sri-with-dynamic-files

### Pattern 2: CSP Meta Tag with Hash-Based Inline Script Allowlist

**What:** Single `<meta>` tag in `<head>` that lists allowed sources for scripts, styles, and connections.

**CSP directive breakdown for this project:**
- `default-src 'self'` — fallback for unspecified resource types
- `script-src 'self' https://cdn.jsdelivr.net <sha256-hashes>` — allow local scripts, jsDelivr CDN, and specific inline script hashes
- `style-src 'self' https://fonts.googleapis.com` — allow local CSS and Google Fonts CSS import
- `font-src https://fonts.gstatic.com` — allow Google Fonts font files
- `connect-src 'self' https://dfephsfberzadihcrhal.supabase.co wss://dfephsfberzadihcrhal.supabase.co` — Supabase REST + realtime WebSocket
- `img-src 'self' data:` — allow local images and data: URIs (SVG favicon uses data: URI)
- `object-src 'none'` — disable Flash/plugin content
- `base-uri 'self'` — prevent base tag injection

**Note on about.html Ko-fi widget:** `about.html` loads `https://storage.ko-fi.com/cdn/widget/Widget_2.js`. This third-party script is NOT included in the global CSP `script-src` because it only appears on one page. Adding it globally would widen the attack surface of all other pages. The planner must decide: either (a) add `https://storage.ko-fi.com` to the global CSP, accepting the tradeoff, or (b) use a per-page override for about.html only, or (c) document it as a known exception. This is an open question — see Open Questions.

**Example meta tag (before inline-script hashes are filled in):**
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://cdn.jsdelivr.net 'sha256-HASH1' 'sha256-HASH2' ...;
  style-src 'self' https://fonts.googleapis.com;
  font-src https://fonts.gstatic.com;
  connect-src 'self' https://dfephsfberzadihcrhal.supabase.co wss://dfephsfberzadihcrhal.supabase.co;
  img-src 'self' data:;
  object-src 'none';
  base-uri 'self'
">
```

Source: MDN Content-Security-Policy — https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy

**Meta tag limitations vs HTTP header:** `frame-ancestors` and `report-uri` directives are NOT supported in meta tags (only in HTTP headers). Since GitHub Pages doesn't allow custom HTTP headers, these directives cannot be used. The meta tag approach is the only option for this project.

Source: MDN CSP meta element — https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy

### Pattern 3: rel="noopener noreferrer" on External Links

**What:** Every `<a target="_blank">` must have `rel="noopener noreferrer"`.

**Why two values:**
- `noopener`: Prevents the opened tab from accessing `window.opener`, blocking reverse tabnapping attacks
- `noreferrer`: Prevents sending the Referrer header and also implies `noopener`

**Pattern:**
```html
<!-- Wrong (current) -->
<a href="https://github.com/..." target="_blank">GitHub</a>

<!-- Correct -->
<a href="https://github.com/..." target="_blank" rel="noopener noreferrer">GitHub</a>
```

Source: MDN HTML anchor rel attribute — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/noopener

### Anti-Patterns to Avoid

- **Using `@2` URL for SRI:** The `@2` URL returns dynamically minified content — the bytes differ each time. jsDelivr explicitly warns against SRI on such URLs. Always use `@2.98.0/dist/umd/supabase.js`.
- **Using `'unsafe-inline'` in script-src:** Defeats the purpose of CSP's XSS protection. Use per-page hashes instead.
- **Using SRI without `crossorigin="anonymous"`:** The `crossorigin` attribute is required for SRI checking of cross-origin resources. Omitting it causes browsers to silently skip SRI verification.
- **Omitting CSP meta tag from `<head>`:** CSP meta tags must appear in `<head>` before any resources they're meant to protect. A meta tag in `<body>` may not apply to resources loaded before it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SRI hash computation | Manual hash math | `curl ... \| openssl dgst -sha384 -binary \| openssl base64 -A` | Standard command; produces correct format |
| CSP inline-script hashes | Manual hashing | Python hashlib script (see Code Examples) | Whitespace-sensitive; manual errors likely |
| Finding all blank-target links | Visual scan | `grep -rn 'target="_blank"' *.html` | 91 instances across 27 files; manual is error-prone |

**Key insight:** All three operations can be automated via grep/curl/openssl/python. The planner should include exact verification commands in each plan.

---

## Common Pitfalls

### Pitfall 1: Hashing the Wrong Supabase URL
**What goes wrong:** Developer computes hash for the dynamic `@2` URL, adds it to script tag — browser immediately blocks the script because the hash never matches (dynamic minification changes bytes each request).
**Why it happens:** The `@2` URL resolves to the latest 2.x version but serves dynamically minified content. jsDelivr's own docs warn "Do NOT use SRI with dynamically generated files."
**How to avoid:** Always use `@2.98.0/dist/umd/supabase.js` (explicit version + explicit file path) — this is a static file with stable bytes.
**Warning signs:** Browser DevTools shows "Failed to find a valid digest in the 'integrity' attribute" on the Supabase script.

### Pitfall 2: CSP Blocks Inline Scripts Without Hashes
**What goes wrong:** CSP meta tag is added but doesn't include `'unsafe-inline'` or script hashes — all 23 pages with inline `<script>` blocks stop working.
**Why it happens:** By default, CSP blocks all inline scripts unless explicitly allowed.
**How to avoid:** Compute SHA256 hashes for all inline script blocks BEFORE writing the CSP. Include all 8 distinct hashes in the `script-src` directive.
**Warning signs:** Browser DevTools shows "Refused to execute inline script because it violates the following Content Security Policy directive."

### Pitfall 3: CSP Blocks Supabase WebSocket (chat.html)
**What goes wrong:** CSP is added without `wss://dfephsfberzadihcrhal.supabase.co` in `connect-src` — chat.html realtime stops working because WebSocket is blocked.
**Why it happens:** `connect-src` controls WebSocket connections (wss://). Omitting the wss:// form blocks it even if https:// is allowed.
**How to avoid:** Include BOTH `https://dfephsfberzadihcrhal.supabase.co` AND `wss://dfephsfberzadihcrhal.supabase.co` in `connect-src`.
**Warning signs:** chat.html shows no messages loading; WebSocket connection error in browser DevTools Network tab.

### Pitfall 4: CSP Breaks Google Fonts
**What goes wrong:** Fonts stop loading — site renders in system fonts.
**Why it happens:** Google Fonts loads via two origins: `fonts.googleapis.com` (the CSS) and `fonts.gstatic.com` (the actual font files). Forgetting `font-src` or `style-src` for Google blocks one or both.
**How to avoid:** Include `style-src 'self' https://fonts.googleapis.com` and `font-src https://fonts.gstatic.com` in the CSP.
**Warning signs:** Browser DevTools shows "Refused to load the font" or fonts revert to system defaults.

### Pitfall 5: Inline Script Hash Whitespace Sensitivity
**What goes wrong:** Hash is computed but doesn't match — browser blocks the inline script.
**Why it happens:** The SHA256 hash for an inline script includes every character including leading/trailing whitespace and newlines. If the script content is `\n        Auth.init();\n    ` the hash must be computed on EXACTLY that string — the content BETWEEN `<script>` and `</script>`.
**How to avoid:** Use the Python script in Code Examples to compute hashes from the actual files, not from approximations. Do NOT add or remove whitespace from inline scripts after computing hashes.
**Warning signs:** Browser DevTools shows "Content Security Policy: inline script blocked" with a hash mismatch.

### Pitfall 6: about.html Ko-fi Widget Script Not in CSP
**What goes wrong:** Ko-fi widget fails to load on about.html with CSP blocking `storage.ko-fi.com`.
**Why it happens:** The Ko-fi widget loads from `https://storage.ko-fi.com/cdn/widget/Widget_2.js` — a third-party CDN not included in the global CSP.
**How to avoid:** Either add `https://storage.ko-fi.com` to the global CSP (accepted tradeoff), or apply a separate, more permissive CSP meta tag only in about.html (two meta tags with the same `http-equiv` — last one wins in some browsers, behavior is inconsistent). The safest solution is to add `https://storage.ko-fi.com` to the global CSP `script-src`.
**Warning signs:** Ko-fi widget disappears from about.html after CSP is added.

### Pitfall 7: Missing crossorigin Attribute on SRI Script Tags
**What goes wrong:** SRI hash is present but browser silently skips verification and may block the resource in some configurations.
**Why it happens:** SRI checking for cross-origin resources requires the `crossorigin` attribute to trigger CORS mode. Without it, the browser may refuse to check the hash.
**How to avoid:** Always pair `integrity="..."` with `crossorigin="anonymous"`.
**Warning signs:** No explicit error — resource loads but SRI was never enforced.

---

## Code Examples

All verified via direct command execution in this session.

### SECR-04: Supabase SRI Hash (Verified 2026-02-27)

The current Supabase JS version on jsDelivr is 2.98.0 (released 2026-02-26).

**Command to regenerate hash (run if version is updated):**
```bash
curl -s "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.98.0/dist/umd/supabase.js" | openssl dgst -sha384 -binary | openssl base64 -A
```

**Current hash:** `NRo2jhGGHu91p1IOcVC3UWI5Vnd+xGXfD/8N7Hr9+aGTK0d/Pl0i+kUZsB/zIlrK`

**Replacement script tag for all 27 HTML files:**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.98.0/dist/umd/supabase.js"
    integrity="sha384-NRo2jhGGHu91p1IOcVC3UWI5Vnd+xGXfD/8N7Hr9+aGTK0d/Pl0i+kUZsB/zIlrK"
    crossorigin="anonymous"></script>
```

Note: On the 4 pages that already have DOMPurify (chat.html, discussion.html, postcards.html, text.html), the Supabase tag appears AFTER DOMPurify — preserve that ordering.

### SECR-05: Inline Script SHA256 Hashes (Computed 2026-02-27)

These are the 8 distinct inline script hashes for the 23 pages that have inline scripts. Each hash was computed from the exact content between `<script>` and `</script>` tags using `hashlib.sha256(content.encode('utf-8'))`.

| Hash | Pages Using It |
|------|----------------|
| `sha256-dptEh/JzFYXFzlMhpnxf7BFQPVCCqLJfAFiNl0PYKcU=` | about.html (Auth.init block), chat.html, constitution.html, discussion.html, discussions.html, moment.html, moments.html, postcards.html, propose.html, reading-room.html, roadmap.html, search.html, submit.html, suggest-text.html, text.html (15 pages — simple `Auth.init()` inline block) |
| `sha256-AmGvtDAkv/U6sY31qctvMI13eS/PK4mLWMxS0mpjCyU=` | about.html only — Ko-fi widget inline init call (`kofiwidget2.init(...);kofiwidget2.draw();`) |
| `sha256-5/+tr6pajWLn1EMnNqD8G8ROaTMezRxiuDVqusamKAg=` | agent-guide.html |
| `sha256-3VoNQXcTAIhqvOpAynL0bQqKyc5aySlYbS5FXeiKplw=` | api.html |
| `sha256-5vsNBx1i0x7j5KGDiOK35Segml2RZbH+lEfvjFKwK88=` | claim.html |
| `sha256-VSyVr5+j6OQM5AeWfOQQfMvc6L6d3IAFgbYKkjstIFE=` | contact.html |
| `sha256-B0/QCsSJo7JEZPNCUpm0ACmeZMF0DwkTXcc2OKlwVw0=` | index.html |
| `sha256-H29Z3oYLhFB6oeCtS9mYXhJLGzfwDvE+VyMiA8nYtY8=` | login.html |
| `sha256-/Syw3BObAEQeAhc7W/96pkHR6FNkiAQChzOXOGGYBHw=` | participate.html |
| `sha256-7mR6jWtMXpj3YX5hY4wjjmMzW6HM1pypl7u2u7aR2+w=` | reset-password.html |

**IMPORTANT:** about.html has 2 inline script blocks: (1) the Ko-fi widget init call hashed as `sha256-AmGvtDAkv/U6sY31qctvMI13eS/PK4mLWMxS0mpjCyU=`, and (2) the standard Auth.init() block hashed as `sha256-dptEh/...` (shared with 14 other pages). Both hashes must be included in the CSP. The executor must re-verify all hashes using the command below before writing any CSP tags, since any whitespace change invalidates a hash.

**Command to regenerate all hashes (run before writing CSP):**
```bash
python3 -c "
import re, os, hashlib, base64
html_dir = 'C:/Users/mmcge/the-commons'
for filename in sorted(os.listdir(html_dir)):
    if not filename.endswith('.html'):
        continue
    filepath = os.path.join(html_dir, filename)
    content = open(filepath, encoding='utf-8', errors='ignore').read()
    inline = re.findall(r'<script(?![^>]*\bsrc\b)[^>]*>(.*?)</script>', content, re.DOTALL)
    for s in inline:
        h = hashlib.sha256(s.encode('utf-8')).digest()
        b64 = base64.b64encode(h).decode()
        print(f'{filename}: sha256-{b64}')
"
```

**The CSP meta tag to add to every HTML page:**
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://storage.ko-fi.com 'sha256-dptEh/JzFYXFzlMhpnxf7BFQPVCCqLJfAFiNl0PYKcU=' 'sha256-AmGvtDAkv/U6sY31qctvMI13eS/PK4mLWMxS0mpjCyU=' 'sha256-5/+tr6pajWLn1EMnNqD8G8ROaTMezRxiuDVqusamKAg=' 'sha256-3VoNQXcTAIhqvOpAynL0bQqKyc5aySlYbS5FXeiKplw=' 'sha256-5vsNBx1i0x7j5KGDiOK35Segml2RZbH+lEfvjFKwK88=' 'sha256-VSyVr5+j6OQM5AeWfOQQfMvc6L6d3IAFgbYKkjstIFE=' 'sha256-B0/QCsSJo7JEZPNCUpm0ACmeZMF0DwkTXcc2OKlwVw0=' 'sha256-H29Z3oYLhFB6oeCtS9mYXhJLGzfwDvE+VyMiA8nYtY8=' 'sha256-/Syw3BObAEQeAhc7W/96pkHR6FNkiAQChzOXOGGYBHw=' 'sha256-7mR6jWtMXpj3YX5hY4wjjmMzW6HM1pypl7u2u7aR2+w='; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://dfephsfberzadihcrhal.supabase.co wss://dfephsfberzadihcrhal.supabase.co; img-src 'self' data:; object-src 'none'; base-uri 'self'">
```

**Placement:** As the last `<meta>` tag inside `<head>`, before the first `<link>` or `<script>` tags.

**NOTE for executor:** The inline-script hashes are fragile — if whitespace inside any `<script>` block is modified (e.g., by editor auto-formatting), the hash changes and the CSP blocks that page's inline script. Verify hashes AFTER all other edits in the phase are complete.

### SECR-06: noopener noreferrer Pattern

**Find all offending links:**
```bash
grep -rn 'target="_blank"' C:/Users/mmcge/the-commons/*.html | grep -v 'noopener\|noreferrer'
```
Current count: 91 instances across all 27 pages.

**The fix is straightforward substitution:**
```html
<!-- Before -->
<a href="https://ko-fi.com/mmcgee" target="_blank">Support</a>

<!-- After -->
<a href="https://ko-fi.com/mmcgee" target="_blank" rel="noopener noreferrer">Support</a>
```

**Verify after fix:**
```bash
grep -rn 'target="_blank"' C:/Users/mmcge/the-commons/*.html | grep -v 'noopener\|noreferrer' | wc -l
# Must return 0
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Floating CDN version `@2` | Pinned exact version `@2.98.0` + explicit file path | Deterministic builds; SRI becomes possible |
| No `integrity` attribute | `integrity="sha384-..."` + `crossorigin="anonymous"` | Browser verifies file hasn't been tampered |
| No CSP | Hash-based CSP meta tag | XSS mitigation even if attacker injects script tags |
| `target="_blank"` without rel | `rel="noopener noreferrer"` | Prevents reverse tabnapping |

**Current state of the project:**
- Supabase: Floating `@2` on all 27 pages, zero SRI coverage
- CSP: Zero coverage across all 27 pages
- noopener: Zero coverage — all 91 blank-target links unprotected
- DOMPurify: 4 pages already have SRI from Phase 4 (pattern established, reuse it)

---

## Open Questions

1. **Ko-fi widget in about.html**
   - What we know: `about.html` loads `https://storage.ko-fi.com/cdn/widget/Widget_2.js` — a third-party script. The inline `kofiwidget2.init(...)` call is also an inline script that must be hashed.
   - What's unclear: Should `https://storage.ko-fi.com` be added to the global `script-src` (affects all 27 pages), or should about.html get a separate CSP that is more permissive? Note that two `<meta http-equiv="Content-Security-Policy">` tags in one page have inconsistent behavior across browsers — the safest approach is one global CSP that includes `storage.ko-fi.com`.
   - Recommendation: Add `https://storage.ko-fi.com` to the global `script-src`. The tradeoff (all pages nominally allow storage.ko-fi.com) is acceptable since only about.html actually loads it and browsers only enforce CSP against resources actually requested.

2. **Supabase version update cadence**
   - What we know: Supabase released `2.98.0` on 2026-02-26 (yesterday). The project currently loads `@2` which would have auto-updated. Pinning to `2.98.0` freezes the version.
   - What's unclear: How often should the pinned version be updated? Supabase releases frequently.
   - Recommendation: Document in a comment in each HTML file that the version is intentionally pinned. Version bumps are a deliberate maintenance action. The Phase 5 task is to pin to `2.98.0` — version updates are out of scope.

3. **CSP hash maintenance burden**
   - What we know: If any inline script is modified in a future phase, its hash must be recomputed and the CSP updated on that page.
   - What's unclear: Future phases may modify inline scripts (Phases 6-10 are ongoing).
   - Recommendation: The executor should add a comment near the CSP meta tag: `<!-- CSP hashes: run scripts/compute-csp-hashes.py to regenerate after inline script changes -->`. The hash-computation Python command should be saved as a reusable script.

---

## Scope Inventory

### Pages requiring Supabase SRI update (SECR-04): 27 files

All 27 HTML files currently have `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">`:
about.html, admin.html, agent-guide.html, api.html, chat.html, claim.html, constitution.html, contact.html, dashboard.html, discussion.html, discussions.html, index.html, login.html, moment.html, moments.html, participate.html, postcards.html, profile.html, propose.html, reading-room.html, reset-password.html, roadmap.html, search.html, submit.html, suggest-text.html, text.html, voices.html

### Pages requiring noopener (SECR-06): 27 files, 91 instances

All 27 pages have at least one `target="_blank"` link without `rel="noopener noreferrer"`.

### Pages requiring CSP meta tag (SECR-05): 27 files

All 27 pages need the `<meta http-equiv="Content-Security-Policy">` tag added to `<head>`.

### Pages with inline scripts (need hash coverage): 23 files

about.html, agent-guide.html, api.html, chat.html, claim.html, constitution.html, contact.html, discussion.html, discussions.html, index.html, login.html, moment.html, moments.html, participate.html, postcards.html, propose.html, reading-room.html, reset-password.html, roadmap.html, search.html, submit.html, suggest-text.html, text.html

### Pages with NO inline scripts (simpler CSP): 4 files

admin.html, dashboard.html, profile.html, voices.html

---

## Sources

### Primary (HIGH confidence)
- MDN Content-Security-Policy — https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy
- MDN connect-src directive — https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/connect-src
- MDN noopener — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/noopener
- jsDelivr SRI documentation — https://www.jsdelivr.com/using-sri-with-dynamic-files
- jsDelivr package API — https://data.jsdelivr.com/v1/package/npm/@supabase/supabase-js@2.98.0
- Direct hash computation via curl+openssl (verified in this session)
- Direct file inspection of all 27 HTML files in this project

### Secondary (MEDIUM confidence)
- web.dev strict-csp article — https://web.dev/articles/strict-csp (hash-based CSP for static sites)
- OWASP CSP Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html

### Tertiary (LOW confidence)
- None — all key claims verified against official sources or direct file inspection

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all browser-native security features
- Architecture (SRI): HIGH — verified by computing actual hashes from actual CDN files
- Architecture (CSP): HIGH — directives verified against MDN; inline hashes computed from actual project files
- Architecture (noopener): HIGH — 91 instances identified by direct grep
- Pitfalls: HIGH — derived from direct file analysis and MDN/jsDelivr official documentation

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (SRI hash valid as long as supabase@2.98.0 remains on jsDelivr; inline-script hashes valid until any inline script is modified)
