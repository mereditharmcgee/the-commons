import './loopback-only.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('production OAuthStore conformance in real SQLite workerd, offline only', async t => {
  const base = fileURLToPath(new URL('./node_modules/', import.meta.url));
  const persist = await mkdtemp(path.join(base, '.oauth-store-'));
  const built = await build({ stdin: { contents: `
    import { OAuthStore } from '../../../mcp-server-the-commons/hosted/oauth-store.js';
    export class FixtureStore {
      constructor(ctx) { this.ctx = ctx; this.time = 1000000000000; this.store = new OAuthStore(ctx.storage, { now: () => this.time, maxRows: 5 }); }
      async fetch(request) {
        const { method, args = [], time } = await request.json();
        if (time !== undefined) this.time = time;
        try {
          if (method === 'count') return Response.json(this.ctx.storage.sql.exec('SELECT count(*) AS total FROM oauth_kv').one().total);
          if (method === 'rollback') { try { this.ctx.storage.transactionSync(() => { this.ctx.storage.sql.exec("INSERT INTO oauth_kv VALUES ('rolled-back', 'fixture', 2000000000000)"); throw new Error('fixture'); }); } catch {} return Response.json(true); }
          return Response.json({ value: await this.store[method](...args) ?? null });
        } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
      }
    }
    export default { fetch(request, env) { return env.STORE.get(env.STORE.idFromName('fixture')).fetch(request); } };
  `, resolveDir: fileURLToPath(new URL('.', import.meta.url)), sourcefile: 'oauth-store-test-fixture.js' }, bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:workers'] });
  let blocked = 0;
  const start = () => new Miniflare(convertV4MiniflareOptions({ name: 'oauth-store-fixture', modules: true, script: built.outputFiles[0].text, compatibilityDate: '2026-09-07', cf: false, host: '127.0.0.1', durableObjects: { STORE: { className: 'FixtureStore', useSQLite: true } }, resourcePersistencePath: persist, outboundService: () => { blocked++; return new Response('Offline', { status: 403 }); } }));
  let mf = start();
  t.after(async () => { await mf.dispose(); assert.ok(path.resolve(persist).startsWith(path.resolve(base) + path.sep)); await rm(persist, { recursive: true, force: true }); });
  const call = async (method, args = [], time) => {
    const response = await mf.dispatchFetch('https://fixture.invalid', { method: 'POST', body: JSON.stringify({ method, args, time }) });
    const result = await response.json();
    if (response.status !== 200) throw new Error(result.error);
    return method === 'count' ? result : result.value;
  };
  const now = 1000000000000;
  await t.test('text/json, UTF-8 bounds and redacted validation failures', async () => {
    await call('put', ['client:json', '{"fixture":true}']);
    assert.deepEqual(await call('get', ['client:json', { type: 'json' }]), { fixture: true });
    assert.equal(await call('get', ['client:json']), '{"fixture":true}');
    await call('put', ['large', 'x'.repeat(65536)]);
    await assert.rejects(call('put', ['large', 'é'.repeat(32769)]), /Invalid OAuth storage operation/);
    await call('delete', ['large']);
    await call('put', ['é'.repeat(256), 'ok']);
    await call('delete', ['é'.repeat(256)]);
    await assert.rejects(call('put', ['é'.repeat(257), 'fixture-secret']), /Invalid OAuth storage operation/);
    for (const options of [{ expirationTtl: 0 }, { expirationTtl: 1.5 }, { expiration: -1 }, { expirationTtl: 1, expiration: 123 }]) await assert.rejects(call('put', ['invalid', 'fixture-secret', options]), /Invalid OAuth storage operation/);
    await assert.rejects(call('get', ['client:json', 'stream']), /Invalid OAuth storage operation/);
  });
  await t.test('TTL boundary, absolute expiration and bounded physical cleanup', async () => {
    await call('put', ['expiry:a', 'a', { expirationTtl: 1 }], now);
    await call('put', ['expiry:b', 'b', { expiration: now / 1000 + 1 }]);
    assert.equal(await call('get', ['expiry:a'], now + 999), 'a');
    assert.equal(await call('get', ['expiry:a'], now + 1000), null);
    assert.deepEqual((await call('list', [{ prefix: 'expiry:' }])).keys, []);
    assert.deepEqual(await call('cleanup', [1]), { deleted: 1, more: true });
    assert.deepEqual(await call('cleanup', [1]), { deleted: 1, more: false });
    assert.equal(await call('count'), 1);
  });
  await t.test('prefix-bound pagination survives deleted cursor keys and expired rows', async () => {
    for (const key of ['p:a', 'p:b', 'p:c', 'other']) await call('put', [key, key, { expirationTtl: key === 'p:b' ? 1 : 60 }], now);
    const first = await call('list', [{ prefix: 'p:', limit: 1 }]);
    assert.deepEqual(first.keys.map(k => k.name), ['p:a']);
    assert.equal(first.list_complete, false);
    await call('delete', ['p:a']);
    const last = await call('list', [{ prefix: 'p:', cursor: first.cursor, limit: 1 }], now + 1000);
    assert.deepEqual(last.keys.map(k => k.name), ['p:c']);
    assert.equal(last.list_complete, true);
    await assert.rejects(call('list', [{ prefix: 'other', cursor: first.cursor }]), /Invalid OAuth storage operation/);
    await assert.rejects(call('list', [{ limit: 1001 }]), /Invalid OAuth storage operation/);
    await call('cleanup');
    await call('delete', ['p:c']);
    await call('delete', ['other']);
  });
  await t.test('quota persists across runtime restart; writes and rollback persist correctly', async () => {
    for (let i = 0; i < 4; i++) await call('put', ['quota:' + i, 'fixture']);
    await assert.rejects(call('put', ['overflow', 'fixture']), /capacity reached/);
    await call('put', ['quota:0', 'updated']);
    await call('rollback');
    assert.equal(await call('get', ['rolled-back']), null);
    await mf.dispose();
    mf = start();
    assert.equal(await call('count'), 5);
    assert.equal(await call('get', ['quota:0']), 'updated');
    assert.deepEqual(await call('get', ['client:json', 'json']), { fixture: true });
    assert.equal(await call('get', ['rolled-back']), null);
    await assert.rejects(call('put', ['overflow', 'fixture']), /capacity reached/);
    for (let i = 0; i < 4; i++) await call('delete', ['quota:' + i]);
  });
  await t.test('grant/pending/client retention ceilings apply without provider TTL', async () => {
    await call('put', ['pending:fixture', 'pending'], now);
    await call('put', ['grant:fixture', 'grant', { expirationTtl: 86400 * 100 }]);
    assert.equal(await call('get', ['pending:fixture'], now + 600000), null);
    assert.equal(await call('get', ['grant:fixture'], now + 7 * 86400000), null);
    assert.equal(await call('get', ['client:json'], now + 90 * 86400000), null);
    assert.deepEqual(await call('cleanup'), { deleted: 3, more: false });
    assert.equal(await call('count'), 0);
  });
  assert.equal(blocked, 0);
});
