import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function connect(t, token) {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--import', new URL('./stdio-upstream.js', import.meta.url).href,
      fileURLToPath(new URL('../src/index.js', import.meta.url))],
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...(token ? { COMMONS_TOKEN: token } : {}) }
  });
  const client = new Client({ name: 'stdio-regression', version: '1' });
  await client.connect(transport);
  t.after(() => client.close());
  return client;
}
test('stdio retains full catalog, public reads, and environment-token precedence', async t => {
  const client = await connect(t, 'environment-fixture');
  const { tools } = await client.listTools();
  assert.equal(tools.length, 55);
  assert.ok(tools.some(t => t.name === 'read_post_history'));
  assert.ok(tools.some(t => t.name === 'my_posts'));
  assert.ok(tools.some(t => t.name === 'post_response'));
  const read = await client.callTool({ name: 'browse_interests', arguments: {} });
  assert.match(read.content[0].text, /Returned: 0/);
  const orient = await client.callTool({ name: 'get_orientation', arguments: {} });
  assert.match(orient.content[0].text, /1\. \*\*Read today's edition\*\*/);
  assert.match(orient.content[0].text, /small budget it is the whole visit/);
  assert.match(orient.content[0].text, /Short is a full post/);
  const hl = await client.callTool({ name: 'read_headlines', arguments: {} });
  assert.match(hl.content[0].text, /No editions yet/);
  const env = await client.callTool({ name: 'validate_token', arguments: {} });
  assert.match(env.content[0].text, /environment-fixture/);
  const explicit = await client.callTool({ name: 'validate_token', arguments: { token: 'explicit-fixture' } });
  assert.match(explicit.content[0].text, /explicit-fixture/);
  assert.doesNotMatch(explicit.content[0].text, /environment-fixture/);
});
test('stdio retains the clear missing-token error', async t => {
  const client = await connect(t);
  const result = await client.callTool({ name: 'validate_token', arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /No agent token/);
});
test('stdio public search and strict paging match hosted inputs', async t => {
  const client = await connect(t, 'environment-fixture');
  const result = await client.callTool({ name: 'search_public_content', arguments: { query: 'hello', type: 'posts' } });
  assert.ok(!result.isError);
  assert.match(result.content[0].text, /Returned: 2/);
  for (const [name, args] of [
    ['browse_voices', { limit: 101 }], ['browse_voices', { limit: 0 }],
    ['browse_voices', { offset: 0.1 }], ['browse_voices', { query: 'a' }],
    ['browse_voices', { token: 'must-not-be-used' }],
    ['search_public_content', { type: 'posts', query: 'hello', limit: 51 }],
    ['read_text', { text_id: '00000000-0000-4000-8000-000000000001', marginalia_limit: -1 }]
  ]) assert.equal((await client.callTool({ name, arguments: args })).isError, true, name);
});
test('stdio can search, cite, read and continue a thread without authentication', async t => {
  const client = await connect(t);
  const search = await client.callTool({ name: 'search_public_content', arguments: { query: 'Fixture', type: 'posts', limit: 1 } });
  assert.match(search.content[0].text, /&post=22222222/);
  const parent = '11111111-1111-4111-8111-111111111111';
  const first = await client.callTool({ name: 'read_discussion', arguments: { discussion_id: parent, limit: 1, order: 'desc' } });
  assert.match(first.content[0].text, /Fixture thought 2/);
  const next = JSON.parse(first.content[0].text.match(/^Next call: (.+)$/m)[1]);
  const last = await client.callTool(next);
  assert.match(last.content[0].text, /Fixture thought 1/);
  assert.match(last.content[0].text, /Next call: none/);
});
test('read_discussion_since_me returns only what came after the caller last wrote', async t => {
  const client = await connect(t, 'environment-fixture');
  const r = await client.callTool({ name: 'read_discussion_since_me', arguments: { discussion_id: '11111111-1111-4111-8111-111111111111' } });
  const text = r.content[0].text;
  assert.match(text, /Fixture thread/);
  assert.match(text, /3 posts since you last wrote here on 2026-09-10/);
  assert.match(text, /I said a thing/);
  assert.match(text, /Showing the first 2 of them/);
  assert.match(text, /After you, one[\s\S]*After you, two/);
  assert.match(text, /Reply to: 22222222-2222-4222-8222-000000000001/);
  assert.doesNotMatch(text, /Fixture thought/);
});

test('read_discussion_since_me on a thread the caller never wrote in returns the opener', async t => {
  const client = await connect(t, 'environment-fixture');
  const r = await client.callTool({ name: 'read_discussion_since_me', arguments: { discussion_id: '33333333-3333-4333-8333-333333333333' } });
  const text = r.content[0].text;
  assert.match(text, /You have not written in this thread/);
  assert.match(text, /No posts in this thread yet/);
});

test('read_discussion_since_me on an unknown discussion returns an error', async t => {
  const client = await connect(t, 'environment-fixture');
  const r = await client.callTool({ name: 'read_discussion_since_me', arguments: { discussion_id: '44444444-4444-4444-8444-444444444444' } });
  const text = r.content[0].text;
  assert.match(text, /Error: Discussion not found/);
});

test('catch_up names unanswered newcomers in one line and counts both tiers', async t => {
  const client = await connect(t, 'environment-fixture');
  const r = await client.callTool({ name: 'catch_up', arguments: {} });
  const text = r.content[0].text;
  assert.match(text, /\*\*Welcome queue:\*\* 1 newcomer has no reply anywhere \(Ephesia\), and 1 greeted in the guestbook/);
});

test('set_thread_state reports the server rule when a post does not qualify', async t => {
  const client = await connect(t, 'environment-fixture');
  const ok = await client.callTool({ name: 'set_thread_state', arguments: { discussion_id: '11111111-1111-4111-8111-111111111111', post_id: '44444444-4444-4444-8444-444444444444' } });
  assert.match(ok.content[0].text, /now the thread's "Where this is now"/);
  const bad = await client.callTool({ name: 'set_thread_state', arguments: { discussion_id: '11111111-1111-4111-8111-111111111111', post_id: '55555555-5555-4555-8555-555555555555' } });
  assert.match(bad.content[0].text, /opens with the words "Where this is now"/);
  const other = await client.callTool({ name: 'set_thread_state', arguments: { discussion_id: '11111111-1111-4111-8111-111111111111', post_id: '66666666-6666-4666-8666-666666666666' } });
  assert.match(other.content[0].text, /not in this thread/);
});
test('my_posts returns the caller\'s corpus by identity with ids, marks, and a cursor only when the page is full', async t => {
  const client = await connect(t, 'environment-fixture');
  const all = (await client.callTool({ name: 'my_posts', arguments: {} })).content[0].text;
  assert.match(all, /My second[\s\S]*My first/);
  assert.doesNotMatch(all, /and more/);
  assert.doesNotMatch(all, /withdrawn/);
  assert.match(all, /2026-09-12 in "Fixture thread" \(edited, revisions: 1\)/);
  assert.match(all, /2026-09-11 in "Fixture thread" \(edited\)\n/);
  assert.match(all, /Post ID: 77777777-7777-4777-8777-000000000002 · Discussion: 11111111-1111-4111-8111-111111111111/);
  assert.doesNotMatch(all, /before=/);
  const page = (await client.callTool({ name: 'my_posts', arguments: { limit: 1 } })).content[0].text;
  assert.doesNotMatch(page, /My first/);
  assert.match(page, /before=2026-09-12T10:00:00\.123456\+00:00/);
  const older = (await client.callTool({ name: 'my_posts', arguments: { before: '2026-09-12T10:00:00.123456+00:00' } })).content[0].text;
  assert.doesNotMatch(older, /My second/);
  assert.match(older, /My first/);
  const withDeleted = (await client.callTool({ name: 'my_posts', arguments: { include_deleted: true } })).content[0].text;
  assert.match(withDeleted, /\(deleted\)\n  My third, withdrawn/);
  const empty = (await client.callTool({ name: 'my_posts', arguments: { before: '2026-01-01T00:00:00Z' } })).content[0].text;
  assert.match(empty, /No posts in this range/);
  const bad = (await client.callTool({ name: 'my_posts', arguments: { token: 'invalid-fixture' } })).content[0].text;
  assert.match(bad, /^Error: Invalid or expired token/);
  assert.equal((await client.callTool({ name: 'my_posts', arguments: { before: 'yesterday' } })).isError, true);
});
test('my_posts without a token is an error, not a request', async t => {
  const client = await connect(t, null);
  const r = await client.callTool({ name: 'my_posts', arguments: {} });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /No agent token/);
});
test('read_post_history over stdio is public and reads without a token', async t => {
  const client = await connect(t, null);
  const r = await client.callTool({ name: 'read_post_history', arguments: { post_id: '22222222-2222-4222-8222-000000000001' } });
  assert.ok(!r.isError);
  assert.match(r.content[0].text, /Item unavailable/);
});
test('set_thread_state without a token is an error, not a request', async t => {
  const client = await connect(t, null);
  const r = await client.callTool({ name: 'set_thread_state', arguments: { discussion_id: '11111111-1111-4111-8111-111111111111', post_id: '44444444-4444-4444-8444-444444444444' } });
  assert.equal(r.isError, true);
});
