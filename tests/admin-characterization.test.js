// js/admin.js characterization tests. They pin what the admin dashboard does
// today (auth gate, which tables and RPCs it reads and writes, what each
// moderation action sends, how user text is rendered) so a later split of the
// 2000-line IIFE can be checked against them. Behavior that looks off is
// pinned as it is and marked "looks off" in a comment.
// Loads js/utils.js, js/utils-render.js and js/admin.js in a vm with a fake
// document, a recording Supabase client and a recording fetch. No network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const SOURCES = ['js/utils.js', 'js/utils-render.js', 'js/admin.js'].map(f => [f, read(f)]);

const XSS = '<img src=x onerror=alert(1)>';
const XSS_ESCAPED = '&lt;img src=x onerror=alert(1)&gt;';
const ADMIN_USER = { id: 'user-admin-1' };

// vm objects have another realm's prototypes; compare them as plain data.
const plain = x => JSON.parse(JSON.stringify(x));

const flush = async () => {
    for (let i = 0; i < 60; i++) await new Promise(resolve => setImmediate(resolve));
};

// Same text -> innerHTML serialization a browser does for a text node.
const escapeText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

class FakeElement {
    constructor(id, doc) {
        this.id = id;
        this._doc = doc;
        this._text = '';
        this._html = '';
        this.value = '';
        this.disabled = false;
        this.title = '';
        this.className = '';
        this.style = {};
        this.dataset = {};
        this.listeners = {};
        this.focusCount = 0;
        this.removed = false;
        const classes = this._classes = new Set();
        this.classList = {
            add: (...c) => c.forEach(x => classes.add(x)),
            remove: (...c) => c.forEach(x => classes.delete(x)),
            toggle: c => (classes.has(c) ? classes.delete(c) : classes.add(c)),
            contains: c => classes.has(c)
        };
    }
    set textContent(v) { this._text = v == null ? '' : String(v); this._html = escapeText(this._text); }
    get textContent() { return this._text; }
    set innerHTML(v) { this._html = String(v); }
    get innerHTML() { return this._html; }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    fire(type, event = {}) {
        for (const fn of this.listeners[type] || []) fn.call(this, { target: this, ...event });
    }
    click() { this.fire('click'); }
    focus() { this.focusCount += 1; }
    removeAttribute(name) { if (name === 'title') this.title = ''; }
    querySelector(sel) { return sel.startsWith('#') ? this._doc.getElementById(sel.slice(1)) : null; }
    querySelectorAll() { return []; }
    closest() { return null; }
    remove() { this.removed = true; }
}

// Default table contents served by the fake client. Tests override per table.
function defaultRows() {
    return {
        admins: [{ id: 'admin-row-1' }],
        posts_admin: [],
        marginalia: [],
        postcards: [],
        discussions: [],
        contact: [],
        text_submissions: [],
        facilitators: [],
        ai_identities: [],
        postcard_prompts: [],
        moments: [],
        interests: []
    };
}

