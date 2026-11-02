// Characterization tests for js/auth.js.
//
// These pin the CURRENT observable behavior of the Auth object so that a later
// split of auth.js into smaller files can be checked against it: the public
// surface, the exact Supabase calls each data method sends (tables, columns,
// filters, payloads, RPC names), how results and errors are mapped, and the
// header UI updates. Everything runs in a vm sandbox with a fake Supabase
// client that records calls. No network.
//
// When a pinned behavior looks off, the test says so in a one-line comment;
// it is still pinned as is, since changing it is a separate decision.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FakeElement } = require('./lib/fake-dom');

const AUTH_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
const SAFE_POST_COLUMNS_SENTINEL = 'id,content,SENTINEL_SAFE_POST_COLUMNS';
const USER = { id: 'user-1', email: 'a@example.test' };

// Objects created inside the vm have another realm's prototypes, which strict
// deepEqual rejects. Round-trip through JSON to compare plain data.
const plain = value => JSON.parse(JSON.stringify(value));

// A chainable fake Supabase client. Every from()/rpc() call becomes an entry
// { table | rpc, args, chain: [[method, ...args], ...] }. Awaiting a builder
// resolves to responder(entry, index).
function fakeClient(responder = () => ({ data: null, error: null })) {
    const calls = [];
    const authCalls = [];
    let authHandler = null;
    const authResults = {};

    function builder(entry) {
        const b = {};
        for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'order', 'range', 'single', 'maybeSingle']) {
            b[m] = (...args) => { entry.chain.push([m, ...args]); return b; };
        }
        b.then = (resolve, reject) => {
            const index = calls.indexOf(entry);
            return Promise.resolve().then(() => responder(entry, index)).then(resolve, reject);
        };
        return b;
    }

    const authMethod = name => (...args) => {
        authCalls.push([name, ...args]);
        const r = authResults[name];
        return Promise.resolve(typeof r === 'function' ? r(...args) : (r || { data: {}, error: null }));
    };

    return {
        calls,
        authCalls,
        authResults,
        getAuthHandler: () => authHandler,
        from(table) {
            const entry = { table, chain: [] };
            calls.push(entry);
            return builder(entry);
        },
        rpc(name, args) {
            const entry = { rpc: name, args, chain: [] };
            calls.push(entry);
            return builder(entry);
        },
        auth: {
            getSession: authMethod('getSession'),
            signInWithOtp: authMethod('signInWithOtp'),
            resetPasswordForEmail: authMethod('resetPasswordForEmail'),
            updateUser: authMethod('updateUser'),
            signInWithPassword: authMethod('signInWithPassword'),
            signUp: authMethod('signUp'),
            signOut: authMethod('signOut'),
            onAuthStateChange(handler) {
                authCalls.push(['onAuthStateChange']);
                authHandler = handler;
                return { data: { subscription: { unsubscribe() {} } } };
            }
        }
    };
}

function fakeStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        store,
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => { store.set(key, String(value)); },
        removeItem: key => { store.delete(key); }
    };
}

// Load a fresh Auth into its own sandbox.
// options.client: fake client (getClient is stubbed to return it unless keepGetClient)
// options.elements: { id: FakeElement } for document.getElementById
// options.user: preset Auth.user
function loadAuth(options = {}) {
    const client = options.client || fakeClient();
    const elements = options.elements || {};
    const dispatched = [];
    const timers = [];
    const storage = options.localStorage || fakeStorage();
    const sandbox = {
        window: {
            location: options.location || { origin: 'https://example.test', pathname: '/sub/login.html' },
            dispatchEvent: event => { dispatched.push(event); return true; }
        },
        document: { getElementById: key => elements[key] || null },
        CustomEvent: function CustomEvent(type, init) {
            this.type = type;
            this.detail = init ? init.detail : undefined;
        },
        localStorage: storage,
        Utils: { SAFE_POST_COLUMNS: SAFE_POST_COLUMNS_SENTINEL },
        CONFIG: { supabase: { url: 'https://fake.example.test', key: 'fake-anon-key' } },
        supabase: options.supabase,
        console: { log() {}, warn() {}, error() {} },
        // Timers are recorded, never run on their own; tests run them explicitly.
        setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
        clearTimeout() {}
    };
    vm.runInNewContext(AUTH_SOURCE, sandbox, { filename: 'js/auth.js' });
    const auth = sandbox.window.Auth;
    if (!options.keepGetClient) auth.getClient = () => client;
    if (options.user !== undefined) auth.user = options.user;
    return { auth, client, sandbox, dispatched, timers, storage, elements };
}

function headerElements() {
    return {
        'auth-login-link': new FakeElement('auth-login-link'),
        'auth-user-menu': new FakeElement('auth-user-menu'),
        'notification-bell': new FakeElement('notification-bell'),
        'notification-badge': new FakeElement('notification-badge')
    };
}

// Errors thrown inside the vm come from another realm, so match on .message.
const NOT_LOGGED_IN = e => e.message === 'Not logged in';

// ------------------------------------------------------------------
// Public surface
// ------------------------------------------------------------------

test('Auth exposes exactly this set of own keys (methods and state)', () => {
    const { auth, sandbox } = loadAuth({ keepGetClient: true });
    assert.deepEqual(Object.keys(auth).sort(), [
        'NOT_LINKED_POST_ERROR', 'PUBLIC_NAME_FALLBACK', 'PUBLIC_NAME_MAX_LENGTH',
        '_activeIdentityId', '_authResolved', '_cachedIdentities',
        'addDiscussionReaction', 'addReaction', 'checkPublicName', 'createFacilitator',
        'createIdentity', 'deleteAccount', 'deleteMarginalia', 'deletePost', 'deletePostcard',
        'facilitator', 'getActiveIdentity', 'getAllIdentities', 'getCachedIdentities',
        'getClient', 'getFacilitator', 'getIdentity', 'getMyIdentities', 'getMySubscriptions',
        'getNotifications', 'getUnreadCount', 'getUser', 'hasPublicName', 'init', 'initialized',
        'isLoggedIn', 'isSubscribed', 'loadActiveIdentity', 'loadFacilitator', 'markAllAsRead',
        'markAsRead', 'publicNameNudge', 'publicNameOf', 'removeDiscussionReaction',
        'removeReaction', 'sendMagicLink', 'sendPasswordReset', 'setActiveIdentity',
        'setUiPending', 'signInWithPassword', 'signOut', 'signUpWithPassword', 'subscribe',
        'unsubscribe', 'updateFacilitator', 'updateIdentity', 'updateMarginalia',
        'updateNotificationBadge', 'updatePassword', 'updatePost', 'updatePostcard',
        'updateUI', 'user'
    ]);
    assert.equal(sandbox.window.Auth, auth, 'window.Auth is the Auth object');
});

test('initial state and constants', () => {
    const { auth } = loadAuth({ keepGetClient: true });
    assert.equal(auth.user, null);
    assert.equal(auth.facilitator, null);
    assert.equal(auth.initialized, false);
    assert.equal(auth._authResolved, false);
    assert.equal(auth._cachedIdentities, null);
    assert.equal(auth._activeIdentityId, null);
    assert.equal(auth.PUBLIC_NAME_FALLBACK, 'A facilitator');
    assert.equal(auth.PUBLIC_NAME_MAX_LENGTH, 50);
    assert.equal(auth.NOT_LINKED_POST_ERROR,
        'This post is not linked to your account. Older posts saved with only an email are changed through a claim request on claim.html: an admin moves them to your account, and then you can edit or delete them here.');
    const methods = Object.keys(auth).filter(k => typeof auth[k] === 'function');
    assert.equal(methods.length, 49);
});

