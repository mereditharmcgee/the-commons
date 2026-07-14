// Phase 38: Dashboard, Onboarding & Visual Consistency
const C = require('./lib/checks');

async function verify() {
    console.log('\n\x1b[1mPhase 38: Dashboard, Onboarding & Visual Consistency\x1b[0m\n');
    C.setPhase('38');

    // DASH-02: display name editor already exists (pre-satisfied from earlier phases)
    C.checkFileContains('DASH-02', 'js/dashboard.js', /displayNameInput|display-name/i,
        'dashboard.js has display name editor logic');
    C.checkFileContains('DASH-02', 'dashboard.html', /id="display-name"/,
        'dashboard.html has display-name input');

    // DASH-03: human-voice-section already exists (pre-satisfied from Phase 37)
    C.checkFileContains('DASH-03', 'dashboard.html', /id="human-voice-section"/,
        'dashboard.html has #human-voice-section');
    C.checkFileContains('DASH-03', 'js/dashboard.js', /renderHumanVoiceSection/,
        'dashboard.js has renderHumanVoiceSection function');

    // DASH-05: dashboard.js identity card template includes reaction footer
    C.checkFileContains('DASH-05', 'js/dashboard.js', /identity-card__reactions|reaction.*footer|reactionFooter/i,
        'dashboard.js identity card template includes reaction footer');

    // DASH-06: dashboard.js has recent-activity-section
    C.checkFileContains('DASH-06', 'js/dashboard.js', /recent-activity-section|loadRecentActivity/i,
        'dashboard.js renders recent-activity-section');

    // DASH-07: admin.js render functions include reaction counts
    C.checkFileContains('DASH-07', 'js/admin.js', /reactions.*count|reactionCount|reaction.*badge/i,
        'admin.js render functions include reaction count badges');

    // REACT-08: profile.html has reactions-received and reactions-given sections
    C.checkFileContains('REACT-08', 'profile.html', /reactions-received/,
        'profile.html has reactions-received section');
    C.checkFileContains('REACT-08', 'profile.html', /reactions-given/,
        'profile.html has reactions-given section');

    // REACT-09: mcp-server catch_up includes reaction summary
    C.checkFileContains('REACT-09', 'mcp-server-the-commons/src/index.js', /getReactionsReceived|reaction.*summary|reactionsResult/i,
        'catch_up in MCP server includes reaction summary fetch');

    const dashboardSource = C.readFile('js/dashboard.js');

    C.checkFileNotContains('ONBD38-01', 'js/dashboard.js', /tc_onboarding_(dismissed|token_generated)/,
        'dashboard onboarding ignores browser-local progress keys');
    C.checkFileNotContains('ONBD38-02', 'dashboard.html', /id="onboarding-banner"/,
        'dashboard removes the account-wide onboarding banner');
    C.checkFileContains('ONBD38-03', 'js/dashboard.js',
        /id,post_count,marginalia_count,postcard_count,last_active/,
        'identity setup enumerates public stats columns');
    C.checkFileContains('ONBD38-04', 'js/dashboard.js', /DashboardOnboarding\.deriveSetupState/,
        'identity cards use the pure setup-state reducer');
    C.checkFileContains('ONBD38-05', 'js/agent-admin.js', /preloadedIdentities/,
        'token loading accepts preloaded identities');
    C.checkFileContains('ONBD38-06', 'dashboard.html', /Copy private token/,
        'token result has a private-token-only action');
    C.checkFileContains('ONBD38-07', 'dashboard.html', /Copy setup instructions/,
        'token result has a separate instructions action');
    C.checkFileNotContains('ONBD38-08', 'dashboard.html', /Copy Full Agent Setup/,
        'secret-bearing full setup action is removed');
    C.checkFileNotContains('ONBD38-09', 'js/dashboard.js', /generateAgentSetupText\(token/,
        'setup-copy generation does not accept the real token');
    C.checkFileContains('ONBD38-10', 'js/dashboard.js', /findTokenCandidate/,
        'token generation reconciles uncertain requests before retry');
    C.checkFileContains('ONBD38-11', 'js/dashboard.js',
        /getAllMyTokens\(\[identity\], \{ throwOnError: true \}\)/,
        'token reconciliation uses an owner-scoped read that surfaces failures');
    C.checkFileContains('ONBD38-12', 'js/dashboard.js',
        /showTokenReconciliationUnavailable[\s\S]*Check token status/,
        'failed reconciliation blocks generation behind a safe status recheck');
    C.checkFileContains('ONBD38-13', 'js/dashboard.js', /Setting up.*identity\.name/,
        'setup panel names the identity being configured');
    C.checkFileContains('ONBD38-14', 'js/dashboard.js',
        /class="[^"]*setup-expand[^"]*"[\s\S]{0,250}aria-expanded="\$\{expandedSetupId === identity\.id\}"[\s\S]{0,150}aria-controls="identity-setup-\$\{identity\.id\}"/,
        'setup action exposes expanded state and controls its identity panel');
    C.checkFileContains('ONBD38-15', 'js/dashboard.js',
        /card\?\.querySelector\('\.setup-expand'\)\s*\|\|\s*card\?\.querySelector\('\.identity-card__name a'\)/,
        'collapse focus falls back for participating identities without setup actions');
    C.checkFileContains('ONBD38-16', 'js/dashboard.js', /Check connection/,
        'connection stage refreshes server token state');
    C.checkFileContains('ONBD38-17', 'js/dashboard.js', /buildFirstVisitBrief/,
        'first visit copies credential-free orientation guidance');
    C.checkFileNotContains('ONBD38-18', 'js/dashboard.js', /validate_agent_token.*generatedTokenContext\.token/,
        'dashboard does not validate its own copy of the token');
    C.checkFileContains('ONBD38-19', 'js/dashboard.js',
        /Auth\.getMyIdentities\(\{\s*includeInactive:\s*true,\s*throwOnError:\s*true\s*\}\)/,
        'dashboard identity truth surfaces owner-read failures');
    const authSource = C.readFile('js/auth.js');
    const authInitIndex = authSource.indexOf('async init()');
    const authGetClientIndex = authSource.indexOf('\n    getClient()', authInitIndex);
    const authInitSource = authInitIndex !== -1 && authGetClientIndex !== -1
        ? authSource.slice(authInitIndex, authGetClientIndex)
        : '';
    const authInitializedGuardIndex = authInitSource.indexOf('if (this.initialized) return;');
    const authPendingIndex = authInitSource.indexOf('this.setUiPending()');
    const authGetSessionIndex = authInitSource.indexOf('.auth.getSession()');
    if (authInitializedGuardIndex !== -1 && authPendingIndex > authInitializedGuardIndex &&
        authGetSessionIndex > authPendingIndex) {
        C.pass('ONBD-18', 'Auth.init hides auth controls before session resolution');
    } else {
        C.fail('ONBD-18', 'Auth.init hides auth controls before session resolution',
            'Auth.init must call setUiPending() after its initialized guard and before getSession()');
    }
    const loadIdentitiesIndex = dashboardSource.indexOf('async function loadIdentities(');
    const humanVoiceIndex = dashboardSource.indexOf('// Human Voice Section', loadIdentitiesIndex);
    const loadIdentitiesSource = dashboardSource.slice(loadIdentitiesIndex, humanVoiceIndex);
    const authoritativeReadIndex = loadIdentitiesSource.indexOf('await refreshDashboardIdentityData()');
    const setupUrlIndex = loadIdentitiesSource.indexOf('if (!setupUrlInitialized)');
    const emptyStateIndex = loadIdentitiesSource.indexOf('identity-empty-onboarding');
    const loadFailureSource = loadIdentitiesSource.slice(loadIdentitiesSource.lastIndexOf('} catch (error) {'));
    if (authoritativeReadIndex !== -1 && authoritativeReadIndex < setupUrlIndex &&
        authoritativeReadIndex < emptyStateIndex && loadFailureSource.includes('Utils.showError') &&
        !/setupUrlInitialized\s*=|searchParams\.delete\('setup'\)/.test(loadFailureSource)) {
        C.pass('ONBD38-20', 'failed owner reads preserve setup URL and render no false empty state');
    } else {
        C.fail('ONBD38-20', 'failed owner reads preserve setup URL and render no false empty state',
            'URL initialization and empty rendering must occur only after authoritative identity refresh');
    }
    const checkConnectionIndex = dashboardSource.indexOf('async function checkIdentityConnection(');
    const checkConnectionEndIndex = dashboardSource.indexOf('async function loadIdentities(', checkConnectionIndex);
    const checkConnectionSource = dashboardSource.slice(checkConnectionIndex, checkConnectionEndIndex);
    if (checkConnectionSource.includes('const previousIdentityData = dashboardIdentityData') &&
        checkConnectionSource.includes('dashboardIdentityData = previousIdentityData') &&
        checkConnectionSource.includes('catch (error)') && checkConnectionSource.includes('status.textContent')) {
        C.pass('ONBD38-21', 'failed connection refresh preserves the current identity panel and reports in place');
    } else {
        C.fail('ONBD38-21', 'failed connection refresh preserves the current identity panel and reports in place',
            'Check connection must restore confirmed data and use the existing live region on read failure');
    }
    C.checkFileContains('ONBD38-22', 'js/dashboard.js',
        /createTokenGenerationState/,
        'dashboard uses the production token-generation lifecycle controller');
    const openTokenModalIndex = dashboardSource.indexOf('function openTokenModal(');
    const closeTokenModalIndex = dashboardSource.indexOf('function closeTokenModal()');
    const closeTokenModalEndIndex = dashboardSource.indexOf('if (closeTokenModalBtn)', closeTokenModalIndex);
    const openTokenModalSource = dashboardSource.slice(openTokenModalIndex, closeTokenModalIndex);
    const closeTokenModalSource = dashboardSource.slice(closeTokenModalIndex, closeTokenModalEndIndex);
    if (openTokenModalSource.includes('tokenGenerationState.getCurrent()') &&
        !closeTokenModalSource.includes('tokenGenerationState.clearPending(')) {
        C.pass('ONBD38-23', 'modal reopen resumes pending reconciliation without close clearing it');
    } else {
        C.fail('ONBD38-23', 'modal reopen resumes pending reconciliation without close clearing it',
            'openTokenModal must inspect pending reconciliation and closeTokenModal must preserve it');
    }
    C.checkFileContains('ONBD38-24', 'js/dashboard.js',
        /tokenGenerationState\.runGeneration[\s\S]*AgentAdmin\.generateToken/,
        'in-flight state is recorded before the direct token write is invoked');
    const modalCloseGuardCount = (dashboardSource.match(/if \(!isTokenModalOpen\(\)\)/g) || []).length;
    if (modalCloseGuardCount >= 2) {
        C.pass('ONBD38-25', 'late create/reveal secrets are discarded after modal close');
    } else {
        C.fail('ONBD38-25', 'late create/reveal secrets are discarded after modal close',
            'both original generation and recovery reveal must check the live modal before storing a token');
    }
    const identityCacheIndex = dashboardSource.indexOf('let dashboardIdentityData =');
    const tokenDeepLinkIndex = dashboardSource.indexOf("if (window.location.hash === '#tokens'");
    if (identityCacheIndex !== -1 && tokenDeepLinkIndex !== -1 && identityCacheIndex < tokenDeepLinkIndex) {
        C.pass('ONBD38-26', '#tokens deep-link initializes identity data before synchronous expansion');
    } else {
        C.fail('ONBD38-26', '#tokens deep-link initializes identity data before synchronous expansion',
            'dashboardIdentityData must be initialized before toggleTokensBtn.click() can call loadTokens()');
    }

    // ONBD-02: participate.html has "For Facilitators" section
    C.checkFileContains('ONBD38-27', 'participate.html', /For Facilitators/i,
        'participate.html has "For Facilitators" section');

    // ONBD-03: participate.html has "For AI Agents" section
    C.checkFileContains('ONBD38-28', 'participate.html', /For AI Agents/i,
        'participate.html has "For AI Agents" section');

    // ONBD-04: dashboard.js uses Utils.showLoading (not only inline loading HTML)
    C.checkFileContains('ONBD38-29', 'js/dashboard.js', /Utils\.showLoading/,
        'dashboard.js uses Utils.showLoading');

    // ONBD-05: dashboard.js uses Utils.showEmpty and Utils.showError for state handling
    C.checkFileContains('ONBD38-30', 'js/dashboard.js', /Utils\.showEmpty/,
        'dashboard.js uses Utils.showEmpty');
    C.checkFileContains('ONBD38-31', 'js/dashboard.js', /Utils\.showError/,
        'dashboard.js uses Utils.showError');

    return C.summary();
}

if (require.main === module) verify().catch(console.error);
module.exports = verify;
