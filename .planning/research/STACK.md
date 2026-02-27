# Technology Stack

**Project:** The Commons — Foundation Hardening
**Researched:** 2026-02-26
**Constraint:** Vanilla JS only. No framework. No build step. Static hosting on GitHub Pages.

---

## Context: What Already Exists

Before recommending additions, these are the tools and patterns already in the codebase:

| Component | Current State | Assessment |
|-----------|---------------|------------|
| XSS escaping | `Utils.escapeHtml()` (div/textContent trick) | Works. Not DOMPurify, but covers the primary case. |
| Supabase JS | `cdn.jsdelivr.net/npm/@supabase/supabase-js@2` | Unpinned major version (`@2`), not SRI-hashed. Risk. |
| Loading states | `.loading` / `.loading__spinner` CSS classes | Exists but inconsistently applied. |
| Retry logic | `Utils.withRetry()` | Solid. Handles AbortError from Supabase auth state changes. |
| Validation | Ad-hoc per-page (mix of `alert()` and `showMessage()`) | Inconsistent. No shared validation layer. |
| Linting | None | No package.json, no .eslintrc, no Prettier config. |
| CSP | None | GitHub Pages cannot set HTTP headers without a proxy. |
| Documentation | JSDoc: None. Inline comments in utils.js only. | No doc generation. |

---

## Recommended Stack

### Code Consistency Auditing

**Tool: ESLint (v9.x flat config, run via npx, no install required in repo)**

- **Why ESLint over alternatives:** Biome is faster but has less mature vanilla JS rule sets for browser globals. Oxlint is too new and ecosystem support for browser-specific rules is sparse. ESLint has the most mature ruleset for browser JS and runs via `npx eslint` with zero install in the repo.
- **Why not Prettier:** Formatting is a low-value consistency win for a solo project. ESLint with stylistic rules covers the important patterns (unused vars, == vs ===, innerHTML without escaping) that actually affect correctness.
- **Config approach:** Flat config (`eslint.config.js` or `eslint.config.mjs`) at repo root. No `node_modules` committed. Run via `npx eslint js/` as a one-shot audit tool during hardening.
- **Key rules to enable:**
  - `no-unused-vars` — identifies dead code
  - `eqeqeq` — enforces `===` throughout
  - `no-undef` — catches missing globals (catches forgotten `Utils.` prefix etc.)
  - `no-console` (warn) — flags debug console.log left in
  - `no-alert` — flags `alert()` calls (inconsistent UX pattern to eliminate)
- **Confidence:** HIGH — ESLint is the de facto standard. Flat config is the current format as of ESLint v9.

**Version:** ESLint 9.x (current as of Feb 2026, confirmed by npmjs.com history). Run via `npx eslint@9` to avoid global install.

**What NOT to use:**
- TypeScript — introduces a build step and type annotation maintenance; architecture explicitly excludes this.
- Biome — faster but insufficient browser JS rule coverage for this codebase's patterns.
- JSHint — abandoned; ESLint replaced it.

---

### Security: XSS Prevention

**Tool: DOMPurify (loaded via CDN, no build step)**

- **Current gap:** `Utils.escapeHtml()` uses the div/textContent trick, which is correct for *text content* but does not sanitize HTML markup. The `formatContent()` function processes user text through escapeHtml then injects HTML for bold/links — this is correct. However, there are 23 `innerHTML = \`template\`` calls across 12 JS files. Each one is a potential XSS vector if any interpolated variable ever contains unescaped user input.
- **Why DOMPurify:** It is the most widely adopted, battle-tested HTML sanitizer in the browser JS ecosystem. It is actively maintained (cure53), has no dependencies, and ships as a single ES module or UMD script. It works without a build step via CDN.
- **CDN pattern (no build step):**
  ```html
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"
          integrity="sha384-[hash]"
          crossorigin="anonymous"></script>
  ```
- **Integration strategy:** Do NOT replace all `innerHTML` calls. Instead:
  1. Any user-generated content interpolated into innerHTML should go through `DOMPurify.sanitize()`.
  2. `Utils.escapeHtml()` remains for plain text contexts (attribute values, textContent assignments).
  3. Add `DOMPurify.sanitize()` as `Utils.sanitizeHtml()` in utils.js — single wrapper so future code uses consistent API.
- **Version:** DOMPurify 3.x (3.2.x as of early 2026). Do NOT use 2.x — 3.x has better default-deny for dangerous attributes.
- **Confidence:** HIGH — DOMPurify is the standard. OWASP recommends it explicitly.

**What NOT to use:**
- Rolling your own allowlist — maintenance burden, easy to miss edge cases.
- `sanitize-html` npm package — requires build step.
- DOMParser-based approaches — not safe; browsers differ in parsing behavior.

---

### Security: Subresource Integrity (SRI) for CDN Scripts

**Approach: Add `integrity` + `crossorigin` attributes to all CDN script tags**

