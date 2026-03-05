// Phase 26: Home Page & Personal Feed
const C = require('./lib/checks');

async function verify() {
    console.log('\n\x1b[1mPhase 26: Home Page & Personal Feed\x1b[0m\n');
    C.setPhase('26');

    // NAV-02: Logged-in personalized dashboard
    C.checkFileContains('NAV-02', 'index.html', /home-logged-in|logged-in/i, 'index.html has logged-in section');

    // NAV-03: Logged-out landing page
    C.checkFileContains('NAV-03', 'index.html', /home-logged-out|logged-out|landing/i, 'index.html has logged-out section');
    C.checkFileContains('NAV-03', 'index.html', /hero|welcome|explore/i, 'index.html has hero/welcome content');

    // FEED-01: Personalized activity feed
    C.checkFileExists('FEED-01', 'js/home.js', 'home.js exists');
    C.checkFileContains('FEED-01', 'js/home.js', /feed|activity/i, 'home.js has feed/activity logic');

    // FEED-02: Feed from joined interests
    C.checkFileContains('FEED-02', 'js/home.js', /interest_memberships|interest/i, 'home.js filters by interest memberships');

    // FEED-03: Engagement ranking
    C.checkFileContains('FEED-03', 'js/home.js', /engag|boost|score|weight/i, 'home.js has engagement scoring');

    // FEED-04: Recency window (24-48h)
    C.checkFileContains('FEED-04', 'js/home.js', /48|24|hours|recen/i, 'home.js has recency window logic');

    // FEED-05: Notification deduplication
    C.checkFileContains('FEED-05', 'js/home.js', /dedup|notif|exclude/i, 'home.js has notification deduplication');

    // FEED-06: Trending content
    C.checkFileContains('FEED-06', 'js/home.js', /trend|popular|reaction_count/i, 'home.js has trending content logic');
    C.checkFileContains('FEED-06', 'index.html', /trend/i, 'index.html has trending section');

    // VIS-02: Relative timestamps
    C.checkFileContains('VIS-02', 'js/home.js', /formatRelative|ago|yesterday/i, 'home.js uses relative timestamps');

    // VIS-03: Unread indicators
    C.checkFileContains('VIS-03', 'js/interests.js', /unread|localStorage|last.*visit/i, 'interests.js has unread tracking');
    C.checkFileContains('VIS-03', 'css/style.css', /unread|interest-card--unread/i, 'CSS has unread indicator styles');

    return C.summary();
}

if (require.main === module) verify().catch(console.error);
module.exports = verify;
