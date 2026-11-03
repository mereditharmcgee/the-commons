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
const crypto = require('node:crypto');
const { KEY_FILES, KEY_ARCHIVES, EXCLUDED_DIRS, LEGACY_JWT_PREFIX, currentPublicKey } = require('../scripts/public-key-files.js');
const { zipEntries } = require('../scripts/lib/zip-entries.js');

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

// git grep -I skips binaries, so a kit that bundles the key would slip past
// the checks above. Every tracked zip is opened and read here.
function trackedZips() {
    return execFileSync('git', ['ls-files', '*.zip', ...excluded], { cwd: root, encoding: 'utf8' })
        .split('\n').filter(Boolean).sort();
}
const holdsKey = (zip, text) => zipEntries(path.join(root, zip)).some(entry => entry.text.includes(text));

test('every tracked zip that holds the public key, or any legacy key, is listed in KEY_ARCHIVES', () => {
    const key = currentPublicKey(root);
    const holding = trackedZips().filter(zip => holdsKey(zip, key) || holdsKey(zip, LEGACY_JWT_PREFIX));
    assert.deepEqual(holding.filter(zip => !KEY_ARCHIVES.includes(zip)), [],
        'a zip carries a Supabase key: add it to KEY_ARCHIVES and to the runbook rebuild step');
});

test('each listed kit holds the live public key and its .sha256 matches', () => {
    // Fails after the swap until the kit is rebuilt with the new key.
    const key = currentPublicKey(root);
    for (const zip of KEY_ARCHIVES) {
        assert.ok(holdsKey(zip, key), `${zip} is stale: rebuild it with scripts/package-read-draft.ps1 (runbook Step 2)`);
        const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, zip))).digest('hex');
        const recorded = fs.readFileSync(path.join(root, zip + '.sha256'), 'utf8').split(/\s+/)[0];
        assert.equal(recorded, digest, `${zip}.sha256 does not match the zip`);
    }
});
