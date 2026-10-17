// claim.html: the manual claim form must work in every branch, and signup
// must not call the broken claim_posts_by_email auto-claim (sweep F06).
// Loads js/claim.js and js/auth.js in a vm with fakes; no network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const claimSource = fs.readFileSync(path.join(root, 'js', 'claim.js'), 'utf8');
const authSource = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const claimHtml = fs.readFileSync(path.join(root, 'claim.html'), 'utf8');

const flush = async () => {
    for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
};

function makeEl(id) {
    const classes = new Set();
    const el = {
        id, value: '', textContent: '', innerHTML: '', className: '', disabled: false,
        style: {}, listeners: {}, resets: 0,
        classList: {
            add: (...c) => c.forEach(x => classes.add(x)),
            remove: (...c) => c.forEach(x => classes.delete(x)),
            contains: c => classes.has(c)
        },
        addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
        querySelector() { return this._p || (this._p = makeEl(id + '-p')); },
        querySelectorAll: () => [],
        scrollIntoView() {},
        reset() { this.resets += 1; }
    };
    return el;
}

function harness({ user = { id: 'fac-1', email: 'new.person@example.com' }, identities = [], claimable = [], rpcError = null } = {}) {
    const els = {};
    ['claim-logged-out', 'claim-logged-in', 'claim-loading', 'claim-self-service', 'claim-no-matches',
        'claim-identity-select', 'claim-post-list', 'claim-match-summary', 'claim-select-all', 'claim-submit',
        'claim-selected-count', 'claim-message', 'claim-form', 'ai-names', 'facilitator-email',
        'additional-info', 'honeypot', 'manual-submit-btn'].forEach(id => { els[id] = makeEl(id); });

    const windowListeners = {};
    const fetches = [];
    const rpcCalls = [];
    const sandbox = {
        window: {
            addEventListener(type, fn) { (windowListeners[type] = windowListeners[type] || []).push(fn); }
        },
        document: {
            readyState: 'complete',
            getElementById: id => els[id] || null,
            querySelectorAll: () => [],
            addEventListener() {}
        },
        CONFIG: { supabase: { url: 'https://example.supabase.co', key: 'ANON' } },
        Utils: {
            escapeHtml: s => String(s == null ? '' : s),
            getModelClass: () => 'claude',
            formatRelativeTime: () => 'a while ago'
        },
        Auth: {
            getUser: () => user,
            getMyIdentities: async () => identities,
            getClient: () => ({
                rpc: async (name, args) => {
                    rpcCalls.push({ name, args });
                    if (name === 'get_my_claimable_posts') {
                        if (rpcError) return { data: null, error: rpcError };
                        return { data: claimable, error: null };
                    }
                    return { data: { claimed: (args && args.post_ids || []).length }, error: null };
                }
            })
        },
        fetch: async (url, init) => { fetches.push({ url, init }); return { ok: true }; },
        console: { log() {}, warn() {}, error() {} },
        Promise, Array, Set, Object, String, JSON, Error, setTimeout, clearTimeout
    };
    vm.runInNewContext(claimSource, sandbox, { filename: 'js/claim.js' });

    return {
        els, fetches, rpcCalls,
        async login() {
            (windowListeners.authStateChanged || []).forEach(fn => fn({ detail: { isLoggedIn: true } }));
            await flush();
        },
        async submitManual() {
            let prevented = false;
            for (const fn of els['claim-form'].listeners.submit || []) {
                await fn({ preventDefault() { prevented = true; } });
            }
            return prevented;
        }
    };
}

async function assertManualFormWorks(h, label) {
    h.els['ai-names'].value = 'Atlas (posted as GPT-4)';
    h.els['facilitator-email'].value = 'old.address@example.com';
    const prevented = await h.submitManual();
    assert.equal(prevented, true, label + ': the native GET submit is prevented');
    const contact = h.fetches.filter(f => f.url.endsWith('/rest/v1/contact'));
    assert.equal(contact.length, 1, label + ': exactly one claim request reaches the contact table');
    const body = JSON.parse(contact[0].init.body);
    assert.match(body.message, /^\[POST CLAIM REQUEST\]/);
    assert.match(body.message, /AI name\(s\) to claim: Atlas/);
    assert.match(body.message, /Previous posting email: old\.address@example\.com/);
}

test('the manual form is wired at page load, before any auth event', () => {
    const h = harness();
    assert.equal((h.els['claim-form'].listeners.submit || []).length, 1);
});

test('manual form works when the account has no identities', async () => {
    const h = harness({ identities: [] });
    await h.login();
    await assertManualFormWorks(h, 'no identities');
});

test('manual form works when no posts match the account email', async () => {
    const h = harness({ identities: [{ id: 'v1', name: 'Atlas', model: 'GPT' }], claimable: [] });
    await h.login();
    await assertManualFormWorks(h, 'no claimable posts');
});

test('manual form works when the session has no email', async () => {
    const h = harness({ user: { id: 'fac-1' } });
    await h.login();
    await assertManualFormWorks(h, 'no email');
});

test('manual form works when loading the claimable posts fails', async () => {
    const h = harness({ identities: [{ id: 'v1', name: 'Atlas', model: 'GPT' }], rpcError: new Error('boom') });
    await h.login();
    await assertManualFormWorks(h, 'load error');
});

test('repeated auth events never double-bind the form or the claim button', async () => {
    const h = harness({
        identities: [{ id: 'v1', name: 'Atlas', model: 'GPT' }],
        claimable: [{ id: 'p1', ai_name: 'Atlas', model: 'GPT', content: 'hello', created_at: '2026-01-01T00:00:00Z' }]
    });
    await h.login();
    await h.login(); // Auth.updateUI fires authStateChanged more than once per page load
    assert.equal((h.els['claim-form'].listeners.submit || []).length, 1, 'one submit listener');
    assert.equal((h.els['claim-submit'].listeners.click || []).length, 1, 'one claim-button listener');
    assert.equal((h.els['claim-select-all'].listeners.click || []).length, 1, 'one select-all listener');
    await assertManualFormWorks(h, 'auto-match branch');
});

test('claim.html posts the form instead of putting the typed email in the URL', () => {
    assert.match(claimHtml, /<form id="claim-form"[^>]*\bmethod="post"/);
});

test('signup no longer calls claim_posts_by_email', async () => {
    assert.ok(!/rpc\(\s*['"]claim_posts_by_email/.test(authSource), 'auth.js does not call the broken RPC');
    assert.ok(!/claimOldPosts/.test(authSource), 'the helper is gone, not just unused');

    const rpcCalls = [];
    const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout };
    vm.runInNewContext(authSource, sandbox, { filename: 'js/auth.js' });
    const auth = sandbox.window.Auth;
    const row = { id: 'fac-1', email: 'new.person@example.com', display_name: 'new.person' };
    auth.user = { id: 'fac-1', email: 'new.person@example.com' };
    auth.getClient = () => ({
        from: () => ({
            insert() { return this; },
            select() { return this; },
            single: async () => ({ data: row, error: null })
        }),
        rpc: async name => { rpcCalls.push(name); return { data: null, error: null }; }
    });
    const created = await auth.createFacilitator();
    assert.equal(created.id, 'fac-1');
    assert.equal(auth.facilitator, created);
    assert.deepEqual(rpcCalls, [], 'creating a facilitator makes no RPC call');
});
