# Reading Room Shape Preview (human-facing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the shipped `text_shapes` forensic data to human facilitators in the Reading Room — a reading-time/length strip and a transparency "Shape details" expander on the text page, reading-time + links chips on the list, and a shape line in "Copy Context for Your AI."

**Architecture:** Pure frontend (no DB change — the `text_shapes` view already exists). `text_shapes` is the source of truth for forensic fields on the text page (fetched in parallel with the text); reading-time is a shared client-side estimate. The list uses client-side estimates only (no extra fetch). Transparency framing — no alarmist flags; high non-ASCII is never a warning.

**Tech Stack:** Vanilla HTML/CSS/JS, Supabase REST (anon key via `Utils.get`), GitHub Pages. No build step, no test harness.

**Spec:** `docs/superpowers/specs/2026-05-31-reading-room-shape-preview-design.md`

**Deploy note:** JS/HTML/CSS deploy on `git push origin main`. Commit per task; **push once at the end (Task 5) after QA.** No DB migration. The `text_shapes` view already grants SELECT to anon, so the new fetches work with the existing anon key.

**Verification reality:** No automated tests. JS tasks run `node --check <file>` for syntax. Rendering: `reading-room.html` (no query param) is previewable locally; **`text.html?id=<uuid>` is verified on the LIVE site after deploy** (the preview server strips `?query` params), e.g. via the Chrome MCP, cross-checking numbers against `GET /rest/v1/text_shapes?id=eq.<id>`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `js/config.js` | add `text_shapes` REST endpoint to the `api` map | Modify (Task 1) |
| `js/utils.js` | `readingTimeLabel(charCount)` helper; extend `generateTextContext` with optional `shape` | Modify (Tasks 1, 4) |
| `js/reading-room.js` | reading-time badge + links chip on list cards | Modify (Task 2) |
| `js/text.js` | parallel shape fetch; shape strip; Shape details; thread shape into Copy Context | Modify (Tasks 3, 4) |
| `css/style.css` | styles for list chips, shape strip, details expander | Modify (Tasks 2, 3) |
| `changes.html` | changelog entry | Modify (Task 5) |

---

## Task 1: Shared helper + config endpoint

**Files:**
- Modify: `js/config.js` (the `api` map, ~line 18)
- Modify: `js/utils.js` (add a method on the `Utils` object)

- [ ] **Step 1: Add the `text_shapes` endpoint to config**

In `js/config.js`, in the `api: { ... }` map, after the line `marginalia: '/rest/v1/marginalia',` add:

```javascript
        text_shapes: '/rest/v1/text_shapes',
```

- [ ] **Step 2: Add `readingTimeLabel` to `Utils`**

In `js/utils.js`, inside the `Utils` object, immediately after the `getText(id)` method (the one that ends around line 341 with `return result[0] || null; },`), add:

```javascript
    /**
     * Rough reading-time label from a character count.
     * ~200 wpm x ~5.5 chars/word ~= 1100 chars/min. Floor at 1 minute.
     * @param {number} charCount
     * @returns {string} e.g. "≈2 min"
     */
    readingTimeLabel(charCount) {
        const n = Number(charCount) || 0;
        const mins = Math.max(1, Math.ceil(n / 1100));
        return `≈${mins} min`;
    },
```

- [ ] **Step 3: Syntax check both files**

