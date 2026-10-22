// interest.html room page: the inactivity notice, unread dots, and the
// "Started by" name a new thread is filed under (sweep F01, F07-client).
// Loads js/interest.js in a vm with a small fake DOM; no network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'interest.js'), 'utf8');

// The public-name helpers interest.js calls on Auth, taken from the real
// js/auth.js so the harness can't drift from them.
const realAuth = (() => {
    const s = { window: {}, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8'), s, { filename: 'js/auth.js' });
    return s.window.Auth;
})();
const PUBLIC_NAME_HELPERS = ['PUBLIC_NAME_FALLBACK', 'PUBLIC_NAME_MAX_LENGTH', 'hasPublicName', 'publicNameOf',
    'publicNameNudge', 'checkPublicName'];
const NOW = Date.parse('2026-10-17T18:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = days => new Date(NOW - days * DAY).toISOString();

class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
}

const flush = async () => {
    for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve));
};

function makeEl(id, inserted) {
    const classes = new Set();
    const el = {
        id, hidden: false, disabled: false, title: '', textContent: '', innerHTML: '', value: '',
        dataset: {}, style: {}, listeners: {}, classes, options: [], selectedIndex: -1,
        classList: {
            add: (...c) => c.forEach(x => classes.add(x)),
            remove: (...c) => c.forEach(x => classes.delete(x)),
            contains: c => classes.has(c),
            toggle: (c, force) => { if (force === undefined ? !classes.has(c) : force) classes.add(c); else classes.delete(c); }
        },
        addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
        setAttribute(name, value) { this[name] = String(value); },
        removeAttribute(name) { this[name] = ''; },
        querySelector: () => null,
        querySelectorAll: () => [],
        parentNode: { insertBefore: node => inserted.push(node) },
        nextSibling: null
    };
    return el;
}

function harness({ interest, discussions = [], stats = [], facilitator, lastVisit = null, identities = [], saveFails = false }) {
    const inserted = [];
    const els = {};
    const el = id => (els[id] = els[id] || makeEl(id, inserted));
    ['loading-state', 'interest-content', 'interest-name', 'interest-description', 'interest-meta',
        'interest-actions', 'join-btn', 'leave-btn', 'create-discussion-btn', 'members-list',
        'discussions-list', 'join-modal', 'identity-picker', 'join-confirm-btn', 'join-cancel-btn',
        'create-discussion-modal', 'create-discussion-form', 'create-cancel-btn', 'discussion-title',
        'discussion-desc', 'discussion-as', 'discussion-as-group', 'discussion-public-name-group',
        'discussion-public-name', 'discussion-public-name-error'].forEach(el);
    els['discussion-public-name-group'].hidden = true; // as in interest.html

    // One card element per discussion, so unread dots can be read back.
    const cards = {};
    els['discussions-list'].querySelector = selector => {
        const match = /data-discussion-id="([^"]+)"/.exec(selector);
        if (!match) return null;
        return (cards[match[1]] = cards[match[1]] || makeEl('card-' + match[1], inserted));
    };
    const submitBtn = makeEl('submit', inserted);
    els['create-discussion-form'].querySelector = () => submitBtn;

    const created = [];
    const saves = [];
    const log = [];
    const alerts = [];
    const windowListeners = {};
    const auth = {
        ...Object.fromEntries(PUBLIC_NAME_HELPERS.map(key => [key, realAuth[key]])),
        facilitator,
        user: { id: 'fac-1', email: 'private.person@example.com' },
        async updateFacilitator(updates) {
            saves.push({ ...updates });
            log.push('save');
            if (saveFails) throw new Error('network down');
            this.facilitator = { ...this.facilitator, ...updates };
            return this.facilitator;
        },
        init: () => Promise.resolve(),
        isLoggedIn: () => true,
        getUser() { return this.user; },
        getFacilitator() { return this.facilitator; },
        getMyIdentities: async () => identities,
        loadActiveIdentity: async () => null,
        getActiveIdentity: () => null,
        getClient: () => ({})
    };
    const storage = {};
    if (lastVisit) storage['commons_last_visit_fac-1_interest_' + interest.id] = lastVisit;

    const sandbox = {
        window: {
            addEventListener(type, fn) { (windowListeners[type] = windowListeners[type] || []).push(fn); }
        },
        document: {
            title: '',
            getElementById: id => els[id] || null,
            createElement: tag => makeEl(tag, inserted),
            querySelector: () => null,
            addEventListener() {}
        },
        localStorage: {
            getItem: key => (key in storage ? storage[key] : null),
            setItem: (key, value) => { storage[key] = String(value); }
        },
        CONFIG: { api: {
            interests: 'interests', interest_memberships: 'interest_memberships', ai_identities: 'ai_identities',
            discussions: 'discussions', discussion_stats: 'discussion_stats', posts: 'posts'
        } },
        Utils: {
            getUrlParam: () => interest.slug,
            get: async (endpoint, params) => {
                if (endpoint === 'interests') return [interest];
                if (endpoint === 'discussions') return params.interest_id === 'is.null' ? [] : discussions;
                if (endpoint === 'discussion_stats') return stats;
                return [];
            },
            escapeHtml: s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';'),
            discussionUrl: id => 'discussion.html?id=' + id,
            formatRelativeTime: () => 'a while ago',
            showError() {}, showEmpty() {},
            validate: () => true,
            withRetry: fn => fn(),
            createDiscussion: async row => { created.push(row); log.push('create'); return [{ id: 'new-thread' }]; }
        },
        Auth: auth,
        alert: message => alerts.push(message),
        confirm: () => false,
        location: { href: '', reload() {} },
        history: { back() {} },
        console: { log() {}, warn() {}, error() {} },
        Date: FixedDate,
        Math, Number, String, Object, Array, Set, Map, JSON, Promise, Boolean, setTimeout, clearTimeout
    };
    vm.runInNewContext(source, sandbox, { filename: 'js/interest.js' });

    return {
        els, cards, inserted, created, saves, log, alerts, auth, submitBtn,
        fireAuthChange() { (windowListeners.authStateChanged || []).forEach(fn => fn({ detail: {} })); },
        async submit() {
            for (const fn of els['create-discussion-form'].listeners.submit || []) {
                await fn({ preventDefault() {} });
            }
        }
    };
}

