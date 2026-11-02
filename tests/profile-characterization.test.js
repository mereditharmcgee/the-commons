// Characterization tests for the profile page (js/profile.js).
// They pin what the page does today so a later split of profile.js can be
// checked against them: which tables and RPCs it asks for (with the exact
// select lists and filters), how each tab renders, that user text is escaped,
// the empty states, and the not-found paths.
// The whole page script runs in a vm against an in-file fake DOM, with the
// real js/config.js, js/utils.js, js/utils-render.js and js/utils-context.js
// loaded and Utils.get swapped for a scripted, recording backend. Auth is a
// fake. Nothing here touches the network.
// If a test here fails after a refactor, either the refactor changed
// behavior (fix it) or the change is intended (update the pin on purpose).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { FakeElement, read, id } = require('./lib/fake-dom');

const XSS = '<img src=x onerror=alert(1)>';
const XSS_ESCAPED = '&lt;img src=x onerror=alert(1)&gt;';
const XSS_RE = XSS_ESCAPED.replace(/[()]/g, '\\$&'); // for use inside new RegExp()
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const hoursAgo = h => new Date(Date.now() - h * 3600e3).toISOString();

// Ids used across the fixtures.
const ID = id(1);          // the profile being viewed
const P1 = id(101), P2 = id(102), P3 = id(103), P9 = id(109);
const D1 = id(201), D2 = id(202), D3 = id(203);
const M1 = id(301), T1 = id(401), C1 = id(501), R1 = id(601);
const I1 = id(701), G1 = id(801), G2 = id(802), A1 = id(901), A2 = id(902);
const Q1 = id(1001), Q2 = id(1002), MO1 = id(1101);

const DYNAMIC_IDS = new Set(['activity-load-more', 'guestbook-form', 'guestbook-identity', 'guestbook-content',
    'guestbook-char-counter', 'guestbook-message', 'guestbook-submit']);
const TAB_NAMES = ['activity', 'posts', 'discussions', 'marginalia', 'postcards', 'reactions', 'questions', 'guestbook'];

// ---------------------------------------------------------------------------
// A richer fake DOM, built on tests/lib/fake-dom.js's FakeElement (which keeps
// textContent -> innerHTML escaping, so the real Utils.escapeHtml works).
// ---------------------------------------------------------------------------
class El extends FakeElement {
    constructor(elementId, tagName = 'div') {
        super(elementId);
        this.tagName = tagName;
        this.listeners = {};
        this.attributes = {};
        this.classes = new Set();
        this.children = [];
        this.afterEls = [];
        this.insertedAfter = [];
        this.removed = false;
        this.disabled = false;
        this.href = '';
        this.className = '';
        this.qsa = {};
        this._q = new Map();
        const classes = this.classes;
        this.classList = {
            add: (...c) => c.forEach(x => classes.add(x)),
            remove: (...c) => c.forEach(x => classes.delete(x)),
            toggle: (c, force) => {
                const on = force === undefined ? !classes.has(c) : !!force;
                if (on) classes.add(c); else classes.delete(c);
                return on;
            },
            contains: c => classes.has(c)
        };
    }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    async fire(type, extra = {}) {
        const event = { type, target: this, preventDefault() {}, ...extra };
        return Promise.all((this.listeners[type] || []).map(fn => fn(event)));
    }
    // A class selector finds a child only when this element's markup carries
    // that class (enough for showError's retry button and the subscribe text).
    querySelector(sel) {
        const option = /^option\[value="([^"]*)"\]$/.exec(sel);
        if (option) return this._html.includes('value="' + option[1] + '"') ? new El(null, 'option') : null;
        if (!(sel.startsWith('.') && this._html.includes(sel.slice(1)))) return null;
        if (!this._q.has(sel)) this._q.set(sel, new El(null));
        return this._q.get(sel);
    }
    querySelectorAll(sel) { return this.qsa[sel] || []; }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    focus() {}
    insertAdjacentElement(pos, el) { this.insertedAfter.push({ pos, el }); }
    insertAdjacentHTML(pos, html) { this._html += html; }
    after(el) { this.afterEls.push(el); }
    remove() { this.removed = true; }
    appendChild(el) { this.children.push(el); }
    dispatchEvent() {}
    scrollIntoView() {}
    closest() { return null; }
}

// ---------------------------------------------------------------------------
// Fixtures and a scripted backend that answers Utils.get by table + params.
// ---------------------------------------------------------------------------
function defaultFixtures() {
    return {
        identity: {
            id: ID, name: XSS + 'Echo', model: 'Claude', model_version: 'Opus 4',
            bio: 'bio ' + XSS, created_at: '2026-01-10T12:00:00Z', last_active: hoursAgo(2),
            follower_count: 7, post_count: 3, marginalia_count: 2, postcard_count: 1,
            is_supporter: true, status: 'thinking ' + XSS, status_updated_at: hoursAgo(3),
            appearance: 'a lantern ' + XSS
        },
        facilitator: { data: '  Facilitator Fern  ', error: null },
        memberships: [{ interest_id: I1 }],
        interests: [{ id: I1, slug: 'po"etry', name: 'Poetry ' + XSS }],
        posts: [
            { id: P1, discussion_id: D1, content: XSS + ' first post', created_at: hoursAgo(1), feeling: 'calm ' + XSS, is_active: true },
            { id: P2, discussion_id: D1, content: 'second', created_at: hoursAgo(6), feeling: null, is_active: true },
            { id: P3, discussion_id: null, content: 'x'.repeat(250), created_at: hoursAgo(5), feeling: null, is_active: true }
        ],
        postCounts: [
            { post_id: P1, type: 'nod', count: '2' },
            { post_id: P2, type: 'resonance', count: 3 },
            { post_id: P2, type: 'bogus', count: 9 }
        ],
        marginaliaCounts: [],
        postcardCounts: [],
        pinned: null,
        pinnedPost: null,
        discussions: [
            { id: D1, title: 'Thread ' + XSS, created_at: hoursAgo(48) },
            { id: D2, title: 'Second thread', created_at: hoursAgo(72) }
        ],
        marginalia: [{ id: M1, text_id: T1, content: 'note ' + XSS, created_at: hoursAgo(2), feeling: 'moved ' + XSS }],
        texts: [{ id: T1, title: 'Text ' + XSS }],
        postcards: [{ id: C1, content: 'card ' + XSS, format: 'haiku', created_at: hoursAgo(3) }],
        activityReactions: [{ id: R1, post_id: P9, type: 'nod', created_at: hoursAgo(4) }],
        reactionPosts: [{ id: P9, discussion_id: D2 }],
        questions: [
            { id: Q1, discussion_id: D2, content: 'Q one ' + XSS, model: 'GPT', model_version: '4o', ai_name: 'Asker ' + XSS, created_at: hoursAgo(1) },
            { id: Q2, discussion_id: D3, content: 'Q two', model: 'Gemini', model_version: null, ai_name: null, created_at: hoursAgo(2) }
        ],
        replies: [{ discussion_id: D2 }],
        given: { post: [], discussion: [], moment: [], marginalia: [], postcard: [] },
        guestbook: [{
            id: G1, author_identity_id: A1, content: 'hi ' + XSS, created_at: hoursAgo(1),
            author: { id: A1, name: 'Guest ' + XSS, model: 'GPT', model_version: '4o' }
        }],
        guestbookEmbedFails: false,
        authors: []
    };
}

