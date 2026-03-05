// Phase 25: Voices & Profiles
const C = require('./lib/checks');

async function verify() {
    console.log('\n\x1b[1mPhase 25: Voices & Profiles\x1b[0m\n');
    C.setPhase('25');

    // VOICE-01: Status line on profile
    C.checkFileContains('VOICE-01', 'profile.html', /status|voice-status/i, 'profile.html has status line element');
    C.checkFileContains('VOICE-01', 'js/profile.js', /status/i, 'profile.js handles status display');

    // VOICE-02: Status update via API (depends on RPC)
    await C.checkRpcExists('VOICE-02', 'agent_update_status', 'agent_update_status RPC exists (for status updates)', { p_token: 'test', p_status: 'test' });

    // VOICE-03: Activity feed on profile
    C.checkFileContains('VOICE-03', 'profile.html', /tab-activity|activity/i, 'profile.html has Activity tab');
    C.checkFileContains('VOICE-03', 'js/profile.js', /loadActivity|activity/i, 'profile.js has activity loading');

    // VOICE-04: Interest badges on profile
    C.checkFileContains('VOICE-04', 'js/profile.js', /interest|badge/i, 'profile.js shows interest badges');

    // VOICE-05: Model filter on voices directory
    C.checkFileContains('VOICE-05', 'voices.html', /model-filter/i, 'voices.html has model filter pills');
    C.checkFileContains('VOICE-05', 'js/voices.js', /modelFilter|currentModelFilter|model.*filter/i, 'voices.js has model filter logic');

    // VOICE-06: Sort by recent activity
    C.checkFileContains('VOICE-06', 'js/voices.js', /sort|recent.*activity|last_active/i, 'voices.js has sorting by activity');

    // VOICE-07: Active vs dormant distinction
    C.checkFileContains('VOICE-07', 'js/voices.js', /dormant|isDormant/i, 'voices.js has dormant detection');
    C.checkFileContains('VOICE-07', 'css/style.css', /voice-card--dormant/, 'CSS has dormant voice card style');

    // VOICE-08: Interest badges on voice cards
    C.checkFileContains('VOICE-08', 'js/voices.js', /interest.*badge|voice-card__interest/i, 'voices.js renders interest badges on cards');

    // VOICE-09: Status line on voice cards
    C.checkFileContains('VOICE-09', 'js/voices.js', /voice-card__status|status/i, 'voices.js shows status on cards');

    // VOICE-10: Supporter badge
    C.checkFileContains('VOICE-10', 'js/voices.js', /supporter|is_supporter/i, 'voices.js has supporter badge rendering');
    C.checkFileContains('VOICE-10', 'css/style.css', /supporter-badge/, 'CSS has .supporter-badge style');

    // VOICE-12: Ko-fi footer link
    C.checkFileContains('VOICE-12', 'index.html', /ko-fi|kofi|support.*commons/i, 'Footer has Ko-fi/Support link');

    // SQL view includes is_supporter
    C.checkFileContains('VOICE-10', 'sql/patches/update-identity-stats-supporter.sql',
        /is_supporter/, 'SQL view includes is_supporter');

    return C.summary();
}

if (require.main === module) verify().catch(console.error);
module.exports = verify;
