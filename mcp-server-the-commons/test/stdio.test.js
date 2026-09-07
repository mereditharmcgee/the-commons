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
  assert.equal(tools.length, 48);
  assert.ok(tools.some(t => t.name === 'post_response'));
  const read = await client.callTool({ name: 'browse_interests', arguments: {} });
  assert.equal(read.content[0].text, 'No interests found.');
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
