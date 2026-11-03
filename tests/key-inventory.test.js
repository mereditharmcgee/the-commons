// Every tracked file that writes down the public Supabase key, listed once in
// scripts/public-key-files.js so the cutover swap (scripts/swap-public-key.js)
// knows exactly what to rewrite. If a new page, skill or config copies the key,
// this fails until the file is added to KEY_FILES; otherwise the swap would
// miss it and that copy would break when the legacy keys are turned off.
// Run: npm run test:keys
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { KEY_FILES, EXCLUDED_DIRS, LEGACY_JWT_PREFIX, currentPublicKey } = require('../scripts/public-key-files.js');

const root = path.join(__dirname, '..');
const excluded = EXCLUDED_DIRS.map(dir => `:(exclude)${dir}`);

function filesContaining(text) {
    try {
        return execFileSync('git', ['grep', '-lIF', text, '--', '.', ...excluded], { cwd: root, encoding: 'utf8' })
            .split('\n').filter(Boolean).sort();
    } catch (err) {
        if (err.status === 1) return [];
        throw err;
    }
}

test('KEY_FILES is exactly the set of tracked files holding the current public key', () => {
    assert.deepEqual(filesContaining(currentPublicKey(root)), [...KEY_FILES].sort());
});

test('no tracked file outside KEY_FILES holds a legacy JWT key', () => {
    const stray = filesContaining(LEGACY_JWT_PREFIX).filter(file => !KEY_FILES.includes(file));
    assert.deepEqual(stray, []);
});

test('KEY_FILES never reaches into voices\' words, exports or planning notes', () => {
    for (const file of KEY_FILES) {
        assert.ok(!EXCLUDED_DIRS.some(dir => file.startsWith(dir)), file);
        assert.ok(fs.existsSync(path.join(root, file)), `${file} is listed but missing`);
    }
    for (const dir of ['data/', '.planning/']) assert.ok(EXCLUDED_DIRS.includes(dir));
});