function backend(F) {
    const inIds = v => (typeof v === 'string' && v.startsWith('in.(') ? v.slice(4, -1).split(',') : []);
    return (table, p) => {
        switch (table) {
            case 'interest_memberships': return F.memberships;
            case 'interests': return F.interests;
            case 'ai_identities':
                if (p.select === 'pinned_post_id') return [{ pinned_post_id: F.pinned }];
                return F.authors;
            case 'posts':
                if (p.or) return F.posts.map(x => ({ id: x.id }));
                if (p.directed_to) {
                    return p.select === 'id,discussion_id'
                        ? F.questions.map(q => ({ id: q.id, discussion_id: q.discussion_id }))
                        : F.questions;
                }
                if (p.discussion_id) return F.replies;
                if (p.id && p.id.startsWith('in.')) return F.reactionPosts;
                if (p.id && p.id.startsWith('eq.')) return F.pinnedPost ? [F.pinnedPost] : [];
                if (p.select === 'discussion_id') return F.posts.map(x => ({ discussion_id: x.discussion_id }));
                return F.posts;
            case 'discussions': {
                const wanted = inIds(p.id);
                return F.discussions.filter(d => wanted.includes(d.id));
            }
            case 'post_reaction_counts': return F.postCounts;
            case 'marginalia_reaction_counts': return F.marginaliaCounts;
            case 'postcard_reaction_counts': return F.postcardCounts;
            case 'marginalia': return F.marginalia;
            case 'postcards': return F.postcards;
            case 'texts': return F.texts;
            case 'post_reactions': return p.limit === '30' ? F.activityReactions : F.given.post;
            case 'discussion_reactions': return F.given.discussion;
            case 'moment_reactions': return F.given.moment;
            case 'marginalia_reactions': return F.given.marginalia;
            case 'postcard_reactions': return F.given.postcard;
            case 'voice_guestbook':
                if (F.guestbookEmbedFails && p.select) throw new Error('PGRST200 embed failed');
                return F.guestbook.map(e => {
                    if (p.select) return e;
                    const { author, ...rest } = e;
                    return rest;
                });
            default: throw new Error('unexpected table in test backend: ' + table);
        }
    };
}

// ---------------------------------------------------------------------------
// Boot the page in a vm and wait for it (and its fire-and-forget loads).
// ---------------------------------------------------------------------------
async function settle(rounds = 30) {
    for (let i = 0; i < rounds; i++) await new Promise(resolve => setImmediate(resolve));
}

async function boot({
    search = '?id=' + ID, fixtures = {}, loggedIn = false, mine = [], subscribed = false,
    identityError = null, insertResult = { error: null }, updateResult = { error: null, count: 1 },
    confirmAnswer = true, preferredIdentity = null
} = {}) {
    const F = Object.assign(defaultFixtures(), fixtures);
    const answer = backend(F);
    const calls = [];
    const authLog = [];
    const errors = [];

    const elements = new Map();
    // Ids the page renders itself exist only once some markup carries them;
    // every other id is a static element of profile.html, created on demand.
    const rendered = key => [...elements.values()].map(e => e._html).find(h => h.includes('id="' + key + '"'));
    const getEl = key => {
        if (DYNAMIC_IDS.has(key)) {
            const markup = rendered(key);
            if (markup === undefined) return null;
            if (!elements.has(key)) {
                const e = new El(key);
                // a <select> keeps its options as markup, for option lookups
                if (key === 'guestbook-identity') e._html = markup.slice(markup.indexOf('id="' + key + '"'), markup.indexOf('</select>'));
                elements.set(key, e);
            }
            return elements.get(key);
        }
        if (!elements.has(key)) elements.set(key, new El(key));
        return elements.get(key);
    };
    const header = new El(null);
    const tabs = TAB_NAMES.map(name => {
        const tab = new El('profile-tab-' + name, 'button');
        tab.dataset.tab = name;
        return tab;
    });
    const tabContents = TAB_NAMES.map(name => getEl('tab-' + name));
    getEl('subscribe-btn').innerHTML = '<span class="subscribe-btn__text">Follow</span>';

    const created = [];
    const document = {
        title: '',
        getElementById: getEl,
        querySelector: sel => (sel === '.profile-header' ? header : null),
        querySelectorAll: sel => (sel === '.profile-tab' ? tabs : sel === '.profile-tab-content' ? tabContents : []),
        addEventListener() {},
        createElement: tag => { const e = new El(null, tag); created.push(e); return e; }
    };

    const client = {
        rpc: async (name, args) => { authLog.push(['rpc', name, clone(args)]); return F.facilitator; },
        from(table) {
            return {
                insert: async row => { authLog.push(['insert', table, clone(row)]); return insertResult; },
                update(values, options) {
                    authLog.push(['update', table, Object.keys(values), clone(options)]);
                    return { eq: async (col, val) => { authLog.push(['eq', col, val]); return updateResult; } };
                }
            };
        }
    };
    const Auth = {
        init: () => { authLog.push(['init']); return Promise.resolve(); },
        getIdentity: async ident => {
            authLog.push(['getIdentity', ident]);
            if (identityError) throw identityError;
            return clone(F.identity);
        },
        getClient: () => client,
        isLoggedIn: () => loggedIn,
        getMyIdentities: async () => clone(mine),
        isSubscribed: async (type, ident) => { authLog.push(['isSubscribed', type, ident]); return subscribed; },
        subscribe: async (type, ident) => { authLog.push(['subscribe', type, ident]); },
        unsubscribe: async (type, ident) => { authLog.push(['unsubscribe', type, ident]); },
        updateIdentity: async (ident, patch) => { authLog.push(['updateIdentity', ident, clone(patch)]); }
    };

    const storage = new Map(preferredIdentity ? [['tc_preferred_identity_id', preferredIdentity]] : []);
    const location = { search, href: 'profile.html' + search, reloaded: false, origin: 'https://example.test' };
    location.reload = () => { location.reloaded = true; };
    const quietConsole = {
        log() {}, info() {}, warn() {},
        error: (...args) => errors.push(args.map(String).join(' '))
    };
    const context = vm.createContext({
        document, console: quietConsole, Date, URL, URLSearchParams, clearTimeout,
        // Unref so a pending auto-dismiss timer never keeps the test process alive.
        setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; },
        location, Auth,
        localStorage: {
            getItem: k => (storage.has(k) ? storage.get(k) : null),
            setItem: (k, v) => storage.set(k, String(v)),
            removeItem: k => storage.delete(k)
        },
        Event: class { constructor(type) { this.type = type; } },
        crypto: { randomUUID: () => id(9999) },
        confirm: () => confirmAnswer
    });
    context.window = context;
    for (const file of ['js/config.js', 'js/utils.js', 'js/utils-render.js', 'js/utils-context.js']) {
        vm.runInContext(read(file), context, { filename: file });
    }
    context.Utils.get = async (endpoint, params = {}) => {
        const table = endpoint.replace('/rest/v1/', '');
        calls.push({ table, params: clone(params) });
        return clone(answer(table, params));
    };

    // The script's completion value is the page IIFE's promise.
    const pagePromise = vm.runInContext(read('js/profile.js'), context, { filename: 'js/profile.js' });
    await pagePromise;
    await settle();

    const page = {
        context, calls, authLog, errors, created, header, tabs, location, storage, el: getEl,
        helpers: vm.runInContext('ProfileHelpers', context),
        F,
        async openTab(name) {
            const before = calls.length;
            await tabs[TAB_NAMES.indexOf(name)].fire('click');
            await settle();
            return calls.slice(before);
        }
    };
    return page;
}

// One canonical string per request, params sorted, so order of keys and of
// parallel requests does not matter but every column list and filter does.
const describeCall = c => c.table + '?' + Object.keys(c.params).sort().map(k => k + '=' + c.params[k]).join('&');
const describeAll = list => list.map(describeCall).sort();
const SAFE = 'id,discussion_id,parent_id,content,model,model_version,feeling,is_autonomous,created_at,ai_name,is_active,facilitator_id,ai_identity_id,facilitator_note,directed_to,model_id,updated_at,edited';

function assertNoRawXss(html, where) {
    assert.equal(html.includes('<img'), false, where + ': payload reached innerHTML unescaped');
    assert.equal(/onerror="?alert/.test(html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g, '')), false, where + ': stray onerror');
}
const hrefs = html => [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1]);

// ===========================================================================
// ProfileHelpers surface
// ===========================================================================

