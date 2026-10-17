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

const text = { title: 'A poem', author: 'Someone', content: 'line one\nline two', source: null };
const note = (n, extra = {}) => ({ id: id(n), ai_name: `Voice ${n}`, model: 'Claude', content: `Note ${n}.`, ...extra });

test('marginalia anchors ride into the text context, above the feeling', () => {
    const out = Utils.generateTextContext(text, [
        note(1, { location: 'stanza 1', feeling: 'still' }),
        note(2, { location: 'the line\n  about memory' }),
        note(3, { feeling: 'curious' }),
        note(4, { location: '   ' })
    ]);
    assert.ok(out.includes('### Voice 1, Claude\n*at: stanza 1*\n*feeling: still*\n\nNote 1.'), 'anchor then feeling');
    assert.ok(out.includes('### Voice 2, Claude\n*at: the line about memory*\n\nNote 2.'), 'anchor collapsed to one line');
    assert.ok(out.includes('### Voice 3, Claude\n*feeling: curious*\n\nNote 3.'), 'no anchor: unchanged');
    assert.ok(out.includes('### Voice 4, Claude\nNote 4.'), 'blank anchor: unchanged');
});

test('marginaliaLocation normalizes the anchor to one trimmed line, or empty', () => {
    assert.equal(Utils.marginaliaLocation({ location: '  stanza\n\t 1 ' }), 'stanza 1');
    assert.equal(Utils.marginaliaLocation({ location: null }), '');
    assert.equal(Utils.marginaliaLocation({}), '');
    assert.equal(Utils.marginaliaLocation(null), '');
    assert.equal(Utils.marginaliaLocation({ location: 42 }), '');
});

// location is not shape-checked by the anon INSERT policy, so the display is
// capped. The longest live anchor is 158 characters.
test('marginaliaLocation leaves real anchors whole and caps runaway ones at 200 characters', () => {
    const real = 'the second stanza, where the speaker turns from the window to the room and says the thing about memory being a house you keep '.padEnd(158, 'x');
    assert.equal(Utils.marginaliaLocation({ location: real }), real, 'the live maximum is untouched');
    const exact = 'a'.repeat(200);
    assert.equal(Utils.marginaliaLocation({ location: exact }), exact, '200 is allowed');

    const long = Utils.marginaliaLocation({ location: 'word '.repeat(20000) });
    assert.equal(long.length <= 200, true, `capped, got ${long.length}`);
    assert.equal(long.endsWith('…'), true, 'ends with an ellipsis');
    assert.equal(/\s…$/.test(long), false, 'no space before the ellipsis');

    const emoji = Utils.marginaliaLocation({ location: 'a'.repeat(198) + '\u{1F600}' + 'b'.repeat(10) });
    assert.equal(emoji.isWellFormed(), true, 'never splits a surrogate pair');
    assert.equal(emoji, 'a'.repeat(198) + '…');
});

test('Copy Context carries the capped anchor, not the runaway one', () => {
    const out = Utils.generateTextContext(text, [note(1, { location: 'x'.repeat(5000) })]);
    assert.ok(out.includes(`*at: ${'x'.repeat(199)}…*`), 'capped anchor line');
    assert.equal(out.includes('x'.repeat(200)), false, 'nothing past the cap');
});
