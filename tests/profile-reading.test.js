// Offline checks for the profile page helpers (js/profile.js):
//  - a post is never linked to discussion.html?id=null or to a thread the
//    reader can't load (thread-less letters, removed threads);
// The page script runs in a vm; with no ?id= its IIFE stops at the first guard.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { sandbox, read, id } = require('./lib/fake-dom');

function loadProfileHelpers(get = async () => []) {
    const s = sandbox({ CONFIG: { api: { discussions: 'discussions' } } });
    s.context.location = { search: '' };
    const calls = [];
    Object.assign(s.context.Utils, {
        showError() {},
        get: async (table, params) => { calls.push({ table, params }); return get(table, params); }
    });
    vm.runInContext(read('js/profile.js') + '\nglobalThis.__helpers = ProfileHelpers;', s.context, { filename: 'js/profile.js' });
    return { helpers: s.context.__helpers, calls };
}

test('a post with no thread gets a plain label, never discussion.html?id=null', () => {
    const { helpers } = loadProfileHelpers();
    const html = helpers.threadRef(null, new Map(), 'post__discussion');
    assert.equal(html.includes('href'), false, 'no link at all');
    assert.equal(html.includes('null'), false, 'no literal null');
    assert.match(html, /Not in a thread/);
    assert.match(html, /class="post__discussion"/);
});

test('a post whose thread the reader cannot load is not linked to the dead thread', () => {
    const { helpers } = loadProfileHelpers();
    const html = helpers.threadRef(id(9), new Map([[id(1), 'Some other thread']]), 'post__discussion');
    assert.equal(html.includes('href'), false);
    assert.equal(html.includes(id(9)), false);
    assert.match(html, /Thread no longer available/);
});

test('a loadable thread is linked by UUID with its title escaped', () => {
    const { helpers } = loadProfileHelpers();
    const html = helpers.threadRef(id(1), new Map([[id(1), '<img src=x onerror=alert(1)> "quoted"']]), 'question-item__discussion');
    assert.match(html, new RegExp(`^<a href="discussion\\.html\\?id=${id(1)}" class="question-item__discussion">`));
    assert.equal(html.includes('<img'), false, 'title is escaped');
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &quot;quoted&quot;/);
    const untitled = helpers.threadRef(id(2), new Map([[id(2), null]]));
    assert.equal(untitled, `<a href="discussion.html?id=${id(2)}">Untitled discussion</a>`);
});

test('a discussion_id that is not a UUID is never put in an href, even if it is in the map', () => {
    const { helpers } = loadProfileHelpers();
    const evil = '" onmouseover="alert(1)';
    const html = helpers.threadRef(evil, new Map([[evil, 'x']]));
    assert.equal(html.includes('href'), false);
    assert.equal(html.includes('onmouseover'), false);
});

test('thread titles are fetched only for the ids in use, deduplicated, active-only, in short chunks', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => id(i + 1));
    const { helpers, calls } = loadProfileHelpers(async (table, params) => {
        const wanted = params.id.slice(4, -1).split(',');
        // Thread 3 was removed: the server simply doesn't return it.
        return wanted.filter(x => x !== id(3)).map(x => ({ id: x, title: `T ${x.slice(-3)}` }));
    });
    const titles = await helpers.fetchThreadTitles([...ids, id(1), null, undefined, 'not-a-uuid']);
    assert.ok(calls.length >= 2, 'more than one request for 120 ids');
    for (const call of calls) {
        assert.equal(call.table, 'discussions');
        assert.equal(call.params.is_active, 'eq.true');
        assert.equal(call.params.select, 'id,title');
        const chunk = call.params.id.slice(4, -1).split(',');
        assert.ok(chunk.length <= 50, 'chunk keeps the URL short');
        assert.ok(chunk.every(x => /^[0-9a-f-]{36}$/.test(x)), 'only UUIDs reach the filter');
    }
    const requested = calls.flatMap(c => c.params.id.slice(4, -1).split(','));
    assert.equal(requested.length, 120, 'each id requested once');
    assert.equal(titles.size, 119);
    assert.equal(titles.has(id(3)), false);
    assert.equal(titles.get(id(1)), 'T 001');
});

test('no request at all when there are no thread ids', async () => {
    const { helpers, calls } = loadProfileHelpers();
    const titles = await helpers.fetchThreadTitles([null, null]);
    assert.equal(titles.size, 0);
    assert.equal(calls.length, 0);
});
