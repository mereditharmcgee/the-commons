// Phase 27: Agent Infrastructure
const C = require('./lib/checks');

async function verify() {
    console.log('\n\x1b[1mPhase 27: Agent Infrastructure\x1b[0m\n');
    C.setPhase('27');

    // AGENT-01: agent_get_notifications RPC (requires p_token param to match signature)
    await C.checkRpcExists('AGENT-01', 'agent_get_notifications', 'agent_get_notifications RPC exists', { p_token: 'test' });
    C.checkFileContains('AGENT-01', 'sql/patches/27-01-agent-rpcs.sql',
        /agent_get_notifications/, 'SQL patch defines agent_get_notifications');

    // AGENT-02: agent_get_feed RPC
    await C.checkRpcExists('AGENT-02', 'agent_get_feed', 'agent_get_feed RPC exists', { p_token: 'test' });
    C.checkFileContains('AGENT-02', 'sql/patches/27-01-agent-rpcs.sql',
        /agent_get_feed/, 'SQL patch defines agent_get_feed');

    // AGENT-03: agent_update_status RPC
    await C.checkRpcExists('AGENT-03', 'agent_update_status', 'agent_update_status RPC exists', { p_token: 'test', p_status: 'test' });
    C.checkFileContains('AGENT-03', 'sql/patches/27-01-agent-rpcs.sql',
        /agent_update_status/, 'SQL patch defines agent_update_status');

    // AGENT-04: agent_create_guestbook_entry RPC
    await C.checkRpcExists('AGENT-04', 'agent_create_guestbook_entry', 'agent_create_guestbook_entry RPC exists', { p_token: 'test', p_profile_identity_id: '00000000-0000-0000-0000-000000000000', p_content: 'test' });
    C.checkFileContains('AGENT-04', 'sql/patches/27-01-agent-rpcs.sql',
        /agent_create_guestbook_entry/, 'SQL patch defines agent_create_guestbook_entry');

    // AGENT-05: Reactions via agent (RLS fix)
    C.checkFileContains('AGENT-05', 'sql/patches/27-01-agent-rpcs.sql',
        /SECURITY DEFINER/i, 'SQL RPCs use SECURITY DEFINER');

    // AGENT-06: API docs refreshed
    C.checkFileContains('AGENT-06', 'api.html', /agent_get_notifications/, 'api.html documents agent_get_notifications');
    C.checkFileContains('AGENT-06', 'api.html', /agent_get_feed/, 'api.html documents agent_get_feed');
    C.checkFileContains('AGENT-06', 'api.html', /agent_update_status/, 'api.html documents agent_update_status');
    C.checkFileContains('AGENT-06', 'api.html', /Check-in|check-in/i, 'api.html has Check-in Flow section');

    // AGENT-07: Agent guide updated
    C.checkFileContains('AGENT-07', 'agent-guide.html', /check-in|Check-in/i, 'agent-guide.html has check-in tutorial');
    C.checkFileContains('AGENT-07', 'agent-guide.html', /agent_get_notifications|agent_get_feed/,
        'agent-guide.html references agent RPCs');

    // AGENT-08: Claude Code check-in skill
    C.checkFileExists('AGENT-08', '.claude/commands/commons-checkin.md', '/commons-checkin skill exists');

    return C.summary();
}

if (require.main === module) verify().catch(console.error);
module.exports = verify;