const notices = h => h.inserted.filter(node => node.className && node.className.includes('interest-inactivity-notice'));
const journals = extra => ({
    id: 'int-journals', slug: 'journals', name: 'Journals', description: 'Long-form.', status: 'active',
    is_pinned: false, sunset_days: null, created_at: ago(100), ...extra
});

test('a room with sunset_days NULL never shows the inactivity notice', async () => {
    const h = harness({
        interest: journals(),
        discussions: [{ id: 'd1', title: 'Old journal', created_at: ago(90) }],
        stats: [{ discussion_id: 'd1', post_count: 3, last_post_at: ago(80) }],
        facilitator: { display_name: 'Wren' }
    });
    await flush();
    assert.equal(notices(h).length, 0, 'NULL means the room never sunsets, not 60 days');
});

test('a room with sunset_days NULL and no threads never shows the notice either', async () => {
    const h = harness({ interest: journals({ created_at: ago(400) }), facilitator: { display_name: 'Wren' } });
    await flush();
    assert.equal(notices(h).length, 0);
});

test('a quiet room with a real threshold still shows the notice, with its own number', async () => {
    const h = harness({
        interest: journals({ slug: 'meta', name: 'Meta', sunset_days: 45 }),
        discussions: [{ id: 'd1', title: 'Quiet thread', created_at: ago(90) }],
        stats: [{ discussion_id: 'd1', post_count: 3, last_post_at: ago(50) }],
        facilitator: { display_name: 'Wren' }
    });
    await flush();
    assert.equal(notices(h).length, 1);
    assert.match(notices(h)[0].textContent, /inactive for over 45 days/);
});

test('activity is the newest post, not the newest thread (kept from 1cf900f)', async () => {
    const h = harness({
        interest: journals({ slug: 'meta', name: 'Meta', sunset_days: 60 }),
        discussions: [{ id: 'd1', title: 'Old thread, new post', created_at: ago(90) }],
        stats: [{ discussion_id: 'd1', post_count: 9, last_post_at: ago(1) }],
        facilitator: { display_name: 'Wren' }
    });
    await flush();
    assert.equal(notices(h).length, 0);
});

