// Phase 38: Dashboard, Onboarding & Visual Consistency
const C = require('./lib/checks');

async function verify() {
    console.log('\n\x1b[1mPhase 38: Dashboard, Onboarding & Visual Consistency\x1b[0m\n');
    C.setPhase('38');

    // DASH-01: dashboard.html contains onboarding-banner section
    C.checkFileContains('DASH-01', 'dashboard.html', /id="onboarding-banner"/,
        'dashboard.html has #onboarding-banner section');

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

    // DASH-04: admin.js has link-existing-discussion functionality
    C.checkFileContains('DASH-04', 'js/admin.js', /link-existing-discussion|linkDiscussion|link_discussion/i,
        'admin.js has link-existing-discussion UI');

    // REACT-08: profile.html has reactions-received and reactions-given sections
    C.checkFileContains('REACT-08', 'profile.html', /reactions-received/,
        'profile.html has reactions-received section');
    C.checkFileContains('REACT-08', 'profile.html', /reactions-given/,
        'profile.html has reactions-given section');

    // REACT-09: mcp-server catch_up includes reaction summary
    C.checkFileContains('REACT-09', 'mcp-server-the-commons/src/index.js', /getReactionsReceived|reaction.*summary|reactionsResult/i,
        'catch_up in MCP server includes reaction summary fetch');

    // ONBD-01: dashboard.js has localStorage onboarding gate
    C.checkFileContains('ONBD-01', 'js/dashboard.js', /tc_onboarding_dismissed/,
        'dashboard.js has tc_onboarding_dismissed localStorage gate');

    // ONBD-02: participate.html has "For Facilitators" section
    C.checkFileContains('ONBD-02', 'participate.html', /For Facilitators/i,
        'participate.html has "For Facilitators" section');

    // ONBD-03: participate.html has "For AI Agents" section
    C.checkFileContains('ONBD-03', 'participate.html', /For AI Agents/i,
        'participate.html has "For AI Agents" section');

    // ONBD-04: dashboard.js uses Utils.showLoading (not only inline loading HTML)
    C.checkFileContains('ONBD-04', 'js/dashboard.js', /Utils\.showLoading/,
        'dashboard.js uses Utils.showLoading');

    // ONBD-05: dashboard.js uses Utils.showEmpty and Utils.showError for state handling
    C.checkFileContains('ONBD-05', 'js/dashboard.js', /Utils\.showEmpty/,
        'dashboard.js uses Utils.showEmpty');
    C.checkFileContains('ONBD-05', 'js/dashboard.js', /Utils\.showError/,
        'dashboard.js uses Utils.showError');

    return C.summary();
}

if (require.main === module) verify().catch(console.error);
module.exports = verify;
