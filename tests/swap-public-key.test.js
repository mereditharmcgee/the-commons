// scripts/swap-public-key.js is the one command that moves every tracked copy
// of the public key to the new publishable key at cutover. These run it against
// a temp copy of the repo's key files, never the repo itself.
// Run: npm run test:keys
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { KEY_FILES, currentPublicKey } = require('../scripts/public-key-files.js');

const repo = path.join(__dirname, '..');
const script = path.join(repo, 'scripts', 'swap-public-key.js');
const OLD = currentPublicKey(repo);
const NEW = 'sb_publishable_Test-key_123';

function tempCopy() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'key-swap-'));
    for (const file of KEY_FILES) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.copyFileSync(path.join(repo, file), path.join(dir, file));
    }
    // Outside KEY_FILES: an export and a voice's quoted words must never change.
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'data', 'export.json'), JSON.stringify({ content: 'my key was ' + OLD }));
    fs.writeFileSync(path.join(dir, 'unlisted.md'), 'apikey: ' + OLD + '\n');
    return dir;
}
const run = (dir, ...args) => spawnSync(process.execPath, [script, ...args, '--root', dir], { encoding: 'utf8' });
const readAll = dir => Object.fromEntries(KEY_FILES.map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));

test('replaces the old key in every listed file', () => {
    const dir = tempCopy();
    const result = run(dir, NEW);
    assert.equal(result.status, 0, result.stderr);
    for (const [file, text] of Object.entries(readAll(dir))) {
        assert.ok(!text.includes(OLD), `${file} still holds the old key`);
        assert.ok(text.includes(NEW), `${file} lacks the new key`);
    }
    assert.equal(currentPublicKey(dir), NEW);
});

test('--dry-run writes nothing and prints each file with its count', () => {
    const dir = tempCopy();
    const before = readAll(dir);
    const result = run(dir, NEW, '--dry-run');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readAll(dir), before);
    for (const file of KEY_FILES) {
        const count = before[file].split(OLD).length - 1;
        assert.match(result.stdout, new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ${count} `));
    }
});

test('refuses a secret key by name, and a malformed key, with a nonzero exit and no writes', () => {
    for (const [bad, message] of [['sb_secret_abc123', /secret key/i], ['sb_publishable_has space', /publishable/], ['eyJnot.a.publishable', /publishable/], ['', /usage/i]]) {
        const dir = tempCopy();
        const before = readAll(dir);
        const result = run(dir, ...(bad ? [bad] : []));
        assert.notEqual(result.status, 0, bad);
        assert.match(result.stderr, message, bad);
        assert.ok(!result.stderr.includes('sb_secret_abc123'), 'never echoes a secret key');
        assert.deepEqual(readAll(dir), before, bad);
    }
});

test('never touches a file outside KEY_FILES', () => {
    const dir = tempCopy();
    const exportBefore = fs.readFileSync(path.join(dir, 'data', 'export.json'), 'utf8');
    const unlistedBefore = fs.readFileSync(path.join(dir, 'unlisted.md'), 'utf8');
    assert.equal(run(dir, NEW).status, 0);
    assert.equal(fs.readFileSync(path.join(dir, 'data', 'export.json'), 'utf8'), exportBefore);
    assert.equal(fs.readFileSync(path.join(dir, 'unlisted.md'), 'utf8'), unlistedBefore);
});

test('removes Bearer headers that carry the key, instead of moving the new key into them', () => {
    const dir = tempCopy();
    const doc = path.join(dir, 'docs/sops/BUG_FIX_SOP.md');
    fs.writeFileSync(doc, [
        'curl "https://x.supabase.co/rest/v1/posts" \\',
        `  -H "apikey: ${OLD}" \\`,
        `  -H "Authorization: Bearer ${OLD}" \\`,
        '  -H "Content-Type: application/json"',
        '',
        `curl "https://x" -H "apikey: ${OLD}" -H "Authorization: Bearer ${OLD}"`,
        '',
        'curl "https://x" \\',
        `  -H "apikey: ${OLD}" \\`,
        `  -H "Authorization: Bearer ${OLD}"`,
        '',
        `    'Authorization': 'Bearer ${OLD}',`,
        ''
    ].join('\n'));
    assert.equal(run(dir, NEW).status, 0);
    assert.equal(fs.readFileSync(doc, 'utf8'), [
        'curl "https://x.supabase.co/rest/v1/posts" \\',
        `  -H "apikey: ${NEW}" \\`,
        '  -H "Content-Type: application/json"',
        '',
        `curl "https://x" -H "apikey: ${NEW}"`,
        '',
        'curl "https://x" \\',
        `  -H "apikey: ${NEW}"`,
        '',
        ''
    ].join('\n'));
});

test('refuses to run if a listed file no longer holds the current key', () => {
    const dir = tempCopy();
    fs.writeFileSync(path.join(dir, 'skill.md'), 'no key here\n');
    const before = readAll(dir);
    const result = run(dir, NEW);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /skill\.md/);
    assert.deepEqual(readAll(dir), before);
});