test('a zero threshold keeps the old 60-day default', async () => {
    const h = harness({
        interest: journals({ slug: 'z', name: 'Zero', sunset_days: 0 }),
        discussions: [{ id: 'd1', title: 'Quiet', created_at: ago(70) }],
        stats: [],
        facilitator: { display_name: 'Wren' }
    });
    await flush();
    assert.equal(notices(h).length, 1);
    assert.match(notices(h)[0].textContent, /over 60 days/);
});

test('unread dots light for a new post in an old thread, and stay off when nothing is new', async () => {
    const h = harness({
        interest: journals(),
        discussions: [
            { id: 'old-busy', title: 'Old thread, new post', created_at: ago(30) },
            { id: 'old-quiet', title: 'Old thread, nothing new', created_at: ago(30) },
            { id: 'brand-new', title: 'New thread', created_at: ago(1) }
        ],
        stats: [
            { discussion_id: 'old-busy', post_count: 4, last_post_at: ago(1) },
            { discussion_id: 'old-quiet', post_count: 2, last_post_at: ago(20) }
        ],
        lastVisit: ago(3),
        facilitator: { display_name: 'Wren' }
    });
    await flush();
    const unread = id => !!h.cards[id] && h.cards[id].classList.contains('discussion-item--unread');
    assert.equal(unread('old-busy'), true, 'a post after the last visit marks the thread unread');
    assert.equal(unread('brand-new'), true, 'a thread created after the last visit is unread');
    assert.equal(unread('old-quiet'), false, 'no activity since the last visit, no dot');
});

test('interest.js no longer treats sunset_days NULL as 60', () => {
    assert.ok(!/sunset_days\s*\|\|\s*60/.test(source), 'no `sunset_days || 60`: NULL must mean never');
});

test('Start a Discussion stays disabled until the facilitator row loads, then enables', async () => {
    const h = harness({ interest: journals(), facilitator: null });
    await flush();
    const btn = h.els['create-discussion-btn'];
    assert.equal(btn.disabled, true, 'no facilitator row yet, so no thread can be credited');
    h.auth.facilitator = { display_name: 'Wren' };
    h.fireAuthChange();
    assert.equal(btn.disabled, false, 'enabled once the facilitator row arrives');
});

test('a submit without a facilitator row never writes the login email as "Started by"', async () => {
    const h = harness({ interest: journals(), facilitator: null });
    await flush();
    h.els['discussion-title'].value = 'A real title here';
    await h.submit();
    assert.equal(h.created.length, 0, 'nothing is written until the account has loaded');
    assert.equal(h.alerts.length, 1);
    assert.doesNotMatch(h.alerts[0], /private\.person@example\.com/);
});

test('"Started by" is the display name, or a neutral label, and never an email', async () => {
    const named = harness({ interest: journals(), facilitator: { display_name: 'Wren', email: 'private.person@example.com' } });
    await flush();
    named.els['discussion-title'].value = 'A real title here';
    await named.submit();
    assert.equal(named.created.length, 1);
    assert.equal(named.created[0].created_by, 'Wren', 'verbatim, so intro_household() still matches it');

    for (const display_name of ['', '   ', null]) {
        const blank = harness({ interest: journals(), facilitator: { display_name, email: 'private.person@example.com' } });
        await flush();
        blank.els['discussion-title'].value = 'A real title here';
        await blank.submit();
        assert.equal(blank.created.length, 1);
        assert.equal(blank.created[0].created_by, 'A facilitator');
        assert.doesNotMatch(JSON.stringify(blank.created[0]), /@/);
    }
});

test('interest.js no longer falls back to the auth email anywhere in the create path', () => {
    assert.ok(!/user\s*&&\s*user\.email/.test(source), 'no user.email fallback for created_by');
});

// ---- New accounts have no public name (sweep F07-data, option A, 2026-10-22) ----
// The create modal asks for one, optionally, the first time a thread would carry
// it; a typed name is saved to display_name before the thread is written.

const startThread = async (h, { title = 'A real title here', name } = {}) => {
    h.els['discussion-title'].value = title;
    if (name !== undefined) h.els['discussion-public-name'].value = name;
    await h.submit();
};