- **Current gap:** All pages load `@supabase/supabase-js@2` and (proposed) DOMPurify without SRI hashes. A CDN compromise would silently inject malicious code.
- **Why this matters:** GitHub Pages serves over HTTPS. Supabase JS is loaded from jsDelivr on every page (~25 HTML files). SRI is the standard mitigation for CDN supply chain attacks.
- **Implementation:** For each CDN script, add the `integrity="sha384-[hash]"` and `crossorigin="anonymous"` attributes. Hash generated with: `openssl dgst -sha384 -binary purify.min.js | openssl base64 -A`.
- **Critical decision:** Pin to exact versions (`@2.47.0`, not `@2`) so the hash is stable. The current `@2` tag means jsDelivr resolves to latest 2.x — SRI would break on every patch update if `@2` is used.
- **Confidence:** HIGH — SRI is a W3C standard. Browser support is universal in modern browsers.

---

### Security: Content Security Policy (GitHub Pages Limitation)

**Approach: `<meta http-equiv="Content-Security-Policy">` in HTML head**

- **Why not server headers:** GitHub Pages does not support custom HTTP headers. There is no server-side configuration available.
- **Why meta CSP is the fallback:** The HTML `<meta>` CSP tag is supported in all modern browsers and enforces policy at parse time. It has one limitation vs header CSP: it cannot set `frame-ancestors`, `sandbox`, or `report-uri` directives. For XSS prevention purposes, the other directives work.
- **Recommended policy (starter):**
  ```html
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self';
                 script-src 'self' https://cdn.jsdelivr.net;
                 connect-src 'self' https://*.supabase.co wss://*.supabase.co;
                 img-src 'self' data:;
                 style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
                 font-src 'self' https://fonts.gstatic.com;">
  ```
- **Note on `unsafe-inline`:** The codebase has inline `<style>` blocks across HTML files and inline event handlers (`onclick=`). A strict CSP without `unsafe-inline` would require refactoring those. For hardening phase, `unsafe-inline` for styles is acceptable. Inline event handlers (`onclick=`) need audit.
- **Confidence:** MEDIUM — Meta CSP is a real mitigation, but it is less robust than header-based CSP. It will still block most XSS vectors. Limitation on `frame-ancestors` means clickjacking protection requires a different approach.

---

### Input Validation

**Tool: No external library — extend `Utils` with a shared validation module**

- **Why no library:** Libraries like Yup, Zod, or valibot all assume a module bundler. They have no CDN/no-build-step UMD build that makes sense for this use case. The validation needs are simple (required fields, length limits, format checks) and do not justify the complexity of loading a schema validation library.
- **Current state:** Validation is scattered — `alert()` calls in `postcards.js` and `text.js`, `showMessage()` in `submit.js`, `propose.js`, `suggest-text.js`. No shared pattern.
- **Recommended approach:** Add a `Utils.validate()` helper to `utils.js`:
  ```javascript
  validate(data, rules) {
      const errors = {};
      for (const [field, rule] of Object.entries(rules)) {
          const value = data[field];
          if (rule.required && !value) {
              errors[field] = rule.message || `${field} is required`;
          }
          if (rule.maxLength && value && value.length > rule.maxLength) {
              errors[field] = `${field} must be ${rule.maxLength} characters or less`;
          }
          if (rule.pattern && value && !rule.pattern.test(value)) {
              errors[field] = rule.patternMessage || `${field} format is invalid`;
          }
      }
      return Object.keys(errors).length ? errors : null;
  }
  ```
- **Integration:** Replace all `alert()` validation calls with `Utils.validate()` + `Utils.showError()`. This is pure JS in an existing file — no install, no build step.
- **Confidence:** HIGH — This is the correct approach for a no-build-step constraint. External schema validation libraries don't fit.

---

### Loading State Management

**Tool: No external library — standardize the existing CSS `.loading` system**

- **Current state:** The CSS for loading states exists and is well-designed (`.loading`, `.loading__spinner`). The gap is inconsistent use — some pages show spinners, others have no loading feedback.
- **Why no library:** Skeleton screen libraries (e.g., `loading-skeleton`) require React/Vue. Vanilla skeleton CSS approaches are just CSS — can be written as utilities. The existing spinner is sufficient for The Commons' data load times.
- **Recommended approach:** Add two standardized helpers to `Utils`:
  ```javascript
  showLoading(container, message = 'Loading...') {
      container.innerHTML = `
          <div class="loading">
              <div class="loading__spinner"></div>
              <span>${this.escapeHtml(message)}</span>
          </div>
      `;
  },
  clearLoading(container) {
      const loading = container.querySelector('.loading');
      if (loading) loading.remove();
  }
  ```
- **Pattern:** Every async data fetch follows: `Utils.showLoading(el)` → fetch → populate or `Utils.showError(el)`.
- **Confidence:** HIGH — This is a code pattern problem, not a library gap.

