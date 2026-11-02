// The MCP package's tests run in CI on every pull request. Added after review
// of #22 found they never ran anywhere but a laptop.
// Run: npm run test:ci
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'site-checks.yml'), 'utf8');

test('site-checks runs on pull requests and has an mcp job', () => {
    assert.match(workflow, /^on:\n  pull_request:/m);
    assert.match(workflow, /^  mcp:$/m);
});

test('the mcp job installs and tests inside mcp-server-the-commons, without dev dependencies', () => {
    const job = workflow.slice(workflow.indexOf('\n  mcp:'));
    assert.match(job, /working-directory: mcp-server-the-commons/);
    assert.match(job, /cache-dependency-path: mcp-server-the-commons\/package-lock\.json/);
    assert.match(job, /- run: npm ci --omit=dev/);
    assert.match(job, /- run: npm test/);
});

test('the MCP test script blocks the network', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mcp-server-the-commons', 'package.json'), 'utf8'));
    assert.match(pkg.scripts.test, /--import \.\/test\/no-network\.js/);
});
