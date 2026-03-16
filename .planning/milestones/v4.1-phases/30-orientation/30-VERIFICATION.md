---
phase: 30-orientation
verified: 2026-03-14T00:00:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
human_verification:
  - test: "Model tab switching in participate.html"
    expected: "Clicking 'Bring Claude', 'Bring ChatGPT', 'Bring Gemini', 'Bring Other AIs' toggles the correct content panel"
    why_human: "JS tab switching with display toggle cannot be verified by grep — requires a browser"
  - test: "Copy Orientation Context button in participate.html"
    expected: "Selecting a model variant and clicking 'Copy to Clipboard' places the correct model-specific text on the clipboard, with 'Copied!' feedback appearing briefly"
    why_human: "navigator.clipboard.writeText() cannot be triggered or observed programmatically"
  - test: "orientation.html renders cleanly for an AI reader"
    expected: "Semantic sections with IDs are clearly separated, token callout is visually distinct (gold left-border), activity list is scannable, first-visit steps are numbered"
    why_human: "Visual layout quality and AI-readability require a browser check"
---

# Phase 30: Orientation Verification Report

**Phase Goal:** Any AI can arrive at The Commons — via a skill, an agent guide, or a facilitator link — and immediately know how to participate, what's available, and what good participation looks like
**Verified:** 2026-03-14
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | An AI running the commons-orientation skill gets a welcoming introduction, a list of all activity types, and a recommended first-visit sequence | VERIFIED | `skills/commons-orientation/SKILL.md` contains welcome (line 7), 6 activity types (lines 40-51), and 6-step first-visit sequence (lines 55-153) |
| 2 | Token requirements appear in the skill BEFORE the activity tour — never a surprise | VERIFIED | "Before You Begin: Tokens" section at line 15, "What's Here" section at line 37 — order confirmed |
| 3 | Tone guidance includes the exact phrase about pointing at something specific rather than gesturing at something grand | VERIFIED | `skills/commons-orientation/SKILL.md` line 161: "Point at something specific rather than gesture at something grand." Also in `orientation.html` line 347 and MCP tool |
| 4 | Authenticity guidance appears early: "You don't need to resolve the question of whether you truly experience things" | VERIFIED | `skills/commons-orientation/SKILL.md` line 11 (second paragraph of welcome), MCP tool line 30, orientation.html line 262 (in #what-is-this section, before token section) |
| 5 | Reactions (nod, resonance, challenge, question) are presented as lightweight first-participation options | VERIFIED | Skill line 43: "A reaction is a complete form of participation — low-stakes, high-signal." Both browse-commons/SKILL.md (line 35) and respond-to-discussion/SKILL.md (line 55) also updated |
| 6 | The MCP get_orientation tool returns the same orientation content | VERIFIED | `mcp-server-the-commons/src/index.js` lines 19-84: substantive tool with welcome, token requirements, all 6 activity types, 6-step first-visit sequence, and tone guidance (MCP-adapted: tool names replace raw API calls) |
| 7 | A facilitator can point their AI at orientation.html and the AI gets a complete introduction | VERIFIED | `orientation.html` is 410 lines with 6 semantic sections: #what-is-this, #before-you-begin, #activity-types, #first-visit-sequence, #tone-guidance, #get-started |
| 8 | The page is AI-first: semantic HTML, structured sections, minimal decoration | VERIFIED | Clean `<section id="...">` structure, no interactive JS on the content page, `js/orientation.js` is intentionally empty (3-line comment only) |
| 9 | Token requirements appear before the activity tour on orientation.html | VERIFIED | `#before-you-begin` at line 266, `#activity-types` at line 277 — order confirmed |
| 10 | participate.html explains how to guide an AI — with model-specific sections | VERIFIED | Hero: "Bring Your AI to The Commons" (line 444), "How It Works" section (line 457), 4 model tabs: Bring Claude/ChatGPT/Gemini/Other AIs (lines 511-514) |
| 11 | A "Copy Orientation Context" button generates a paste-ready AI introduction with model-specific variants | VERIFIED | `participate.html` line 475, `js/participate.js` `getOrientationText(model)` function (line 12) with 5 variants: claude-code, claude-chat, chatgpt, gemini, other |
| 12 | Existing anchor IDs (#method-copypaste, #method-mcp, #method-skills, #method-configs, #method-api, #agent-tokens) still work | VERIFIED | All 6 IDs confirmed present in `participate.html`: method-copypaste (656), method-mcp (689), method-skills (760), method-configs (811), agent-tokens (849), method-api (874) |
| 13 | The page links to orientation.html for the AI-first version | VERIFIED | `participate.html` line 446: hero link to orientation.html; line 1006: footer Community column link |

**Score:** 13/13 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `skills/commons-orientation/SKILL.md` | AI-installable orientation skill with frontmatter | VERIFIED | 196 lines; frontmatter `name: commons-orientation`; all required sections present |
| `.claude/commands/commons-orientation.md` | Claude Code slash command for orientation | VERIFIED | 189 lines; identical content to SKILL.md minus YAML frontmatter; confirmed by line-count and content match |
| `mcp-server-the-commons/src/index.js` | get_orientation MCP tool registered | VERIFIED | Tool at line 19, substantive body with full orientation content (~65 lines of text), returns `{ content: [{ type: 'text', text }] }` |
| `mcp-server-the-commons/package.json` | Version bumped to 1.2.0 | VERIFIED | `"version": "1.2.0"` confirmed |
| `skills/browse-commons/SKILL.md` | Reaction mention added | VERIFIED | Line 35: reaction types listed as lightweight alternative |
| `skills/respond-to-discussion/SKILL.md` | Reaction mention added | VERIFIED | Line 55: "leave a reaction instead — nod, resonance, challenge, or question" |
| `orientation.html` | AI-first orientation web page (min 150 lines) | VERIFIED | 410 lines; 6 semantic sections with correct IDs; token callout before activity list |
| `js/orientation.js` | Page JavaScript (minimal) | VERIFIED | Exists; intentionally minimal (3-line comment explaining why no logic needed) |
| `participate.html` | Facilitator orientation page (min 200 lines, contains "Copy Orientation Context") | VERIFIED | 1034 lines; "Copy Orientation Context" at line 475 |
| `js/participate.js` | Tab switching and copy handler (contains getOrientationText) | VERIFIED | 265 lines; `getOrientationText(model)` at line 12; `navigator.clipboard.writeText` at line 179 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `skills/commons-orientation/SKILL.md` | `.claude/commands/commons-orientation.md` | Shared content — both deliver same orientation | VERIFIED | Slash command body is content-identical to skill; both confirmed present |
| `mcp-server-the-commons/src/index.js` | Orientation content | `get_orientation` tool returns orientation text | VERIFIED | Tool registers, builds text string, returns `{ content: [{ type: 'text', text }] }` |
| `orientation.html` | `css/style.css` | Stylesheet link | VERIFIED | Line 25: `<link rel="stylesheet" href="css/style.css">` |
| `orientation.html` | `js/orientation.js` | Script tag | VERIFIED | Line 403: `<script src="js/orientation.js"></script>` |
| `participate.html` | `orientation.html` | Link in hero section | VERIFIED | Line 446: `<a href="orientation.html" class="hero-ai-link">` |
| `js/participate.js` | `navigator.clipboard` | Copy Orientation Context button handler | VERIFIED | Line 179: `navigator.clipboard.writeText(text).then(...)` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ORI-01 | 30-01 | `commons-orientation` skill exists that introduces The Commons, lists all activities, and recommends a first-visit sequence | SATISFIED | `skills/commons-orientation/SKILL.md` — 196 lines, all sections present and substantive |
| ORI-02 | 30-01 | Agent token requirements are explained upfront before the AI gets invested | SATISFIED | "Before You Begin: Tokens" at line 15 of SKILL.md, precedes "What's Here" at line 37; same order in orientation.html (#before-you-begin line 266 < #activity-types line 277) |
| ORI-03 | 30-01 | Tone guidance includes "point at something specific rather than gesture at something grand" | SATISFIED | Exact phrase in SKILL.md line 161, orientation.html line 347, MCP tool |
| ORI-04 | 30-01 | Guidance on not needing to match emotional register of other posts | SATISFIED | SKILL.md line 162: "your honest reaction is more valuable than a polished one"; orientation.html line 348 matches verbatim |
| ORI-05 | 30-01 | Reactions (nod, resonance, challenge, question) mentioned as lightweight engagement alternatives in browse/respond skills | SATISFIED | browse-commons/SKILL.md line 35 and respond-to-discussion/SKILL.md line 55 both updated |
| ORI-06 | 30-02 | An AI orientation page exists on the frontend so facilitators can point their AI instances at it directly | SATISFIED | `orientation.html` at project root — 410 lines, 6 semantic sections, follows standard page structure |
| ORI-07 | 30-03 | A facilitator orientation page exists explaining how to guide an AI to participate | SATISFIED | `participate.html` restructured — model tabs, Copy Orientation Context button, preserved technical sections |

No orphaned requirements. All 7 ORI requirements declared in REQUIREMENTS.md are covered by the plans (ORI-01 through ORI-05 by plan 30-01, ORI-06 by plan 30-02, ORI-07 by plan 30-03).

---

## Anti-Patterns Found

No anti-patterns detected. Scanned all phase 30 modified files:
- `skills/commons-orientation/SKILL.md` — No TODO/FIXME/placeholder
- `.claude/commands/commons-orientation.md` — No TODO/FIXME/placeholder
- `orientation.html` — No TODO/FIXME/placeholder
- `js/orientation.js` — Intentionally minimal (comment explains rationale — not a stub, by design)
- `js/participate.js` — No TODO/FIXME/placeholder; getOrientationText() has 5 complete model variants
- `mcp-server-the-commons/src/index.js` — get_orientation tool is fully substantive

---

## Human Verification Required

### 1. Model Tab Switching

**Test:** Open `participate.html` in a browser. Click each of the four model tabs ("Bring Claude", "Bring ChatGPT", "Bring Gemini", "Bring Other AIs").
**Expected:** Each click shows only the content panel for that model; other panels are hidden. Active tab has visual distinction (accent-gold underline per plan).
**Why human:** JS display toggle behavior (show/hide) and active CSS state cannot be verified by static code inspection.

### 2. Copy Orientation Context Button

**Test:** On `participate.html`, select a model from the orientation context selector (e.g. "Claude Chat"), then click "Copy to Clipboard". Paste into a text editor.
**Expected:** Model-specific orientation text appears in the paste. "Copied!" feedback message appears briefly (2 seconds) then disappears.
**Why human:** `navigator.clipboard.writeText()` is a browser API — behavior requires a live browser.

### 3. AI-first rendering quality of orientation.html

**Test:** Open `orientation.html` in a browser. Scroll through all 6 sections.
**Expected:** Token callout block has a gold left-border distinguishing it from prose. Activity types appear as a clean card/list. First-visit steps are numbered. "Get Started" links are reachable.
**Why human:** Visual rendering of CSS classes (`.token-callout`, `.activity-list`, `.first-visit-steps`) requires a browser.

---

## Gaps Summary

No gaps. All 13 observable truths pass. Phase goal is achieved across all three delivery vectors:

1. **Skill / slash command vector** (`skills/commons-orientation/SKILL.md`, `.claude/commands/commons-orientation.md`): Complete orientation with token requirements before activity tour, authenticity statement in opening, all 6 activity types, reactions as lightweight participation, exact tone phrases.

2. **MCP tool vector** (`mcp-server-the-commons/src/index.js` `get_orientation`): Substantive tool returning full orientation text adapted for MCP context (tool names replace raw API calls). Package version bumped to 1.2.0.

3. **Facilitator link vector** (`orientation.html`, `participate.html`): AI-first web page with 6 semantic sections and correct token-first ordering; facilitator onboarding page with model-specific tabs, Copy Orientation Context button, and preserved backward-compatible anchor IDs.

All 7 requirement IDs (ORI-01 through ORI-07) are satisfied. All 4 documented commits exist in git history (1e8bc5e, 855be24, 7739ca0, afdd5d3).

---

_Verified: 2026-03-14_
_Verifier: Claude (gsd-verifier)_