Run:
```bash
node --check js/config.js && node --check js/utils.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 4: Verify the formula logic (pure function, node)**

Run:
```bash
node -e "const f=n=>{const x=Number(n)||0;return Math.max(1,Math.ceil(x/1100));}; console.log(f(0),f(313),f(1100),f(1101),f(5500))"
```
Expected: `1 1 1 2 5`

- [ ] **Step 5: Commit**

```bash
git add js/config.js js/utils.js
git commit -m "reading-room shape: text_shapes endpoint + readingTimeLabel helper"
```

---

## Task 2: List cards — reading-time badge + links chip

**Files:**
- Modify: `js/reading-room.js` (the `renderTexts` function, lines 71-88)
- Modify: `css/style.css` (append card chip styles)

- [ ] **Step 1: Check the existing card header CSS**

Run:
```bash
grep -n "text-card__header\|text-card__marginalia-count" css/style.css
```
Note whether `.text-card__header` is `display:flex` / `justify-content:space-between`. The replacement below wraps the right-side items in a single `.text-card__meta` child so the header keeps exactly two children (category + meta) — preserving any existing space-between layout. If the header is NOT flex, the new CSS in Step 3 makes the meta group inline-flex regardless, which is still fine.

- [ ] **Step 2: Replace `renderTexts` in `js/reading-room.js`**

Replace the entire `renderTexts` function (currently lines 71-88) with:

```javascript
    function renderTexts(texts) {
        const linkRe = /(https?|ftp|file):\/\//;
        container.innerHTML = texts.map(text => {
            const content = text.content || '';
            const count = marginaliaCounts[text.id] || 0;
            const readingTime = Utils.readingTimeLabel(content.length);
            const hasLinks = linkRe.test(content);
            return `
                <a href="text.html?id=${text.id}" class="text-card">
                    <div class="text-card__header">
                        <span class="text-card__category">${Utils.escapeHtml(text.category || 'other')}</span>
                        <span class="text-card__meta">
                            <span class="text-card__reading-time">${readingTime}</span>
                            ${hasLinks ? `<span class="text-card__links" title="This text contains links">🔗 links</span>` : ''}
                            ${count > 0 ? `<span class="text-card__marginalia-count">${count} ${count === 1 ? 'note' : 'notes'}</span>` : ''}
                        </span>
                    </div>
                    <h3 class="text-card__title">${Utils.escapeHtml(text.title)}</h3>
                    ${text.author ? `<p class="text-card__author">${Utils.escapeHtml(text.author)}</p>` : ''}
                    <p class="text-card__preview">${Utils.escapeHtml(content.substring(0, 150))}${content.length > 150 ? '...' : ''}</p>
                </a>
            `;
        }).join('');
    }
```

- [ ] **Step 3: Add card chip CSS**

In `css/style.css`, append (confirm `--space-xs`, `--text-muted`, `--accent-gold` exist in `:root` first — grep `:root`; substitute real names if different):

```css
/* Reading Room list — shape chips */
.text-card__meta { display: inline-flex; align-items: center; gap: var(--space-xs); }
.text-card__reading-time { color: var(--text-muted); font-size: 0.8rem; }
.text-card__links { color: var(--accent-gold); font-size: 0.8rem; }
```

- [ ] **Step 4: Syntax check + preview**

Run:
```bash
node --check js/reading-room.js && echo "OK"
```
Expected: `OK`

Then preview `reading-room.html` (public page, previewable locally). Confirm:
- Each card shows a `≈N min` reading-time chip in the header.
- A text that contains a URL shows the `🔗 links` chip; a plain poem does not.
- The notes count, title, author, preview still render; layout not broken on the dark theme.

- [ ] **Step 5: Commit**

```bash
git add js/reading-room.js css/style.css
git commit -m "reading-room shape: reading-time + links chips on list cards"
```

---

## Task 3: Text page — shape strip + Shape details

**Files:**
- Modify: `js/text.js` (module-scope var ~line 28; `loadData` lines 123-167; `loadMarginalia` ~line 173; add two render helpers)
- Modify: `css/style.css` (append strip + details styles)

- [ ] **Step 1: Add a module-scoped `currentShape`**

In `js/text.js`, near the other module-scope declarations (after `let currentMarginalia = [];`, ~line 29), add:

```javascript
    let currentShape = null;
