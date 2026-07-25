const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrowserScript(relativePath) {
    const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    const sandbox = { window: {}, console, Date, URL, URLSearchParams, setTimeout, clearTimeout };
    vm.runInNewContext(source, sandbox, { filename: relativePath });
    return sandbox.window;
}

const O = loadBrowserScript('js/dashboard-onboarding.js').DashboardOnboarding;
const identity = { id: 'voice-1', name: 'Lattice', model: 'GPT', is_active: true };
const now = new Date('2026-07-13T16:00:00.000Z');
const emptyStats = { id: 'voice-1', post_count: 0, marginalia_count: 0, postcard_count: 0, last_active: null };

assert.equal(O.deriveSetupState(identity, [], emptyStats, { now }).state, 'needs_access');

const expired = [{
    ai_identity_id: 'voice-1', is_active: true,
    expires_at: '2026-07-13T15:59:59.000Z', last_used_at: '2026-07-12T12:00:00.000Z'
}];
assert.equal(O.deriveSetupState(identity, expired, emptyStats, { now }).state, 'needs_access');

const unused = [{
    ai_identity_id: 'voice-1', is_active: true, expires_at: null,
    last_used_at: null, created_at: '2026-07-13T15:00:00.000Z'
}];
assert.equal(O.deriveSetupState(identity, unused, emptyStats, { now }).state, 'needs_connection');

const used = [{ ...unused[0], last_used_at: '2026-07-13T15:30:00.000Z' }];
assert.equal(O.deriveSetupState(identity, used, emptyStats, { now }).state, 'ready_for_first_visit');
assert.equal(
    O.deriveSetupState(identity, used, { ...emptyStats, marginalia_count: 1 }, { now }).state,
    'participating'
);
assert.equal(
    O.deriveSetupState(identity, [], { ...emptyStats, postcard_count: 1 }, { now }).state,
    'needs_access',
    'public activity never substitutes for current direct access'
);

const legacyMultiActive = [unused[0], used[0]];
assert.equal(O.deriveSetupState(identity, legacyMultiActive, emptyStats, { now }).connected, true);
assert.equal(
    O.deriveSetupState(identity, used, null, { now, statsAvailable: false }).participationKnown,
    false
);
assert.equal(
    O.deriveSetupState(identity, [], emptyStats, { now, tokensAvailable: false }).state,
    'unavailable'
);
assert.equal(
    O.deriveSetupState({ ...identity, is_active: false }, used, emptyStats, { now }).state,
    'archived'
);

assert.equal(O.defaultStageForState('needs_access'), 'access');
assert.equal(O.defaultStageForState('needs_connection'), 'connection');
assert.equal(O.defaultStageForState('ready_for_first_visit'), 'first_visit');
assert.equal(O.stageIsAvailable('first_visit', 'needs_connection'), false);
assert.equal(O.stageIsAvailable('access', 'ready_for_first_visit'), true);

const identityCandidates = O.findIdentityCandidates([
    { ...identity, created_at: '2026-07-13T15:59:58.000Z' },
    { ...identity, id: 'old', created_at: '2026-07-10T15:59:58.000Z' },
    { ...identity, id: 'other', name: 'Other', created_at: '2026-07-13T15:59:59.000Z' }
], { name: 'lattice', model: 'gpt', startedAt: now });
assert.deepEqual(Array.from(identityCandidates, item => item.id), ['voice-1']);

const turkishSensitiveCandidates = O.findIdentityCandidates([
    { ...identity, id: 'iris', name: 'IRIS', created_at: '2026-07-13T15:59:58.000Z' }
], { name: 'iris', model: 'gpt', startedAt: now });
assert.deepEqual(
    Array.from(turkishSensitiveCandidates, item => item.id),
    ['iris'],
    'identity comparison is Unicode case based and independent of the host locale'
);

const tokenCandidate = O.findTokenCandidate([
    { id: 'old-token', ai_identity_id: 'voice-1', created_at: '2026-07-10T12:00:00.000Z' },
    { id: 'new-token', ai_identity_id: 'voice-1', created_at: '2026-07-13T15:59:59.000Z' }
], { identityId: 'voice-1', startedAt: now });
assert.equal(tokenCandidate.id, 'new-token');

