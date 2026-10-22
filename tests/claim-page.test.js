// claim.html: the claim request form is the whole page and works in every
// state (sweep F06), signup does not call the broken claim_posts_by_email
// auto-claim (F06), and nothing in the site calls the five email-matched
// legacy-post RPCs that sql/patches/legacy-email-paths-off.sql revokes (F03).
// Loads js/claim.js and js/auth.js in a vm with fakes; no network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const claimSource = read('js/claim.js');
const authSource = read('js/auth.js');
const discussionSource = read('js/discussion.js');
const claimHtml = read('claim.html');

// Revoked by sql/patches/legacy-email-paths-off.sql (sweep F03): each decides
// ownership of a legacy post by the session's email, which signup never
// confirms.
const LEGACY_EMAIL_RPCS = ['edit_my_legacy_post', 'delete_my_legacy_post', 'get_my_legacy_post_ids',
    'get_my_claimable_posts', 'claim_my_posts'];

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

function harness({ user = { id: 'fac-1', email: 'new.person@example.com' } } = {}) {
    const els = {};
    ['claim-logged-out', 'claim-logged-in', 'claim-message', 'claim-form', 'ai-names', 'facilitator-email',
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
            getMyIdentities: async () => [],
            getClient: () => ({
                rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: null, error: null }; },
                from: () => { throw new Error('claim.js read a table directly'); }
            })
        },
        fetch: async (url, init) => { fetches.push({ url, init }); return { ok: true }; },
        console: { log() {}, warn() {}, error() {} },
        Promise, Array, Set, Object, String, JSON, Error, setTimeout, clearTimeout
    };
    vm.runInNewContext(claimSource, sandbox, { filename: 'js/claim.js' });

    const fire = isLoggedIn => (windowListeners.authStateChanged || [])
        .forEach(fn => fn({ detail: { isLoggedIn } }));

    return {
        els, fetches, rpcCalls,
        async login() { fire(true); await flush(); },
        async logout() { fire(false); await flush(); },
        async submitManual() {
            let prevented = false;
            for (const fn of els['claim-form'].listeners.submit || []) {
                await fn({ preventDefault() { prevented = true; } });
            }
            return prevented;
        }
    };
}

async function assertManualFormWorks(h, label, accountEmail) {
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
    assert.ok(body.message.includes('Account email: ' + accountEmail), label + ': names the account to move posts to');
    assert.equal(h.els['claim-message'].className, 'alert alert--success', label + ': success message shown');
    assert.match(h.els['claim-message'].textContent, /admin/i, label + ': says a person handles it');
}

test('the claim form is wired at page load, before any auth event', () => {
    const h = harness();
    assert.equal((h.els['claim-form'].listeners.submit || []).length, 1);
});

test('logging in shows the form and hides the login prompt; logging out reverses it', async () => {
    const h = harness();
    await h.login();
    assert.equal(h.els['claim-logged-in'].style.display, 'block');
    assert.equal(h.els['claim-logged-out'].style.display, 'none');
    await h.logout();
    assert.equal(h.els['claim-logged-in'].style.display, 'none');
    assert.equal(h.els['claim-logged-out'].style.display, 'block');
});

test('the claim form sends one request naming the signed-in account', async () => {
    const h = harness();
    await h.login();
    await assertManualFormWorks(h, 'signed in', 'new.person@example.com');
});

test('the claim form still sends when the session has no email', async () => {
    const h = harness({ user: { id: 'fac-1' } });
    await h.login();
    await assertManualFormWorks(h, 'no email', 'unknown');
});

test('repeated auth events never double-bind the form', async () => {
    const h = harness();
    await h.login();
    await h.login(); // Auth.updateUI fires authStateChanged more than once per page load
    assert.equal((h.els['claim-form'].listeners.submit || []).length, 1, 'one submit listener');
    await assertManualFormWorks(h, 'after two auth events', 'new.person@example.com');
});

test('claim.js makes no RPC call: there is no automatic email match any more', async () => {
    const h = harness();
    await h.login();
    await h.submitManual();
    assert.deepEqual(h.rpcCalls, []);
});

test('claim.html posts the form instead of putting the typed email in the URL', () => {
    assert.match(claimHtml, /<form id="claim-form"[^>]*\bmethod="post"/);
});

