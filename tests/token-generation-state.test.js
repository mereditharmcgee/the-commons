const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadOnboarding() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'dashboard-onboarding.js'), 'utf8');
    const sandbox = { window: {}, console, Date, URL, URLSearchParams, setTimeout, clearTimeout };
    vm.runInNewContext(source, sandbox, { filename: 'js/dashboard-onboarding.js' });
    return sandbox.window.DashboardOnboarding;
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

async function verify() {
    const onboarding = loadOnboarding();
    assert.equal(typeof onboarding.createTokenGenerationState, 'function',
        'production onboarding exposes the token generation lifecycle controller');

    const identity = { id: 'voice-1', name: 'Lattice', model: 'GPT' };
    const startedAt = new Date('2026-07-14T16:00:00.000Z');
    const successDeferred = deferred();
    const state = onboarding.createTokenGenerationState();
    let writeCalls = 0;

    const firstRun = state.runGeneration(identity, startedAt, () => {
        writeCalls++;
        return successDeferred.promise;
    });
    assert.equal(writeCalls, 1, 'the first direct write starts once');
    assert.equal(state.isBlocked(), true, 'generation blocks before the write promise settles');
    assert.equal(state.getCurrent().phase, 'in_flight');
    assert.equal(state.getCurrent().identityId, identity.id,
        'modal reopen can lock to the in-flight identity');
    assert.equal(Object.hasOwn(state.getCurrent(), 'token'), false,
        'in-flight state never contains the private token');

    let secondWriteInvoked = false;
    const reopenedRun = await state.runGeneration(identity, startedAt, async () => {
        secondWriteInvoked = true;
        writeCalls++;
        return { token: 'must-not-run', tokenId: 'must-not-run' };
    });
    assert.equal(reopenedRun.status, 'blocked');
    assert.equal(secondWriteInvoked, false, 'close/reopen cannot invoke a second write');
    assert.equal(writeCalls, 1);
    assert.equal(state.isBlocked(), true, 'generation stays unavailable after modal reopen');

    successDeferred.resolve({ token: 'private-success', tokenId: 'token-1' });
    const success = await firstRun;
    assert.equal(success.status, 'success');
    assert.equal(success.value.tokenId, 'token-1');
    assert.equal(state.getCurrent(), null, 'known success atomically clears the in-flight lock');

    const uncertainDeferred = deferred();
    const uncertainRun = state.runGeneration(identity, startedAt, () => uncertainDeferred.promise);
    assert.equal(state.getCurrent().phase, 'in_flight');
    uncertainDeferred.reject(new Error('network outcome unknown'));
    const uncertain = await uncertainRun;
    assert.equal(uncertain.status, 'uncertain');
    assert.equal(state.getCurrent().phase, 'pending',
        'an uncertain outcome atomically becomes pending reconciliation');
    assert.equal(state.isBlocked(), true, 'uncertain settlement remains blocked');
    assert.equal(Object.hasOwn(state.getCurrent(), 'token'), false,
        'pending reconciliation state never contains the private token');

    const pendingAttemptId = state.getCurrent().attemptId;
    assert.equal(typeof state.recordCandidate, 'function',
        'production state can retain reconciled candidate context');
    assert.equal(typeof state.clearPending, 'function',
        'production state can release only a matching reconciled attempt');
    assert.equal(state.recordCandidate(pendingAttemptId, 'token-2'), true);
    assert.equal(state.getCurrent().candidateId, 'token-2');
    assert.equal(state.clearPending(pendingAttemptId + 1), false,
        'a stale async result cannot clear a newer pending attempt');
    assert.equal(state.isBlocked(), true);
    assert.equal(state.clearPending(pendingAttemptId), true);
    assert.equal(state.getCurrent(), null,
        'only the matching reconciled attempt can release generation');

    console.log('token-generation-state.test.js: all assertions passed');
}

verify().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
