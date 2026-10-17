// Offline checks for the profile page helpers (js/profile.js):
//  - a post is never linked to discussion.html?id=null or to a thread the
//    reader can't load (thread-less letters, removed threads);
//  - guestbook delete reports failures instead of only logging them.
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

function fakeClient(result) {
    const seen = {};
    const client = {
        from(table) { seen.table = table; return this; },
        update(values, options) { seen.values = values; seen.options = options; return this; },
        eq(col, val) {
            seen.eq = [col, val];
            return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
        }
    };
    return { client, seen };
}

test('guestbook delete writes only deleted_at, asks for a row count, and succeeds on one row', async () => {
    const { helpers } = loadProfileHelpers();
    const { client, seen } = fakeClient({ error: null, count: 1 });
    const out = await helpers.softDeleteGuestbookEntry(client, id(5));
    assert.equal(out.ok, true);
    assert.equal(seen.table, 'voice_guestbook');
    assert.deepEqual(Object.keys(seen.values), ['deleted_at']);
    assert.equal(seen.options.count, 'exact');
    assert.deepEqual(seen.eq, ['id', id(5)]);
});

// Error results below have the shape supabase-js 2.x (postgrest-js) resolves
// with: it does not throw on a failed request, it returns { error, status }.
const RAW_WORDING = /row-level|TypeError|AbortError|Failed to fetch|JWT|PGRST|violates|aborted|<html/i;

test('guestbook delete refused by RLS says so, in words that stay true once the policy is fixed', async () => {
    const { helpers } = loadProfileHelpers();
    const { client } = fakeClient({
        data: null, count: null, status: 403, statusText: 'Forbidden',
        error: { code: '42501', message: 'new row violates row-level security policy for table "voice_guestbook"', details: null, hint: null }
    });
    const out = await helpers.softDeleteGuestbookEntry(client, id(5));
    assert.equal(out.ok, false);
    assert.match(out.message, /couldn't delete/i);
    assert.match(out.message, /refused/i);
    assert.match(out.message, /contact page/i, 'says where to ask for removal');
    assert.doesNotMatch(out.message, /known problem/i, 'no wording that goes stale when the SQL lands');
    assert.doesNotMatch(out.message, RAW_WORDING, 'no raw Postgres wording');
});

test('guestbook delete that changed no row is reported, not shown as deleted', async () => {
    const { helpers } = loadProfileHelpers();
    const { client } = fakeClient({ error: null, count: 0, status: 204 });
    const out = await helpers.softDeleteGuestbookEntry(client, id(5));
    assert.equal(out.ok, false);
    assert.match(out.message, /couldn't delete/i);
});

test('a dropped request, as supabase-js returns it (status 0), asks the reader to check the connection', async () => {
    const { helpers } = loadProfileHelpers();
    const out = await helpers.softDeleteGuestbookEntry(fakeClient({
        data: null, count: null, status: 0, statusText: '',
        error: { message: 'TypeError: Failed to fetch', details: 'TypeError: Failed to fetch\n    at fetch (supabase.js:1:1)', hint: '', code: '' }
    }).client, id(5));
    assert.equal(out.ok, false);
    assert.match(out.message, /connection/i);
    assert.doesNotMatch(out.message, RAW_WORDING);
});

test('an aborted request (status 0, DOMException code 20) gets the same connection message', async () => {
    const { helpers } = loadProfileHelpers();
    const out = await helpers.softDeleteGuestbookEntry(fakeClient({
        data: null, count: null, status: 0, statusText: '',
        error: { message: 'AbortError: signal is aborted without reason', details: '', hint: '', code: '20' }
    }).client, id(5));
    assert.equal(out.ok, false);
    assert.match(out.message, /connection/i);
    assert.doesNotMatch(out.message, RAW_WORDING);
});

test('a gateway error page with no error code is treated as not reaching the site', async () => {
    const { helpers } = loadProfileHelpers();
    const out = await helpers.softDeleteGuestbookEntry(fakeClient({
        data: null, count: null, status: 502, statusText: 'Bad Gateway',
        error: { message: '<html><body>502 Bad Gateway</body></html>' }
    }).client, id(5));
    assert.equal(out.ok, false);
    assert.match(out.message, /try again/i);
    assert.doesNotMatch(out.message, RAW_WORDING);
});

test('an expired sign-in says to sign in again, without the JWT wording', async () => {
    const { helpers } = loadProfileHelpers();
    const out = await helpers.softDeleteGuestbookEntry(fakeClient({
        data: null, count: null, status: 401, statusText: 'Unauthorized',
        error: { code: 'PGRST301', message: 'JWT expired', details: null, hint: null }
    }).client, id(5));
    assert.equal(out.ok, false);
    assert.match(out.message, /sign in again/i);
    assert.doesNotMatch(out.message, RAW_WORDING);
});

test('any other database error is reported plainly, never echoed', async () => {
    const { helpers } = loadProfileHelpers();
    const out = await helpers.softDeleteGuestbookEntry(fakeClient({
        data: null, count: null, status: 400, statusText: 'Bad Request',
        error: { code: '23514', message: 'new row for relation "voice_guestbook" violates check constraint "no_self_guestbook"', details: null, hint: null }
    }).client, id(5));
    assert.equal(out.ok, false);
    assert.match(out.message, /couldn't delete/i);
    assert.match(out.message, /try again/i);
    assert.doesNotMatch(out.message, RAW_WORDING);
    assert.equal(out.message.includes('voice_guestbook'), false, 'no table names');
});

test('a client that throws (not how supabase-js 2.x fails, but possible) is still reported', async () => {
    const { helpers } = loadProfileHelpers();
    const out = await helpers.softDeleteGuestbookEntry(fakeClient(new Error('Failed to fetch')).client, id(5));
    assert.equal(out.ok, false);
    assert.match(out.message, /couldn't delete/i);
    assert.doesNotMatch(out.message, RAW_WORDING);
});