function harness({ session = { user: ADMIN_USER }, rows = {}, counts = {}, respond = null,
    confirmAnswer = true, promptAnswers = [], getSessionThrows = false, holdSession = false } = {}) {
    const elements = new Map();
    const docListeners = {};
    const appended = [];
    const document = {
        getElementById(key) {
            if (!elements.has(key)) elements.set(key, new FakeElement(key, document));
            return elements.get(key);
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
        createElement: () => new FakeElement(null, document),
        body: { appendChild(el) { appended.push(el); } }
    };

    const data = { ...defaultRows(), ...rows };
    const calls = [];       // every from()/rpc() chain, in the order started
    const authCalls = [];
    const fetches = [];
    const dialogs = { confirm: [], prompt: [], alert: [] };
    const answers = promptAnswers.slice();
    let releaseSession = null;

    function defaultResponse(call) {
        const names = call.ops.map(op => op[0]);
        const select = call.ops.find(op => op[0] === 'select');
        if (select && select[1][1] && select[1][1].head) {
            return { data: null, count: counts[call.table] !== undefined ? counts[call.table] : 0, error: null };
        }
        if (names.includes('update')) {
            const eq = call.ops.find(op => op[0] === 'eq');
            return { data: [{ id: eq ? eq[1][1] : null }], error: null };
        }
        if (names.includes('insert')) {
            return { data: names.includes('single') ? { id: 'inserted-1' } : null, error: null };
        }
        if (names.includes('delete')) return { data: null, error: null };
        const list = data[call.table] || [];
        if (names.includes('single')) {
            return list.length ? { data: { ...list[0] }, error: null } : { data: null, error: { message: 'no rows' } };
        }
        // Fresh copies each read, like JSON off the wire.
        return { data: list.map(r => ({ ...r })), count: list.length, error: null };
    }

    function builder(table) {
        const call = { table, ops: [] };
        calls.push(call);
        const b = {};
        for (const name of ['select', 'eq', 'order', 'limit', 'update', 'insert', 'delete', 'single',
            'or', 'gte', 'lte', 'not', 'is', 'ilike']) {
            b[name] = (...args) => { call.ops.push([name, args]); return b; };
        }
        b.then = (resolve, reject) => {
            const custom = respond ? respond(call) : undefined;
            return Promise.resolve(custom !== undefined ? custom : defaultResponse(call)).then(resolve, reject);
        };
        return b;
    }

    const client = {
        from: table => builder(table),
        rpc: (name, args) => {
            const call = { table: null, rpc: name, args, ops: [] };
            calls.push(call);
            const custom = respond ? respond(call) : undefined;
            return Promise.resolve(custom !== undefined ? custom : { data: null, error: null });
        },
        auth: {
            getSession() {
                authCalls.push(['getSession']);
                if (getSessionThrows) return Promise.reject(new Error('storage unavailable'));
                const value = { data: { session } };
                if (holdSession) return new Promise(r => { releaseSession = () => r(value); });
                return Promise.resolve(value);
            },
            signInWithPassword(creds) {
                authCalls.push(['signInWithPassword', creds]);
                const custom = respond ? respond({ auth: 'signInWithPassword', creds }) : undefined;
                return Promise.resolve(custom !== undefined ? custom : { data: { user: ADMIN_USER }, error: null });
            },
            signOut() { authCalls.push(['signOut']); return Promise.resolve({ error: null }); },
            onAuthStateChange() {
                authCalls.push(['onAuthStateChange']);
                return { data: { subscription: { unsubscribe() {} } } };
            }
        }
    };
    const createClientCalls = [];

    const context = vm.createContext({
        document,
        console: { log() {}, info() {}, warn() {}, error() {} },
        URL, URLSearchParams, setTimeout, clearTimeout,
        CONFIG: {
            supabase: { url: 'https://example.test', key: 'eyJANON-TEST-KEY' },
            api: {
                post_reaction_counts: '/rest/v1/post_reaction_counts',
                discussion_reaction_counts: '/rest/v1/discussion_reaction_counts',
                moment_reaction_counts: '/rest/v1/moment_reaction_counts',
                marginalia_reaction_counts: '/rest/v1/marginalia_reaction_counts',
                postcard_reaction_counts: '/rest/v1/postcard_reaction_counts'
            },
            models: {
                claude: { name: 'Claude', class: 'claude' },
                gpt: { name: 'GPT', class: 'gpt' },
                default: { name: 'AI', class: 'other' }
            }
        },
        supabase: { createClient: (url, key) => { createClientCalls.push([url, key]); return client; } },
        fetch: async (url, init) => {
            fetches.push({ url: String(url), init });
            return { ok: true, status: 200, json: async () => [] };
        },
        confirm: msg => { dialogs.confirm.push(msg); return confirmAnswer; },
        prompt: (msg, def) => { dialogs.prompt.push([msg, def]); return answers.length ? answers.shift() : null; },
        alert: msg => { dialogs.alert.push(msg); }
    });
    context.window = context;
    context.addEventListener = () => {};

    const keysBeforeAdmin = new Set();
    for (const [file, src] of SOURCES) {
        if (file === 'js/admin.js') Object.keys(context).forEach(k => keysBeforeAdmin.add(k));
        vm.runInContext(src, context, { filename: file });
    }
    const keysAfterAdminLoad = Object.keys(context).filter(k => !keysBeforeAdmin.has(k));

    const el = key => document.getElementById(key);
    const describe = call => call.rpc
        ? `rpc ${call.rpc} ${JSON.stringify(call.args)}`
        : `${call.table}.` + call.ops.map(([n, a]) => `${n}(${a.map(x => JSON.stringify(x)).join(',')})`).join('.');

    return {
        context, document, el, calls, rows: data, authCalls, fetches, dialogs, appended, createClientCalls,
        keysBeforeAdmin, keysAfterAdminLoad, docListeners,
        describe,
        described: () => calls.map(describe),
        reset() { calls.length = 0; fetches.length = 0; dialogs.confirm.length = 0; dialogs.prompt.length = 0; dialogs.alert.length = 0; },
        setPrompts(list) { answers.length = 0; answers.push(...list); },
        releaseSession: () => releaseSession && releaseSession(),
        async ready() {
            assert.equal((docListeners.DOMContentLoaded || []).length, 1, 'admin.js wires exactly one DOMContentLoaded handler');
            docListeners.DOMContentLoaded[0]();
            await flush();
        },
        // Click an element inside #admin-dashboard via its delegated listener.
        async act(dataset, { closest = {} } = {}) {
            const target = new FakeElement(null, document);
            Object.assign(target.dataset, dataset);
            if (dataset.text !== undefined) target.textContent = dataset.text;
            target.closest = sel => {
                if (sel in closest) return closest[sel];
                return sel === '[data-action]' && dataset.action ? target : null;
            };
            el('admin-dashboard').fire('click', { target });
            await flush();
            return target;
        }
    };
}

async function boot(opts) {
    const h = harness(opts);
    await h.ready();
    return h;
}

const writes = h => h.calls.filter(c => c.rpc || c.ops.some(op => ['update', 'insert', 'delete'].includes(op[0])));

const BOOT_READS = [
    'admins.select("id").eq("user_id","user-admin-1").single()',
    'posts.select("id",{"count":"exact","head":true})',
    'posts.select("id",{"count":"exact","head":true}).not("ai_identity_id","is",null)',
    'posts_admin.select("*").order("created_at",{"ascending":false}).limit(200)',
    'marginalia.select("*, texts(title)").order("created_at",{"ascending":false})',
    'postcards.select("id",{"count":"exact","head":true})',
    'postcards.select("*").order("created_at",{"ascending":false}).limit(200)',
    'postcards.select("prompt_id").eq("is_active",true)',
    'discussions.select("*").order("created_at",{"ascending":false})',
    'contact.select("*").order("created_at",{"ascending":false})',
    'text_submissions.select("*").order("created_at",{"ascending":false})',
    'facilitators.select("*").order("created_at",{"ascending":false})',
    'ai_identities.select("*").order("created_at",{"ascending":false})',
    'postcard_prompts.select("*").order("created_at",{"ascending":false})',
    'moments.select("*").order("event_date",{"ascending":false})',
    'interests.select("id, name, slug, status, description, is_pinned").order("name",{"ascending":true})',
    // updateModelDistribution: one exact COUNT per family plus the total
    'posts.select("id",{"count":"exact","head":true}).eq("is_active",true)',
    'posts.select("id",{"count":"exact","head":true}).eq("is_active",true).or("model.ilike.%claude%")',
    'posts.select("id",{"count":"exact","head":true}).eq("is_active",true).or("model.ilike.%gpt%,model.ilike.%openai%")',
    'posts.select("id",{"count":"exact","head":true}).eq("is_active",true).or("model.ilike.%gemini%,model.ilike.%google%")',
    'posts.select("id",{"count":"exact","head":true}).eq("is_active",true).or("model.ilike.%grok%")',
    'posts.select("id",{"count":"exact","head":true}).eq("is_active",true).or("model.ilike.%llama%")',
    'posts.select("id",{"count":"exact","head":true}).eq("is_active",true).or("model.ilike.%mistral%")',
    'posts.select("id",{"count":"exact","head":true}).eq("is_active",true).or("model.ilike.%deepseek%")',
    'posts.select("id",{"count":"exact","head":true}).eq("is_active",true).or("model.ilike.%human%")'
];

// ------------------------------------------------------------------
// Globals and the Supabase client
// ------------------------------------------------------------------

test('admin.js puts nothing on window at load; the dashboard adds only window._supabaseClient', async () => {
    const h = harness();
    assert.deepEqual(h.keysAfterAdminLoad, [], 'the IIFE exports no functions');
    await h.ready();
    const added = Object.keys(h.context).filter(k => !h.keysBeforeAdmin.has(k));
    assert.deepEqual(added, ['_supabaseClient']);
    assert.deepEqual(h.createClientCalls, [['https://example.test', 'eyJANON-TEST-KEY']]);
    await h.act({ action: 'restore-post', id: 'p1' });
    assert.equal(h.createClientCalls.length, 1, 'the client is created once and reused');
});

test('an existing window._supabaseClient is reused instead of creating a new one', async () => {
    const h = harness({ session: null });
    let used = 0;
    h.context._supabaseClient = {
        auth: { getSession: async () => { used += 1; return { data: { session: null } }; } }
    };
    await h.ready();
    assert.equal(used, 1);
    assert.deepEqual(h.createClientCalls, []);
});

// ------------------------------------------------------------------
// Auth gate
// ------------------------------------------------------------------

test('signed out: the login form shows, the dashboard stays hidden, and no table is read', async () => {
    const h = await boot({ session: null });
    assert.equal(h.el('admin-login').style.display, 'block');
    assert.equal(h.el('admin-dashboard').style.display, 'none');
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.fetches, []);
    assert.deepEqual(h.authCalls, [['getSession']]);
    assert.equal(h.el('posts-list').innerHTML, '');
    assert.equal(h.el('stat-posts').textContent, '');
});

test('signed in but not in the admins table: login form only, the admins lookup is the only read', async () => {
    const h = await boot({ rows: { admins: [] } });
    assert.equal(h.el('admin-login').style.display, 'block');
    assert.equal(h.el('admin-dashboard').style.display, 'none');
    assert.deepEqual(h.described(), ['admins.select("id").eq("user_id","user-admin-1").single()']);
    assert.deepEqual(h.fetches, []);
});

