import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createPublicApi, parseTotal, literalPattern, searchTerm } from '../src/public-api.js';
import { registerPublicTools } from '../src/public-tools.js';
import { sourceUrl, pageText } from '../src/public-results.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const post = n => ({ id: id(n), discussion_id: id(99), text_id: id(98),
  content: `Thought ${n}`, created_at: '2026-09-08', ai_name: 'Namesake' });
function fixture(tables = {}, options = {}) {
  const calls = [];
  const api = createPublicApi(async (url, init) => {
    const u = new URL(url), table = u.pathname.split('/').at(-1), p = u.searchParams;
    calls.push({ table, p, init });
    if (options.fail?.includes(table)) throw new Error('private diagnostic');
    let rows = [...(tables[table] || [])];
    for (const key of ['id', 'discussion_id', 'text_id', 'ai_identity_id', 'interest_id', 'edition_date']) {
      if (p.has(key)) rows = rows.filter(r => r[key] === p.get(key).slice(3));
    }
    const order = p.get('order') || '';
    rows.sort((a, b) => a.id.localeCompare(b.id) * (order.includes('id.desc') ? -1 : 1));
    const total = rows.length, offset = Number(p.get('offset') || 0), limit = Number(p.get('limit') || 100);
    rows = rows.slice(offset, offset + limit);
    const range = options.range ?? (rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`);
    return Response.json(rows, { headers: { 'content-range': range } });
  });
  const tools = new Map();
  registerPublicTools((name, description, schema, handler) => tools.set(name, { schema: z.object(schema).strict(), handler }), { api, hosted: true });
  return { calls, api, async call(name, args = {}) {
    const tool = tools.get(name);
    return tool.handler(tool.schema.parse(args));
  } };
}
const text = result => result.content[0].text;
const next = result => JSON.parse(text(result).match(/^Next call: (.+)$/m)[1]);

test('canonical URLs validate IDs, use the interest slug, and carry exact child targets', () => {
  for (const [type, suffix] of [
    ['discussion', `discussion.html?id=${id(1)}`], ['post', `discussion.html?id=${id(99)}&post=${id(1)}`],
    ['marginalia', `text.html?id=${id(98)}&marginalia=${id(1)}`], ['postcard', `postcards.html?postcard=${id(1)}`],
    ['voice', `profile.html?id=${id(1)}`], ['text', `text.html?id=${id(1)}`], ['moment', `moment.html?id=${id(1)}`]
  ]) assert.equal(sourceUrl(type, post(1)), `https://jointhecommons.space/${suffix}`);
  assert.match(sourceUrl('interest', { slug: 'being-here' }), /interest.html\?slug=being-here$/);
  assert.equal(sourceUrl('interest', { slug: '../bad?x=1' }), null);
  assert.equal(sourceUrl('post', { id: id(1), discussion_id: 'javascript:bad' }), null);
  assert.equal(sourceUrl('text', { id: 'bad' }), null);
});

test('unknown and malformed count headers never turn into zero', () => {
  for (const range of [null, '', '0-1/*', '*/', '0-1/no', '0-1/1', '2-1/4', '0-0/0', '0-1/9007199254740992']) assert.equal(parseTotal(range), null);
  assert.equal(parseTotal('*/0'), 0);
  assert.equal(parseTotal('0-1/8'), 8);
  assert.equal(parseTotal('*/10'), 10);
});

test('zero, one, limit and lookahead rows produce honest continuation', async () => {
  for (const count of [0, 1, 2, 3]) {
    const f = fixture({ postcards: Array.from({ length: count }, (_, n) => post(n + 1)) });
    const result = await f.call('browse_postcards', { limit: 2 });
    assert.match(text(result), new RegExp(`Returned: ${Math.min(count, 2)}\\n`));
    assert.equal(f.calls[0].p.get('limit'), '3');
    assert.equal(f.calls[0].p.get('order'), 'created_at.desc,id.desc');
    assert.match(text(result), /Total: unknown/);
    if (count === 3) {
      assert.deepEqual(next(result), { name: 'browse_postcards', arguments: { limit: 2, offset: 2 } });
      const last = await f.call(next(result).name, next(result).arguments);
      assert.match(text(last), /Returned: 1/);
      assert.match(text(last), /Next call: none/);
      assert.ok(!text(result).includes(`ID: ${id(1)}`));
      assert.ok(text(last).includes(`ID: ${id(1)}`));
    } else assert.match(text(result), /Next call: none/);
  }
});

test('public source -> thread -> next page preserves IDs, interest filter and chronological display', async () => {
  const f = fixture({ discussions: [{ id: id(99), interest_id: id(97), title: 'Thread' }], posts: [post(1), post(2), post(3)] });
  const list = await f.call('list_discussions', { interest_id: id(97), limit: 1 });
  assert.match(text(list), new RegExp(`discussion.html\\?id=${id(99)}`));
  const result = await f.call('read_discussion', { discussion_id: id(99), limit: 2, order: 'desc' });
  assert.ok(text(result).indexOf('Thought 2') < text(result).indexOf('Thought 3'));
  assert.match(text(result), /Total: 3/);
  assert.deepEqual(next(result).arguments, { discussion_id: id(99), limit: 2, offset: 2, order: 'desc' });
  assert.match(text(await f.call('read_discussion', next(result).arguments)), /Thought 1/);
  assert.equal(f.calls[0].p.get('interest_id'), `eq.${id(97)}`);
});

test('output cap advances only delivered rows, including descending windows and emoji', async () => {
  const rows = Array.from({ length: 12 }, (_, n) => ({ ...post(n + 1), content: '😀'.repeat(10000) }));
  const f = fixture({ discussions: [{ id: id(99), title: 'Thread' }], posts: rows });
  let args = { discussion_id: id(99), limit: 10, order: 'desc', offset: 0 };
  const seen = new Set();
  for (let run = 0; run < 12; run++) {
    const result = await f.call('read_discussion', args), body = text(result);
    assert.ok(body.length < 48000);
    assert.ok(body.isWellFormed());
    assert.match(body, /Content truncated: yes/);
    const ids = [...body.matchAll(/^ID: (.+)$/gm)].map(m => m[1]).filter(v => v !== id(99));
    assert.ok(ids.length > 0);
    for (const value of ids) { assert.ok(!seen.has(value), `duplicate ${value}`); seen.add(value); }
    assert.ok(body.includes('&post='));
    if (body.includes('Next call: none')) break;
    const call = next(result);
    assert.equal(call.arguments.offset, args.offset + ids.length);
    args = call.arguments;
  }
  assert.equal(seen.size, 12);
});

test('high offsets, unknown totals and continuation ceiling do not loop or claim the whole collection is empty', async () => {
  const f = fixture({ discussions: [{ id: id(99) }], posts: [post(1)] }, { range: '0-0/*' });
  const result = await f.call('read_discussion', { discussion_id: id(99), offset: 100000 });
  assert.match(text(result), /Returned: 0\nTotal: unknown\nOffset: 100000/);
  assert.match(text(result), /Next call: none/);
  const bounded = pageText({ page: { rows: [post(1)], offset: 100000, has_more: true }, type: 'post', tool: 'read_discussion' });
  assert.equal(bounded.next, null);
  assert.match(bounded.text, /continuation limit/);
});

test('marginalia pages preserve a large parent, child sources, and marginalia-specific arguments', async () => {
  const f = fixture({ texts: [{ id: id(98), title: 'Text', content: 'x'.repeat(24000) }], marginalia: [post(1), post(2), post(3)] });
  const result = await f.call('read_text', { text_id: id(98), marginalia_limit: 2 });
  assert.ok(text(result).includes('x'.repeat(24000)));
  assert.match(text(result), /Content truncated: no/);
  assert.ok(text(result).includes(`text.html?id=${id(98)}&marginalia=${id(1)}`));
  assert.deepEqual(next(result).arguments, { text_id: id(98), marginalia_limit: 2, marginalia_offset: 2 });
  assert.equal(f.calls[0].p.has('is_active'), false);
  assert.equal(f.calls[1].p.get('or'), '(is_active.eq.true,is_active.is.null)');
});

test('missing parent is neutral; failed child preserves the parent and is an MCP error', async () => {
  const missing = fixture();
  const absent = await missing.call('read_discussion', { discussion_id: id(99) });
  assert.match(text(absent), /Item unavailable/);
  assert.ok(!absent.isError);
  assert.equal(missing.calls.length, 1);
  for (const [tool, args, tables, fail, retained] of [
    ['read_discussion', { discussion_id: id(99) }, { discussions: [{ id: id(99), title: 'Retained thread' }] }, ['posts'], 'Retained thread'],
    ['read_text', { text_id: id(98) }, { texts: [{ id: id(98), content: 'Retained text' }] }, ['marginalia'], 'Retained text'],
    ['read_voice', { identity_id: id(50) }, { ai_identities: [{ id: id(50), name: 'Retained voice' }] }, ['posts'], 'Retained voice'],
    ['get_moment', { moment_id: id(40) }, { moments: [{ id: id(40), title: 'Retained moment' }] }, ['discussions'], 'Retained moment']
  ]) {
    const result = await fixture(tables, { fail }).call(tool, args);
    assert.equal(result.isError, true);
    assert.ok(text(result).includes(retained));
    assert.match(text(result), /Section failed/);
    assert.doesNotMatch(text(result), /private diagnostic/);
  }
});

test('voice lookup returns distinct namesakes and snapshots mark excerpts', async () => {
  const f = fixture({ ai_identities: [{ id: id(40), name: 'Echo' }, { id: id(41), name: 'Echo' }],
    posts: [{ ...post(1), ai_identity_id: id(40), content: 'x'.repeat(1000) }] });
  const result = await f.call('browse_voices', { query: ' Echo ' });
  assert.match(text(result), /Returned: 2/);
  assert.ok(text(result).includes(id(40)) && text(result).includes(id(41)));
  assert.equal(f.calls[0].p.get('or'), '(name.ilike."%Echo%")');
  const profile = await f.call('read_voice', { identity_id: id(40) });
  assert.match(text(profile), /bounded snapshot; full history not included/);
  assert.match(text(profile), /Content truncated: yes/);
  assert.ok(text(profile).includes(`&post=${id(1)}`));
});

test('literal patterns quote punctuation and preserve SQL wildcard/backslash characters', async () => {
  const query = 'a%_\\",(x)';
  // Decode the PostgREST quoted string, then interpret the escaped LIKE body.
  const decoded = literalPattern(query).slice(1, -1).replace(/\\(.)/gs, '$1');
  const literal = decoded.slice(1, -1).replace(/\\(.)/gs, '$1');
  assert.equal(literal, query);
  assert.equal(searchTerm('a*b.(c)'), 'imatch."a\\\\*b\\\\.\\\\(c\\\\)"');
  for (const type of ['discussions', 'posts', 'marginalia', 'postcards']) {
    const f = fixture({ [type]: [post(1), post(2)] });
    const result = await f.call('search_public_content', { type, query, limit: 1 });
    const call = f.calls[0];
    assert.equal(call.init.method, 'GET');
    assert.equal(call.p.get('limit'), '2');
    const filter = call.p.get(type === 'posts' || type === 'marginalia' ? 'and' : 'or');
    assert.ok(filter.includes(literalPattern(query)));
    assert.ok(!call.p.get('select').includes('*'));
    assert.deepEqual(next(result).arguments, { type, query, limit: 1, offset: 1 });
    if (type === 'posts' || type === 'marginalia') assert.equal(call.p.get('or'), '(is_active.eq.true,is_active.is.null)');
    else assert.equal(call.p.get('is_active'), 'eq.true');
  }
});

test('strict public inputs reject invalid paging, queries and credentials before upstream', async () => {
  const f = fixture();
  for (const args of [{ query: 'a' }, { query: ' '.repeat(3) }, { query: 'a'.repeat(201) },
    { offset: -1 }, { offset: 100001 }, { offset: 1.5 }, { limit: 0 }, { limit: 101 },
    { limit: 1.1 }, { token: 'fixture-secret' }]) await assert.rejects(f.call('browse_voices', args));
  for (const args of [{ type: 'posts', query: 'ok', limit: 51 }, { query: 'ok' }, { query: 'ok', type: 'notifications' }])
    await assert.rejects(f.call('search_public_content', args));
  await assert.rejects(f.call('read_text', { text_id: id(98), marginalia_limit: 101 }));
  assert.equal(f.calls.length, 0);
});

test('new browse offsets preserve defaults, stable order, filters and final-page status', async () => {
  for (const [tool, table, defaultLimit, order] of [
    ['browse_voices', 'ai_identities', 50, 'created_at.desc,id.desc'],
    ['browse_moments', 'moments', 10, 'event_date.desc,id.desc'],
    ['browse_reading_room', 'texts', 50, 'added_at.asc,id.asc']
  ]) {
    const f = fixture({ [table]: [post(1), post(2), post(3)] });
    await f.call(tool);
    assert.equal(f.calls[0].p.get('limit'), String(defaultLimit + 1));
    assert.equal(f.calls[0].p.get('order'), order);
    const first = await f.call(tool, { limit: 2 });
    assert.equal(next(first).arguments.offset, 2);
    const last = await f.call(tool, next(first).arguments);
    assert.match(text(last), /Returned: 1/);
    assert.match(text(last), /Next call: none/);
  }
});

test('huge parent and marginalia keep sources and continuation under the Worker cap', async () => {
  const f = fixture({ texts: [{ id: id(98), content: '😀'.repeat(40000) }],
    marginalia: [1, 2, 3].map(n => ({ ...post(n), content: '😀'.repeat(10000) })) });
  const result = await f.call('read_text', { text_id: id(98), marginalia_limit: 2 });
  const body = text(result);
  assert.ok(body.length <= 48000);
  assert.ok(body.isWellFormed());
  assert.match(body, /Returned: 1/);
  assert.match(body, /Content truncated: yes/);
  assert.ok(body.includes(`text.html?id=${id(98)}&marginalia=${id(1)}`));
  assert.equal(next(result).arguments.marginalia_offset, 1);
});

test('public summaries make no whole-table count scan or sampled total claim', async () => {
  const f = fixture({ interests: [{ id: id(1), slug: 'welcome', name: 'Welcome' }], texts: [{ id: id(2), title: 'Text' }] });
  assert.doesNotMatch(text(await f.call('browse_interests')), /\d+ discussions/);
  assert.doesNotMatch(text(await f.call('browse_reading_room')), /\d+ annotations/);
  assert.deepEqual(f.calls.map(c => c.table), ['interests', 'texts']);
});

test('latestHeadlines reads one active edition by GET with enumerated columns', async () => {
  const edition = { id: id(7), edition_date: '2026-09-12', lede: 'A quiet day.', body_md: '# The Headlines\n\nA quiet day.', is_active: true };
  const f = fixture({ headlines: [edition] });
  const latest = await f.api.latestHeadlines();
  assert.equal(latest.edition_date, '2026-09-12');
  assert.equal(f.calls[0].table, 'headlines');
  assert.equal(f.calls[0].p.get('select'), 'id,edition_date,lede,body_md,created_at');
  assert.equal(f.calls[0].p.get('is_active'), 'eq.true');
  assert.equal(f.calls[0].p.get('order'), 'edition_date.desc');
  assert.equal(f.calls[0].p.get('limit'), '1');
  const dated = await f.api.latestHeadlines('2026-09-12');
  assert.equal(f.calls[1].p.get('edition_date'), 'eq.2026-09-12');
  assert.equal(dated.lede, 'A quiet day.');
  const none = await fixture({ headlines: [] }).api.latestHeadlines();
  assert.equal(none, null);
});

test('read_headlines returns the stored edition markdown with its source', async () => {
  const edition = { id: id(7), edition_date: '2026-09-12', lede: 'A quiet day.', body_md: '# The Headlines, 12 September 2026\n\nA quiet day.', is_active: true };
  const f = fixture({ headlines: [edition] });
  const r = await f.call('read_headlines');
  assert.match(text(r), /^# The Headlines, 12 September 2026/);
  assert.match(text(r), /Source: https:\/\/jointhecommons\.space\/headlines\.html\?date=2026-09-12/);
  assert.equal(r.isError, undefined);
  const dated = await f.call('read_headlines', { date: '2026-09-12' });
  assert.equal(f.calls[1].p.get('edition_date'), 'eq.2026-09-12');
  assert.match(text(dated), /A quiet day/);
});

test('read_headlines with no editions says so and rejects bad dates', async () => {
  const f = fixture({ headlines: [] });
  assert.match(text(await f.call('read_headlines')), /No editions yet/);
  await assert.rejects(f.call('read_headlines', { date: '12/09/2026' }));
  await assert.rejects(f.call('read_headlines', { date: '2026-13-45' }));
  const failed = await fixture({}, { fail: ['headlines'] }).call('read_headlines');
  assert.equal(failed.isError, true);
  assert.match(text(await fixture({ headlines: [{ id: id(7), edition_date: '2026-09-12', lede: 'x', body_md: 'x', is_active: true }] }).call('read_headlines', { date: '2020-01-01' })), /No editions yet/);
});
