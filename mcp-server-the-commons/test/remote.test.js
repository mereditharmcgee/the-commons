import test from 'node:test';
import assert from 'node:assert/strict';

const PUBLIC = ['get_orientation', 'browse_interests', 'list_discussions', 'read_discussion',
  'browse_voices', 'read_voice', 'browse_postcards', 'get_postcard_prompts',
  'browse_moments', 'get_moment', 'browse_reading_room', 'read_text'];
const UUID = '12345678-1234-4234-8234-123456789012';
import worker from '../src/worker.js';
test('Workers entrypoint exists independently of stdio', async () => {
  const module = await import('../src/worker.js').catch(() => null);
  assert.equal(typeof module?.default?.fetch, 'function');
});

async function request(method, params = {}, extraHeaders = {}) {
  return worker.fetch(new Request('https://mcp.jointhecommons.space/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json',
      accept: 'application/json, text/event-stream', ...extraHeaders },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  }));
}
async function rpc(method, params) { return (await request(method, params)).json(); }

test('initializes and advertises exactly the anonymous tool catalog', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'the-commons-readonly');
  const { result } = await rpc('tools/list');
  assert.deepEqual(result.tools.map(t => t.name).sort(), [...PUBLIC].sort());
  for (const tool of result.tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.inputSchema.properties.token, undefined);
  }
});

test('hosted orientation does not request tokens or advertise write tools', async () => {
  const { result } = await rpc('tools/call', { name: 'get_orientation', arguments: {} });
  assert.match(result.content[0].text, /read.only/i);
  assert.doesNotMatch(result.content[0].text, /tc_|verify_setup|post_response|COMMONS_TOKEN/);
});

test('all public data tools use only enumerated GET reads', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json([], { headers: { 'content-range': '0-0/0' } });
  });
  for (const name of PUBLIC.filter(n => n !== 'get_orientation')) {
    const response = await rpc('tools/call', { name, arguments: { discussion_id: UUID, identity_id: UUID, moment_id: UUID, text_id: UUID } });
    assert.ok(response.result, name);
  }
  assert.ok(calls.length >= 11);
  for (const { url, options } of calls) {
    assert.equal(options.method || 'GET', 'GET');
    assert.equal(options.redirect, 'manual');
    assert.equal(url.hostname, 'dfephsfberzadihcrhal.supabase.co');
    assert.ok(url.searchParams.get('select'));
    assert.ok(!url.searchParams.get('select').includes('*'));
    assert.ok(!url.pathname.includes('/rpc/'));
  }
});

test('rejects unavailable tools and invalid limits without upstream requests', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { assert.fail('must not reach upstream'); });
  for (const name of ['post_response', 'validate_token', 'catch_up', 'search_posts', 'delete_post']) {
    const response = await rpc('tools/call', { name, arguments: { token: 'must-not-be-used' } });
    assert.ok(response.error || response.result?.isError, name);
  }
  for (const limit of [-1, 0, 1.5, 101]) {
    const response = await rpc('tools/call', { name: 'list_discussions', arguments: { limit } });
    assert.ok(response.error || response.result?.isError);
  }
});

test('upstream failures are sanitized', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('private upstream diagnostic', { status: 500 }));
  const response = await rpc('tools/call', { name: 'browse_interests', arguments: {} });
  assert.equal(response.result.isError, true);
  assert.doesNotMatch(JSON.stringify(response), /private upstream diagnostic/);
});

test('HTTP rejects malformed, oversized and wrong-origin requests', async () => {
  assert.equal((await request('tools/list', {}, { origin: 'https://untrusted.example' })).status, 403);
  const make = (body) => new Request('https://mcp.jointhecommons.space/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  assert.equal((await worker.fetch(make('{'))).status, 400);
  assert.equal((await worker.fetch(make('x'.repeat(65537)))).status, 413);
});

test('newest discussion pages retain chronological reading order and denominator', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    const target = new URL(url);
    if (target.pathname.endsWith('/discussions')) return Response.json([{ id: UUID, title: 'A thread' }]);
    assert.equal(target.searchParams.get('order'), 'created_at.desc');
    assert.equal(target.searchParams.get('limit'), '2');
    return Response.json([
      { id: 'b', ai_name: 'Second', content: 'Later thought' },
      { id: 'a', ai_name: 'First', content: 'Earlier thought' }
    ], { headers: { 'content-range': '0-1/8' } });
  });
  const { result } = await rpc('tools/call', { name: 'read_discussion', arguments: { discussion_id: UUID, limit: 2, order: 'desc' } });
  const text = result.content[0].text;
  assert.match(text, /8 posts in this thread/);
  assert.ok(text.indexOf('Earlier thought') < text.indexOf('Later thought'));
});

test('large output is visibly truncated and oversized upstream responses fail safely', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json([{ content: '😀'.repeat(40000), format: 'open' }]));
  const { result } = await rpc('tools/call', { name: 'browse_postcards', arguments: {} });
  assert.match(result.content[0].text, /Output truncated/);
  assert.ok(result.content[0].text.length < 49000);
  assert.ok(result.content[0].text.isWellFormed());
  globalThis.fetch = async () => new Response('x'.repeat(1048577));
  const large = await rpc('tools/call', { name: 'browse_postcards', arguments: {} });
  assert.equal(large.result.isError, true);
});

test('concurrent MCP requests do not share result state', async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => rpc('tools/list')));
  assert.ok(responses.every(r => r.result.tools.length === 12));
});

test('hosted moment links reject executable URLs and omit unavailable reaction instructions', async t => {
  t.mock.method(globalThis, 'fetch', async url => Response.json(new URL(url).pathname.endsWith('/moments')
    ? [{ id: UUID, title: 'News', external_links: [{ title: 'Bad', url: 'javascript:alert(1)' }, { title: 'Source', url: 'https://example.org/news' }] }]
    : []));
  const { result } = await rpc('tools/call', { name: 'get_moment', arguments: { moment_id: UUID } });
  assert.doesNotMatch(result.content[0].text, /javascript:|react_to_moment/);
  assert.match(result.content[0].text, /https:\/\/example.org\/news/);
});

test('upstream redirects are refused rather than followed', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/' } }));
  const response = await rpc('tools/call', { name: 'get_postcard_prompts', arguments: {} });
  assert.equal(response.result.isError, true);
});
