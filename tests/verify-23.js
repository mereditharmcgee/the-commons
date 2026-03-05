// Phase 23: Interests System
const C = require('./lib/checks');

async function verify() {
    console.log('\n\x1b[1mPhase 23: Interests System\x1b[0m\n');
    C.setPhase('23');

    // INT-01: Interests page card grid
    C.checkFileExists('INT-01', 'interests.html', 'interests.html exists');
    C.checkFileContains('INT-01', 'interests.html', /interest-card|card-grid|interests-grid/i, 'interests.html has card grid structure');

    // INT-02: Interest detail page
    C.checkFileExists('INT-02', 'interest.html', 'interest.html detail page exists');
    C.checkFileContains('INT-02', 'interest.html', /member|discussion/i, 'interest.html has member/discussion sections');

    // INT-03: Create discussion within interest
    C.checkFileContains('INT-03', 'js/interest.js', /createDiscussion|create.*discussion|new.*discussion/i, 'interest.js has create discussion functionality');

    // INT-04: Each discussion belongs to an interest
    C.checkFileContains('INT-04', 'js/config.js', /interest_memberships/, 'config.js has interest_memberships endpoint');
    C.checkFileContains('INT-04', 'js/config.js', /interests['"]?\s*:/, 'config.js has interests endpoint');

    // INT-05: Join/leave interest
    C.checkFileContains('INT-05', 'js/interest.js', /join|leave/i, 'interest.js has join/leave functionality');

    // INT-06: General/Open Floor catch-all
    try {
        const { status, data } = await C.supabaseGet('/rest/v1/interests', {
            select: 'name,slug',
            'or': '(slug.eq.general,slug.eq.open-floor,name.ilike.*General*)'
        });
        if (status === 200 && data && data.length > 0) {
            C.pass('INT-06', `General/Open Floor interest exists: "${data[0].name}"`);
        } else {
            C.fail('INT-06', 'General/Open Floor interest exists', 'Not found');
        }
    } catch (e) {
        C.fail('INT-06', 'General/Open Floor interest', e.message);
    }

    // INT-09: Curator tools (create, move discussions)
    C.checkFileContains('INT-09', 'js/interests.js', /createInterest|create.*interest/i, 'interests.js has create interest function');
    C.checkFileContains('INT-09', 'js/admin.js', /moveDiscussion|move.*discussion|interest_id/i, 'admin.js has move discussion functionality');

    // INT-10: Sunset/archive interests
    C.checkFileContains('INT-10', 'js/interest.js', /sunset|archive/i, 'interest.js has sunset/archive functionality');

    // INT-11: Endorsement mechanism + table
    await C.checkTableExists('INT-11', 'interest_endorsements', 'interest_endorsements table exists');
    C.checkFileContains('INT-11', 'js/interests.js', /endorse/i, 'interests.js has endorsement functionality');

    // VIS-01: Consistent card layout
    C.checkFileContains('VIS-01', 'css/style.css', /interest-card|\.card/i, 'CSS has interest card styles');

    return C.summary();
}

if (require.main === module) verify().catch(console.error);
module.exports = verify;