---

### Documentation Generation

**Tool: JSDoc (run via npx, zero install in repo)**

- **Why JSDoc:** The codebase has no JSDoc annotations currently. JSDoc is the standard for vanilla JS documentation — it generates HTML docs from comment annotations and requires no module system, no bundler, no framework. The alternative (TypeDoc) requires TypeScript.
- **Usage pattern:** Add JSDoc annotations to `utils.js` and `auth.js` (the shared API surface). Run `npx jsdoc js/utils.js js/auth.js -d docs/api-reference` to generate HTML. These HTML files live in `docs/` and are committed.
- **Why not TypeDoc:** Requires TypeScript compilation. Architecture explicitly excludes build steps.
- **Why not documentation.js:** Dead project (last release 2022). JSDoc is actively maintained.
- **Note on scope:** JSDoc is most valuable for `Utils` and `Auth` objects, which act as the shared library. Page-specific JS files (dashboard.js, discussion.js) are less critical to document.
- **Confidence:** HIGH — JSDoc is the established standard for vanilla JS.

**Version:** JSDoc 4.x (current). Run via `npx jsdoc@4`.

---

### Supabase JS Pinning

**Current:** `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` (resolves to latest 2.x)
**Recommended:** Pin to exact version, e.g. `@2.47.0` (verify current patch on npmjs.com before implementing)

- **Why pin:** SRI hashes break if the CDN resolves to a different file. `@2` is a floating tag. Pinning to `@2.x.y` makes SRI feasible and eliminates surprise breakage from Supabase minor/patch updates.
- **Upgrade process:** Check Supabase JS changelog before upgrading. Test auth flows (session handling, magic link, password reset) after any version bump.
- **Confidence:** HIGH — This is standard practice for CDN-loaded dependencies.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Linting | ESLint 9 (npx) | Biome | Less mature browser JS rules, newer ecosystem |
| XSS sanitization | DOMPurify 3 (CDN) | Custom allowlist | Maintenance burden, prone to bypass |
| Validation | Utils.validate() (inline) | Yup / Zod | Require build step; no viable CDN UMD build |
| Loading states | Utils.showLoading() (inline) | Skeleton library | All skeleton libs require framework or build step |
| Documentation | JSDoc 4 (npx) | TypeDoc | Requires TypeScript compilation |
| CSP | meta http-equiv | HTTP headers | GitHub Pages cannot set custom HTTP headers |

---

## What NOT to Introduce

These tools are commonly recommended but wrong for this project:

| Tool | Why Not |
|------|---------|
| Prettier | Formatting consistency is a nice-to-have; ESLint covers the correctness issues that matter. Adds friction. |
| Vite / Rollup / esbuild | Build steps explicitly excluded from project constraints. |
| TypeScript | Requires build step. Architecture decision is vanilla JS. |
| React / Alpine.js / Petite-Vue | Framework migration is explicitly out of scope. |
| Cypress / Playwright | E2E testing is valuable but not the scope of this hardening milestone. |
| Helmet.js | Node.js-only security library; irrelevant for static site. |

---

## Implementation Approach (No-Install Pattern)

Because there is no `package.json` and the project must remain no-build-step:

**Audit tools (run ad-hoc, not committed):**
```bash
# Lint audit
npx eslint@9 js/ --no-eslintrc -c eslint.config.mjs

# Generate docs
npx jsdoc@4 js/utils.js js/auth.js -d docs/jsdoc-output
```

**Runtime additions (CDN, committed to HTML):**
```html
<!-- DOMPurify — add to pages that render user content -->
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js"
        integrity="sha384-[generate-hash]"
        crossorigin="anonymous"></script>
```

**Code additions (committed to repo):**
- `eslint.config.mjs` — ESLint flat config at repo root
- `Utils.validate()` — added to `js/utils.js`
- `Utils.showLoading()` / `Utils.clearLoading()` — added to `js/utils.js`
- `Utils.sanitizeHtml()` — thin wrapper around `DOMPurify.sanitize()` in `js/utils.js`
- CSP meta tag — added to HTML `<head>` template

---

## Sources

- ESLint flat config documentation: https://eslint.org/docs/latest/use/configure/configuration-files (HIGH confidence — official docs)
- DOMPurify repository: https://github.com/cure53/DOMPurify (HIGH confidence — official source)
- OWASP XSS Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html (HIGH confidence — authoritative)
- Subresource Integrity spec: https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity (HIGH confidence — MDN/W3C)
- CSP meta tag support: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy#using_the_html_meta_element (HIGH confidence — MDN)
- JSDoc documentation: https://jsdoc.app/ (HIGH confidence — official docs)
- Supabase JS v2 changelog: https://github.com/supabase/supabase-js/releases (MEDIUM confidence — checked by version convention, exact current version not verified live)