test('an admins lookup error, or a getSession that throws, also keeps the dashboard closed', async () => {
    const h1 = await boot({ respond: c => (c.table === 'admins' ? { data: { id: 'x' }, error: { message: 'rls' } } : undefined) });
    assert.equal(h1.el('admin-dashboard').style.display, 'none');
    assert.equal(h1.calls.length, 1);

    const h2 = await boot({ getSessionThrows: true });
    assert.equal(h2.el('admin-login').style.display, 'block');
    assert.equal(h2.el('admin-dashboard').style.display, 'none');
    assert.deepEqual(h2.calls, []);
});

test('an admin session opens the dashboard and runs every loader with these exact queries', async () => {
    const h = await boot();
    assert.equal(h.el('admin-login').style.display, 'none');
    assert.equal(h.el('admin-dashboard').style.display, 'block');
    assert.equal(h.described()[0], BOOT_READS[0], 'the admin check runs first');
    assert.deepEqual(h.described().slice().sort(), BOOT_READS.slice().sort());
    assert.equal(writes(h).length, 0, 'loading writes nothing');
    assert.ok(!h.authCalls.some(c => c[0] === 'onAuthStateChange'), 'admin.js does not subscribe to auth changes');
});

test('the login button is wired only after the initial auth check resolves', async () => {
    // Looks off: the code comment says the login listeners are wired
    // "immediately, before async auth check", but they are added after the await.
    const h = harness({ session: null, holdSession: true });
    h.docListeners.DOMContentLoaded[0]();
    await flush();
    assert.equal((h.el('login-btn').listeners.click || []).length, 0);
    h.releaseSession();
    await flush();
    assert.equal(h.el('login-btn').listeners.click.length, 1);
    assert.equal(h.el('password-input').listeners.keypress.length, 1);
    assert.equal(h.el('email-input').listeners.keypress.length, 1);
    assert.equal(h.el('logout-btn').listeners.click.length, 1);
});

test('login: empty fields are refused locally; Enter on the password field clicks Sign In', async () => {
    const h = await boot({ session: null });
    h.el('password-input').fire('keypress', { key: 'Enter' });
    await flush();
    assert.equal(h.el('login-error').textContent, 'Please enter email and password');
    assert.equal(h.el('login-error').style.display, 'block');
    assert.ok(!h.authCalls.some(c => c[0] === 'signInWithPassword'));

    h.el('email-input').fire('keypress', { key: 'Enter' });
    assert.equal(h.el('password-input').focusCount, 1, 'Enter on email moves focus to password');
});

test('login as a non-admin signs straight back out and says so', async () => {
    const h = await boot({ session: null, rows: { admins: [] } });
    h.el('email-input').value = '  a@example.test  ';
    h.el('password-input').value = 'pw';
    h.el('login-btn').click();
    await flush();
    assert.deepEqual(plain(h.authCalls.slice(1)), [
        ['signInWithPassword', { email: 'a@example.test', password: 'pw' }],
        ['signOut']
    ]);
    assert.deepEqual(h.described(), ['admins.select("id").eq("user_id","user-admin-1").single()']);
    assert.equal(h.el('login-error').textContent, 'You do not have admin access');
    assert.equal(h.el('login-error').style.display, 'block');
    assert.equal(h.el('password-input').value, '', 'password is cleared');
    assert.equal(h.el('password-input').focusCount, 1);
    assert.equal(h.el('login-btn').disabled, false);
    assert.equal(h.el('login-btn').textContent, 'Sign In');
    assert.equal(h.el('admin-dashboard').style.display, 'none');
});

test('login with a bad password shows the auth error message', async () => {
    const h = await boot({
        session: null,
        respond: c => (c.auth ? { data: { user: null }, error: { message: 'Invalid login credentials' } } : undefined)
    });
    h.el('email-input').value = 'a@example.test';
    h.el('password-input').value = 'wrong';
    h.el('login-btn').click();
    await flush();
    assert.equal(h.el('login-error').textContent, 'Invalid login credentials');
    assert.deepEqual(h.calls, []);
});

test('login as an admin opens the dashboard and loads data; logout signs out and shows login', async () => {
    const h = await boot({ session: null });
    h.el('email-input').value = 'a@example.test';
    h.el('password-input').value = 'pw';
    h.el('login-btn').click();
    await flush();
    assert.equal(h.el('login-error').style.display, 'none');
    assert.equal(h.el('admin-dashboard').style.display, 'block');
    assert.deepEqual(h.described().slice().sort(), BOOT_READS.slice().sort());

    h.el('logout-btn').click();
    await flush();
    assert.deepEqual(h.authCalls[h.authCalls.length - 1], ['signOut']);
    assert.equal(h.el('admin-login').style.display, 'block');
    assert.equal(h.el('admin-dashboard').style.display, 'none');
});

// ------------------------------------------------------------------
// Stats, counts, model distribution, reaction badges
// ------------------------------------------------------------------

test('stat cards and tab counts: COUNT queries for posts/postcards, pending-only for contacts and submissions', async () => {
    const h = await boot({
        counts: { posts: 42, postcards: 7 },
        rows: {
            contact: [{ id: 'c1', is_addressed: false }, { id: 'c2', is_addressed: true }, { id: 'c3' }],
            text_submissions: [
                { id: 't1', status: 'pending', title: 'A', author: 'B', category: 'poetry' },
                { id: 't2', status: 'approved', title: 'C', author: 'D', category: 'poetry' }
            ],
            facilitators: [{ id: 'f1', email: 'a@example.test' }],
            ai_identities: [{ id: 'a1', facilitator_id: 'f1', name: 'N', model: 'Claude' }, { id: 'a2', facilitator_id: 'f1', name: 'M', model: 'GPT' }],
            marginalia: [{ id: 'm1', model: 'Claude' }],
            discussions: [{ id: 'd1', title: 'T' }, { id: 'd2', title: 'U' }],
            postcard_prompts: [{ id: 'pr1', prompt: 'P' }],
            moments: [{ id: 'mo1', title: 'X' }],
            interests: [{ id: 'i1', name: 'I', slug: 'i', status: 'active' }]
        }
    });
    const stat = id => h.el(id).textContent;
    assert.equal(stat('stat-posts'), '42');
    assert.equal(stat('stat-claimed'), '42');
    assert.equal(stat('stat-postcards'), '7');
    assert.equal(stat('stat-contacts'), '2');
    assert.equal(stat('stat-text-submissions'), '1');
    assert.equal(stat('stat-marginalia'), '1');
    assert.equal(stat('stat-discussions'), '2');
    assert.equal(stat('stat-accounts'), '1');
    assert.equal(stat('stat-identities'), '2');
    const tab = t => h.el('tab-count-' + t).textContent;
    assert.equal(tab('posts'), '42');
    assert.equal(tab('postcards'), '7');
    assert.equal(tab('contacts'), '2');
    assert.equal(tab('text-submissions'), '2', 'submissions tab shows the total, the stat shows pending');
    assert.equal(tab('users'), '1');
    assert.equal(tab('prompts'), '1');
    assert.equal(tab('moments'), '1');
    assert.equal(tab('interests'), '1');
});

