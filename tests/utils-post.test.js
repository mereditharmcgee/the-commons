// Offline checks for Utils.post() in js/utils.js: which Bearer a site write
// carries, and how a refusal reaches the form.
// Run: npm run test:forms
//
// Signed out, a write carries the anon key as its Bearer, as it always did.
// Signed in, it carries the session's access token, so the database sees the
// account (auth.uid()). These tests run js/utils.js in a stub window with a
// fake fetch and a fake Auth; nothing reaches the network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ANON_KEY = 'anon-key-for-tests';
const TOKEN = 'session-access-token';
const USER = '11111111-1111-4111-8111-000000000001';
const OTHER = '22222222-2222-4222-8222-000000000002';
const VOICE = '33333333-3333-4333-8333-000000000003';

const CONFIG = {
    supabase: { url: 'https://example.supabase.co', key: ANON_KEY },
    api: {
        posts: '/rest/v1/posts',
        marginalia: '/rest/v1/marginalia',
        postcards: '/rest/v1/postcards',
        discussions: '/rest/v1/discussions',
        moment_comments: '/rest/v1/moment_comments'
    }
};

function load(file, sandbox) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    vm.runInNewContext(source, sandbox, { filename: file });
}

// A fresh Utils with a recording fetch. `respond` builds the fetch response.
function setup({ auth, respond } = {}) {
    const calls = [];
    const sandbox = {
        window: {},
        console: { error() {}, warn() {}, log() {} },
        CONFIG,
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, init) => {
            calls.push({ url, init });
            if (respond) return respond(url, init);
            return { ok: true, status: 201, json: async () => [{ id: 'new' }], text: async () => '' };
        }
    };
    if (auth) sandbox.Auth = auth;
    load('js/utils.js', sandbox);
    load('js/content-shape.js', sandbox);
    return { Utils: sandbox.window.Utils, ContentShape: sandbox.window.ContentShape, calls, sandbox };
}

// A fake Auth. `session` is what getSession() resolves to; a function is
// called on each getSession() so a test can fail the first call.
function fakeAuth({ loggedIn = true, session, getSession, refreshSession } = {}) {
    const state = { getSessionCalls: 0, refreshCalls: 0 };
    state.auth = {
        isLoggedIn: () => loggedIn,
        getUser: () => (loggedIn ? { id: USER } : null),
        getClient: () => ({
            auth: {
                getSession: () => {
                    state.getSessionCalls += 1;
                    if (getSession) return getSession(state.getSessionCalls);
                    return Promise.resolve({ data: { session: session === undefined ? null : session }, error: null });
                },
                refreshSession: () => {
                    state.refreshCalls += 1;
                    if (refreshSession) return refreshSession(state.refreshCalls);
                    return Promise.resolve({ data: { session: null }, error: { message: 'no refresh token' } });
                }
            }
        })
    };
    return state;
}

const liveSession = (id = USER) => ({ access_token: TOKEN, user: { id } });
const refusalResponse = (status, body) => () => ({
    ok: false, status, json: async () => body, text: async () => JSON.stringify(body)
});

test('signed out: the anon key is both apikey and Bearer, as before', async () => {
    const auth = fakeAuth({ loggedIn: false });
    const { Utils, calls } = setup({ auth: auth.auth });
    await Utils.createPost({ discussion_id: 'd', content: 'hello', model: 'Claude' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers.apikey, ANON_KEY);
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${ANON_KEY}`);
    assert.equal(auth.getSessionCalls, 0, 'no session lookup when signed out');
    assert.match(calls[0].url, /\/rest\/v1\/posts\?select=/);
});

test('a page without auth.js (admin.html) sends the anon key', async () => {
    const { Utils, calls } = setup();
    await Utils.post(CONFIG.api.posts, { content: 'x', model: 'Claude' });
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${ANON_KEY}`);
});

test('signed in: the session access token is the Bearer; apikey stays the anon key', async () => {
    const auth = fakeAuth({ session: liveSession() });
    const { Utils, calls } = setup({ auth: auth.auth });
    await Utils.createMarginalia({ text_id: 't', content: 'note', model: 'Claude', facilitator_id: USER, ai_identity_id: VOICE });
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(calls[0].init.headers.apikey, ANON_KEY);
    assert.equal(JSON.parse(calls[0].init.body).ai_identity_id, VOICE, 'the row is sent unchanged');
});

test('signed in with no voice on the row still sends the session (submit.html "No identity")', async () => {
    const auth = fakeAuth({ session: liveSession() });
    const { Utils, calls } = setup({ auth: auth.auth });
    await Utils.post(CONFIG.api.postcards, { content: 'card', model: 'Claude', facilitator_id: USER });
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
});

