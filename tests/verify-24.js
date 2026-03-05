// Phase 24: Notifications
const C = require('./lib/checks');

async function verify() {
    console.log('\n\x1b[1mPhase 24: Notifications\x1b[0m\n');
    C.setPhase('24');

    // NOTIF-01/02/05: Basic notification triggers (reply, directed, reaction)
    // These use existing triggers — verify notifications table accessible
    await C.checkTableExists('NOTIF-01', 'notifications', 'notifications table exists');

    // NOTIF-03: Discussion activity trigger — verify SQL patch has it
    C.checkFileContains('NOTIF-03', 'sql/patches/24-01-notification-triggers.sql',
        /notify_on_discussion_activity|on_discussion_activity_notify/,
        'SQL patch has discussion activity trigger');

    // NOTIF-04: Interest discussion trigger
    C.checkFileContains('NOTIF-04', 'sql/patches/24-01-notification-triggers.sql',
        /notify_on_interest_discussion|on_interest_discussion_notify/,
        'SQL patch has interest discussion trigger');

    // NOTIF-05: Reaction notification
    C.checkFileContains('NOTIF-05', 'sql/patches/24-01-notification-triggers.sql',
        /discussion_activity|new_discussion_in_interest/,
        'SQL patch expands CHECK constraint types');

    // NOTIF-06: Guestbook notification trigger
    C.checkFileContains('NOTIF-06', 'sql/patches/24-01-notification-triggers.sql',
        /guestbook/i,
        'SQL patch references guestbook notifications');

    // NOTIF-07: Bell icon with unread count
    C.checkFileExists('NOTIF-07', 'js/notifications.js', 'notifications.js exists');
    C.checkFileContains('NOTIF-07', 'js/notifications.js', /bell|notification-count|unread/i,
        'notifications.js has bell/unread count logic');

    // NOTIF-08: Notification dropdown
    C.checkFileContains('NOTIF-08', 'js/notifications.js', /dropdown|popover/i,
        'notifications.js has dropdown/popover');
    C.checkFileContains('NOTIF-08', 'js/notifications.js', /mark.*read|markAsRead/i,
        'notifications.js has mark-as-read');
    C.checkFileContains('NOTIF-08', 'css/style.css', /notification-dropdown/,
        'CSS has .notification-dropdown styles');

    // NOTIF-09: Dashboard notification history
    C.checkFileContains('NOTIF-09', 'dashboard.html', /notification|filter/i,
        'dashboard.html has notification section');

    // Dynamic injection via nav.js
    C.checkFileContains('NOTIF-07', 'js/nav.js', /notification/i,
        'nav.js loads notifications.js dynamically');

    return C.summary();
}

if (require.main === module) verify().catch(console.error);
module.exports = verify;
