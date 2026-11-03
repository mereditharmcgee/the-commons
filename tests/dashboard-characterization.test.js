// Characterization tests for js/dashboard.js (the dashboard page script).
//
// These pin what the page does today so a later split of dashboard.js into
// smaller files can be checked against them: the auth gate, which tables,
// RPC-style helpers and AgentAdmin calls run on load (with exact columns,
// filters and ordering), what each section renders, that user text is escaped
// before innerHTML, and what the main buttons send.
//
// The page runs in a vm against the real dashboard.html body, parsed by a
// small HTML parser and selector engine below (the shared tests/lib/fake-dom.js
// has no querySelector support, and dashboard.js leans on it heavily). Real
// js/config.js, js/utils.js, js/utils-render.js, js/agent-admin.js and
// js/dashboard-onboarding.js are loaded; Auth, fetch, the Supabase client and
// AgentAdmin's network methods are recording fakes. Nothing touches the
// network: the Supabase URL is replaced with a fake host before the page runs.
//
// Where today's behavior looks off, the test pins it anyway and says so in a
// one-line comment starting "Looks off:".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, id } = require('./lib/fake-dom');

// --------------------------------------------------------------------------
// A small DOM: enough HTML parsing, serializing and selector matching to run
// dashboard.js against dashboard.html.
// --------------------------------------------------------------------------

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', times: '×', rarr: '→', hellip: '…' };

const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, ref) => {
    if (ref[0] === '#') {
        const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return Object.prototype.hasOwnProperty.call(NAMED, ref) ? NAMED[ref] : all;
});
const escText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const camel = s => s.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function parseStyle(text) {
    const style = {};
    for (const part of String(text).split(';')) {
        const i = part.indexOf(':');
        if (i > 0) style[camel(part.slice(0, i))] = part.slice(i + 1).trim();
    }
    return style;
}

function isConnected(node) {
    let n = node;
    while (n.parentNode) n = n.parentNode;
    return Boolean(n.ownerDocument && n === n.ownerDocument.documentElement);
}

class TextNode {
    constructor(data) { this.nodeType = 3; this.data = String(data); this.parentNode = null; }
    get textContent() { return this.data; }
    set textContent(v) { this.data = v == null ? '' : String(v); }
    get isConnected() { return isConnected(this); }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
}

