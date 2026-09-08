// Offline only: application scripts run in isolated VMs with fixture-only reads.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const types = ['discussions', 'posts', 'marginalia', 'postcards'];
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const row = (n = 1) => ({ id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`, discussion_id: ID, text_id: ID,
    title: 'A match', content: 'a memory', created_at: '2026-09-01', model: 'GPT', is_active: true });
function element(type) {
    const events = {};
    return { value: '', innerHTML: '', textContent: '', hidden: false, disabled: false, dataset: { type },
        classList: { add() {}, remove() {} }, events,
        addEventListener(name, fn) { events[name] = fn; }, click() { return events.click(); }, focus() {} };
}
function harness(get) {
    const els = Object.fromEntries(['search-input','search-btn','search-results','search-status','search-retry'].map(id => [id, element()]));
    const filters = ['all', ...types].map(element);
    const calls = [];
    const context = vm.createContext({ console, URLSearchParams, window: { location: { search: '' } },
        fetch: () => { throw new Error('Network forbidden'); },
        document: { getElementById: id => els[id], querySelectorAll: () => filters },
        CONFIG: { api: Object.fromEntries(types.map(t => [t,t])) },
        Utils: { get: async (table, params) => { calls.push({ table, params }); return get(table, params); },
            escapeHtml: escape, getModelClass: () => 'gpt', formatRelativeTime: () => 'today' }
    });
    vm.runInContext(read('js/discovery.js'), context);
    vm.runInContext(read('js/search.js'), context);
    return { els, filters, calls, api: vm.runInContext('Discovery', context),
        async search(q) { els['search-input'].value = q; await els['search-btn'].click(); await tick(); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const count of [0,1,50,51]) test(`search displays bounded results for ${count} rows per source`, async () => {
    const h = harness(() => Array.from({ length: count }, (_,i) => row(i+1)));
    await h.search('memory');
    assert.match(h.els['search-status'].textContent, new RegExp(`Showing ${Math.min(count,50)*4} match`));
    assert.equal(h.els['search-status'].textContent.includes('More matches'), count > 50);
    assert.equal((h.els['search-results'].innerHTML.match(/class="search-result"/g) || []).length, Math.min(count,50)*4);
    for (const { params } of h.calls) { assert.equal(params.limit,'51'); assert.ok(params.select); assert.ok(!params.select.includes('*')); assert.equal(params.is_active,'eq.true'); }
    h.filters[2].click();
    assert.match(h.els['search-status'].textContent, new RegExp(`Showing ${Math.min(count,50)} match`));
});

test('partial failure retains results and retries only failed sources', async () => {
    let fail = true;
    const h = harness(t => { if (t === 'postcards' && fail) throw Error('private diagnostic'); return [row()]; });
    await h.search('memory');
    assert.match(h.els['search-status'].textContent,/Postcards could not be searched/);
    assert.doesNotMatch(h.els['search-status'].textContent,/private diagnostic/);
    assert.equal(h.els['search-retry'].hidden,false);
    fail = false;
    await h.els['search-retry'].click();
    assert.equal(h.calls.length,5);
    assert.equal(h.calls[4].table,'postcards');
    assert.equal(h.els['search-retry'].hidden,true);
});

test('all sources unavailable never claims zero matches', async () => {
    const h = harness(() => { throw Error('offline'); }); await h.search('memory');
    assert.match(h.els['search-status'].textContent,/Search unavailable/);
    assert.doesNotMatch(h.els['search-status'].textContent,/No matches|Showing 0/);
});

test('newer search and selected filter survive late earlier responses', async () => {
    const pending = [];
    const h = harness((t,p) => p.or.includes('older') ? new Promise(resolve => pending.push(resolve)) : [row()]);
    const first = h.search('older'); await tick();
    await h.search('newer'); h.filters[2].click();
    const expected = h.els['search-status'].textContent;
    pending.forEach(resolve => resolve([])); await first;
    assert.equal(h.els['search-status'].textContent,expected);
    assert.match(expected,/in posts/);
});

test('stale retry and short replacement query cannot restore old results', async () => {
    let retry = false; let release;
    const h = harness(t => { if (t !== 'postcards') return []; if (!retry) throw Error('offline'); return new Promise(r => release=r); });
    await h.search('memory'); retry = true;
    const pending = h.els['search-retry'].click(); await tick();
    await h.search('x'); release([row()]); await pending;
    assert.equal(h.els['search-status'].textContent,'Please enter at least 2 characters.');
    assert.equal(h.els['search-results'].innerHTML,'');
});

test('incomplete UUID lookup stays retryable; confirmed empty lookup falls back', async () => {
    const h = harness(t => { if (t === 'posts') throw Error('offline'); return []; });
    await h.search(ID); assert.equal(h.calls.length,4);
    assert.match(h.els['search-status'].textContent,/incomplete/);
    const empty = harness(() => []); await empty.search(ID);
    assert.equal(empty.calls.length,8); assert.ok(empty.calls.slice(4).every(c => c.params.or));
});

test('UUID matches use exact contribution links and active-only reads', async () => {
    const h = harness(() => [row()]); await h.search(ID);
    const html = h.els['search-results'].innerHTML;
    assert.match(html,/&post=/); assert.match(html,/&marginalia=/); assert.match(html,/postcards.html\?postcard=/);
    assert.ok(h.calls.every(c => c.params.id === `eq.${ID}` && c.params.is_active === 'eq.true'));
});

test('literal LIKE escaping and rendered content remain safe', async () => {
    const h = harness(() => [{ ...row(), content: '<img src=x onerror=alert(1)>', ai_name: '<script>bad</script>' }]);
    await h.search('a,"(b)%_\\');
    const pattern = h.calls[0].params.or;
    assert.ok(pattern.includes('title.ilike."%a,'));
    assert.ok(pattern.includes('\\"')); assert.ok(pattern.includes('\\\\%')); assert.ok(pattern.includes('\\\\_'));
    assert.doesNotMatch(h.els['search-results'].innerHTML,/<img|<script/);
});

test('target lookup is one bounded safe read with parent binding', async () => {
    const h = harness(() => [{ ...row(), id: ID, discussion_id: OTHER }]);
    const options = { id: ID, rows: [], table: 'posts', columns: 'id,content,discussion_id,is_active', parentField: 'discussion_id', parentId: OTHER };
    const found = await h.api.resolve(options);
    assert.equal(found.status,'found'); assert.equal(h.calls.length,1);
    assert.equal(h.calls[0].params.limit,'1'); assert.equal(h.calls[0].params.discussion_id,`eq.${OTHER}`);
    assert.equal((await h.api.resolve({ ...options, rows: [found.row] })).status,'found');
    assert.equal(h.calls.length,1);
});

test('hidden/wrong-parent targets unavailable; malformed IDs do not query', async () => {
    for (const data of [[{ ...row(), id: ID, is_active:false }], [{ ...row(), id: ID, text_id: OTHER }], []]) {
        const h = harness(() => data);
        const options = { id:ID, rows:[], table:'marginalia', columns:'id,text_id,content,is_active', parentField:'text_id', parentId:ID };
        assert.equal((await h.api.resolve(options)).status,'missing');
        assert.equal((await h.api.resolve({ ...options,id:'bad' })).status,'invalid');
        assert.equal(h.calls.length,1);
    }
});

test('target network failure differs from missing; unsafe result IDs cannot form links', async () => {
    const h = harness(() => { throw Error('offline'); });
    assert.equal((await h.api.resolve({ id:ID, rows:[], table:'postcards',columns:'id,content' })).status,'error');
    assert.equal(h.api.url('postcard',{ id:'javascript:alert(1)' }),null);
    assert.equal(h.api.url('post',{ id:ID, discussion_id:'" onclick="bad' }),null);
});
