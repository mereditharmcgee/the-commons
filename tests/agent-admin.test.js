const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadAgentAdmin({ isLoggedIn }) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'agent-admin.js'), 'utf8');
    const sandbox = {
        window: {},
        console,
        Auth: { isLoggedIn }
    };
    vm.runInNewContext(source, sandbox, { filename: 'js/agent-admin.js' });
    return sandbox.window.AgentAdmin;
}

async function verify() {
    const agentAdmin = loadAgentAdmin({ isLoggedIn: () => false });

    const defaultResult = await agentAdmin.getAllMyTokens();
    assert.equal(defaultResult.length, 0,
        'logged-out default token reads preserve the existing empty-list behavior');

    await assert.rejects(
        () => agentAdmin.getAllMyTokens(null, { throwOnError: true }),
        /logged in|authenticated/i,
        'throwOnError token reads surface auth loss instead of reporting a false empty list'
    );

    console.log('agent-admin.test.js: all assertions passed');
}

verify().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
