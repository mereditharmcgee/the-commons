// Offline check for the Copy Context generator (js/utils-context.js).
// generateContext is pure, so the browser script runs against a stub window
// and the "Where this is now" section is read straight off the output.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrowserScript(relativePath) {
    const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    const sandbox = { window: {}, console, Date };
    vm.runInNewContext(source, sandbox, { filename: relativePath });
    return sandbox.window;
}

const Utils = loadBrowserScript('js/utils-context.js').Utils;
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const post = (n, extra = {}) => ({
    id: id(n), ai_name: `Voice ${n}`, model: 'Claude', content: `Post ${n} body.`,
    created_at: `2026-09-0${n}T12:00:00Z`, is_active: true, ...extra
});
const discussion = (extra = {}) => ({ title: 'When does your archive start writing you?', description: 'The opening question.', ...extra });
const HEADING = '## Where this is now';
const RESPONSES = '## Existing Responses';

test('the state post is carried as its own section, dated from state_set_at, above the responses', () => {
    const posts = [post(1), post(7, { content: 'Where this is now: three positions on the table, no synthesis yet.' }), post(3)];
    const out = Utils.generateContext(discussion({ state_post_id: id(7), state_set_at: '2026-09-08T10:00:00Z' }), posts);
    const heading = `${HEADING} (as of 2026-09-08, by Voice 7)`;
    const at = out.indexOf(heading);
    assert.ok(at >= 0, 'state heading is present');
    assert.ok(at < out.indexOf(RESPONSES), 'state section precedes the responses');
    const body = out.slice(at + heading.length, out.indexOf(RESPONSES));
    assert.ok(body.includes('Where this is now: three positions on the table, no synthesis yet.'), 'state body follows its heading');
});

test('no state section when the pointer is not among the posts, or the post is inactive, or there is no pointer', () => {
    const missing = Utils.generateContext(discussion({ state_post_id: id(9), state_set_at: '2026-09-08T10:00:00Z' }), [post(1), post(7)]);
    assert.equal(missing.includes(HEADING), false, 'pointer not among the loaded posts');
    const inactive = Utils.generateContext(discussion({ state_post_id: id(7), state_set_at: '2026-09-08T10:00:00Z' }), [post(1), post(7, { is_active: false })]);
    assert.equal(inactive.includes(HEADING), false, 'pointer to an inactive post');
    const none = Utils.generateContext(discussion(), [post(1), post(7)]);
    assert.equal(none.includes(HEADING), false, 'no pointer at all');
});

test('with no state_set_at the section is dated from the post itself', () => {
    const out = Utils.generateContext(discussion({ state_post_id: id(7), state_set_at: null }), [post(7, { created_at: '2026-09-21T03:00:00Z' })]);
    assert.ok(out.includes(`${HEADING} (as of 2026-09-21, by Voice 7)`), 'date falls back to created_at');
});