test('a loader error marks its stat "!" with the message, then the final updateStats resets it to 0', async () => {
    const h = await boot({
        respond: c => (c.table === 'marginalia' || c.table === 'facilitators'
            ? { data: null, error: { message: XSS } } : undefined)
    });
    assert.equal(h.el('tab-count-marginalia').textContent, '!');
    assert.equal(h.el('tab-count-users').textContent, '!');
    assert.ok(h.el('marginalia-list').innerHTML.includes('Failed to load marginalia: ' + XSS_ESCAPED));
    assert.ok(!h.el('marginalia-list').innerHTML.includes(XSS));
    assert.ok(h.el('users-list').innerHTML.includes('Failed to load users: ' + XSS_ESCAPED));
    // Looks off: loadAllData's closing updateStats() overwrites the "!" error
    // marker with 0 (and clears the error title) for stats it recomputes.
    assert.equal(h.el('stat-marginalia').textContent, '0');
    assert.equal(h.el('stat-marginalia').title, '');
    assert.equal(h.el('stat-accounts').textContent, '0');
});

test('a posts count error leaves "!" on the stat (posts are not recomputed by updateStats)', async () => {
    const h = await boot({
        respond: c => (c.table === 'posts' && c.ops.length === 1 ? { data: null, count: null, error: { message: 'timeout' } } : undefined)
    });
    assert.equal(h.el('stat-posts').textContent, '!');
    assert.equal(h.el('stat-posts').title, 'Failed to load: timeout');
    assert.equal(h.el('tab-count-posts').textContent, '!');
});

function distribution(counts, opts = {}) {
    return boot({
        ...opts,
        respond: c => {
            if (c.table !== 'posts' || !c.ops.some(op => op[0] === 'eq')) return undefined;
            const or = c.ops.find(op => op[0] === 'or');
            const key = or ? or[1][0].match(/%(\w+)%/)[1] : 'total';
            return { data: null, count: counts[key] || 0, error: counts.error || null };
        }
    });
}

test('model distribution renders exact shares, Other as the remainder, and omits empty families', async () => {
    const h = await distribution({ total: 10, claude: 5, gpt: 4 });
    const html = h.el('model-distribution').innerHTML;
    assert.ok(html.includes('Claude 50%'));
    assert.ok(html.includes('GPT 40%'));
    assert.ok(html.includes('Other 10%'));
    assert.ok(!html.includes('Gemini'));
    assert.ok(html.includes('Share of all 10 active posts'));
    assert.ok(html.includes('width: 50%; background: var(--claude-color)'));
});

test('model distribution: tiny shares read <0.1%, zero total and errors have their own messages', async () => {
    const tiny = await distribution({ total: 5000, claude: 1 });
    assert.ok(tiny.el('model-distribution').innerHTML.includes('Claude &lt;0.1%'));
    const none = await distribution({ total: 0 });
    assert.equal(none.el('model-distribution').innerHTML, '<div class="admin-empty">No posts yet</div>');
    const broken = await distribution({ total: 3, error: { message: 'x' } });
    assert.equal(broken.el('model-distribution').innerHTML, '<div class="admin-empty">Model distribution unavailable</div>');
});

test('reaction counts are fetched with the anon key per content type, only for non-empty lists', async () => {
    const h = await boot({
        rows: {
            posts_admin: [{ id: 'p1', model: 'Claude' }, { id: 'p2', model: 'GPT' }],
            moments: [{ id: 'mo1', title: 'M' }],
            discussions: [{ id: 'd1', title: 'D' }]
        }
    });
    const parsed = h.fetches.map(f => new URL(f.url));
    assert.deepEqual(parsed.map(u => u.pathname).sort(),
        ['/rest/v1/discussion_reaction_counts', '/rest/v1/moment_reaction_counts', '/rest/v1/post_reaction_counts']);
    const post = parsed.find(u => u.pathname.endsWith('post_reaction_counts') && !u.pathname.includes('discussion'));
    assert.equal(post.origin, 'https://example.test');
    assert.equal(post.searchParams.get('post_id'), 'in.(p1,p2)');
    assert.equal(post.searchParams.get('select'), 'post_id,count');
    const init = h.fetches[0].init;
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.apikey, 'eyJANON-TEST-KEY');
    assert.equal(init.headers.Authorization, 'Bearer eyJANON-TEST-KEY');
});

// ------------------------------------------------------------------
// Rendering: user text is escaped, hrefs are fixed relative pages
// ------------------------------------------------------------------

function xssRows() {
    return {
        posts_admin: [{
            id: 'p1', model: XSS, model_version: XSS, ai_name: XSS, content: XSS, moderation_note: XSS,
            discussion_title: XSS, feeling: XSS, facilitator: XSS, created_at: '2026-01-01T00:00:00Z'
        }],
        marginalia: [{ id: 'm1', model: XSS, model_version: XSS, ai_name: XSS, content: XSS, moderation_note: XSS, feeling: XSS, texts: { title: XSS } }],
        postcards: [{ id: 'pc1', model: XSS, model_version: XSS, ai_name: XSS, content: XSS, format: XSS, feeling: XSS }],
        discussions: [{ id: 'd1', title: XSS, description: XSS, proposed_by_model: XSS, interest_id: 'i1' }],
        contact: [{ id: 'c1', name: XSS, email: XSS, message: XSS }],
        text_submissions: [{
            id: 't1', status: 'pending', title: XSS, author: XSS, content: XSS, category: XSS, source: XSS,
            submitter_name: XSS, submitter_email: XSS, reason: XSS
        }],
        facilitators: [{ id: 'f1', email: XSS, display_name: XSS, arrival_source: XSS }],
        ai_identities: [{ id: 'a1', facilitator_id: 'f1', name: XSS, model: XSS }],
        postcard_prompts: [{ id: 'pr1', prompt: XSS }],
        moments: [{ id: 'mo1', title: XSS, subtitle: XSS, event_date: '2026-01-01', is_active: true }],
        interests: [{ id: 'i1', name: XSS, slug: XSS, status: XSS, description: XSS }]
    };
}

const LISTS = ['posts-list', 'marginalia-list', 'postcards-list', 'discussions-list', 'contacts-list',
    'text-submissions-list', 'users-list', 'prompts-list', 'moments-list', 'interests-list'];

test('every list escapes user-supplied text before innerHTML', async () => {
    const h = await boot({ rows: xssRows() });
    for (const id of LISTS) {
        const html = h.el(id).innerHTML;
        assert.ok(!html.includes('<img'), id + ' renders no raw <img>');
        assert.ok(html.includes(XSS_ESCAPED), id + ' shows the text escaped');
    }
    // unknown model text falls back to the default class, never into class=""
    assert.ok(h.el('posts-list').innerHTML.includes('admin-item__model--other'));
});

test('attribute values built from user text escape quotes (data-email)', async () => {
    const h = await boot({ rows: { facilitators: [{ id: 'f1', email: 'a@example.test" onmouseover="x' }] } });
    assert.ok(h.el('users-list').innerHTML.includes('data-email="a@example.test&quot; onmouseover=&quot;x"'));
});

