import './loopback-only.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

for (const serialized of [false, true]) test(`real workerd: ${serialized ? 'serialized storage candidate' : 'ordinary KV diagnostic'}`, async t => {
  const built = await build({ entryPoints: [new URL('./workerd-fixture.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], external: ['cloudflare:workers'] });
  let blocked = 0;
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: built.outputFiles[0].text, compatibilityDate: '2026-09-07', compatibilityFlags: ['global_fetch_strictly_public'], cf: false, host: '127.0.0.1', kvNamespaces: ['OAUTH_KV'], kvPersist: false, durableObjects: { BROKER: { className: 'FixtureOAuthBroker', useSQLite: true } }, durableObjectsPersist: false, bindings: { SERIALIZED: serialized }, outboundService: () => { blocked++; return new Response('Offline egress blocked', { status: 403 }); } }));
  t.after(() => mf.dispose());
  const request = (path, init) => mf.dispatchFetch('https://issuer.example' + path, init);
  const rpc = async (method, params, bearer, extraHeaders = {}) => {
    const response = await request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...extraHeaders }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    assert.equal(response.status, 200);
    return (await response.json()).result;
  };
  await t.test('initialize, exact top-level + legacy metadata, public calls and challenge', async () => {
    assert.equal((await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'fixture', version: '0' } })).protocolVersion, '2025-11-25');
    const catalog = await rpc('tools/list', {});
    assert.equal(catalog.tools.length, 2);
    for (const tool of catalog.tools) assert.deepEqual(tool.securitySchemes, tool._meta.securitySchemes);
    assert.equal(catalog.tools[0].securitySchemes[0].type, 'noauth');
    assert.equal(catalog.tools[1].securitySchemes[0].type, 'oauth2');
    assert.equal((await rpc('tools/call', { name: 'read_fixture' })).content[0].text, 'public fixture');
    assert.equal((await rpc('tools/call', { name: 'status_fixture' })).isError, true);
  });
  const verifier = 'v'.repeat(64);
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
  const authorize = async () => (await request('/fixture/authorize?challenge=' + challenge)).json();
  const exchange = async auth => {
    const response = await request('/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', ...auth, redirect_uri: 'https://client.example/callback', code_verifier: verifier, resource: 'https://issuer.example/mcp' }) });
    return { status: response.status, body: await response.json() };
  };
  await t.test('real provider token authorizes only protected call without leaking props', async () => {
    const issued = await exchange(await authorize());
    assert.equal(issued.status, 200);
    const result = await rpc('tools/call', { name: 'status_fixture' }, issued.body.access_token);
    assert.equal(result.content[0].text, 'connected fixture voice');
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE_CAPABILITY'), false);
    assert.equal((await rpc('tools/call', { name: 'status_fixture' }, 'invalid')).isError, true);
    assert.equal((await rpc('tools/call', { name: 'read_fixture' }, 'invalid')).isError, undefined);
  });
  await t.test(serialized ? 'actor serialization allows exactly one code redemption' : 'controlled overlapping KV reads reproduce duplicate code redemption', async () => {
    const auth = await authorize();
    if (!serialized) assert.equal((await request('/fixture/arm-race')).status, 200);
    const results = await Promise.all(Array.from({ length: serialized ? 20 : 2 }, () => exchange(auth)));
    const statuses = results.map(r => r.status).sort();
    t.diagnostic('Concurrent code exchange statuses: ' + statuses.join(', '));
    assert.deepEqual(statuses, serialized ? [200, ...Array(19).fill(400)] : [200, 200]);
  });
  await t.test('outbound requests cannot reach any upstream', async () => {
    assert.equal((await request('/fixture/egress')).status, 403);
    assert.equal(blocked, 1);
  });
  if (serialized) await t.test('auth adapter outage is sanitized and does not disable anonymous reads', async () => {
    const headers = { 'x-fixture-auth-unavailable': '1' };
    const response = await rpc('tools/call', { name: 'status_fixture' }, 'synthetic', headers);
    assert.equal(response.isError, true);
    assert.equal(response.content[0].text, 'Connection unavailable.');
    assert.equal(JSON.stringify(response).includes('synthetic-secret'), false);
    assert.equal((await rpc('tools/call', { name: 'read_fixture' }, 'synthetic', headers)).content[0].text, 'public fixture');
  });
});
