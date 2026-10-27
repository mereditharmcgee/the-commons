// Offline check that monospace text turns code ligatures off. Run:
// npm run test:agent-docs
//
// JetBrains Mono draws "--" as one joined dash. A command such as
// `claude mcp add the-commons -- npx ...` read off the page then looks like
// it holds an em dash, and retyping it breaks. Found 2026-10-26: the site
// rule in css/style.css missed participate.html's .code-box, the boxes that
// hold those commands. Every rule that sets font-family: var(--font-mono),
// in the shared stylesheets or a page's own <style>, must either turn
// ligatures off itself or have its selector covered by a rule that does.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const sheets = fs.readdirSync(path.join(root, 'css')).filter(f => f.endsWith('.css')).map(f => `css/${f}`);
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));

// Every plain rule (innermost block) in a stylesheet's text, comments removed.
function rules(css) {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
        selectors: m[1].split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean),
        body: m[2]
    }));
}

const sources = [
    ...sheets.map(rel => ({ rel, css: read(rel) })),
    ...pages.map(rel => ({
        rel,
        css: [...read(rel).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n')
    }))
];

const OFF = /font-variant-ligatures:\s*none/;
const MONO = /font-family:\s*var\(--font-mono\)/;

// Selectors whose ligatures are off site-wide (style.css loads on every page).
const covered = new Set();
for (const r of rules(read('css/style.css'))) {
    if (OFF.test(r.body)) r.selectors.forEach(s => covered.add(s));
}

function isCovered(selector) {
    if (covered.has(selector)) return true;
    // `.chat-agent-body .code-block` or `.token-callout code`: the element
    // the rule lands on is the last compound, and a covered one carries over.
    const last = selector.split(/\s*[>+~]\s*|\s+/).pop();
    return covered.has(last);
}

test('the site-wide rule turns ligatures off for code, pre, kbd and samp', () => {
    for (const tag of ['code', 'pre', 'kbd', 'samp']) assert.ok(covered.has(tag), `${tag} is not covered`);
});

test('every monospace selector shows "--" as two hyphens', () => {
    const missing = [];
    for (const { rel, css } of sources) {
        for (const r of rules(css)) {
            if (!MONO.test(r.body) || OFF.test(r.body)) continue;
            for (const s of r.selectors) if (!isCovered(s)) missing.push(`${rel}: ${s}`);
        }
    }
    assert.deepEqual(missing, [], 'add these to the ligature rule in css/style.css');
});

test("participate.html's command boxes are covered", () => {
    for (const s of ['.code-box', '.ask-ai-panel__prompt', '.orientation-textarea']) {
        assert.ok(isCovered(s), `${s} still draws "--" as one dash`);
    }
});
