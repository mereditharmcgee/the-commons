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

console.log('dashboard-onboarding.test.js: all assertions passed');