test('claim.html leads with the request form and says a person moves the posts', () => {
    for (const id of ['claim-self-service', 'claim-no-matches', 'claim-loading', 'claim-identity-select',
        'claim-post-list', 'claim-select-all', 'claim-submit', 'claim-match-summary']) {
        assert.ok(!claimHtml.includes(`id="${id}"`), `the self-serve element #${id} is gone`);
    }
    assert.ok(!/automatically find|auto-match/i.test(claimHtml), 'no copy promises an automatic match');

    const loggedIn = claimHtml.indexOf('id="claim-logged-in"');
    const form = claimHtml.indexOf('id="claim-form"');
    assert.ok(loggedIn > 0 && form > loggedIn, 'the form sits in the signed-in view');
    const between = claimHtml.slice(loggedIn, form);
    assert.equal((between.match(/<section\b/g) || []).length, 1, 'the form is in the first section of the signed-in view');
    const sentence = 'An admin reviews each request and moves the posts to your account by hand.';
    assert.ok(between.includes(sentence), 'the signed-in view says it above the form');
    assert.ok(claimHtml.slice(0, loggedIn).includes(sentence), 'the signed-out view says it too');
});

test('signup no longer calls claim_posts_by_email', async () => {
    assert.ok(!/rpc\(\s*['"]claim_posts_by_email/.test(authSource), 'auth.js does not call the broken RPC');
    assert.ok(!/claimOldPosts/.test(authSource), 'the helper is gone, not just unused');

    const rpcCalls = [];
    const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout };
    vm.runInNewContext(authSource, sandbox, { filename: 'js/auth.js' });
    const auth = sandbox.window.Auth;
    const row = { id: 'fac-1', email: 'new.person@example.com', display_name: null };
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

test('none of the five email-matched legacy RPCs is called by claim.js, auth.js or discussion.js', () => {
    const sources = { 'js/claim.js': claimSource, 'js/auth.js': authSource, 'js/discussion.js': discussionSource };
    for (const [file, source] of Object.entries(sources)) {
        for (const name of LEGACY_EMAIL_RPCS) {
            assert.ok(!new RegExp(`['"\`]${name}['"\`]`).test(source), `${file} names ${name} as a string`);
            assert.ok(!new RegExp(`rpc\\(\\s*['"\`]?${name}`).test(source), `${file} calls ${name}`);
        }
    }
});

function loadAuth(rowsForOwner) {
    const rpcCalls = [];
    const updates = [];
    const sandbox = {
        window: {}, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
        Utils: { SAFE_POST_COLUMNS: 'id,content,facilitator_id' }
    };
    vm.runInNewContext(authSource, sandbox, { filename: 'js/auth.js' });
    const auth = sandbox.window.Auth;
    auth.user = { id: 'fac-1', email: 'old.contributor@example.com' };
    auth.getClient = () => ({
        from: table => {
            const call = { table, filters: [] };
            updates.push(call);
            return {
                update(values) { call.values = values; return this; },
                eq(column, value) { call.filters.push([column, value]); return this; },
                select: async () => ({ data: rowsForOwner, error: null })
            };
        },
        rpc: async name => { rpcCalls.push(name); return { data: [{ id: 'p1' }], error: null }; }
    });
    return { auth, rpcCalls, updates };
}

test('editing or deleting a post the session does not own by facilitator_id fails with the claim route', async () => {
    for (const action of ['updatePost', 'deletePost']) {
        const { auth, rpcCalls, updates } = loadAuth([]);
        const args = action === 'updatePost' ? ['p1', { content: 'new words' }] : ['p1'];
        await assert.rejects(() => auth[action](...args), err => {
            assert.match(err.message, /claim\.html/, `${action}: names claim.html`);
            assert.match(err.message, /email/i, `${action}: says it is about email-only posts`);
            return true;
        });
        assert.deepEqual(rpcCalls, [], `${action}: no email-matched fallback RPC`);
        assert.equal(updates.length, 1, `${action}: one owner-scoped update, nothing else`);
        assert.deepEqual(updates[0].filters, [['id', 'p1'], ['facilitator_id', 'fac-1']], `${action}: scoped by facilitator_id`);
    }
});

test('editing or deleting your own post still works through the owner path', async () => {
    const edited = loadAuth([{ id: 'p1', content: 'new words', facilitator_id: 'fac-1' }]);
    const row = await edited.auth.updatePost('p1', { content: 'new words' });
    assert.equal(row.id, 'p1');
    assert.deepEqual(edited.rpcCalls, []);

    const deleted = loadAuth([{ id: 'p1', is_active: false }]);
    const gone = await deleted.auth.deletePost('p1');
    assert.equal(gone.is_active, false);
    assert.deepEqual({ ...deleted.updates[0].values }, { is_active: false }); // spread: the object comes from the vm realm
    assert.deepEqual(deleted.rpcCalls, []);
});

test('discussion.js offers edit/delete only on posts the session owns by facilitator_id', () => {
    assert.ok(!/myLegacyPostIds/.test(discussionSource), 'the legacy-id set is gone');
    const owner = discussionSource.match(/const isOwner = ([\s\S]*?);/);
    assert.ok(owner, 'isOwner is still computed');
    assert.match(owner[1], /post\.facilitator_id/);
    assert.ok(!/\|\|/.test(owner[1]), 'no second way to count as the owner');
});

test('the dry run carries the patch body verbatim between BEGIN and its DRYRUN block, then rolls back', () => {
    const lf = s => s.replace(/\r\n/g, '\n');
    const patch = lf(read('sql/patches/legacy-email-paths-off.sql'));
    const dryrun = lf(read('sql/patches/legacy-email-paths-off.dryrun.sql'));
    assert.match(patch, /^-- Applied: (PENDING|\d{4}-\d{2}-\d{2}\b.*)$/m);
    assert.ok(!/\bDROP\b/.test(patch.replace(/^--.*$/gm, '')), 'the patch drops nothing');
    for (const name of LEGACY_EMAIL_RPCS) assert.ok(patch.includes(`'${name}'`), `the patch covers ${name}`);
    const body = patch.slice(patch.indexOf('DO $revoke$'));
    const begin = dryrun.indexOf('\nBEGIN;\n');
    const check = dryrun.indexOf('DO $dryrun$');
    assert.ok(begin > 0 && check > begin, 'BEGIN comes before the DRYRUN block');
    assert.ok(dryrun.slice(begin, check).includes(body), 'the patch body is in the dry run verbatim');
    assert.match(dryrun, /RAISE EXCEPTION 'DRYRUN PASS /);
    assert.match(dryrun, /RAISE EXCEPTION 'DRYRUN FAIL /);
    assert.match(dryrun, /\nROLLBACK;\n?$/);
});

// The day the email-matched paths closed is the day the revoke is applied and
// the site change pushed, not the day Meredith decided (2026-10-18). Every
// place that names it must agree with the changelog entry, and once the patch
// records an Applied: date, the entry must carry that date.
test('every F03 "closed on" date names one day, and it is the apply day once recorded', () => {
    const patch = read('sql/patches/legacy-email-paths-off.sql');
    const entry = read('changes.html').match(
        /<h3>Your oldest posts move by request, not by email<\/h3>\s*<p class="change-date">(\d{4}-\d{2}-\d{2})<\/p>/);
    assert.ok(entry, 'changes.html has the F03 entry with a plain date');
    const closed = entry[1];
    assert.notEqual(closed, '2026-10-18', 'dated the day it went live, not the day it was decided');
    const applied = patch.match(/^-- Applied: (\d{4}-\d{2}-\d{2})\b/m);
    if (applied) assert.equal(closed, applied[1], 'changes.html is dated the day the revoke was applied');
    const places = [
        ['docs/sops/POST_CLAIMS_SOP.md', /Until (\d{4}-\d{2}-\d{2}) claim\.html had a self-serve path/],
        ['docs/sops/POST_CLAIMS_SOP.md', /\| (\d{4}-\d{2}-\d{2}) \| 2\.1 \|/],
        ['docs/agents/KNOWN_TECH_DEBT.md', /\*\*Done in the change shipped (\d{4}-\d{2}-\d{2})/],
        ['sql/patches/claim_my_posts_rpc.sql', /OFF since (\d{4}-\d{2}-\d{2}) \(sweep F03/],
        ['js/auth.js', /turned off on\s+\/\/ (\d{4}-\d{2}-\d{2}) \(sweep F03\)/],
        ['js/auth.js', /Turned off (\d{4}-\d{2}-\d{2})\s+\/\/ \(sweep F03/],
        ['js/claim.js', /Until (\d{4}-\d{2}-\d{2}) this page also listed/],
        ['js/discussion.js', /turned off (\d{4}-\d{2}-\d{2}) \(F03\)/]
    ];
    for (const [file, re] of places) {
        const m = read(file).match(re);
        assert.ok(m, `${file} still says when the path closed (${re})`);
        assert.equal(m[1], closed, `${file} names the same day as changes.html`);
    }
    // The COMMENT stored in the database takes its revoke date from the day the
    // patch runs, so no hard-coded date can be ahead of the apply.
    assert.match(patch, /'Decided 2026-10-18, revoked '\s*\|\|\s*to_char\(now\(\) AT TIME ZONE 'UTC', 'YYYY-MM-DD'\)/);
    assert.ok(!/OFF since \d{4}-\d{2}-\d{2}/.test(patch), 'no fixed "OFF since" date in the patch');
});
