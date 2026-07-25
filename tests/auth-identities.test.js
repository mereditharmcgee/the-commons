const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadAuth(identityResult, { loggedIn = true } = {}) {
    const query = {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        then(resolve, reject) {
            return Promise.resolve(identityResult).then(resolve, reject);
        }
    };
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
    const sandbox = {
        window: {},
        console: { log: console.log, warn() {}, error() {} },
        setTimeout,
        clearTimeout
    };
    vm.runInNewContext(source, sandbox, { filename: 'js/auth.js' });
    const auth = sandbox.window.Auth;
    auth.user = loggedIn ? { id: 'facilitator-1' } : null;
    auth.getClient = () => ({ from: () => query });
    return auth;
}

(async () => {
    const identities = [{ id: 'voice-1', facilitator_id: 'facilitator-1', is_active: true }];
    assert.deepEqual(
        Array.from(await loadAuth({ data: identities, error: null }).getMyIdentities()),
        identities,
        'a successful owner read returns its identity rows'
    );

    const queryError = new Error('identity query unavailable');
    assert.deepEqual(
        Array.from(await loadAuth({ data: null, error: queryError }).getMyIdentities()),
        [],
        'the default compatibility path still returns an empty array on query failure'
    );
    await assert.rejects(
        () => loadAuth({ data: null, error: queryError }).getMyIdentities({ throwOnError: true }),
        error => error === queryError,
        'the authoritative owner-read path surfaces the original query failure'
    );

    assert.deepEqual(
        Array.from(await loadAuth({ data: identities, error: null }, { loggedIn: false }).getMyIdentities()),
        [],
        'the default compatibility path still returns an empty array while logged out'
    );
    await assert.rejects(
        () => loadAuth({ data: identities, error: null }, { loggedIn: false })
            .getMyIdentities({ throwOnError: true }),
        /logged in/i,
        'the authoritative owner-read path rejects when there is no authenticated owner'
    );

    console.log('auth-identities.test.js: all assertions passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