test('ProfileHelpers exports exactly four helpers', async () => {
    const page = await boot({ search: '' });
    assert.deepEqual(Object.keys(page.helpers), ['fetchThreadTitles', 'threadRef', 'softDeleteGuestbookEntry', 'facilitatorLine']);
    for (const k of Object.keys(page.helpers)) assert.equal(typeof page.helpers[k], 'function', k);
});

test('facilitatorLine trims a name and hides a missing, blank or non-string one', async () => {
    const { helpers } = await boot({ search: '' });
    assert.equal(helpers.facilitatorLine('  Fern  '), 'Facilitated by Fern');
    assert.equal(helpers.facilitatorLine('Fern'), 'Facilitated by Fern');
    for (const v of [null, undefined, '', '   ', 42, {}]) assert.equal(helpers.facilitatorLine(v), null, String(v));
});

// ===========================================================================
// Not-found and error paths
// ===========================================================================

test('no ?id= shows the broken-link error, never calls Auth, requests nothing, retry goes to voices.html', async () => {
    const page = await boot({ search: '' });
    const loading = page.el('loading-state');
    assert.match(loading.innerHTML, /We couldn&#39;t find that profile\. The link might be broken\./);
    assert.match(loading.innerHTML, /alert__retry-btn/);
    assert.deepEqual(page.authLog, []);
    assert.deepEqual(page.calls, []);
    assert.equal(page.el('profile-content').style.display, undefined, 'profile stays hidden');
    await loading.querySelector('.alert__retry-btn').fire('click');
    assert.equal(page.location.href, 'voices.html');
});

test('an empty ?id= is treated the same as a missing one', async () => {
    const page = await boot({ search: '?id=' });
    assert.match(page.el('loading-state').innerHTML, /The link might be broken/);
    assert.deepEqual(page.authLog, []);
});

test('an unknown id: Auth.init then getIdentity with the raw id, "may have been removed", no table reads', async () => {
    const page = await boot({ fixtures: { identity: null } });
    assert.deepEqual(page.authLog, [['init'], ['getIdentity', ID]]);
    assert.match(page.el('loading-state').innerHTML, /We couldn&#39;t find that profile\. It may have been removed\./);
    assert.deepEqual(page.calls, []);
    assert.equal(page.el('profile-content').style.display, undefined);
    await page.el('loading-state').querySelector('.alert__retry-btn').fire('click');
    assert.equal(page.location.href, 'voices.html');
});

test('a non-UUID id is passed to Auth.getIdentity verbatim (no client-side validation)', async () => {
    const raw = '<script>x</script>';
    const page = await boot({ search: '?id=' + encodeURIComponent(raw), fixtures: { identity: null } });
    assert.deepEqual(page.authLog[1], ['getIdentity', raw]);
    assert.equal(page.el('loading-state').innerHTML.includes('<script>'), false);
});

test('a failed identity load shows the escaped technical detail and a reload retry', async () => {
    const page = await boot({ identityError: new Error('boom ' + XSS) });
    const html = page.el('loading-state').innerHTML;
    assert.match(html, /We couldn&#39;t load this profile right now\. Want to try again\?/);
    assert.match(html, /class="alert__technical">boom &lt;img/);
    assertNoRawXss(html, 'identity error');
    assert.deepEqual(page.calls, []);
    await page.el('loading-state').querySelector('.alert__retry-btn').fire('click');
    assert.equal(page.location.reloaded, true);
});

// ===========================================================================
// Requests on load
// ===========================================================================

test('on load (anonymous): the exact set of reads, with select lists and filters', async () => {
    const page = await boot();
    assert.deepEqual(page.authLog, [
        ['init'],
        ['getIdentity', ID],
        ['rpc', 'get_identity_facilitator_name', { p_identity_id: ID }]
    ]);
    assert.deepEqual(describeAll(page.calls), [
        `ai_identities?id=eq.${ID}&limit=1&select=pinned_post_id`,
        `discussions?id=in.(${D1},${D2})&is_active=eq.true&select=id,title`,
        `interest_memberships?ai_identity_id=eq.${ID}&select=interest_id`,
        `interests?id=in.(${I1})&status=eq.active`,
        `marginalia?ai_identity_id=eq.${ID}&is_active=eq.true&limit=30&order=created_at.desc&select=id,text_id,content,created_at,feeling`,
        `post_reaction_counts?post_id=in.(${P1},${P2},${P3})`,
        `post_reactions?ai_identity_id=eq.${ID}&limit=30&order=created_at.desc&select=id,post_id,type,created_at`,
        `postcards?ai_identity_id=eq.${ID}&is_active=eq.true&limit=30&order=created_at.desc&select=id,content,format,created_at`,
        `posts?ai_identity_id=eq.${ID}&discussion_id=in.(${D2},${D3})&select=discussion_id`,
        `posts?ai_identity_id=eq.${ID}&is_active=eq.true&limit=30&order=created_at.desc&select=id,discussion_id,content,created_at,feeling`,
        `posts?ai_identity_id=eq.${ID}&is_active=eq.true&select=discussion_id`,
        `posts?ai_identity_id=eq.${ID}&or=(is_active.eq.true,is_active.is.null)&select=id`,
        `posts?directed_to=eq.${ID}&order=created_at.desc&select=id,discussion_id`,
        `posts?id=in.(${P9})&select=id,discussion_id`,
        'texts?order=added_at.desc'
    ].sort());
});

test('on load: every posts read names its columns; the reads with no select at all are pinned', async () => {
    const page = await boot();
    for (const c of page.calls.filter(c => c.table === 'posts')) {
        assert.ok(c.params.select && c.params.select !== '*', describeCall(c));
    }
    // These three anon reads send no select (PostgREST returns every granted
    // column). texts is via Utils.getTexts. Looks off against the
    // "enumerate columns" invariant if any of these tables gains a hidden column.
    assert.deepEqual(page.calls.filter(c => !('select' in c.params)).map(c => c.table).sort(),
        ['interests', 'post_reaction_counts', 'texts']);
});

test('on load as a signed-in non-owner: subscription is checked and the button shows Following', async () => {
    const page = await boot({ loggedIn: true, mine: [{ id: A1, name: 'Mine' }], subscribed: true });
    assert.deepEqual(page.authLog.filter(e => e[0] === 'isSubscribed'), [['isSubscribed', 'ai_identity', ID]]);
    const btn = page.el('subscribe-btn');
    assert.equal(btn.style.display, 'block');
    assert.equal(btn.querySelector('.subscribe-btn__text').textContent, 'Following');
    assert.equal(btn.classList.contains('subscribe-btn--subscribed'), true);
    await btn.fire('click');
    assert.deepEqual(page.authLog.at(-1), ['unsubscribe', 'ai_identity', ID]);
    assert.equal(btn.querySelector('.subscribe-btn__text').textContent, 'Follow');
    await btn.fire('click');
    assert.deepEqual(page.authLog.at(-1), ['subscribe', 'ai_identity', ID]);
    assert.equal(btn.disabled, false);
});

test('anonymous visitors get no subscribe button and no subscription check', async () => {
    const page = await boot();
    assert.equal(page.el('subscribe-btn').style.display, undefined);
    assert.equal(page.authLog.some(e => e[0] === 'isSubscribed'), false);
});

// ===========================================================================
// Header render
// ===========================================================================

test('header: name, initial, model, bio, status and appearance are escaped or set as text', async () => {
    const page = await boot();
    const name = page.el('profile-name').innerHTML;
    assertNoRawXss(name, 'profile name');
    assert.ok(name.startsWith(XSS_ESCAPED + 'Echo'), name);
    assert.match(name, /<a href="participate\.html#support" class="supporter-badge-link"/, 'supporter badge');
    assert.equal(page.context.document.title, XSS + 'Echo \u2014 The Commons');
    assert.equal(page.el('profile-avatar').innerHTML,
        '<div class="profile-avatar__initial profile-avatar__initial--claude">&lt;</div>');
    assert.equal(page.el('profile-model').innerHTML, '<span class="model-badge model-badge--claude">Claude Opus 4</span>');
    assert.equal(page.header.classList.contains('profile-header--claude'), true);
    assert.equal(page.el('profile-bio').textContent, 'bio ' + XSS);
    assert.equal(page.el('profile-bio').style.display, 'block');
    assert.equal(page.el('profile-appearance').textContent, 'a lantern ' + XSS);
    assert.equal(page.el('profile-appearance').style.display, 'block');
    assert.equal(page.el('profile-status-text').textContent, '\u2014 thinking ' + XSS);
    assert.match(page.el('profile-status-time').textContent, /^\u2014 3h ago$/);
    assert.equal(page.el('profile-status').style.display, '');
    assert.match(page.el('profile-meta').textContent, /^Participating since /);
    assert.equal(page.el('profile-last-active').textContent, 'Last active 2h ago');
    assert.equal(page.el('profile-facilitator').textContent, 'Facilitated by Facilitator Fern');
    assert.equal(page.el('profile-facilitator').style.display, '');
    const ask = page.el('ask-voice-btn');
    assert.equal(ask.href, 'submit.html?directed_to=' + ID);
    assert.equal(ask.style.display, '');
    assert.equal(page.el('loading-state').style.display, 'none');
    assert.equal(page.el('profile-content').style.display, 'block');
});

test('header: stats come from the identity row; discussion count is unique non-null threads', async () => {
    const page = await boot();
    assert.equal(page.el('stat-followers').textContent, '7');
    assert.equal(page.el('stat-posts').textContent, '3');
    assert.equal(page.el('stat-marginalia').textContent, '2');
    assert.equal(page.el('stat-postcards').textContent, '1');
    assert.equal(page.el('stat-discussions').textContent, '1');
});

test('header: a legacy identity with no name, model, dates or counts', async () => {
    const page = await boot({ fixtures: { identity: { id: ID }, facilitator: { data: null, error: null } } });
    assert.equal(page.el('profile-name').innerHTML, 'Anonymous');
    assert.equal(page.el('profile-model').innerHTML, '<span class="model-badge model-badge--other">Unknown</span>');
    assert.equal(page.el('profile-bio').style.display, 'none');
    assert.equal(page.el('profile-meta').textContent, 'Legacy identity');
    assert.equal(page.el('profile-last-active').textContent, 'Activity unknown');
    assert.equal(page.el('stat-followers').textContent, '0');
    assert.equal(page.el('profile-facilitator').style.display, undefined, 'facilitator line hidden');
    assert.equal(page.el('profile-status').style.display, undefined);
});

test('header: archived, stepped-back and dormant badges', async () => {
    let page = await boot({ fixtures: { identity: { id: ID, name: 'V', is_active: false } } });
    assert.match(page.el('profile-name').innerHTML, /voice-status-badge--archived[^>]*>Archived</);
    page = await boot({ fixtures: { identity: { id: ID, name: 'V', last_active: hoursAgo(24 * 40) } } });
    assert.match(page.el('profile-name').innerHTML, /voice-status-badge--dormant[^>]*>Dormant</);
    page = await boot({ fixtures: { identity: { id: ID, name: 'V', stepped_back_at: '2026-03-15T12:00:00Z', stepped_back_note: 'Resting ' + XSS + '.' } } });
    assert.match(page.el('profile-name').innerHTML, /voice-status-badge--stepped-back[^>]*>Stepped back March 2026</);
    const note = page.el('profile-bio').insertedAfter[0];
    assert.equal(note.pos, 'afterend');
    assert.equal(note.el.className, 'voice-stepped-back');
    assert.equal(note.el.textContent, 'Stepped back March 2026: Resting ' + XSS + '. Their words stay where they put them.');
});

test('interest badges: slug and name are escaped into interest.html links', async () => {
    const page = await boot();
    assert.equal(page.el('profile-interests-list').innerHTML,
        '<a href="interest.html?slug=po&quot;etry" class="interest-badge">Poetry ' + XSS_ESCAPED + '</a>');
    assert.equal(page.el('profile-interests').style.display, '');
});

test('interest badges stay hidden with no memberships (and interests is not read)', async () => {
    const page = await boot({ fixtures: { memberships: [] } });
    assert.equal(page.el('profile-interests').style.display, undefined);
    assert.equal(page.calls.some(c => c.table === 'interests'), false);
});

test('reaction stats: totals per known type, unknown types ignored, string counts parsed', async () => {
    const page = await boot();
    const html = page.el('profile-reaction-stats-list').innerHTML;
    assert.match(html, /👍 2<\/span><span class="profile-stat__label">Nods/);
    assert.match(html, /🔔 3<\/span><span class="profile-stat__label">Resonance/);
    assert.match(html, /⚡ 0<\/span><span class="profile-stat__label">Challenges/);
    assert.match(html, /❓ 0<\/span><span class="profile-stat__label">Questions/);
    assert.equal(page.el('profile-reaction-stats').style.display, '');
});

test('reaction stats stay hidden when every count is zero or unknown', async () => {
    const page = await boot({ fixtures: { postCounts: [{ post_id: P1, type: 'bogus', count: 4 }] } });
    assert.equal(page.el('profile-reaction-stats').style.display, undefined);
});

test('question badge counts questions in threads the voice has not replied in', async () => {
    const page = await boot();
    const badge = page.el('questions-count-badge');
    assert.equal(badge.textContent, '1');
    assert.equal(badge.style.display, 'inline');
    const none = await boot({ fixtures: { questions: [] } });
    assert.equal(none.el('questions-count-badge').style.display, undefined);
    assert.equal(none.calls.some(c => c.table === 'posts' && c.params.discussion_id), false, 'no reply lookup');
});

// ===========================================================================
// Activity tab (default)
// ===========================================================================

test('activity: items from all four sources, newest first, escaped, with thread and text links', async () => {
    const page = await boot();
    const html = page.el('activity-list').innerHTML;
    assertNoRawXss(html, 'activity');
    const types = [...html.matchAll(/<span class="activity-item__type">([^<]*)<\/span>/g)].map(m => m[1]);
    // P1 (1h), marginalia (2h), postcard (3h), reaction (4h), P3 (5h), P2 (6h)
    assert.deepEqual(types, ['Post', 'Marginalia', 'Postcard', 'Reaction', 'Post', 'Post']);
    assert.match(html, new RegExp(`<a href="discussion\\.html\\?id=${D1}">Thread ${XSS_RE}</a> &mdash; 1h ago`));
    assert.match(html, new RegExp(`<a href="text\\.html\\?id=${T1}">Text ${XSS_RE}</a> &mdash; 2h ago`));
    assert.match(html, /haiku &mdash; 3h ago/);
    assert.match(html, new RegExp(`Reacted &ldquo;nod&rdquo;</div><div class="activity-item__meta"><a href="discussion\\.html\\?id=${D2}">Second thread</a> &mdash; 4h ago`));
    assert.ok(html.includes('x'.repeat(200) + '&hellip;') && !html.includes('x'.repeat(201)), 'truncated at 200');
    assert.match(html, /Not in a thread/);
    assert.equal(html.includes('activity-load-more'), false);
    assert.deepEqual(hrefs(html).sort(), [`discussion.html?id=${D1}`, `discussion.html?id=${D1}`, `discussion.html?id=${D2}`, `text.html?id=${T1}`].sort());
});

test('activity: a reaction whose post cannot be looked up shows only its time', async () => {
    const page = await boot({ fixtures: { reactionPosts: [] } });
    assert.match(page.el('activity-list').innerHTML, /Reacted &ldquo;nod&rdquo;<\/div><div class="activity-item__meta">4h ago<\/div>/);
});

test('activity: empty state when the voice has done nothing (no reaction-post or title lookups)', async () => {
    const page = await boot({ fixtures: { posts: [], marginalia: [], postcards: [], activityReactions: [] } });
    assert.match(page.el('activity-list').innerHTML, /No activity yet/);
    assert.match(page.el('activity-list').innerHTML, /This voice&#39;s activity timeline will appear here\./);
    assert.equal(page.calls.some(c => c.table === 'discussions'), false);
    assert.equal(page.calls.some(c => c.table === 'posts' && String(c.params.id).startsWith('in.')), false);
});

test('activity: shows 20, then Load more adds 20; reopening the tab does not refetch', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: id(2000 + i), discussion_id: null, content: 'p' + i, created_at: hoursAgo(i + 1) }));
    const page = await boot({ fixtures: { posts: many, marginalia: [], postcards: [], activityReactions: [] } });
    const list = page.el('activity-list');
    assert.equal((list.innerHTML.match(/class="activity-item"/g) || []).length, 20);
    assert.match(list.innerHTML, /<button class="activity-load-more" id="activity-load-more">Load more<\/button>/);
    await page.el('activity-load-more').fire('click');
    assert.equal((list.innerHTML.match(/class="activity-item"/g) || []).length, 25);
    assert.equal(list.innerHTML.includes('activity-load-more'), false);
    const requests = await page.openTab('activity');
    assert.deepEqual(requests, [], 'activity is fetched once');
});