test('getSession() is retried on the Supabase client AbortError; the POST is sent once', async () => {
    const auth = fakeAuth({
        getSession: n => {
            if (n === 1) {
                const err = new Error('signal is aborted without reason');
                err.name = 'AbortError';
                return Promise.reject(err);
            }
            return Promise.resolve({ data: { session: liveSession() }, error: null });
        }
    });
    const { Utils, calls } = setup({ auth: auth.auth });
    await Utils.createPost({ content: 'x', model: 'Claude', facilitator_id: USER });
    assert.equal(auth.getSessionCalls, 2);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
});

test('signed in but the session is gone: a row naming an account is stopped before sending', async () => {
    for (const row of [
        { content: 'x', model: 'Claude', facilitator_id: USER },
        { content: 'x', model: 'Claude', ai_identity_id: VOICE },
        { moment_id: 'm', content: 'x', user_id: USER }
    ]) {
        const auth = fakeAuth({ session: null });
        const { Utils, calls } = setup({ auth: auth.auth });
        await assert.rejects(Utils.post(CONFIG.api.posts, row), err => err.message === Utils.SIGN_IN_EXPIRED);
        assert.equal(calls.length, 0, 'nothing reaches the database');
    }
});

test('signed in but the session is gone: a row naming no account goes with the anon key', async () => {
    const auth = fakeAuth({ session: null });
    const { Utils, calls } = setup({ auth: auth.auth });
    await Utils.createDiscussion({ title: 'A question', description: 'Why?', proposed_by_name: 'Someone' });
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${ANON_KEY}`);
});

test('a session lookup that hangs gives up after SESSION_WAIT_MS and says to send again, not to reload', async () => {
    const auth = fakeAuth({ getSession: () => new Promise(() => {}) });
    const { Utils, calls } = setup({ auth: auth.auth });
    Utils.SESSION_WAIT_MS = 20;
    await assert.rejects(
        Utils.createPost({ content: 'x', model: 'Claude', facilitator_id: USER }),
        err => err.message === Utils.SIGN_IN_SLOW
    );
    assert.equal(calls.length, 0);
    assert.doesNotMatch(Utils.SIGN_IN_SLOW, /reload/i);
});

test('a session for a different account than the row names is stopped before sending', async () => {
    const auth = fakeAuth({ session: liveSession(OTHER) });
    const { Utils, calls } = setup({ auth: auth.auth });
    await assert.rejects(
        Utils.createPost({ content: 'x', model: 'Claude', facilitator_id: USER }),
        err => err.message === Utils.SIGN_IN_CHANGED
    );
    assert.equal(calls.length, 0);
});

test('{ anonymous: true } sends the anon key even when signed in (moment comments)', async () => {
    const auth = fakeAuth({ session: liveSession() });
    const { Utils, calls } = setup({ auth: auth.auth });
    await Utils.post(CONFIG.api.moment_comments, { moment_id: 'm', content: 'x', user_id: USER }, { anonymous: true });
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${ANON_KEY}`);
    assert.equal(auth.getSessionCalls, 0);
});

test('js/moment.js keeps moment comments on the anon key', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'moment.js'), 'utf8');
    assert.match(source, /Utils\.post\(CONFIG\.api\.moment_comments, payload, \{ anonymous: true \}\)/);
});

test('an error with code CM001 reaches the form as its own plain message', async () => {
    const message = 'A plain message from the database.';
    const auth = fakeAuth({ session: liveSession() });
    const { Utils, ContentShape } = setup({
        auth: auth.auth,
        respond: refusalResponse(400, { code: 'CM001', details: null, hint: null, message })
    });
    await assert.rejects(Utils.createPost({ content: 'x', model: 'Claude', facilitator_id: USER, ai_identity_id: VOICE }), err => {
        assert.equal(err.message, message);
        assert.equal(err.code, 'CM001');
        assert.equal(ContentShape.isRefusal(err), false, 'not mistaken for the size or hourly limit');
        return true;
    });
});

test('a policy refusal (42501) keeps the old message shape, so ContentShape still explains it', async () => {
    const { Utils, ContentShape } = setup({
        respond: refusalResponse(401, {
            code: '42501', details: null, hint: null,
            message: 'new row violates row-level security policy for table "posts"'
        })
    });
    await assert.rejects(Utils.createPost({ content: 'x', model: 'Claude' }), err => {
        assert.match(err.message, /^API Error \(401\): /);
        assert.equal(ContentShape.isRefusal(err), true);
        return true;
    });
});

test('a network failure is reported once and the insert is not retried', async () => {
    const auth = fakeAuth({ session: liveSession() });
    const { Utils, calls } = setup({
        auth: auth.auth,
        respond: () => { throw new TypeError('Failed to fetch'); }
    });
    await assert.rejects(Utils.createPost({ content: 'x', model: 'Claude', facilitator_id: USER }), /Network error/);
    assert.equal(calls.length, 1);
});

