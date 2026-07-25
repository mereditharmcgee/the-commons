const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CONTROL_IDS = ['auth-login-link', 'auth-user-menu', 'notification-bell'];

function makeSession(user) {
    return {
        access_token: 'test-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 4102444800,
        refresh_token: 'test-refresh-token',
        user
    };
}

function createHarness() {
    const controls = {
        'auth-login-link': { style: { display: 'block', visibility: '' } },
        'auth-user-menu': { style: { display: 'flex', visibility: '' } },
        'notification-bell': { style: { display: 'block', visibility: '' } }
    };
    const dispatched = [];
    const deferred = [];
    let authHandler = null;
    let getSessionObservedPending = false;

    const client = {
        auth: {
            getSession() {
                getSessionObservedPending = CONTROL_IDS.every(id =>
                    controls[id].style.visibility === 'hidden'
                );
                return new Promise(() => {});
            },
            onAuthStateChange(handler) {
                authHandler = handler;
                return {
                    data: {
                        subscription: {
                            unsubscribe() {}
                        }
                    }
                };
            }
        }
    };
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
    const sandbox = {
        window: { dispatchEvent: event => dispatched.push(event) },
        document: { getElementById: id => controls[id] || null },
        CustomEvent: function CustomEvent(type, options) {
            this.type = type;
            this.detail = options.detail;
        },
        console: { log() {}, warn() {}, error() {} },
        setTimeout(callback, delay) {
            if (delay === 4000) callback();
            else deferred.push(callback);
            return deferred.length;
        },
        clearTimeout() {}
    };

    vm.runInNewContext(source, sandbox, { filename: 'js/auth.js' });
    const auth = sandbox.window.Auth;
    auth.getClient = () => client;
    auth.loadFacilitator = async function loadFacilitator() {
        this.facilitator = { id: `facilitator-for-${this.user.id}` };
    };
    auth.updateNotificationBadge = () => {};

    return {
        auth,
        controls,
        dispatched,
        deferred,
        getAuthHandler: () => authHandler,
        didGetSessionObservePending: () => getSessionObservedPending
    };
}

function assertPayload(event, { isLoggedIn, user, facilitator }) {
    assert.equal(event.type, 'authStateChanged');
    assert.deepEqual(
        Object.keys(event.detail).sort(),
        ['facilitator', 'isLoggedIn', 'user'],
        'authStateChanged payload keys remain unchanged'
    );
    assert.equal(event.detail.isLoggedIn, isLoggedIn);
    assert.equal(event.detail.user, user);
    assert.equal(event.detail.facilitator, facilitator);
}

function assertNeutral(controls) {
    for (const id of CONTROL_IDS) {
        assert.equal(controls[id].style.visibility, 'hidden', `${id} remains hidden while auth is unresolved`);
    }
}

function assertSignedIn(controls) {
    assert.equal(controls['auth-login-link'].style.display, 'none');
    assert.equal(controls['auth-login-link'].style.visibility, '');
    assert.equal(controls['auth-user-menu'].style.display, 'flex');
    assert.equal(controls['auth-user-menu'].style.visibility, '');
    assert.equal(controls['notification-bell'].style.display, 'block');
    assert.equal(controls['notification-bell'].style.visibility, '');
}

function assertSignedOut(controls) {
    assert.equal(controls['auth-login-link'].style.display, 'block');
    assert.equal(controls['auth-login-link'].style.visibility, '');
    assert.equal(controls['auth-user-menu'].style.display, 'none');
    assert.equal(controls['auth-user-menu'].style.visibility, '');
    assert.equal(controls['notification-bell'].style.display, 'none');
    assert.equal(controls['notification-bell'].style.visibility, '');
}

async function initializeThroughTimeout(harness) {
    const initPromise = harness.auth.init();

    assert.equal(
        harness.didGetSessionObservePending(),
        true,
        'init calls setUiPending before getSession'
    );
    assertNeutral(harness.controls);

    await initPromise;

    assert.equal(harness.auth.initialized, true);
    assert.equal(harness.auth._authResolved, false, 'timeout leaves auth unresolved');
    assert.equal(harness.auth.user, null);
    assertNeutral(harness.controls);
    assert.equal(harness.dispatched.length, 1);
    assertPayload(harness.dispatched[0], {
        isLoggedIn: false,
        user: null,
        facilitator: null
    });
}

async function resolveAuthEvent(harness, event, session) {
    const handler = harness.getAuthHandler();
    assert.equal(typeof handler, 'function', 'init registers the auth-state listener');
    const dispatchedBefore = harness.dispatched.length;

    handler(event, session);

    assert.equal(
        harness.deferred.length,
        1,
        `${event} should schedule exactly one UI resolution`
    );
    await harness.deferred.shift()();
    assert.equal(
        harness.dispatched.length,
        dispatchedBefore + 1,
        `${event} should dispatch authStateChanged after resolving UI`
    );
}

(async () => {
    const signedEventHarness = createHarness();
    await initializeThroughTimeout(signedEventHarness);

    const signedInUser = { id: 'signed-in-user' };
    await resolveAuthEvent(signedEventHarness, 'SIGNED_IN', makeSession(signedInUser));
    assert.equal(signedEventHarness.auth._authResolved, true);
    assertSignedIn(signedEventHarness.controls);
    assertPayload(signedEventHarness.dispatched.at(-1), {
        isLoggedIn: true,
        user: signedInUser,
        facilitator: signedEventHarness.auth.facilitator
    });

    await resolveAuthEvent(signedEventHarness, 'SIGNED_OUT', null);
    assertSignedOut(signedEventHarness.controls);
    assertPayload(signedEventHarness.dispatched.at(-1), {
        isLoggedIn: false,
        user: null,
        facilitator: null
    });

    const initialUserHarness = createHarness();
    await initializeThroughTimeout(initialUserHarness);
    const initialUser = { id: 'initial-session-user' };
    await resolveAuthEvent(initialUserHarness, 'INITIAL_SESSION', makeSession(initialUser));
    assert.equal(initialUserHarness.auth._authResolved, true);
    assertSignedIn(initialUserHarness.controls);
    assertPayload(initialUserHarness.dispatched.at(-1), {
        isLoggedIn: true,
        user: initialUser,
        facilitator: initialUserHarness.auth.facilitator
    });

    const initialNullHarness = createHarness();
    await initializeThroughTimeout(initialNullHarness);
    await resolveAuthEvent(initialNullHarness, 'INITIAL_SESSION', null);
    assert.equal(initialNullHarness.auth._authResolved, true);
    assertSignedOut(initialNullHarness.controls);
    assertPayload(initialNullHarness.dispatched.at(-1), {
        isLoggedIn: false,
        user: null,
        facilitator: null
    });

    console.log('auth-ui.test.js: all assertions passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
