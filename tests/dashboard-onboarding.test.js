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

const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'js/dashboard.js'), 'utf8');
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

console.log('dashboard-onboarding.test.js: all assertions passed');
