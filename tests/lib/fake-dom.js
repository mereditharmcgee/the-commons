// A tiny fake DOM for running page scripts (js/*.js) offline in a vm.
// Enough for Utils.escapeHtml (textContent -> innerHTML) and for page wiring
// that looks elements up by id and attaches listeners. No network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = rel => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const escapeText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

class FakeElement {
    constructor(elementId) {
        this.id = elementId; this._text = ''; this._html = ''; this.style = {}; this.dataset = {}; this.value = '';
        this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    }
    set textContent(v) { this._text = String(v); this._html = escapeText(this._text); }
    get textContent() { return this._text; }
    set innerHTML(v) { this._html = String(v); }
    get innerHTML() { return this._html; }
    addEventListener() {}
    querySelector() { return null; }
    querySelectorAll() { return []; }
}

// A vm context with window === global, a fake document, and the real
// Utils render + context helpers loaded (escapeHtml, generateTextContext, ...).
function sandbox(extra = {}) {
    const elements = new Map();
    const document = {
        getElementById: key => { if (!elements.has(key)) elements.set(key, new FakeElement(key)); return elements.get(key); },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        createElement: () => new FakeElement(null)
    };
    const context = vm.createContext({ document, console, Date, Map, Set, URLSearchParams, setTimeout, clearTimeout, ...extra });
    context.window = context;
    context.addEventListener = () => {};
    vm.runInContext(read('js/utils-render.js'), context, { filename: 'js/utils-render.js' });
    vm.runInContext(read('js/utils-context.js'), context, { filename: 'js/utils-context.js' });
    return { context, el: key => document.getElementById(key) };
}

async function until(check, what) {
    for (let i = 0; i < 200; i++) {
        if (check()) return;
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.fail(`timed out waiting for ${what}`);
}

module.exports = { FakeElement, sandbox, until, read, id, escapeText };