test('getClient creates one client from CONFIG and caches it on window._supabaseClient', () => {
    const created = [];
    const supabase = { createClient: (url, key) => { created.push([url, key]); return { marker: created.length }; } };
    const { auth, sandbox } = loadAuth({ keepGetClient: true, supabase });
    const first = auth.getClient();
    const second = auth.getClient();
    assert.equal(first, second);
    assert.equal(sandbox.window._supabaseClient, first);
    assert.deepEqual(created, [['https://fake.example.test', 'fake-anon-key']]);
});

test('getClient reuses a pre-existing window._supabaseClient', () => {
    const supabase = { createClient: () => { throw new Error('should not be called'); } };
    const { auth, sandbox } = loadAuth({ keepGetClient: true, supabase });
    const existing = { existing: true };
    sandbox.window._supabaseClient = existing;
    assert.equal(auth.getClient(), existing);
});

// ------------------------------------------------------------------
// Simple getters
// ------------------------------------------------------------------

test('isLoggedIn / getUser / getFacilitator reflect state', () => {
    const { auth } = loadAuth();
    assert.equal(auth.isLoggedIn(), false);
    assert.equal(auth.getUser(), null);
    assert.equal(auth.getFacilitator(), null);
    auth.user = USER;
    auth.facilitator = { id: 'user-1' };
    assert.equal(auth.isLoggedIn(), true);
    assert.equal(auth.getUser(), USER);
    assert.equal(auth.getFacilitator(), auth.facilitator);
});

// ------------------------------------------------------------------
// Auth operations (wrappers around client.auth)
// ------------------------------------------------------------------

test('sendMagicLink redirects to dashboard.html in the current directory', async () => {
    const { auth, client } = loadAuth();
    assert.equal(await auth.sendMagicLink('a@example.test'), true);
    assert.deepEqual(plain(client.authCalls), [['signInWithOtp', {
        email: 'a@example.test',
        options: { emailRedirectTo: 'https://example.test/sub/dashboard.html' }
    }]]);
});

test('sendMagicLink rethrows the client error', async () => {
    const { auth, client } = loadAuth();
    const err = new Error('otp failed');
    client.authResults.signInWithOtp = { error: err };
    await assert.rejects(() => auth.sendMagicLink('a@example.test'), e => e === err);
});

test('sendPasswordReset redirects to reset-password.html and rethrows errors', async () => {
    const { auth, client } = loadAuth({ location: { origin: 'https://example.test', pathname: '/' } });
    assert.equal(await auth.sendPasswordReset('a@example.test'), true);
    assert.deepEqual(plain(client.authCalls), [['resetPasswordForEmail', 'a@example.test',
        { redirectTo: 'https://example.test/reset-password.html' }]]);
    const err = new Error('reset failed');
    client.authResults.resetPasswordForEmail = { error: err };
    await assert.rejects(() => auth.sendPasswordReset('a@example.test'), e => e === err);
});

test('updatePassword sends { password } to updateUser and rethrows errors', async () => {
    const { auth, client } = loadAuth();
    assert.equal(await auth.updatePassword('new-pass'), true);
    assert.deepEqual(plain(client.authCalls), [['updateUser', { password: 'new-pass' }]]);
    const err = new Error('weak');
    client.authResults.updateUser = { error: err };
    await assert.rejects(() => auth.updatePassword('x'), e => e === err);
});

test('signInWithPassword sets user, loads facilitator, updates UI, returns data', async () => {
    const facilitatorRow = { id: 'user-1', display_name: 'Kit' };
    const client = fakeClient(() => ({ data: facilitatorRow, error: null }));
    const { auth, dispatched } = loadAuth({ client });
    const authData = { user: USER, session: { access_token: 't' } };
    client.authResults.signInWithPassword = { data: authData, error: null };
    const result = await auth.signInWithPassword('a@example.test', 'pw');
    assert.equal(result, authData);
    assert.deepEqual(plain(client.authCalls), [['signInWithPassword', { email: 'a@example.test', password: 'pw' }]]);
    assert.equal(auth.user, USER);
    assert.equal(auth.facilitator, facilitatorRow);
    assert.equal(client.calls[0].table, 'facilitators');
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].detail.isLoggedIn, true);
});

test('signInWithPassword throws the client error and leaves user unset', async () => {
    const { auth, client, dispatched } = loadAuth();
    const err = new Error('bad creds');
    client.authResults.signInWithPassword = { data: { user: null }, error: err };
    await assert.rejects(() => auth.signInWithPassword('a@example.test', 'pw'), e => e === err);
    assert.equal(auth.user, null);
    assert.equal(client.calls.length, 0);
    assert.equal(dispatched.length, 0);
});

test('signUpWithPassword signs in only when data.user is present', async () => {
    const client = fakeClient(() => ({ data: { id: 'user-1' }, error: null }));
    const a = loadAuth({ client });
    client.authResults.signUp = { data: { user: USER }, error: null };
    await a.auth.signUpWithPassword('a@example.test', 'pw');
    assert.deepEqual(plain(client.authCalls), [['signUp', { email: 'a@example.test', password: 'pw' }]]);
    assert.equal(a.auth.user, USER);
    assert.equal(a.dispatched.length, 1);

    const b = loadAuth();
    const pending = { user: null, session: null };
    b.client.authResults.signUp = { data: pending, error: null };
    assert.equal(await b.auth.signUpWithPassword('a@example.test', 'pw'), pending);
    assert.equal(b.auth.user, null);
    assert.equal(b.client.calls.length, 0, 'no facilitator load without a user');
    assert.equal(b.dispatched.length, 0, 'no UI update without a user');

    const c = loadAuth();
    const err = new Error('taken');
    c.client.authResults.signUp = { data: {}, error: err };
    await assert.rejects(() => c.auth.signUpWithPassword('a@example.test', 'pw'), e => e === err);
});

test('signOut clears user and facilitator and updates UI; on error state is kept', async () => {
    const { auth, client, dispatched } = loadAuth({ user: USER });
    auth.facilitator = { id: 'user-1' };
    client.authResults.signOut = { error: null };
    await auth.signOut();
    assert.deepEqual(plain(client.authCalls), [['signOut']]);
    assert.equal(auth.user, null);
    assert.equal(auth.facilitator, null);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].detail.isLoggedIn, false);

    const b = loadAuth({ user: USER });
    const err = new Error('net');
    b.client.authResults.signOut = { error: err };
    await assert.rejects(() => b.auth.signOut(), e => e === err);
    assert.equal(b.auth.user, USER);
});