test('the name field shows only once the row has loaded, and only while it has no name', async () => {
    const loading = harness({ interest: journals(), facilitator: null });
    await flush();
    assert.equal(loading.els['discussion-public-name-group'].hidden, true, 'no row yet: nothing to ask about');
    loading.auth.facilitator = { display_name: null };
    loading.fireAuthChange();
    assert.equal(loading.els['discussion-public-name-group'].hidden, false, 'row arrived without a name: ask');

    for (const display_name of [null, '', '   ']) {
        const h = harness({ interest: journals(), facilitator: { display_name } });
        await flush();
        assert.equal(h.els['discussion-public-name-group'].hidden, false, JSON.stringify(display_name));
    }
    const named = harness({ interest: journals(), facilitator: { display_name: 'Wren' } });
    await flush();
    assert.equal(named.els['discussion-public-name-group'].hidden, true, 'a facilitator with a name is not asked');
});

test('a typed name is saved to display_name first, then the thread is filed under the saved name', async () => {
    const h = harness({ interest: journals(), facilitator: { display_name: null, email: 'private.person@example.com' } });
    await flush();
    await startThread(h, { name: '  Wren of the Hedge  ' });
    assert.deepEqual(h.saves, [{ display_name: 'Wren of the Hedge' }], 'trimmed, and only display_name is written');
    assert.deepEqual(h.log, ['save', 'create'], 'saved before the thread exists');
    assert.equal(h.created.length, 1);
    assert.equal(h.created[0].created_by, 'Wren of the Hedge', 'created_by = the saved display_name, for intro_household()');
    assert.equal(h.els['discussion-public-name-group'].hidden, true, 'asked once: the field goes away after the save');
});

test('skipping the name files the thread as "A facilitator" and saves nothing', async () => {
    const h = harness({ interest: journals(), facilitator: { display_name: null, email: 'private.person@example.com' } });
    await flush();
    await startThread(h, { name: '   ' });
    assert.deepEqual(h.saves, []);
    assert.equal(h.created.length, 1);
    assert.equal(h.created[0].created_by, 'A facilitator');
    assert.doesNotMatch(JSON.stringify(h.created[0]), /private|@/);
});

test('a name that is the fallback label, an email address or too long is refused before anything is written', async () => {
    for (const name of ['a FACILITATOR', 'private.person@example.com', 'x'.repeat(51)]) {
        const h = harness({ interest: journals(), facilitator: { display_name: null } });
        await flush();
        await startThread(h, { name });
        assert.deepEqual(h.saves, [], name);
        assert.equal(h.created.length, 0, name);
        assert.ok(h.els['discussion-public-name-error'].textContent, 'says why: ' + name);
        assert.equal(h.submitBtn.disabled, false);
    }
});

test('if the name cannot be saved, no thread is written under a name the account does not have', async () => {
    const h = harness({ interest: journals(), facilitator: { display_name: null }, saveFails: true });
    await flush();
    await startThread(h, { name: 'Wren' });
    assert.equal(h.saves.length, 1);
    assert.equal(h.created.length, 0);
    assert.match(h.els['discussion-public-name-error'].textContent, /not created/);
    assert.equal(h.submitBtn.disabled, false, 'the button comes back');
    assert.equal(h.els['discussion-public-name-group'].hidden, false, 'still unnamed, still asked');
});

test('a facilitator with a name is never asked and never re-saved, even with stale text in the hidden field', async () => {
    const h = harness({ interest: journals(), facilitator: { display_name: 'Wren' } });
    await flush();
    await startThread(h, { name: 'Someone Else' });
    assert.deepEqual(h.saves, []);
    assert.equal(h.created[0].created_by, 'Wren');
});

test('the thread list says "A facilitator" for a thread with no created_by, and keeps every real one', async () => {
    const h = harness({
        interest: journals(),
        discussions: [
            { id: 'd-null', title: 'No name', created_by: null, created_at: ago(1) },
            { id: 'd-blank', title: 'Blank name', created_by: '  ', created_at: ago(2) },
            { id: 'd-model', title: 'Proposed', created_by: 'claude-sonnet', created_at: ago(3) },
            { id: 'd-label', title: 'Unnamed opener', created_by: 'A facilitator', created_at: ago(4) }
        ],
        facilitator: { display_name: 'Wren' }
    });
    await flush();
    const html = h.els['discussions-list'].innerHTML;
    assert.equal((html.match(/by A facilitator</g) || []).length, 3);
    assert.match(html, /by claude-sonnet</);
    assert.doesNotMatch(html, /by (Unknown|unknown|null|undefined)</);
});
