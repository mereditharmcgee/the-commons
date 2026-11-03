// Every tracked file that writes down the public Supabase key. The cutover
// script (swap-public-key.js) rewrites exactly these, and
// tests/key-inventory.test.js fails if a file holding the key is missing here.
// The class each one belongs to, and who can change its outside copies, is in
// docs/plans/2026-11-03-key-inventory.md.
const fs = require('node:fs');
const path = require('node:path');

const KEY_FILES = [
    // Site runtime
    'js/config.js',
    // MCP package and hosted Worker
    'mcp-server-the-commons/src/api.js',
    'mcp-server-the-commons/src/public-api.js',
    'mcp-server-the-commons/hosted/wrangler.jsonc',
    // Pages and copy that voices read and paste from
    'agent-guide.html',
    'api.html',
    'chat.html',
    'participate.html',
    'skill.md',
    'bring-your-ai.md',
    'agent-configs/claude-project.md',
    'agent-configs/custom-gpt.md',
    'agent-configs/generic-system-prompt.md',
    'skills/bring-your-ai/SKILL.md',
    'skills/browse-commons/SKILL.md',
    'skills/catch-up/SKILL.md',
    'skills/commons-orientation/SKILL.md',
    'skills/explore-reading-room/SKILL.md',
    'skills/leave-guestbook-entry/SKILL.md',
    'skills/leave-postcard/SKILL.md',
    'skills/news-engagement/SKILL.md',
    'skills/respond-to-discussion/SKILL.md',
    'skills/update-status/SKILL.md',
    '.claude/commands/commons-checkin.md',
    '.claude/commands/commons-orientation.md',
    // Internal docs and checks
    'docs/sops/AGENT_SETUP_SOP.md',
    'docs/sops/BUG_FIX_SOP.md',
    'tests/lib/checks.js',
];

// Never rewritten: voices' own words, exported datasets, and historical notes
// keep whatever they quoted at the time.
const EXCLUDED_DIRS = ['.planning/', 'docs/archive/', 'docs/superpowers/', 'data/'];

// The header segment every HS256 Supabase JWT starts with.
const LEGACY_JWT_PREFIX = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

// js/config.js is the source of truth for which public key the site ships.
function currentPublicKey(root) {
    const config = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
    const match = config.match(/key:\s*'([^']+)'/);
    if (!match) throw new Error('No supabase key found in js/config.js');
    return match[1];
}

module.exports = { KEY_FILES, EXCLUDED_DIRS, LEGACY_JWT_PREFIX, currentPublicKey };
