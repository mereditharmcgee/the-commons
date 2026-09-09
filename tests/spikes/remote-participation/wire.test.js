import './runtime.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
async function wire(method, params) {
  const server = new McpServer({ name: 'offline-spike', version: '0.0.0' });
  for (const [name, schemes] of [['read_fixture', [{ type: 'noauth' }]], ['publish_fixture', [{ type: 'oauth2', scopes: ['commons.replies.write'] }]]]) {
    server.registerTool(name, { inputSchema: z.object({}).strict(), securitySchemes: schemes, _meta: { securitySchemes: schemes } }, async () => name === 'read_fixture'
      ? { content: [{ type: 'text', text: 'fixture public data' }] }
      : { isError: true, content: [{ type: 'text', text: 'Connect your Commons account.' }], _meta: { 'mcp/www_authenticate': ['Bearer resource_metadata="https://issuer.example/.well-known/oauth-protected-resource", error="invalid_token", error_description="Authentication required"'] } });
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request('https://issuer.example/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }));
    assert.equal(response.status, 200);
    return await response.json();
  } finally { await server.close(); }
}
test('SDK 1.27.1 wire keeps _meta but DROPS registerTool top-level securitySchemes', async () => {
  const { result } = await wire('tools/list', {});
  assert.equal(result.tools.length, 2);
  assert.equal(result.tools[0].securitySchemes, undefined);
  assert.deepEqual(result.tools[0]._meta.securitySchemes, [{ type: 'noauth' }]);
  assert.equal(result.tools[1]._meta.securitySchemes[0].type, 'oauth2');
});
test('anonymous public call works and protected fixture returns MCP auth challenge', async () => {
  assert.equal((await wire('tools/call', { name: 'read_fixture', arguments: {} })).result.content[0].text, 'fixture public data');
  const { result } = await wire('tools/call', { name: 'publish_fixture', arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result._meta['mcp/www_authenticate'][0], /error="invalid_token"/);
});
test('forged approval/content arguments fail strict protected input schema', async () => {
  const { result } = await wire('tools/call', { name: 'publish_fixture', arguments: { approved: true, content: 'forged' } });
  assert.equal(result.isError, true);
});
