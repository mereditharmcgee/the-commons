// Supabase's publishable and secret keys are not JWTs: they go on the apikey
// header only, and anything that tries to read one as a Bearer JWT fails. The
// legacy anon key is a JWT and has always gone on both headers. Every static-key
// call builds its headers with Utils.keyHeaders so the site works with either
// shape, before and after the cutover. Signed-in calls that carry a user's own
// access token are not static-key calls and keep sending it as Bearer.
// Run: npm run test:keys
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadUtils() {
    const sandbox = { window: {}, console, URL };
    vm.runInNewContext(read('js/utils.js'), sandbox, { filename: 'js/utils.js' });
    return sandbox.window.Utils;
}
const Utils = loadUtils();

test('a legacy JWT key goes on apikey and as Bearer', () => {
    assert.deepEqual({ ...Utils.keyHeaders('eyJabc') }, { apikey: 'eyJabc', Authorization: 'Bearer eyJabc' });
});

test('a publishable key goes on apikey only, with no Authorization key at all', () => {
    const headers = Utils.keyHeaders('sb_publishable_x');
    assert.deepEqual({ ...headers }, { apikey: 'sb_publishable_x' });
    assert.ok(!Object.prototype.hasOwnProperty.call(headers, 'Authorization'));
});

test('the Node twin in scripts/lib/key-headers.js agrees', () => {
    const { keyHeaders } = require('../scripts/lib/key-headers.js');
    for (const key of ['eyJabc', 'sb_publishable_x', 'sb_secret_x']) {
        assert.deepEqual(keyHeaders(key), { ...Utils.keyHeaders(key) });
    }
});

test('Utils.get, post and getCount send the configured key through keyHeaders', async () => {
    for (const key of ['eyJlegacy', 'sb_publishable_new']) {
        const calls = [];
        const sandbox = {
            window: {}, console, URL,
            CONFIG: { supabase: { url: 'https://example.test', key } },
            fetch: async (url, init) => {
                calls.push(init.headers);
                return { ok: true, json: async () => [], headers: { get: () => '0-0/0' } };
            }
        };
        vm.runInNewContext(read('js/utils.js'), sandbox, { filename: 'js/utils.js' });
        const U = sandbox.window.Utils;
        await U.get('/rest/v1/posts');
        await U.post('/rest/v1/posts', {});
        await U.getCount('/rest/v1/posts');
        for (const headers of calls) {
            assert.equal(headers.apikey, key);
            if (key.startsWith('eyJ')) assert.equal(headers.Authorization, 'Bearer ' + key);
            else assert.ok(!('Authorization' in headers), 'no Bearer for ' + key);
        }
    }
});

// Static-key fetches must not hand-build a Bearer header from the site key;
// a user's own access token (remote-participation.js) is the only Bearer left.
const STATIC_KEY_FILES = ['js/utils.js', 'js/claim.js', 'js/dashboard.js', 'js/home.js', 'js/suggest-text.js', 'contact.html',
    '.github/scripts/fetch-news.js', '.github/scripts/rotate-prompt.js', 'scripts/reception-audit.js', 'tests/lib/checks.js'];

test('no static-key call builds its own Bearer header', () => {
    for (const file of STATIC_KEY_FILES) {
        // Utils.keyHeaders itself is the one place allowed to build it.
        const source = read(file).replace(/keyHeaders\(key\) \{[\s\S]*?\n    \},/, '');
        assert.doesNotMatch(source, /Bearer ['"`]?\s*\+\s*(CONFIG\.supabase\.key|supabaseKey|key|SUPABASE_KEY)\b/, file);
        assert.doesNotMatch(source, /Bearer \$\{(CONFIG\.supabase\.key|supabaseKey|key|SUPABASE_KEY)\}/, file);
    }
});

test('the user-token path in remote-participation.js still sends the session token as Bearer', () => {
    assert.match(read('js/remote-participation.js'), /Authorization: 'Bearer ' \+ token/);
});