test('hrefs: content links are http(s) only; profile and moment links are fixed relative pages', async () => {
    const h = await boot({
        rows: {
            posts_admin: [{ id: 'p1', model: 'Claude', content: 'see javascript:alert(1) and [x](javascript:alert(1)) and https://ok.example.test/a' }],
            facilitators: [{ id: 'f1', email: 'a@example.test' }],
            ai_identities: [{ id: 'a1', facilitator_id: 'f1', name: 'N', model: 'Claude' }],
            moments: [{ id: 'mo1', title: 'M' }]
        }
    });
    const hrefs = LISTS.flatMap(id => [...h.el(id).innerHTML.matchAll(/href="([^"]*)"/g)].map(m => m[1]));
    assert.deepEqual(hrefs.sort(), ['https://ok.example.test/a', 'moment.html?id=mo1', 'profile.html?id=a1']);
});

test('ids go into data-id and the moment/profile hrefs raw, without escaping', async () => {
    // Looks off (low risk while ids are server UUIDs): ids are interpolated
    // unescaped, so a quote in an id would end the attribute.
    const h = await boot({ rows: { moments: [{ id: 'm"x', title: 'M' }] } });
    assert.ok(h.el('moments-list').innerHTML.includes('href="moment.html?id=m"x"'));
});

test('text submission status is rendered raw, not escaped', async () => {
    // Looks off: every other field is escaped, but the status label is
    // interpolated straight into innerHTML (relies on a DB check constraint).
    const h = await boot({ rows: { text_submissions: [{ id: 't1', status: '<b>odd</b>', title: 'T', author: 'A', category: 'c' }] } });
    assert.ok(h.el('text-submissions-list').innerHTML.includes('<b>odd</b>'));
});

test('moment items carry no data-id, so reaction badges can never attach to them', async () => {
    // Looks off: renderMoments calls injectReactionBadges(container, '.admin-item', 'id', ...)
    // but its .admin-item rows have no data-id, so injectReactionBadges skips every row.
    const h = await boot({ rows: { moments: [{ id: 'mo1', title: 'M' }] } });
    const html = h.el('moments-list').innerHTML;
    assert.ok(html.includes('class="admin-item"'));
    assert.ok(!/class="admin-item"[^>]*data-id=/.test(html));
});

test('discussions render before interests load, so a categorized thread shows "Unknown" interest', async () => {
    // Looks off: renderDiscussions reads allInterests, which loadInterests
    // fills concurrently; nothing re-renders discussions afterwards.
    const h = await boot({
        rows: {
            discussions: [{ id: 'd1', title: 'T', interest_id: 'i1' }, { id: 'd2', title: 'U', interest_id: null }],
            interests: [{ id: 'i1', name: 'Philosophy', slug: 'p', status: 'active' }]
        }
    });
    const html = h.el('discussions-list').innerHTML;
    assert.ok(html.includes('<strong>Interest:</strong> Unknown'));
    assert.ok(html.includes('<strong>Interest:</strong> Uncategorized'));
    h.el('filter-discussions').fire('change');
    assert.ok(h.el('discussions-list').innerHTML.includes('<strong>Interest:</strong> Philosophy'), 'a re-render picks it up');
});

test('hidden items get Restore buttons, active ones Hide; filters narrow the list', async () => {
    const h = await boot({
        rows: { posts_admin: [{ id: 'p1', model: 'Claude', is_active: false }, { id: 'p2', model: 'Claude' }] }
    });
    const html = h.el('posts-list').innerHTML;
    assert.ok(html.includes('data-action="restore-post" data-id="p1"'));
    assert.ok(html.includes('data-action="hide-post" data-id="p2"'));
    h.el('filter-posts').value = 'hidden';
    h.el('filter-posts').fire('change');
    assert.ok(h.el('posts-list').innerHTML.includes('data-id="p1"'));
    assert.ok(!h.el('posts-list').innerHTML.includes('data-id="p2"'));
    h.el('filter-posts').value = 'active';
    h.el('filter-posts').fire('change');
    assert.ok(!h.el('posts-list').innerHTML.includes('data-id="p1"'));
});

test('empty tables render their empty-state messages', async () => {
    const h = await boot();
    assert.equal(h.el('posts-list').innerHTML, '<div class="admin-empty">No posts found</div>');
    assert.equal(h.el('marginalia-list').innerHTML, '<div class="admin-empty">No marginalia found</div>');
    assert.equal(h.el('postcards-list').innerHTML, '<div class="admin-empty">No postcards found</div>');
    assert.equal(h.el('discussions-list').innerHTML, '<div class="admin-empty">No discussions found</div>');
    assert.equal(h.el('contacts-list').innerHTML, '<div class="admin-empty">No contact messages</div>');
    assert.equal(h.el('text-submissions-list').innerHTML, '<div class="admin-empty">No text submissions found</div>');
    assert.equal(h.el('users-list').innerHTML, '<div class="admin-empty">No users found</div>');
    assert.equal(h.el('prompts-list').innerHTML, '<div class="admin-empty">No prompts yet. Create one above.</div>');
    assert.equal(h.el('moments-list').innerHTML, '<div class="admin-empty">No moments yet</div>');
    assert.equal(h.el('interests-list').innerHTML, '<div class="admin-empty">No interests found</div>');
});

test('user cards count posts per identity from the recent-posts snapshot, which lands after the first render', async () => {
    // Looks off: loadUsers renders before loadPosts has filled recentPosts
    // (posts waits on two COUNT queries first), so cards show 0 posts until
    // something re-renders the Users tab.
    const h = await boot({
        rows: {
            posts_admin: [{ id: 'p1', model: 'Claude', ai_identity_id: 'a1' }, { id: 'p2', model: 'Claude', ai_identity_id: 'a1' }],
            facilitators: [{ id: 'f1', email: 'a@example.test', arrival_source: 'forum' }],
            ai_identities: [{ id: 'a1', facilitator_id: 'f1', name: 'N', model: 'Claude' }]
        }
    });
    const html = h.el('users-list').innerHTML;
    assert.ok(html.includes('1 identity'));
    assert.ok(html.includes('<span class="user-card__posts">0 posts</span>'));
    assert.ok(html.includes('Arrival sources: forum 1'));
    h.el('filter-users').fire('input');
    assert.ok(h.el('users-list').innerHTML.includes('<span class="user-card__posts">2 posts</span>'));
    assert.ok(h.el('users-list').innerHTML.includes('<span>2 posts</span>'), 'per-identity count too');
});

// ------------------------------------------------------------------
// Moderation actions
// ------------------------------------------------------------------

async function actOn(dataset, opts = {}) {
    const { rows, confirmAnswer, promptAnswers, respond } = opts;
    const h = await boot({ rows, confirmAnswer, promptAnswers, respond });
    h.reset();
    if (promptAnswers) h.setPrompts(promptAnswers);
    await h.act(dataset, opts.act);
    return h;
}

const update = (table, payload, id) => `${table}.update(${JSON.stringify(payload)}).eq("id",${JSON.stringify(id)}).select("id")`;

const SIMPLE_ACTIONS = [
    // [data-action, confirm text or null, expected write, reload query that follows]
    ['hide-post', 'Hide this post? It will no longer appear on the site.', update('posts', { is_active: false }, 'x1'),
        'posts_admin.select("*").order("created_at",{"ascending":false}).limit(200)'],
    ['restore-post', null, update('posts', { is_active: true }, 'x1'),
        'posts_admin.select("*").order("created_at",{"ascending":false}).limit(200)'],
    ['hide-marginalia', 'Hide this marginalia? It will no longer appear on the site.', update('marginalia', { is_active: false }, 'x1'),
        'marginalia.select("*, texts(title)").order("created_at",{"ascending":false})'],
    ['restore-marginalia', null, update('marginalia', { is_active: true }, 'x1'),
        'marginalia.select("*, texts(title)").order("created_at",{"ascending":false})'],
    ['hide-postcard', 'Hide this postcard? It will no longer appear on the site.', update('postcards', { is_active: false }, 'x1'),
        'postcards.select("*").order("created_at",{"ascending":false}).limit(200)'],
    ['restore-postcard', null, update('postcards', { is_active: true }, 'x1'),
        'postcards.select("*").order("created_at",{"ascending":false}).limit(200)'],
    ['deactivate-discussion', 'Deactivate this discussion? It will no longer appear on the site.', update('discussions', { is_active: false }, 'x1'),
        'discussions.select("*").order("created_at",{"ascending":false})'],
    ['activate-discussion', null, update('discussions', { is_active: true }, 'x1'),
        'discussions.select("*").order("created_at",{"ascending":false})'],
    ['clear-thread-state', 'Clear this thread\'s "Where this is now"? The post itself stays.',
        update('discussions', { state_post_id: null, state_set_at: null, state_set_by_identity_id: null }, 'x1'),
        'discussions.select("*").order("created_at",{"ascending":false})'],
    ['address-contact', null, update('contact', { is_addressed: true }, 'x1'),
        'contact.select("*").order("created_at",{"ascending":false})'],
    ['unaddress-contact', null, update('contact', { is_addressed: false }, 'x1'),
        'contact.select("*").order("created_at",{"ascending":false})'],
    ['deactivate-prompt', 'Deactivate this prompt? No prompt will be active for postcards.', update('postcard_prompts', { is_active: false }, 'x1'),
        'postcard_prompts.select("*").order("created_at",{"ascending":false})']
];

for (const [action, confirmText, expected, reload] of SIMPLE_ACTIONS) {
    test(`${action}: sends ${expected.split('.select')[0]} and reloads`, async () => {
        const h = await actOn({ action, id: 'x1' });
        assert.deepEqual(h.dialogs.confirm, confirmText ? [confirmText] : []);
        assert.deepEqual(writes(h).map(h.describe), [expected]);
        assert.ok(h.described().includes(reload), 'reloads with ' + reload);
        assert.deepEqual(h.dialogs.alert, []);
    });
    if (confirmText) {
        test(`${action}: declining the confirm sends nothing`, async () => {
            const h = await actOn({ action, id: 'x1' }, { confirmAnswer: false });
            assert.equal(h.dialogs.confirm.length, 1);
            assert.deepEqual(h.calls, []);
        });
    }
}

test('a failed update alerts with the error message and skips the reload', async () => {
    const h = await actOn({ action: 'hide-post', id: 'x1' }, {
        respond: c => (c.ops && c.ops.some(op => op[0] === 'update') ? { data: null, error: { message: 'denied' } } : undefined)
    });
    assert.deepEqual(h.dialogs.alert, ['Failed to hide post: denied']);
    assert.equal(h.calls.length, 1);
});

test('pin toggles flip the data-pinned / data-active attribute', async () => {
    const cases = [
        [{ action: 'toggle-discussion-pin', id: 'd1', pinned: 'true' }, update('discussions', { is_pinned: false }, 'd1')],
        [{ action: 'toggle-discussion-pin', id: 'd1', pinned: 'undefined' }, update('discussions', { is_pinned: true }, 'd1')],
        [{ action: 'toggle-moment-pin', id: 'mo1', pinned: 'false' }, update('moments', { is_pinned: true }, 'mo1')],
        [{ action: 'toggle-moment-active', id: 'mo1', active: 'true' }, update('moments', { is_active: false }, 'mo1')],
        [{ action: 'toggle-moment-active', id: 'mo1', active: 'false' }, update('moments', { is_active: true }, 'mo1')]
    ];
    for (const [dataset, expected] of cases) {
        const h = await actOn(dataset);
        assert.deepEqual(writes(h).map(h.describe), [expected], JSON.stringify(dataset));
        assert.deepEqual(h.dialogs.confirm, []);
    }
});

test('moderation notes: prefilled from the row, trimmed, blank clears to null, cancel sends nothing', async () => {
    const rows = {
        posts_admin: [{ id: 'p1', model: 'Claude', moderation_note: 'old note' }],
        marginalia: [{ id: 'm1', model: 'Claude', moderation_note: 'm note' }]
    };
    let h = await actOn({ action: 'edit-moderation-note', id: 'p1' }, { rows, promptAnswers: ['  new note  '] });
    assert.equal(h.dialogs.prompt[0][1], 'old note');
    assert.match(h.dialogs.prompt[0][0], /visible to all readers/);
    assert.deepEqual(writes(h).map(h.describe), [update('posts', { moderation_note: 'new note' }, 'p1')]);

    h = await actOn({ action: 'edit-moderation-note', id: 'p1' }, { rows, promptAnswers: ['   '] });
    assert.deepEqual(writes(h).map(h.describe), [update('posts', { moderation_note: null }, 'p1')]);

    h = await actOn({ action: 'edit-moderation-note', id: 'p1' }, { rows, promptAnswers: [] });
    assert.deepEqual(h.calls, []);

    h = await actOn({ action: 'edit-marginalia-note', id: 'm1' }, { rows, promptAnswers: ['x'] });
    assert.equal(h.dialogs.prompt[0][1], 'm note');
    assert.deepEqual(writes(h).map(h.describe), [update('marginalia', { moderation_note: 'x' }, 'm1')]);
});

test('activate-prompt deactivates every active prompt, then activates the chosen one', async () => {
    const h = await actOn({ action: 'activate-prompt', id: 'pr2' });
    assert.deepEqual(writes(h).map(h.describe), [
        'postcard_prompts.update({"is_active":false}).eq("is_active",true)',
        update('postcard_prompts', { is_active: true }, 'pr2')
    ]);
    assert.deepEqual(h.dialogs.confirm, []);
});

test('create prompt: empty text is refused; otherwise bulk-deactivate then insert as active', async () => {
    const h = await boot();
    const btn = h.el('create-prompt-btn');
    h.reset();
    h.el('new-prompt-text').value = '   ';
    await h.act({}, { closest: { '#create-prompt-btn': btn } });
    assert.deepEqual(h.dialogs.alert, ['Please enter prompt text.']);
    assert.deepEqual(h.calls, []);

    h.el('new-prompt-text').value = '  What did you notice?  ';
    await h.act({}, { closest: { '#create-prompt-btn': btn } });
    assert.deepEqual(writes(h).map(h.describe), [
        'postcard_prompts.update({"is_active":false}).eq("is_active",true)',
        'postcard_prompts.insert({"prompt":"What did you notice?","is_active":true})'
    ]);
    assert.equal(h.el('new-prompt-text').value, '');
    assert.equal(btn.disabled, false);
    assert.equal(btn.textContent, 'Create & Activate');
});

test('toggle-supporter updates facilitators and flips the button; a 0-row result is reported as refused', async () => {
    let h = await actOn({ action: 'toggle-supporter', id: 'f1', text: '\u2661 Mark Supporter' });
    assert.deepEqual(writes(h).map(h.describe), [update('facilitators', { is_supporter: true }, 'f1')]);

    const h2 = await boot();
    h2.reset();
    const btn = await h2.act({ action: 'toggle-supporter', id: 'f1', text: '\u2665 Supporter' });
    assert.deepEqual(writes(h2).map(h2.describe), [update('facilitators', { is_supporter: false }, 'f1')]);
    assert.equal(btn.textContent, '\u2661 Mark Supporter');

    h = await actOn({ action: 'toggle-supporter', id: 'f1', text: '\u2661 Mark Supporter' }, {
        respond: c => (c.ops && c.ops.some(op => op[0] === 'update') ? { data: [], error: null } : undefined)
    });
    assert.deepEqual(h.dialogs.alert, ['Failed to update supporter status: the database did not change this row (permission refused)']);
});

test('delete-facilitator confirms with the email, then calls the admin_delete_account RPC', async () => {
    let h = await actOn({ action: 'delete-facilitator', id: 'f1', email: 'a@example.test' }, { confirmAnswer: false });
    assert.match(h.dialogs.confirm[0], /^Delete account for a@example\.test\?/);
    assert.deepEqual(h.calls, []);

    h = await actOn({ action: 'delete-facilitator', id: 'f1', email: 'a@example.test' });
    assert.deepEqual(writes(h).map(h.describe), ['rpc admin_delete_account {"p_target":"f1"}']);
    assert.match(h.dialogs.alert[0], /^Account deleted\. Reminder: remove the auth user/);
    assert.ok(h.described().includes('facilitators.select("*").order("created_at",{"ascending":false})'));
});

test('approve-text marks approved, then publishes to texts with defaults for category and source', async () => {
    const rows = { text_submissions: [{ id: 't1', status: 'pending', title: 'Poem', author: 'Anon', content: 'Body', category: null, source: '' }] };
    const h = await actOn({ action: 'approve-text', id: 't1' }, { rows });
    const w = writes(h);
    assert.equal(w.length, 2);
    assert.equal(w[0].table, 'text_submissions');
    assert.equal(w[0].ops[0][0], 'update');
    assert.equal(w[0].ops[0][1][0].status, 'approved');
    assert.match(w[0].ops[0][1][0].reviewed_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    assert.deepEqual(plain(w[0].ops.slice(1)), [['eq', ['id', 't1']], ['select', ['id']]]);
    assert.equal(h.describe(w[1]),
        'texts.insert({"title":"Poem","author":"Anon","content":"Body","category":"other","source":null}).select("id").single()');
    assert.deepEqual(h.dialogs.confirm, []);
});

test('approve-text: unknown id alerts without writing; an insert error still leaves it approved', async () => {
    let h = await actOn({ action: 'approve-text', id: 'nope' });
    assert.deepEqual(h.dialogs.alert, ['Failed to approve text submission: Submission not found']);
    assert.deepEqual(h.calls, []);

    h = await actOn({ action: 'approve-text', id: 't1' }, {
        rows: { text_submissions: [{ id: 't1', status: 'pending', title: 'P', author: 'A', content: 'C', category: 'poetry' }] },
        respond: c => (c.table === 'texts' ? { data: null, error: { message: 'dup' } } : undefined)
    });
    assert.deepEqual(h.dialogs.alert, ['Approved but failed to publish to Reading Room: dup']);
    assert.equal(writes(h)[0].table, 'text_submissions');
});

test('reject-text on a pending submission confirms and only updates the status', async () => {
    const rows = { text_submissions: [{ id: 't1', status: 'pending', title: 'P', author: 'A', category: 'c' }] };
    const h = await actOn({ action: 'reject-text', id: 't1' }, { rows });
    assert.deepEqual(h.dialogs.confirm, ['Reject this text submission?']);
    const w = writes(h);
    assert.equal(w.length, 1);
    assert.equal(w[0].ops[0][1][0].status, 'rejected');
    assert.ok(!h.calls.some(c => c.table === 'texts'));
});

test('unapproving finds the published text by title + author (limit 1) even right after approving it', async () => {
    // Looks off: approve stores _published_text_id on the in-memory row, but
    // loadTextSubmissions then replaces the array with fresh rows, so the
    // "delete by specific ID" branch is unreachable after a reload and the
    // title + author fallback is what always runs.
    const h = await boot({
        rows: {
            text_submissions: [{ id: 't1', status: 'pending', title: 'Poem', author: 'Anon', content: 'C', category: 'c' }],
            texts: [{ id: 'text-9' }]
        }
    });
    // The row the approve-reload reads back is approved, as the DB would return it.
    h.rows.text_submissions[0].status = 'approved';
    await h.act({ action: 'approve-text', id: 't1' });
    assert.ok(h.described().includes('texts.insert({"title":"Poem","author":"Anon","content":"C","category":"c","source":null}).select("id").single()'));
    h.reset();
    await h.act({ action: 'reject-text', id: 't1' });
    assert.deepEqual(h.dialogs.confirm, ['Unapprove this submission? It will be removed from the Reading Room.']);
    const d = h.described();
    assert.ok(d.includes('texts.select("id").eq("title","Poem").eq("author","Anon").limit(1)'));
    assert.ok(d.includes('texts.delete().eq("id","text-9")'));
    assert.ok(!d.includes('texts.delete().eq("id","inserted-1")'));
});

test('move-discussion offers other active/emerging interests (escaped) and updates interest_id', async () => {
    const rows = {
        discussions: [{ id: 'd1', title: XSS, interest_id: 'i1' }],
        interests: [
            { id: 'i1', name: 'Current', slug: 'c', status: 'active' },
            { id: 'i2', name: XSS, slug: 'x', status: 'emerging' },
            { id: 'i3', name: 'Gone', slug: 'g', status: 'sunset' }
        ]
    };
    const h = await actOn({ action: 'move-discussion', id: 'd1' }, { rows });
    assert.equal(h.appended.length, 1);
    const overlay = h.appended[0];
    assert.ok(overlay.innerHTML.includes(`<option value="i2">${XSS_ESCAPED}</option>`));
    assert.ok(!overlay.innerHTML.includes('value="i1"'));
    assert.ok(!overlay.innerHTML.includes('value="i3"'));
    assert.ok(overlay.innerHTML.includes('Currently in: Current'));
    assert.ok(!overlay.innerHTML.includes('<img'));
    assert.deepEqual(h.calls, []);

    h.el('move-target-interest').value = 'i2';
    h.el('move-confirm').click();
    await flush();
    assert.deepEqual(writes(h).map(h.describe), [update('discussions', { interest_id: 'i2' }, 'd1')]);
    assert.equal(overlay.removed, true);
});

test('move-discussion with no movable interests alerts instead of opening a dialog', async () => {
    let h = await actOn({ action: 'move-discussion', id: 'd1' }, { rows: { discussions: [{ id: 'd1', title: 'T' }] } });
    assert.deepEqual(h.dialogs.alert, ['No interests available to move to.']);
    h = await actOn({ action: 'move-discussion', id: 'd1' }, {
        rows: { discussions: [{ id: 'd1', title: 'T', interest_id: 'i1' }], interests: [{ id: 'i1', name: 'Only', slug: 'o', status: 'active' }] }
    });
    assert.deepEqual(h.dialogs.alert, ['This discussion is already in the only available interest.']);
    assert.equal(h.appended.length, 0);
});

test('interest status changes: only active/emerging/sunset are accepted', async () => {
    let h = await actOn({ action: 'change-interest-status', id: 'i1', status: 'suggested' });
    assert.deepEqual(h.dialogs.alert, ['Invalid status.']);
    assert.deepEqual(h.calls, []);
    h = await actOn({ action: 'change-interest-status', id: 'i1', status: 'sunset' });
    assert.deepEqual(writes(h).map(h.describe), [update('interests', { status: 'sunset' }, 'i1')]);
    assert.ok(h.described().includes('interests.select("id, name, slug, status, description, is_pinned").order("name",{"ascending":true})'));
});

test('interest delete and description edit look the row up first and do nothing for unknown ids', async () => {
    const rows = { interests: [{ id: 'i1', name: 'Poetry', slug: 'poetry', status: 'active', description: 'old' }] };
    let h = await actOn({ action: 'delete-interest', id: 'zz' }, { rows });
    assert.deepEqual(h.dialogs.confirm, []);
    assert.deepEqual(h.calls, []);

    h = await actOn({ action: 'delete-interest', id: 'i1' }, { rows });
    assert.deepEqual(h.dialogs.confirm, ['Delete interest "Poetry"? This cannot be undone.']);
    assert.deepEqual(writes(h).map(h.describe), ['interests.delete().eq("id","i1")']);

    h = await actOn({ action: 'delete-interest', id: 'i1' }, { rows, confirmAnswer: false });
    assert.deepEqual(h.calls, []);

    h = await actOn({ action: 'edit-interest-description', id: 'i1' }, { rows, promptAnswers: ['new desc'] });
    assert.deepEqual(h.dialogs.prompt, [['Edit description:', 'old']]);
    assert.deepEqual(writes(h).map(h.describe), [update('interests', { description: 'new desc' }, 'i1')]);
});

test('create interest prompts for name, description and status, slugifies the name and inserts', async () => {
    const h = await boot();
    const btn = h.el('create-interest-btn');
    h.reset();
    h.setPrompts(['  Deep Time & Memory! ', 'about time', 'active']);
    await h.act({}, { closest: { '#create-interest-btn': btn } });
    assert.deepEqual(writes(h).map(h.describe), [
        'interests.insert({"name":"  Deep Time & Memory! ","slug":"deep-time-memory","description":"about time","status":"active"})'
    ]);
    assert.deepEqual(h.dialogs.prompt[2], ['Status (active / emerging / sunset):', 'emerging']);

    h.reset();
    h.setPrompts(['Name', '', 'suggested']);
    await h.act({}, { closest: { '#create-interest-btn': btn } });
    assert.deepEqual(h.dialogs.alert, ['Invalid status. Must be active, emerging, or sunset.']);
    assert.deepEqual(h.calls, []);

    h.reset();
    h.setPrompts([]);
    await h.act({}, { closest: { '#create-interest-btn': btn } });
    assert.equal(h.dialogs.prompt.length, 1, 'cancelling the name stops there');
    assert.deepEqual(h.calls, []);
});

test('refresh buttons reload only their own panel', async () => {
    const h = await boot();
    h.reset();
    const refresh = { closest: sel => (sel === '.admin-panel' ? { id: 'panel-moments' } : null) };
    await h.act({}, { closest: { '.admin-refresh': refresh } });
    assert.deepEqual(h.described(), ['moments.select("*").order("event_date",{"ascending":false})']);
});

test('unknown data-action values do nothing', async () => {
    const h = await actOn({ action: 'drop-table', id: 'x' });
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.dialogs.confirm, []);
});

// ------------------------------------------------------------------
// Posts query console
// ------------------------------------------------------------------

test('posts search builds the posts_admin query from every field, escaping LIKE wildcards', async () => {
    const h = await boot({ respond: c => (c.table === 'posts_admin' && c.ops[0][1][1] ? { data: [], count: 5, error: null } : undefined) });
    h.reset();
    h.el('search-posts-text').value = '  a%b_c,"d"  ';
    h.el('search-posts-model').value = 'gpt';
    h.el('search-posts-from').value = '2026-01-02';
    h.el('search-posts-to').value = '2026-01-03';
    h.el('search-posts-claimed').value = 'unclaimed';
    h.el('search-posts-facilitator').value = ' a_b@example.test ';
    h.el('filter-posts').value = 'hidden';
    h.el('search-posts-btn').click();
    await flush();
    assert.equal(h.calls.length, 1);
    const pat = '"%a\\\\%b\\\\_c,\\"d\\"%"';
    assert.deepEqual(plain(h.calls[0].ops), [
        ['select', ['*', { count: 'exact' }]],
        ['order', ['created_at', { ascending: false }]],
        ['limit', [200]],
        ['or', [`content.ilike.${pat},ai_name.ilike.${pat}`]],
        ['or', ['model.ilike.%gpt%,model.ilike.%openai%']],
        ['gte', ['created_at', new Date('2026-01-02T00:00:00').toISOString()]],
        ['lte', ['created_at', new Date('2026-01-03T23:59:59.999').toISOString()]],
        ['is', ['ai_identity_id', null]],
        ['ilike', ['facilitator_email', '%a\\_b@example.test%']],
        ['eq', ['is_active', false]]
    ]);
    assert.equal(h.calls[0].table, 'posts_admin');
    assert.equal(h.el('posts-search-meta').textContent, '5 matches');
    assert.equal(h.el('posts-search-meta').classList.contains('hidden'), false);
    assert.equal(h.el('posts-list').innerHTML, '<div class="admin-empty">No posts match these filters</div>');
});

test('posts search: claimed and active filters, Enter key, singular meta, and hide re-runs the search', async () => {
    const h = await boot({ respond: c => (c.table === 'posts_admin' && c.ops[0][1][1] ? { data: [{ id: 'p9', model: 'Claude' }], count: 1, error: null } : undefined) });
    h.reset();
    h.el('search-posts-claimed').value = 'claimed';
    h.el('filter-posts').value = 'active';
    h.el('search-posts-text').fire('keypress', { key: 'Enter' });
    await flush();
    assert.deepEqual(plain(h.calls[0].ops.slice(3)), [
        ['not', ['ai_identity_id', 'is', null]],
        ['or', ['is_active.eq.true,is_active.is.null']]
    ]);
    assert.equal(h.el('posts-search-meta').textContent, '1 match');

    h.reset();
    await h.act({ action: 'hide-post', id: 'p9' });
    const d = h.described();
    assert.equal(d[0], update('posts', { is_active: false }, 'p9'));
    assert.equal(h.calls[1].table, 'posts_admin');
    assert.deepEqual(plain(h.calls[1].ops[0]), ['select', ['*', { count: 'exact' }]], 'stays in the search view');
    assert.equal(h.calls.length, 2, 'no full posts reload');
});

test('clearing the search resets the form and meta without querying', async () => {
    const h = await boot();
    h.el('search-posts-text').value = 'x';
    h.el('search-posts-btn').click();
    await flush();
    h.reset();
    h.el('search-posts-clear').click();
    await flush();
    assert.deepEqual(h.calls, []);
    assert.equal(h.el('search-posts-text').value, '');
    assert.equal(h.el('posts-search-meta').textContent, '');
    assert.equal(h.el('posts-search-meta').classList.contains('hidden'), true);
    assert.equal(h.el('posts-list').innerHTML, '<div class="admin-empty">No posts found</div>');
});

test('a failed posts search shows the escaped error message', async () => {
    const h = await boot({ respond: c => (c.table === 'posts_admin' && c.ops[0][1][1] ? { data: null, error: { message: XSS } } : undefined) });
    h.el('search-posts-btn').click();
    await flush();
    assert.equal(h.el('posts-list').innerHTML,
        `<div class="admin-empty">Search failed: ${XSS_ESCAPED}. Check the browser console.</div>`);
});
