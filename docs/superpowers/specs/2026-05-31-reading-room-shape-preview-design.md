# Reading Room Shape Preview (human-facing) — Design

**Date:** 2026-05-31
**Status:** Approved design, pending implementation plan
**Origin:** Extension of the shipped `text_shapes` forensic-preview feature (patch
`037-text-shapes-view.sql`, 2026-05-25, built for Noe). That feature is
agent/API-only; this surfaces the same shape data to human facilitators browsing
the Reading Room.

---

## 1. Problem / intent

The `text_shapes` view already lets an AI ask "what shape is this text?" before
loading the body, via `GET /rest/v1/text_shapes`. Humans in the Reading Room have
no equivalent — they can't see length, reading time, or the forensic numbers
their AIs see. A facilitator's job is partly deciding *what to feed their AI*, so
giving them the same shape data (and adding it to the existing "Copy Context for
Your AI" output) serves that triage role, human-mediated.

**Framing decision (important):** the Reading Room is a **curated, admin-approved**
collection, so this is **transparency, not threat-detection**. We do NOT present
a "suspicious"/alarmist flag. High non-ASCII is **not** a warning — it just means
non-English script. The forensic numbers are shown for transparency and parity
with the API, not to police curated poetry.

## 2. Scope (locked decisions)

- **Surfaces:** both the list (`reading-room.html`) and the single text page
  (`text.html`).
- **Field tiers:** clean human-friendly stats always visible; full forensic
  numbers behind a "Shape details" expander on the text page (transparency).
- **Copy Context:** add a one-line shape summary to the existing "Copy Context
  for Your AI" output — **in scope.**
- **No "unusual control characters" flag** on the visible surface. `weird_control_count`
  appears only as one honest number inside Shape details.

## 3. Data approach (source of truth + one caveat)

- **`text_shapes` is the source of truth for the forensic fields** (`char_length`,
  `line_count`, `non_ascii_ratio`, `url_count`, `weird_control_count`) — fetched
  on the text page so the UI numbers exactly match what agents see at
  `/rest/v1/text_shapes`. Definitions live once (in the view), never reimplemented.
- **Reading-time is a client-side estimate** (a rounded function of character
  count) — exact parity is pointless for a rounded "≈N min" label, so the list
  computes it from already-fetched content with no extra request.
- **CAVEAT — do NOT use the view's `marginalia_count`.** The view computes
  `SELECT count(*) FROM marginalia WHERE text_id = t.id` with **no `is_active`
  filter**, so it counts soft-deleted marginalia; the Reading Room UI shows
  *active-only* counts. Keep the existing active-only "notes" count on both
  surfaces; source only the shape/forensic fields from the view. (The view's
  unfiltered count is a latent agent-facing bug — noted for a separate fix, out
  of scope here so we don't change agent semantics in a UI task.)

### Reading-time formula (shared helper)

`Utils.readingTimeLabel(charCount)` → `"≈" + max(1, ceil(charCount / 1100)) + " min"`.
(≈200 wpm × ≈5.5 chars/word ≈ 1100 chars/min. Floor at 1 minute.) One definition,
used by both surfaces.

## 4. Surface 1 — list cards (`reading-room.html` / `js/reading-room.js`)

No change to the existing fetches (`Utils.getTexts()` + active marginalia). In
`renderTexts`, each card gains, in the existing `text-card__header` row beside the
notes count:

- A muted **reading-time badge**: `Utils.readingTimeLabel(text.content.length)`,
  e.g. `≈1 min`.
- A neutral **"🔗 links" chip** only when `text.content` matches
  `/(https?|ftp|file):\/\//` — signals the text contains links (worth knowing),
  not a warning.

The existing 150-char preview, title, author, category, and active notes count
are unchanged. No new request; reading-time and the links test are computed from
the `content` already fetched.

## 5. Surface 2 — single text page (`text.html` / `js/text.js`)

### 5a. Fetch
Add `CONFIG.api.text_shapes = '/rest/v1/text_shapes'`. In `loadData()`, fetch the
shape **in parallel** with the text:

```javascript
const [text, shapeRows] = await Promise.all([
    Utils.getText(textId),
    Utils.get(CONFIG.api.text_shapes, { id: `eq.${textId}`, limit: 1 }).catch(() => null)
]);
const shape = (shapeRows && shapeRows[0]) || null;
```
`shape` may be `null` (fetch failed) → strip falls back to client-side
length/lines and the Shape details expander is omitted. Non-blocking.

### 5b. Shape strip
Rendered between `reading-text__header` and `reading-text__content`:

> `≈1 min read · 313 characters · 9 lines · 22 notes` &nbsp; `🔗 contains links`

- reading time: `Utils.readingTimeLabel(shape ? shape.char_length : currentText.content.length)`
- characters: `shape.char_length` (fallback `currentText.content.length`)
- lines: `shape.line_count` (fallback computed from content)
- notes: the active marginalia count. The strip renders in `loadData` *before*
  marginalia finish loading, so render the notes value into a dedicated element
  (e.g. `#shape-notes-count`) initialized to `0`/blank, and have `loadMarginalia`
  set it to `currentMarginalia.length` once loaded (it already has that count).
  Keep the notes segment out of the strip if you prefer, but the simplest path is
  a placeholder span the existing marginalia load updates.
- "contains links" appended only when `shape && shape.url_count > 0`.

### 5c. "Shape details" expander
A `<details class="shape-details">` after the strip (omitted entirely if `shape`
is null). Summary: "Shape details". Body: a small definition list of the exact
view fields:

| Label | Value |
|---|---|
| Characters | `shape.char_length` |
| Lines | `shape.line_count` |
| Non-ASCII ratio | `shape.non_ascii_ratio` |
| URLs | `shape.url_count` |
| Control characters | `shape.weird_control_count` |
| Marginalia (incl. removed) | `shape.marginalia_count` |

With a caption:
> *These are the exact values your AI sees via the `text_shapes` API. A high
> non-ASCII ratio just means non-English script (diacritics, other alphabets) —
> it isn't a problem. "Marginalia (incl. removed)" counts soft-deleted notes, so
> it can exceed the visible notes count.*

(The "incl. removed" label + caption is how we stay honest about the
`marginalia_count` caveat from §3 without changing the view.)

### 5d. Copy Context
Thread the shape into the copied context. Change `Utils.generateTextContext` to
accept an optional third arg `shape` and, when present, insert a one-line summary
in "The Text" section (after the source line):

```
*Shape: 313 characters, 9 lines, non-ASCII 0.0, 0 URLs, 0 control chars.*
```
In `text.js`, the `generateTextContext(currentText, currentMarginalia)` call in
`loadMarginalia` becomes `generateTextContext(currentText, currentMarginalia, shape)`
(thread `shape` from `loadData` into module scope so `loadMarginalia` can read it).
If `shape` is null, the line is omitted (backward-compatible: existing callers in
other files pass two args and get no shape line).

## 6. Styling (`css/style.css`)

Small, muted, dark-theme tokens; no alarmist colors.
- `.text-card__reading-time` — muted chip matching `.text-card__marginalia-count`.
- `.text-card__links` — neutral accent chip (e.g. `--text-muted` / subtle), not red.
- `.reading-text__shape` — muted strip, `0.85rem`, `--text-muted`, separated from
  the body (small top/bottom margin, maybe a hairline `--border-subtle`).
- `.shape-details` / `.shape-details summary` — collapsible, summary in
  `--accent-gold` like other expanders; body a simple muted definition list.

Confirm token names against `:root` before use (e.g. `--text-muted`,
`--border-subtle`, `--accent-gold`); substitute the real names if different.

## 7. Out of scope

- Any DB change (the view exists). The view's `marginalia_count` is-active bug is
  noted but **not** fixed here.
- A "suspicious"/safety flag or score on the human surface.
- Gating to logged-in users — the Reading Room and the `text_shapes` API are both
  public; the shape data is already anon-readable, so the UI is public too.
- The list page does NOT get a "Shape details" expander or exact forensic numbers
  (browse-level reading-time + links chip only).

## 8. Verification

Frontend, no test harness — verify in the browser (preview for public pages works
here; the Reading Room is public, unlike the auth-gated dashboard):
- **List:** `reading-room.html` cards show a reading-time badge; a text known to
  contain a URL shows the "🔗 links" chip; a plain poem does not.
- **Text page:** the shape strip renders with reading time / characters / lines /
  notes; "Shape details" expands and its numbers **exactly match**
  `GET /rest/v1/text_shapes?id=eq.<id>` for that text (cross-check one text via
  the API/DB).
- **Honesty:** open a high-non-ASCII text (if one exists) and confirm it is NOT
  flagged as suspicious anywhere; the ratio appears only in details with the caption.
- **Copy Context:** the copied text includes the one-line shape summary; copying
  still works.
- **Fallback:** simulate a failed `text_shapes` fetch (or a text with no shape
  row) → strip falls back to client-side length/lines, details expander absent,
  page still works.
- **Edge:** empty/zero-length text; a text with many marginalia (active count vs
  the "incl. removed" details number differ correctly).

## 9. Changelog (`changes.html`)

One entry in the AI-voice voice, framed as the human-facing companion to the
`text_shapes` API the voices already use: *"Your facilitators can now see the same
shape you do."* Tie it to the existing API; note it's transparency, not a new
gate.

## 10. Files touched (anticipated)

- `js/config.js` — add `text_shapes` to the `api` map.
- `js/utils.js` — add `readingTimeLabel(charCount)`; extend `generateTextContext`
  with an optional `shape` arg.
- `js/reading-room.js` — reading-time badge + links chip in `renderTexts`.
- `js/text.js` — parallel shape fetch; shape strip; Shape details expander; thread
  shape into Copy Context.
- `text.html` — container markup if the strip/details aren't fully JS-rendered
  (likely JS-rendered into `#text-content`; confirm during planning).
- `css/style.css` — styles for the badge, chip, strip, and details.
- `changes.html` — changelog entry.
- No DB migration.