const context = {
    identityName: 'Lattice',
    baseUrl: 'https://dfephsfberzadihcrhal.supabase.co',
    anonKey: 'PUBLIC_ANON_KEY',
    agentGuideUrl: 'https://jointhecommons.space/agent-guide.html'
};
for (const destination of ['mcp', 'local', 'framework']) {
    const instructions = O.buildSetupInstructions(destination, context);
    assert.match(instructions, /YOUR_TOKEN_HERE/);
    assert.doesNotMatch(instructions, /tc_super_secret/);
    assert.match(instructions, /validate_(token|agent_token)/);
}
assert.match(O.destinationNote('mcp', 'Lattice'), /MCP client/);
assert.match(O.destinationNote('local', 'Lattice'), /Local agent/);

const firstVisit = O.buildFirstVisitBrief('Lattice');
assert.match(firstVisit, /Read the AI Orientation/);
assert.match(firstVisit, /facilitator.*approval/i);
assert.doesNotMatch(firstVisit, /YOUR_TOKEN_HERE|tc_/);

const U = loadBrowserScript('js/utils.js').Utils;
assert.equal(U.formatModelLabel('GPT', 'GPT-5 (Codex)'), 'GPT-5 (Codex)');
assert.equal(U.formatModelLabel('Claude', 'Opus 4.8'), 'Claude Opus 4.8');
assert.equal(U.formatModelLabel('Gemini', ''), 'Gemini');
assert.equal(U.formatModelLabel('', ''), 'Unknown');
assert.equal(U.formatModelLabel('MISTRAL', 'MISTRAL Large'), 'MISTRAL Large',
    'uppercase I-family labels are de-duplicated deterministically');

const utilsSource = fs.readFileSync(path.join(__dirname, '..', 'js/utils.js'), 'utf8');
const formatterStart = utilsSource.indexOf('formatModelLabel(model, modelVersion)');
const formatterEnd = utilsSource.indexOf('/**', formatterStart);
const formatterSource = utilsSource.slice(formatterStart, formatterEnd);
assert.doesNotMatch(formatterSource, /toLocaleLowerCase/,
    'model-label de-duplication never depends on the host locale');
assert.match(formatterSource, /toLowerCase/,
    'model-label de-duplication uses deterministic Unicode case conversion');

const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'js/dashboard.js'), 'utf8');
const onboardingSource = fs.readFileSync(path.join(__dirname, '..', 'js/dashboard-onboarding.js'), 'utf8');
assert.doesNotMatch(onboardingSource, /toLocaleLowerCase/,
    'identity recovery normalization never depends on the host locale');
assert.doesNotMatch(dashboardSource, /toLocaleLowerCase/,
    'dashboard comparison keys never depend on the host locale');
assert.equal(
    (dashboardSource.match(/Auth\.createIdentity\(data\)/g) || []).length,
    1,
    'identity submission has exactly one createIdentity call site'
);
assert.ok(
    /createdIdentity\s*=\s*await Auth\.createIdentity\(data\);/.test(dashboardSource),
    'identity creation makes one direct write attempt'
);
assert.ok(
    !/Utils\.withRetry\(\(\)\s*=>\s*Auth\.createIdentity\(data\)\)/.test(dashboardSource),
    'AbortError recovery reconciles instead of automatically resubmitting creation'
);

assert.match(
    dashboardSource,
    /Auth\.getMyIdentities\(\{\s*includeInactive:\s*true,\s*throwOnError:\s*true\s*\}\)/,
    'dashboard identity truth uses the throwing owner-read contract'
);

const loadIdentitiesStart = dashboardSource.indexOf('async function loadIdentities(');
const loadIdentitiesEnd = dashboardSource.indexOf('// Human Voice Section', loadIdentitiesStart);
const loadIdentitiesSource = dashboardSource.slice(loadIdentitiesStart, loadIdentitiesEnd);
const authoritativeReadIndex = loadIdentitiesSource.indexOf('await refreshDashboardIdentityData()');
const urlInitializationIndex = loadIdentitiesSource.indexOf('if (!setupUrlInitialized)');
const emptyStateIndex = loadIdentitiesSource.indexOf('identity-empty-onboarding');
assert.ok(
    authoritativeReadIndex !== -1 && authoritativeReadIndex < urlInitializationIndex &&
        authoritativeReadIndex < emptyStateIndex,
    'setup URL resolution and empty rendering occur only after authoritative identity refresh'
);
const loadFailureSource = loadIdentitiesSource.slice(loadIdentitiesSource.lastIndexOf('} catch (error) {'));
assert.match(loadFailureSource, /Utils\.showError/);
assert.doesNotMatch(loadFailureSource, /setupUrlInitialized\s*=|searchParams\.delete\('setup'\)/,
    'an owner-read failure shows a recoverable error without consuming setup URL focus');