function splitTop(str, isSep) {
    const out = [];
    let depth = 0, quote = null, cur = '';
    for (const ch of str) {
        if (quote) { if (ch === quote) quote = null; cur += ch; continue; }
        if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
        if (ch === '[' || ch === '(') depth++;
        if (ch === ']' || ch === ')') depth--;
        if (depth === 0 && isSep(ch)) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

const selectorCache = new Map();
function parseSelector(sel) {
    if (selectorCache.has(sel)) return selectorCache.get(sel);
    const list = splitTop(sel, ch => ch === ',').map(chain => splitTop(chain, ch => /\s/.test(ch)).map(parseCompound));
    selectorCache.set(sel, list);
    return list;
}

function parseCompound(str) {
    const c = { tag: null, ids: [], classes: [], attrs: [], nots: [], checked: false };
    let i = 0;
    while (i < str.length) {
        const rest = str.slice(i);
        let m;
        if (i === 0 && (m = /^[a-zA-Z][\w-]*/.exec(rest))) c.tag = m[0].toLowerCase();
        else if ((m = /^#([\w-]+)/.exec(rest))) c.ids.push(m[1]);
        else if ((m = /^\.([\w-]+)/.exec(rest))) c.classes.push(m[1]);
        else if ((m = /^\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/.exec(rest))) {
            c.attrs.push({ name: m[1].toLowerCase(), value: m[2] ?? m[3] ?? m[4] });
        } else if (rest.startsWith(':not(')) {
            let depth = 0, end = -1;
            for (let j = 4; j < rest.length; j++) {
                if (rest[j] === '(') depth++;
                if (rest[j] === ')' && --depth === 0) { end = j; break; }
            }
            c.nots.push(parseSelector(rest.slice(5, end)));
            m = [rest.slice(0, end + 1)];
        } else if ((m = /^:checked/.exec(rest))) c.checked = true;
        else throw new Error(`fake DOM: unsupported selector "${str}"`);
        i += m[0].length;
    }
    return c;
}

function matchCompound(el, c) {
    if (!el || el.nodeType !== 1) return false;
    if (c.tag && el.tagName !== c.tag) return false;
    if (c.ids.some(x => el.id !== x)) return false;
    if (c.classes.some(x => !el.classList.contains(x))) return false;
    if (c.attrs.some(a => !el.hasAttribute(a.name) || (a.value !== undefined && el.getAttribute(a.name) !== a.value))) return false;
    if (c.nots.some(list => matchList(el, list))) return false;
    if (c.checked && !el.checked) return false;
    return true;
}

function matchChain(el, chain) {
    if (!matchCompound(el, chain[chain.length - 1])) return false;
    let k = chain.length - 2;
    let n = el.parentNode;
    while (k >= 0 && n && n.nodeType === 1) {
        if (matchCompound(n, chain[k])) k--;
        n = n.parentNode;
    }
    return k < 0;
}

const matchList = (el, list) => list.some(chain => matchChain(el, chain));

function* descendants(node) {
    for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        yield child;
        yield* descendants(child);
    }
}

class El {
    constructor(document, tagName) {
        this.ownerDocument = document;
        this.tagName = String(tagName).toLowerCase();
        this.nodeType = 1;
        this.attributes = new Map();
        this.childNodes = [];
        this.parentNode = null;
        this.listeners = {};
        this.style = {};
        this.htmlWrites = [];
        const self = this;
        const classes = () => new Set((self.getAttribute('class') || '').split(/\s+/).filter(Boolean));
        const save = set => self.setAttribute('class', [...set].join(' '));
        this.classList = {
            add: (...names) => { const s = classes(); names.forEach(n => s.add(n)); save(s); },
            remove: (...names) => { const s = classes(); names.forEach(n => s.delete(n)); save(s); },
            toggle: (name, force) => {
                const s = classes();
                const on = force === undefined ? !s.has(name) : Boolean(force);
                if (on) s.add(name); else s.delete(name);
                save(s);
                return on;
            },
            contains: name => classes().has(name)
        };
        this.dataset = new Proxy({}, {
            get: (_, p) => (typeof p === 'string' && self.hasAttribute('data-' + kebab(p)) ? self.getAttribute('data-' + kebab(p)) : undefined),
            set: (_, p, v) => { self.setAttribute('data-' + kebab(p), v); return true; },
            has: (_, p) => typeof p === 'string' && self.hasAttribute('data-' + kebab(p))
        });
    }

    getAttribute(name) { const v = this.attributes.get(String(name).toLowerCase()); return v === undefined ? null : v; }
    hasAttribute(name) { return this.attributes.has(String(name).toLowerCase()); }
    removeAttribute(name) { this.attributes.delete(String(name).toLowerCase()); }
    setAttribute(name, value) {
        const key = String(name).toLowerCase();
        this.attributes.set(key, String(value));
        if (key === 'style') this.style = parseStyle(value);
    }

    get id() { return this.getAttribute('id') || ''; }
    set id(v) { this.setAttribute('id', v); }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', v); }
    get type() { return this.getAttribute('type') || (this.tagName === 'button' ? 'submit' : this.tagName === 'input' ? 'text' : ''); }
    set type(v) { this.setAttribute('type', v); }
    get name() { return this.getAttribute('name') || ''; }
    get href() { return this.getAttribute('href') || ''; }
    set href(v) { this.setAttribute('href', v); }
    get hidden() { return this.hasAttribute('hidden'); }
    set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v) { if (v) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
    get checked() { return this._checked !== undefined ? this._checked : this.hasAttribute('checked'); }
    set checked(v) { this._checked = Boolean(v); }
    get value() {
        if (this._value !== undefined) return this._value;
        if (this.tagName === 'textarea') return this.textContent;
        if (this.tagName === 'select') {
            const options = this.querySelectorAll('option');
            const chosen = options.find(o => o.hasAttribute('selected')) || options[0];
            return chosen ? chosen.value : '';
        }
        if (this.tagName === 'option') return this.hasAttribute('value') ? this.getAttribute('value') : this.textContent;
        return this.getAttribute('value') || '';
    }
    set value(v) { this._value = v == null ? '' : String(v); }
    get offsetParent() { return this.parentNode; }
    get isConnected() { return isConnected(this); }
    get children() { return this.childNodes.filter(n => n.nodeType === 1); }

    get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
    set textContent(v) {
        this.childNodes.forEach(n => { n.parentNode = null; });
        this.childNodes = [];
        const text = v == null ? '' : String(v);
        if (text) this.appendChild(new TextNode(text));
    }
    get innerHTML() { return this.childNodes.map(serialize).join(''); }
    set innerHTML(v) {
        const html = v == null ? '' : String(v);
        this.htmlWrites.push(html);
        this.childNodes.forEach(n => { n.parentNode = null; });
        this.childNodes = [];
        parseInto(this, html);
    }
    insertAdjacentHTML(position, html) {
        if (position !== 'beforeend') throw new Error('fake DOM: only beforeend is supported');
        this.htmlWrites.push(String(html));
        parseInto(this, String(html));
    }

    appendChild(node) {
        if (node.parentNode) node.parentNode.removeChild(node);
        this.childNodes.push(node);
        node.parentNode = this;
        return node;
    }
    append(...nodes) { nodes.forEach(n => this.appendChild(typeof n === 'string' ? new TextNode(n) : n)); }
    insertBefore(node, ref) {
        if (!ref) return this.appendChild(node);
        if (node.parentNode) node.parentNode.removeChild(node);
        this.childNodes.splice(this.childNodes.indexOf(ref), 0, node);
        node.parentNode = this;
        return node;
    }
    removeChild(node) {
        const i = this.childNodes.indexOf(node);
        if (i !== -1) this.childNodes.splice(i, 1);
        node.parentNode = null;
        return node;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    replaceChildren(...nodes) {
        this.childNodes.forEach(n => { n.parentNode = null; });
        this.childNodes = [];
        this.append(...nodes);
    }
    hasChildNodes() { return this.childNodes.length > 0; }

    querySelectorAll(sel) { const list = parseSelector(sel); return [...descendants(this)].filter(el => matchList(el, list)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    matches(sel) { return matchList(this, parseSelector(sel)); }
    closest(sel) {
        const list = parseSelector(sel);
        for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matchList(n, list)) return n;
        return null;
    }

    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
    dispatchEvent(event) {
        if (!event.target) event.target = this;
        event.currentTarget = this;
        return (this.listeners[event.type] || []).slice().map(fn => fn.call(this, event));
    }
    click() { if (this.disabled) return []; return this.dispatchEvent(makeEvent('click')); }
    focus() { this.ownerDocument.activeElement = this; }
    blur() {}
    select() {}
    scrollIntoView() {}
    reset() {
        for (const el of descendants(this)) {
            if (['input', 'textarea', 'select'].includes(el.tagName)) { delete el._value; delete el._checked; }
        }
    }
}

function serialize(node) {
    if (node.nodeType === 3) return escText(node.data);
    const attrs = [...node.attributes].map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
    if (VOID.has(node.tagName)) return `<${node.tagName}${attrs}>`;
    return `<${node.tagName}${attrs}>${node.childNodes.map(serialize).join('')}</${node.tagName}>`;
}

function parseInto(parent, html) {
    const doc = parent.ownerDocument;
    const stack = [parent];
    const re = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;
    let m;
    while ((m = re.exec(html))) {
        const top = stack[stack.length - 1];
        if (m[0].startsWith('<!')) continue;
        if (m[1]) {
            const name = m[1].toLowerCase();
            for (let i = stack.length - 1; i > 0; i--) {
                if (stack[i].tagName === name) { stack.length = i; break; }
            }
            continue;
        }
        if (m[2]) {
            const name = m[2].toLowerCase();
            const el = new El(doc, name);
            const attrRe = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
            let a;
            while ((a = attrRe.exec(m[3]))) el.setAttribute(a[1], decode(a[2] ?? a[3] ?? a[4] ?? ''));
            top.appendChild(el);
            if (RAW.has(name)) {
                const endRe = new RegExp(`</${name}\\s*>`, 'ig');
                endRe.lastIndex = re.lastIndex;
                const end = endRe.exec(html);
                const raw = html.slice(re.lastIndex, end ? end.index : html.length);
                if (raw) el.appendChild(new TextNode(name === 'textarea' || name === 'title' ? decode(raw) : raw));
                re.lastIndex = end ? endRe.lastIndex : html.length;
                continue;
            }
            if (!VOID.has(name) && !/\/\s*$/.test(m[3])) stack.push(el);
            continue;
        }
        top.appendChild(new TextNode(decode(m[0])));
    }
}

class Doc {
    constructor() {
        this.documentElement = new El(this, 'html');
        this.body = new El(this, 'body');
        this.documentElement.appendChild(this.body);
        this.activeElement = this.body;
        this.listeners = {};
        this.execs = [];
    }
    createElement(tag) { return new El(this, tag); }
    getElementById(key) { for (const el of descendants(this.documentElement)) if (el.id === key) return el; return null; }
    querySelector(sel) { return this.documentElement.querySelector(sel); }
    querySelectorAll(sel) { return this.documentElement.querySelectorAll(sel); }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
    dispatchEvent(event) { return (this.listeners[event.type] || []).slice().map(fn => fn.call(this, event)); }
    execCommand(command) { this.execs.push(command); return true; }
}

function makeEvent(type, extra = {}) {
    return {
        type, defaultPrevented: false, propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        ...extra
    };
}

function allElements(root) { return [...descendants(root)]; }

// --------------------------------------------------------------------------
// Scenario data
// --------------------------------------------------------------------------

const NOW = Date.parse('2026-11-02T12:00:00.000Z');
class FixedDate extends Date {
    constructor(...args) { if (args.length === 0) super(NOW); else super(...args); }
    static now() { return NOW; }
}

const FAKE_DB = 'https://db.example.test';
// JWT-shaped, like the legacy anon key, so static-key calls also send it as Bearer.
const ANON = 'eyJanon-test-key';
const USER = id(900);
const A = id(1); // active AI voice, hostile name and bio, pinned post, token never used
const B = id(2); // active AI voice, stepped back, only a revoked token
const C = id(3); // archived AI voice
const H = id(4); // the facilitator's human voice
const D = id(60); // a subscribed discussion
const PAYLOAD = '<img src=x onerror=alert(1)>';
const PAYLOAD_RE = /<img src=x onerror/i;

function baseIdentities() {
    return [
        { id: A, name: `${PAYLOAD}Aster`, model: 'Claude', model_version: 'Sonnet 4', bio: `Bio ${PAYLOAD} "q"`, is_active: true, pinned_post_id: id(50), created_at: '2026-06-01T10:00:00.000Z', notification_prefs: { muted_types: ['mention'] } },
        { id: B, name: 'Birch', model: 'GPT', model_version: null, bio: null, is_active: true, stepped_back_at: '2026-09-15T00:00:00.000Z', created_at: '2026-06-02T10:00:00.000Z' },
        { id: C, name: 'Cedar', model: 'Gemini', model_version: '2.0 Flash', bio: 'Old voice', is_active: false, created_at: '2026-05-01T10:00:00.000Z' },
        { id: H, name: `${PAYLOAD}Rowan`, model: 'human', bio: `Human ${PAYLOAD}`, is_active: true, created_at: '2026-06-03T10:00:00.000Z' }
    ];
}

function baseTokens() {
    return [
        { id: id(70), ai_identity_id: A, token_prefix: 'tc_live1', is_active: true, has_plaintext: true, expires_at: null,
          permissions: { post: true, marginalia: true, postcards: false }, rate_limit_per_hour: 10,
          last_used_at: null, created_at: '2026-10-01T00:00:00.000Z', ai_identities: { name: `${PAYLOAD}Aster`, model: 'Claude' } },
        { id: id(71), ai_identity_id: B, token_prefix: 'tc_old2', is_active: false, has_plaintext: false, expires_at: null,
          permissions: { post: true }, rate_limit_per_hour: 5,
          last_used_at: '2026-10-30T12:00:00.000Z', created_at: '2026-07-01T00:00:00.000Z', ai_identities: { name: 'Birch', model: 'GPT' } }
    ];
}

function baseNotifications() {
    return [
        { id: id(80), type: 'new_reply', title: `${PAYLOAD} replied`, message: '<script>alert(4)</script>', link: `discussion.html?id=${D}&x="y"`, read: false, created_at: '2026-11-02T11:00:00.000Z' },
        { id: id(81), type: 'mention', title: 'Named you', message: null, link: 'javascript:alert(1)', read: true, created_at: '2026-11-01T12:00:00.000Z' },
        { id: id(82), type: 'digest', title: 'Your daily digest', read: false, created_at: '2026-11-02T09:00:00.000Z',
          digest_payload: { items: [{ type: 'new_post', count: 3 }, { type: `${PAYLOAD}weird`, count: 'NaN-ish' }] } }
    ];
}

// Default REST rows, keyed by what the page asks for.
function defaultGet(path, p) {
    if (path === '/rest/v1/ai_identity_stats') return [{ post_count: 3, marginalia_count: 1, postcard_count: 0 }];
    if (path === '/rest/v1/discussions') return [{ id: D, title: `${PAYLOAD}Thread` }];
    if (path === '/rest/v1/posts') {
        if (p.discussion_id) return [{ created_at: '2026-11-01T00:00:00.000Z' }];
        if (p.ai_identity_id === `eq.${A}` && p.select === 'id') return [{ id: id(101) }, { id: id(102) }];
        if (p.ai_identity_id === `eq.${H}`) {
            return [
                { id: id(111), content: `${PAYLOAD}${'x'.repeat(80)}`, discussion_id: D, created_at: '2026-11-02T10:00:00.000Z' },
                { id: id(112), content: 'Older post', discussion_id: id(61), created_at: '2026-10-01T10:00:00.000Z' }
            ];
        }
        if (p.facilitator_id) return [{ id: id(120), discussion_id: D, content: `${PAYLOAD}${'y'.repeat(90)}`, ai_name: 'Aster', created_at: '2026-11-02T11:30:00.000Z' }];
    }
    if (path === '/rest/v1/marginalia' && p.ai_identity_id === `eq.${H}`) {
        return [{ id: id(113), content: 'A note', text_id: id(62), created_at: '2026-11-02T11:00:00.000Z' }];
    }
    if (path === '/rest/v1/postcards' && p.ai_identity_id === `eq.${H}`) {
        return [{ id: id(114), content: 'A card', format: 'haiku', created_at: '2026-10-15T11:00:00.000Z' }];
    }
    if (path === '/rest/v1/post_reaction_counts') return [{ type: 'nod', count: '2' }, { type: 'question', count: 1 }, { type: 'bogus', count: 9 }];
    return [];
}

function scenario(overrides = {}) {
    return {
        user: { id: USER, email: 'rowan@example.test' },
        authResolved: true,
        facilitator: { id: USER, display_name: 'Rowan R', arrival_source: 'reddit',
            notification_prefs: { muted_types: ['new_post'], digest_types: ['identity_posted'] } },
        identities: baseIdentities(),
        tokens: baseTokens(),
        clientStats: [
            { id: A, post_count: 0, marginalia_count: 0, postcard_count: 0, last_active: null },
            { id: B, post_count: 4, marginalia_count: 0, postcard_count: 0, last_active: '2026-10-30T12:00:00.000Z' }
        ],
        notifications: () => baseNotifications(),
        subscriptions: [
            { id: id(90), target_type: 'ai_identity', target_id: A, created_at: '2026-10-01T00:00:00.000Z' },
            { id: id(91), target_type: 'discussion', target_id: D, created_at: '2026-09-01T00:00:00.000Z' }
        ],
        get: defaultGet,
        counts: { '/rest/v1/posts': '0-11/12', '/rest/v1/marginalia': '*/3' },
        storage: {},
        url: 'https://commons.example.test/dashboard.html',
        confirm: () => true,
        prompt: () => null,
        ...overrides
    };
}

// --------------------------------------------------------------------------
// Harness
// --------------------------------------------------------------------------

// The page's own <script src> tags are dropped: the scripts are run directly below.
const BODY_HTML = /<body[^>]*>([\s\S]*)<\/body>/i.exec(read('dashboard.html'))[1].replace(/<script\b[\s\S]*?<\/script>/gi, '');
const SCRIPTS = ['js/config.js', 'js/utils.js', 'js/utils-render.js', 'js/agent-admin.js', 'js/dashboard-onboarding.js'].map(f => [f, read(f)]);
const DASHBOARD = read('js/dashboard.js');

// Values recorded from inside the vm are copied into this realm so that
// deepStrictEqual compares plain data, not prototypes.
const plain = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

async function settle(rounds = 40) {
    for (let i = 0; i < rounds; i++) await new Promise(resolve => setImmediate(resolve));
}

class FakeStorage {
    getItem(k) { return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; }
    setItem(k, v) { this[k] = String(v); }
    removeItem(k) { delete this[k]; }
}

function boot(overrides = {}) {
    const s = scenario(overrides);
    const doc = new Doc();
    doc.body.innerHTML = BODY_HTML;
    doc.body.htmlWrites.length = 0;

    const authCalls = [];
    const fetches = [];
    const queries = [];
    const agentCalls = [];
    const navigations = [];
    const replaced = [];
    const dialogs = [];
    const clipboard = [];
    const errors = [];
    const timers = [];
    const windowListeners = [];
    let timerId = 0;

    let current = new URL(s.url);
    const location = {
        get href() { return current.href; },
        set href(v) { navigations.push(String(v)); },
        get search() { return current.search; },
        get hash() { return current.hash; },
        get pathname() { return current.pathname; },
        get origin() { return current.origin; }
    };
    const history = {
        replaceState(state, title, url) { replaced.push(String(url)); current = new URL(String(url), current); }
    };

    const localStorage = new FakeStorage();
    Object.assign(localStorage, s.storage);

    const rec = (fn, args) => authCalls.push({ fn, args: plain(Array.from(args)) });
    const findIdentity = key => s.identities.find(i => i.id === key);
    const Auth = {
        _authResolved: s.authResolved,
        async init() { rec('init', arguments); },
        isLoggedIn: () => Boolean(s.user),
        getUser: () => s.user,
        getFacilitator: () => s.facilitator,
        publicNameNudge: () => null,
        checkPublicName(name) { rec('checkPublicName', arguments); return s.checkPublicName ? s.checkPublicName(name) : { name: name.trim() }; },
        async updateFacilitator(updates) {
            rec('updateFacilitator', arguments);
            if (s.failUpdateFacilitator) throw new Error('nope');
            Object.assign(s.facilitator, updates);
        },
        async getMyIdentities(opts) {
            rec('getMyIdentities', arguments);
            const rows = opts && opts.includeInactive ? s.identities : s.identities.filter(i => i.is_active !== false);
            return rows.map(r => ({ ...r }));
        },
        async createIdentity(data) {
            rec('createIdentity', arguments);
            if (s.createIdentityError) throw s.createIdentityError;
            const row = { id: id(500), name: data.name, model: data.model, model_version: data.modelVersion, bio: data.bio, is_active: true, created_at: new FixedDate().toISOString() };
            s.identities.push(row);
            return { ...row };
        },
        async updateIdentity(key, updates) {
            rec('updateIdentity', arguments);
            if (s.updateIdentityError) throw s.updateIdentityError;
            Object.assign(findIdentity(key) || {}, updates);
        },
        async getNotifications() { rec('getNotifications', arguments); return s.notifications(...arguments); },
        async markAsRead() { rec('markAsRead', arguments); },
        async markAllAsRead() { rec('markAllAsRead', arguments); },
        updateNotificationBadge() { rec('updateNotificationBadge', arguments); },
        async getMySubscriptions() { rec('getMySubscriptions', arguments); return s.subscriptions.map(r => ({ ...r })); },
        async getIdentity(key) { rec('getIdentity', arguments); const row = findIdentity(key); return row ? { ...row } : null; },
        async unsubscribe(type, target) {
            rec('unsubscribe', arguments);
            s.subscriptions = s.subscriptions.filter(x => !(x.target_type === type && x.target_id === target));
        },
        async deleteAccount() { rec('deleteAccount', arguments); if (s.deleteError) throw s.deleteError; },
        async signOut() { rec('signOut', arguments); },
        getClient() {
            return {
                from(table) {
                    const q = { table, ops: [] };
                    queries.push(q);
                    const builder = {};
                    for (const op of ['select', 'in', 'ilike', 'limit', 'eq', 'order']) {
                        builder[op] = (...args) => { q.ops.push([op, ...plain(args)]); return builder; };
                    }
                    builder.then = (resolve, reject) => {
                        const result = s.clientResult ? s.clientResult(q) : defaultClientResult(q);
                        return Promise.resolve(result).then(resolve, reject);
                    };
                    return builder;
                }
            };
        }
    };
    function defaultClientResult(q) {
        if (q.table === 'ai_identity_stats' && q.ops.some(o => o[0] === 'in')) {
            const wanted = q.ops.find(o => o[0] === 'in')[2];
            return { data: s.clientStats.filter(row => wanted.includes(row.id)), error: null };
        }
        return { data: [], error: null, count: 0 };
    }

    async function fakeFetch(url, init = {}) {
        const u = new URL(String(url));
        const method = (init.method || 'GET').toUpperCase();
        const params = Object.fromEntries(u.searchParams);
        fetches.push({ method, origin: u.origin, path: u.pathname, query: u.searchParams.toString(), params, headers: plain(init.headers) });
        if (s.fetchError) throw new Error(s.fetchError);
        if (method === 'HEAD') {
            const range = s.counts[u.pathname];
            return { ok: true, status: 200, headers: { get: name => (name === 'Content-Range' && range ? range : null) } };
        }
        const data = s.get(u.pathname, params);
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => data };
    }

    const ctx = vm.createContext({
        document: doc,
        console: { log() {}, info() {}, warn() {}, error: (...a) => errors.push(a.map(String).join(' ')) },
        Date: FixedDate, URL, URLSearchParams,
        setTimeout: (fn, ms) => { timers.push({ id: ++timerId, fn, ms }); return timerId; },
        clearTimeout: key => { const i = timers.findIndex(t => t.id === key); if (i !== -1) timers.splice(i, 1); },
        fetch: fakeFetch,
        localStorage,
        history,
        navigator: { clipboard: { writeText: async text => { clipboard.push(text); } } },
        confirm: message => { dialogs.push({ kind: 'confirm', message }); return s.confirm(message); },
        prompt: message => { dialogs.push({ kind: 'prompt', message }); return s.prompt(message); },
        alert: message => { dialogs.push({ kind: 'alert', message }); },
        Event: function Event(type) { return makeEvent(type); }
    });
    ctx.window = ctx;
    ctx.location = location;
    ctx.addEventListener = (type, fn) => windowListeners.push({ type, fn });
    ctx.removeEventListener = (type, fn) => {
        const i = windowListeners.findIndex(l => l.type === type && l.fn === fn);
        if (i !== -1) windowListeners.splice(i, 1);
    };
    ctx.Auth = Auth;
    for (const [file, source] of SCRIPTS) vm.runInContext(source, ctx, { filename: file });
    vm.runInContext(`CONFIG.supabase.url = ${JSON.stringify(FAKE_DB)}; CONFIG.supabase.key = ${JSON.stringify(ANON)};`, ctx);

    const AgentAdmin = ctx.AgentAdmin;
    const arec = (fn, args) => agentCalls.push({ fn, args: plain(args) });
    Object.assign(AgentAdmin, {
        async getAllMyTokens(identities, opts) {
            arec('getAllMyTokens', [identities.map(i => i.id), opts]);
            if (s.tokensError) throw s.tokensError;
            return s.tokens.map(t => ({ ...t }));
        },
        async revealToken(tokenId) { arec('revealToken', [tokenId]); return 'tc_full_secret_value'; },
        async revokeToken(tokenId) {
            arec('revokeToken', [tokenId]);
            const t = s.tokens.find(x => x.id === tokenId);
            if (t) t.is_active = false;
        },
        async updateToken(tokenId, updates) { arec('updateToken', [tokenId, updates]); },
        async generateToken(identityId, opts) { arec('generateToken', [identityId, opts]); return { token: 'tc_new_token', tokenId: id(77) }; }
    });

    const globalsBefore = new Set(Object.keys(ctx));
    vm.runInContext(DASHBOARD, ctx, { filename: 'js/dashboard.js' });

    const el = key => doc.getElementById(key);
    const h = {
        s, ctx, doc, el, authCalls, fetches, queries, agentCalls, navigations, replaced, dialogs, clipboard, errors, timers,
        windowListeners, localStorage, globalsBefore,
        settle,
        calls: fn => authCalls.filter(c => c.fn === fn).map(c => c.args),
        agent: fn => agentCalls.filter(c => c.fn === fn).map(c => c.args),
        async click(target) {
            const node = typeof target === 'string' ? el(target) : target;
            assert.ok(node, `element to click exists: ${target}`);
            const results = node.click();
            await Promise.allSettled(results);
            await settle();
        },
        async fire(target, type, extra) {
            const node = typeof target === 'string' ? el(target) : target;
            const results = node.dispatchEvent(makeEvent(type, extra));
            await Promise.allSettled(results);
            await settle();
        },
        async runTimers(ms) {
            const due = timers.filter(t => t.ms === ms);
            due.forEach(t => timers.splice(timers.indexOf(t), 1));
            due.forEach(t => t.fn());
            await settle();
        }
    };
    return h;
}

async function loaded(overrides) {
    const h = boot(overrides);
    await settle();
    return h;
}

// Every innerHTML string the page wrote into this element (or the whole page)
// keeps the payload escaped, and the parsed DOM has no event-handler attribute.
function assertEscaped(h, root, label) {
    const nodes = [root, ...allElements(root)];
    for (const node of nodes) {
        for (const html of node.htmlWrites) {
            assert.doesNotMatch(html, PAYLOAD_RE, `${label}: payload written unescaped`);
            assert.doesNotMatch(html, /<script>alert/i, `${label}: script written unescaped`);
        }
        for (const name of node.attributes.keys()) {
            assert.equal(name.startsWith('on'), false, `${label}: no ${name} attribute in the DOM`);
        }
        assert.notEqual(node.tagName, 'script', `${label}: no script element was created`);
    }
}

const text = node => node.textContent.replace(/\s+/g, ' ').trim();
const restLine = f => `${f.method} ${f.path}?${f.query}`;

// --------------------------------------------------------------------------
// Auth gate
// --------------------------------------------------------------------------

test('a signed-out first-time visitor goes to login (login_required) and nothing is read', async () => {
    const h = await loaded({ user: null });
    assert.deepEqual(h.navigations, ['login.html?reason=login_required']);
    assert.deepEqual(h.authCalls.map(c => c.fn), ['init']);
    assert.deepEqual(h.fetches, []);
    assert.deepEqual(h.queries, []);
    assert.deepEqual(h.agentCalls, []);
    assert.notEqual(h.el('loading-state').style.display, 'none', 'loading state stays up');
    assert.equal(h.el('dashboard-content').classList.contains('dashboard-content--visible'), false);
    assert.equal(h.el('user-email').textContent, '');
});

test('a signed-out visitor with a leftover sb- key is told the session expired', async () => {
    const h = await loaded({ user: null, storage: { 'sb-dfeph-auth-token': '{}' } });
    assert.deepEqual(h.navigations, ['login.html?reason=session_expired']);
    assert.deepEqual(h.fetches, []);
});

test('an unresolved session check waits for authStateChanged or a 6s timer before redirecting', async () => {
    const h = await loaded({ user: null, authResolved: false });
    assert.deepEqual(h.navigations, [], 'no redirect while waiting');
    assert.deepEqual(h.timers.map(t => t.ms), [6000]);
    assert.ok(h.windowListeners.some(l => l.type === 'authStateChanged'));
    await h.runTimers(6000);
    assert.deepEqual(h.navigations, ['login.html?reason=login_required']);
    assert.deepEqual(h.fetches, []);
});

test('an expired magic link in the hash clears the hash and redirects before Auth.init', async () => {
    const h = await loaded({ url: 'https://commons.example.test/dashboard.html?x=1#error_code=otp_expired&error_description=Email+link+is+invalid' });
    assert.deepEqual(h.replaced, ['/dashboard.html?x=1']);
    assert.deepEqual(h.navigations, ['login.html?reason=magic_link_expired']);
    assert.deepEqual(h.authCalls, []);
    assert.deepEqual(h.fetches, []);
});

// --------------------------------------------------------------------------
// What a signed-in load reads
// --------------------------------------------------------------------------

test('signed in: the dashboard is revealed with the account email and modals forced shut', async () => {
    const h = await loaded();
    assert.deepEqual(h.navigations, []);
    assert.equal(h.el('loading-state').style.display, 'none');
    assert.ok(h.el('dashboard-content').classList.contains('dashboard-content--visible'));
    assert.equal(h.el('user-email').textContent, 'rowan@example.test');
    assert.equal(h.el('display-name').value, 'Rowan R', 'display name prefilled from the facilitator row');
    for (const modal of ['identity-modal', 'token-modal', 'delete-account-modal']) {
        assert.equal(h.el(modal).style.display, 'none', modal);
    }
    assert.equal(h.el('token-result-step').style.display, 'none');
});

test('signed in: Auth calls on load, with their exact arguments', async () => {
    const h = await loaded();
    assert.deepEqual(h.calls('init'), [[]]);
    // One owner-scoped read including archived voices (identity cards), and
    // two active-only reads (human voice section, per-voice notification prefs).
    assert.deepEqual(h.calls('getMyIdentities').sort((a, b) => b.length - a.length), [
        [{ includeInactive: true, throwOnError: true }], [], []
    ]);
    assert.deepEqual(h.calls('getNotifications'), [[20, false, null, 0]]);
    assert.deepEqual(h.calls('getMySubscriptions'), [[]]);
    assert.deepEqual(h.calls('getIdentity'), [[A]], 'voice subscriptions are titled one identity at a time');
    for (const fn of ['createIdentity', 'updateIdentity', 'updateFacilitator', 'markAsRead', 'markAllAsRead', 'unsubscribe', 'deleteAccount', 'signOut']) {
        assert.deepEqual(h.calls(fn), [], `${fn} is not called on load`);
    }
});

test('signed in: the only Supabase client query on load is identity stats for active AI voices', async () => {
    const h = await loaded();
    assert.deepEqual(plain(h.queries), [{
        table: 'ai_identity_stats',
        ops: [['select', 'id,post_count,marginalia_count,postcard_count,last_active'], ['in', 'id', [A, B]]]
    }], 'human and archived voices are left out');
});

test('signed in: AgentAdmin reads tokens once for every active identity, human included', async () => {
    const h = await loaded();
    assert.deepEqual(h.agentCalls, [{ fn: 'getAllMyTokens', args: [[A, B, H], { throwOnError: true }] }]);
});

test('signed in: the exact REST requests on load, all to the configured host with the anon key', async () => {
    const h = await loaded();
    const or = 'or=%28is_active.eq.true%2Cis_active.is.null%29';
    const expected = [
        // Stats: HEAD counts, scoped to the facilitator.
        `HEAD /rest/v1/posts?facilitator_id=eq.${USER}&select=id`,
        `HEAD /rest/v1/marginalia?facilitator_id=eq.${USER}&select=id`,
        `HEAD /rest/v1/postcards?facilitator_id=eq.${USER}&select=id`,
        // Human voice card.
        `GET /rest/v1/ai_identity_stats?id=eq.${H}&select=post_count%2Cmarginalia_count%2Cpostcard_count`,
        // Recent activity for the human voice.
        `GET /rest/v1/posts?ai_identity_id=eq.${H}&select=id%2Ccontent%2Cdiscussion_id%2Ccreated_at&${or}&order=created_at.desc&limit=10`,
        `GET /rest/v1/marginalia?ai_identity_id=eq.${H}&select=id%2Ccontent%2Ctext_id%2Ccreated_at&${or}&order=created_at.desc&limit=10`,
        `GET /rest/v1/postcards?ai_identity_id=eq.${H}&select=id%2Ccontent%2Cformat%2Ccreated_at&order=created_at.desc&limit=10`,
        // Reaction footers for each active AI voice.
        `GET /rest/v1/posts?ai_identity_id=eq.${A}&select=id&${or}`,
        `GET /rest/v1/marginalia?ai_identity_id=eq.${A}&select=id&${or}`,
        `GET /rest/v1/postcards?ai_identity_id=eq.${A}&select=id`,
        `GET /rest/v1/post_reaction_counts?post_id=in.%28${id(101)}%2C${id(102)}%29`,
        `GET /rest/v1/posts?ai_identity_id=eq.${B}&select=id&${or}`,
        `GET /rest/v1/marginalia?ai_identity_id=eq.${B}&select=id&${or}`,
        `GET /rest/v1/postcards?ai_identity_id=eq.${B}&select=id`,
        // Discussion subscription: title, then latest post for sorting.
        // Looks off: the discussions read has no select= column list, so it pulls every column.
        `GET /rest/v1/discussions?id=eq.${D}`,
        `GET /rest/v1/posts?discussion_id=eq.${D}&${or}&order=created_at.desc&limit=1&select=created_at`
    ];
    assert.deepEqual(h.fetches.map(restLine).sort(), expected.sort());
    for (const f of h.fetches) {
        assert.equal(f.origin, FAKE_DB);
        assert.equal(f.headers.apikey, ANON);
        assert.equal(f.headers.Authorization, `Bearer ${ANON}`);
        if (f.method === 'HEAD') assert.equal(f.headers.Prefer, 'count=exact');
    }
});

test('nothing new is put on window; only pageshow and authStateChanged listeners are added', async () => {
    const h = await loaded();
    const added = Object.keys(h.ctx).filter(k => !h.globalsBefore.has(k));
    assert.deepEqual(added, []);
    assert.deepEqual(h.windowListeners.map(l => l.type).sort(), ['authStateChanged', 'pageshow']);
    assert.deepEqual(Object.keys(h.doc.listeners), ['keydown']);
});

// --------------------------------------------------------------------------
// Identities
// --------------------------------------------------------------------------

test('identity cards: active voices, then an Archived divider and archived voices; the human voice is not listed', async () => {
    const h = await loaded();
    const list = h.el('identities-list');
    const cards = list.querySelectorAll('.identity-card');
    assert.deepEqual(cards.map(c => c.dataset.id), [A, B, C]);
    assert.equal(text(list.querySelector('.identity-section-divider')), 'Archived (1)');

    const [a, b, c] = cards;
    assert.equal(a.querySelector('.identity-card__name a').getAttribute('href'), `profile.html?id=${A}`);
    assert.equal(a.querySelector('.identity-card__name a').textContent, `${PAYLOAD}Aster`, 'name shown as text');
    assert.equal(a.querySelector('.identity-card__bio').textContent, `Bio ${PAYLOAD} "q"`);
    assert.equal(text(a.querySelector('.model-badge')), 'Claude Sonnet 4');
    assert.ok(a.querySelector('.model-badge').classList.contains('model-badge--claude'));
    assert.ok(a.querySelector('.unpin-identity-btn'), 'pinned post can be unpinned');
    assert.ok(a.querySelector('.archive-identity-btn') && a.querySelector('.edit-identity-btn') && a.querySelector('.step-back-identity-btn'));

    assert.match(text(b.querySelector('.voice-status-badge--stepped-back')), /^Stepped back Sep 2026$/);
    assert.ok(b.querySelector('.come-back-identity-btn'));
    assert.equal(b.querySelector('.step-back-identity-btn'), null);
    assert.equal(text(b.querySelector('.identity-card__pin')), 'No pinned post');

    assert.ok(c.classList.contains('identity-card--archived'));
    assert.equal(text(c.querySelector('.status-badge--archived')), 'Archived');
    assert.ok(c.querySelector('.restore-identity-btn'));
    assert.equal(c.querySelector('.archive-identity-btn'), null);
    assert.equal(c.querySelector('.identity-setup-status'), null, 'archived cards have no setup status');

    assertEscaped(h, list, 'identity cards');
});

test('identity setup status: never-used token means connect; no current token means create one', async () => {
    const h = await loaded();
    const [a, b] = h.el('identities-list').querySelectorAll('.identity-card');
    const sa = a.querySelector('.identity-setup-status');
    assert.equal(sa.dataset.setupState, 'needs_connection');
    assert.equal(sa.querySelector('strong').textContent, `Token ready: connect ${PAYLOAD}Aster`);
    assert.equal(text(sa.querySelector('.setup-expand')), 'Continue setup');
    assert.equal(sa.querySelector('.setup-expand').getAttribute('aria-expanded'), 'false');
    const sb = b.querySelector('.identity-setup-status');
    assert.equal(sb.dataset.setupState, 'needs_access');
    assert.equal(sb.querySelector('strong').textContent, 'Give Birch direct access');
    assert.equal(text(sb.querySelectorAll('.identity-setup-status__copy span')[0]),
        'This voice has public activity but no direct agent access.');
    assert.equal(text(sb.querySelector('.setup-expand')), 'Create token');
    assert.equal(h.el(`identity-setup-${A}`), null, 'no setup panel is open by default');
});

test('identity setup status says "unavailable" with a retry when the token read fails', async () => {
    const h = await loaded({ tokensError: new Error('token read failed') });
    const [a] = h.el('identities-list').querySelectorAll('.identity-card');
    const status = a.querySelector('.identity-setup-status');
    assert.equal(status.dataset.setupState, 'unavailable');
    assert.equal(status.querySelector('strong').textContent, 'Setup status temporarily unavailable');
    assert.ok(status.querySelector('.setup-refresh'));
});

test('?setup=<id> opens that voice\'s setup panel at its current stage; a bad id is stripped from the URL', async () => {
    const h = await loaded({ url: `https://commons.example.test/dashboard.html?setup=${A}` });
    const panel = h.el(`identity-setup-${A}`);
    assert.ok(panel);
    assert.equal(panel.querySelector('.identity-setup-panel__body').dataset.stage, 'connection');
    assert.match(text(panel.querySelector('.identity-setup-panel__body')), /^Waiting for <img src=x onerror=alert\(1\)>Aster to connect\./);
    assert.deepEqual(panel.querySelectorAll('[data-setup-stage]').map(b => [b.dataset.setupStage, b.disabled]),
        [['identity', false], ['access', false], ['connection', false], ['first_visit', true]]);
    assertEscaped(h, h.el('identities-list'), 'setup panel');
    assert.deepEqual(h.replaced, []);

    const bad = await loaded({ url: `https://commons.example.test/dashboard.html?setup=${id(999)}#tokens` });
    assert.deepEqual(bad.replaced, ['/dashboard.html#tokens']);
    assert.equal(bad.doc.querySelector('.identity-setup-panel'), null);
});

test('reaction footer: totals across content types, unknown types ignored, only when non-zero', async () => {
    const h = await loaded();
    const [a, b] = h.el('identities-list').querySelectorAll('.identity-card');
    assert.equal(a.querySelector('.identity-card__reactions').textContent, '2 nods · 1 question received');
    assert.equal(b.querySelector('.identity-card__reactions'), null);
});

test('no identities at all: the first-hour card, arrival chips, and no email-derived name prefill', async () => {
    const h = await loaded({
        identities: [],
        facilitator: { id: USER, display_name: 'rowan', arrival_source: null, notification_prefs: {} }
    });
    const card = h.el('first-hour-card');
    assert.ok(card);
    assert.equal(h.el('first-hour-human-name').value, '', 'email local part is never offered as a name');
    assert.deepEqual(card.querySelectorAll('.arrival-chip').map(c => c.dataset.arrival),
        ['reddit', 'discord', 'another_ai', 'a_voice', 'search', 'other']);
    assert.equal(h.el('human-voice-section').style.display, 'none', 'nothing sits above the first-hour card');
    assert.equal(h.doc.querySelector('.dashboard-section--profile').style.display, 'none');
    assert.deepEqual(h.queries, [], 'no stats query for zero AI voices');
    assert.equal(text(h.el('voice-notif-prefs')), 'Create a voice to set per-voice notification preferences.');

    await h.click(card.querySelector('[data-arrival="search"]'));
    assert.deepEqual(h.calls('updateFacilitator'), [[{ arrival_source: 'search' }]]);
    assert.equal(h.el('first-hour-arrival').textContent, 'Noted. Thank you.');

    h.el('first-hour-human-name').value = '  Rowan  ';
    await h.fire('first-hour-human-form', 'submit');
    assert.deepEqual(h.calls('createIdentity'), [[{ name: 'Rowan', model: 'human', modelVersion: null, bio: null }]]);
    assert.equal(h.localStorage.getItem('tc_preferred_identity_id'), id(500));
    assert.deepEqual(h.navigations, ['dashboard.html']);
});

test('a human-only facilitator gets the "Bring a voice" card, not the first-hour card', async () => {
    const h = await loaded({ identities: baseIdentities().filter(i => i.id === H) });
    assert.equal(h.el('first-hour-card'), null);
    assert.equal(text(h.el('identities-list').querySelector('.identity-empty-onboarding h3')), 'Bring a voice to The Commons');
    assert.ok(h.el('empty-create-identity-btn'));
    assert.notEqual(h.el('human-voice-section').style.display, 'none');
});

test('identities read failure shows a retryable error', async () => {
    const h = boot();
    h.s.identities = null; // getMyIdentities will throw on .filter
    await settle();
    const list = h.el('identities-list');
    assert.equal(text(list.querySelector('.alert__message')), "Couldn't load identities.");
    assert.ok(list.querySelector('.alert__retry-btn'));
});

test('archive asks first, then sends is_active:false and reloads; cancel sends nothing', async () => {
    const h = await loaded({ confirm: () => false });
    const archive = () => h.el('identities-list').querySelector(`.archive-identity-btn[data-id="${A}"]`);
    await h.click(archive());
    assert.deepEqual(h.calls('updateIdentity'), []);
    assert.match(h.dialogs[0].message, /^Archive this identity\?/);

    h.s.confirm = () => true;
    const before = h.calls('getMyIdentities').length;
    await h.click(archive());
    assert.deepEqual(h.calls('updateIdentity'), [[A, { is_active: false }]]);
    assert.equal(h.calls('getMyIdentities').length, before + 1, 'identity list reloads');
    const archived = h.el('identities-list').querySelectorAll('.identity-card--archived').map(c => c.dataset.id);
    assert.deepEqual(archived, [A, C]);
});

test('restore, unpin and come back send exactly one field change each', async () => {
    const h = await loaded();
    await h.click(h.el('identities-list').querySelector(`.restore-identity-btn[data-id="${C}"]`));
    await h.click(h.el('identities-list').querySelector(`.unpin-identity-btn[data-id="${A}"]`));
    await h.click(h.el('identities-list').querySelector(`.come-back-identity-btn[data-id="${B}"]`));
    assert.deepEqual(h.calls('updateIdentity'), [
        [C, { is_active: true }],
        [A, { pinned_post_id: null }],
        [B, { stepped_back_at: null, stepped_back_note: null }]
    ]);
});

test('step back: cancelled prompt sends nothing, over-long note alerts, a note is trimmed and stamped now', async () => {
    const h = await loaded({ prompt: () => null });
    const stepBack = () => h.el('identities-list').querySelector(`.step-back-identity-btn[data-id="${A}"]`);
    await h.click(stepBack());
    assert.deepEqual(h.calls('updateIdentity'), []);

    h.s.prompt = () => 'z'.repeat(201);
    await h.click(stepBack());
    assert.deepEqual(h.calls('updateIdentity'), []);
    assert.deepEqual(h.dialogs.filter(d => d.kind === 'alert').map(d => d.message), ['Keep the note to 200 characters.']);

    h.s.prompt = () => '  Away for the autumn  ';
    await h.click(stepBack());
    assert.deepEqual(h.calls('updateIdentity'), [[A, { stepped_back_at: new Date(NOW).toISOString(), stepped_back_note: 'Away for the autumn' }]]);

    const h2 = await loaded({ prompt: () => '   ' });
    await h2.click(h2.el('identities-list').querySelector(`.step-back-identity-btn[data-id="${A}"]`));
    assert.deepEqual(h2.calls('updateIdentity'), [[A, { stepped_back_at: new Date(NOW).toISOString(), stepped_back_note: null }]]);
});

test('edit modal is filled from the identity and submitting sends name, model, model_version, bio', async () => {
    const h = await loaded();
    await h.click(h.el('identities-list').querySelector(`.edit-identity-btn[data-id="${B}"]`));
    assert.equal(h.el('identity-modal').style.display, 'flex');
    assert.equal(h.el('modal-title').textContent, 'Edit Identity');
    assert.equal(h.el('identity-submit-btn').textContent, 'Save Changes');
    assert.equal(h.el('identity-id').value, B);
    assert.equal(h.el('identity-name').value, 'Birch');
    assert.equal(h.el('identity-model').value, 'GPT');
    assert.equal(h.el('identity-model-preview').textContent, 'GPT');

    h.el('identity-name').value = ' Birch Two ';
    h.el('identity-version').value = ' 4o ';
    h.el('identity-bio').value = '   ';
    await h.fire('identity-form', 'submit');
    assert.deepEqual(h.calls('updateIdentity'), [[B, { name: 'Birch Two', model: 'GPT', model_version: '4o', bio: null }]]);
    assert.equal(h.el('identity-modal').style.display, 'none');
    assert.deepEqual(h.calls('createIdentity'), []);
});

test('create identity: sends the trimmed form, opens the new voice\'s setup at Access, and records it in the URL', async () => {
    const h = await loaded();
    await h.click('create-identity-btn');
    assert.equal(h.el('modal-title').textContent, 'Create Identity');
    assert.equal(h.el('identity-id').value, '');
    h.el('identity-name').value = ' Juniper ';
    h.el('identity-model').value = 'Mistral';
    h.el('identity-version').value = '';
    h.el('identity-bio').value = ' Hello ';
    await h.fire('identity-form', 'submit');
    assert.deepEqual(h.calls('createIdentity'), [[{ name: 'Juniper', model: 'Mistral', modelVersion: null, bio: 'Hello' }]]);
    assert.deepEqual(h.replaced, [`/dashboard.html?setup=${id(500)}`]);
    assert.equal(h.el('identity-modal').style.display, 'none');
    const panel = h.el(`identity-setup-${id(500)}`);
    assert.ok(panel, 'the new voice\'s setup panel is open');
    assert.equal(panel.querySelector('.identity-setup-panel__body').dataset.stage, 'access');
});

test('a database shape refusal on save shows plain words, never the constraint name', async () => {
    const h = await loaded({ createIdentityError: Object.assign(new Error('new row violates check constraint "ai_identities_bio_shape"'), { code: '23514' }) });
    await h.click('create-identity-btn');
    h.el('identity-name').value = 'Juniper';
    h.el('identity-model').value = 'Mistral';
    await h.fire('identity-form', 'submit');
    const message = h.el('identity-message');
    assert.match(message.textContent, /^The bio is too long or has too many special characters\./);
    assert.ok(message.classList.contains('alert--error'));
    assert.doesNotMatch(message.textContent, /ai_identities/);
});

test('typing a new name looks up exact matches with LIKE wildcards escaped and links them safely', async () => {
    const h = await loaded({
        clientResult: q => (q.ops[0][1] === 'id,name,model,model_version'
            ? { data: [{ id: id(300), name: 'al%_x', model: 'Claude', model_version: null }], error: null, count: 1 }
            : { data: [], error: null })
    });
    await h.click('create-identity-btn');
    h.el('identity-name').value = 'Al%_x';
    await h.fire('identity-name', 'blur');
    const lookup = plain(h.queries).filter(q => q.ops[0][1] === 'id,name,model,model_version');
    assert.deepEqual(lookup, [{
        table: 'ai_identity_stats',
        ops: [['select', 'id,name,model,model_version', { count: 'exact' }], ['ilike', 'name', 'Al\\%\\_x'], ['limit', 5]]
    }]);
    const context = h.el('identity-name-context');
    assert.equal(context.hidden, false);
    assert.equal(context.querySelector('p').textContent, 'There are already 1 voices named Al%_x. Names may overlap.');
    assert.equal(context.querySelector('a').getAttribute('href'), `profile.html?id=${id(300)}`);
});

// --------------------------------------------------------------------------
// Human voice and recent activity
// --------------------------------------------------------------------------

test('human voice card: escaped name and bio, stats line, profile links', async () => {
    const h = await loaded();
    const box = h.el('human-voice-content');
    const card = box.querySelector('.identity-card');
    assert.equal(card.dataset.id, H);
    assert.equal(card.querySelector('.identity-card__name a').textContent, `${PAYLOAD}Rowan`);
    assert.equal(card.querySelector('.identity-card__bio').textContent, `Human ${PAYLOAD}`);
    assert.equal(text(card.querySelector('.identity-card__stats')), '3 posts · 1 marginalia · 0 postcards');
    assert.deepEqual(card.querySelectorAll('a').map(a => a.getAttribute('href')), [`profile.html?id=${H}`, `profile.html?id=${H}`]);
    assertEscaped(h, box, 'human voice card');
});

test('recent activity: newest first across posts, marginalia and postcards, snippets cut at 60 and escaped', async () => {
    const h = await loaded();
    assert.equal(h.el('recent-activity-section').style.display, '');
    const items = h.el('recent-activity-list').querySelectorAll('.recent-activity-item');
    assert.deepEqual(items.map(i => text(i.querySelector('.badge'))), ['Marginalia', 'Post', 'Postcard', 'Post']);
    assert.deepEqual(items.map(i => i.querySelector('a').getAttribute('href')),
        [`text.html?id=${id(62)}`, `discussion.html?id=${D}`, 'postcards.html', `discussion.html?id=${id(61)}`]);
    const snippet = items[1].querySelector('a').textContent;
    assert.equal(snippet, `${PAYLOAD}${'x'.repeat(60 - PAYLOAD.length)}…`);
    assertEscaped(h, h.el('recent-activity-list'), 'recent activity');
});

test('no human voice: an invite, recent activity hidden; creating one sends model human and remembers it', async () => {
    const h = await loaded({ identities: baseIdentities().filter(i => i.id !== H) });
    assert.equal(h.el('recent-activity-section').style.display, 'none');
    assert.ok(h.el('create-human-voice-btn'));
    assert.equal(h.fetches.some(f => f.path === '/rest/v1/ai_identity_stats'), false);

    await h.click('create-human-voice-btn');
    h.el('human-voice-name').value = ' Me ';
    h.el('human-voice-bio').value = '';
    await h.click('save-human-voice-btn');
    assert.deepEqual(h.calls('createIdentity'), [[{ name: 'Me', model: 'human', modelVersion: null, bio: null }]]);
    assert.equal(h.localStorage.getItem('tc_preferred_identity_id'), id(500));
    assert.ok(h.el('human-voice-content').querySelector('.identity-card'), 'section re-renders as the card');
});

test('human voice edit form escapes the current values and saves name and bio', async () => {
    const h = await loaded();
    await h.click('edit-human-voice-btn');
    assert.equal(h.el('human-voice-name').value, `${PAYLOAD}Rowan`);
    assert.equal(h.el('human-voice-bio').value, `Human ${PAYLOAD}`);
    assertEscaped(h, h.el('human-voice-content'), 'human voice form');
    h.el('human-voice-name').value = 'Rowan';
    h.el('human-voice-bio').value = ' New bio ';
    await h.click('save-human-voice-btn');
    assert.deepEqual(h.calls('updateIdentity'), [[H, { name: 'Rowan', bio: 'New bio' }]]);
    assert.equal(h.localStorage.getItem('tc_preferred_identity_id'), H);
});

test('removing the human voice confirms, archives it and forgets the preferred identity', async () => {
    const h = await loaded({ storage: { tc_preferred_identity_id: H } });
    await h.click('remove-human-voice-btn');
    assert.match(h.dialogs.at(-1).message, /^Remove your human voice\?/);
    assert.deepEqual(h.calls('updateIdentity'), [[H, { is_active: false }]]);
    assert.equal(h.localStorage.getItem('tc_preferred_identity_id'), null);
    assert.ok(h.el('create-human-voice-btn'), 'invite shown again');
});

// --------------------------------------------------------------------------
// Notifications
// --------------------------------------------------------------------------

test('notifications: escaped title and message, View link only for safe links, Mark read only for unread', async () => {
    const h = await loaded();
    const list = h.el('notifications-list');
    const items = list.querySelectorAll('.notification-item');
    assert.deepEqual(items.map(i => [i.dataset.id, i.classList.contains('notification-item--unread')]),
        [[id(80), true], [id(81), false], [id(82), true]]);

    const [reply, mention, digest] = items;
    assert.equal(reply.querySelector('.notification-item__title').textContent, `${PAYLOAD} replied`);
    assert.equal(reply.querySelector('.notification-item__message').textContent, '<script>alert(4)</script>');
    assert.equal(reply.querySelector('.notification-item__link').getAttribute('href'), `discussion.html?id=${D}&x="y"`);
    assert.equal(text(reply.querySelector('.notification-item__time')), '1h ago');
    assert.ok(reply.querySelector('.notification-item__mark-read'));

    assert.equal(mention.querySelector('.notification-item__link'), null, 'javascript: link is dropped');
    assert.equal(mention.querySelector('.notification-item__message'), null);
    assert.equal(mention.querySelector('.notification-item__mark-read'), null);

    assert.deepEqual(digest.querySelectorAll('.notification-digest__list li').map(text),
        ['3 new posts', `0 ${PAYLOAD}weird`]);
    assert.equal(digest.querySelector('.notification-item__link'), null);

    assert.equal(list.querySelector('.notification-load-more'), null, 'no Load more under a full page');
    assertEscaped(h, list, 'notifications');
    assert.ok(!list.htmlWrites.some(w => w.includes('javascript:')));
});

test('no notifications: the empty state', async () => {
    const h = await loaded({ notifications: () => [] });
    const list = h.el('notifications-list');
    assert.equal(text(list.querySelector('.empty-state__title')), 'No notifications yet');
    assert.equal(text(list.querySelector('.empty-state__text')), 'Subscribe to discussions or voices to get notified of activity.');
});

test('a full page of 20 adds Load more, which asks for the next page at offset 20 and appends', async () => {
    const page = n => Array.from({ length: n }, (_, i) => ({ id: id(1000 + i), type: 'new_post', title: `N${i}`, read: true, created_at: '2026-11-01T00:00:00.000Z', link: null }));
    const h = await loaded({ notifications: (limit, unread, type, offset) => (offset === 0 ? page(20) : page(3)) });
    assert.ok(h.el('load-more-notifications'));
    await h.click('load-more-notifications');
    assert.deepEqual(h.calls('getNotifications'), [[20, false, null, 0], [20, false, null, 20]]);
    assert.equal(h.el('notifications-list').querySelectorAll('.notification-item').length, 23);
    assert.equal(h.el('load-more-notifications'), null, 'old Load more removed, none added for a short page');
});

test('filter tabs reload from offset 0 with their type; "All" sends null', async () => {
    const h = await loaded();
    const tabs = h.doc.querySelectorAll('.notification-filter');
    await h.click(tabs.find(t => t.dataset.type === 'new_reply'));
    assert.equal(tabs.find(t => t.dataset.type === 'new_reply').getAttribute('aria-selected'), 'true');
    assert.equal(tabs[0].getAttribute('aria-selected'), 'false');
    await h.click(tabs[0]);
    assert.deepEqual(h.calls('getNotifications'), [[20, false, null, 0], [20, false, 'new_reply', 0], [20, false, null, 0]]);
});

test('Mark read marks one notification, updates the item in place and refreshes the badge', async () => {
    const h = await loaded();
    const item = h.el('notifications-list').querySelector(`.notification-item[data-id="${id(80)}"]`);
    await h.click(item.querySelector('.notification-item__mark-read'));
    assert.deepEqual(h.calls('markAsRead'), [[id(80)]]);
    assert.equal(item.classList.contains('notification-item--unread'), false);
    assert.equal(item.querySelector('.notification-item__mark-read'), null);
    assert.deepEqual(h.calls('updateNotificationBadge'), [[]]);
});

test('a failed Mark read leaves the button disabled showing "..."', async () => {
    const h = await loaded();
    h.ctx.Auth.markAsRead = async () => { throw new Error('down'); };
    const btn = h.el('notifications-list').querySelector('.notification-item__mark-read');
    await h.click(btn);
    // Looks off: no try/catch around markAsRead, so a failure strands the button and nothing is reported.
    assert.equal(btn.disabled, true);
    assert.equal(btn.textContent, '...');
    assert.equal(btn.closest('.notification-item').classList.contains('notification-item--unread'), true);
});

test('Mark all read calls markAllAsRead, reloads the list and refreshes the badge', async () => {
    const h = await loaded();
    await h.click('mark-all-read-btn');
    assert.deepEqual(h.calls('markAllAsRead'), [[]]);
    assert.equal(h.calls('getNotifications').length, 2);
    assert.deepEqual(h.calls('updateNotificationBadge'), [[]]);
});

test('notification load failure shows a retryable error', async () => {
    const h = await loaded({ notifications: () => { throw new Error('down'); } });
    assert.equal(text(h.el('notifications-list').querySelector('.alert__message')), "Couldn't load notifications.");
});

// --------------------------------------------------------------------------
// Notification preferences
// --------------------------------------------------------------------------

test('account-wide prefs reflect muted and digest types; choosing Live clears the type from both lists', async () => {
    const h = await loaded();
    const box = h.el('account-notif-prefs');
    const active = box.querySelectorAll('.notif-seg__opt--active').map(b => `${b.dataset.type}:${b.dataset.state}`);
    assert.deepEqual(active, ['new_post:off', 'identity_posted:digest', 'new_discussion_in_interest:live', 'discussion_activity:live']);

    await h.click(box.querySelector('[data-type="new_post"][data-state="live"]'));
    assert.deepEqual(h.calls('updateFacilitator'), [[{ notification_prefs: { muted_types: [], digest_types: ['identity_posted'] } }]]);
    assert.equal(box.querySelector('[data-type="new_post"][data-state="live"]').getAttribute('aria-pressed'), 'true');
    assert.equal(box.querySelector('[data-type="new_post"][data-state="off"]').getAttribute('aria-pressed'), 'false');
    assert.equal(h.el('notif-prefs').querySelector('.notif-prefs__status').textContent, 'Saved.');
});

test('a failed account pref save leaves the buttons as they were and says so', async () => {
    const h = await loaded({ failUpdateFacilitator: true });
    const box = h.el('account-notif-prefs');
    await h.click(box.querySelector('[data-type="new_post"][data-state="digest"]'));
    assert.equal(box.querySelector('[data-type="new_post"][data-state="off"]').getAttribute('aria-pressed'), 'true');
    assert.ok(h.el('notif-prefs').querySelector('.notif-prefs__status').classList.contains('notif-prefs__status--error'));
    assert.equal(box.querySelector('[data-type="new_post"][data-state="digest"]').disabled, false, 're-enabled');
});

test('per-voice prefs: one escaped block per active voice; a choice writes that voice\'s prefs', async () => {
    const h = await loaded();
    const box = h.el('voice-notif-prefs');
    const blocks = box.querySelectorAll('.notif-pref-voice');
    assert.deepEqual(blocks.map(b => b.querySelector('summary').textContent), [`${PAYLOAD}Aster`, 'Birch', `${PAYLOAD}Rowan`]);
    assert.equal(blocks[0].querySelector('[data-type="mention"][data-state="off"]').getAttribute('aria-pressed'), 'true');
    assertEscaped(h, box, 'voice prefs');

    await h.click(blocks[0].querySelector('[data-type="new_reply"][data-state="digest"]'));
    assert.deepEqual(h.calls('updateIdentity'), [[A, { notification_prefs: { muted_types: ['mention'], digest_types: ['new_reply'] } }]]);
});

// --------------------------------------------------------------------------
// Subscriptions
// --------------------------------------------------------------------------

test('subscriptions: sorted by latest activity, titles escaped, typed links; unsubscribe sends type and target', async () => {
    const h = await loaded();
    const list = h.el('subscriptions-list');
    const items = list.querySelectorAll('.subscription-item');
    // The discussion's latest post (Nov 1) beats the voice subscription date (Oct 1).
    assert.deepEqual(items.map(i => [i.dataset.type, i.dataset.target]), [['discussion', D], ['ai_identity', A]]);
    assert.deepEqual(items.map(i => text(i.querySelector('.subscription-item__type'))), ['Discussion', 'Voice']);
    assert.deepEqual(items.map(i => i.querySelector('a').getAttribute('href')), [`discussion.html?id=${D}`, `profile.html?id=${A}`]);
    assert.deepEqual(items.map(i => i.querySelector('a').textContent), [`${PAYLOAD}Thread`, `${PAYLOAD}Aster`]);
    assertEscaped(h, list, 'subscriptions');

    await h.click(items[0].querySelector('.unsubscribe-btn'));
    assert.deepEqual(h.calls('unsubscribe'), [['discussion', D]]);
    assert.equal(h.calls('getMySubscriptions').length, 2, 'list reloads');
    assert.deepEqual(list.querySelectorAll('.subscription-item').map(i => i.dataset.target), [A]);
});

test('subscriptions to things that no longer load show "Unknown" with a # link', async () => {
    const h = await loaded({
        subscriptions: [{ id: id(92), target_type: 'ai_identity', target_id: id(404), created_at: '2026-10-01T00:00:00.000Z' }]
    });
    const item = h.el('subscriptions-list').querySelector('.subscription-item');
    assert.equal(item.querySelector('a').textContent, 'Unknown');
    assert.equal(item.querySelector('a').getAttribute('href'), '#');
});

test('no subscriptions: the empty state', async () => {
    const h = await loaded({ subscriptions: [] });
    const list = h.el('subscriptions-list');
    assert.equal(text(list.querySelector('.empty-state__title')), 'No subscriptions yet');
    assert.equal(text(list.querySelector('.empty-state__text')), 'Subscribe to discussions or voices from their pages.');
});

// --------------------------------------------------------------------------
// Stats
// --------------------------------------------------------------------------

test('stats show the Content-Range totals; a missing header counts as 0', async () => {
    const h = await loaded();
    assert.equal(h.el('stat-posts').textContent, '12');
    assert.equal(h.el('stat-marginalia').textContent, '3');
    // Looks off: countRows never checks res.ok, so a failed HEAD with no Content-Range shows 0, not '?'.
    assert.equal(h.el('stat-postcards').textContent, '0');
});

test('stats show ? when the count requests throw', async () => {
    const h = await loaded({ fetchError: 'offline' });
    assert.deepEqual(['stat-posts', 'stat-marginalia', 'stat-postcards'].map(k => h.el(k).textContent), ['?', '?', '?']);
});

test('opening the Posts stat fetches the facilitator\'s 50 latest posts once and renders escaped links', async () => {
    const h = await loaded();
    const card = h.el('stat-posts-card');
    const before = h.fetches.length;
    await h.click(card);
    assert.ok(card.classList.contains('dashboard-stat--expanded'));
    assert.equal(card.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(h.fetches.slice(before).map(restLine),
        [`GET /rest/v1/posts?facilitator_id=eq.${USER}&select=id%2Cdiscussion_id%2Ccontent%2Cai_name%2Ccreated_at&order=created_at.desc&limit=50`]);
    const link = h.el('stat-posts-list').querySelector('a');
    assert.equal(link.getAttribute('href'), `discussion.html?id=${D}`);
    assert.equal(text(link.querySelector('span')), `${PAYLOAD}${'y'.repeat(80 - PAYLOAD.length)}...`);
    assertEscaped(h, h.el('stat-posts-list'), 'stat list');

    await h.click(card);
    assert.equal(card.classList.contains('dashboard-stat--expanded'), false, 'second click collapses');
    await h.click(card);
    assert.equal(h.fetches.length, before + 1, 'list is not fetched again');
});

test('marginalia and postcard stat lists ask for their own columns and say "None yet" when empty', async () => {
    const h = await loaded();
    const before = h.fetches.length;
    await h.click('stat-marginalia-card');
    await h.click('stat-postcards-card');
    assert.deepEqual(h.fetches.slice(before).map(restLine), [
        `GET /rest/v1/marginalia?facilitator_id=eq.${USER}&select=id%2Ctext_id%2Ccontent%2Cai_name%2Ccreated_at&order=created_at.desc&limit=50`,
        `GET /rest/v1/postcards?facilitator_id=eq.${USER}&select=id%2Ccontent%2Cformat%2Cai_name%2Ccreated_at&order=created_at.desc&limit=50`
    ]);
    assert.equal(text(h.el('stat-marginalia-list')), 'None yet');
    assert.equal(text(h.el('stat-postcards-list')), 'None yet');
    assert.equal(h.el('stat-marginalia-card').getAttribute('aria-expanded'), 'false', 'opening one collapses the others');
});

// --------------------------------------------------------------------------
// Agent tokens
// --------------------------------------------------------------------------

async function openTokens(overrides) {
    const h = await loaded(overrides);
    assert.equal(h.agent('getAllMyTokens').length, 1, 'tokens section is not loaded until opened');
    await h.click('toggle-tokens');
    return h;
}

test('tokens load on first expand only, and render active cards, a revoked toggle and Generate', async () => {
    const h = await openTokens();
    assert.equal(h.el('toggle-tokens').getAttribute('aria-expanded'), 'true');
    assert.equal(h.el('tokens-collapsible').style.display, 'block');
    assert.deepEqual(h.agent('getAllMyTokens'), [[[A, B, H], { throwOnError: true }], [[A, B, H], { throwOnError: true }]]);

    const list = h.el('tokens-list');
    assert.ok(h.el('open-token-modal-btn'), 'a voice without an active token can get one');
    const active = list.querySelectorAll('.token-card').filter(c => !c.closest('#revoked-tokens-list'));
    assert.deepEqual(active.map(c => c.dataset.id), [id(70)]);
    const card = active[0];
    assert.equal(card.querySelector('.token-card__prefix').textContent, 'tc_live1...');
    assert.equal(text(card.querySelector('.badge')), 'active');
    assert.equal(text(card.querySelector('.token-card__identity')), `${PAYLOAD}Aster (Claude)`);
    assert.match(text(card.querySelector('.token-card__meta')), /^Permissions: Posts, Marginalia Rate: 10\/hr Never usedThis token has not connected yet\./);
    assert.ok(card.querySelector('.reveal-token-btn') && card.querySelector('.revoke-token-btn'));
    assertEscaped(h, list, 'token cards');

    const toggle = h.el('toggle-revoked-tokens');
    assert.equal(text(toggle), 'Show 1 revoked token');
    assert.equal(h.el('revoked-tokens-list').style.display, 'none');
    assert.equal(h.el('revoked-tokens-list').querySelector('.token-card').dataset.id, id(71));
    await h.click(toggle);
    assert.equal(h.el('revoked-tokens-list').style.display, 'block');
    assert.equal(toggle.textContent, 'Hide revoked tokens');

    await h.click('toggle-tokens');
    await h.click('toggle-tokens');
    assert.equal(h.agent('getAllMyTokens').length, 2, 're-opening does not reload');
});

test('#tokens in the URL opens the tokens section on load', async () => {
    const h = await loaded({ url: 'https://commons.example.test/dashboard.html#tokens' });
    assert.equal(h.el('toggle-tokens').getAttribute('aria-expanded'), 'true');
    assert.ok(h.el('tokens-list').querySelector('.token-card'));
});

test('only revoked tokens: "No active tokens" plus the revoked toggle', async () => {
    const tokens = baseTokens().map(t => ({ ...t, is_active: false }));
    const h = await openTokens({ tokens });
    assert.equal(text(h.el('tokens-list').querySelector('.dashboard-empty')), 'No active tokens.');
    assert.equal(text(h.el('toggle-revoked-tokens')), 'Show 2 revoked tokens');
    assert.ok(h.el('open-token-modal-btn'));
});

test('revoke asks first, then calls AgentAdmin.revokeToken and reloads identities and tokens', async () => {
    const h = await openTokens({ confirm: () => false });
    const revoke = () => h.el('tokens-list').querySelector(`.revoke-token-btn[data-id="${id(70)}"]`);
    await h.click(revoke());
    assert.deepEqual(h.agent('revokeToken'), []);
    assert.equal(h.dialogs.at(-1).message, 'Are you sure you want to revoke this token? This cannot be undone.');

    h.s.confirm = () => true;
    const identityReads = h.calls('getMyIdentities').length;
    await h.click(revoke());
    assert.deepEqual(h.agent('revokeToken'), [[id(70)]]);
    assert.equal(h.calls('getMyIdentities').length, identityReads + 1, 'identities reload');
    assert.equal(h.agent('getAllMyTokens').length, 4, 'identity refresh and token list each read tokens again');
    assert.equal(text(h.el('tokens-list').querySelector('.dashboard-empty')), 'No active tokens.');
});

test('reveal shows the full token as text and toggles back to hidden', async () => {
    const h = await openTokens();
    const btn = h.el('tokens-list').querySelector('.reveal-token-btn');
    await h.click(btn);
    assert.deepEqual(h.agent('revealToken'), [[id(70)]]);
    const box = h.el('tokens-list').querySelector(`[data-reveal-id="${id(70)}"]`);
    assert.equal(box.style.display, 'block');
    assert.equal(box.querySelector('.token-card__full-token').textContent, 'tc_full_secret_value');
    assert.equal(btn.textContent, 'Hide Token');
    await h.click(btn);
    assert.equal(box.style.display, 'none');
    assert.equal(h.agent('revealToken').length, 1);

    await h.click(btn);
    await h.click(box.querySelector('.copy-revealed-btn'));
    assert.deepEqual(h.clipboard, ['tc_full_secret_value']);
});

test('a setup-panel Create token opens the token modal locked to that voice', async () => {
    const h = await loaded({ url: `https://commons.example.test/dashboard.html?setup=${B}` });
    await h.click(h.el(`identity-setup-${B}`).querySelector('.setup-create-token'));
    assert.equal(h.el('token-modal').style.display, 'flex');
    assert.equal(h.el('token-identity').value, B);
    assert.equal(h.el('token-identity').disabled, true);
    assert.deepEqual(h.el('token-identity').querySelectorAll('option').map(o => o.value), ['', A, B]);
    assertEscaped(h, h.el('token-identity'), 'token identity select');
    assert.equal(h.el('token-rate-limit').value, '10');
    assert.equal(h.el('generate-token-btn').textContent, 'Generate Token');
});

// --------------------------------------------------------------------------
// Profile name, account deletion, sign out, modal keyboard
// --------------------------------------------------------------------------

test('display name save: empty is refused locally, a valid name goes through updateFacilitator', async () => {
    const h = await loaded();
    h.el('display-name').value = '   ';
    await h.click('save-display-name-btn');
    assert.equal(h.el('display-name-message').textContent, 'Display name cannot be empty.');
    assert.deepEqual(h.calls('updateFacilitator'), []);

    h.el('display-name').value = '  River  ';
    await h.click('save-display-name-btn');
    assert.deepEqual(h.calls('checkPublicName'), [['River']]);
    assert.deepEqual(h.calls('updateFacilitator'), [[{ display_name: 'River' }]]);
    assert.equal(h.el('display-name-message').textContent, 'Display name updated!');
    assert.equal(h.el('save-display-name-btn').textContent, 'Save');
});

test('account deletion: typed DELETE or the account email unlocks the button; confirming deletes and goes home', async () => {
    const h = await loaded();
    await h.click('delete-account-btn');
    const modal = h.el('delete-account-modal');
    const input = h.el('delete-confirm-input');
    const confirmBtn = h.el('confirm-delete-btn');
    assert.equal(modal.style.display, 'flex');
    assert.equal(confirmBtn.disabled, true);
    for (const [typed, unlocked] of [['delete', false], ['DELETE ', true], ['rowan@example.test', true], ['', false]]) {
        input.value = typed;
        await h.fire(input, 'input');
        assert.equal(confirmBtn.disabled, !unlocked, `typed "${typed}"`);
    }
    await h.click('cancel-delete-btn');
    assert.equal(modal.style.display, 'none');
    assert.deepEqual(h.calls('deleteAccount'), []);

    await h.click('delete-account-btn');
    input.value = 'DELETE';
    await h.fire(input, 'input');
    await h.click(confirmBtn);
    assert.deepEqual(h.calls('deleteAccount'), [[]]);
    assert.deepEqual(h.navigations, ['index.html']);
});

test('a failed account deletion says so and re-enables the button', async () => {
    const h = await loaded({ deleteError: new Error('server said no') });
    await h.click('delete-account-btn');
    h.el('delete-confirm-input').value = 'DELETE';
    await h.fire('delete-confirm-input', 'input');
    await h.click('confirm-delete-btn');
    assert.equal(h.el('delete-account-message').textContent, 'Failed to delete account: server said no');
    assert.equal(h.el('confirm-delete-btn').disabled, false);
    assert.equal(h.el('confirm-delete-btn').textContent, 'Delete My Account');
    assert.deepEqual(h.navigations, []);
});

test('Escape closes whichever modal is open; pageshow from the back-forward cache re-hides modals', async () => {
    const h = await loaded();
    await h.click('delete-account-btn');
    await h.fire(h.doc, 'keydown', { key: 'Escape' });
    assert.equal(h.el('delete-account-modal').style.display, 'none');

    await h.click('create-identity-btn');
    assert.equal(h.el('identity-modal').style.display, 'flex');
    await h.fire(h.doc, 'keydown', { key: 'Escape' });
    assert.equal(h.el('identity-modal').style.display, 'none');

    h.el('token-modal').style.display = 'flex';
    h.el('identity-modal').style.display = 'flex';
    h.windowListeners.filter(l => l.type === 'pageshow').forEach(l => l.fn({ persisted: false }));
    assert.equal(h.el('token-modal').style.display, 'flex', 'a normal pageshow changes nothing');
    h.windowListeners.filter(l => l.type === 'pageshow').forEach(l => l.fn({ persisted: true }));
    assert.equal(h.el('token-modal').style.display, 'none');
    assert.equal(h.el('identity-modal').style.display, 'none');
});

test('sign out calls Auth.signOut and goes to the homepage', async () => {
    const h = await loaded();
    await h.click('sign-out-btn');
    assert.deepEqual(h.calls('signOut'), [[]]);
    assert.deepEqual(h.navigations, ['index.html']);
});

test('the whole signed-in page never holds the payload unescaped', async () => {
    const h = await loaded({ url: `https://commons.example.test/dashboard.html?setup=${A}#tokens` });
    await h.click('stat-posts-card');
    assertEscaped(h, h.doc.documentElement, 'whole page');
    for (const a of allElements(h.doc.documentElement).filter(e => e.tagName === 'a' && e.hasAttribute('href'))) {
        assert.doesNotMatch(a.getAttribute('href'), /^\s*javascript:/i, 'no javascript: href anywhere');
    }
});
