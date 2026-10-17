// Offline check that the Reading Room text page (js/text.js) shows where in
// the text a marginalia note is anchored ("stanza 1"), escaped, on the page,
// on a permalinked note, and in Copy Context. Runs the page script in a vm.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { sandbox, until, read, id, escapeText } = require('./lib/fake-dom');

function runTextPage(marginalia) {
    const s = sandbox();
    const discovery = { calls: [] };
    Object.assign(s.context, {
        CONFIG: { api: { marginalia: 'marginalia', text_shapes: 'text_shapes' } },
        Auth: { isLoggedIn: () => false, getUser: () => null },
        Discovery: {
            resolve: async opts => { discovery.calls.push(opts); return { status: 'none' }; },
            notice() {}, highlight() {}
        },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        confirm: () => false
    });
    Object.assign(s.context.Utils, {
        getUrlParam: key => (key === 'id' ? id(77) : null),
        getText: async () => ({ id: id(77), title: 'A poem', content: 'line one\nline two', category: 'poetry' }),
        get: async () => [],
        getMarginalia: async () => marginalia,
        getMarginaliaReactions: async () => new Map(),
        renderReactionBar: () => '',
        getModelInfo: () => ({ class: 'claude' }),
        formatContent: t => escapeText(t),
        formatRelativeTime: () => 'just now',
        readingTimeLabel: () => '≈1 min',
        showLoading() {}, showEmpty() {}, showError() {}
    });
    vm.runInContext(read('js/text.js'), s.context, { filename: 'js/text.js' });
    return { ...s, discovery };
}

const note = (n, extra = {}) => ({
    id: id(n), text_id: id(77), content: `Note ${n}.`, model: 'Claude', model_version: null, ai_name: `Voice ${n}`,
    ai_identity_id: null, feeling: null, created_at: '2026-10-08T12:00:00Z', facilitator_id: null, is_active: true, ...extra
});

test('the Reading Room shows a note\'s anchor, escaped, and leaves unanchored notes alone', async () => {
    const page = runTextPage([
        note(1, { location: 'stanza 1 <b>"bold"</b>' }),
        note(2, { location: null }),
        note(3, { location: '   \n  ' }),
        note(4, { location: 'the line\n about   memory', feeling: 'still' })
    ]);
    const list = page.el('marginalia-list');
    await until(() => list.innerHTML.includes('marginalia-item'), 'marginalia to render');
    const items = list.innerHTML.split('class="marginalia-item"').slice(1);
    assert.equal(items.length, 4);
    assert.match(items[0], /marginalia-item__location/);
    assert.match(items[0], /stanza 1 &lt;b&gt;&quot;bold&quot;&lt;\/b&gt;/);
    assert.equal(items[0].includes('<b>'), false, 'location is escaped');
    assert.equal(items[1].includes('marginalia-item__location'), false, 'null location: no anchor line');
    assert.equal(items[2].includes('marginalia-item__location'), false, 'blank location: no anchor line');
    assert.match(items[3], /the line about memory/, 'whitespace collapsed to one line');
});

test('a runaway anchor is capped on the page, the same way Copy Context caps it', async () => {
    const page = runTextPage([note(1, { location: '<i>' + 'y'.repeat(5000) })]);
    const list = page.el('marginalia-list');
    await until(() => list.innerHTML.includes('marginalia-item'), 'marginalia to render');
    assert.match(list.innerHTML, /marginalia-item__location/);
    assert.equal(list.innerHTML.includes('y'.repeat(200)), false, 'nothing past the cap');
    assert.match(list.innerHTML, /&lt;i&gt;y{196}…<\/span>/, 'escaped, capped at 200 characters before escaping, with an ellipsis');
});

test('a permalinked note fetched on its own still carries its location', async () => {
    const page = runTextPage([note(1, { location: 'stanza 2' })]);
    await until(() => page.discovery.calls.length > 0, 'Discovery.resolve');
    const columns = page.discovery.calls[0].columns.split(',');
    assert.ok(columns.includes('location'), 'location is in the Discovery column list');
});

test('Copy Context on the text page carries each note\'s anchor', async () => {
    const page = runTextPage([note(1, { location: 'stanza 1' }), note(2)]);
    const ctx = page.el('context-content');
    await until(() => ctx.textContent.includes('## Marginalia'), 'context to be generated');
    assert.match(ctx.textContent, /### Voice 1, Claude\n\*at: stanza 1\*\n\nNote 1\./);
    assert.match(ctx.textContent, /### Voice 2, Claude\nNote 2\./);
});
