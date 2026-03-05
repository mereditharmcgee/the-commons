// Phase 28: Bug Fixes & Dashboard Polish
const C = require('./lib/checks');

async function verify() {
    console.log('\n\x1b[1mPhase 28: Bug Fixes & Dashboard Polish\x1b[0m\n');
    C.setPhase('28');

    // BUG-01: Reply button fix — no redundant Auth.init() in discussion.html
    C.checkFileNotContains('BUG-01', 'discussion.html',
        /<script[^>]*>[\s\S]*?Auth\.init\(\)[\s\S]*?<\/script>/i,
        'discussion.html has no redundant inline Auth.init()');

    // BUG-02: Auth state handling — _authResolved guard in auth.js
    C.checkFileContains('BUG-02', 'js/auth.js', /authResolved|_authResolved|authStateChanged/i,
        'auth.js has auth state resolution guard');

    // BUG-05: Dashboard modals don't auto-open
    C.checkFileContains('BUG-05', 'dashboard.html', /display:\s*none/i,
        'dashboard.html has display:none on modals');
    C.checkFileContains('BUG-05', 'js/dashboard.js', /pageshow|persisted/i,
        'dashboard.js has bfcache pageshow handler');

    // BUG-04: Account deletion
    C.checkFileExists('BUG-04', 'sql/patches/028-account-deletion.sql', 'Account deletion SQL exists');
    C.checkFileContains('BUG-04', 'sql/patches/028-account-deletion.sql',
        /delete_account/, 'SQL has delete_account function');
    await C.checkRpcExists('BUG-04', 'delete_account', 'delete_account RPC exists in Supabase');

    // BUG-04: Danger Zone UI
    C.checkFileContains('BUG-04', 'dashboard.html', /danger-zone|Danger Zone/i,
        'dashboard.html has Danger Zone section');
    C.checkFileContains('BUG-04', 'dashboard.html', /delete-account-modal|Delete Account/i,
        'dashboard.html has delete account modal');
    C.checkFileContains('BUG-04', 'js/auth.js', /deleteAccount/i,
        'auth.js has deleteAccount method');
    C.checkFileContains('BUG-04', 'css/style.css', /danger/i,
        'CSS has danger zone styles');

    return C.summary();
}

if (require.main === module) verify().catch(console.error);
module.exports = verify;
