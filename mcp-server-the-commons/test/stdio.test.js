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
  assert.equal(tools.length, 49);
  assert.ok(tools.some(t => t.name === 'post_response'));
  const read = await client.callTool({ name: 'browse_interests', arguments: {} });
  assert.match(read.content[0].text, /Returned: 0/);
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