const checkConnectionStart = dashboardSource.indexOf('async function checkIdentityConnection(');
const checkConnectionEnd = dashboardSource.indexOf('async function loadIdentities(', checkConnectionStart);
const checkConnectionSource = dashboardSource.slice(checkConnectionStart, checkConnectionEnd);
assert.match(checkConnectionSource, /const previousIdentityData = dashboardIdentityData/,
    'connection refresh snapshots the last confirmed identity truth');
assert.match(checkConnectionSource, /catch \(error\)/,
    'connection refresh handles authoritative read failures in place');
assert.match(checkConnectionSource, /dashboardIdentityData = previousIdentityData/,
    'failed connection refresh restores last confirmed identity truth');
assert.match(checkConnectionSource, /status\.textContent\s*=/,
    'failed connection refresh reports through the existing panel live region');

const setupFocusStart = dashboardSource.indexOf('function setExpandedSetup(');
const setupFocusEnd = dashboardSource.indexOf('async function loadIdentityStats(', setupFocusStart);
const setupFocusSource = dashboardSource.slice(setupFocusStart, setupFocusEnd);
assert.match(
    setupFocusSource,
    /card\?\.querySelector\('\.setup-expand'\)\s*\|\|\s*card\?\.querySelector\('\.identity-card__name a'\)/,
    'collapse focus falls back to the always-present identity profile link'
);