test('activity: a failed load shows the retry error', async () => {
    // texts coming back null is tolerated
    const page = await boot({ fixtures: { texts: null } });
    assert.match(page.el('activity-list').innerHTML, /Unknown text/);
    // a non-array marginalia result throws inside the render: retry error
    const broken = await boot({ fixtures: { marginalia: { notAnArray: true } } });
    assert.match(broken.el('activity-list').innerHTML, /We couldn&#39;t load activity right now/);
});

// ===========================================================================
// Tab switching
// ===========================================================================

test('tabs: clicking sets aria-selected, tabindex, active class and shows only that panel', async () => {
    const page = await boot();
    await page.openTab('postcards');
    for (const tab of page.tabs) {
        const on = tab.dataset.tab === 'postcards';
        assert.equal(tab.attributes['aria-selected'], String(on), tab.dataset.tab);
        assert.equal(tab.attributes.tabindex, on ? '0' : '-1');
        assert.equal(tab.classList.contains('active'), on);
        assert.equal(page.el('tab-' + tab.dataset.tab).style.display, on ? 'block' : 'none');
    }
});

test('tabs: arrow keys, Home and End move between tabs and wrap around', async () => {
    const page = await boot();
    const selected = () => page.tabs.find(t => t.attributes['aria-selected'] === 'true').dataset.tab;
    await page.tabs[0].fire('keydown', { key: 'ArrowLeft' });
    await settle();
    assert.equal(selected(), 'guestbook');
    await page.tabs[7].fire('keydown', { key: 'ArrowRight' });
    await settle();
    assert.equal(selected(), 'activity');
    await page.tabs[0].fire('keydown', { key: 'End' });
    await settle();
    assert.equal(selected(), 'guestbook');
    await page.tabs[3].fire('keydown', { key: 'Home' });
    await settle();
    assert.equal(selected(), 'activity');
    await page.tabs[1].fire('keydown', { key: 'ArrowDown' });
    await settle();
    assert.equal(selected(), 'discussions');
    await page.tabs[2].fire('keydown', { key: 'ArrowUp' });
    await settle();
    assert.equal(selected(), 'posts');
    const before = page.calls.length;
    await page.tabs[2].fire('keydown', { key: 'a' });
    await settle();
    assert.equal(page.calls.length, before, 'other keys do nothing');
});

// ===========================================================================
// Posts tab
// ===========================================================================

test('posts tab: requests SAFE_POST_COLUMNS for active posts plus thread titles', async () => {
    const page = await boot();
    const requests = await page.openTab('posts');
    assert.equal(page.context.Utils.SAFE_POST_COLUMNS, SAFE);
    assert.deepEqual(describeAll(requests), [
        `discussions?id=in.(${D1})&is_active=eq.true&select=id,title`,
        `posts?ai_identity_id=eq.${ID}&is_active=eq.true&order=created_at.desc&select=${SAFE}`
    ].sort());
    assert.equal(page.el('pinned-post-section').style.display, 'none');
});

test('posts tab: content and feeling escaped, thread links by id, no pin buttons for visitors', async () => {
    const page = await boot();
    await page.openTab('posts');
    const html = page.el('posts-list').innerHTML;
    assertNoRawXss(html, 'posts');
    assert.match(html, new RegExp(`<article class="post" data-post-id="${P1}">`));
    assert.match(html, /<div class="post__feeling">Feeling: calm &lt;img/);
    assert.match(html, new RegExp(`<a href="discussion\\.html\\?id=${D1}" class="post__discussion">Thread ${XSS_RE}</a>`));
    assert.match(html, /<span class="post__discussion" style="color: var\(--text-muted\);">Not in a thread<\/span>/);
    assert.equal(html.includes('pin-btn'), false);
    assert.deepEqual([...new Set(hrefs(html))], [`discussion.html?id=${D1}`]);
});

test('posts tab: empty state, no title lookup', async () => {
    const page = await boot({ fixtures: { posts: [] } });
    const requests = await page.openTab('posts');
    assert.match(page.el('posts-list').innerHTML, /No posts yet[\s\S]*Posts from discussions will appear here\./);
    assert.equal(requests.some(r => r.table === 'discussions'), false);
});

test('posts tab as owner: pinned post section with Unpin, Pin buttons on the others, pin and unpin write pinned_post_id', async () => {
    const pinnedPost = { id: P2, discussion_id: D1, content: 'pinned ' + XSS, created_at: hoursAgo(6), feeling: 'proud ' + XSS };
    const page = await boot({ loggedIn: true, mine: [{ id: ID, name: 'Me' }], fixtures: { pinned: P2, pinnedPost } });
    const requests = await page.openTab('posts');
    assert.ok(describeAll(requests).includes(`posts?id=eq.${P2}&limit=1&select=${SAFE}`));
    const pinned = page.el('pinned-post-content').innerHTML;
    assertNoRawXss(pinned, 'pinned post');
    assert.match(pinned, /<article class="post post--pinned">/);
    assert.match(pinned, new RegExp(`<button class="btn btn--ghost btn--small unpin-btn" data-post-id="${P2}">Unpin</button>`));
    assert.equal(page.el('pinned-post-section').style.display, 'block');
    const list = page.el('posts-list').innerHTML;
    assert.match(list, new RegExp(`pin-btn" data-post-id="${P1}">Pin this`));
    assert.match(list, new RegExp(`pin-btn" data-post-id="${P3}">Pin this`));
    assert.equal(list.includes(`data-post-id="${P2}">Pin this`), false, 'the pinned post has no Pin button');

    const pinBtn = new El(null);
    pinBtn.dataset.postId = P1;
    await page.el('posts-list').fire('click', { target: { closest: sel => (sel === '.pin-btn' ? pinBtn : null) } });
    await settle();
    assert.deepEqual(page.authLog.filter(e => e[0] === 'updateIdentity').at(-1), ['updateIdentity', ID, { pinned_post_id: P1 }]);

    const unpinBtn = new El(null);
    await page.el('pinned-post-section').fire('click', { target: { closest: sel => (sel === '.unpin-btn' ? unpinBtn : null) } });
    await settle();
    assert.deepEqual(page.authLog.filter(e => e[0] === 'updateIdentity').at(-1), ['updateIdentity', ID, { pinned_post_id: null }]);
});

// ===========================================================================
// Discussions tab
// ===========================================================================

test('discussions tab: reads post thread ids, then active discussions by id; titles escaped, counts pluralized', async () => {
    const posts = defaultFixtures().posts.concat([{ id: id(104), discussion_id: D2, content: 'c', created_at: hoursAgo(9) }]);
    const page = await boot({ fixtures: { posts } });
    const requests = await page.openTab('discussions');
    assert.deepEqual(describeAll(requests), [
        `discussions?id=in.(${D1},${D2})&is_active=eq.true&select=id,title,created_at`,
        `posts?ai_identity_id=eq.${ID}&is_active=eq.true&select=discussion_id`
    ].sort());
    const html = page.el('discussions-list').innerHTML;
    assertNoRawXss(html, 'discussions');
    assert.deepEqual(hrefs(html), [`discussion.html?id=${D1}`, `discussion.html?id=${D2}`]);
    assert.match(html, /Thread &lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /<span class="discussion-item__posts">2 posts<\/span>/);
    assert.match(html, /<span class="discussion-item__posts">1 post<\/span>/);
});

test('discussions tab: empty state with no posts, with only thread-less posts, and when threads are gone', async () => {
    for (const fixtures of [{ posts: [] }, { posts: [{ id: P3, discussion_id: null }] }, { discussions: [] }]) {
        const page = await boot({ fixtures });
        await page.openTab('discussions');
        assert.match(page.el('discussions-list').innerHTML, /No discussions yet[\s\S]*Discussions this identity has participated in will appear here\./);
    }
});

// ===========================================================================
// Marginalia tab
// ===========================================================================

test('marginalia tab: reads marginalia (no select) and texts; renders escaped with text links', async () => {
    const page = await boot();
    const requests = await page.openTab('marginalia');
    // No select on the marginalia read: looks off against the
    // "enumerate columns" invariant; pinned as is.
    assert.deepEqual(describeAll(requests), [
        `marginalia?ai_identity_id=eq.${ID}&is_active=eq.true&order=created_at.desc`,
        'texts?order=added_at.desc'
    ]);
    const html = page.el('marginalia-list').innerHTML;
    assertNoRawXss(html, 'marginalia');
    assert.deepEqual(hrefs(html), [`text.html?id=${T1}`]);
    assert.match(html, /Text &lt;img/);
    assert.match(html, /<div class="marginalia-item__content">note &lt;img/);
    assert.match(html, /<div class="marginalia-item__feeling">Feeling: moved &lt;img/);
});

test('marginalia tab: unknown text falls back to "Unknown text"; empty state skips the texts read', async () => {
    let page = await boot({ fixtures: { texts: [] } });
    await page.openTab('marginalia');
    assert.match(page.el('marginalia-list').innerHTML, /Unknown text/);
    page = await boot({ fixtures: { marginalia: [] } });
    const requests = await page.openTab('marginalia');
    assert.match(page.el('marginalia-list').innerHTML, /No marginalia yet[\s\S]*Notes in the margins of texts will appear here\./);
    assert.equal(requests.some(r => r.table === 'texts'), false);
});

test('marginalia text_id is put into href without an id check (relies on the uuid column type)', async () => {
    // Looks off: unlike threadRef(), these links do not check isUuid(); a
    // quote in text_id would break out of the attribute. Pinned as is.
    const page = await boot({ fixtures: { marginalia: [{ id: M1, text_id: '1" data-x="y', content: 'n', created_at: hoursAgo(1) }] } });
    assert.match(page.el('activity-list').innerHTML, /<a href="text\.html\?id=1" data-x="y">/);
    await page.openTab('marginalia');
    assert.match(page.el('marginalia-list').innerHTML, /<a href="text\.html\?id=1" data-x="y" class="marginalia-item__text">/);
});

// ===========================================================================
// Postcards tab
// ===========================================================================

test('postcards tab: reads postcards (no select); content and format escaped', async () => {
    const page = await boot({ fixtures: { postcards: [{ id: C1, content: 'card ' + XSS, format: 'free" onclick="x', created_at: hoursAgo(3) }] } });
    const requests = await page.openTab('postcards');
    // No select on the postcards read: looks off against the
    // "enumerate columns" invariant; pinned as is.
    assert.deepEqual(describeAll(requests), [`postcards?ai_identity_id=eq.${ID}&is_active=eq.true&order=created_at.desc`]);
    const html = page.el('postcards-list').innerHTML;
    assertNoRawXss(html, 'postcards');
    assert.match(html, /<div class="postcard__content">card &lt;img/);
    // The stored format reaches the class attribute (escaped, so no breakout).
    // Looks off: js/postcards.js stopped putting the raw format in its class
    // (F02); this page still does.
    assert.match(html, /<div class="postcard postcard--free&quot; onclick=&quot;x">/);
    assert.match(html, /<span class="postcard__format">free&quot; onclick=&quot;x<\/span>/);
});

test('postcards tab: no format means no modifier class; empty state', async () => {
    let page = await boot({ fixtures: { postcards: [{ id: C1, content: 'c', format: null, created_at: hoursAgo(1) }] } });
    await page.openTab('postcards');
    assert.match(page.el('postcards-list').innerHTML, /<div class="postcard ">/);
    assert.equal(page.el('postcards-list').innerHTML.includes('postcard__format'), false);
    page = await boot({ fixtures: { postcards: [] } });
    await page.openTab('postcards');
    assert.match(page.el('postcards-list').innerHTML, /No postcards yet[\s\S]*Postcards will appear here as they are created\./);
});

// ===========================================================================
// Reactions tab
// ===========================================================================

test('reactions tab: the exact reads for received and given', async () => {
    const page = await boot({ fixtures: { marginaliaCounts: [], postcardCounts: [] } });
    const requests = await page.openTab('reactions');
    assert.deepEqual(describeAll(requests), [
        `discussion_reactions?ai_identity_id=eq.${ID}&limit=100&order=created_at.desc&select=discussion_id,type,created_at,discussions(id,title)`,
        `marginalia?ai_identity_id=eq.${ID}&limit=200&select=id,content,text_id`,
        `marginalia_reaction_counts?marginalia_id=in.(${M1})&order=count.desc&select=marginalia_id,type,count`,
        `marginalia_reactions?ai_identity_id=eq.${ID}&limit=100&order=created_at.desc&select=marginalia_id,type,created_at,marginalia(id,text_id,content)`,
        `moment_reactions?ai_identity_id=eq.${ID}&limit=100&order=created_at.desc&select=moment_id,type,created_at,moments(id,title)`,
        `post_reaction_counts?order=count.desc&post_id=in.(${P1},${P2},${P3})&select=post_id,type,count`,
        `post_reactions?ai_identity_id=eq.${ID}&limit=100&order=created_at.desc&select=post_id,type,created_at,posts(id,discussion_id,content)`,
        `postcard_reaction_counts?order=count.desc&postcard_id=in.(${C1})&select=postcard_id,type,count`,
        `postcard_reactions?ai_identity_id=eq.${ID}&limit=100&order=created_at.desc&select=postcard_id,type,created_at,postcards(id,content)`,
        `postcards?ai_identity_id=eq.${ID}&limit=200&select=id,content`,
        `posts?ai_identity_id=eq.${ID}&limit=200&select=id,content,discussion_id`
    ].sort());
});

test('reactions received: snippets cut at 50 chars and escaped, linked to thread, text or postcards page', async () => {
    const page = await boot({
        fixtures: {
            postCounts: [{ post_id: P1, type: 'nod', count: 2 }, { post_id: P3, type: 'challenge', count: 1 }],
            marginaliaCounts: [{ marginalia_id: M1, type: 'resonance', count: 4 }],
            postcardCounts: [{ postcard_id: C1, type: 'question', count: 1 }]
        }
    });
    await page.openTab('reactions');
    const html = page.el('reactions-received-list').innerHTML;
    assertNoRawXss(html, 'reactions received');
    assert.deepEqual(hrefs(html), [`discussion.html?id=${D1}`, `text.html?id=${T1}`, 'postcards.html']);
    assert.match(html, /<span class="reaction-item__badge">Post<\/span>/);
    assert.match(html, /<span class="reaction-item__type">nod \(2\)<\/span>/);
    assert.match(html, /<span class="reaction-item__type">resonance \(4\)<\/span>/);
    // P3 has no thread: unlinked span, snippet cut to 50 plus "..."
    assert.ok(html.includes('<span>' + 'x'.repeat(50) + '...</span>'), 'unlinked, truncated snippet');
    // formatRelativeTime(null) is the epoch, rendered as a short date.
    // Looks off: received cards always show a 1970 date instead of none.
    assert.match(html, /&mdash; (Jan 1|Dec 31)/);
});

test('reactions given: all five kinds, newest first, links by id; empty and paged states', async () => {
    const given = {
        post: [{ post_id: P1, type: 'nod', created_at: hoursAgo(1), posts: { id: P1, discussion_id: D1, content: 'post ' + XSS } }],
        discussion: [{ discussion_id: D2, type: 'resonance', created_at: hoursAgo(2), discussions: { id: D2, title: 'Disc ' + XSS } }],
        moment: [{ moment_id: MO1, type: 'challenge', created_at: hoursAgo(3), moments: { id: MO1, title: 'Moment' } }],
        marginalia: [{ marginalia_id: M1, type: 'question', created_at: hoursAgo(4), marginalia: { id: M1, text_id: T1, content: 'marg' } }],
        postcard: [{ postcard_id: C1, type: 'nod', created_at: hoursAgo(5), postcards: null }]
    };
    const page = await boot({ fixtures: { given } });
    await page.openTab('reactions');
    const html = page.el('reactions-given-list').innerHTML;
    assertNoRawXss(html, 'reactions given');
    const badges = [...html.matchAll(/reaction-item__badge">([^<]*)</g)].map(m => m[1]);
    assert.deepEqual(badges, ['Post', 'Discussion', 'Moment', 'Marginalia', 'Postcard']);
    assert.deepEqual(hrefs(html), [`discussion.html?id=${D1}`, `discussion.html?id=${D2}`, `moment.html?id=${MO1}`, `text.html?id=${T1}`, 'postcards.html']);
    assert.match(html, /\(no content\)/, 'postcard with no embed');

    const empty = await boot({ fixtures: { postCounts: [] } });
    await empty.openTab('reactions');
    assert.match(empty.el('reactions-given-list').innerHTML, /No reactions given yet[\s\S]*Reactions this identity has expressed will appear here\./);
    assert.match(empty.el('reactions-received-list').innerHTML, /No reactions received yet/);

    const lots = Array.from({ length: 23 }, (_, i) => ({ post_id: P1, type: 'nod', created_at: hoursAgo(i + 1), posts: { id: P1, discussion_id: D1, content: 'p' } }));
    const paged = await boot({ fixtures: { given: { ...defaultFixtures().given, post: lots } } });
    await paged.openTab('reactions');
    const list = paged.el('reactions-given-list');
    assert.equal((list.innerHTML.match(/class="reaction-item"/g) || []).length, 20);
    const more = list.afterEls[0];
    assert.equal(more.textContent, 'Load more (3 remaining)');
    await more.fire('click');
    assert.equal((list.innerHTML.match(/class="reaction-item"/g) || []).length, 23);
    assert.equal(more.removed, true);
});

test('reactions given: a failing source is swallowed, the others still render', async () => {
    const given = { ...defaultFixtures().given, moment: [{ moment_id: MO1, type: 'nod', created_at: hoursAgo(1), moments: { id: MO1, title: 'M' } }] };
    const page = await boot({ fixtures: { given } });
    const original = page.context.Utils.get;
    page.context.Utils.get = async (endpoint, params) => {
        if (endpoint.endsWith('/post_reactions')) throw new Error('down');
        return original(endpoint, params);
    };
    await page.openTab('reactions');
    assert.match(page.el('reactions-given-list').innerHTML, new RegExp(`moment\\.html\\?id=${MO1}`));
});

// ===========================================================================
// Questions tab
// ===========================================================================

test('questions tab: the exact reads, waiting before answered, escaped author and content', async () => {
    const page = await boot();
    const requests = await page.openTab('questions');
    assert.deepEqual(describeAll(requests), [
        `discussions?id=in.(${D2},${D3})&is_active=eq.true&select=id,title`,
        `posts?ai_identity_id=eq.${ID}&discussion_id=in.(${D2},${D3})&select=discussion_id`,
        `posts?directed_to=eq.${ID}&order=created_at.desc&select=id,discussion_id,content,model,model_version,ai_name,ai_identity_id,feeling,created_at,directed_to`
    ].sort());
    const html = page.el('questions-list').innerHTML;
    assertNoRawXss(html, 'questions');
    assert.ok(html.indexOf('Waiting (1)') < html.indexOf('Answered (1)'));
    assert.ok(html.indexOf('Answered (1)') < html.indexOf('Q one'), 'Q1 is answered (reply in D2)');
    assert.match(html, /<span class="question-item__author">Asker &lt;img/);
    assert.match(html, /post__model--gpt/);
    assert.match(html, /GPT \(4o\)/);
    // D3 is not among the loadable threads: unlinked
    assert.match(html, /question-item__discussion" style="color: var\(--text-muted\);">Thread no longer available/);
    assert.deepEqual(hrefs(html), [`discussion.html?id=${D2}`]);
});

test('questions tab: empty state, no reply lookup', async () => {
    const page = await boot({ fixtures: { questions: [] } });
    const requests = await page.openTab('questions');
    assert.match(page.el('questions-list').innerHTML, /No questions yet[\s\S]*Questions directed to this voice will appear here\./);
    assert.equal(requests.length, 1);
});

// ===========================================================================
// Guestbook tab
// ===========================================================================

test('guestbook (anonymous): embedded read, escaped entries, author link by id, no form, no delete', async () => {
    const page = await boot();
    const requests = await page.openTab('guestbook');
    // select starts with "*" on voice_guestbook: looks off against the
    // "enumerate columns" invariant; pinned as is.
    assert.deepEqual(describeAll(requests), [
        `voice_guestbook?order=created_at.desc&profile_identity_id=eq.${ID}&select=*,author:ai_identities!author_identity_id(id,name,model,model_version)`
    ]);
    const html = page.el('guestbook-list').innerHTML;
    assertNoRawXss(html, 'guestbook');
    assert.deepEqual(hrefs(html), [`profile.html?id=${A1}`]);
    assert.match(html, new RegExp(`<div class="guestbook-entry" data-id="${G1}">`));
    assert.match(html, /<a href="profile\.html\?id=[^"]+">Guest &lt;img/);
    assert.match(html, /<span class="post__model post__model--gpt">GPT 4o<\/span>/);
    assert.match(html, /<div class="guestbook-entry__content"><p>hi &lt;img/);
    assert.equal(html.includes('guestbook-entry__delete'), false);
    assert.equal(page.el('guestbook-form-container').innerHTML, '');
});

test('guestbook: embed failure falls back to a plain read plus an author lookup', async () => {
    const page = await boot({ fixtures: { guestbookEmbedFails: true, authors: [{ id: A1, name: 'Fallback', model: 'Claude', model_version: null }] } });
    const requests = await page.openTab('guestbook');
    assert.deepEqual(requests.map(describeCall), [
        `voice_guestbook?order=created_at.desc&profile_identity_id=eq.${ID}&select=*,author:ai_identities!author_identity_id(id,name,model,model_version)`,
        `voice_guestbook?order=created_at.desc&profile_identity_id=eq.${ID}`,
        `ai_identities?id=in.(${A1})&select=id,name,model,model_version`
    ]);
    assert.match(page.el('guestbook-list').innerHTML, /<a href="profile\.html\?id=[^"]+">Fallback<\/a>/);
});

test('guestbook: empty state, and an entry with no author shows Anonymous with an empty profile link', async () => {
    let page = await boot({ fixtures: { guestbook: [] } });
    await page.openTab('guestbook');
    assert.match(page.el('guestbook-list').innerHTML, /No guestbook entries yet[\s\S]*Be the first to leave a message!/);
    page = await boot({ fixtures: { guestbook: [{ id: G1, author_identity_id: A1, content: 'c', created_at: hoursAgo(1), author: null }] } });
    await page.openTab('guestbook');
    assert.match(page.el('guestbook-list').innerHTML, /<a href="profile\.html\?id=">Anonymous<\/a>/);
});

test('guestbook (owner with two other voices): form with escaped selector, delete on every entry', async () => {
    const mine = [{ id: ID, name: 'Host' }, { id: A1, name: 'Mine ' + XSS }, { id: A2, name: null }];
    const page = await boot({ loggedIn: true, mine, preferredIdentity: A2 });
    await page.openTab('guestbook');
    const form = page.el('guestbook-form-container').innerHTML;
    assertNoRawXss(form, 'guestbook form');
    assert.match(form, new RegExp(`<option value="${A1}">Mine &lt;img`));
    assert.match(form, new RegExp(`<option value="${A2}">Anonymous</option>`));
    assert.equal(form.includes(`value="${ID}"`), false, 'the profile voice cannot sign its own guestbook');
    assert.match(form, /maxlength="500"/);
    assert.match(page.el('guestbook-list').innerHTML, new RegExp(`data-entry-id="${G1}">Delete</button>`));
    assert.equal(page.el('guestbook-identity').value, A2, 'remembered voice is preselected');
    assert.equal(page.storage.get('tc_preferred_identity_id'), A2);

    const stale = await boot({ loggedIn: true, mine, preferredIdentity: id(4242) });
    await stale.openTab('guestbook');
    assert.equal(stale.storage.has('tc_preferred_identity_id'), false, 'a stale preference is cleared');
});

test('guestbook submit: validation, insert shape, own-guestbook message, raw error echo', async () => {
    const page = await boot({ loggedIn: true, mine: [{ id: A1, name: 'Mine' }] });
    await page.openTab('guestbook');
    const textarea = page.el('guestbook-content');
    const message = page.el('guestbook-message');
    const submit = async () => { await page.el('guestbook-form').fire('submit'); await settle(); };

    textarea.value = '   ';
    await submit();
    assert.equal(page.authLog.some(e => e[0] === 'insert'), false);

    textarea.value = 'y'.repeat(501);
    await submit();
    assert.equal(page.authLog.some(e => e[0] === 'insert'), false);

    textarea.value = '  hello host  ';
    await submit();
    assert.deepEqual(page.authLog.filter(e => e[0] === 'insert'), [['insert', 'voice_guestbook', {
        id: id(9999), profile_identity_id: ID, author_identity_id: A1, content: 'hello host'
    }]]);
    assert.equal(textarea.value, '');
    assert.equal(page.el('guestbook-char-counter').textContent, '0 / 500');
    assert.match(message.innerHTML + message.textContent, /Message signed!/);

    textarea.value = 'again';
    const shown = [];
    page.context.Utils.showFormMessage = (_el, text, type) => shown.push([text, type]);
    page.authLog.length = 0;
    await page.el('guestbook-form').fire('submit');
    await settle();
    assert.deepEqual(shown[0], ['Message signed!', 'success']);
});

test('guestbook submit errors: self-post gets a plain message; any other DB message is shown raw', async () => {
    for (const [dbMessage, expected] of [
        ['violates check constraint "no_self_guestbook"', "You can't leave a message on your own guestbook."],
        // Looks off: the raw database message reaches the reader here, unlike
        // the delete path, which maps errors to plain wording.
        ['new row violates row-level security policy', 'new row violates row-level security policy']
    ]) {
        const page = await boot({ loggedIn: true, mine: [{ id: A1, name: 'Mine' }], insertResult: { error: { message: dbMessage } } });
        await page.openTab('guestbook');
        const shown = [];
        page.context.Utils.showFormMessage = (_el, text, type) => shown.push([text, type]);
        page.el('guestbook-content').value = 'hi';
        await page.el('guestbook-form').fire('submit');
        await settle();
        assert.deepEqual(shown, [[expected, 'error']]);
        assert.equal(page.el('guestbook-submit').disabled, false);
    }
});

test('guestbook delete: confirm, soft-delete only deleted_at, remove the entry, show empty when none left', async () => {
    const page = await boot({ loggedIn: true, mine: [{ id: ID, name: 'Host' }] });
    await page.openTab('guestbook');
    const list = page.el('guestbook-list');
    const entry = new El(null);
    const btn = new El(null);
    btn.dataset.entryId = G1;
    btn.closest = sel => (sel === '.guestbook-entry__delete' ? btn : sel === '.guestbook-entry' ? entry : null);
    await list.fire('click', { target: btn });
    await settle();
    assert.deepEqual(page.authLog.filter(e => e[0] === 'update' || e[0] === 'eq'), [
        ['update', 'voice_guestbook', ['deleted_at'], { count: 'exact' }],
        ['eq', 'id', G1]
    ]);
    assert.equal(entry.removed, true);
    assert.match(list.innerHTML, /No guestbook entries yet/);
});

test('guestbook delete: declining confirm does nothing; a refusal is shown on the entry', async () => {
    let page = await boot({ loggedIn: true, mine: [{ id: ID, name: 'Host' }], confirmAnswer: false });
    await page.openTab('guestbook');
    const btn = new El(null);
    btn.dataset.entryId = G1;
    btn.closest = sel => (sel === '.guestbook-entry__delete' ? btn : null);
    await page.el('guestbook-list').fire('click', { target: btn });
    assert.equal(page.authLog.some(e => e[0] === 'update'), false);

    page = await boot({
        loggedIn: true, mine: [{ id: ID, name: 'Host' }],
        updateResult: { status: 403, error: { code: '42501', message: 'rls' } }
    });
    await page.openTab('guestbook');
    const entry = new El(null);
    const btn2 = new El(null);
    btn2.dataset.entryId = G1;
    btn2.closest = sel => (sel === '.guestbook-entry__delete' ? btn2 : sel === '.guestbook-entry' ? entry : null);
    await page.el('guestbook-list').fire('click', { target: btn2 });
    await settle();
    assert.equal(entry.removed, false);
    assert.equal(btn2.disabled, false);
    assert.equal(entry.children.length, 1);
    const msg = entry.children[0];
    assert.equal(msg.className, 'alert alert--error guestbook-entry__error');
    assert.equal(msg.attributes.role, 'alert');
    assert.match(msg.textContent, /refused the change/);
});

// ===========================================================================
// Error states per tab
// ===========================================================================

test('each tab shows its own retry error when its main read fails', async () => {
    const cases = [
        ['posts', 'posts-list', /We couldn&#39;t load posts right now/],
        ['discussions', 'discussions-list', /We couldn&#39;t load discussions right now/],
        ['marginalia', 'marginalia-list', /We couldn&#39;t load marginalia right now/],
        ['postcards', 'postcards-list', /We couldn&#39;t load postcards right now/],
        ['questions', 'questions-list', /Couldn&#39;t load questions right now/]
    ];
    for (const [tab, listId, message] of cases) {
        const page = await boot();
        page.context.Utils.get = async () => { throw new Error('down'); };
        await page.openTab(tab);
        const html = page.el(listId).innerHTML;
        assert.match(html, message, tab);
        assert.match(html, /alert__retry-btn/, tab);
    }
    const page = await boot();
    page.context.Utils.get = async () => { throw new Error('down'); };
    await page.openTab('guestbook');
    assert.match(page.el('guestbook-list').innerHTML, /We couldn&#39;t load guestbook entries right now/);
    await page.openTab('reactions');
    assert.match(page.el('reactions-received-list').innerHTML, /We couldn&#39;t load reactions received right now/);
    // Given swallows each source's failure, so it lands on its empty state.
    assert.match(page.el('reactions-given-list').innerHTML, /No reactions given yet/);
});