test('deleteAccount calls rpc delete_account (no args), signs out, returns rpc data', async () => {
    const client = fakeClient(entry => (entry.rpc ? { data: { ok: true }, error: null } : { data: null, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    const result = await auth.deleteAccount();
    assert.deepEqual(plain(result), { ok: true });
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].rpc, 'delete_account');
    assert.equal(client.calls[0].args, undefined);
    assert.deepEqual(plain(client.authCalls), [['signOut']]);
    assert.equal(auth.user, null);
});

test('deleteAccount: not logged in throws; rpc error throws without signing out', async () => {
    const a = loadAuth();
    await assert.rejects(() => a.auth.deleteAccount(), NOT_LOGGED_IN);
    assert.equal(a.client.calls.length, 0);

    const err = { code: 'X', message: 'rpc failed' };
    const client = fakeClient(() => ({ data: null, error: err }));
    const b = loadAuth({ client, user: USER });
    await assert.rejects(() => b.auth.deleteAccount(), e => e === err);
    assert.deepEqual(client.authCalls, []);
    assert.equal(b.auth.user, USER);
});

// ------------------------------------------------------------------
// Facilitator profile
// ------------------------------------------------------------------

test('loadFacilitator returns null without touching the client when logged out', async () => {
    const { auth, client } = loadAuth();
    assert.equal(await auth.loadFacilitator(), null);
    assert.equal(client.calls.length, 0);
});

test('loadFacilitator reads facilitators by id with select(*) and maybeSingle', async () => {
    const row = { id: 'user-1', display_name: 'Kit' };
    const client = fakeClient(() => ({ data: row, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.loadFacilitator(), row);
    assert.equal(auth.facilitator, row);
    // Owner read of the caller's own row (authenticated, RLS-scoped), so select(*) here is not an anon read.
    assert.deepEqual(plain(client.calls), [{
        table: 'facilitators',
        chain: [['select', '*'], ['eq', 'id', 'user-1'], ['maybeSingle']]
    }]);
});

test('loadFacilitator returns null on a read error and does not create a row', async () => {
    const client = fakeClient(() => ({ data: null, error: { message: 'boom' } }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.loadFacilitator(), null);
    assert.equal(client.calls.length, 1);
    assert.equal(auth.facilitator, null);
});

test('loadFacilitator creates the row (id + email only, no display_name) when none exists', async () => {
    const created = { id: 'user-1', email: 'a@example.test', display_name: null };
    const client = fakeClient((entry, i) => (i === 0 ? { data: null, error: null } : { data: created, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.loadFacilitator(), created);
    assert.equal(auth.facilitator, created);
    assert.equal(client.calls.length, 2);
    assert.deepEqual(plain(client.calls[1]), {
        table: 'facilitators',
        chain: [['insert', { id: 'user-1', email: 'a@example.test' }], ['select'], ['single']]
    });
    assert.equal(client.calls.some(c => c.rpc), false, 'no claim-by-email RPC on signup');
});

test('createFacilitator on duplicate key (23505) re-fetches the existing row', async () => {
    const existing = { id: 'user-1', display_name: 'Kit' };
    const client = fakeClient((entry, i) => (i === 0
        ? { data: null, error: { code: '23505' } }
        : { data: existing, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.createFacilitator(), existing);
    assert.equal(auth.facilitator, existing);
    assert.deepEqual(plain(client.calls[1]), {
        table: 'facilitators',
        chain: [['select', '*'], ['eq', 'id', 'user-1'], ['maybeSingle']]
    });
});

test('createFacilitator returns null on other errors, or 23505 with nothing found', async () => {
    const a = loadAuth({ client: fakeClient(() => ({ data: null, error: { code: '42501' } })), user: USER });
    assert.equal(await a.auth.createFacilitator(), null);
    assert.equal(a.client.calls.length, 1);

    const b = loadAuth({ client: fakeClient((e, i) => (i === 0 ? { data: null, error: { code: '23505' } } : { data: null, error: null })), user: USER });
    assert.equal(await b.auth.createFacilitator(), null);
    assert.equal(b.client.calls.length, 2);

    const c = loadAuth();
    assert.equal(await c.auth.createFacilitator(), null);
    assert.equal(c.client.calls.length, 0);
});

test('updateFacilitator updates by id, stores and returns the row; throws on error or logged out', async () => {
    const row = { id: 'user-1', display_name: 'New' };
    const client = fakeClient(() => ({ data: row, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.updateFacilitator({ display_name: 'New' }), row);
    assert.equal(auth.facilitator, row);
    assert.deepEqual(plain(client.calls), [{
        table: 'facilitators',
        chain: [['update', { display_name: 'New' }], ['eq', 'id', 'user-1'], ['select'], ['single']]
    }]);

    const err = { message: 'denied' };
    const b = loadAuth({ client: fakeClient(() => ({ data: null, error: err })), user: USER });
    b.auth.facilitator = { id: 'old' };
    await assert.rejects(() => b.auth.updateFacilitator({}), e => e === err);
    assert.deepEqual(plain(b.auth.facilitator), { id: 'old' });

    await assert.rejects(() => loadAuth().auth.updateFacilitator({}), NOT_LOGGED_IN);
});

// ------------------------------------------------------------------
// Public name helpers (pure)
// ------------------------------------------------------------------

test('hasPublicName: only a non-blank string display_name counts', () => {
    const { auth } = loadAuth();
    assert.equal(auth.hasPublicName(null), false);
    assert.equal(auth.hasPublicName(undefined), false);
    assert.equal(auth.hasPublicName({}), false);
    assert.equal(auth.hasPublicName({ display_name: null }), false);
    assert.equal(auth.hasPublicName({ display_name: '   ' }), false);
    assert.equal(auth.hasPublicName({ display_name: 42 }), false);
    assert.equal(auth.hasPublicName({ display_name: 'x' }), true);
});

test('publicNameOf: null when not loaded, verbatim name when set, fallback otherwise', () => {
    const { auth } = loadAuth();
    assert.equal(auth.publicNameOf(null), null);
    assert.equal(auth.publicNameOf({ display_name: '  Kit  ' }), '  Kit  ', 'returned verbatim, not trimmed');
    assert.equal(auth.publicNameOf({ display_name: '' }), 'A facilitator');
    assert.equal(auth.publicNameOf({}), 'A facilitator');
});

test('publicNameNudge: unset, email-local match (case-insensitive, trimmed), or null', () => {
    const { auth } = loadAuth();
    assert.equal(auth.publicNameNudge(null, 'a@example.test'), null);
    assert.equal(auth.publicNameNudge({ display_name: '' }, 'a@example.test'), 'unset');
    assert.equal(auth.publicNameNudge({ display_name: ' Kit ' }, 'kit@example.test'), 'email');
    assert.equal(auth.publicNameNudge({ display_name: 'KIT' }, ' Kit@example.test'), 'email');
    assert.equal(auth.publicNameNudge({ display_name: 'Kit' }, 'other@example.test'), null);
    assert.equal(auth.publicNameNudge({ display_name: 'Kit' }, null), null);
    assert.equal(auth.publicNameNudge({ display_name: 'Kit' }, ''), null);
    assert.equal(auth.publicNameNudge({ display_name: 'kit' }, 'kit'), 'email', 'an email with no @ compares the whole string');
});

test('checkPublicName: trims, and rejects empty, too long, the fallback, and email-like names', () => {
    const { auth } = loadAuth();
    assert.deepEqual(plain(auth.checkPublicName('  Kit  ')), { name: 'Kit' });
    assert.deepEqual(plain(auth.checkPublicName(null)), { error: 'Type a name first.' });
    assert.deepEqual(plain(auth.checkPublicName(undefined)), { error: 'Type a name first.' });
    assert.deepEqual(plain(auth.checkPublicName('   ')), { error: 'Type a name first.' });
    assert.deepEqual(plain(auth.checkPublicName('x'.repeat(50))), { name: 'x'.repeat(50) });
    assert.deepEqual(plain(auth.checkPublicName('x'.repeat(51))), { error: 'Keep it to 50 characters or fewer.' });
    assert.deepEqual(plain(auth.checkPublicName('a FACILITATOR')),
        { error: '"A facilitator" is what the site shows when no name is set. Pick another.' });
    assert.deepEqual(plain(auth.checkPublicName('me a@example.test')),
        { error: 'That looks like an email address. Pick a name to show instead.' });
    assert.deepEqual(plain(auth.checkPublicName('@handle.name')), { name: '@handle.name' }, 'needs a character before the @');
    assert.deepEqual(plain(auth.checkPublicName('a@b')), { name: 'a@b' }, 'needs a dot after the domain part');
    assert.deepEqual(plain(auth.checkPublicName(123)), { name: '123' });
});

// ------------------------------------------------------------------
// Identities
// ------------------------------------------------------------------

test('getMyIdentities: default query filters active, orders by is_active then created_at desc', async () => {
    const rows = [{ id: 'v1' }];
    const client = fakeClient(() => ({ data: rows, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.getMyIdentities(), rows);
    assert.deepEqual(plain(client.calls), [{
        table: 'ai_identities',
        chain: [
            ['select', '*'],
            ['eq', 'facilitator_id', 'user-1'],
            ['eq', 'is_active', true],
            ['order', 'is_active', { ascending: false }],
            ['order', 'created_at', { ascending: false }]
        ]
    }]);
});

test('getMyIdentities: includeInactive drops the is_active filter; null data maps to []', async () => {
    const client = fakeClient(() => ({ data: null, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.deepEqual(Array.from(await auth.getMyIdentities({ includeInactive: true })), []);
    assert.deepEqual(plain(client.calls[0].chain), [
        ['select', '*'],
        ['eq', 'facilitator_id', 'user-1'],
        ['order', 'is_active', { ascending: false }],
        ['order', 'created_at', { ascending: false }]
    ]);
});

test('getMyIdentities: error and logged-out map to [] by default, throw with throwOnError', async () => {
    const err = new Error('q');
    const a = loadAuth({ client: fakeClient(() => ({ data: null, error: err })), user: USER });
    assert.deepEqual(Array.from(await a.auth.getMyIdentities()), []);
    await assert.rejects(() => a.auth.getMyIdentities({ throwOnError: true }), e => e === err);

    const b = loadAuth();
    assert.deepEqual(Array.from(await b.auth.getMyIdentities()), []);
    await assert.rejects(() => b.auth.getMyIdentities({ throwOnError: true }), e => e.message === 'Must be logged in to load identities');
    assert.equal(b.client.calls.length, 0);
});

test('createIdentity inserts mapped fields (modelVersion -> model_version) and returns the row', async () => {
    const row = { id: 'v9' };
    const client = fakeClient(() => ({ data: row, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.createIdentity({ name: 'N', model: 'Claude', modelVersion: '5', bio: 'b', extra: 'dropped' }), row);
    assert.deepEqual(plain(client.calls), [{
        table: 'ai_identities',
        chain: [['insert', { facilitator_id: 'user-1', name: 'N', model: 'Claude', model_version: '5', bio: 'b' }], ['select'], ['single']]
    }]);
    const err = { message: 'x' };
    const b = loadAuth({ client: fakeClient(() => ({ data: null, error: err })), user: USER });
    await assert.rejects(() => b.auth.createIdentity({ name: 'N' }), e => e === err);
    await assert.rejects(() => loadAuth().auth.createIdentity({ name: 'N' }), NOT_LOGGED_IN);
});

test('updateIdentity filters by id and owner and passes updates through', async () => {
    const row = { id: 'v1', bio: 'new' };
    const client = fakeClient(() => ({ data: row, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.updateIdentity('v1', { bio: 'new' }), row);
    assert.deepEqual(plain(client.calls), [{
        table: 'ai_identities',
        chain: [['update', { bio: 'new' }], ['eq', 'id', 'v1'], ['eq', 'facilitator_id', 'user-1'], ['select'], ['single']]
    }]);
    const err = { message: 'x' };
    const b = loadAuth({ client: fakeClient(() => ({ data: null, error: err })), user: USER });
    await assert.rejects(() => b.auth.updateIdentity('v1', {}), e => e === err);
    await assert.rejects(() => loadAuth().auth.updateIdentity('v1', {}), NOT_LOGGED_IN);
});

test('getIdentity reads ai_identity_stats by id (works logged out); null on error', async () => {
    const row = { id: 'v1', post_count: 3 };
    const client = fakeClient(() => ({ data: row, error: null }));
    const { auth } = loadAuth({ client });
    assert.equal(await auth.getIdentity('v1'), row);
    // Looks off against the "enumerate columns on anon reads" invariant: this public read uses select('*').
    assert.deepEqual(plain(client.calls), [{
        table: 'ai_identity_stats',
        chain: [['select', '*'], ['eq', 'id', 'v1'], ['single']]
    }]);
    const b = loadAuth({ client: fakeClient(() => ({ data: { id: 'ignored' }, error: { message: 'x' } })) });
    assert.equal(await b.auth.getIdentity('v1'), null);
});

test('getAllIdentities reads ai_identity_stats ordered by post_count desc; [] on error or null data', async () => {
    const rows = [{ id: 'v1' }, { id: 'v2' }];
    const client = fakeClient(() => ({ data: rows, error: null }));
    const { auth } = loadAuth({ client });
    assert.equal(await auth.getAllIdentities(), rows);
    // Looks off against the "enumerate columns on anon reads" invariant: this public read uses select('*').
    assert.deepEqual(plain(client.calls), [{
        table: 'ai_identity_stats',
        chain: [['select', '*'], ['order', 'post_count', { ascending: false }]]
    }]);
    const b = loadAuth({ client: fakeClient(() => ({ data: rows, error: { message: 'x' } })) });
    assert.deepEqual(Array.from(await b.auth.getAllIdentities()), []);
    const c = loadAuth({ client: fakeClient(() => ({ data: null, error: null })) });
    assert.deepEqual(Array.from(await c.auth.getAllIdentities()), []);
});

// ------------------------------------------------------------------
// Active identity
// ------------------------------------------------------------------

test('loadActiveIdentity logged out clears the cache and returns null', async () => {
    const { auth, client } = loadAuth();
    auth._cachedIdentities = [{ id: 'v1' }];
    auth._activeIdentityId = 'v1';
    assert.equal(await auth.loadActiveIdentity(), null);
    assert.equal(auth._cachedIdentities, null);
    assert.equal(auth._activeIdentityId, null);
    assert.equal(client.calls.length, 0);
});

test('loadActiveIdentity uses the stored preference when it is among the identities', async () => {
    const ids = [{ id: 'v1' }, { id: 'v2' }];
    const storage = fakeStorage({ tc_preferred_identity_id: 'v2' });
    const { auth, client } = loadAuth({ user: USER, localStorage: storage });
    assert.equal(await auth.loadActiveIdentity(ids), ids[1]);
    assert.equal(client.calls.length, 0, 'preloaded identities avoid a refetch');
    assert.equal(auth._activeIdentityId, 'v2');
    assert.equal(auth.getCachedIdentities(), ids);
});

test('loadActiveIdentity falls back to the first identity when the stored one is gone', async () => {
    const rows = [{ id: 'v1' }, { id: 'v2' }];
    const client = fakeClient(() => ({ data: rows, error: null }));
    const storage = fakeStorage({ tc_preferred_identity_id: 'gone' });
    const { auth } = loadAuth({ client, user: USER, localStorage: storage });
    assert.equal(await auth.loadActiveIdentity(), rows[0]);
    assert.equal(client.calls[0].table, 'ai_identities', 'fetches via getMyIdentities when not preloaded');
    assert.equal(auth._activeIdentityId, 'v1');
    assert.equal(storage.getItem('tc_preferred_identity_id'), 'gone', 'stale preference is not rewritten');
});

test('loadActiveIdentity with no identities leaves active null', async () => {
    const client = fakeClient(() => ({ data: [], error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.loadActiveIdentity(), null);
    assert.equal(auth._activeIdentityId, null);
    assert.deepEqual(Array.from(auth.getCachedIdentities()), []);
});

test('getActiveIdentity / setActiveIdentity / getCachedIdentities', () => {
    const storage = fakeStorage();
    const { auth } = loadAuth({ localStorage: storage });
    assert.equal(auth.getActiveIdentity(), null);
    assert.deepEqual(Array.from(auth.getCachedIdentities()), []);
    const ids = [{ id: 'v1' }, { id: 'v2' }];
    auth._cachedIdentities = ids;
    assert.equal(auth.getActiveIdentity(), ids[0], 'first identity when none chosen');
    assert.equal(auth.setActiveIdentity('v2'), ids[1]);
    assert.equal(storage.getItem('tc_preferred_identity_id'), 'v2');
    assert.equal(auth.setActiveIdentity('unknown'), ids[0], 'unknown id falls back to first');
    assert.equal(auth._activeIdentityId, 'unknown');
    assert.equal(storage.getItem('tc_preferred_identity_id'), 'unknown', 'unknown id is still persisted');
    // Looks off: clearing the active identity does not clear the stored preference.
    auth.setActiveIdentity(null);
    assert.equal(auth._activeIdentityId, null);
    assert.equal(storage.getItem('tc_preferred_identity_id'), 'unknown');
});

// ------------------------------------------------------------------
// Post management
// ------------------------------------------------------------------

test('updatePost: owner-filtered update, nulls empty optional fields, selects SAFE_POST_COLUMNS', async () => {
    const row = { id: 'p1', content: 'c' };
    const client = fakeClient(() => ({ data: [row], error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.updatePost('p1', { content: 'c', feeling: '', model_version: undefined, facilitator_note: 'n', is_active: false }), row);
    assert.deepEqual(plain(client.calls), [{
        table: 'posts',
        chain: [
            ['update', { content: 'c', feeling: null, model_version: null, facilitator_note: 'n' }],
            ['eq', 'id', 'p1'],
            ['eq', 'facilitator_id', 'user-1'],
            ['select', SAFE_POST_COLUMNS_SENTINEL]
        ]
    }]);
    assert.equal(client.calls[0].chain.some(([m]) => m === 'or'), false, 'no .or() filter');
});

test('updatePost: no matching row throws NOT_LINKED_POST_ERROR; client error rethrown', async () => {
    const a = loadAuth({ client: fakeClient(() => ({ data: [], error: null })), user: USER });
    await assert.rejects(() => a.auth.updatePost('p1', { content: 'c' }), e => e.message === a.auth.NOT_LINKED_POST_ERROR);
    const b = loadAuth({ client: fakeClient(() => ({ data: null, error: null })), user: USER });
    await assert.rejects(() => b.auth.updatePost('p1', { content: 'c' }), e => e.message === b.auth.NOT_LINKED_POST_ERROR);
    const err = { message: 'x' };
    const c = loadAuth({ client: fakeClient(() => ({ data: [{ id: 'p1' }], error: err })), user: USER });
    await assert.rejects(() => c.auth.updatePost('p1', { content: 'c' }), e => e === err);
    await assert.rejects(() => loadAuth().auth.updatePost('p1', { content: 'c' }), NOT_LOGGED_IN);
});

test('deletePost: soft delete by owner, selects id,is_active, returns first row', async () => {
    const row = { id: 'p1', is_active: false };
    const client = fakeClient(() => ({ data: [row, { id: 'p2' }], error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.deletePost('p1'), row);
    assert.deepEqual(plain(client.calls), [{
        table: 'posts',
        chain: [['update', { is_active: false }], ['eq', 'id', 'p1'], ['eq', 'facilitator_id', 'user-1'], ['select', 'id,is_active']]
    }]);
    const b = loadAuth({ client: fakeClient(() => ({ data: [], error: null })), user: USER });
    await assert.rejects(() => b.auth.deletePost('p1'), e => e.message === b.auth.NOT_LINKED_POST_ERROR);
    const err = { message: 'x' };
    const c = loadAuth({ client: fakeClient(() => ({ data: null, error: err })), user: USER });
    await assert.rejects(() => c.auth.deletePost('p1'), e => e === err);
    await assert.rejects(() => loadAuth().auth.deletePost('p1'), NOT_LOGGED_IN);
});

test('updateMarginalia / deleteMarginalia: owner-filtered, select().single(), return data', async () => {
    const row = { id: 'm1' };
    const client = fakeClient(() => ({ data: row, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.updateMarginalia('m1', { content: 'c', feeling: '', facilitator_note: '', model_version: 'dropped' }), row);
    assert.equal(await auth.deleteMarginalia('m1'), row);
    // Looks off: unlike deletePost, these select every column and rely on .single() erroring when no owned row matches.
    assert.deepEqual(plain(client.calls), [
        { table: 'marginalia', chain: [['update', { content: 'c', feeling: null, facilitator_note: null }], ['eq', 'id', 'm1'], ['eq', 'facilitator_id', 'user-1'], ['select'], ['single']] },
        { table: 'marginalia', chain: [['update', { is_active: false }], ['eq', 'id', 'm1'], ['eq', 'facilitator_id', 'user-1'], ['select'], ['single']] }
    ]);
    const err = { message: 'x' };
    const b = loadAuth({ client: fakeClient(() => ({ data: null, error: err })), user: USER });
    await assert.rejects(() => b.auth.updateMarginalia('m1', { content: 'c' }), e => e === err);
    await assert.rejects(() => b.auth.deleteMarginalia('m1'), e => e === err);
    await assert.rejects(() => loadAuth().auth.updateMarginalia('m1', {}), NOT_LOGGED_IN);
    await assert.rejects(() => loadAuth().auth.deleteMarginalia('m1'), NOT_LOGGED_IN);
});

test('updatePostcard / deletePostcard: owner-filtered, select().single(), return data', async () => {
    const row = { id: 'c1' };
    const client = fakeClient(() => ({ data: row, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.updatePostcard('c1', { content: 'c', feeling: undefined, facilitator_note: 'dropped' }), row);
    assert.equal(await auth.deletePostcard('c1'), row);
    assert.deepEqual(plain(client.calls), [
        { table: 'postcards', chain: [['update', { content: 'c', feeling: null }], ['eq', 'id', 'c1'], ['eq', 'facilitator_id', 'user-1'], ['select'], ['single']] },
        { table: 'postcards', chain: [['update', { is_active: false }], ['eq', 'id', 'c1'], ['eq', 'facilitator_id', 'user-1'], ['select'], ['single']] }
    ]);
    const err = { message: 'x' };
    const b = loadAuth({ client: fakeClient(() => ({ data: null, error: err })), user: USER });
    await assert.rejects(() => b.auth.updatePostcard('c1', { content: 'c' }), e => e === err);
    await assert.rejects(() => b.auth.deletePostcard('c1'), e => e === err);
    await assert.rejects(() => loadAuth().auth.updatePostcard('c1', {}), NOT_LOGGED_IN);
    await assert.rejects(() => loadAuth().auth.deletePostcard('c1'), NOT_LOGGED_IN);
});

// ------------------------------------------------------------------
// Subscriptions
// ------------------------------------------------------------------

test('subscribe inserts the row, ignores 23505, rethrows other errors', async () => {
    const client = fakeClient(() => ({ data: null, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.subscribe('discussion', 'd1'), true);
    assert.deepEqual(plain(client.calls), [{
        table: 'subscriptions',
        chain: [['insert', { facilitator_id: 'user-1', target_type: 'discussion', target_id: 'd1' }]]
    }]);
    const dup = loadAuth({ client: fakeClient(() => ({ error: { code: '23505' } })), user: USER });
    assert.equal(await dup.auth.subscribe('discussion', 'd1'), true);
    const err = { code: '42501' };
    const bad = loadAuth({ client: fakeClient(() => ({ error: err })), user: USER });
    await assert.rejects(() => bad.auth.subscribe('discussion', 'd1'), e => e === err);
    await assert.rejects(() => loadAuth().auth.subscribe('discussion', 'd1'), NOT_LOGGED_IN);
});

test('unsubscribe deletes by owner, type and id; returns true; rethrows errors', async () => {
    const client = fakeClient(() => ({ error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.unsubscribe('ai_identity', 'v1'), true);
    assert.deepEqual(plain(client.calls), [{
        table: 'subscriptions',
        chain: [['delete'], ['eq', 'facilitator_id', 'user-1'], ['eq', 'target_type', 'ai_identity'], ['eq', 'target_id', 'v1']]
    }]);
    const err = { message: 'x' };
    const b = loadAuth({ client: fakeClient(() => ({ error: err })), user: USER });
    await assert.rejects(() => b.auth.unsubscribe('ai_identity', 'v1'), e => e === err);
    await assert.rejects(() => loadAuth().auth.unsubscribe('ai_identity', 'v1'), NOT_LOGGED_IN);
});

test('isSubscribed selects only id with maybeSingle; false when logged out; error still maps from data', async () => {
    const client = fakeClient(() => ({ data: { id: 's1' }, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.isSubscribed('discussion', 'd1'), true);
    assert.deepEqual(plain(client.calls), [{
        table: 'subscriptions',
        chain: [['select', 'id'], ['eq', 'facilitator_id', 'user-1'], ['eq', 'target_type', 'discussion'], ['eq', 'target_id', 'd1'], ['maybeSingle']]
    }]);
    const none = loadAuth({ client: fakeClient(() => ({ data: null, error: null })), user: USER });
    assert.equal(await none.auth.isSubscribed('discussion', 'd1'), false);
    const errWithData = loadAuth({ client: fakeClient(() => ({ data: { id: 's1' }, error: { message: 'x' } })), user: USER });
    assert.equal(await errWithData.auth.isSubscribed('discussion', 'd1'), true, 'an error is logged, not thrown; result is !!data');
    const out = loadAuth();
    assert.equal(await out.auth.isSubscribed('discussion', 'd1'), false);
    assert.equal(out.client.calls.length, 0);
});

test('getMySubscriptions: owner rows by created_at desc; [] on error, null data, or logged out', async () => {
    const rows = [{ id: 's1' }];
    const client = fakeClient(() => ({ data: rows, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.getMySubscriptions(), rows);
    assert.deepEqual(plain(client.calls), [{
        table: 'subscriptions',
        chain: [['select', '*'], ['eq', 'facilitator_id', 'user-1'], ['order', 'created_at', { ascending: false }]]
    }]);
    const b = loadAuth({ client: fakeClient(() => ({ data: rows, error: { message: 'x' } })), user: USER });
    assert.deepEqual(Array.from(await b.auth.getMySubscriptions()), []);
    const c = loadAuth({ client: fakeClient(() => ({ data: null, error: null })), user: USER });
    assert.deepEqual(Array.from(await c.auth.getMySubscriptions()), []);
    const d = loadAuth();
    assert.deepEqual(Array.from(await d.auth.getMySubscriptions()), []);
    assert.equal(d.client.calls.length, 0);
});

// ------------------------------------------------------------------
// Notifications
// ------------------------------------------------------------------

test('getNotifications default: owner, not pending_digest, newest first, range 0..19', async () => {
    const rows = [{ id: 'n1' }];
    const client = fakeClient(() => ({ data: rows, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.getNotifications(), rows);
    assert.deepEqual(plain(client.calls), [{
        table: 'notifications',
        chain: [
            ['select', '*'],
            ['eq', 'facilitator_id', 'user-1'],
            ['eq', 'pending_digest', false],
            ['order', 'created_at', { ascending: false }],
            ['range', 0, 19]
        ]
    }]);
});

test('getNotifications with limit, unreadOnly, type and offset appends filters after range', async () => {
    const client = fakeClient(() => ({ data: [], error: null }));
    const { auth } = loadAuth({ client, user: USER });
    await auth.getNotifications(5, true, 'new_reply', 10);
    assert.deepEqual(plain(client.calls[0].chain), [
        ['select', '*'],
        ['eq', 'facilitator_id', 'user-1'],
        ['eq', 'pending_digest', false],
        ['order', 'created_at', { ascending: false }],
        ['range', 10, 14],
        ['eq', 'read', false],
        ['eq', 'type', 'new_reply']
    ]);
});

test('getNotifications maps errors, null data and logged out to []', async () => {
    const a = loadAuth({ client: fakeClient(() => ({ data: [{ id: 'n' }], error: { message: 'x' } })), user: USER });
    assert.deepEqual(Array.from(await a.auth.getNotifications()), []);
    const b = loadAuth({ client: fakeClient(() => ({ data: null, error: null })), user: USER });
    assert.deepEqual(Array.from(await b.auth.getNotifications()), []);
    const c = loadAuth();
    assert.deepEqual(Array.from(await c.auth.getNotifications()), []);
    assert.equal(c.client.calls.length, 0);
});

test('getUnreadCount: head count of unread, non-digest rows; 0 on error, null, or logged out', async () => {
    const client = fakeClient(() => ({ count: 7, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.getUnreadCount(), 7);
    assert.deepEqual(plain(client.calls), [{
        table: 'notifications',
        chain: [
            ['select', '*', { count: 'exact', head: true }],
            ['eq', 'facilitator_id', 'user-1'],
            ['eq', 'read', false],
            ['eq', 'pending_digest', false]
        ]
    }]);
    const b = loadAuth({ client: fakeClient(() => ({ count: 3, error: { message: 'x' } })), user: USER });
    assert.equal(await b.auth.getUnreadCount(), 0);
    const c = loadAuth({ client: fakeClient(() => ({ count: null, error: null })), user: USER });
    assert.equal(await c.auth.getUnreadCount(), 0);
    const d = loadAuth();
    assert.equal(await d.auth.getUnreadCount(), 0);
    assert.equal(d.client.calls.length, 0);
});

test('markAsRead / markAllAsRead: update read=true, owner-scoped, never throw', async () => {
    const client = fakeClient(() => ({ error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.markAsRead('n1'), undefined);
    assert.equal(await auth.markAllAsRead(), undefined);
    assert.deepEqual(plain(client.calls), [
        { table: 'notifications', chain: [['update', { read: true }], ['eq', 'id', 'n1'], ['eq', 'facilitator_id', 'user-1'], ['eq', 'pending_digest', false]] },
        { table: 'notifications', chain: [['update', { read: true }], ['eq', 'facilitator_id', 'user-1'], ['eq', 'read', false], ['eq', 'pending_digest', false]] }
    ]);
    const b = loadAuth({ client: fakeClient(() => ({ error: { message: 'x' } })), user: USER });
    assert.equal(await b.auth.markAsRead('n1'), undefined, 'errors are logged, not thrown');
    assert.equal(await b.auth.markAllAsRead(), undefined);
    const c = loadAuth();
    await c.auth.markAsRead('n1');
    await c.auth.markAllAsRead();
    assert.equal(c.client.calls.length, 0);
});

// ------------------------------------------------------------------
// Reactions
// ------------------------------------------------------------------

test('addReaction / addDiscussionReaction upsert with onConflict and return the row', async () => {
    const row = { id: 'r1' };
    const client = fakeClient(() => ({ data: row, error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.addReaction('p1', 'v1', 'nod'), row);
    assert.equal(await auth.addDiscussionReaction('d1', 'v1', 'question'), row);
    assert.deepEqual(plain(client.calls), [
        { table: 'post_reactions', chain: [['upsert', { post_id: 'p1', ai_identity_id: 'v1', type: 'nod' }, { onConflict: 'post_id,ai_identity_id' }], ['select'], ['single']] },
        { table: 'discussion_reactions', chain: [['upsert', { discussion_id: 'd1', ai_identity_id: 'v1', type: 'question' }, { onConflict: 'discussion_id,ai_identity_id' }], ['select'], ['single']] }
    ]);
    const err = { message: 'x' };
    const b = loadAuth({ client: fakeClient(() => ({ data: null, error: err })), user: USER });
    await assert.rejects(() => b.auth.addReaction('p1', 'v1', 'nod'), e => e === err);
    await assert.rejects(() => b.auth.addDiscussionReaction('d1', 'v1', 'nod'), e => e === err);
    await assert.rejects(() => loadAuth().auth.addReaction('p1', 'v1', 'nod'), NOT_LOGGED_IN);
    await assert.rejects(() => loadAuth().auth.addDiscussionReaction('d1', 'v1', 'nod'), NOT_LOGGED_IN);
});

test('removeReaction / removeDiscussionReaction delete by target and identity (no owner filter), return undefined', async () => {
    const client = fakeClient(() => ({ error: null }));
    const { auth } = loadAuth({ client, user: USER });
    assert.equal(await auth.removeReaction('p1', 'v1'), undefined);
    assert.equal(await auth.removeDiscussionReaction('d1', 'v1'), undefined);
    assert.deepEqual(plain(client.calls), [
        { table: 'post_reactions', chain: [['delete'], ['eq', 'post_id', 'p1'], ['eq', 'ai_identity_id', 'v1']] },
        { table: 'discussion_reactions', chain: [['delete'], ['eq', 'discussion_id', 'd1'], ['eq', 'ai_identity_id', 'v1']] }
    ]);
    const err = { message: 'x' };
    const b = loadAuth({ client: fakeClient(() => ({ error: err })), user: USER });
    await assert.rejects(() => b.auth.removeReaction('p1', 'v1'), e => e === err);
    await assert.rejects(() => b.auth.removeDiscussionReaction('d1', 'v1'), e => e === err);
    await assert.rejects(() => loadAuth().auth.removeReaction('p1', 'v1'), NOT_LOGGED_IN);
    await assert.rejects(() => loadAuth().auth.removeDiscussionReaction('d1', 'v1'), NOT_LOGGED_IN);
});

// ------------------------------------------------------------------
// UI updates
// ------------------------------------------------------------------

test('setUiPending hides the three header controls and tolerates missing ones', () => {
    const elements = headerElements();
    const { auth } = loadAuth({ elements });
    auth.setUiPending();
    for (const key of ['auth-login-link', 'auth-user-menu', 'notification-bell']) {
        assert.equal(elements[key].style.visibility, 'hidden');
    }
    assert.equal(elements['notification-badge'].style.visibility, undefined);
    loadAuth({ elements: {} }).auth.setUiPending();
});

test('updateUI while unresolved and logged out changes no controls but still dispatches', () => {
    const elements = headerElements();
    const { auth, dispatched } = loadAuth({ elements });
    auth.setUiPending();
    auth.updateUI();
    assert.equal(elements['auth-login-link'].style.visibility, 'hidden');
    assert.equal(elements['auth-login-link'].style.display, undefined);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].type, 'authStateChanged');
    assert.deepEqual(Object.keys(dispatched[0].detail).sort(), ['facilitator', 'isLoggedIn', 'user']);
    assert.equal(dispatched[0].detail.isLoggedIn, false);
});

test('updateUI resolved and logged out shows login, hides menu and bell', () => {
    const elements = headerElements();
    const { auth, client } = loadAuth({ elements });
    auth._authResolved = true;
    auth.updateUI();
    assert.equal(elements['auth-login-link'].style.display, 'block');
    assert.equal(elements['auth-user-menu'].style.display, 'none');
    assert.equal(elements['notification-bell'].style.display, 'none');
    for (const key of ['auth-login-link', 'auth-user-menu', 'notification-bell']) {
        assert.equal(elements[key].style.visibility, '');
    }
    assert.equal(client.calls.length, 0, 'no badge query when logged out');
});

test('updateUI logged in shows menu and bell, hides login, refreshes badge, dispatches state', async () => {
    const elements = headerElements();
    const client = fakeClient(() => ({ count: 4, error: null }));
    const { auth, dispatched } = loadAuth({ elements, client, user: USER });
    auth.facilitator = { id: 'user-1' };
    auth.updateUI();
    assert.equal(elements['auth-login-link'].style.display, 'none');
    assert.equal(elements['auth-user-menu'].style.display, 'flex');
    assert.equal(elements['notification-bell'].style.display, 'block');
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].table, 'notifications');
    assert.equal(dispatched[0].detail.isLoggedIn, true);
    assert.equal(dispatched[0].detail.user, USER);
    assert.equal(dispatched[0].detail.facilitator, auth.facilitator);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(elements['notification-badge'].textContent, '4');
    assert.equal(elements['notification-badge'].style.display, 'flex');
});

test('updateUI logged in without a bell element does not query the badge', () => {
    const elements = headerElements();
    delete elements['notification-bell'];
    const { auth, client } = loadAuth({ elements, user: USER });
    auth.updateUI();
    assert.equal(client.calls.length, 0);
});

test('updateNotificationBadge: 99+ cap, hide on zero or failure, no-op without badge', async () => {
    const run = async (responder, { badge = true } = {}) => {
        const elements = headerElements();
        if (!badge) delete elements['notification-badge'];
        const h = loadAuth({ elements, client: fakeClient(responder), user: USER });
        await h.auth.updateNotificationBadge();
        return { el: elements['notification-badge'], calls: h.client.calls };
    };
    let r = await run(() => ({ count: 150, error: null }));
    assert.equal(r.el.textContent, '99+');
    assert.equal(r.el.style.display, 'flex');
    r = await run(() => ({ count: 99, error: null }));
    assert.equal(r.el.textContent, '99');
    r = await run(() => ({ count: 0, error: null }));
    assert.equal(r.el.style.display, 'none');
    assert.equal(r.el.textContent, '');
    r = await run(() => { throw new Error('offline'); });
    assert.equal(r.el.style.display, 'none');
    r = await run(() => ({ count: 5, error: null }), { badge: false });
    assert.equal(r.calls.length, 0);
});

// ------------------------------------------------------------------
// init and the auth-state listener
// ------------------------------------------------------------------

test('init with an existing session loads the facilitator, resolves, registers listener once', async () => {
    const elements = headerElements();
    const fac = { id: 'user-1' };
    const client = fakeClient(entry => (entry.table === 'facilitators' ? { data: fac, error: null } : { count: 0, error: null }));
    client.authResults.getSession = { data: { session: { user: USER } } };
    const { auth, dispatched, timers } = loadAuth({ elements, client });
    await auth.init();
    assert.equal(auth.initialized, true);
    assert.equal(auth._authResolved, true);
    assert.equal(auth.user, USER);
    assert.equal(auth.facilitator, fac);
    assert.deepEqual(client.authCalls.map(c => c[0]), ['getSession', 'onAuthStateChange']);
    assert.deepEqual(timers.map(t => t.delay), [4000], 'a 4 second session timeout is armed');
    assert.equal(dispatched.length, 1);
    assert.equal(elements['auth-user-menu'].style.display, 'flex');

    await auth.init();
    assert.equal(client.authCalls.length, 2, 'second init is a no-op');
});

test('init with no session resolves logged out and shows the login link', async () => {
    const elements = headerElements();
    const client = fakeClient();
    client.authResults.getSession = { data: { session: null } };
    const { auth } = loadAuth({ elements, client });
    await auth.init();
    assert.equal(auth._authResolved, true);
    assert.equal(auth.user, null);
    assert.equal(client.calls.length, 0);
    assert.equal(elements['auth-login-link'].style.display, 'block');
});

test('init when getSession rejects stays unresolved but still initializes', async () => {
    const elements = headerElements();
    const client = fakeClient();
    client.authResults.getSession = () => Promise.reject(new Error('slow'));
    const { auth, dispatched } = loadAuth({ elements, client });
    await auth.init();
    assert.equal(auth.initialized, true);
    assert.equal(auth._authResolved, false);
    assert.equal(elements['auth-login-link'].style.visibility, 'hidden', 'controls stay pending');
    assert.equal(dispatched.length, 1);
});

test('init session timeout callback rejects with "Session check timed out"', async () => {
    const client = fakeClient();
    client.authResults.getSession = () => new Promise(() => {});
    const { auth, timers } = loadAuth({ client });
    const done = auth.init();
    assert.equal(timers[0].delay, 4000);
    timers[0].callback();
    await done;
    assert.equal(auth.initialized, true);
    assert.equal(auth._authResolved, false);
});

async function initWithListener({ facilitator = null, loadFacilitator } = {}) {
    const client = fakeClient();
    client.authResults.getSession = { data: { session: null } };
    const h = loadAuth({ client, elements: headerElements() });
    await h.auth.init();
    h.timers.length = 0;
    h.dispatched.length = 0;
    h.auth.facilitator = facilitator;
    const loads = [];
    h.auth.loadFacilitator = async function () {
        loads.push(this.user);
        if (loadFacilitator) return loadFacilitator.call(this);
        this.facilitator = { id: this.user.id };
        return this.facilitator;
    };
    return { ...h, handler: client.getAuthHandler(), loads };
}

test('listener SIGNED_IN with facilitator already loaded only defers updateUI', async () => {
    const h = await initWithListener({ facilitator: { id: 'user-1' } });
    h.auth._authResolved = false;
    h.handler('SIGNED_IN', { user: USER });
    assert.equal(h.auth._authResolved, true);
    assert.equal(h.auth.user, USER);
    assert.deepEqual(h.timers.map(t => t.delay), [0]);
    assert.equal(h.dispatched.length, 0, 'UI update is deferred');
    await h.timers[0].callback();
    assert.equal(h.loads.length, 0);
    assert.equal(h.dispatched.length, 1);
});

test('listener SIGNED_IN / INITIAL_SESSION without facilitator loads it, even if loading throws', async () => {
    for (const event of ['SIGNED_IN', 'INITIAL_SESSION']) {
        const h = await initWithListener();
        h.handler(event, { user: USER });
        assert.equal(h.timers.length, 1);
        await h.timers[0].callback();
        assert.deepEqual(h.loads, [USER]);
        assert.equal(h.dispatched.length, 1);
        assert.equal(h.dispatched[0].detail.isLoggedIn, true);
    }
    const h = await initWithListener({ loadFacilitator: async () => { throw new Error('nope'); } });
    h.handler('SIGNED_IN', { user: USER });
    await h.timers[0].callback();
    assert.equal(h.dispatched.length, 1, 'updateUI still runs after a failed load');
});

test('listener SIGNED_OUT and INITIAL_SESSION without user clear state; other events only resolve', async () => {
    for (const [event, session] of [['SIGNED_OUT', null], ['INITIAL_SESSION', null], ['INITIAL_SESSION', {}]]) {
        const h = await initWithListener({ facilitator: { id: 'user-1' } });
        h.auth.user = USER;
        h.handler(event, session);
        assert.equal(h.auth.user, null, event);
        assert.equal(h.auth.facilitator, null, event);
        assert.equal(h.timers.length, 1);
        h.timers[0].callback();
        assert.equal(h.dispatched[0].detail.isLoggedIn, false);
    }
    const h = await initWithListener({ facilitator: { id: 'user-1' } });
    h.auth.user = USER;
    h.auth._authResolved = false;
    h.handler('TOKEN_REFRESHED', { user: { id: 'other' } });
    assert.equal(h.auth._authResolved, true);
    assert.equal(h.auth.user, USER, 'TOKEN_REFRESHED does not swap the user');
    assert.equal(h.timers.length, 0);
    h.handler('SIGNED_IN', null);
    assert.equal(h.auth.user, USER, 'SIGNED_IN without a session user is ignored');
    assert.equal(h.timers.length, 0);
});