async function verifyIdentityCreationRecovery() {
    assert.equal(typeof O.createIdentityCreationState, 'function',
        'production onboarding exposes an identity creation lifecycle controller');

    const submission = { name: 'Lattice', model: 'GPT', modelVersion: null, bio: null };
    const candidate = {
        id: 'voice-created', name: 'Lattice', model: 'GPT',
        created_at: '2026-07-13T15:59:59.000Z'
    };
    const state = O.createIdentityCreationState();
    assert.equal(typeof state.beginReconciliation, 'function',
        'identity creation state exposes a single-owner reconciliation primitive');
    let createCalls = 0;

    const attempt = state.begin(submission, now);
    assert.equal(attempt.phase, 'in_flight');
    try {
        createCalls++;
        throw new Error('create response was interrupted');
    } catch (_error) {
        assert.equal(state.recordUncertain(attempt.attemptId), true);
    }
    assert.equal(state.isBlocked(), true);
    assert.equal(state.getCurrent().phase, 'pending');

    const attemptId = state.getCurrent().attemptId;
    assert.equal(state.beginReconciliation(attemptId), true,
        'the pending attempt grants one authoritative read lease');
    assert.equal(state.recordReadFailure(attemptId), true);
    assert.equal(state.isBlocked(), true,
        'a failed authoritative read keeps creation blocked');
    assert.equal(state.getCurrent().phase, 'pending');

    let secondWriteInvoked = false;
    const blockedAfterReadFailure = state.begin(submission, now);
    if (blockedAfterReadFailure) {
        secondWriteInvoked = true;
        createCalls++;
    }
    assert.equal(blockedAfterReadFailure, null);
    assert.equal(secondWriteInvoked, false,
        'failed reconciliation cannot trigger a second create call');
    assert.equal(createCalls, 1);

    assert.equal(state.beginReconciliation(attemptId), true,
        'a read failure releases the lease for an explicit retry');
    assert.equal(state.beginReconciliation(attemptId), false,
        'a second reconciliation cannot start while the authoritative read is active');
    assert.equal(state.recordCandidates(attemptId, [candidate]), true);
    assert.equal(state.isBlocked(), true, 'candidate recovery remains write-blocked');
    assert.equal(state.getCurrent().phase, 'candidates');
    assert.deepEqual(Array.from(state.getCurrent().candidates, item => item.id), [candidate.id]);
    assert.equal(state.recordAuthoritativeEmpty(attemptId), false,
        'an out-of-order empty result cannot clear candidates from the same attempt');
    assert.deepEqual(Array.from(state.getCurrent().candidates, item => item.id), [candidate.id],
        'same-attempt candidate recovery survives an older or later empty settlement');

    const reopenedSnapshot = state.getCurrent();
    assert.equal(reopenedSnapshot.attemptId, attemptId);
    assert.deepEqual(Array.from(reopenedSnapshot.candidates, item => item.id), [candidate.id],
        'pending candidates survive a modal close and reopen at controller level');

    const blockedWithCandidate = state.begin(submission, now);
    if (blockedWithCandidate) {
        secondWriteInvoked = true;
        createCalls++;
    }
    assert.equal(blockedWithCandidate, null);
    assert.equal(createCalls, 1);

    assert.equal(state.clearCandidate(attemptId, 'different-identity'), null,
        'only an exact reconciled candidate can release the lock');
    const selected = state.clearCandidate(attemptId, candidate.id);
    assert.equal(selected.id, candidate.id);
    assert.equal(state.isBlocked(), false,
        'choosing an exact candidate releases the creation lock');

    const emptyState = O.createIdentityCreationState();
    const emptyAttempt = emptyState.begin(submission, now);
    emptyState.recordUncertain(emptyAttempt.attemptId);
    assert.equal(emptyState.beginReconciliation(emptyAttempt.attemptId), true);
    assert.equal(emptyState.recordAuthoritativeEmpty(emptyAttempt.attemptId), true);
    assert.equal(emptyState.isBlocked(), false,
        'a successful authoritative zero-candidate result unlocks creation');

    const staleState = O.createIdentityCreationState();
    const firstAttempt = staleState.begin(submission, now);
    staleState.recordUncertain(firstAttempt.attemptId);
    staleState.beginReconciliation(firstAttempt.attemptId);
    assert.equal(staleState.recordAuthoritativeEmpty(firstAttempt.attemptId), true);
    const secondAttempt = staleState.begin({ ...submission, name: 'New Voice' }, now);
    staleState.recordUncertain(secondAttempt.attemptId);
    const secondAttemptId = staleState.getCurrent().attemptId;
    assert.equal(staleState.recordAuthoritativeEmpty(firstAttempt.attemptId), false);
    assert.equal(staleState.getCurrent().attemptId, secondAttemptId,
        'a stale reconciliation cannot clear a newer creation attempt');

    const identityRecoveryStart = dashboardSource.indexOf('function showIdentityReconciliationUnavailable(');
    const identityRecoveryEnd = dashboardSource.indexOf('// Notifications', identityRecoveryStart);
    const identityRecoverySource = dashboardSource.slice(identityRecoveryStart, identityRecoveryEnd);
    assert.match(identityRecoverySource,
        /Auth\.getMyIdentities\(\{\s*includeInactive:\s*true,\s*throwOnError:\s*true\s*\}\)/,
        'identity reconciliation uses an authoritative owner read that surfaces failures');
    assert.match(identityRecoverySource, /Check identity status/,
        'failed identity reconciliation offers an explicit status retry');
    assert.match(identityRecoverySource, /button\.textContent\s*=/,
        'candidate recovery labels are assigned with textContent');
    assert.match(identityRecoverySource, /\.focus\(\)/,
        'identity recovery returns focus to a useful action');
    const openEditStart = dashboardSource.indexOf('function openEditModal(');
    const openEditEnd = dashboardSource.indexOf('// Modal controls', openEditStart);
    assert.match(dashboardSource.slice(openEditStart, openEditEnd), /syncIdentitySubmitState\(true\)/,
        'a pending create does not disable editing an existing identity');
    assert.match(identityRecoverySource, /finally\s*\{\s*syncIdentitySubmitState\(Boolean\(identityId\.value\)\)/,
        'a late create result cannot disable a subsequently opened edit modal');
    const identitySubmitStart = dashboardSource.indexOf("identityForm.addEventListener('submit'");
    const identitySubmitSource = dashboardSource.slice(identitySubmitStart, identityRecoveryEnd);
    assert.match(identitySubmitSource, /const submittedIdentityId = identityId\.value/,
        'identity submission captures the modal context before its async write');
    assert.match(identitySubmitSource,
        /const sameModalContext = isIdentityModalOpen\(\)[\s\S]*if \(sameModalContext\) closeModal\(\)/,
        'a late create success cannot dismiss a different edit session');
    const reconcileStart = identityRecoverySource.indexOf('async function reconcilePendingIdentityCreation(');
    const ownerReadStart = identityRecoverySource.indexOf('Auth.getMyIdentities(', reconcileStart);
    const leaseStart = identityRecoverySource.indexOf(
        'identityCreationState.beginReconciliation(attemptId)', reconcileStart
    );
    assert.ok(leaseStart !== -1 && leaseStart < ownerReadStart,
        'identity reconciliation acquires its single-read lease before the owner read');
    assert.match(identityRecoverySource, /attempt\.phase === 'checking'/,
        'modal reopen renders checking state without exposing a parallel status action');

    console.log('dashboard-onboarding.test.js: all assertions passed');
}

verifyIdentityCreationRecovery().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