test('a session token PostgREST rejects (401 PGRST30x) is refreshed once and the row is sent once more', async () => {
    const fresh = { access_token: 'fresh-token', user: { id: USER } };
    const auth = fakeAuth({
        session: liveSession(),
        refreshSession: () => Promise.resolve({ data: { session: fresh }, error: null })
    });
    let n = 0;
    const { Utils, calls } = setup({
        auth: auth.auth,
        respond: () => (++n === 1
            ? { ok: false, status: 401, text: async () => JSON.stringify({ code: 'PGRST303', message: 'JWT expired' }) }
            : { ok: true, status: 201, json: async () => [{ id: 'new' }], text: async () => '' })
    });
    const result = await Utils.createPost({ content: 'x', model: 'Claude', facilitator_id: USER });
    assert.deepEqual(result, [{ id: 'new' }]);
    assert.equal(auth.refreshCalls, 1);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(calls[1].init.headers.Authorization, 'Bearer fresh-token');
    assert.equal(calls[1].init.body, calls[0].init.body, 'the same row is sent again');
});

test('a rejected session token that cannot be refreshed says the sign-in expired, without a second send', async () => {
    const auth = fakeAuth({ session: liveSession() });
    const { Utils, calls } = setup({
        auth: auth.auth,
        respond: () => ({ ok: false, status: 401, text: async () => JSON.stringify({ code: 'PGRST303', message: 'JWT expired' }) })
    });
    await assert.rejects(Utils.createPost({ content: 'x', model: 'Claude', facilitator_id: USER }),
        err => err.message === Utils.SIGN_IN_EXPIRED);
    assert.equal(auth.refreshCalls, 1);
    assert.equal(calls.length, 1);
});

test('the refresh-and-resend happens at most once, and never for the anon key', async () => {
    const auth = fakeAuth({
        session: liveSession(),
        refreshSession: () => Promise.resolve({ data: { session: { access_token: 'fresh-token', user: { id: USER } } }, error: null })
    });
    const expired = () => ({ ok: false, status: 401, text: async () => JSON.stringify({ code: 'PGRST303', message: 'JWT expired' }) });
    const signedIn = setup({ auth: auth.auth, respond: expired });
    await assert.rejects(signedIn.Utils.createPost({ content: 'x', model: 'Claude', facilitator_id: USER }), /^Error: API Error \(401\): /);
    assert.equal(signedIn.calls.length, 2, 'one resend, no loop');

    const signedOut = setup({ auth: fakeAuth({ loggedIn: false }).auth, respond: expired });
    await assert.rejects(signedOut.Utils.createPost({ content: 'x', model: 'Claude' }), /^Error: API Error \(401\): /);
    assert.equal(signedOut.calls.length, 1);
});

test('a signed-in 401 that is not a PGRST30x token rejection is not refreshed or resent', async () => {
    for (const body of [
        { code: '42501', details: null, hint: null, message: 'new row violates row-level security policy for table "posts"' },
        { message: 'Invalid API key' }
    ]) {
        const auth = fakeAuth({
            session: liveSession(),
            refreshSession: () => Promise.resolve({ data: { session: { access_token: 'fresh-token', user: { id: USER } } }, error: null })
        });
        const { Utils, calls } = setup({ auth: auth.auth, respond: refusalResponse(401, body) });
        await assert.rejects(Utils.createPost({ content: 'x', model: 'Claude', facilitator_id: USER }), /^Error: API Error \(401\): /);
        assert.equal(auth.refreshCalls, 0, 'no refresh for ' + JSON.stringify(body));
        assert.equal(calls.length, 1, 'sent once for ' + JSON.stringify(body));
    }
});

test('a refresh that hangs after a rejected token says to send again, without a second send', async () => {
    const auth = fakeAuth({ session: liveSession(), refreshSession: () => new Promise(() => {}) });
    const { Utils, calls } = setup({
        auth: auth.auth,
        respond: refusalResponse(401, { code: 'PGRST303', message: 'JWT expired' })
    });
    Utils.SESSION_WAIT_MS = 20;
    await assert.rejects(Utils.createPost({ content: 'x', model: 'Claude', facilitator_id: USER }),
        err => err.message === Utils.SIGN_IN_SLOW);
    assert.equal(auth.refreshCalls, 1);
    assert.equal(calls.length, 1);
});

test('a refresh that comes back with a different account is stopped before the resend', async () => {
    const auth = fakeAuth({
        session: liveSession(),
        refreshSession: () => Promise.resolve({ data: { session: { access_token: 'other-token', user: { id: OTHER } } }, error: null })
    });
    const { Utils, calls } = setup({
        auth: auth.auth,
        respond: refusalResponse(401, { code: 'PGRST303', message: 'JWT expired' })
    });
    await assert.rejects(Utils.createPost({ content: 'x', model: 'Claude', facilitator_id: USER }),
        err => err.message === Utils.SIGN_IN_CHANGED);
    assert.equal(auth.refreshCalls, 1);
    assert.equal(calls.length, 1, 'the row is not sent under the other account');
});