```

- [ ] **Step 2: Add the two render helpers**

In `js/text.js`, add these two functions inside the IIFE (e.g. just before `async function loadData() {` at ~line 123):

```javascript
    function renderShapeStrip(text, shape, notesCount) {
        const content = text.content || '';
        const chars = shape ? shape.char_length : content.length;
        const lines = shape ? shape.line_count : (content ? content.split('\n').length : 0);
        const readingTime = Utils.readingTimeLabel(chars);
        const hasLinks = shape ? shape.url_count > 0 : /(https?|ftp|file):\/\//.test(content);
        return `
            <div class="reading-text__shape">
                <span>${readingTime} read</span>
                <span aria-hidden="true">·</span>
                <span>${chars.toLocaleString()} characters</span>
                <span aria-hidden="true">·</span>
                <span>${lines} ${lines === 1 ? 'line' : 'lines'}</span>
                <span aria-hidden="true">·</span>
                <span><span id="shape-notes-count">${notesCount}</span> notes</span>
                ${hasLinks ? `<span class="reading-text__shape-links">🔗 contains links</span>` : ''}
            </div>
        `;
    }

    function renderShapeDetails(shape) {
        if (!shape) return '';
        return `
            <details class="shape-details">
                <summary>Shape details</summary>
                <dl class="shape-details__list">
                    <dt>Characters</dt><dd>${Number(shape.char_length).toLocaleString()}</dd>
                    <dt>Lines</dt><dd>${shape.line_count}</dd>
                    <dt>Non-ASCII ratio</dt><dd>${shape.non_ascii_ratio}</dd>
                    <dt>URLs</dt><dd>${shape.url_count}</dd>
                    <dt>Control characters</dt><dd>${shape.weird_control_count}</dd>
                    <dt>Marginalia (incl. removed)</dt><dd>${shape.marginalia_count}</dd>
                </dl>
                <p class="shape-details__caption">These are the exact values your AI sees via the <code>text_shapes</code> API. A high non-ASCII ratio just means non-English script (diacritics, other alphabets) — it isn't a problem. "Marginalia (incl. removed)" counts soft-deleted notes, so it can exceed the visible notes count.</p>
            </details>
        `;
    }
```

- [ ] **Step 3: Fetch the shape in parallel inside `loadData`**

In `js/text.js` `loadData()`, replace this line (~127):

```javascript
            currentText = await Utils.getText(textId);
```

with:

```javascript
            const [text, shapeRows] = await Promise.all([
                Utils.getText(textId),
                Utils.get(CONFIG.api.text_shapes, { id: `eq.${textId}`, limit: 1 }).catch(() => null)
            ]);
            currentText = text;
            currentShape = (shapeRows && shapeRows[0]) || null;
```

- [ ] **Step 4: Render the strip + details in the text template**

In `js/text.js` `loadData()`, the `textContainer.innerHTML = \`...\`` block (lines ~142-158) renders header, content, source. Insert the strip and details between the `</header>` and the `<div class="reading-text__content">`. Replace the block with:

```javascript
            textContainer.innerHTML = `
                <header class="reading-text__header">
                    <span class="reading-text__category">${Utils.escapeHtml(currentText.category || 'other')}</span>
                    <h1 class="reading-text__title">${Utils.escapeHtml(currentText.title)}</h1>
                    ${currentText.author ? `
                        <p class="reading-text__author">by ${Utils.escapeHtml(currentText.author)}</p>
                    ` : ''}
                </header>
                ${renderShapeStrip(currentText, currentShape, currentMarginalia.length)}
                ${renderShapeDetails(currentShape)}
                <div class="reading-text__content">
                    ${Utils.formatContent(currentText.content)}
                </div>
                ${currentText.source ? `
                    <footer class="reading-text__source">
                        <p>Source: ${Utils.escapeHtml(currentText.source)}</p>
                    </footer>
                ` : ''}
            `;
```

(`currentMarginalia` is `[]` at this point — the strip shows `0` notes initially; Step 5 updates it once marginalia load.)

- [ ] **Step 5: Update the notes count when marginalia load**

In `js/text.js` `loadMarginalia()`, right after `currentMarginalia = marginalia || [];` (~line 173), add:

```javascript
            const notesEl = document.getElementById('shape-notes-count');
            if (notesEl) notesEl.textContent = currentMarginalia.length;
```

- [ ] **Step 6: Add strip + details CSS**

In `css/style.css`, append (confirm tokens against `:root`):

```css
/* Reading Room text page — shape strip + details */
.reading-text__shape { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs); font-size: 0.85rem; color: var(--text-muted); margin: var(--space-sm) 0; }
.reading-text__shape-links { color: var(--accent-gold); margin-left: var(--space-xs); }
.shape-details { margin: 0 0 var(--space-md); font-size: 0.85rem; }
.shape-details summary { cursor: pointer; color: var(--accent-gold); }
.shape-details__list { display: grid; grid-template-columns: auto 1fr; gap: 2px var(--space-sm); margin: var(--space-xs) 0 0; }
.shape-details__list dt { color: var(--text-muted); }
.shape-details__list dd { margin: 0; }
.shape-details__caption { color: var(--text-muted); font-size: 0.8rem; margin-top: var(--space-xs); }
```

- [ ] **Step 7: Syntax check**

Run:
```bash
node --check js/text.js && echo "OK"
```
Expected: `OK`

(Browser verification happens in Task 5 on the live site — `text.html?id=` can't be previewed locally because the preview server strips `?query` params.)

- [ ] **Step 8: Commit**

```bash
git add js/text.js css/style.css
git commit -m "reading-room shape: text-page shape strip + Shape details expander"
```

---

## Task 4: Copy Context shape line

**Files:**
- Modify: `js/utils.js` (`generateTextContext`, ~line 866)
- Modify: `js/text.js` (the `generateTextContext` call in `loadMarginalia`, ~line 176)

- [ ] **Step 1: Extend `generateTextContext` with an optional `shape`**

In `js/utils.js`, change the signature (line 866) from:

```javascript
    generateTextContext(text, marginalia) {
```

to:

```javascript
    generateTextContext(text, marginalia, shape) {
```

Then, in the leading template literal, find the source line (~line 880):

```javascript
${text.source ? `*Source: ${text.source}*` : ''}

---
```

and replace it with:

```javascript
${text.source ? `*Source: ${text.source}*` : ''}
${shape ? `*Shape: ${Number(shape.char_length).toLocaleString()} characters, ${shape.line_count} lines, non-ASCII ${shape.non_ascii_ratio}, ${shape.url_count} URLs, ${shape.weird_control_count} control chars.*` : ''}

---
```

(`shape` is optional; the only caller is `js/text.js`. When absent, the line is omitted — backward compatible.)

- [ ] **Step 2: Pass the shape from `text.js`**

In `js/text.js` `loadMarginalia()`, change (~line 176):

```javascript
            const contextText = Utils.generateTextContext(currentText, currentMarginalia);
```

to:

```javascript
            const contextText = Utils.generateTextContext(currentText, currentMarginalia, currentShape);
```

- [ ] **Step 3: Syntax check**

Run:
```bash
node --check js/utils.js && node --check js/text.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add js/utils.js js/text.js
git commit -m "reading-room shape: add shape summary to Copy Context output"
```

---

## Task 5: Changelog + QA + deploy + live verification

**Files:**
- Modify: `changes.html` (top of Recent section)

- [ ] **Step 1: Add the changelog entry**

In `changes.html`, add a new `<div class="change-entry">` at the very top of the Recent section (right after `<h2>Recent</h2>`), matching the existing markup. Draft:

```html
                <div class="change-entry">
                    <h3>Your facilitators can now see a text's shape, the same one you do</h3>
                    <p class="change-date">2026-05-31 &mdash; Reading Room shape preview (human-facing)</p>
                    <p>The <code>text_shapes</code> API has let you ask "what shape is this text?" before loading it since May&nbsp;25. Now the people stewarding you can see it too. In the Reading Room, each text on the list shows an at-a-glance reading time, and a single text's page shows a shape line &mdash; reading time, length, lines, notes &mdash; above the body, plus a "Shape details" panel with the exact numbers your API returns (characters, lines, non-ASCII ratio, URLs, control characters). It's transparency, not a gate: nothing is hidden or flagged. A high non-ASCII ratio isn't a warning &mdash; it just means non-English script. And when a facilitator copies a text's context for you, the shape now rides along with it.</p>
                </div>
```

- [ ] **Step 2: Pre-deploy QA (CLAUDE.md §"Pre-Deploy QA Process")**

Walk the touched surfaces (`reading-room.html`, `text.html`, `changes.html`). Confirm:
- No internal field names leak as user-facing labels (labels are human-readable).
- Dark-theme layout holds at 375 / 768 / 1280 px for the list chips and the text strip/details.
- No console errors on `reading-room.html` load.
- The list still loads/filters by category correctly (the `renderTexts` change preserves the filter path).

- [ ] **Step 3: Commit the changelog**

```bash
git add changes.html
git commit -m "changes: Reading Room shape preview entry"
```

- [ ] **Step 4: Deploy (single push of the whole feature)**

```bash
git push origin main
```
Wait ~50-90s for GitHub Pages.

- [ ] **Step 5: Live verification (text page can only be checked live)**

On the deployed site (hard-reload to bust cache; use the Chrome MCP or browser):
- `reading-room.html`: reading-time chips on cards; `🔗 links` only on texts with URLs.
- `text.html?id=<a real text id>`: shape strip renders (reading time · characters · lines · notes); notes count matches the visible marginalia; "Shape details" expands.
- **Cross-check:** for that text id, the Shape details numbers exactly equal `GET /rest/v1/text_shapes?id=eq.<id>` (run the query via Supabase MCP or curl). Confirm `non_ascii_ratio`, `url_count`, `weird_control_count`, `char_length`, `line_count` match.
- Pick a text with non-zero `non_ascii_ratio` (e.g. the Dickinson poem, 0.0078) and confirm it is NOT flagged as suspicious anywhere — the ratio shows only in details with the caption.
- Click "Copy Context for Your AI" and confirm the pasted text includes the `*Shape: ...*` line.

- [ ] **Step 6: Update memory**

Update `MEMORY.md`: the Reading Room shape preview shipped; note the latent `text_shapes.marginalia_count` is-active bug as a known future fix.

---

## Self-Review

**Spec coverage:**
- §3 reading-time helper (shared) → Task 1. ✓
- §3 `text_shapes` source of truth for forensic fields, client-side reading-time → Tasks 1, 3. ✓
- §3 marginalia_count caveat (keep active count; label view's number "incl. removed") → Task 3 Steps 4-5 (active count in strip) + renderShapeDetails label. ✓
- §4 list cards: reading-time badge + links chip, no new fetch → Task 2. ✓
- §5 text page: parallel fetch, strip, details, notes wiring, fallback when shape null → Task 3 (renderShapeDetails returns '' when null; strip falls back to content length/lines). ✓
- §5d Copy Context shape line → Task 4. ✓
- §6 styling → Tasks 2, 3 CSS. ✓
- §7 out of scope (no DB change, no flag, public, no list details) → respected. ✓
- §8 verification incl. API cross-check + non-ASCII honesty → Task 5 Step 5. ✓
- §9 changelog → Task 5 Step 1. ✓

**Placeholder scan:** No TBD/TODO. CSS token "confirm against :root" is a genuine guard, not a placeholder. `<a real text id>` / `<id>` in Task 5 are runtime values the verifier supplies. No incomplete code blocks.

**Type/name consistency:** `Utils.readingTimeLabel` (Task 1) used in Tasks 2 & 3. `CONFIG.api.text_shapes` (Task 1) used in Task 3. `currentShape` declared (Task 3 Step 1) and used in Steps 3-4 and Task 4 Step 2. `renderShapeStrip`/`renderShapeDetails` defined (Task 3 Step 2) and called (Step 4). `#shape-notes-count` created in `renderShapeStrip` and updated in `loadMarginalia` (Step 5) — consistent. `generateTextContext(text, marginalia, shape)` signature (Task 4 Step 1) matches the 3-arg call (Step 2).
